// ============================================================================
// EarthOnline · Phase 5 · 成就引擎 (achievementEngine)
//
// 它做三件事，分别对应三个不同的时刻：
//
//   ① `evaluateCondition` / `evaluateAchievement` —— **判定**：把 catalog 里那些
//      文学化的达成条件翻译成能跑的机器判据，并顺手给出"还差多少"。
//   ② `syncAchievements` —— **调度**：挂在 store.mutate 的写入漏斗上，
//      每次写入顺手看一眼有没有新的事该被命名。无事返回同一对象。
//   ③ `hallOfFameView` —— **陈列**：把存档里那几个 id 投影成陈列馆要渲染的样子。
//
// 它为什么不住在 selectors.ts 里：selectors 是本项目的**只读下游**，谁都可以
// import 它；而本文件要被倒着 import 进 store 的写入路径。两者的依赖方向相反，
// 混在一起会成环。所以照 chapterEngine → selectors 那条单向依赖走：
// 引擎依赖 selectors，selectors 不认识引擎。
//
// ---------------------------------------------------------------------------
// 三条纪律
//
//   ① **无事返回同一对象。** 与 chapterEngine 一字不差的那条：它被挂在
//      mutate 里，每次点击都要跑一遍；只要它一动手就产新引用，这个应用就会在
//      每一次点击后写一次盘。
//
//   ② **只增不减。** 一旦解锁就再不复判。这不是省事，是语义：达成过的条件后来
//      可能退回去（净值会跌、关系等级会被改回「认识」、掌门人会走），但
//      "你到过那里"是一段已经发生的历史 —— 后来的事不该把它抹掉。
//      这一条同时保证了引擎**不需要**任何"撤销"通路，也就不可能撤销错。
//
//   ③ **绝不新增事实。** 引擎只往存档里写一个 id 和一个时刻：不打新点、不发奖、
//      不改任何数值（见 types/achievements.ts 的文件头）。于是补发是天然正确的
//      —— 老档里已经做到的事，第一次跑就都能算出来。
//
// ---------------------------------------------------------------------------
// 维度 F 的揭示门（本文件里唯一一条"额外规则"，单独说明）
//
// 至高隐藏那三条（隐匿的火星 / 让时间慢下来一点点 / 成为光源本身）**只在
// `evolution.revealed` 为真之后才参与判定**。
//
// 理由不是防剧透那几个字，而是防一种具体的不诚实：这三条的名字与题记
// （"你没有让谁活得更久……"「你的答案成了别人的起点」）说的正是那棵树本身。
// 在一棵树还没显形的时候把它的一部分先命名了，等于系统在雾里自己掀了一个角。
// 而且顺序反了会白白浪费最好的那一幕 —— 正确的顺序是雾散开，玩家看见那棵树，
// 然后回到陈列馆，发现里面已经静静躺着两枚他认得的徽记。
//
// 它是按**维度**判的（而不是给那三条各加一个字段）：因为它是"至高隐藏"
// 这一栏本身的性质（这一栏的总述就是「还有一些事，现在还不能说。」），
// 将来这一栏里再长出新条目时会自动继承，不需要有人记得补一个开关。
//
// ⚠️ 与 `evolutionView` 的分工：那边管的是"UI 能不能拿到树里的字符串"，
//    这边管的是"成就能不能在雾里被命名"。两者互不替代，也互不冲突。
// ============================================================================

import { ACHIEVEMENTS } from '@/data/catalog/achievements';
import { ACHIEVEMENT_DIMENSIONS, ACHIEVEMENT_TIER_META } from '@/data/catalog/achievements';
import { MILESTONE_CONFIDENCE_FLOOR } from '@/data/catalog/endgame';
import { isEarnedBySelf } from '@/lib/chapterEngine';
import { netWorthUsdCents } from '@/lib/selectors';
import type {
  Achievement,
  AchievementCondition,
  AchievementDimension,
  AchievementMark,
  AchievementProgress,
  AchievementTier,
  DismissAchievementOvation,
  EarthOnlineState,
  EvolutionBranch,
  ISODateTime,
  RelationStage,
  RelationType,
  SyncAchievements,
} from '@/types';

