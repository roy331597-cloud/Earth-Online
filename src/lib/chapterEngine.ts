// ============================================================================
// EarthOnline · Phase 3 · 篇章 DAG 推进引擎 (chapterEngine)
//
// 职责：把 `catalog/chapters.ts` 里那些**文学化的离开条件**，
// 翻译成能跑、能重算、能给出进度条的机器判据。
//
// 设计立场（三条，缺一不可）：
//
//   ① **每次从头重算，不存增量标记。** 引擎的输入永远是整份 state，
//      输出是"此刻的篇章图长什么样"。没有"上次算到哪"的游标 ——
//      那种东西一旦和存档不同步，就会变成一只永远修不好的幽灵。
//
//   ② **无事发生时返回同一个对象。** 它被挂在 store.mutate 里（见
//      useEarthOnlineStore），每次写入都要跑一遍；只要它一动手就产新引用，
//      这个应用就会在每一次点击后写一次盘。所以这里逐字段比较，
//      变了才新建对象 —— 包括 conditionProgress 的每一行。
//
//   ③ **判据必须诚实。** 只有能从现有数据真的算出来的条件才写进
//      conditionProgress；算不出来的（比如"方法论可被他人复用"）不编一个假的
//      数字凑数。catalog 里的原文仍是权威陈述，这里给的是它的机器代理 ——
//      两者对不上时，以原文为准，改这里。
//
// ⚠️ 判据中的数字阈值集中在本文件顶部。改动它们等于改动游戏难度曲线，
//    应当与 catalog 里的原文一起改。
// ============================================================================

import { CHAPTERS, HIDDEN_CHAPTER_IDS, isChapterUnlocked } from '@/data/catalog/chapters';
import { localDateKey, shiftDayKey } from '@/lib/format';
import { netWorthUsdCents } from '@/lib/selectors';
import type {
  ChapterCeremony,
  ChapterDefinition,
  ChapterId,
  ChapterProgress,
  ChapterProgressState,
  DateKey,
  EarthOnlineState,
  SyncChapters,
  VaultTransaction,
} from '@/types';

// ---------------------------------------------------------------------------
// 判据阈值
// ---------------------------------------------------------------------------

/** Ch.1：连续多少天有记录 */
const CH1_STREAK_DAYS = 30;
/** Ch.1 / 通用：职业线等级门槛 */
const CH1_CAREER_LEVEL = 5;
/** 「关系」深度阈值：warmth 与 trust 双双达到这个数才算双向深度关系 */
const DEEP_RELATION_THRESHOLD = 70;
/** Ch.5：净资产相对进入本章时要翻的倍数 */
const CH5_NET_WORTH_MULTIPLE = 10;

/**
 * 「不是家里给的」的识别词。进账的类别或备注里出现任何一个，就不算"自己赚来的"。
 * 这是一条**启发式**，不是法律条文 —— 它只影响 Ch.1 那一条进度条，
 * 而且判错的方向是保守的（把存疑的算作家里给的），符合"第一笔自己赚来的钱"
 * 这句话想要的分量。
 */
const FAMILY_MARKERS = ['家庭', '家族', '家里', '父母', '爸妈', '长辈给', 'family'];

/** 计入"自己赚来的"的流水类型 */
const EARNED_TYPES: ReadonlySet<VaultTransaction['type']> = new Set([
  'income',        // 主动收入：接单、内容变现、实习工资
  'dividend',      // 分红/利息
  'goal_grant',    // 任务奖励入账
]);

// ---------------------------------------------------------------------------
// 判据原语
// ---------------------------------------------------------------------------

/**
 * 「有记录」的日子：当天打过卡、写过复盘、或金库有过流水。
 * 三者取并集 —— 日记页上那句"连续记录"指的是"这一天我留下过东西"，
 * 不该被窄化成"只有写复盘才算"（那样前期几乎不可能达成）。
 */
const recordedDays = (state: EarthOnlineState): Set<DateKey> => {
  const days = new Set<DateKey>();
  for (const log of Object.values(state.dailies.logs)) {
    if (log.checkedIds.length > 0) days.add(log.localDate);
  }
  for (const entry of state.journal.entries) days.add(entry.localDate);
  for (const tx of state.vault.transactions) days.add(tx.localDate);
  return days;
};

/**
 * 截至今天的连续记录天数。
 * 今天还没记**不算断**——先从昨天数起，否则每天凌晨所有人的连击都会归零。
 */
