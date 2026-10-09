// ============================================================================
// EarthOnline · Phase 2 · 派生量选择器
//
// 约定（承 Phase 1 的持久化铁律 #2）：这里算出的一切都**不入库**。
// 状态里只存事实，屏幕上看到的都是从事实推出来的。
// ============================================================================

import { ACHIEVEMENTS } from '@/data/catalog/achievements';
import {
  CHAPTERS,
  CHAPTER_BRANCH_LABELS,
  HIDDEN_CHAPTER_IDS,
} from '@/data/catalog/chapters';
import { getClass, classLabelOf, titleForLevel } from '@/data/catalog/classes';
import { ATTRIBUTE_ORDER, ATTRIBUTE_BAR_MAX } from '@/data/catalog/attributes';
import {
  EVOLUTION_BRANCH_EPIGRAPHS,
  EVOLUTION_BRANCH_LABELS,
  EVOLUTION_FOG_LINE,
  EVOLUTION_TIER_LABELS,
} from '@/data/catalog/endgame';
import { getRealityMilestone } from '@/data/catalog/milestones';
import { RELATION_STAGES, RELATION_TYPES } from '@/data/catalog/network';
import { WEALTH_CURVE, wealthProgressRatio } from '@/data/catalog/policy';
import { GUANGHUA_SCENE, bandForHour, getScene } from '@/data/catalog/scenes';
import { qualifyingMilestones, tagsShortOf } from '@/lib/evolutionEngine';
import { daysBetween, formatClock, formatUsd, localDateKey, weekStartKey } from '@/lib/format';
import type {
  AttributeKey,
  CareerTrack,
  ChapterBranch,
  ChapterId,
  ClassIdLiteral,
  Contact,
  ContactId,
  DailyId,
  DateKey,
  EarthOnlineState,
  EndgameGoal,
  EvolutionBranch,
  EvolutionRevealCondition,
  EvolutionTier,
  GoalIdLiteral,
  HudSnapshot,
  ISODateTime,
  NetworkGraphSummary,
  NodeId,
  Quest,
  QuestChain,
  QuestId,
  RealityMilestoneCategory,
  RealityMilestoneRecord,
  RelationStage,
  RelationType,
  Scene,
  SpatialAnchor,
  TimeOfDay,
  UsdCents,
  Vault,
  VaultTransaction,
  WeeklyId,
} from '@/types';

// ---------------------------------------------------------------------------
// 1. 金库
// ---------------------------------------------------------------------------

/** 净资产 = 现金 + 持仓市值 − 负债。全项目唯一的口径，禁止在别处另算一遍。 */
export const netWorthUsdCents = (vault: Vault): UsdCents =>
  vault.cash + vault.holdings.reduce((sum, h) => sum + h.marketValue, 0) - vault.liabilities;

/** A9 进度 0..1（对数归一化曲线，见 catalog/policy.ts） */
export const a9Progress = (state: EarthOnlineState): number =>
  wealthProgressRatio(netWorthUsdCents(state.vault));

/** 跑道：以当前现金能撑几个月 */
export const runwayMonths = (vault: Vault): number =>
  vault.monthlyBurn <= 0 ? 0 : vault.cash / vault.monthlyBurn;

/**
 * 数量级阶梯：当前处在哪个 10 的幂区间、区间内走了多少、离 A9 还有几个数量级。
 *
 * 存在的理由只有一个：**只有对数总进度是不够的。**
 * 从 $1,100 攒到 $12,500，A9 进度条只从 0% 走到 4% —— 数字是对的，
 * 但它没有告诉玩家"我刚刚翻了十倍"。数量级是这条路上真正会被记住的刻度。
 *
 * 区间下界对 1 美元兜底：log10(0) 是负无穷，而"身无分文"必须有个刻度可站。
 */
export interface WealthMagnitude {
  /** 当前所在数量级的下界（$10k → 1_000_000 分） */
  decadeUsdCents: UsdCents;
  /** 下一个数量级（$100k） */
  nextDecadeUsdCents: UsdCents;
  /** 在当前数量级内走了多少 0..1 */
  ratioWithinDecade: number;
  /** 距离 A9 目标还差几个数量级 */
  decadesToTarget: number;
}

export const wealthMagnitude = (netWorthUsdCents: UsdCents): WealthMagnitude => {
  const x = Math.max(netWorthUsdCents, 1);
  const decade = Math.floor(Math.log10(x));
  const decadeUsdCents = Math.pow(10, decade);
  const nextDecadeUsdCents = decadeUsdCents * 10;
  const targetDecade = Math.floor(Math.log10(WEALTH_CURVE.targetUsdCents));
  return {
    decadeUsdCents,
    nextDecadeUsdCents,
    ratioWithinDecade: (x - decadeUsdCents) / (nextDecadeUsdCents - decadeUsdCents),
    decadesToTarget: Math.max(0, targetDecade - decade),
  };
};

/**
 * 近期流水，最新在前。
 *
 * ⚠️ 这里**依赖**账本是"追加型、按时间升序"的（见 core.ts 的 VaultTransaction）。
 * 换个说法：这个函数不排序，是因为排序是写入方的责任 ——
 * verify-ops 里有一条断言钉住"账本必须按时间升序"，破了会在 CI 里炸，
 * 而不是安静地让某个玩家看到倒着的流水。
 */
export const recentTransactions = (vault: Vault, limit = 8): VaultTransaction[] =>
  vault.transactions.slice(-limit).reverse();

// ---------------------------------------------------------------------------
// 2. 职业
// ---------------------------------------------------------------------------

/** 当前高亮的职业线；activeClassId 为空时退回等级最高的那条 */
export const activeTrack = (state: EarthOnlineState): CareerTrack | undefined => {
  const { tracks, activeClassId } = state.careers;
  return tracks.find((t) => t.classId === activeClassId) ?? [...tracks].sort((a, b) => b.level - a.level)[0];
};