// ---------------------------------------------------------------------------
// 判据原语
//
// 一律从**整份 state** 里现算，不读任何缓存字段（`interactionCount` /
// `stats.litNodeCount` 这类冗余计数不进判据）：缓存与真值漂移的那天，
// 徽记会安静地点亮在一个不成立的条件上。
// ---------------------------------------------------------------------------

/** ISO 时刻的**本地**小时。日期口径全项目走本地时区（见 lib/format 的 localDateKey） */
const localHourOf = (iso: ISODateTime): number | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
};

/** 累计打过多少次日常的钩（一条日常一天只记一次，见 DailyLog 注释） */
const checkedDailyCount = (state: EarthOnlineState): number => {
  let n = 0;
  for (const log of Object.values(state.dailies.logs)) n += log.checkedIds.length;
  return n;
};

/** 所有打钩时刻的本地小时。老档里可能只有 id 没有时刻，那些跳过而不是当成 0 点 */
const checkedDailyHours = (state: EarthOnlineState): number[] => {
  const hours: number[] = [];
  for (const log of Object.values(state.dailies.logs)) {
    for (const id of log.checkedIds) {
      const at = log.checkedAt[id];
      if (!at) continue;
      const h = localHourOf(at);
      if (h !== null) hours.push(h);
    }
  }
  return hours;
};

/** 交卷时刻落在深夜的那些任务 */
const completedQuestHours = (state: EarthOnlineState): number[] => {
  const hours: number[] = [];
  for (const quest of Object.values(state.quests.byId)) {
    if (quest.status !== 'completed' || quest.completedAt === null) continue;
    const h = localHourOf(quest.completedAt);
    if (h !== null) hours.push(h);
  }
  return hours;
};

const careerQuestsCompleted = (state: EarthOnlineState, classId: string): number => {
  let n = 0;
  for (const quest of Object.values(state.quests.byId)) {
    if (quest.status === 'completed' && quest.classId === classId) n += 1;
  }
  return n;
};

/**
 * 词汇表里这些标签，玩家一共**碰到过几种**（去重计数）。
 *
 * 去重是判据的一半：`requiredTagCount` 说的是"几种不同的标签"，
 * 而不是"几条记录"。同一个 tag 被 Arbiter 抽中五次，只证明了一件事发生了五次，
 * 不证明这个人走过了五个地方。
 */
const distinctTechTags = (state: EarthOnlineState, tags: readonly string[]): number => {
  const wanted = new Set(tags);
  const hit = new Set<string>();
  for (const rec of state.evolution.techMilestones) {
    if (rec.confidence < MILESTONE_CONFIDENCE_FLOOR) continue;
    if (wanted.has(rec.tag)) hit.add(rec.tag);
  }
  return hit.size;
};

/** 目录里这些条目，玩家记录过几条（按 definitionId 去重） */
const distinctMilestoneDefinitions = (state: EarthOnlineState, ids: readonly string[]): number => {
  const wanted = new Set(ids);
  const hit = new Set<string>();
  for (const rec of state.milestones.records) {
    if (rec.definitionId === null) continue;
    if (wanted.has(rec.definitionId)) hit.add(rec.definitionId);
  }
  return hit.size;
};

const earnedIncomeCount = (state: EarthOnlineState): number =>
  state.vault.transactions.filter(isEarnedBySelf).length;

