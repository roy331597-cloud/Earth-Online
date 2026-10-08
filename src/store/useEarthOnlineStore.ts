// ============================================================================
// EarthOnline · Phase 3 · 全局存档 Store (Zustand)
//
// 设计立场：这个 store **不是**一个"到处 setState"的状态桶，
// 而是 Phase 1 那批纯函数契约的宿主：
//
//     type CompleteQuest = (state, questId, input, now) => EarthOnlineState
//
// 每个纯函数都可以原样塞进 `mutate()`：
//     mutate((s) => checkDaily(s, 'd_sleep', new Date()))
// 好处是三条：
//   1) 游戏规则与 React 完全解耦，纯函数可以单独跑测试；
//   2) 撤销 / 回放 / 调试只需留一串 (state, action) 快照；
//   3) AI 永远碰不到 state —— 它只产出草稿，落库这一步在这里发生。
//
// 持久化范围：**只有 `save` 对象进 LocalStorage**。
// 面板开关、悬浮态这类 UI 状态不进存档（EphemeralUiState 的约定，见 types/state.ts）。
// 云同步那两格（设备配置 `earth-online:sync` 与派生密钥 `earth-online:sync:key`）
// 在**各自的独立槽位**里，同属"设备级、不进存档"一档，见 lib/syncConfig.ts。
//
// ---------------------------------------------------------------------------
// 什么时候写盘（这一段是本文件最需要想清楚的地方）
// ---------------------------------------------------------------------------
// 每次 mutate 都同步写盘是最省事的，但 `JSON.stringify` 整棵存档树在手机上
// 是毫秒级的活儿，而打钩、翻页、开关面板是连着来的 —— 于是"每写一次状态就
// 序列化一次"会变成连续掉帧的元凶。所以写入是**防抖**的。
//
// 但防抖有一个必须补上的洞：**玩家在防抖窗口内关掉标签页，最后一次操作就没了。**
// `pagehide` / `visibilitychange` 上挂了 flush，就是为了堵它 ——
// 一个会丢数据的防抖比不防抖更糟，因为它丢得悄无声息。
// ============================================================================

import { create } from 'zustand';
import { CURRENT_SCHEMA_VERSION, STORAGE_KEYS } from '@/types';
import type { EarthOnlineState } from '@/types';
import { syncAchievements } from '@/lib/achievementEngine';
import { syncChapters } from '@/lib/chapterEngine';
import { syncEndgame } from '@/lib/endgameEngine';
import { syncEvolution } from '@/lib/evolutionEngine';
import { activeDayKey, shiftDayKey, shiftWeekKey, weekStartKey } from '@/lib/format';
import { MIGRATIONS } from '@/lib/migrations';
import { createMemoryStorage, decodeSave, encodeSave, resolveStorage } from '@/lib/persistence';
import type { StorageLike } from '@/lib/persistence';
import { buildSaveFile, downloadSaveFile, rescueFromBackup, rescueSnapshot, type RescueSnapshot } from '@/lib/saveFile';
import { readApiKey, writeApiKey } from '@/lib/secretStore';
import { readSyncConfig, writeSyncConfig } from '@/lib/syncConfig';
import type { SyncConfig } from '@/lib/syncConfig';
import {
  compareCloud,
  defaultSyncDeps,
  deleteSave as deleteCloudSave,
  fetchMeta,
  isFail,
  localSaveBytes,
  resolveSyncEnv,
  summarizeProgress,
  syncEnableFlow,
  syncPullFlow,
  syncPushFlow,
  syncRotatePassphraseFlow,
} from '@/lib/syncClient';
import type { SyncMeta } from '@/lib/syncClient';
import { importAesKey, syncAllowed } from '@/lib/syncCrypto';
import { clearSyncKey, readSyncKey, writeSyncKey } from '@/lib/syncKeyStore';
import { createNewGameState } from './newGameState';
import { dismissRolloverNotice, runDailyRollover } from './operations';
import { forceChapterOneConditions, forcePendingCeremony } from './devFixtures';

/** 写盘防抖窗口。够长以吃掉一连串操作，够短以不让人担心"存上了吗" */
const WRITE_DEBOUNCE_MS = 350;

// ---------------------------------------------------------------------------
// 存储通道
// ---------------------------------------------------------------------------

const storage: StorageLike | null = resolveStorage();
/** 没有 LocalStorage 时的本次会话兜底。它什么都不保存，但也不会让游戏打不开。 */
const fallbackStorage = createMemoryStorage();
const channel: StorageLike = storage ?? fallbackStorage;

interface LoadOutcome {
  save: EarthOnlineState;
  /** true = 这份存档来自 LocalStorage；false = 本次刚建的空档 */
  fromDisk: boolean;
  /** 载入过程中遇到的问题，用于在控制台留个痕（不打断玩家） */
  note: string | null;
}

const loadOrCreate = (): LoadOutcome => {
  let raw: string | null = null;
  try {
    raw = channel.getItem(STORAGE_KEYS.state);
  } catch (err) {
    return {
      save: createNewGameState(),
      fromDisk: false,
      note: `读取存档失败（${err instanceof Error ? err.message : String(err)}），本次以初始档启动`,
    };
  }

  // now 在这里注入：迁移里要用"现在是哪一周"来定新字段的基准，
  // 而 decodeSave 自己是纯的（不读时钟）。这一刻就是存档的载入时刻。
  const decoded = decodeSave(raw, CURRENT_SCHEMA_VERSION, MIGRATIONS, new Date());

  // 转存：**先保住原始字符串，再启动新档**。顺序不能反。
  if (decoded.diverted && raw !== null) {
    try {
      channel.setItem(STORAGE_KEYS.stateBackup, raw);
    } catch {
      /* 连备份都写不进去（配额满）：至少不要因此打不开 */
    }
  }

  return { save: decoded.save ?? createNewGameState(), fromDisk: decoded.save !== null, note: decoded.note };
};