export const trackTitle = (track: CareerTrack | undefined): string => {
  if (!track) return '尚未选择';
  const entry = getClass(track.classId);
  return entry ? titleForLevel(entry, track.level) : track.displayName;
};

export const trackForClass = (
  state: EarthOnlineState,
  classId: ClassIdLiteral,
): CareerTrack | undefined => state.careers.tracks.find((t) => t.classId === classId);

/**
 * 当前等级的经验进度 0..1。
 *
 * 满级（expToNext 为 0）返回 1 —— 而不是 0，也不是 NaN。
 * 这条曲线在 UI 上是一条进度条：满级时它该是**满的**，
 * 返回 0 会让"练满的人"看到一条空槽，是这套界面里最刺眼的一种谎。
 */
export const expRatio = (track: CareerTrack): number => {
  if (track.expToNext <= 0) return 1;
  return Math.min(1, Math.max(0, track.exp / track.expToNext));
};

/** 玩家的"总等级"：各条职业线等级之和。跨线并行才看得出这个数在涨。 */
export const portfolioLevel = (state: EarthOnlineState): number =>
  state.careers.tracks.reduce((sum, t) => sum + t.level, 0);

// ---------------------------------------------------------------------------
// 3. 任务与日常
// ---------------------------------------------------------------------------

const IN_PROGRESS: ReadonlyArray<Quest['status']> = ['active', 'turn_in_pending'];

export const questsByStatus = (state: EarthOnlineState, status: Quest['status']): Quest[] =>
  state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && q.status === status);

/** 玩家手上正在推进的任务（执行中 + 待结算） */
export const inProgressQuests = (state: EarthOnlineState): Quest[] =>
  state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && IN_PROGRESS.includes(q.status));

/**
 * 「进行中」Tab 的全家福：已领取 + 执行中 + 待结算。
 * 悬赏中枢四联之后，这三态从日常面板迁来这里 ——
 * 「进行中」的含义是"在你手上的一切"，从"还没开始"到"就差确认"都算。
 */
const IN_HAND: ReadonlyArray<Quest['status']> = ['claimed', 'active', 'turn_in_pending'];

export const inHandQuests = (state: EarthOnlineState): Quest[] =>
  state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && IN_HAND.includes(q.status));

/**
 * 链上一个任务的前置是否都完成了。
 *
 * 与 `operations.prerequisitesMet` 是同一句话 —— 那份是状态机的门槛，
 * 这份是派生量的口径，两个文件各留一份是刻意的：
 * lib 不反向依赖 store（依赖链单向，才不会绕成环）。
 * 改这里的判据之前，先去 operations.ts 把那一份一起看了。
 */
const prereqsMet = (state: EarthOnlineState, quest: Quest): boolean =>
  quest.prerequisiteQuestIds.every((id) => state.quests.byId[id]?.status === 'completed');

/**
 * 现在就能领取的任务：**已过审，且前置全部完成**。
 *
 * 轮 C（渐进揭开）：确认一条线之后，只有第一步会被揭开 —— 后面几步
 * 虽然同样是 offered，但前置（上一步）还没完成，它们**在悬赏板上根本不出现**，
 * 不是灰卡、不是"未解锁"的占位。这不是新门槛，而是把 claimQuest 上
 * 一直就有的前置门控（契约见 types/state.ts 的 ClaimQuest 注释）
 * 前移到**可见性**层面：状态机拦不住的东西，界面也不该先展示出来。
 *
 * 于是"数字"与"能做的事"仍然一一对应：悬赏板上数出来的每一条，现在就能接。
 */
export const claimableQuests = (state: EarthOnlineState): Quest[] =>
  state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && q.status === 'offered' && prereqsMet(state, q));

/** 等玩家逐条审核的草稿 */
export const draftQuests = (state: EarthOnlineState): Quest[] =>
  state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && q.status === 'draft');

/**
 * 等玩家做**线级裁决**的链：链内还有至少一条 draft。
 *
 * 轮 C 起审核的主入口是线级的（confirmQuestChain / rejectQuestChain），
 * 界面上它算"一个动作"—— 看整条线，一次确认或打回 ——
 * 所以角标按**链**计数，而不是按草稿条数。
 */
export const chainsAwaitingReview = (state: EarthOnlineState): QuestChain[] =>
  Object.values(state.quests.chains).filter((chain) =>
    chain.questIds.some((id) => state.quests.byId[id]?.status === 'draft'),
  );

// ---------------------------------------------------------------------------
// 3.4 停滞与回航（Phase 7 · up 迁移）
// ---------------------------------------------------------------------------

/** 停航的判定线：距最近一次**完成**任务 ≥ 这么多整天。 */
export const STALLED_DAYS = 3;

/**
 * 最近一次完成任务的时刻 —— 从未完成过返回 null。
 *
 * 只看 `completedAt`：领取、开始、挂起、待结算都不算"动过"。回航这条路的
 * 判据是"很久没有真的走完一件事"，不是"很久没点开 App" ——
 * 后者会惩罚只是来看看的人，而这个产品不做那种事。
 */
export const lastCompletionAt = (state: EarthOnlineState): ISODateTime | null =>
  state.quests.order.reduce<ISODateTime | null>((latest, id) => {
    const at = state.quests.byId[id]?.completedAt ?? null;
    return at !== null && (latest === null || at > latest) ? at : latest;
  }, null);

/** 距最近一次完成过了几天；从未完成过返回 null（而不是 0） */
export const daysSinceLastCompletion = (state: EarthOnlineState, now: Date): number | null => {
  const at = lastCompletionAt(state);
  return at === null ? null : daysBetween(at, now);
};

/**
 * 是否该请玩家「回航」。
 *
 * ⚠️ **从未完成过任何任务 → false**：第一天打开 App 的人不是"停滞"，
 *    他还没起航。把"没有记录"当成"停了很久"，回航按钮会在每个新档上亮着 ——
 *    那是在第一天就催他，恰是共享上下文里禁止的那种事。
 * ⚠️ 也**不看**手上有多少任务：手里堆着十件没动的不算"动过"，
 *    全部做完然后歇了三天才算停航。两种信息的区别，就是这条判据的全部价值。
 */