/**
 * 净资产能覆盖多少个月的支出（净资产 ÷ 月均支出，保留一位小数）。
 *
 * ⚠️ 与 selectors 的 `runwayMonths` 不是一回事：那个是**现金** ÷ 月均支出
 *    （"手头能撑多久"），这个量的是**全部身家**能挡多久 —— "第一座防御工事"
 *    四个字说的是后者。两个数字不一样，名字也就不许共用。
 *
 * 月均支出为 0 或净资产为负时返回 0 且**永远不成立**：一个还没记过账的人
 * 不该白得一座防御工事；而"能覆盖 -2.5 个月"不是一个数，是这把尺子外面的事。
 */
const netWorthCoverageMonths = (state: EarthOnlineState): number => {
  const burn = state.vault.monthlyBurn;
  if (burn <= 0) return 0;
  const months = netWorthUsdCents(state.vault) / burn;
  if (months <= 0) return 0;
  return Math.round(months * 10) / 10;
};

const interactionCount = (state: EarthOnlineState): number =>
  state.network.contacts.reduce((n, c) => n + c.interactions.length, 0);

/** 见面与饭局 —— 这两种渠道才是真的坐在了同一张桌子边上 */
const FACE_TO_FACE_CHANNELS: ReadonlySet<string> = new Set(['meeting', 'meal']);

const faceToFaceCount = (state: EarthOnlineState): number =>
  state.network.contacts.reduce(
    (n, c) => n + c.interactions.filter((i) => FACE_TO_FACE_CHANNELS.has(i.channel)).length,
    0,
  );

/** 被玩家亲手定到这些等级里的人数。`stage === null`（还没定过）一律不算 */
const stagedContactCount = (
  state: EarthOnlineState,
  stages: readonly RelationStage[],
  relationType: RelationType | undefined,
): number =>
  state.network.contacts.filter(
    (c) =>
      c.stage !== null &&
      stages.includes(c.stage) &&
      (relationType === undefined || c.relationType === relationType),
  ).length;

const litNodeCount = (
  state: EarthOnlineState,
  branch: EvolutionBranch | undefined,
  tier: number | undefined,
): number =>
  state.evolution.nodes.filter(
    (n) => n.lit && (branch === undefined || n.branch === branch) && (tier === undefined || n.tier === tier),
  ).length;

// ---------------------------------------------------------------------------
// 单条判据
// ---------------------------------------------------------------------------

const progress = (current: number, target: number): AchievementProgress => ({
  met: current >= target,
  current,
  target,
});

/**
 * 只许出现在"二选一"里的三条进度：目标恒为 1 —— 它们问的是"有没有过"，
 * 不是"有多少"。
 */
const happened = (yes: boolean): AchievementProgress => progress(yes ? 1 : 0, 1);

const hasHourAtOrAfter = (hours: readonly number[], hour: number): boolean =>
  hours.some((h) => h >= hour);

const hasHourBefore = (hours: readonly number[], hour: number): boolean =>
  hours.some((h) => h < hour);