// ---------------------------------------------------------------------------
// 写盘（防抖 + 立即落盘）
// ---------------------------------------------------------------------------

let pendingSave: EarthOnlineState | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次写盘失败的原因。非空时 HUD 会挂一个小提示 */
let lastError: string | null = null;

const writeNow = (save: EarthOnlineState): string | null => {
  try {
    channel.setItem(STORAGE_KEYS.state, encodeSave(save));
    return null;
  } catch (err) {
    // 配额满 / 隐私模式：存不进去也要让玩家继续玩，只记下来
    return err instanceof Error ? err.message : String(err);
  }
};

/** 立刻把待写的存档落盘（取消防抖）。关标签页、重置、导出之前都要调它。 */
export const flushSave = (): string | null => {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingSave === null) return lastError;
  lastError = writeNow(pendingSave);
  pendingSave = null;
  return lastError;
};

const scheduleSave = (save: EarthOnlineState, onError: (err: string | null) => void): void => {
  pendingSave = save;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const err = flushSave();
    onError(err);
    // 本地落盘之后再想上云的事 —— 推的也应该是"磁盘上那一份"。
    // 上云比落盘慢得多，所以它自己还有一层 5s 防抖 + 30s 节流（见下）。
    scheduleAutoPush();
  }, WRITE_DEBOUNCE_MS);
};

// 关页 / 切到后台：把还没写的补上。
// 这两个事件是最后的机会 —— 之后浏览器可能直接杀掉这个页面。
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushSave();
    // 走之前再试一次上云。它没有 keepalive（几 MB 的体放不进那个限额），
    // 可能被浏览器拦腰截断 —— 截断了也没关系：下次打开 checkOnOpen 会把
    // 落下的补上，这就是防抖窗口出事时的那张网。
    const st = useEarthOnlineStore.getState();
    if (st.sync.enabled && st.sync.offer === null && isDirtyNow(st.save)) void st.syncPush();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

// ---------------------------------------------------------------------------
// 云同步（Phase 6）· 调度机械
//
// 上面那条链是"点一下 → 350ms 后落盘"，这里接的是"落盘 → 5 秒后上云"。
// 两层防抖叠在一起是因为它们防的不是同一件事：第一层防序列化掉帧，
// 第二层防的是"每改一个字就往服务器送一份几 MB 的密文"。
//
// 三个数就定住了全部节奏：
//   · 落盘防抖      350ms（已有）
//   · 上云防抖      5s   —— 落盘之后再等这么久，一串操作只产生一次推送
//   · 推送最小间隔  30s  —— 两次推送之间至少隔这么久（显式点按钮不算）
// ---------------------------------------------------------------------------

/** 存档落盘之后再等这么久才推 —— 给"还想再改一下"留出反悔的余地 */
const SYNC_PUSH_DEBOUNCE_MS = 5_000;

/** 两次推送之间的最小间隔。上云不是配得上每一下点击的事 */
const SYNC_PUSH_MIN_INTERVAL_MS = 30_000;

/** 云同步唯一的门槛措辞（商店面板与这里共用一句话，免得两处说法分岔） */
const SYNC_NEEDS_SECURE =
  '云同步要在 HTTPS 或本机（localhost）下才能用 —— 浏览器只在安全环境里提供加密能力。';

let autoPushTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次同步**完成**的时刻（成功才记）。最小间隔从它起算 */
let lastPushDoneAt = 0;

/** 本地有没有还没推上去的改动 —— 自己和自己比（见 syncConfig.pushedUpdatedAt） */
const isDirtyNow = (save: EarthOnlineState): boolean =>
  readSyncConfig().pushedUpdatedAt !== save.meta.updatedAt;

/** 一条提议的内容：两边的读数。云端那份的"进度一句话"要拉下来才知道，所以只给本机的。 */
export interface SyncOffer {
  cloudRevision: number;
  cloudUpdatedAt: string | null;
  cloudBytes: number | null;
  localRevision: number;
  localUpdatedAt: string;
  localBytes: number;
  localSummary: string;
}

/** 云同步此刻的相位。`off` = 没启用（或已停用） */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

/**
 * 云同步的**设备级**切片（不持久化；要持久的那部分在 syncConfig.ts）。
 *
 * 与 `agentActivity` / `fogOverride` 同一阵营：不进存档、刷新即重算 ——
 * 它讲的是"此刻这台设备与云的关系"，不是"世界里发生了什么"。
 */
export interface SyncState {
  enabled: boolean;
  phase: SyncPhase;
  /** 最近一次失败的原因（一句话）。成功即清 */
  lastError: string | null;
  lastSyncAt: string | null;
  cloudRevision: number | null;
  cloudUpdatedAt: string | null;
  /** 非空 = 云端与本机对不上，等玩家裁决（见 components/hud/CloudPullOffer） */
  offer: SyncOffer | null;
}

export interface SyncActionResult {
  ok: boolean;
  message: string;
}

const buildOffer = (meta: SyncMeta, save: EarthOnlineState): SyncOffer | null => {
  if (meta.revision === null) return null; // 云端空着就没有"分歧"可言
  return {
    cloudRevision: meta.revision,
    cloudUpdatedAt: meta.updatedAt,
    cloudBytes: meta.size,
    localRevision: save.meta.revision,
    localUpdatedAt: save.meta.updatedAt,
    localBytes: localSaveBytes(save),
    localSummary: summarizeProgress(save),
  };
};

/**
 * 排一次自动推送（防抖：新的一次会顶掉上一次的等待）。
 *
 * 两条硬规则在排的时候就检查，fire 的时候也再检查一遍（时间差里世界会变）：
 *   · 没启用 → 排它做什么；
 *   · **有分歧待裁决 → 绝不自动推** —— 那等于拿旧底子盖掉云端那份，
 *     而"分叉永远由玩家裁决"是这个特性的第一条纪律。
 */
