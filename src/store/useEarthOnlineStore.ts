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
  }, WRITE_DEBOUNCE_MS);
};

// 关页 / 切到后台：把还没写的补上。
// 这两个事件是最后的机会 —— 之后浏览器可能直接杀掉这个页面。
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushSave());
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

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
}

const initial = loadOrCreate();
if (initial.note) console.warn('[EarthOnline]', initial.note);

export const useEarthOnlineStore = create<EarthOnlineStore>()((set, get) => ({
  save: initial.save,
  fromDisk: initial.fromDisk,
  persistError: null,
  loadNote: initial.note,
  agentActivity: [],
  fogOverride: false,

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
}));

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