export const evaluateCondition = (
  condition: AchievementCondition,
  state: EarthOnlineState,
): AchievementProgress => {
  switch (condition.kind) {
    case 'daily_checks':
      return progress(checkedDailyCount(state), condition.count);

    case 'daily_check_before_hour':
      return happened(hasHourBefore(checkedDailyHours(state), condition.hour));

    case 'daily_check_after_hour':
      return happened(hasHourAtOrAfter(checkedDailyHours(state), condition.hour));

    case 'quest_completed_after_hour':
      return happened(hasHourAtOrAfter(completedQuestHours(state), condition.hour));

    case 'career_quests_completed':
      return progress(careerQuestsCompleted(state, condition.classId), condition.count);

    case 'tech_tags':
      return progress(distinctTechTags(state, condition.tags), condition.count);

    case 'reality_milestones':
      return progress(distinctMilestoneDefinitions(state, condition.definitionIds), condition.count);

    case 'net_worth_usd_cents':
      return progress(netWorthUsdCents(state.vault), condition.amount);

    case 'net_worth_coverage_months':
      return progress(netWorthCoverageMonths(state), condition.months);

    case 'vault_income_count':
      return progress(earnedIncomeCount(state), condition.count);

    case 'goal_achieved': {
      const goal = state.endgame.goals.find((g) => g.id === condition.goalId);
      return happened(goal?.achieved === true);
    }

    case 'network_interactions':
      return progress(interactionCount(state), condition.count);

    case 'network_face_to_face':
      return progress(faceToFaceCount(state), condition.count);

    case 'contact_stage':
      return progress(stagedContactCount(state, condition.stages, condition.relationType), 1);

    case 'evolution_revealed':
      return happened(state.evolution.revealed);

    case 'evolution_lit_nodes':
      return progress(litNodeCount(state, condition.branch, condition.tier), condition.count);

    case 'any_of': {
      // 进度条报的是**最接近的那条路**：两条路都通同一件事时，
      // 玩家看到的应该是"我离这件事还有多远"，而不是系统偏爱的那条路还有多远。
      let best: AchievementProgress | null = null;
      for (const sub of condition.of) {
        const p = evaluateCondition(sub, state);
        if (p.met) return p;
        const ratio = p.target > 0 ? p.current / p.target : 0;
        const bestRatio = best !== null && best.target > 0 ? best.current / best.target : -1;
        if (best === null || ratio > bestRatio) best = p;
      }
      return best ?? { met: false, current: 0, target: 1 };
    }
  }
};

/**
 * 进度条上那两个数**怎么念**。
 *
 * `current` / `target` 是裸数字 —— 判据只算数，不认单位。但陈列馆要把它们印出来：
 * 「4 / 21 次」读得懂，「1250000 / 100000000」读不懂，因为后者那一栏的单位是**分**。
 * 单位跟着条件走，所以在引擎里算一次、放进投影里：UI 就不必回头去读
 * `achievement.condition` —— 那正是这道闸门要挡住的东西。
 */
export type AchievementProgressUnit = 'count' | 'usd' | 'months';

/**
 * 一条条件报进度时报的是什么单位。
 *
 * `any_of` 必须**跟着 evaluateCondition 挑中的那条路走**。两条路的单位可以不同
 * （里程标记"条"、金库记"笔"，或者一边是美元一边是月数），若两边各挑各的，
 * 陈列馆就会印出「3 / 1,000,000」这种把两把尺子缝在一起的数字 ——
 * 它不报错，只是读起来是个谎言。所以这里的挑法与 evaluateCondition **逐字相同**
 * （比值最大者，并列取先出场的那个）。
 *
 * 导出是为了给 verify-ops 用：目录里现在没有"两条路单位不同"的二选一，
 * 也就是说这条规则**当前没有一处真实数据能走到**。而它恰恰是最容易写错、
 * 错了又最难看出来的一支（印出来的数字不会崩，只会读不通），
 * 所以直接拿一份手写的条件把它钉住。
 */
export const unitOf = (condition: AchievementCondition, state: EarthOnlineState): AchievementProgressUnit => {
  switch (condition.kind) {
    case 'net_worth_usd_cents':
      return 'usd';
    case 'net_worth_coverage_months':
      return 'months';
    case 'any_of': {
      let best: AchievementCondition | null = null;
      let bestRatio = -1;
      for (const sub of condition.of) {
        const p = evaluateCondition(sub, state);
        if (p.met) return unitOf(sub, state);
        const ratio = p.target > 0 ? p.current / p.target : 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = sub;
        }
      }
      return best === null ? 'count' : unitOf(best, state);
    }
    // 余下的 14 条都是在数"有几件 / 有没有过"，一律按次数念
    default:
      return 'count';
  }
};

/**
 * 一条成就此刻的样子。
 *
 * 除了判据本身，它还要过一道**揭示门**（见文件头）：维度 F 的三条在雾散之前
 * 一律不成立。这里刻意连进度都不报（恒为 0/1）—— 给一个"0/1"也是在说
 * "有一件事，还差一点"，而那是剧透的形状。陈列馆对锁着的隐藏条目也确实是
 * **不画进度条**的（见 hallOfFameView 的 slot 投影）。
 */