const scheduleAutoPush = (delayMs: number = SYNC_PUSH_DEBOUNCE_MS): void => {
  const st = useEarthOnlineStore.getState();
  if (!st.sync.enabled || st.sync.offer !== null) return;
  if (autoPushTimer !== null) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(() => {
    autoPushTimer = null;
    void runAutoPush();
  }, delayMs);
};

const runAutoPush = async (): Promise<void> => {
  const st = useEarthOnlineStore.getState();
  if (!st.sync.enabled || st.sync.offer !== null) return;
  if (st.sync.phase === 'syncing') {
    // 上一次还在路上：稍后回来看一眼（别把它挤掉，也别把这次改动弄丢）
    scheduleAutoPush(2_000);
    return;
  }
  if (!isDirtyNow(st.save)) return; // 没有新东西可推 —— 别让云端修订号白涨
  const wait = lastPushDoneAt + SYNC_PUSH_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    scheduleAutoPush(wait);
    return;
  }
  await st.syncPush();
};

/**
 * 一个正在运转的 Agent。
 *
 * ⚠️ **不进存档**。它是"此刻"的事，刷新页面就该消失 ——
 * 一个从上一秒活到现在的加载态是个幽灵。与 EphemeralUiState 同一阵营，
 * 区别是它真的被实现了（那个类型至今零引用，见 types/state.ts）。
 */
export interface AgentActivity {
  id: string;
  /** AgentRecord.id */
  agentId: string;
  /** 展示名，如「调度 · 分配者」 */
  name: string;
  /** 正在做什么，如「正在推演分支拓扑…」 */
  label: string;
  /** Date.now() 毫秒。UI 用它算"已用时 Ns" */
  startedAt: number;
}

interface EarthOnlineStore {
  /** 唯一持久化的那棵状态树 */
  save: EarthOnlineState;
  fromDisk: boolean;
  persistError: string | null;
  /** 载入过程中的说明（迁移、转存、修复）。设置面板的急救箱读它 */
  loadNote: string | null;

  /** 正在运转的 Agent（AVG 加载态的数据源）。不持久化 */
  agentActivity: AgentActivity[];

  /**
   * 迷雾窥视开关（控制室）。与 `agentActivity` 同一阵营：**不进存档**。
   *
   * 它不改变世界，只改变"这一屏给你看什么" —— 所以它既不该落盘，
   * 也不该让 `evolution.revealed` 变成 true（那条路是单向的，一旦写进去
   * 雾就再也回不来了，见 evolutionEngine 的单向性）。
   * 开关关掉，玩家看到的还是原来那片雾。
   */
  fogOverride: boolean;
  setFogOverride: (on: boolean) => void;

  /**
   * 用纯函数推进状态。这是唯一推荐的写入方式。
   * 传入的函数必须是**纯的**：不许读 Date.now()，时间由调用方传进来。
   *
   * ⚠️ 推进完之后，**篇章引擎会再看一眼**（`syncChapters`）。
   *    这样"任务结算或里程碑录入后自动对照离章条件"不需要在每个 operation
   *    里各写一遍 —— 它在唯一的写入漏斗上，因此没有一条通路能绕过去。
   *    `syncChapters` 无事时返回同一引用，所以这条链不会凭空产生写入。
   */
  mutate: (pure: (prev: EarthOnlineState) => EarthOnlineState) => void;

  /** 首次挂载时把刚建的空档落盘，避免刷新后又"重新开始" */
  persistIfFresh: () => void;

  /**
   * 跨天结算。开机、切回前台、以及每分钟问一次 —— **时间注入在这里发生**。
   *
   * `runDailyRollover` 是纯的，它不知道"现在几点"；由这一层把 `new Date()` 递进去。
   * 无事发生时它返回同一个 state 引用，`mutate` 的引用相等检查会直接短路，
   * 所以这个动作可以放心地每分钟被调一次 —— 它没有可累计的副作用。
   */
  rollover: (now: Date) => void;

  /** 关掉结算浮层。它不是"确认"，只是把它收起来 */
  dismissRollover: () => void;

  beginAgentCall: (activity: Omit<AgentActivity, 'id' | 'startedAt'>) => string;
  endAgentCall: (id: string) => void;

  /** 导出存档（含成功日记的可读文本）。返回是否真的触发了下载 */
  exportSave: (now: Date) => boolean;
  /** 立刻把当前存档写进 backup 键，作为一次手动快照（导入前的保险） */
  snapshotToBackup: () => void;
  /** 用一份新存档整体替换当前状态（导入 / 急救箱恢复用） */
  replaceSave: (next: EarthOnlineState) => void;
  /** 急救箱现状（有没有可救的东西） */
  rescueState: () => RescueSnapshot;
  /** 从急救箱恢复。返回给 UI 的一句话 */
  rescue: (now: Date) => string;

  /** 清空存档，回到全新初始档（设置面板的「重新开始」用） */
  resetToNewGame: () => void;

  /** 彻底删除存档（含 backup 键） */
  wipe: () => void;

  // —— 云同步（Phase 6）——
  //
  // 与上面所有动作的区别：它们的输入是"世界里的事实"，这几个的输入里有一个
  // **口令**。口令是函数的参数，用完即弃 —— 不进 state、不进配置、不进日志。
  // 上路的是它的派生物（AES 钥 + token），落盘的是同一份派生物的混淆形态。

  /** 云同步的设备级状态。不进存档 */
  sync: SyncState;

