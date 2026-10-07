// ============================================================================
// EarthOnline · Phase 3 · 验收夹具 (devFixtures)
//
// 为什么需要这个文件：Ch.1 的离章条件是「连续 30 天有记录」。
// 这条门槛在真实使用里意味着**玩家要真的记满一个月**——那是设计意图，
// 但对验收来说是灾难：评审不可能为了看一眼通关仪式等三十天。
//
// 所以这里放一组**造数据**的函数，把 state 直接推到"条件刚好达成"的那一刻。
// 它们只做一件事：伪造出引擎**读得到**的那几个字段，然后交回给真实的
// `syncChapters` —— 通关判定、仪式构造、命名交接、DAG 解锁全部走真身。
// 换句话说，被伪造的只有**输入**，没有一行被伪造的是**逻辑**。
//
// ⚠️ 纪律：本模块只能被 `useEarthOnlineStore` 的 `import.meta.env.DEV`
//    分支引用。它不是给玩家的功能，也不该出现在任何玩家能按到的地方 ——
//    能凭空给自己发一笔"第一笔自己赚来的钱"，会把这个游戏唯一诚实的东西毁掉。
// ============================================================================

import { CHAPTERS } from '@/data/catalog/chapters';
import { localDateKey, shiftDayKey } from '@/lib/format';
import type { ChapterCeremony, DateKey, EarthOnlineState, VaultTransaction } from '@/types';

/** 夹具里的日常 ID：优先用玩家真有的一条，没有就编一个不会撞车的 */
const fixtureDailyId = (state: EarthOnlineState): string =>
  state.dailies.definitions[0]?.id ?? 'd_dev_fixture';

/**
 * 补满最近 N 天的"有记录"。
 *
 * 引擎对"有记录"的口径是**并集**（打过卡 ∪ 写过复盘 ∪ 有金库流水），
 * 这里挑最省事的那一支：给这些天的 DailyLog 塞一个 checkedId。
 * 已有记录的日子只补不覆盖 —— 万一夹具撞上真实数据，不要毁掉它。
 */
const fillRecentDays = (
  state: EarthOnlineState,
  days: number,
  today: DateKey,
): EarthOnlineState['dailies'] => {
  const id = fixtureDailyId(state);
  const logs: EarthOnlineState['dailies']['logs'] = { ...state.dailies.logs };

  for (let i = 0; i < days; i += 1) {
    const key = shiftDayKey(today, -i);
    const existing = logs[key];
    if (existing && existing.checkedIds.length > 0) continue;

    logs[key] = existing
      ? { ...existing, checkedIds: [id], checkedAt: { ...existing.checkedAt, [id]: `${key}T08:00:00.000Z` } }
      : {
          localDate: key,
          checkedIds: [id],
          checkedAt: { [id]: `${key}T08:00:00.000Z` },
          expEarned: 0,
          vaultEarned: 0,
          expPenalized: 0,
          missedIds: [],
          streakBonusPct: 0,
          energyAtEndOfDay: null,
          settled: true, // 标成已结算：不给跨天结算留一份"还没算过"的假账
        };
  }

  return { ...state.dailies, logs };
};

/**
 * 把 Ch.1 的三条离章条件一次凑齐：
 *   ① 连续 30 天有记录 ② 最高职业线 Lv.5 ③ 一笔非家庭给予的进账。
 *
 * 等级是**直接写上去的**，没有走 `grantCareerExp` 那条真实升级路径 ——
 * 结果是 level 与 exp 会对不上（exp 还停在 Lv.1 的水平）。这是刻意的偷懒：
 * 引擎只读 level，而搬一整套升级循环进来，收益只是让一个调试道具看起来更真。
 */
export const forceChapterOneConditions = (
  state: EarthOnlineState,
  now: Date,
): EarthOnlineState => {
  const today = localDateKey(now);
  const iso = now.toISOString();

  const tracks = state.careers.tracks.map((t) => (t.level >= 5 ? t : { ...t, level: 5 }));

  const income: VaultTransaction = {
    id: 'txn_dev_fixture_income',
    ts: iso,
    localDate: today,
    type: 'income',
    amount: 30_000, // $300：够不上"发了"，但确实是自己赚的
    assetClass: 'cash',
    category: '兼职',
    note: '（验收夹具）第一笔自己赚来的钱',
  };

  const alreadyHasIncome = state.vault.transactions.some((t) => t.id === income.id);

  return {
    ...state,
    dailies: fillRecentDays(state, 30, today),
    careers: { ...state.careers, tracks },
    vault: {
      ...state.vault,
      cash: alreadyHasIncome ? state.vault.cash : state.vault.cash + income.amount,
      transactions: alreadyHasIncome ? state.vault.transactions : [...state.vault.transactions, income],
    },
  };
};

/**
 * 凭空造一个待看仪式（不碰任何条件）。
 *
 * 用途与上面那个不同：这个只为了**单独看 UI** —— 全屏浮层长什么样、
 * 粒子动不动、命名输入框好不好用。它把 Ch.1 标成已完成并解锁它的下游，
 * 这样仪式的上下文（"打开了哪三条支线"）才是真的，而不是三行假标题。
 */
export const forcePendingCeremony = (state: EarthOnlineState, now: Date): EarthOnlineState => {
  const iso = now.toISOString();
  const unlocked: EarthOnlineState['chapters']['chapters'][number]['id'][] = ['CH2', 'CH3', 'CH5', 'CH8'];

  const chapters = state.chapters.chapters.map((c) => {
    if (c.id === 'CH1') {
      return { ...c, completed: true, completedAt: c.completedAt ?? iso, startedAt: c.startedAt ?? iso };
    }
    if (unlocked.includes(c.id)) {
      return { ...c, unlocked: true, startedAt: c.startedAt ?? iso };
    }
    return c;
  });

  // 命名对象仍然是**本次新解锁的第一条非隐藏支线**（与引擎同一口径，见 syncChapters）。
  // 这里硬编码 CH2 是因为夹具本来就只伪造 Ch.1 那一次交接。
  const namingDef = CHAPTERS.find((c) => c.id === 'CH2');
  const goalTitles = (namingDef?.primaryGoalIds ?? [])
    .map((gid) => state.endgame.goals.find((g) => g.id === gid)?.title)
    .filter((t): t is string => typeof t === 'string');

  const ceremony: ChapterCeremony = {
    completedChapterId: 'CH1',
    completedTitle: '课表之外',
    completedCodename: 'BEYOND_TIMETABLE',
    summary: {
      expEarned: chapters.find((c) => c.id === 'CH1')?.expEarnedInChapter ?? 0,
      questsCompleted: chapters.find((c) => c.id === 'CH1')?.questsCompletedInChapter ?? 0,
      daysInChapter: 30,
    },
    unlockedChapterIds: unlocked,
    namingForChapterId: 'CH2',
    namingContext: goalTitles.length > 0 ? goalTitles.join(' · ') : null,
    at: iso,
  };

  const active = chapters.filter((c) => c.unlocked && !c.completed).map((c) => c.id);

  return {
    ...state,
    chapters: {
      ...state.chapters,
      chapters,
      activeChapterIds: active,
      focusedChapterId: active.includes('CH2') ? 'CH2' : state.chapters.focusedChapterId,
      completedCount: chapters.filter((c) => c.completed).length,
      pendingCeremony: ceremony,
    },
  };
};