export const evaluateAchievement = (
  achievement: Achievement,
  state: EarthOnlineState,
): AchievementProgress => {
  if (achievement.dimension === 'ABYSS' && !state.evolution.revealed) {
    return { met: false, current: 0, target: 1 };
  }
  return evaluateCondition(achievement.condition, state);
};

// ---------------------------------------------------------------------------
// 调度：写入漏斗上的第三道工序
// ---------------------------------------------------------------------------

/**
 * 把"已经做到但还没被命名"的事，命名一次。
 *
 * 它是**全项目唯一**给成就解锁的地方，挂在 store.mutate 上（见 useEarthOnlineStore），
 * 与 syncChapters 同一条漏斗、同一套纪律。除了"只增不减"（见文件头 ②），
 * 还有一条落在实现里的细节：**队列与判据分开写**。`achievementIds` 是历史，
 * `pendingAchievementIds` 是"还没给玩家看过的那几枚"——后者看完即清，
 * 而前者一个字都不许动。
 */
export const syncAchievements: SyncAchievements = (state, now) => {
  const prev = state.unlockables;
  const known = new Set(prev.achievementIds);
  const fresh: string[] = [];
  let unlockedAt: Record<string, ISODateTime> | null = null;

  for (const achievement of ACHIEVEMENTS) {
    if (known.has(achievement.id)) continue; // 只增不减：到过就是到过
    if (!evaluateAchievement(achievement, state).met) continue;
    if (unlockedAt === null) unlockedAt = { ...prev.achievementUnlockedAt };
    unlockedAt[achievement.id] = now.toISOString();
    fresh.push(achievement.id);
  }

  if (fresh.length === 0 || unlockedAt === null) return state;

  return {
    ...state,
    unlockables: {
      ...prev,
      achievementIds: [...(prev.achievementIds ?? []), ...fresh],
      achievementUnlockedAt: unlockedAt,
      /**
       * `?? []` 是刻意的，不是顺手写的。
       *
       * 这三格的形状由迁移保证（v6 把它们补成 [] / {}），也就是说：
       * 在一条合法的存档生命周期里，`??` 永远走不到。但本函数挂在**每一次点击**上，
       * 而这三格对"缺失"的容忍度目前并不一致 —— `new Set(undefined)` 与
       * `{...undefined}` 都能安然过去，只有这里的展开会当场抛异常。
       * 于是同一份畸形存档会表现为"队列空了"和"整个应用白屏"两种完全不同的结局，
       * 而这个区别不是任何人选的，是语法碰巧决定的。
       *
       * 三者取齐，选的是宽容的那一侧：一格没补上的数据，代价不该是每次点击都崩。
       */
      pendingAchievementIds: [...(prev.pendingAchievementIds ?? []), ...fresh],
    },
  };
};

/**
 * 玩家看完了那场金色光晕（可能一口气看了好几枚），把它们从队列里划掉。
 *
 * ⚠️ 它只清**队列**，不动 `achievementIds` 与 `achievementUnlockedAt` ——
 *    收起浮层不是把徽记摘下来。这条边界就是"队列入存档"这个设计的全部意义：
 *    刷新一次页面不该让一枚刚点亮的徽记悄无声息地过去。
 */
export const dismissAchievementOvation: DismissAchievementOvation = (state, _now) => {
  if (state.unlockables.pendingAchievementIds.length === 0) return state;
  return {
    ...state,
    unlockables: { ...state.unlockables, pendingAchievementIds: [] },
  };
};

// ---------------------------------------------------------------------------
// 陈列：给 UI 的那一份投影
//
// 它与 selectors.evolutionView 是同一种东西 —— **一道闸门，不是一个直通管道**。
// 组件拿不到 `Achievement` 本身，只拿到下面这个 slot；锁着的隐藏条目
// （维度 F 未解锁时）连 title 与 epigraph 都是 null，所以**哪怕某个组件忘了
// 判 `unlocked`，它也拿不到那个名字**。这比"记得别渲染"可靠。
// ---------------------------------------------------------------------------