export const isStalled = (state: EarthOnlineState, now: Date): boolean => {
  const days = daysSinceLastCompletion(state, now);
  return days !== null && days >= STALLED_DAYS;
};

export const todayKey = (now: Date): DateKey => localDateKey(now);

export const checkedDailyIds = (state: EarthOnlineState, now: Date): ReadonlySet<DailyId> => {
  const log = state.dailies.logs[todayKey(now)];
  return new Set(log?.checkedIds ?? []);
};

/** 今日还没打钩的日常（只看 enabled 的） */
export const pendingDailies = (state: EarthOnlineState, now: Date) => {
  const checked = checkedDailyIds(state, now);
  return state.dailies.definitions.filter((d) => d.enabled && !checked.has(d.id));
};

// ---------------------------------------------------------------------------
// 3.5 每周规程（与日常同一套口径，刻度从"天"换成"周"）
// ---------------------------------------------------------------------------

/**
 * 此刻属于哪一周（周一）。与 checkDaily 同口径：用自然日而不是归属日 ——
 * 打钩落在"你按下那一刻所在的那一周"，结算在周一 01:00 由 runDailyRollover 负责。
 */
export const weekKeyOf = (now: Date): DateKey => weekStartKey(todayKey(now));

export const checkedWeeklyIds = (state: EarthOnlineState, now: Date): ReadonlySet<WeeklyId> => {
  const log = state.weeklies.logs[weekKeyOf(now)];
  return new Set(log?.checkedIds ?? []);
};

/** 本周还没打钩的周常（只看 enabled 的） */
export const pendingWeeklies = (state: EarthOnlineState, now: Date) => {
  const checked = checkedWeeklyIds(state, now);
  return state.weeklies.definitions.filter((w) => w.enabled && !checked.has(w.id));
};

// ---------------------------------------------------------------------------
// 3.6 导航角标
// ---------------------------------------------------------------------------

/**
 * Dock 与侧栏上那几个数字。
 *
 * 口径只有一条，而且必须一条：**「现在还有多少件事等你动手」。**
 * 它不报"有新东西可看"——那会变成一个永远不消失的红点，
 * 而永远不消失的红点等于没有红点（玩家三天就学会无视它）。
 * 所以每个数字背后都得对应一个**此刻就能做完的动作**。
 *
 * 「日常」这一格是**合并计数**（PO 裁定）：今日未打钩的日常 + 本周未打钩的周常。
 * 它们住在同一块面板里，Dock 上也只有一个入口，分开算的后果是
 * 手机端只看得见其中一半 —— 而另一半恰好在周一早上最要紧，
 * 那正是周常结算的前一刻。
 *
 * ⚠️ 「属性」的口径与「悬赏」「日常」**故意不同**：它报的不是任务，
 *    是"有一件事只有你能决定"（待分配点数）。一个数字，两件不同的事 ——
 *    改这里的任何一个之前，先想清楚改的是哪一件。
 *
 * ⚠️ 「关系」这一格已经空了（恒为 0，见下面的注释）：它原来报"有个人你很久没想起"，
 *    那是**在替玩家惦记他的关系**。PO 裁定撤下后，这里就没有可报的东西了 ——
 *    关系那本账改由玩家自己在卡片上写（等级）。
 */
export const navBadges = (state: EarthOnlineState, now: Date) => ({
  bounty:
    claimableQuests(state).length +
    // 审核在轮 C 变成线级动作：一条线算**一个**动作（看一遍整条线，一次确认），
    // 而不是链里有几条草稿就算几个 —— 后者会报出一个玩家做不了的数字
    chainsAwaitingReview(state).length +
    questsByStatus(state, 'turn_in_pending').length,
  // 合并计数：一块面板，一个入口，就该只有一个数字
  dailies: pendingDailies(state, now).length + pendingWeeklies(state, now).length,
  // 「关系」这一格**恒为 0**（PO 裁定）：它原来报的是超期未联系人数，
  // 而「该联系了」整条口径已经撤下 —— 撤的是一套判断，不是一行字。
  // 保留这个键只是为了让 Dock 的角标契约保持完整（0 = 不显示角标）；
  // 它不是一条留在那儿、以后可以偷偷重启的提醒。
  network: 0,
  attributes: state.player.freeAttributePoints,
});

// ---------------------------------------------------------------------------
// 4. 关系图谱
// ---------------------------------------------------------------------------

/**
 * 「单向投入」的判定门槛：亲近度比双向度高出这么多分。
 *
 * 25 是个松阈值 —— 它想抓的是"我把你当挚友、你把我当通讯录"这种落差，
 * 而不是正常关系里必然存在的不对称（谁先开口本来就轮着来）。
 * 调高会漏报，调低会把所有关系都标成告警 —— **这个功能一旦唠叨就没人看了**。
 */
export const LOPSIDED_GAP = 25;

/** 距上次联系过了几天；从没联系过返回 null（而不是 0 或一个巨大的数） */
export const daysSinceContact = (contact: Contact, now: Date): number | null =>
  contact.lastContactAt === null ? null : daysBetween(contact.lastContactAt, now);

/**
 * 关系图谱的聚合视图（Phase 1 已在 network.ts 立好这个契约：由 selector 计算，不入库）。
 *
 * ⚠️ 这里原来还出两本账 ——「该联系了」（超期）与「核心圈」（grade S/A）。
 * PO 裁定把它们撤下来了，理由是**它们都在替玩家排他的关系**：
 * 一本在催他，一本在替他分主次。现在由玩家自己给每段关系定一条等级
 * （`Contact.stage`，卡上可改），这里只负责把它数出来 —— 数的是他写下的东西。
 *
 * `now` 保留在签名里：等"重算评级"落地时它会重新有用（`lopsided` 也可以按新旧加权）。
 */