  /** 启用 / 接入：口令 → 认领或验证 → 存钥 → 首推（或挂提议） */
  syncEnable: (passphrase: string) => Promise<SyncActionResult>;
  /**
   * 推一次。`explicit: true`（设置面板的「立即推送」）表示玩家点名"以本机为准"：
   * 即便有分歧也推，并且以提议里那份云端修订为基准盖掉它。
   * 自动推送不显式 —— 有分歧时它会安静地跳过，绝不抢玩家的裁决权。
   */
  syncPush: (opts?: { explicit?: boolean }) => Promise<SyncActionResult>;
  /** 拉取并替换本地。先解密、再快照、后替换 —— 任何一步失败本地都原样不动 */
  syncPull: () => Promise<SyncActionResult>;
  /** 开机 / 切回前台时问一次云端：挂提议，或把本地落下的补推，或什么都不做 */
  syncCheckOnOpen: () => Promise<void>;
  /** 换口令：新钥重加密 + 旧 token 换验。不需要旧口令（派生物在本机） */
  syncChangePassphrase: (passphrase: string) => Promise<SyncActionResult>;
  /** 清掉云端存档（服务器上仍留上一版）。本地存档不动 */
  syncClearCloud: () => Promise<SyncActionResult>;
  /** 停用：只把本机的钥匙丢掉。云端原样保留，口令也仍然有效 */
  syncDisable: () => void;
  /** 收起那条提议（"稍后"）。云端信号还在 —— 下次开机它会再来 */
  dismissOffer: () => void;
  /** 问一句服务器认领过没有（设置面板用它决定按钮是「启用」还是「接入」） */
  syncProbeServer: () => Promise<'free' | 'claimed' | 'unreachable' | 'unsupported'>;
}

const initial = loadOrCreate();
if (initial.note) console.warn('[EarthOnline]', initial.note);

/** 开机时把设备级的同步配置读进来（存储不可用时它就是一份空配置） */
const initialSyncConfig: SyncConfig = readSyncConfig();