export interface AchievementSlot {
  id: string;
  tier: AchievementTier;
  /** 档位的对外称呼（青铜 / 白银 / 黄金 / 至高白金），陈列馆不必再查一次表 */
  tierLabel: string;
  mark: AchievementMark | null;
  unlocked: boolean;
  unlockedAt: ISODateTime | null;
  /** 锁着的隐藏条目为 null —— 连名字都不给 */
  title: string | null;
  epithet: string | null;
  /** 拿到之后才读得到的那一行；未解锁为 null */
  epigraph: string | null;
  /** 达成条件的人话；锁着的隐藏条目为 null */
  criterion: string | null;
  /** 未解锁时那句不点破的线索；已解锁为 null */
  clue: string | null;
  /** 未解锁时的进度；锁着的隐藏条目为 null（见 evaluateAchievement） */
  progress: AchievementProgress | null;
  /** 上面那对数字该怎么念（次数 / 美元 / 月）。已解锁时为占位 1/1，无意义 */
  unit: AchievementProgressUnit;
}

export interface AchievementDimensionView {
  id: AchievementDimension;
  letter: string;
  label: string;
  epigraph: string;
  slots: AchievementSlot[];
  unlockedCount: number;
}

export interface HallOfFameView {
  dimensions: AchievementDimensionView[];
  unlockedCount: number;
  totalCount: number;
  /** 还没被看过的那些（金色光晕弹窗的队列）。看完即空 */
  pending: AchievementSlot[];
}

const toSlot = (achievement: Achievement, state: EarthOnlineState): AchievementSlot => {
  const unlocked = state.unlockables.achievementIds.includes(achievement.id);
  const hiddenBehindFog = achievement.hidden && !unlocked;

  return {
    id: achievement.id,
    tier: achievement.tier,
    tierLabel: ACHIEVEMENT_TIER_META[achievement.tier].label,
    mark: achievement.mark,
    unlocked,
    unlockedAt: state.unlockables.achievementUnlockedAt[achievement.id] ?? null,
    title: hiddenBehindFog ? null : achievement.title,
    epithet: hiddenBehindFog ? null : achievement.epithet,
    epigraph: unlocked ? achievement.epigraph : null,
    criterion: hiddenBehindFog ? null : achievement.criterion,
    clue: unlocked ? null : achievement.clue,
    progress: unlocked
      ? { met: true, current: 1, target: 1 }
      : hiddenBehindFog
        ? null
        : evaluateAchievement(achievement, state),
    unit: unitOf(achievement.condition, state),
  };
};

export const hallOfFameView = (state: EarthOnlineState): HallOfFameView => {
  const dimensions: AchievementDimensionView[] = ACHIEVEMENT_DIMENSIONS.map((meta) => {
    const slots = ACHIEVEMENTS.filter((a) => a.dimension === meta.id).map((a) => toSlot(a, state));
    return {
      id: meta.id,
      letter: meta.letter,
      label: meta.label,
      epigraph: meta.epigraph,
      slots,
      unlockedCount: slots.filter((s) => s.unlocked).length,
    };
  });

  const all = dimensions.flatMap((d) => d.slots);

  return {
    dimensions,
    unlockedCount: all.filter((s) => s.unlocked).length,
    totalCount: all.length,
    // 队列里可能有已经不存在的 id（比如某一条后来被改名/删掉）。
    // 这里按目录过滤一遍，而不是把 undefined 塞进数组 —— 一条改名
    // 不该让整场光晕弹不出来。
    pending: state.unlockables.pendingAchievementIds
      .map((id) => all.find((s) => s.id === id))
      .filter((s): s is AchievementSlot => s !== undefined),
  };
};