export const networkSummary = (
  state: EarthOnlineState,
  now: Date,
): NetworkGraphSummary => {
  void now;
  const { contacts } = state.network;
  const byType = {} as Record<RelationType, number>;
  for (const t of RELATION_TYPES) byType[t] = 0;
  const byLevel = {} as Record<RelationStage, number>;
  for (const s of RELATION_STAGES) byLevel[s] = 0;

  const lopsidedContactIds: ContactId[] = [];

  for (const c of contacts) {
    byType[c.relationType] = (byType[c.relationType] ?? 0) + 1;
    // 还没定过等级的（null）不进任何一档 —— 它不是第九档，它是"还没说"
    if (c.stage !== null) byLevel[c.stage] = (byLevel[c.stage] ?? 0) + 1;
    if (c.dimensions.warmth - c.dimensions.reciprocity >= LOPSIDED_GAP) {
      lopsidedContactIds.push(c.id);
    }
  }

  return { totalContacts: contacts.length, byType, byLevel, lopsidedContactIds };
};

export const getContact = (
  state: EarthOnlineState,
  contactId: ContactId,
): Contact | undefined => state.network.contacts.find((c) => c.id === contactId);

/**
 * 这个人身上**一段记录都没有** —— 手动加进名单的人从这里起步。
 *
 * 两处要用到它（卡片怎么画、智囊怎么开口），所以它只写一遍：
 * 两处各写一遍的那天，"卡片说还没有记录、智囊说你们的位置很稳"就会同时成立。
 *
 * 判据是**两条都空**：只有 `interactionCount` 为 0 而 `lastContactAt` 有值
 * 是不可能的，但真到了那一天（别处漏更新一头），这里宁可保守。
 */
export const isUnrecorded = (contact: Contact): boolean =>
  contact.interactionCount === 0 && contact.lastContactAt === null;

// ---------------------------------------------------------------------------
// 5. 场景锚点
// ---------------------------------------------------------------------------

/**
 * 锚点可见性判定的输入。
 *
 * 为什么把"现在能不能看见某个锚点"抽成纯函数：它是**世界状态的一部分**，
 * 不是组件的内部细节。放在组件里就只能靠肉眼看，放在这里就能被 verify-ops 钉住。
 */
export interface AnchorVisibilityContext {
  timeOfDay: TimeOfDay;
  /** 已解锁的篇章 id */
  unlockedChapterIds: readonly string[];
  hasPendingDaily: boolean;
  hasActiveQuest: boolean;
  /** 进化树是否已对玩家显形 */
  evolutionRevealed: boolean;
}

/**
 * 「进化树显形了没有」。
 *
 * 这是唯一一个允许被 UI 层直接读的进化树字段，所以要这么郑重地给它一个名字：
 * 它不是一个数据，它是"现在该不该让玩家看见"这个问题的**答案本身**。
 *
 * 拿它去判分支、判显不显示一扇窗、判控制室该说什么 —— 都可以；
 * 而树的内容（节点名、里程碑、进度）永远只能从 `evolutionView` 里拿。
 * 两者的区别不是"读了多少"，是"读了以后能不能说出一个名字"。
 */
export const evolutionRevealed = (state: EarthOnlineState): boolean => state.evolution.revealed;

export const buildAnchorContext = (state: EarthOnlineState, now: Date): AnchorVisibilityContext => ({
  timeOfDay: bandForHour(now.getHours()).timeOfDay,
  unlockedChapterIds: state.chapters.chapters.filter((c) => c.unlocked).map((c) => c.id),
  hasPendingDaily: pendingDailies(state, now).length > 0,
  hasActiveQuest: questsByStatus(state, 'active').length > 0,
  evolutionRevealed: evolutionRevealed(state),
});

/**
 * 当前场景下应该渲染的锚点。
 *
 * ⚠️ 三条铁律：
 *
 * ① **`requiresEvolutionRevealed` 读的是那一个布尔，不是这棵树。**
 *    Phase 2 这里写的是"一律判 false"，理由是不让渲染路径碰到
 *    `state.evolution` —— 那个理由当时就对，但它把话说过了头：
 *    真正不能读的是树的**内容**（节点名、里程碑、进度），
 *    而 `revealed` 本身就是"现在该不该让玩家看见"这个问题的答案，
 *    藏着它反而让锚点永远出不来（静态目录里的 `unlocked` 没人会去改，
 *    见 scenes.ts 里 anchor_evolution_window 的注释）。
 *    所以现在按 ctx 里的那一个布尔判 —— 依然是**一个布尔**，
 *    依然没有任何一个字符串来自进化树。内容的闸门仍旧只有 evolutionView 一道。
 *
 * ② **所有条件是 AND。** 没有"满足任一即可"的语义 —— 锚点出现得太随意，
 *    场景就不再是一个可信的空间，而变成一块会弹东西的广告牌。
 *
 * ③ 判不了的（`requiresActiveQuest` 没有指定是哪条）按"有没有"处理。
 *    这是宽松的一侧，宁可多显示一个锚点，也不要让一个已经写好的入口
 *    因为判定过严而永远不出现。
 */
export const visibleAnchors = (scene: Scene, ctx: AnchorVisibilityContext): SpatialAnchor[] =>
  scene.anchors.filter((a) => {
    if (!a.unlocked) return false;
    const v = a.visibleWhen;
    if (v === null) return true;
    if (v.requiresEvolutionRevealed && !ctx.evolutionRevealed) return false; // 见铁律 ①
    if (v.timeOfDay && !v.timeOfDay.includes(ctx.timeOfDay)) return false;
    if (v.chapterIds && !v.chapterIds.some((id) => ctx.unlockedChapterIds.includes(id))) return false;
    if (v.requiresPendingDaily && !ctx.hasPendingDaily) return false;
    if (v.requiresActiveQuest && !ctx.hasActiveQuest) return false;
    return true;
  });

// ---------------------------------------------------------------------------
// 6. 场景与氛围文案
// ---------------------------------------------------------------------------

