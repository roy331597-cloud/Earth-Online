// ============================================================================
// EarthOnline · Phase 3 · 存档的导出 / 导入 / 天灾急救箱 (saveFile)
//
// 三件事，共用一条原则：**永远不原地丢弃玩家数据。**
//
//   ① 导出：带时间戳的 JSON，文件名形如 `EarthOnline_Save_20261007.json`。
//      它**不含 API Key**（SaveFile 只带 state，键在另一个存储槽里），
//      所以这个文件可以随便丢进网盘、发给朋友、贴到 issue 里。
//
//   ② 导入：拖进来一个文件，校验格式 → 清洗脏数据 → 水合覆盖。
//      校验失败时**什么都不做**，并把原因原原本本说出来 ——
//      "导入失败"四个字对玩家毫无用处，他需要知道是文件选错了还是文件坏了。
//
//   ③ 天灾急救箱：LocalStorage 损坏、版本不兼容、被手工改坏 ——
//      这些情况下 store 会把残损的原始字符串转存到 backup 键，
//      然后以一份全新的档启动。急救箱就是那个把残损数据捞回来的入口：
//      它显示"有一份损坏的存档被保住了"，并给一个按钮试着恢复。
//
// 为什么校验要这么细：这个文件的来源是**玩家自己的硬盘**，
// 但也可能是"朋友发来的存档"。它不是可信输入，而它接下来要
// 整个替换掉 state。在这里多写三十行校验，比事后追查"存档怎么变成这样了"便宜得多。
// ============================================================================

import { CURRENT_SCHEMA_VERSION, STORAGE_KEYS, type EarthOnlineState, type SaveFile } from '@/types';
import { localDateKey } from '@/lib/format';
import { MIGRATIONS } from '@/lib/migrations';
import { decodeSave, resolveStorage } from '@/lib/persistence';
import type { StorageLike } from '@/lib/persistence';

export const SAVE_FORMAT = 'earth-online-save';

/** 导出文件名。日期取本地日 —— 玩家认的是自己那一格日历。 */
export const saveFileName = (now: Date): string =>
  `EarthOnline_Save_${localDateKey(now).replace(/-/g, '')}.json`;

/**
 * 成功日记的可读导出。
 *
 * 它是导出文件里的**附加项**（`journalPlainText`）：JSON 是给机器读的，
 * 这一段是给人读的 —— 玩家真正舍不得的那部分东西，值得有一份不依赖
 * 本应用也能打开的形态。
 */
export const journalToPlainText = (state: EarthOnlineState): string | null => {
  const entries = state.journal.entries;
  if (entries.length === 0) return null;

  // 页眉带玩家自己给这一章起的名字。它是"永久铭刻"的第三个落点
  // （另两个是 HUD 铭牌与日记页眉）—— 一份导出到本应用之外的文件里，
  // 那个词也应该跟着走，否则它就不算刻上去过。
  const codename =
    state.chapters.chapters.find((c) => c.id === state.chapters.focusedChapterId)?.playerChosenCodename ?? null;

  const lines: string[] = [
    '地球 OL · 成功日记',
    `导出时间：${new Date().toISOString()}`,
    `共 ${entries.length} 条`,
    ...(codename === null ? [] : ['', `　　　　「${codename}」`]),
    '',
  ];

  for (const e of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    lines.push(`── ${e.localDate} · ${e.questTitle} ──`);
    if (e.verdict) {
      lines.push(`【判官】${e.verdict.quality} · +${e.verdict.bonusPct}%`);
      if (e.verdict.comment) lines.push(e.verdict.comment);
    }
    lines.push(e.entryText);
    for (const a of e.addenda) lines.push(`（补记 ${a.ts.slice(0, 10)}）${a.text}`);
    lines.push('');
  }

  return lines.join('\n');
};

export const buildSaveFile = (state: EarthOnlineState, now: Date): SaveFile => ({
  format: SAVE_FORMAT,
  formatVersion: 1,
  exportedAt: now.toISOString(),
  state,
  journalPlainText: journalToPlainText(state),
});