export const useEarthOnlineStore = create<EarthOnlineStore>()((set, get) => {
  /** 只动 sync 切片的一格/几格 —— 省得每处都手抄一遍展开 */
  const patchSync = (patch: Partial<SyncState>): void => set({ sync: { ...get().sync, ...patch } });

  /**
   * 一次**成功**同步之后要记的账：写进设备配置 + 更新切片，一处定义两处生效。
   *
   * ⚠️ 它写的是"最后一次成功同步"的三件事实 —— 不是"我看见了什么"。
   *    这个区别是分叉检测的支点，见 syncConfig.cloudRevision 的注释。
   */
  const commitSynced = (o: {
    cloudRevision: number | null;
    cloudUpdatedAt: string | null;
    pushedUpdatedAt: string | null;
  }): void => {
    const next: SyncConfig = {
      ...readSyncConfig(),
      enabled: true,
      lastSyncAt: new Date().toISOString(),
      cloudRevision: o.cloudRevision,
      cloudUpdatedAt: o.cloudUpdatedAt,
      pushedUpdatedAt: o.pushedUpdatedAt,
    };
    writeSyncConfig(next);
    lastPushDoneAt = Date.now();
    patchSync({
      phase: 'idle',
      lastError: null,
      lastSyncAt: next.lastSyncAt,
      cloudRevision: next.cloudRevision,
      cloudUpdatedAt: next.cloudUpdatedAt,
    });
  };

  /** 三个动作共用的开场检查。返回值非空 = 已经失败了，直接把它交出去 */
  const syncRefusal = (): SyncActionResult | null => {
    const st = get();
    if (!st.sync.enabled) return { ok: false, message: '云同步还没有启用。' };
    if (st.sync.phase === 'syncing') return { ok: false, message: '上一次同步还在路上 —— 等它结束再试。' };
    if (!syncAllowed(resolveSyncEnv())) return { ok: false, message: SYNC_NEEDS_SECURE };
    if (readSyncKey() === null) {
      const message = '本机的同步钥匙不在了 —— 到控制室里重新接入一次。';
      patchSync({ phase: 'error', lastError: message });
      return { ok: false, message };
    }
    return null;
  };

  /** 失败落账：网络问题记成"离线"（安静），其余记成"出错"（要说话） */
  const noteSyncFailure = (code: string, message: string): SyncActionResult => {
    patchSync({ phase: code === 'network' ? 'offline' : 'error', lastError: message });
    return { ok: false, message };
  };

  return {
  save: initial.save,
  fromDisk: initial.fromDisk,
  persistError: null,
  loadNote: initial.note,
  agentActivity: [],
  fogOverride: false,
  sync: {
    enabled: initialSyncConfig.enabled,
    phase: initialSyncConfig.enabled ? 'idle' : 'off',
    lastError: null,
    lastSyncAt: initialSyncConfig.lastSyncAt,
    cloudRevision: initialSyncConfig.cloudRevision,
    cloudUpdatedAt: initialSyncConfig.cloudUpdatedAt,
    offer: null,
  },

  setFogOverride: (on) => {
    // 与 endAgentCall 同一条纪律：值没变就不 set，别让订阅者白渲染一轮
    if (get().fogOverride !== on) set({ fogOverride: on });
  },

  mutate: (pure) => {
    const prev = get().save;
    const drafted = pure(prev);

    // 唯一写入漏斗上的第二~第五道工序（契约见 types/state.ts）。
    // 四道都无事时返回**传进去的那个引用**，所以"没达线、没离章、没解锁、没点亮"
    // 不会带来任何额外写入 —— 这是它们敢挂在每一次点击上的前提。
    //
    // 同一个 now 分给四道：它们各自要往记录上盖时刻，差几毫秒虽然看不出来，
    // 但"同一次点击里发生的四件事盖了四个时间戳"是一处没有理由的含糊。
    //
    // 次序不是随手排的，它跟着依赖图走：
    //   ① 终局目标 —— 按机器判据点亮目标里程碑（净资产档位 / 计数）。
    //                 排在最前，是因为篇章引擎的 labMilestoneCount 读的是
    //                 PRIVATE_LAB 的已亮格数（Ch.7 的机器代理）——
    //                 下游必须看见这一趟刚亮的格子；
    //   ② 篇章     —— 产出"新解锁了哪一章"，进化树的揭示条件要读它；
    //   ③ 进化树   —— 产出"雾散没散、哪个节点亮了"，而成就的维度 F 门控
    //                 读的正是 `revealed`；
    //   ④ 成就     —— 排在最后，是因为它是**命名者**：前面三道定下来的事实，
    //                 由它统一命名一次。
    // 顺着这个次序，雾散的那一次点击里，两枚至高隐藏徽记会在同一刻上墙
    // （金色光晕会盖住刚显形的星空 —— 先收下徽记，再回来看那棵树，
    //  这个顺序比反过来好）。
    const now = new Date();
    const ended = syncEndgame(drafted, now);
    const chaptered = syncChapters(ended, now);
    const evolved = syncEvolution(chaptered, now);
    const next = syncAchievements(evolved, now);

    if (next === prev) return; // 纯函数返回原对象 = 无事发生，不写盘

    // meta 的账由 store 统一记，游戏逻辑不必操心这两个字段
    const stamped: EarthOnlineState = {
      ...next,
      meta: {
        ...next.meta,
        revision: prev.meta.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    };

    set({ save: stamped });
    scheduleSave(stamped, (err) => set({ persistError: err }));
  },

  persistIfFresh: () => {
    if (get().fromDisk) return;
    lastError = writeNow(get().save);
    set({ persistError: lastError, fromDisk: true });
  },

  // —— Agent 运转态的起落 ——
  // 它是纯 UI 通道：不进存档、不参与任何判定，只负责让"这一刻谁在工作"
  // 在界面上看得见。Phase 4 接上真身后，这一个通道就是那个加载遮罩的数据源。
  beginAgentCall: (activity) => {
    const id = `act_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
    set({ agentActivity: [...get().agentActivity, { ...activity, id, startedAt: Date.now() }] });
    return id;
  },

  endAgentCall: (id) => {
    const rest = get().agentActivity.filter((a) => a.id !== id);
    // 引用相等：没这个 id 时不要凭空 set 一次，那会让订阅者白渲染一轮
    if (rest.length !== get().agentActivity.length) set({ agentActivity: rest });
  },

  // —— 存档安全 ——
  exportSave: (now) => {
    // 先落盘再导出：导出的是**磁盘上那一份**，而不是某个还在防抖队列里的中间态。
    // 玩家点"导出"的心理预期是"把我现在这份拿走"，两者必须一致。
    flushSave();
    return downloadSaveFile(buildSaveFile(get().save, now), now);
  },

  snapshotToBackup: () => {
    try {
      channel.setItem(STORAGE_KEYS.stateBackup, encodeSave(get().save));
    } catch {
      /* 配额满：不阻断导入流程，最坏情况等于没拍这张快照 */
    }
  },

  replaceSave: (next) => {
    // 与 resetToNewGame 同一条纪律：先把队列里那份旧的冲掉，
    // 否则防抖窗口里那次延迟写入会带着**替换前**的状态覆盖回来。
    pendingSave = null;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    lastError = writeNow(next);
    set({ save: next, persistError: lastError, fromDisk: true, loadNote: null });
  },

  rescueState: () => rescueSnapshot(),

  rescue: (now) => {
    const outcome = rescueFromBackup(now);
    if (!outcome.ok) return outcome.reason;
    get().replaceSave(outcome.state);
    return ['已从急救箱恢复。', ...outcome.notes].join(' ');
  },

  rollover: (now) => {
    // 无事发生时 runDailyRollover 返回原引用 → mutate 直接返回，不写盘。
    // 所以这里不需要先算一遍再判断，判断本身就藏在引用相等里。
    get().mutate((s) => runDailyRollover(s, now).next);
  },

  dismissRollover: () => {
    get().mutate((s) => dismissRolloverNotice(s));
  },

  resetToNewGame: () => {
    // 先把队列里那份旧的冲掉，再写新的 —— 否则防抖窗口里那次
    // 延迟写入会带着**重置前**的状态覆盖回来，重置就白按了
    pendingSave = null;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    const fresh = createNewGameState();
    lastError = writeNow(fresh);
    set({ save: fresh, persistError: lastError, fromDisk: true });
  },

  wipe: () => {
    pendingSave = null;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    try {
      channel.removeItem(STORAGE_KEYS.state);
      channel.removeItem(STORAGE_KEYS.stateBackup);
    } catch {
      /* 忽略：清不掉也不影响本次会话 */
    }
    lastError = null;
    set({ save: createNewGameState(), fromDisk: false, persistError: null });
  },

  // —— 云同步（Phase 6）——
  //
  // 每个动作都遵守两条纪律：
  //   ① 口令 / 密钥只以函数参数或本地键槽的形态存在 —— patchSync 里永远是
  //      状态词与时间戳，没有一处会把它们写进 state；
  //   ② 失败不改本地 —— 推送失败什么都不动；拉取在**全部成功**之前不碰本地。

  syncEnable: async (passphrase) => {
    const st = get();
    if (st.sync.enabled) return { ok: false, message: '这台设备已经接上云同步了。' };
    if (st.sync.phase === 'syncing') return { ok: false, message: '上一次同步还在路上 —— 等它结束再试。' };
    if (!syncAllowed(resolveSyncEnv())) return { ok: false, message: SYNC_NEEDS_SECURE };

    patchSync({ phase: 'syncing', lastError: null });
    const out = await syncEnableFlow(defaultSyncDeps(), { passphrase });
    if (isFail(out)) return noteSyncFailure(out.code, out.message);

    // 钥匙落槽 —— 至此这台设备有了"不输口令也能同步"的本钱
    writeSyncKey({ k: out.keys.keyB64, t: out.keys.token });
    writeSyncConfig({ ...readSyncConfig(), enabled: true });
    patchSync({ enabled: true, phase: 'idle', lastError: null });

    // 云端的存档比我这份还新 → **只挂提议，一个字都不动它**。
    // 拉还是盖，等玩家看两边的读数自己裁。
    if (out.adopted && out.cloud.revision !== null) {
      const offer = buildOffer(out.cloud, get().save);
      if (offer !== null) patchSync({ offer });
      return {
        ok: true,
        message: `已接入。云端有一份存档（修订 ${out.cloud.revision}）—— 上面那条横幅在等你裁决：拉下来，或者用「立即推送」以本机为准。`,
      };
    }

    // 云端空着（新认领或已清空）→ 首推，把本机这份设成云端的第一份
    const push = await get().syncPush();
    return push.ok
      ? { ok: true, message: `已接入。${push.message}` }
      : { ok: true, message: `已接入，但第一次推送没能完成：${push.message} 等网络稳了它会自己再试。` };
  },

  syncPush: async (opts) => {
    const explicit = opts?.explicit === true;
    const st = get();
    const refusal = syncRefusal();
    if (refusal !== null) return refusal;
    if (!explicit && st.sync.offer !== null) {
      // 分歧还没裁决：自动推等于拿旧底子盖掉云端那份。**不推**，等玩家。
      return { ok: false, message: '云端那份还没裁决 —— 先处理上面那条横幅。' };
    }

    flushSave(); // 推的是磁盘上那一份（与导出同款纪律）
    const save = get().save;
    const pair = readSyncKey();
    if (pair === null) return { ok: false, message: '本机的同步钥匙不在了 —— 到控制室里重新接入一次。' };
    let key: CryptoKey;
    try {
      key = await importAesKey(pair.k);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchSync({ phase: 'error', lastError: message });
      return { ok: false, message };
    }

    patchSync({ phase: 'syncing', lastError: null });
    // If-Match 的基准：玩家点名"以本机为准"时用提议里那份云端修订 ——
    // 那是"我看见了它，并且决定盖掉它"的形态；否则用本设备记忆里的修订。
    const baseRev =
      explicit && st.sync.offer !== null ? st.sync.offer.cloudRevision : readSyncConfig().cloudRevision;
    const out = await syncPushFlow(defaultSyncDeps(), {
      keys: { key, token: pair.t },
      save,
      apiKey: readApiKey(),
      revision: baseRev,
    });

    if (!isFail(out)) {
      commitSynced({
        cloudRevision: out.revision,
        cloudUpdatedAt: save.meta.updatedAt,
        pushedUpdatedAt: save.meta.updatedAt,
      });
      patchSync({ offer: null });
      return { ok: true, message: `已推送到云端（修订 ${out.revision}）。` };
    }

    if (out.code === 'conflict') {
      // 云端在别处动过了。**不抢着写** —— 问一句最新读数，把分歧摆给玩家。
      const meta = await fetchMeta(defaultSyncDeps());
      if (isFail(meta)) return noteSyncFailure(meta.code, meta.message);
      const offer = buildOffer(meta, get().save);
      if (offer !== null) {
        patchSync({ phase: 'idle', lastError: null, offer });
        return { ok: false, message: '推送被拒：云端在别处动过了。两边的样子都在横幅里，由你裁决。' };
      }
      // 云端其实已经被别处清空了：拿"云端还没有"当新基准，再推一次
      const retry = await syncPushFlow(defaultSyncDeps(), {
        keys: { key, token: pair.t },
        save,
        apiKey: readApiKey(),
        revision: null,
      });
      if (!isFail(retry)) {
        commitSynced({
          cloudRevision: retry.revision,
          cloudUpdatedAt: save.meta.updatedAt,
          pushedUpdatedAt: save.meta.updatedAt,
        });
        patchSync({ offer: null });
        return { ok: true, message: `云端已被别处清空 —— 本机这份重新推了上去（修订 ${retry.revision}）。` };
      }
      return noteSyncFailure(retry.code, retry.message);
    }

    if (out.code === 'unauthorized') {
      return noteSyncFailure(out.code, `${out.message} —— 到控制室里用当时的那个口令重新接入一次。`);
    }
    return noteSyncFailure(out.code, out.message);
  },

  syncPull: async () => {
    const st = get();
    const refusal = syncRefusal();
    if (refusal !== null) return refusal;
    const pair = readSyncKey();
    if (pair === null) return { ok: false, message: '本机的同步钥匙不在了 —— 到控制室里重新接入一次。' };

    let key: CryptoKey;
    try {
      key = await importAesKey(pair.k);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchSync({ phase: 'error', lastError: message });
      return { ok: false, message };
    }

    patchSync({ phase: 'syncing', lastError: null });
    const out = await syncPullFlow(defaultSyncDeps(), {
      keys: { key, token: pair.t },
      now: new Date(),
    });
    if (isFail(out)) return noteSyncFailure(out.code, out.message);

    // —— 走到这里，云端那份已经解开、也迁移好了；本地一个字都还没动 ——
    // 覆盖前留底：与「导入存档」同款纪律。**只在急救箱空着时拍** ——
    // 覆盖掉一份还能救的残损存档，比不拍快照糟得多。
    if (!st.rescueState().hasBackup) get().snapshotToBackup();
    get().replaceSave(out.save);
    if (out.apiKey !== null) writeApiKey(out.apiKey); // 信封里带着的那把，一并恢复
    commitSynced({
      cloudRevision: out.revision,
      cloudUpdatedAt: out.save.meta.updatedAt,
      pushedUpdatedAt: out.save.meta.updatedAt,
    });
    patchSync({ offer: null });

    const parts = [
      `已把云端那份拉到本机（修订 ${out.revision ?? '—'}）。`,
      out.apiKey !== null ? '信封里带着的 API Key 也一并恢复了。' : '',
      out.note ?? '',
      '拉取前的本地存档留在了急救箱里。',
    ];
    return { ok: true, message: parts.filter((p) => p.length > 0).join('') };
  },

  syncCheckOnOpen: async () => {
    const st = get();
    if (!st.sync.enabled || st.sync.phase === 'syncing') return;
    if (!syncAllowed(resolveSyncEnv())) return; // 环境不允许：连钥匙都不该动
    if (readSyncKey() === null) {
      patchSync({ phase: 'error', lastError: '本机的同步钥匙不在了 —— 到控制室里重新接入一次。' });
      return;
    }

    const meta = await fetchMeta(defaultSyncDeps());
    if (isFail(meta)) {
      // 断网是常态不是故障：安静地记成"离线"，别把红字怼到玩家脸上
      if (meta.code === 'network') patchSync({ phase: 'offline', lastError: null });
      else patchSync({ phase: 'error', lastError: meta.message });
      return;
    }

    const cfg = readSyncConfig();
    const verdict = compareCloud(cfg.cloudRevision ?? 0, meta);

    if (verdict === 'offer') {
      const offer = buildOffer(meta, get().save);
      if (offer !== null) patchSync({ phase: 'idle', lastError: null, offer });
      return;
    }
    if (verdict === 'push' || isDirtyNow(get().save)) {
      await get().syncPush();
      return;
    }
    patchSync({ phase: 'idle', lastError: null });
  },

  syncChangePassphrase: async (passphrase) => {
    const st = get();
    const refusal = syncRefusal();
    if (refusal !== null) return refusal;
    if (st.sync.offer !== null) {
      return { ok: false, message: '云端那份还没裁决 —— 先处理上面那条横幅，再换口令。' };
    }

    flushSave();
    const save = get().save;
    const pair = readSyncKey();
    if (pair === null) return { ok: false, message: '本机的同步钥匙不在了 —— 到控制室里重新接入一次。' };
    patchSync({ phase: 'syncing', lastError: null });
    const out = await syncRotatePassphraseFlow(defaultSyncDeps(), {
      passphrase,
      oldToken: pair.t,
      save,
      apiKey: readApiKey(),
    });

    if (isFail(out)) {
      // 旧凭证被服务器拒了 —— 这台服务器上的口令多半已经换过，
      // 指引玩家用**现在的**那个口令走一次「接入」，而不是在这里瞎试
      if (out.code === 'unauthorized' || out.code === 'claimed') {
        return noteSyncFailure(
          out.code,
          '旧接入凭证被服务器拒了 —— 这台服务器上的口令可能已经换过。用当时的新口令走一次「接入」，再来换。',
        );
      }
      return noteSyncFailure(
        out.code,
        out.code === 'network'
          ? `${out.message} 稍后用**同一个新口令**再点一次就好（上一次若已推了一半，重试会把它接上）。`
          : out.message,
      );
    }

    writeSyncKey({ k: out.keys.keyB64, t: out.keys.token });
    commitSynced({
      cloudRevision: out.revision,
      // 没推（云端本来就空）时云端依然空着；推了的话云端就是刚上去的这一份
      cloudUpdatedAt: out.pushed ? save.meta.updatedAt : null,
      pushedUpdatedAt: out.pushed ? save.meta.updatedAt : readSyncConfig().pushedUpdatedAt,
    });
    return {
      ok: true,
      message: '口令已更换。云端那份已经用新钥重新锁过 —— 别的设备要用新口令接入。若刚才有推一半的，重试一次它会自己接上。',
    };
  },

  syncClearCloud: async () => {
    const refusal = syncRefusal();
    if (refusal !== null) return refusal;
    const pair = readSyncKey();
    if (pair === null) return { ok: false, message: '本机的同步钥匙不在了 —— 到控制室里重新接入一次。' };

    patchSync({ phase: 'syncing', lastError: null });
    const out = await deleteCloudSave(defaultSyncDeps(), pair.t);
    // 云端本来就是空的（404）不算失败 —— 结果与玩家的意图一致
    if (isFail(out) && out.code !== 'empty') return noteSyncFailure(out.code, out.message);

    writeSyncConfig({ ...readSyncConfig(), cloudRevision: null, cloudUpdatedAt: null, pushedUpdatedAt: null });
    lastPushDoneAt = Date.now();
    patchSync({ phase: 'idle', lastError: null, cloudRevision: null, cloudUpdatedAt: null, offer: null });
    return {
      ok: true,
      message:
        '云端那份已经清掉。服务器上还会留一份上一版（不通过界面提供恢复）。本地存档没有被动过 —— 同步还开着，下次有改动时，它会被当作云端的第一份推上去。',
    };
  },

  syncDisable: () => {
    clearSyncKey();
    writeSyncConfig({ ...readSyncConfig(), enabled: false });
    if (autoPushTimer !== null) {
      clearTimeout(autoPushTimer);
      autoPushTimer = null;
    }
    patchSync({ enabled: false, phase: 'off', lastError: null, offer: null });
  },

  dismissOffer: () => {
    // 只收起横幅，**不装作分歧没了**：设备配置一个字不动，
    // 下次 checkOnOpen 照样会看见云端那份对不上，横幅会再来
    if (get().sync.offer !== null) patchSync({ offer: null });
  },

  syncProbeServer: async () => {
    if (!syncAllowed(resolveSyncEnv())) return 'unsupported';
    const meta = await fetchMeta(defaultSyncDeps());
    if (isFail(meta)) return 'unreachable';
    return meta.claimed ? 'claimed' : 'free';
  },
  };
});

// ---------------------------------------------------------------------------
// 调试入口（只在 DEV 挂到 window 上）
//
// 制作人要求：留一个"一键重置到初始存档"的出口。
// 它放在控制台而不是设置面板里 —— 设置面板里那个「重新开始」是给玩家的，
// 这个给开发和评审用，不该出现在玩家的视野里。
//
//   __earthonline.reset()     回到初始存档
//   __earthonline.wipe()      连 backup 键一起清掉（模拟"第一次打开"）
//   __earthonline.flush()     立刻落盘（测防抖用）
//   __earthonline.save()      打印当前存档
//   __earthonline.reveal()    把进化树置为已揭晓（看隐藏目标的真身）
//   __earthonline.fog()       再蒙回去
//   __earthonline.rollover()  重放一次跨天结算（看那个浮层；它一辈子只出现一次）
//
// ⚠️ Phase 5 起 reveal / fog 不再对称：
//    显形是**单向**的（见 evolutionEngine），所以 reveal() 一定留得住，
//    而 fog() 只在"四条揭示条件此刻都不成立"时才留得住 —— 下一次写入
//    （任何一次点击）进化树会重新算一遍条件，够了就再散一次雾。
//    想在不改动存档的前提下看那棵树，用控制室里的窥视开关（setFogOverride）：
//    它不碰 `revealed`，因此不会被撤销，也不会把雾真的弄散。
//
// Phase 3 追加（夹具见 store/devFixtures.ts）：
//   __earthonline.ch1()       凑齐 Ch.1 的三条离章条件 → 下一次写入就会通关
//   __earthonline.ceremony()  凭空造一个待看仪式（只为单独验收 UI）
// ---------------------------------------------------------------------------

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const api = {
    reset: () => {
      useEarthOnlineStore.getState().resetToNewGame();
      return '已重置到初始存档';
    },
    wipe: () => {
      useEarthOnlineStore.getState().wipe();
      return '存档已清空（含 backup 键）';
    },
    flush: () => flushSave() ?? '已落盘',
    save: () => useEarthOnlineStore.getState().save,
    raw: () => channel.getItem(STORAGE_KEYS.state),
    reveal: () => {
      const { mutate } = useEarthOnlineStore.getState();
      mutate((s) => ({
        ...s,
        evolution: { ...s.evolution, revealed: true, revealedAt: new Date().toISOString() },
      }));
      return '进化树已揭晓';
    },
    fog: () => {
      const { mutate } = useEarthOnlineStore.getState();
      mutate((s) => ({
        ...s,
        evolution: { ...s.evolution, revealed: false, revealedAt: null },
      }));
      const stillFoggy = !useEarthOnlineStore.getState().save.evolution.revealed;
      return stillFoggy
        ? '进化树已隐去（四条揭示条件此刻都不成立，所以它留得住）'
        : '⚠️ 没隐住：揭示条件此刻已经成立，显形是单向的，下一次写入会再散一次雾。'
          + '只想看一眼就用控制室的窥视开关。';
    },
    /**
     * 重放一次跨天结算（含周结算），用来反复看那个浮层（否则它一辈子只出现一次）。
     * ⚠️ 这是**重放不是还原**：连击已经归零，这一次不会再断一次连击。
     *    要看完整的四项（漏做 / 扣分 / 断连击 / 保住），得用 wipe() 重来。
     */
    rollover: () => {
      const now = new Date();
      const store = useEarthOnlineStore.getState();
      store.mutate((s) => {
        const target = shiftDayKey(activeDayKey(now, s.settings.dayRolloverHour), -1);
        const log = s.dailies.logs[target];

        const weekStart = weekStartKey(activeDayKey(now, s.settings.dayRolloverHour));
        const targetWeek = shiftWeekKey(weekStart, -1);
        const weekLog = s.weeklies.logs[targetWeek];

        return {
          ...s,
          dailies: {
            ...s.dailies,
            logs: log
              ? { ...s.dailies.logs, [target]: { ...log, missedIds: [], expPenalized: 0 } }
              : s.dailies.logs,
            lastSettledLocalDate: shiftDayKey(target, -1),
            pendingRolloverNotice: null,
          },
          weeklies: {
            ...s.weeklies,
            logs: weekLog
              ? { ...s.weeklies.logs, [targetWeek]: { ...weekLog, missedIds: [], expPenalized: 0, settled: false } }
              : s.weeklies.logs,
            lastSettledWeekStart: shiftWeekKey(targetWeek, -1),
            pendingWeeklyNotice: null,
          },
        };
      });
      store.rollover(now);
      return '已重放一次跨天结算（每日 + 每周）';
    },
    /** 凑齐 Ch.1 的三条离章条件。下一次写入（包括这次自己）就会触发通关仪式。 */
    ch1: () => {
      const now = new Date();
      useEarthOnlineStore.getState().mutate((s) => forceChapterOneConditions(s, now));
      const pending = useEarthOnlineStore.getState().save.chapters.pendingCeremony;
      return pending
        ? `Ch.1 条件已凑齐，通关仪式已就绪（${pending.completedTitle}）`
        : 'Ch.1 条件已凑齐，但没触发通关 —— 看看 conditionProgress 哪一条还没到';
    },
    /** 跳过条件判定，直接造一个待看仪式（只验 UI 用） */
    ceremony: () => {
      const now = new Date();
      useEarthOnlineStore.getState().mutate((s) => forcePendingCeremony(s, now));
      return '已注入一个待看仪式（Ch.1 → 命名 Ch.2）';
    },
  };
  (window as unknown as { __earthonline: typeof api }).__earthonline = api;
}

// ---------------------------------------------------------------------------
// 便捷选择器
//
// ⚠️ 一律返回**已有引用**，不在选择器里造新对象 ——
//    Zustand 用的是引用相等，选择器里 `{a, b}` 这种写法会让组件每帧重渲染。
// ---------------------------------------------------------------------------

export const useSave = (): EarthOnlineState => useEarthOnlineStore((s) => s.save);
export const useMutate = () => useEarthOnlineStore((s) => s.mutate);