export const currentScene = (state: EarthOnlineState): Scene =>
  getScene(state.world.activeSceneId) ?? GUANGHUA_SCENE;

/**
 * 氛围句：AVG 里那句"你在这儿站了一会儿"。
 *
 * 用「10 分钟一格」而不是随机数：随机数会在每次重渲染时闪一下，
 * 而这一段文字是要被看见的，不是背景噪声。
 */
const AMBIENT_LINES: Record<TimeOfDay, string[]> = {
  dawn: [
    '天还没完全亮，先来的那一批人已经开始动了。',
    '这个点的校园只属于很少的人。',
    '空气是凉的，脑子是清的。',
  ],
  morning: [
    '楼下有人在赶早八，你已经不在其中了。',
    '一天里最不需要意志力的那几个小时。',
    '现在做的事，会决定今晚睡得踏不踏实。',
  ],
  afternoon: [
    '光变得温吞，适合做需要耐心的事。',
    '这个时候最容易分心，也最容易沉下去。',
    '再撑一个回合，就到黄昏了。',
  ],
  dusk: [
    '路灯还没亮，先亮的是对面那栋楼的窗。',
    '天色刚刚好，适合把今天收个尾。',
    '风从草坪上穿过去，你在这里站了一会儿。',
  ],
  night: [
    '这一层的灯，通常只有你。',
    '安静下来了，可以做一些需要安静的事。',
    '白天属于别人，现在这几个小时是你的。',
  ],
  deepnight: [
    '这个时间还醒着的人，都有一个不愿意说的理由。',
    '该做的事已经做完了，剩下的明天再说。',
    '系统不假装现在还是昨天。该睡了。',
  ],
};

export const ambientLineFor = (timeOfDay: TimeOfDay, now: Date): string => {
  const pool = AMBIENT_LINES[timeOfDay];
  return pool[Math.floor(now.getMinutes() / 10) % pool.length];
};

// ---------------------------------------------------------------------------
// 5. HUD 快照（契约见 types/state.ts 的 BuildHudSnapshot）
// ---------------------------------------------------------------------------

export const buildHudSnapshot = (state: EarthOnlineState, now: Date): HudSnapshot => {
  const band = bandForHour(now.getHours());
  const scene = currentScene(state);
  const track = activeTrack(state);
  const pending = pendingDailies(state, now);
  const netWorth = netWorthUsdCents(state.vault);

  // 地点：玩家自定义的固定地点名优先；开了 GPS 且拿到过定位才用定位结果。
  const locationMode = state.world.gpsAllowed && state.world.lastGpsFix ? 'gps' : 'fixed';
  const locationLabel =
    locationMode === 'gps'
      ? (state.world.lastGpsFix?.label ?? scene.name)
      : (state.world.customLocationLabel ?? scene.name);

  return {
    now: now.toISOString(),
    localTimeLabel: formatClock(now),
    localDate: localDateKey(now),
    timeOfDay: band.timeOfDay,
    timeOfDayLabel: band.label,
    locationMode,
    locationLabel,
    sceneId: scene.id,
    ambientLine: ambientLineFor(band.timeOfDay, now),
    quickStats: {
      level: track?.level ?? 1,
      activeClassTitle: trackTitle(track),
      activeQuestCount: inProgressQuests(state).length,
      pendingDailyCount: pending.length,
      netWorthLabel: formatUsd(netWorth),
    },
    suggestRest: band.timeOfDay === 'deepnight',
  };
};

// ---------------------------------------------------------------------------
// 7. 档案馆：篇章地图 / 现实里程碑 / 进化树
// ---------------------------------------------------------------------------

/**
 * 篇章地图。
 *
 * ⚠️ Ch.9 在 catalog 里属于 `HIDDEN_CHAPTER_IDS` —— 因为它就是进化树本身。
 * 所以它在这里不是"未解锁"，而是 `hidden`：面板要把它画成一个**空的槽位**，
 * 而不是一行写着"点亮进化树"的灰色条目。剧透一个篇章的名字，
 * 和剧透整棵树是一回事。
 */
export interface ChapterMapNode {
  id: ChapterId;
  index: number;
  title: string;
  subtitle: string;
  branch: ChapterBranch;
  branchLabel: string;
  /** hidden = 连名字都不该出现（见上） */
  status: 'completed' | 'active' | 'available' | 'locked' | 'hidden';
  isConvergence: boolean;
  /** 解锁该章需要先完成的章节（用于"从哪来"的箭头） */
  requires: readonly ChapterId[];
}

export const chapterMap = (state: EarthOnlineState): ChapterMapNode[] => {
  const active = new Set(state.chapters.activeChapterIds);
  return CHAPTERS.map((def) => {
    const progress = state.chapters.chapters.find((c) => c.id === def.id);
    const status: ChapterMapNode['status'] = HIDDEN_CHAPTER_IDS.includes(def.id)
      ? 'hidden'
      : progress?.completed
        ? 'completed'
        : active.has(def.id)
          ? 'active'
          : progress?.unlocked
            ? 'available'
            : 'locked';
    return {
      id: def.id,
      index: def.index,
      // hidden 的章节连标题都换成占位符 —— 面板不必自己记得这件事
      title: status === 'hidden' ? '——' : def.title,
      subtitle: status === 'hidden' ? '' : def.subtitle,
      branch: def.branch,
      branchLabel: CHAPTER_BRANCH_LABELS[def.branch],
      status,
      isConvergence: def.isConvergence,
      requires: def.requires,
    };
  });
};

/** 某一章在存档里的真实进度（离章条件的 checklist） */
export const chapterProgressOf = (state: EarthOnlineState, id: ChapterId) =>
  state.chapters.chapters.find((c) => c.id === id);

// ---------------------------------------------------------------------------