/** 触发一次浏览器下载。没有 document（SSR / 测试）时返回 false，由调用方决定怎么提示。 */
export const downloadSaveFile = (file: SaveFile, now: Date): boolean => {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  try {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFileName(now);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 立刻回收：blob 会一直占着内存直到页面关闭，而存档可能有好几 MB
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// 导入
// ---------------------------------------------------------------------------

export type ImportOutcome =
  | {
      ok: true;
      state: EarthOnlineState;
      /** 迁移或清洗过程中发生的事（非空时要告诉玩家，但不必吓他） */
      notes: string[];
    }
  | { ok: false; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 解析一个导入文件。
 *
 * 三类拒绝理由，措辞都指向"接下来该做什么"：
 *   · 不是 JSON      → 大概选错文件了
 *   · 不是我们的格式 → 确定选错文件了
 *   · 结构不完整     → 文件坏了，或者被改坏了
 *
 * `now` 依旧注入：迁移要用它定基准，而本模块不读时钟。
 */
export const parseSaveFile = (text: string, now: Date): ImportOutcome => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: '这个文件不是合法的 JSON —— 是不是选错文件了？' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: '文件内容不是一个对象，看起来不是存档。' };
  }
  if (parsed.format !== SAVE_FORMAT) {
    return { ok: false, reason: '这不是地球 OL 的存档文件（缺少 earth-online-save 标记）。' };
  }
  if (!isRecord(parsed.state)) {
    return { ok: false, reason: '文件里没有存档主体（state 字段缺失或不是一个对象）。' };
  }

  const notes: string[] = [];
  const raw = parsed.state;

  // 形状的最小骨架。少一个都说明这不是一份能用的档 ——
  // 与其带着 undefined 一路走下去在某处崩掉，不如在这里就说清楚。
  const missing = (['meta', 'player', 'vault', 'quests', 'milestones'] as const).filter((k) => !isRecord(raw[k]));
  if (missing.length > 0) {
    return { ok: false, reason: `存档缺少必需的部分：${missing.join(' / ')}。文件可能不完整。` };
  }

  const version = isRecord(raw.meta) ? raw.meta.schemaVersion : undefined;
  if (typeof version !== 'number') {
    return { ok: false, reason: '存档缺少数版本号，无法确认它该被怎么读。' };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason:
        `这份存档来自更新的版本（v${version}，当前 v${CURRENT_SCHEMA_VERSION}）。` +
        '请升级应用后再导入 —— 强行读入会丢失新版本才有的数据。',
    };
  }

  if (version < CURRENT_SCHEMA_VERSION) {
    // 复用存档自己的迁移链：导入与开机走**同一条**升级路径，
    // 这样"从文件导入"永远不可能比"打开浏览器"少升一版。
    const decoded = decodeSave(JSON.stringify(raw), CURRENT_SCHEMA_VERSION, MIGRATIONS, now);
    if (!decoded.save) {
      return { ok: false, reason: `这份 v${version} 存档无法升级到当前版本：${decoded.note ?? '缺少迁移路径'}` };
    }
    notes.push(`已从 v${version} 升级到 v${CURRENT_SCHEMA_VERSION}（数据保留）`);
    return { ok: true, state: decoded.save, notes };
  }

  return { ok: true, state: raw as unknown as EarthOnlineState, notes };
};

/** 扩展名校验：拖拽时先看一眼文件名，明显不对就不必读了 */
export const looksLikeSaveFile = (name: string): boolean =>
  name.toLowerCase().endsWith('.json') || name.toLowerCase().endsWith('.eosave');

// ---------------------------------------------------------------------------
// 天灾急救箱
// ---------------------------------------------------------------------------

export interface RescueSnapshot {
  /** 有一份残损存档被保住了（它躺在 backup 键里，等着被救或等着被覆盖） */
  hasBackup: boolean;
  /** 残损存档的字节数，给玩家一个"这里面确实有东西"的直觉 */
  bytes: number;
  /** 保住它的时间（best effort：读 backup 键的写入时间拿不到，用条目里的字段兜底） */
  hint: string | null;
}

const storage = (): StorageLike | null => resolveStorage();

export const rescueSnapshot = (): RescueSnapshot => {
  const ls = storage();
  if (!ls) return { hasBackup: false, bytes: 0, hint: null };
  try {
    const raw = ls.getItem(STORAGE_KEYS.stateBackup);
    if (raw === null || raw.length === 0) return { hasBackup: false, bytes: 0, hint: null };

    let hint: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { meta?: { updatedAt?: unknown } };
      const updatedAt = parsed.meta?.updatedAt;
      if (typeof updatedAt === 'string') hint = updatedAt;
    } catch {
      // 它本来就是坏的 —— 读不出时间是正常的，不是错误
    }
    return { hasBackup: true, bytes: raw.length, hint };
  } catch {
    return { hasBackup: false, bytes: 0, hint: null };
  }
};

/**
 * 试着把 backup 键里那份残损存档救回来。
 *
 * 它同样走 decodeSave —— 也就是说，**能救回来的判据就是"它能不能通过迁移链"**。
 * 救援不是"绕过校验把坏数据塞进去"，那只是把崩溃推迟到下一次渲染。
 */
export const rescueFromBackup = (now: Date): ImportOutcome => {
  const ls = storage();
  if (!ls) return { ok: false, reason: '当前环境没有可用的本地存储。' };

  let raw: string | null = null;
  try {
    raw = ls.getItem(STORAGE_KEYS.stateBackup);
  } catch {
    return { ok: false, reason: '读取备份时出错。' };
  }
  if (raw === null || raw.length === 0) return { ok: false, reason: '没有找到损坏的存档记录。' };

  const decoded = decodeSave(raw, CURRENT_SCHEMA_VERSION, MIGRATIONS, now);
  if (!decoded.save) {
    return {
      ok: false,
      reason: `这份残损存档无法修复：${decoded.note ?? '结构已不可读'}。它仍然保留在备份键里，没有被删除。`,
    };
  }

  return {
    ok: true,
    state: decoded.save,
    notes: ['已从急救箱恢复（原损毁数据仍保留在备份键里）'],
  };
};

/** 明确清掉备份键。只在玩家自己按下"放弃这份损坏的存档"时调用。 */
export const discardBackup = (): void => {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEYS.stateBackup);
  } catch {
    /* 清不掉也无妨 */
  }
};