const consecutiveRecordDays = (days: ReadonlySet<DateKey>, today: DateKey): number => {
  let cursor = days.has(today) ? today : shiftDayKey(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return n;
};

const maxCareerLevel = (state: EarthOnlineState): number =>
  state.careers.tracks.reduce((max, t) => Math.max(max, t.level), 0);

/**
 * 「这笔钱是他自己赚来的」。
 *
 * ⚠️ **导出**是有理由的：成就「第一枚硬币的落地声」问的是同一个问题
 *    （见 catalog/achievements.ts 的 ac_gravity_coin）。同一个判断只该有一处实现
 *    ——抄第二遍的那天，两边会开始给出不同的答案，而症状是"章的条件满足了、
 *    徽记却没亮"，没有任何地方会说这是同一个判据的两个版本。
 *
 * 它是一条**启发式**，不是法律条文（见 FAMILY_MARKERS）：判错的方向是保守的
 * （把存疑的算作家里给的），符合"自己赚来的"这句话想要的分量。
 */
export const isEarnedBySelf = (tx: VaultTransaction): boolean => {
  if (!EARNED_TYPES.has(tx.type) || tx.amount <= 0) return false;
  const haystack = `${tx.category}${tx.note}`.toLowerCase();
  return !FAMILY_MARKERS.some((m) => haystack.includes(m.toLowerCase()));
};

const earnedIncomeCount = (state: EarthOnlineState): number =>
  state.vault.transactions.filter(isEarnedBySelf).length;

/**
 * 目录里那些条目被记下了几条。
 *
 * `definitionId !== null` 这一句是**判据本身**，不是类型体操：玩家自己写的那条
 * 记录没有定义，因此它**永远推不动章节**（离开条件只认目录里被承认的凭据）。
 * 写成显式判断，将来有人想放宽时得先删掉这一行，而不是顺手把类型改宽。
 */
const milestoneCount = (state: EarthOnlineState, definitionIds: readonly string[]): number =>
  state.milestones.records.filter((r) => r.definitionId !== null && definitionIds.includes(r.definitionId))
    .length;

const deepRelationCount = (state: EarthOnlineState): number =>
  state.network.contacts.filter(
    (c) =>
      c.dimensions.warmth >= DEEP_RELATION_THRESHOLD &&
      c.dimensions.trust >= DEEP_RELATION_THRESHOLD,
  ).length;

/** 私人 Lab 目标下已点亮的里程碑数（Ch.7 的机器代理） */
const labMilestoneCount = (state: EarthOnlineState): number => {
  const goal = state.endgame.goals.find((g) => g.id === 'PRIVATE_LAB');
  if (!goal) return 0;
  return goal.milestones.filter((m) => m.achievedAt !== null).length;
};

// ---------------------------------------------------------------------------
// 每章的判据表
//
// 一张 Record，而不是塞进 catalog —— catalog 是**叙事**，这里的是**判定**。
// 两者故意分家：改一句判据不该动到题记，改一句题记也不该动到判定。
// 表里没有的章节（CH9）永远返回空 checklist：它不设终点。
// ---------------------------------------------------------------------------

interface ChapterContext {
  state: EarthOnlineState;
  today: DateKey;
  days: ReadonlySet<DateKey>;
  netWorth: number;
  /** 该章自己的进度记录（Ch.5 要读进入时的净资产快照） */
  progress: ChapterProgress;
}

interface ConditionSpec {
  label: string;
  target: number;
  derive: (ctx: ChapterContext) => number;
}

const CONDITIONS: Partial<Record<ChapterId, ConditionSpec[]>> = {
  // 「连续 30 天有记录；至少一条职业线达 Lv.5；并且出现第一笔自己赚来的收入」
  CH1: [
    { label: `连续有记录的天数（≥${CH1_STREAK_DAYS} 天）`, target: CH1_STREAK_DAYS, derive: (c) => consecutiveRecordDays(c.days, c.today) },
    { label: `最高职业线等级（Lv.${CH1_CAREER_LEVEL}）`, target: CH1_CAREER_LEVEL, derive: (c) => maxCareerLevel(c.state) },
    { label: '自己赚来的进账（笔）', target: 1, derive: (c) => earnedIncomeCount(c.state) },
  ],

  // 「产出至少 1 项可被外部检索/使用的成果」
  CH2: [
    {
      label: '可被外部检索/使用的成果',
      target: 1,
      derive: (c) => milestoneCount(c.state, ['rm_preprint_public', 'rm_paper_submitted', 'rm_open_source_release', 'rm_dataset_public']),
    },
  ],

  // 「完成至少 1 段不少于 8 周的海外学习/研究经历」
  CH3: [
    { label: '海外经历（≥8 周）', target: 1, derive: (c) => milestoneCount(c.state, ['rm_overseas_experience']) },
  ],

  // 「产出至少 1 项可作为第一作者的成果」。第二段海外经历只作附加进度，不作门槛。
  CH4: [
    { label: '第一作者成果', target: 1, derive: (c) => milestoneCount(c.state, ['rm_paper_accepted']) },
    { label: '第二段海外经历（附加）', target: 1, derive: (c) => milestoneCount(c.state, ['rm_overseas_experience']) },
  ],

  // 「出现至少 1 条非工资性收入，且净资产相对进入本章时的快照提升 10 倍」
  CH5: [
    {
      label: '非工资性收入',
      target: 1,
      derive: (c) => milestoneCount(c.state, ['rm_first_remote_income', 'rm_first_client', 'rm_passive_income']),
    },
    {
      // 没有基准（老档 / 手工构造的档）时记 0 —— 诚实地说"这次算不出来"，
      // 而不是拿当前的净资产当基准，那样永远显示 1 倍。
      label: `净资产倍数（进入本章时 = 1×）`,
      target: CH5_NET_WORTH_MULTIPLE,
      derive: (c) =>
        c.progress.entryNetWorthUsdCents === null || c.progress.entryNetWorthUsdCents <= 0
          ? 0
          : Math.round((c.netWorth / c.progress.entryNetWorthUsdCents) * 10) / 10,
    },
  ],

  // 「海外身份进程实质推进至递交或获批」。第二半（长期异地工作）暂无机器信号，
  // 不编一条假进度条 —— 它由玩家在里程碑里自己记（rm_long_term_remote）。
  CH6: [
    { label: '海外身份递交或获批', target: 1, derive: (c) => milestoneCount(c.state, ['rm_visa_submitted', 'rm_visa_approved']) },
  ],

  // 「Lab 形态落地，并产出至少 1 项独立成果」
  CH7: [
    { label: '私人 Lab 目标下的里程碑', target: 1, derive: (c) => labMilestoneCount(c.state) },
  ],

  // 「建立至少 1 段双向深度关系（warmth 与 trust 双高且长期稳定）」
  CH8: [
    {
      label: `深度关系（温度与信任均 ≥ ${DEEP_RELATION_THRESHOLD}）`,
      target: 1,
      derive: (c) => deepRelationCount(c.state),
    },
  ],
};

const deriveRows = (def: ChapterDefinition, ctx: ChapterContext): ChapterProgress['conditionProgress'] => {
  const specs = CONDITIONS[def.id];
  if (!specs) return [];
  return specs.map((s) => {
    const current = s.derive(ctx);
    return { label: s.label, current, target: s.target, met: current >= s.target };
  });
};

// ---------------------------------------------------------------------------
// 本章小结（仪式上要展示的那几个数）
//
// 口径：一条已完成的任务，计入**它完成时仍活着**的每一章。
// 并行支线下这会让同一笔 EXP 出现在两章里 —— 这是对的：
// "一边科研一边攒钱"的那段时间，本来就是在同时推进两条线。
// ---------------------------------------------------------------------------

const chapterStats = (
  state: EarthOnlineState,
  progress: ChapterProgress,
  until: Date,
): { expEarned: number; questsCompleted: number } => {
  const from = progress.startedAt === null ? null : new Date(progress.startedAt).getTime();
  const to = progress.completedAt === null ? until.getTime() : new Date(progress.completedAt).getTime();
  let expEarned = 0;
  let questsCompleted = 0;

  for (const quest of Object.values(state.quests.byId)) {
    if (quest.status !== 'completed' || quest.completedAt === null) continue;
    const at = new Date(quest.completedAt).getTime();
    if (from !== null && at < from) continue;
    if (at > to) continue;
    questsCompleted += 1;
    expEarned += quest.grant?.final.exp ?? quest.reward.exp;
  }

  return { expEarned, questsCompleted };
};

// ---------------------------------------------------------------------------
// 引擎主体
// ---------------------------------------------------------------------------

const sameRows = (
  a: ChapterProgress['conditionProgress'],
  b: ChapterProgress['conditionProgress'],
): boolean =>
  a.length === b.length &&
  a.every((r, i) => r.label === b[i].label && r.current === b[i].current && r.target === b[i].target && r.met === b[i].met);

const sameIds = (a: readonly ChapterId[], b: readonly ChapterId[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** 隐藏条件：Ch.9 还要进化树已揭示（不满足时连"未解锁"都不该被看见） */
const isUnlockedNow = (
  def: ChapterDefinition,
  completedIds: readonly ChapterId[],
  evolutionRevealed: boolean,
): boolean => {
  if (!isChapterUnlocked(def, completedIds)) return false;
  if (HIDDEN_CHAPTER_IDS.includes(def.id) && !evolutionRevealed) return false;
  return true;
};

export const syncChapters: SyncChapters = (state, now) => {
  const prev = state.chapters;
  const today = localDateKey(now);
  const days = recordedDays(state);
  const netWorth = netWorthUsdCents(state.vault);
  const ts = now.toISOString();

  const beforeUnlocked = new Set(prev.chapters.filter((c) => c.unlocked).map((c) => c.id));
  const completedIds: ChapterId[] = prev.chapters.filter((c) => c.completed).map((c) => c.id);

  const prevById = new Map(prev.chapters.map((c) => [c.id, c]));
  const nextById = new Map<ChapterId, ChapterProgress>();
  const unlockedChapterIds: ChapterId[] = [];
  let ceremony: ChapterCeremony | null = null;

  /**
   * 本趟是否已经通关过一章。
   *
   * ⚠️ 这个标志必须与下面的 `ceremony` **分开**：`ceremony` 是在循环之后才被
   *    打造出来的，用它当守卫等于没守卫 —— 一趟里会一口气通关好几章，
   *    而仪式只会给其中一章办，剩下那几章就在无人看见的地方翻页了。
   *    仪式是一件要玩家看着它发生的事，所以这里挡的是**通关**，不是**办仪式**。
   */
  let completedThisPass = false;

  for (const def of CHAPTERS) {
    const old = prevById.get(def.id);
    if (!old) continue; // 存档里缺这一章（理论上不会）：跳过，不凭空造一条

    const unlocked = isUnlockedNow(def, completedIds, state.evolution.revealed);
    const ctx: ChapterContext = { state, today, days, netWorth, progress: old };
    const rows = unlocked ? deriveRows(def, ctx) : old.conditionProgress;

    // —— 离章判定 ——
    // 一次 syncChapters 只让**一章**通关：仪式是一件要玩家看着它发生的事，
    // 两章同时弹两张全屏浮层只会互相打断。剩下的那些条件已全部达成、
    // 只是还没走仪式 —— 下一次写入（收起仪式也会触发一次）它们会依次通关。
    let completed = old.completed;
    let completedAt = old.completedAt;
    if (unlocked && !completed && !completedThisPass && rows.length > 0 && rows.every((r) => r.met)) {
      completed = true;
      completedAt = ts;
      completedThisPass = true;
      // 同趟里也要立刻生效：后面几章的解锁状态取决于它
      // （Ch.8 就是因为 Ch.1 完成了，才在这一趟里被解锁并获得命名权）
      completedIds.push(def.id);
    }

    // —— 第一次进入本章：定格基准 ——
    const startedAt = old.startedAt ?? (unlocked ? ts : null);
    const entryNetWorth =
      old.entryNetWorthUsdCents ?? (unlocked && !completed ? netWorth : null);

    const stats = chapterStats(state, { ...old, startedAt, completedAt }, now);

    const next: ChapterProgress = {
      id: def.id,
      unlocked,
      completed,
      conditionProgress: rows,
      expEarnedInChapter: stats.expEarned,
      questsCompletedInChapter: stats.questsCompleted,
      startedAt,
      completedAt,
      playerChosenCodename: old.playerChosenCodename,
      codenameSource: old.codenameSource,
      entryNetWorthUsdCents: entryNetWorth,
    };

    // 逐字段比对，没变就沿用旧引用 —— 这是"无事返回同对象"在**每一章**上的落实。
    nextById.set(
      def.id,
      sameProgress(old, next) && sameRows(old.conditionProgress, next.conditionProgress) ? old : next,
    );
  }

  // 收集"本次新解锁的章"。放在第二遍是因为通关会改变后面几章的解锁状态，
  // 而它们已经在上面的循环里用更新后的 completedIds 判过了。
  for (const def of CHAPTERS) {
    const nowUnlocked = nextById.get(def.id)?.unlocked ?? false;
    if (nowUnlocked && !beforeUnlocked.has(def.id)) unlockedChapterIds.push(def.id);
  }

  const newlyCompletedId = [...nextById.values()].find(
    (c) => c.completed && !(prevById.get(c.id)?.completed ?? false),
  )?.id;

  if (newlyCompletedId) {
    const def = CHAPTERS.find((c) => c.id === newlyCompletedId)!;
    const progress = nextById.get(newlyCompletedId)!;
    const namingFor = unlockedChapterIds.find((id) => !HIDDEN_CHAPTER_IDS.includes(id)) ?? null;
    const namingDef = namingFor === null ? null : CHAPTERS.find((c) => c.id === namingFor) ?? null;
    const goalTitles = (namingDef?.primaryGoalIds ?? [])
      .map((gid) => state.endgame.goals.find((g) => g.id === gid)?.title)
      .filter((t): t is string => typeof t === 'string');

    ceremony = {
      completedChapterId: newlyCompletedId,
      completedTitle: def.title,
      completedCodename: progress.playerChosenCodename ?? def.codename,
      summary: {
        expEarned: progress.expEarnedInChapter,
        questsCompleted: progress.questsCompletedInChapter,
        daysInChapter:
          progress.startedAt === null
            ? 0
            : Math.max(0, Math.floor((now.getTime() - new Date(progress.startedAt).getTime()) / 86_400_000)),
      },
      unlockedChapterIds,
      namingForChapterId: namingFor,
      namingContext: goalTitles.length > 0 ? goalTitles.join(' · ') : null,
      at: ts,
    };
  }

  // —— 集合级字段 ——
  const chapters = CHAPTERS.map((def) => nextById.get(def.id)).filter(
    (c): c is ChapterProgress => c !== undefined,
  );
  const activeChapterIds = chapters.filter((c) => c.unlocked && !c.completed).map((c) => c.id);

  let focusedChapterId = prev.focusedChapterId;
  if (!activeChapterIds.includes(focusedChapterId)) {
    // 优先落到本次通关刚交接过来的那一章 —— 玩家的目光本来就在那儿。
    const handedOver = (ceremony ?? prev.pendingCeremony)?.namingForChapterId ?? null;
    focusedChapterId =
      (handedOver !== null && activeChapterIds.includes(handedOver) ? handedOver : null) ??
      unlockedChapterIds.find((id) => activeChapterIds.includes(id)) ??
      activeChapterIds[0] ??
      focusedChapterId;
  }

  const completedCount = chapters.filter((c) => c.completed).length;

  const nextState: ChapterProgressState = {
    activeChapterIds,
    focusedChapterId,
    chapters,
    completedCount,
    // 已有待看仪式时**不覆盖** —— 玩家还没看完的那一份优先。
    pendingCeremony: prev.pendingCeremony ?? ceremony,
  };

  if (sameChapterState(prev, nextState)) return state;

  return { ...state, chapters: nextState };
};

// ---------------------------------------------------------------------------
// 引用相等比较：一次遍历里所有字段都比过，全等则整块沿用旧引用。
// ---------------------------------------------------------------------------

const sameProgress = (a: ChapterProgress, b: ChapterProgress): boolean =>
  a.id === b.id &&
  a.unlocked === b.unlocked &&
  a.completed === b.completed &&
  a.expEarnedInChapter === b.expEarnedInChapter &&
  a.questsCompletedInChapter === b.questsCompletedInChapter &&
  a.startedAt === b.startedAt &&
  a.completedAt === b.completedAt &&
  a.playerChosenCodename === b.playerChosenCodename &&
  a.codenameSource === b.codenameSource &&
  a.entryNetWorthUsdCents === b.entryNetWorthUsdCents;

const sameCeremony = (a: ChapterCeremony | null, b: ChapterCeremony | null): boolean => {
  if (a === null || b === null) return a === b;
  return (
    a.completedChapterId === b.completedChapterId &&
    a.at === b.at &&
    a.namingForChapterId === b.namingForChapterId &&
    sameIds(a.unlockedChapterIds, b.unlockedChapterIds)
  );
};

const sameChapterState = (a: ChapterProgressState, b: ChapterProgressState): boolean =>
  a.focusedChapterId === b.focusedChapterId &&
  a.completedCount === b.completedCount &&
  sameIds(a.activeChapterIds, b.activeChapterIds) &&
  sameCeremony(a.pendingCeremony, b.pendingCeremony) &&
  a.chapters.length === b.chapters.length &&
  a.chapters.every((c, i) => c === b.chapters[i]);

// ---------------------------------------------------------------------------
// 供 UI 读的两件小事
// ---------------------------------------------------------------------------

/** 命名权交接时给玩家挑的三个候选代号（catalog 里查，不入存档） */
export { CHAPTER_CODENAME_CANDIDATES } from '@/data/catalog/chapters';

/** 某一章在籍的天数（HUD 铭牌上那行小字） */
export const daysInChapter = (progress: ChapterProgress, now: Date): number => {
  if (progress.startedAt === null) return 0;
  const started = new Date(progress.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now.getTime() - started) / 86_400_000));
};

/** 本次通关新解锁了哪些章（仪式上那句"三条支线同时打开"） */
export const chapterTitlesOf = (ids: readonly ChapterId[]): string[] =>
  ids.map((id) => CHAPTERS.find((c) => c.id === id)?.title ?? id);