export interface MilestoneWallEntry {
  record: RealityMilestoneRecord;
  title: string;
  subtitle: string;
  category: RealityMilestoneCategory;
  /** 展示用日期：优先取"事情发生的日子"，没填就退回"记下来的那天" */
  displayDate: DateKey;
  /** 这条定义是不是还能再来一次（签证、旅行、论文都是路上的驻点） */
  repeatable: boolean;
  /** 第几次（来自 counters），可重复类才有意义 */
  timesRecorded: number;
  /** 这一条是玩家**自己写的**（目录里没有它）—— 墙上给它一枚小标记 */
  custom: boolean;
}

/**
 * 现实里程碑墙，倒序。
 *
 * 排序用 `recordedAt` 而不是 `occurredOn`：
 * 墙的意义是"我什么时候**写下**了这件事"，而不是事件的自然日期 ——
 * 补记一条三年前的往事，它应当出现在最上面，
 * 因为"我今天想起了它"才是这一刻真正发生的事。
 */
export const milestoneWall = (state: EarthOnlineState): MilestoneWallEntry[] =>
  state.milestones.records
    .map((record) => {
      // 自己写的那条没有定义可查 —— 标题与分类都长在记录自己身上。
      // 目录里的条目照旧从定义取，两边在同一面墙上长得一样。
      const def = record.definitionId === null ? undefined : getRealityMilestone(record.definitionId);
      return {
        record,
        title: def?.title ?? record.customTitle ?? '（没有标题的记录）',
        subtitle: def?.subtitle ?? '',
        category: def?.category ?? record.customCategory ?? 'life',
        displayDate: record.occurredOn ?? record.recordedAt.slice(0, 10),
        repeatable: def?.repeatable ?? false,
        timesRecorded: record.definitionId === null ? 1 : state.milestones.counters[record.definitionId]?.count ?? 1,
        // 判据是"记录自己说自己没有定义"，不是"我们查不到定义" ——
        // 后者会把一条指向已删目录条目的老记录也标成"自己写的"
        custom: record.definitionId === null,
      };
    })
    .sort((a, b) => (a.record.recordedAt < b.record.recordedAt ? 1 : -1));

// ---------------------------------------------------------------------------

export interface EvolutionNodeView {
  id: NodeId;
  name: string;
  criterion: string;
  tier: EvolutionTier;
  tierLabel: string;
  lit: boolean;
  /**
   * 前置节点。星图要靠它画连线 —— 没有这张线，22 个节点只是 22 个点，
   * 而"从哪长到哪"正是这棵树唯一的形状。
   */
  prerequisites: NodeId[];
  /** 还没亮的前置（已亮的节点恒为空数组）。详情卡用它说"卡在哪儿" */
  blockedBy: NodeId[];
  /** 亮起的时刻。没亮就是 null */
  litAt: ISODateTime | null;
  /**
   * 它是在雾里亮的，还是雾散之后当着玩家的面亮的。
   * 对玩家这两件事不是同一件事：前者是"你早就做到了，今天才知道"。
   */
  litWhileRevealed: boolean;
  /** 这个节点还差几种标签（0 = 已亮）。详情卡用它说"还差什么"，不列已凑齐的 */
  tagsShort: number;
}

export interface EvolutionBranchView {
  id: EvolutionBranch;
  label: string;
  epigraph: string;
  nodes: EvolutionNodeView[];
  litCount: number;
  /** 该分支的进度 0..1，来自 stats.branchProgress */
  progress: number;
}

/** 未揭晓：只有一个轮廓和一句话。**这里没有任何一个字段来自进化树的内容。** */
export interface EvolutionFogView {
  revealed: false;
  /** 几根柱子（几何信息，肉眼本来就看得见） */
  branchCount: number;
  /** 每根柱子几格高（同上） */
  maxTier: number;
  line: string;
}

export interface EvolutionRevealedView {
  revealed: true;
  branches: EvolutionBranchView[];
  litNodeCount: number;
  totalNodeCount: number;
  lastLitAt: ISODateTime | null;
  revealedAt: ISODateTime | null;
  /** 四条揭示条件此刻的读数。雾散了之后它们就只剩"你是从哪扇门进来的"这层意思 */
  revealConditions: EvolutionRevealCondition[];
  /** 「第一次看见」那张卡还没放过 */
  revealMomentShown: boolean;
  /**
   * 这一屏是**隔着玻璃看的**（控制室的窥视开关打开，而这棵树其实还没显形）。
   * 树上的数据全是真的，但玩家不该以为他已经看见了 —— UI 得挂一条带子说清楚。
   */
  peeking: boolean;
}

export type EvolutionView = EvolutionFogView | EvolutionRevealedView;

export interface EvolutionViewOptions {
  /**
   * 迷雾窥视开关（控制室用）：会话内、不落盘。
   *
   * 它**不是**第二种揭示方式 —— 它只是把同一道闸门开给调试者。
   * 之所以做成参数而不是"把 state.evolution.revealed 改成 true"：
   * 那样会写坏存档（雾散了就回不来了，见 evolutionEngine 的单向性），
   * 而这里开关一关，玩家看到的还是原来那片雾。
   */
  fogOverride?: boolean;
}

/** 分支的展示顺序：按"人类先驯服了什么"排，不按枚举定义顺序 */
const BRANCH_ORDER: EvolutionBranch[] = [
  'COMPUTE_BIOLOGY',
  'MEDICINE',
  'ENERGY',
  'MATERIALS',
  'INTELLIGENCE',
  'SPACE',
];

/**
 * 进化树的对外视图 —— **迷雾的闸门就在这里**。
 *
 * Phase 1 在 `EvolutionTreeState.revealed` 上留了一句话：
 * 「为 false 时，任何 UI 组件都不得读取或渲染本对象的任何字段。
 *   （ESLint 自定义规则 / 独立 selector 隔离，见 Phase 2）」
 *
 * 这就是那个"独立 selector"。它保证了两件事：
 *
 *   ① 迷雾分支**只读 `revealed` 一个字段**，其余一概不碰
 *      （连 `stats.litNodeCount` 都不读 —— "你已经点亮了 1/22" 是剧透）；
 *   ② 迷雾分支返回的对象里**没有任何一个字符串来自进化树**，
 *      所以哪怕某个组件忘了判分支，它也拿不到名字。
 *
 * 组件永远拿不到 `EvolutionTreeState` 本身，只拿到这个视图。
 */
export const evolutionView = (
  state: EarthOnlineState,
  opts: EvolutionViewOptions = {},
): EvolutionView => {
  const e = state.evolution;

  // 窥视只在"树还没显形"时有意义。已经显形的树，开关开着关着都一样
  const peeking = opts.fogOverride === true && !e.revealed;

  if (!e.revealed && !peeking) {
    return {
      revealed: false,
      branchCount: BRANCH_ORDER.length,
      maxTier: 5,
      line: EVOLUTION_FOG_LINE,
    };
  }

  const litIds = new Set(e.nodes.filter((n) => n.lit).map((n) => n.id));
  const qualified = qualifyingMilestones(e.techMilestones);

  const byBranch = new Map<EvolutionBranch, EvolutionNodeView[]>();
  for (const branch of BRANCH_ORDER) byBranch.set(branch, []);
  for (const node of e.nodes) {
    byBranch.get(node.branch)?.push({
      id: node.id,
      name: node.name,
      criterion: node.criterion,
      tier: node.tier,
      tierLabel: EVOLUTION_TIER_LABELS[node.tier],
      lit: node.lit,
      prerequisites: node.prerequisites,
      // 还没亮的前置，单独挑出来 —— 详情卡要说"卡在哪儿"，
      // 让组件自己去 litIds 里比对，就是把这条规则抄进了 UI
      blockedBy: node.lit ? [] : node.prerequisites.filter((p) => !litIds.has(p)),
      litAt: node.litAt,
      litWhileRevealed: node.litWhileRevealed,
      tagsShort: node.lit ? 0 : tagsShortOf(node, qualified),
    });
  }

  const branches = BRANCH_ORDER.map((id) => {
    const nodes = (byBranch.get(id) ?? []).sort((a, b) => a.tier - b.tier);
    return {
      id,
      label: EVOLUTION_BRANCH_LABELS[id],
      epigraph: EVOLUTION_BRANCH_EPIGRAPHS[id],
      nodes,
      litCount: nodes.filter((n) => n.lit).length,
      progress: e.stats.branchProgress[id] ?? 0,
    };
  });

  return {
    revealed: true,
    branches,
    litNodeCount: e.stats.litNodeCount,
    totalNodeCount: e.stats.totalNodeCount,
    lastLitAt: e.stats.lastLitAt,
    revealedAt: e.revealedAt,
    revealConditions: e.revealConditions,
    revealMomentShown: e.revealMomentShown,
    peeking,
  };
};

// ---------------------------------------------------------------------------
// 8. 终局愿景圣殿
// ---------------------------------------------------------------------------

/**
 * 一个终极目标此刻的进度 0..1（**现算**）。
 *
 * 不读存档里的 `goal.progress` 缓存：那一格此前只有"现实里程碑记录"
 * 一条通路在维护，引擎点亮的格子不会去动它 —— 读它就是在读一份半旧的账。
 * 数学只有这一处：圣殿、AI 摘要（digest）读的都是同一个数。
 */
export const goalProgress = (state: EarthOnlineState, goal: EndgameGoal): number => {
  switch (goal.metric.kind) {
    case 'usd_net_worth':
      return a9Progress(state);
    case 'milestone_weights':
      return Math.min(
        1,
        goal.milestones.reduce((sum, m) => sum + (m.achievedAt === null ? 0 : m.weight), 0),
      );
    case 'count':
    case 'boolean':
      // 目录里没有条目用这两档，状态里也没有一个字段读得出它们
      // （`unit` 是一个词，不是一处状态）。宁可退回缓存值，也不编一个假读数。
      return goal.progress;
  }
};

export interface GoalMilestoneView {
  id: string;
  /** 隐藏里程碑在达成前**连名字都不给**（null）—— 同成就陈列馆的闸门语言 */
  title: string | null;
  criterion: string | null;
  achieved: boolean;
  achievedAt: ISODateTime | null;
  weight: number;
}

export interface GoalView {
  id: GoalIdLiteral;
  title: string;
  definition: string;
  narrative: string;
  /** 现算进度 0..1（`goalProgress`） */
  progress: number;
  achieved: boolean;
  achievedAt: ISODateTime | null;
  milestones: GoalMilestoneView[];
  litCount: number;
  totalCount: number;
}

/** 综合进度（UR 大表）里的一份 */
export interface ClearComponentView {
  key: 'goals' | 'chapters' | 'achievements';
  label: string;
  /** 这一份自己的进度 0..1 */
  ratio: number;
  /** 一行读数（"3 / 5 已达成"这种）—— 措辞由 selector 统一，组件不复述 */
  line: string;
}

export interface EndgameClearView {
  /** 三份等权平均 0..1 */
  progress: number;
  /**
   * 全通关。**按事实判、不按浮点比**：五个目标 achieved、8 章完成、
   * 徽记齐 —— 三个布尔全真才算点亮 UR。
   */
  complete: boolean;
  components: ClearComponentView[];
}

export interface EndgameView {
  goals: GoalView[];
  clear: EndgameClearView;
}

/**
 * 圣殿的对外视图。
 *
 * 它做三件事：
 *   ① 五张目标卡：进度现算（`goalProgress`）；**隐藏且未达成的里程碑
 *      在视图层就把 title / criterion 置成 null** —— 与成就陈列馆同一道闸门：
 *      组件哪怕忘了判 `achieved`，也拿不到那个名字；
 *   ② 综合进度：三份等权（五目标均值 / 篇章 / 成就）。
 *      篇章分母取"除隐藏章外的全部"（CH9 不设终点，永远空 checklist，
 *      算进去 = 100% 永远不可达）；成就分母取目录全量。
 *   ③ **不含进化树**。树的"至高科技树达成百分比"由圣殿组件另调
 *      `evolutionView` 渲染 —— 它有自己的雾门（`fogOverride`）。不并进来的原因：
 *      树不设终点（与 CH9 同一条哲学），一旦算进综合进度，掀雾那一刻
 *      数字会**回跌**，而且这个数字本身会泄雾。
 */
export const endgameView = (state: EarthOnlineState): EndgameView => {
  const goals: GoalView[] = state.endgame.goals.map((goal) => {
    const milestones: GoalMilestoneView[] = goal.milestones.map((m) => {
      const masked = m.hidden && m.achievedAt === null;
      return {
        id: m.id,
        title: masked ? null : m.title,
        criterion: masked ? null : m.criterion,
        achieved: m.achievedAt !== null,
        achievedAt: m.achievedAt,
        weight: m.weight,
      };
    });
    return {
      id: goal.id,
      title: goal.title,
      definition: goal.definition,
      narrative: goal.narrative,
      progress: goalProgress(state, goal),
      achieved: goal.achieved,
      achievedAt: goal.achievedAt,
      milestones,
      litCount: milestones.filter((m) => m.achieved).length,
      totalCount: milestones.length,
    };
  });

  // —— 综合进度：三份等权 ——
  const goalRatio =
    goals.length === 0 ? 0 : goals.reduce((sum, g) => sum + g.progress, 0) / goals.length;

  // 分母与分子都从 chapters 数组现数（不读 completedCount 缓存）：
  // 一处的账，只有一处算得出来。
  const chapterTotal = CHAPTERS.filter((c) => !HIDDEN_CHAPTER_IDS.includes(c.id)).length;
  const chapterDone = state.chapters.chapters.filter(
    (c) => c.completed && !HIDDEN_CHAPTER_IDS.includes(c.id),
  ).length;

  const achTotal = ACHIEVEMENTS.length;
  const achDone = state.unlockables.achievementIds.length;
  const goalAchievedCount = goals.filter((g) => g.achieved).length;

  const components: ClearComponentView[] = [
    {
      key: 'goals',
      label: '终极目标',
      ratio: goalRatio,
      line: `${goalAchievedCount} / ${goals.length} 已达成`,
    },
    {
      key: 'chapters',
      label: '篇章',
      ratio: chapterTotal === 0 ? 0 : chapterDone / chapterTotal,
      line: `${chapterDone} / ${chapterTotal} 章完成`,
    },
    {
      key: 'achievements',
      label: '成就',
      ratio: achTotal === 0 ? 0 : achDone / achTotal,
      line: `${achDone} / ${achTotal} 枚徽记`,
    },
  ];

  return {
    goals,
    clear: {
      progress: components.reduce((sum, c) => sum + c.ratio, 0) / components.length,
      complete:
        goals.every((g) => g.achieved) && chapterDone === chapterTotal && achDone >= achTotal,
      components,
    },
  };
};

// ---------------------------------------------------------------------------
// 9. 人物属性（六维面板）
// ---------------------------------------------------------------------------

export interface AttributeRowView {
  key: AttributeKey;
  label: string;
  line: string;
  /** 当前值 */
  value: number;
  /** 尺子上的位置 0..1（ATTRIBUTE_BAR_MAX 只是刻度，不是上限） */
  ratio: number;
  /** 哪些职业线把这一维写进了权重（高→低），用于对照"我的时间花在哪" */
  weights: Array<{ classId: ClassIdLiteral; label: string; weight: number }>;
}

/**
 * 六维面板的行视图。顺序取 catalog（= core 的顺序），不另起一套。
 *
 * 权重从 careers.tracks 现读，不从 catalog 硬编码：
 * 玩家的职业线是会变的（Phase 4 可以由 Dispatcher 新建），
 * 面板要展示的是"我这个存档的时间花在哪些维度上"，不是产品说明书。
 */
export const attributeRows = (state: EarthOnlineState): AttributeRowView[] =>
  ATTRIBUTE_ORDER.map((meta) => {
    const value = state.player.attributes[meta.key];
    const weights = state.careers.tracks
      .map((t) => ({
        classId: t.classId,
        label: classLabelOf(t.classId),
        weight: t.attributeWeights[meta.key] ?? 0,
      }))
      .filter((w) => w.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    return {
      key: meta.key,
      label: meta.label,
      line: meta.line,
      value,
      ratio: Math.min(1, Math.max(0, value / ATTRIBUTE_BAR_MAX)),
      weights,
    };
  });

export interface AttributeNoteView {
  /** 归并键：同一任务同一时刻的记账合并成一行 */
  id: string;
  ts: ISODateTime;
  /** 任务标题，或「手动分配」 */
  label: string;
  attributeKeys: AttributeKey[];
  /** 手动分配的点数（记账行为 0） */
  allocated: number;
  questId: QuestId | null;
}

/**
 * 「近期记录」：把 player.attributeHistory 折叠成一行一事。
 *
 * 记账行（delta = 0）按 (questId, ts) 归并 —— 一条任务练了三维修，是一个人做的一件事，
 * 不该在时间线上占三行。手动分配行各自独立（每次点击都是玩家的一次决定）。
 * 返回新→旧。
 */
export const recentAttributeNotes = (state: EarthOnlineState, limit = 6): AttributeNoteView[] => {
  const history = state.player.attributeHistory;
  const out: AttributeNoteView[] = [];
  const seen = new Set<string>();

  for (let i = history.length - 1; i >= 0 && out.length < limit; i--) {
    const d = history[i];
    if (!d) continue;
    const id = d.questId !== null ? `q:${d.questId}|${d.ts}` : `a:${d.ts}|${d.key}`;
    if (seen.has(id)) {
      const existing = out.find((o) => o.id === id);
      if (existing && !existing.attributeKeys.includes(d.key)) existing.attributeKeys.push(d.key);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      ts: d.ts,
      label: d.reason,
      attributeKeys: [d.key],
      allocated: d.questId === null ? d.delta : 0,
      questId: d.questId,
    });
  }
  return out;
};
