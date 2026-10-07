// ============================================================================
// EarthOnline · 状态推进纯函数（Phase 3 前哨）
//
// 这里把 Phase 1 冻结的契约逐条落成真实现：
//   CheckDaily / CheckWeekly / CreateDaily / CreateWeekly / CreateManualQuest /
//   StartQuest / OpenTurnIn / CompleteQuest / SpendAttributePoint /
//   AskNetworkAdvisor / ConsultNetworkSolver / CreateContactQuest / RunDailyRollover
// 每个函数的类型都直接标注为契约类型本身（而非等价签名），
// 于是**签名一旦漂移，tsc 就报错** —— 契约是编译期锁住的，不靠注释自觉。
//
// 三条自律：
//   1) 纯函数：不许读 Date.now()，时间一律由调用方注入（便于单测与回放）；
//   2) 不改入参：store 用引用相等判断"有没有发生事"（见 useEarthOnlineStore.mutate），
//      原地改数组会让它认为无事发生，也会污染 mock 的模板对象；
//   3) 无事发生时**返回原对象**，而不是返回一个内容相同的副本。
// ============================================================================

import { expToNext } from '@/data/catalog/classes';
import { DEFAULT_CONTACT_CADENCE_DAYS } from '@/data/catalog/network';
import { FREE_MILESTONE_EXP, getRealityMilestone } from '@/data/catalog/milestones';
import {
  CHAIN_REGENERATION_LIMIT,
  REROUTE_CHAIN_LIMIT,
  REROUTE_REQUEST_MAX_LEN,
  alignBonusPct,
} from '@/data/catalog/policy';
import { activeDayKey, endOfDay, localDateKey, localMonthKey, shiftDayKey, shiftWeekKey, weekStartKey } from '@/lib/format';
// 🔻 Phase 4：下面这些 mock 调用换成真实的 Dispatcher + Class Agent + Chain Reviewer + Network Advisor
import { mockForge } from '@/lib/mockForge';
import { DEFAULT_REROUTE_REQUEST, mockReroute } from '@/lib/mockReroute';
import { mockNetworkAdvisor, mockSocialSolver } from '@/lib/mockAdvisor';
import { buildQuests } from '@/lib/questFactory';
import type {
  AskNetworkAdvisor,
  AttachMilestoneSnapshot,
  AttributeDelta,
  CareerTrack,
  ChainId,
  ChapterId,
  ClassIdLiteral,
  CheckDaily,
  CheckWeekly,
  ClaimQuest,
  CompleteQuest,
  ConsultNetworkSolver,
  Contact,
  CreateContact,
  CreateContactQuest,
  CreateDaily,
  CreateManualQuest,
  SetContactStage,
  CreateWeekly,
  DailyDefinition,
  DailyId,
  DailyLog,
  DateKey,
  Difficulty,
  DismissChapterCeremony,
  EarthOnlineState,
  EmotionTag,
  EndgameGoal,
  EvolutionTreeState,
  FeedEvolutionMilestones,

  GenerateQuestChain,
  Interaction,
  JournalEntry,
  MilestoneSnapshot,
  NameChapter,
  NetworkAdviceRecord,
  NetworkState,
  OpenTurnIn,
  Player,
  Quest,
  QuestChain,
  QuestId,
  RecordCustomMilestone,
  RecordRealityMilestone,
  ReflectionQuality,
  ReflectionVerdict,
  RegenerateQuestChain,
  RerouteQuestDraft,
  RerouteRecord,
  ReviewQuestDraft,
  RolloverResult,
  RewardBundle,
  RunDailyRollover,
  RewardGrant,
  SolverConsultation,
  SpendAttributePoint,
  StartQuest,
  UsdCents,
  WeeklyDefinition,
  WeeklyId,
  WeeklyLog,
  WeeklyRolloverResult,
} from '@/types';

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const iso = (now: Date): string => now.toISOString();

/** 今天这一格空白的日常记录 */
const emptyLog = (localDate: DateKey): DailyLog => ({
  localDate,
  checkedIds: [],
  checkedAt: {},
  expEarned: 0,
  vaultEarned: 0,
  expPenalized: 0,
  missedIds: [],
  streakBonusPct: 0,
  energyAtEndOfDay: null,
  settled: false,
});

/** 只替换一条日常定义，其余保持引用 */
const withDaily = (state: EarthOnlineState, def: DailyDefinition): EarthOnlineState => ({
  ...state,
  dailies: {
    ...state.dailies,
    definitions: state.dailies.definitions.map((d) => (d.id === def.id ? def : d)),
  },
});

/** 这一格空白的周记录 */
const emptyWeeklyLog = (weekStart: DateKey): WeeklyLog => ({
  weekStart,
  checkedIds: [],
  checkedAt: {},
  expEarned: 0,
  expPenalized: 0,
  missedIds: [],
  settled: false,
});

/**
 * 属性留痕环形上限。200 条 ≈ 半年到一年的手动分配 + 任务记账，
 * 够"近期记录"翻很久，也不至于把存档养成一头大象。
 */
const ATTRIBUTE_HISTORY_CAP = 200;

/** 往 player 的属性留痕里追加若干条（环形裁剪），返回新的 player */
const pushAttributeHistory = (player: Player, entries: AttributeDelta[]): Player => {
  const merged = [...player.attributeHistory, ...entries];
  return {
    ...player,
    attributeHistory: merged.length > ATTRIBUTE_HISTORY_CAP ? merged.slice(merged.length - ATTRIBUTE_HISTORY_CAP) : merged,
  };
};

/** 只替换一条任务，其余保持引用 */
const withQuest = (state: EarthOnlineState, quest: Quest): EarthOnlineState => ({
  ...state,
  quests: { ...state.quests, byId: { ...state.quests.byId, [quest.id]: quest } },
});

/** 只替换一条职业轨迹，其余保持引用 */
const withTrack = (state: EarthOnlineState, track: CareerTrack): EarthOnlineState => ({
  ...state,
  careers: {
    ...state.careers,
    tracks: state.careers.tracks.map((t) => (t.classId === track.classId ? track : t)),
  },
});

/** 两个本地日历日之间的整日差（b − a）。只做本地午夜构造，不碰 UTC 边界。 */
const dayGap = (a: DateKey, b: DateKey): number => {
  const parse = (k: DateKey): number => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
};

/** 中文字数：按非空白字符计（"读起来有多长"，不是"有几个词"） */
const charCount = (text: string): number => text.replace(/\s/g, '').length;

/**
 * 这条职业线派任务的 Agent 在**花名册里的 id**。
 *
 * ⚠️ 这里曾经直接拼 `agent_class_${classId}`。它只在一条线上恰好对得上
 *    （目录 id `investor` ↔ 花名册 `agent_class_investor`），另外三条线全都错：
 *    拼出来的是 `agent_class_computational_biology`，而花名册上是
 *    `agent_class_compbio`。于是同一个事件有了两份对不上的记录 ——
 *    调用日志说跑的是 compbio，任务上说铸它的是另一个人。
 *    今天没有界面读这个字段，所以它不报错；明天有人做"这条任务是谁铸的"，
 *    或者按 agentId 回查履历，它就会安静地查不到。
 *
 *    花名册是状态的一部分，所以这仍然是个**纯函数**：读 state，不读时钟、不改入参。
 *    下游只有 `rerouteQuestDraft` 一处消费它（原样继承给替换件），没有别的调用方。
 *
 * 退路：花名册里没有这条线（比如蓝图新铸的线还没落册）就沿用老写法 ——
 * 宁可留一个查不到的 id，也不要编一个看起来像真的的。
 */
const ownerAgentIdFor = (state: EarthOnlineState, classId: ClassIdLiteral): Quest['origin']['agentId'] => {
  const roster = state.agents.records.filter((r) => r.kind === 'class' && r.classId === classId);
  const picked = roster.find((r) => r.status !== 'retired') ?? roster[0];
  return (picked?.id ?? `agent_class_${classId}`) as Quest['origin']['agentId'];
};

/**
 * 给职业轨迹加经验，并处理连续升级。
 *
 * `expToNext` 是**缓存字段**（types/core.ts 的 CareerTrack 注释），
 * 所以优先用它；缓存为 0（等级数据来自旧存档或已满级）时再回落到曲线函数。
 * 循环有双重护栏：`need > 0` 与 maxLevel 判定，避免坏数据把这里变成死循环。
 *
 * 返回 `levelsGained` 而不是只返回轨迹：属性点按**净升级数**发放，
 * 一次结算跨两级就该发两点（例如 300 EXP 砸在 1 级线上）。
 */
const grantCareerExp = (track: CareerTrack, exp: number): { track: CareerTrack; levelsGained: number } => {
  let level = track.level;
  let rest = track.exp + exp;
  let need = track.expToNext > 0 ? track.expToNext : expToNext(track.expCurve, level);

  while (level < track.expCurve.maxLevel && need > 0 && rest >= need) {
    rest -= need;
    level += 1;
    need = expToNext(track.expCurve, level);
  }

  return { track: { ...track, level, exp: rest, expToNext: need }, levelsGained: level - track.level };
};

/**
 * 升级发放的属性点（PO 裁定：**每升 1 级发 1 点**）。
 *
 * 进的是 `freeAttributePoints` 这个"待分配池"，**不是**直接加到属性上 ——
 * 「我在长成什么样」的分配权始终在玩家手上（types/core.ts 的 Player 注释）。
 */
const ATTRIBUTE_POINTS_PER_LEVEL = 1;

const withLevelUpPoints = (player: Player, levelsGained: number): Player =>
  levelsGained > 0
    ? { ...player, freeAttributePoints: player.freeAttributePoints + levelsGained * ATTRIBUTE_POINTS_PER_LEVEL }
    : player;

/** 有任意操作的日历日：天数 +1，并把"最近活跃日"推到今天 */
const touchPlayer = (player: Player, today: DateKey): Player =>
  player.lastActiveLocalDate === today
    ? player
    : { ...player, daysActive: player.daysActive + 1, lastActiveLocalDate: today };

/**
 * 把 Arbiter 的 `verdict: unknown | null` 收窄成 `ReflectionVerdict | null`。
 *
 * 契约上它是 unknown —— 因为真正跨进程来的东西（Phase 4 的 API 返回）
 * 在落库前必须过一遍校验。这里做的是最小必要的形状检查：
 * 认不出就返回 null，让调用方降级为"仅基础奖励"，**绝不把野数据写进存档**。
 */
const readVerdict = (raw: unknown): ReflectionVerdict | null => {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<ReflectionVerdict>;
  const qualities: ReflectionQuality[] = ['baseline', 'solid', 'sharp', 'revelatory'];
  if (!qualities.includes(v.quality as ReflectionQuality)) return null;

  return {
    quality: v.quality as ReflectionQuality,
    bonusPct: typeof v.bonusPct === 'number' ? v.bonusPct : 0,
    comment: typeof v.comment === 'string' ? v.comment : '',
    insights: Array.isArray(v.insights) ? v.insights : [],
    // ⚠️ 静默通道：这些标签去向是 evolution.techMilestones，UI 层永不读取
    milestoneTags: Array.isArray(v.milestoneTags) ? v.milestoneTags : [],
    suggestedFollowUps: Array.isArray(v.suggestedFollowUps) ? v.suggestedFollowUps : [],
  };
};

/**
 * 从 Arbiter 原始输出里取情绪标注。
 *
 * 它不在 `ReflectionVerdict` 上（那是"落库后的判定"），而在 ArbiterVerdictPayload 上
 * —— 所以从 unknown 里单独捞一次。捞不到就是空数组，不编造。
 */
const readEmotions = (raw: unknown): EmotionTag[] => {
  if (!raw || typeof raw !== 'object') return [];
  const e = (raw as { emotions?: unknown }).emotions;
  if (!Array.isArray(e)) return [];
  const legal: EmotionTag[] = [
    'calm', 'driven', 'doubtful', 'proud', 'tired',
    'curious', 'anxious', 'grateful', 'lonely', 'clear',
  ];
  return e.filter((v): v is EmotionTag => legal.includes(v as EmotionTag));
};

/** 'jr_0007' 这种可读自增 id：取现存最大编号 +1，确定性、不依赖当前时间 */
const nextJournalId = (entries: JournalEntry[]): string => {
  const max = entries.reduce((acc, e) => {
    const tail = /(\d+)$/.exec(e.id);
    return Math.max(acc, tail ? Number(tail[1]) : 0);
  }, 0);
  return `jr_${String(max + 1).padStart(4, '0')}`;
};

/**
 * 静默里程碑入库 —— 隐藏目标的**唯一**数据来源。
 *
 * 只做"记录"这一件事，不做节点点亮：点亮判定是 Phase 5 的事。
 * 此刻写进去的记录 `consumedByNodeId` 为 null，等点亮逻辑接上后再回填。
 * 本函数产出的数据在 UI 上完全不可见（evolution.revealed 仍为 false）。
 */
const ingestMilestones = (
  evolution: EvolutionTreeState,
  tags: string[],
  questId: string,
  now: Date,
  localDate: DateKey,
  confidence: number,
): EvolutionTreeState => {
  if (tags.length === 0) return evolution;

  const records = tags.map((tag, i) => ({
    id: `tm_${now.getTime().toString(36)}_${i}`,
    ts: iso(now),
    localDate,
    tag,
    questId: questId as EvolutionTreeState['techMilestones'][number]['questId'],
    confidence,
    consumedByNodeId: null,
  }));

  // 环形保留最近 300 条（契约见 types/endgame.ts）
  const merged = [...evolution.techMilestones, ...records];
  return {
    ...evolution,
    techMilestones: merged.length > 300 ? merged.slice(merged.length - 300) : merged,
  };
};

// ---------------------------------------------------------------------------
// 1. 日常：CheckDaily / CreateDaily
// ---------------------------------------------------------------------------

/**
 * 打钩一条日常 —— 立即发奖，并推进连击。
 *
 * 幂等键是「今天的 DailyLog.checkedIds」：同一条日常一天只记一次，
 * 即使 `targetPerDay > 1`（契约见 types/quest.ts 的 DailyLog 注释）。
 *
 * 连击加成：`streak × streakBonusPerDay`，封顶 `streakBonusCapPct`。
 * 加成基数取**打钩前**的连击数 —— 今天这一钩算进明天。
 *
 * ⚠️ 未实现的约束：`DailyDefinition.window`（如"睡够 7 小时"限定 05:00–11:00 打钩）
 *    目前**不拦截**。硬拦需要 UI 先能解释清楚"为什么现在点不了"，
 *    否则在玩家眼里就是按钮坏了。暂由面板展示成提示，是否硬执行待 PO 裁定。
 */
export const checkDaily: CheckDaily = (state, dailyId, now) => {
  const def = state.dailies.definitions.find((d) => d.id === dailyId);
  if (!def || !def.enabled) return state;

  const today = localDateKey(now);
  const prevLog = state.dailies.logs[today];
  if (prevLog?.checkedIds.includes(def.id)) return state; // 今天已经打过钩了

  const policy = state.settings.rewardPolicy;
  const streakBonusPct = Math.min(
    def.streak * policy.streakBonusPerDay * 100,
    policy.streakBonusCapPct,
  );
  const grantedExp = Math.round(def.reward.exp * (1 + streakBonusPct / 100));
  const grantedCents = def.reward.vaultUsdCents ?? 0;

  const base = prevLog ?? emptyLog(today);
  const nextLog: DailyLog = {
    ...base,
    checkedIds: [...base.checkedIds, def.id],
    checkedAt: { ...base.checkedAt, [def.id]: iso(now) },
    expEarned: base.expEarned + grantedExp,
    vaultEarned: base.vaultEarned + grantedCents,
    // 这是"该日"的标量，多条日常加成不同时取最高的那条（展示用）
    streakBonusPct: Math.max(base.streakBonusPct, streakBonusPct),
  };

  const streak = def.streak + 1;
  const nextDef: DailyDefinition = {
    ...def,
    streak,
    bestStreak: Math.max(def.bestStreak, streak),
  };

  let next: EarthOnlineState = {
    ...state,
    player: touchPlayer(state.player, today),
    dailies: { ...state.dailies, logs: { ...state.dailies.logs, [today]: nextLog } },
  };
  next = withDaily(next, nextDef);

  // 归属职业线的日常，经验记到那条线上；通用日常（classId 为 null）只进日志
  if (def.classId) {
    const track = next.careers.tracks.find((t) => t.classId === def.classId);
    if (track) {
      const { track: leveled, levelsGained } = grantCareerExp(track, grantedExp);
      next = withTrack(next, {
        ...leveled,
        stats: { ...track.stats, expEarnedTotal: track.stats.expEarnedTotal + grantedExp },
      });
      // 日常也能升级 —— 每天那 90 点是攒出来的，凭什么都算在任务头上
      if (levelsGained > 0) next = { ...next, player: withLevelUpPoints(next.player, levelsGained) };
    }
  }

  return next;
};

/**
 * 新建一条每日任务。
 *
 * 🔴 红线（与每周一致）：**只能由玩家创建**。本函数是那条红线的实现 ——
 *    它是 `dailies.definitions` 唯一的写入点（迁移补空数组不算"创建"）；
 *    将来 AI 推荐走采纳通路（ResolveDailyRecommendation 契约），那是另一扇门。
 *    与 `createWeekly` 互为镜像：改一份就该看一眼另一份。
 *
 * 四个字段的定值理由：
 *   · `targetPerDay: 1` —— 一天一钩（幂等键是当日 checkedIds，见 CheckDaily），表单也不问次数；
 *   · `window: null` —— 时段约束目前只展示、不拦截，先不给创建开这个口子；
 *   · `iconKey: ''` —— Phase 2 的图标/场景锚点，玩家手写的条目暂无图标；
 *   · `penaltyExp` 与周常同款：按 `rewardExp × dailyMissPenaltyMultiplier` 在创建时定格，
 *     之后改政策不影响已创建的条目。
 */
export const createDaily: CreateDaily = (state, input, now) => {
  const title = input.title.trim();
  if (title.length === 0) return state;

  const policy = state.settings.rewardPolicy;
  const exp = Math.max(0, Math.min(Math.round(input.rewardExp), policy.maxExpPerQuest));

  const def: DailyDefinition = {
    // 末尾缀上已有条数：同一毫秒内连建两条时时间戳会撞（人点不了那么快，断言脚本可以）
    id: `d_${now.getTime().toString(36)}_${state.dailies.definitions.length}` as DailyId,
    title,
    origin: 'player_created',
    adoptedFromRecommendationId: null,
    classId: input.classId,
    targetPerDay: 1,
    reward: { exp },
    penaltyExp: Math.round(exp * policy.dailyMissPenaltyMultiplier),
    iconKey: '',
    countsForStreak: true,
    streak: 0,
    bestStreak: 0,
    enabled: true,
    window: null,
    createdAt: iso(now),
    archivedAt: null,
  };

  return {
    ...state,
    dailies: { ...state.dailies, definitions: [...state.dailies.definitions, def] },
  };
};

// ---------------------------------------------------------------------------
// 1.5 每周规程：CheckWeekly / CreateWeekly
//
// 与日常同一套骨架，三处刻意的不一样：
//   · 归属周用 `weekStartKey(localDateKey(now))` —— 与 checkDaily 同口径
//     （打钩落在按下那一刻所在的自然周；跨天/跨周由 runDailyRollover 负责）；
//   · **没有连击加成** —— streakBonusPerDay 是"按天"的刻度，
//     把它外推到周会让一条轻档周常的加成超过重档本身，纯属数值事故；
//   · 奖励目前只发 EXP（创建表单只有三档 EXP）。将来若给周常加金库奖励，
//     要先把 WeeklyLog 补一个 vaultEarned —— 在此之前不给它塞 vault 值。
// ---------------------------------------------------------------------------

export const checkWeekly: CheckWeekly = (state, weeklyId, now) => {
  const def = state.weeklies.definitions.find((w) => w.id === weeklyId);
  if (!def || !def.enabled) return state;

  const weekStart = weekStartKey(localDateKey(now));
  const prevLog = state.weeklies.logs[weekStart];
  if (prevLog?.checkedIds.includes(def.id)) return state; // 这周已经打过钩了

  const grantedExp = def.reward.exp;

  const base = prevLog ?? emptyWeeklyLog(weekStart);
  const nextLog: WeeklyLog = {
    ...base,
    checkedIds: [...base.checkedIds, def.id],
    checkedAt: { ...base.checkedAt, [def.id]: iso(now) },
    expEarned: base.expEarned + grantedExp,
  };

  const streak = def.streak + 1;
  const nextDef: WeeklyDefinition = {
    ...def,
    streak,
    bestStreak: Math.max(def.bestStreak, streak),
  };

  let next: EarthOnlineState = {
    ...state,
    player: touchPlayer(state.player, localDateKey(now)),
    weeklies: {
      ...state.weeklies,
      definitions: state.weeklies.definitions.map((w) => (w.id === nextDef.id ? nextDef : w)),
      logs: { ...state.weeklies.logs, [weekStart]: nextLog },
    },
  };

  // 归属职业线的周常，经验记到那条线上；通用周常只进日志（与 checkDaily 同）
  if (def.classId) {
    const track = next.careers.tracks.find((t) => t.classId === def.classId);
    if (track) {
      const { track: leveled, levelsGained } = grantCareerExp(track, grantedExp);
      next = withTrack(next, {
        ...leveled,
        stats: { ...track.stats, expEarnedTotal: track.stats.expEarnedTotal + grantedExp },
      });
      if (levelsGained > 0) next = { ...next, player: withLevelUpPoints(next.player, levelsGained) };
    }
  }

  return next;
};

/**
 * 新建一条每周任务。
 *
 * 🔴 红线（与日常一致）：**只能由玩家创建**。本函数是那条红线的实现 ——
 *    它是 `weeklies.definitions` 唯一的写入点（迁移补空数组不算"创建"）。
 *    origin 硬编码为 'player_created'，类型上也只允许这一个取值。
 *
 * penaltyExp 在创建时按 `rewardExp × dailyMissPenaltyMultiplier` 定格：
 * 与日常共用同一枚惩罚旋钮，且之后改政策不影响已创建的条目。
 */
export const createWeekly: CreateWeekly = (state, input, now) => {
  const title = input.title.trim();
  if (title.length === 0) return state;

  const policy = state.settings.rewardPolicy;
  const exp = Math.max(0, Math.min(Math.round(input.rewardExp), policy.maxExpPerQuest));

  const def: WeeklyDefinition = {
    // 末尾缀上已有条数：同一毫秒内连建两条时时间戳会撞（人点不了那么快，断言脚本可以）
    id: `w_${now.getTime().toString(36)}_${state.weeklies.definitions.length}` as WeeklyId,
    title,
    origin: 'player_created',
    classId: input.classId,
    reward: { exp },
    penaltyExp: Math.round(exp * policy.dailyMissPenaltyMultiplier),
    countsForStreak: true,
    streak: 0,
    bestStreak: 0,
    enabled: true,
    createdAt: iso(now),
    archivedAt: null,
  };

  return {
    ...state,
    weeklies: { ...state.weeklies, definitions: [...state.weeklies.definitions, def] },
  };
};

// ---------------------------------------------------------------------------
// 1.6 属性分配：SpendAttributePoint
// ---------------------------------------------------------------------------

/**
 * 把一点待分配属性点花在某一维上 —— 属性增长的**唯一**出口。
 *
 * PO 裁定的三件事都在这里体现：
 *   · 任务只记账不涨点，所以这是 attributes 字段唯一的 +1 来源；
 *   · **不设撤销** —— 每次点击都是玩家的一次决定，会留痕（questId = null 的
 *     AttributeDelta 行，reason 记「手动分配」），但点出去就不回来；
 *   · 池里没有点时返回原对象（引用相等），调用方拿它当"什么都没发生"。
 */
export const spendAttributePoint: SpendAttributePoint = (state, key, now) => {
  if (state.player.freeAttributePoints <= 0) return state;

  const entry: AttributeDelta = {
    key,
    delta: 1,
    reason: '手动分配',
    ts: iso(now),
    questId: null,
  };

  return {
    ...state,
    player: {
      ...pushAttributeHistory(state.player, [entry]),
      attributes: { ...state.player.attributes, [key]: state.player.attributes[key] + 1 },
      freeAttributePoints: state.player.freeAttributePoints - 1,
    },
  };
};

// ---------------------------------------------------------------------------
// 2. 任务流转：StartQuest / OpenTurnIn / CompleteQuest
// ---------------------------------------------------------------------------

/** 同链之外的前置是否都已完成（契约见 ClaimQuest 的说明） */
const prerequisitesMet = (state: EarthOnlineState, quest: Quest): boolean =>
  quest.prerequisiteQuestIds.every((id) => state.quests.byId[id]?.status === 'completed');

/** 开始执行：claimed -> active */
export const startQuest: StartQuest = (state, questId, now) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'claimed') return state;
  if (!prerequisitesMet(state, quest)) return state;

  return withQuest(state, { ...quest, status: 'active', startedAt: iso(now) });
};

/**
 * 领取任务：offered -> claimed。
 *
 * 前置门控在这里**再拦一次**，而不是只在界面上禁用按钮：
 * UI 的 `disabled` 是给人看的，状态机不该依赖它。
 * 契约要求"前置未完成则返回原状态"（types/state.ts 的 ClaimQuest 注释），
 * 所以这里既不抛错也不写痕迹 —— 界面自己有办法从 prerequisitesMet 推出原因。
 */
export const claimQuest: ClaimQuest = (state, questId, now) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'offered') return state;
  if (!prerequisitesMet(state, quest)) return state;

  return withQuest(state, { ...quest, status: 'claimed', claimedAt: iso(now) });
};

/**
 * 逐条审核草稿：draft -> offered（通过）或 draft -> rejected（打回）。
 *
 * 三条刻意的设计：
 *   ① **打回不删任务**。任务本身留在存档里（`status: 'rejected'`），
 *      这个痕迹就是给下一次生成的偏好信号（契约原话："痕迹保留，作为 AI 偏好信号"）。
 *   ② **打回要把它从链里剔出去**。链内的成员是线性前置的（第 N 步以第 N−1 步为前置），
 *      所以只把状态改成 rejected 是不够的：那条永远完不成，后面每一步都会
 *      卡在一个永远满足不了的前置上，整条链从此作废。契约要求的"不阻塞"，
 *      必须落到**数据上**才算数 —— 摘掉 questIds 里的它，
 *      再摘掉其它成员指向它的 prerequisiteQuestIds。
 *   ③ 链条数不重排。留下的成员仍显示原来的「第 2/3 步」——
 *      编号里的那个缺口，正是"这里被砍掉一步"的可见痕迹。
 *      重排成「第 1/2 步」会让这段历史凭空消失。
 */
export const reviewQuestDraft: ReviewQuestDraft = (state, questId, decision, now) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'draft') return state;

  const next = withQuest(state, {
    ...quest,
    status: decision === 'approve' ? 'offered' : 'rejected',
  });

  const chainId = quest.chain?.chainId;
  if (!chainId) return next;

  const chain = next.quests.chains[chainId];
  if (!chain) return next;

  // ---- 打回：从链里剔除，并解开别人对它的前置依赖 ----
  if (decision === 'reject') {
    const byId = { ...next.quests.byId };
    for (const id of chain.questIds) {
      const member = byId[id];
      if (!member || !member.prerequisiteQuestIds.includes(quest.id)) continue;
      byId[id] = { ...member, prerequisiteQuestIds: member.prerequisiteQuestIds.filter((p) => p !== quest.id) };
    }
    const remaining = chain.questIds.filter((id) => id !== quest.id);
    const resolved = remaining.every((id) => byId[id]?.status !== 'draft');

    return {
      ...next,
      quests: {
        ...next.quests,
        byId,
        chains: {
          ...next.quests.chains,
          [chainId]: {
            ...chain,
            questIds: remaining,
            // 剩下的成员全部 resolve 了才算审核结束；全被打回时 remaining 为空，也算结束
            review: chain.review.reviewedAt === null && resolved
              ? { ...chain.review, reviewedAt: iso(now) }
              : chain.review,
          },
        },
      },
    };
  }

  // ---- 通过：只是状态变了，链结构不动 ----
  if (chain.review.reviewedAt !== null) return next;

  const allResolved = chain.questIds.every((id) => next.quests.byId[id]?.status !== 'draft');
  if (!allResolved) return next;

  return {
    ...next,
    quests: {
      ...next.quests,
      chains: { ...next.quests.chains, [chainId]: { ...chain, review: { ...chain.review, reviewedAt: iso(now) } } },
    },
  };
};

/**
 * 从一句灵感铸造一条链（Spark Box）—— 非日常任务的唯一入口。
 *
 * 产出**全部落在 `draft`**：铸造 ≠ 生效。玩家还得逐条过目（reviewQuestDraft），
 * 通过了才进得了悬赏板。这条规则没有例外，包括玩家自己写的灵感 ——
 * 因为 AI 生成的东西在玩家点头之前，本来就不该拥有任何效力。
 *
 * 🔻 Phase 4 换真身时，改的只有 `mockForge` 这一行调用。
 *    `buildQuests`（草稿 → 存档事实）与下面的落库逻辑一个字都不用动。
 */
export const generateQuestChain: GenerateQuestChain = (state, input, now) => {
  const idea = input.idea.trim();
  if (idea.length === 0) return state;

  const existingTitles = state.quests.order
    .map((id) => state.quests.byId[id]?.title)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  // —— Phase 4 接缝 ——
  // 外壳递进来的就直接用；没递（老调用方、断言脚本）就走替身，行为一字不变。
  // 这条 `??` 就是"函数式核心 / 异步外壳"那道分界线在代码里的样子：
  // 上面怎么等、怎么校验、怎么擦，这里一个字都不关心。
  const forged =
    input.forged ??
    mockForge({
      idea,
      classId: input.classId,
      deepDeliberation: input.deepDeliberation,
      existingTitles,
    });

  const chainId = `ch_${now.getTime().toString(36)}` as QuestChain['id'];
  const quests = buildQuests({
    drafts: forged.drafts,
    chain: { id: chainId, title: forged.chainTitle },
    classId: forged.classId,
    agentId: ownerAgentIdFor(state, forged.classId),
    sourceIdea: idea,
    reviewed: input.deepDeliberation,
    reviewerNote: forged.reviewerNote,
    now,
  });

  const chain: QuestChain = {
    id: chainId,
    title: forged.chainTitle,
    rationale: forged.rationale,
    classId: forged.classId,
    questIds: quests.map((q) => q.id),
    linkedGoalIds: [...new Set(quests.flatMap((q) => q.linkedGoalIds))],
    createdAt: iso(now),
    review: {
      playerNote: null,
      regenerationCount: 0,
      rerouteCount: 0,
      // 刚铸出来，一条都还没审
      reviewedAt: null,
    },
    completed: false,
  };

  const byId = { ...state.quests.byId };
  for (const q of quests) byId[q.id] = q;

  const trackIdx = state.careers.tracks.findIndex((t) => t.classId === forged.classId);

  return {
    ...state,
    quests: {
      ...state.quests,
      // 新任务排在末尾：order 是展示顺序，插队会让手上正在做的事突然移位
      order: [...state.quests.order, ...quests.map((q) => q.id)],
      byId,
      chains: { ...state.quests.chains, [chainId]: chain },
    },
    careers:
      trackIdx === -1
        ? state.careers
        : {
            ...state.careers,
            tracks: state.careers.tracks.map((t, i) =>
              i === trackIdx ? { ...t, chainIds: [...t.chainIds, chainId] } : t,
            ),
          },
  };
};

/**
 * 点击完成：active -> turn_in_pending。
 *
 * 状态**先进** turn_in_pending，结算面板随后弹出；
 * 这样中途刷新页面，任务仍停在待结算 —— 玩家的"我已经做完了"不会被吞掉。
 */
export const openTurnIn: OpenTurnIn = (state, questId, now) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'active') return state;

  return withQuest(state, { ...quest, status: 'turn_in_pending', turnInOpenedAt: iso(now) });
};

/**
 * 绑定联系人的任务完成后，把"这件事和 TA 有关"落进关系账本。
 *
 * 三条口径：
 *   · channel 记 `'other'` —— 它不一定真的发生了"沟通"（可能是为对方做了
 *     一件事），硬塞进 wechat/meeting 里都是编造；
 *   · delta 记 {warmth:2, trust:2}，并把同样的数加进 dimensions（clamp 0..100），
 *     与 mock 里手写互动的口径一致 —— 微升，不是刷分；
 *   · `currentGrade` **不重算** —— 全项目没有 grade 重算公式（types/network.ts
 *     里评级是快照），重算留到 Phase 5。这里只动四维原始值。
 */
const CONTACT_QUEST_DELTA = { warmth: 2, trust: 2 } as const;

const applyQuestInteractions = (network: NetworkState, quest: Quest, now: Date): NetworkState => {
  const ts = iso(now);
  const localDate = localDateKey(now);
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));

  let touched = false;
  const contacts = network.contacts.map((c) => {
    if (!quest.linkedContactIds.includes(c.id)) return c;
    touched = true;

    const interaction: Interaction = {
      id: `it_${now.getTime().toString(36)}_${c.interactions.length}` as Interaction['id'],
      contactId: c.id,
      ts,
      localDate,
      channel: 'other',
      summary: `完成了「${quest.title}」`,
      sentiment: 'positive',
      delta: { ...CONTACT_QUEST_DELTA },
      initiatedByMe: true,
      followUpAt: null,
      followUpNote: null,
      questId: quest.id,
    };

    return {
      ...c,
      dimensions: {
        ...c.dimensions,
        warmth: clamp(c.dimensions.warmth + CONTACT_QUEST_DELTA.warmth),
        trust: clamp(c.dimensions.trust + CONTACT_QUEST_DELTA.trust),
      },
      interactions: [...c.interactions, interaction],
      lastContactAt: ts,
      nextTouchAt: new Date(now.getTime() + c.contactCadenceDays * 86_400_000).toISOString(),
      interactionCount: c.interactionCount + 1,
    };
  });

  return touched ? { ...network, contacts } : network;
};

/**
 * 确认结算：turn_in_pending -> completed。
 *
 * 加成走**两步判定**（types/state.ts 的 CompleteQuest 注释）：
 *   ① 没写复盘 → 连 Arbiter 都不调用，bonusPct 直接 0；
 *   ② 写了复盘 → 拿质量档位向 `alignBonusPct` 对齐，**客户端说了算**。
 *      Arbiter 给的原始数值只是"建议"，越界或与档位不符时一律以
 *      catalog/policy.ts 的档位值为准（AI 的数值幻觉破坏不了经济系统）。
 */
export const completeQuest: CompleteQuest = (state, questId, input, now) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'turn_in_pending') return state;

  const reflection = input.reflection.trim();
  const verdict = readVerdict(input.verdict);
  const quality: ReflectionQuality = verdict?.quality ?? (reflection ? 'solid' : 'baseline');
  const bonusPct = reflection ? alignBonusPct(input.bonusPct, quality, quest.difficulty) : 0;

  // 最终奖励：基础奖励按 bonusPct 放大。整数美分，不做浮点持久化。
  const scale = (n: number): number => Math.round(n * (1 + bonusPct / 100));
  const final: RewardBundle = { exp: scale(quest.reward.exp) };
  if (quest.reward.vaultUsdCents !== undefined) final.vaultUsdCents = scale(quest.reward.vaultUsdCents);
  if (quest.reward.attributePoints) final.attributePoints = quest.reward.attributePoints;
  if (quest.reward.itemIds) final.itemIds = quest.reward.itemIds;

  const grant: RewardGrant = {
    base: quest.reward,
    bonusPct,
    final,
    grantedAt: iso(now),
    bonusReason:
      bonusPct > 0
        ? (input.bonusReason ?? verdict?.comment ?? `复盘质量判定为 ${quality}（难度 ${quest.difficulty} → ${bonusPct}%）`)
        : null,
  };

  const today = localDateKey(now);
  let next: EarthOnlineState = state;

  // ---- 成功日记：只有真的写了复盘才落条目（空复盘不是"写了一条空日记"）----
  let journalEntryId: string | null = null;
  if (reflection) {
    journalEntryId = nextJournalId(next.journal.entries);
    const entry: JournalEntry = {
      id: journalEntryId as JournalEntry['id'],
      questId: quest.id,
      questTitle: quest.title,
      classId: quest.classId,
      entryText: reflection,
      addenda: [],
      verdict,
      // Arbiter 没给出可用判定时降级：奖励照发，但要留下"这次没有判定"的痕迹
      arbiterFailed: verdict === null,
      emotions: readEmotions(input.verdict),
      selfRatedDifficulty: null,
      attributeKeys: quest.linkedAttributes,
      localDate: today,
      createdAt: iso(now),
      starred: false,
      consumedByMemoryDigest: false,
    };

    const prev = next.journal;
    const n = prev.stats.totalEntries;
    const newer = prev.entries[0];
    const writingStreak =
      newer === undefined
        ? 1
        : newer.localDate === today
          ? Math.max(prev.stats.currentWritingStreakDays, 1)
          : dayGap(newer.localDate, today) === 1
            ? prev.stats.currentWritingStreakDays + 1
            : 1;

    next = {
      ...next,
      journal: {
        ...prev,
        entries: [entry, ...prev.entries], // 最新的在最前
        stats: {
          totalEntries: n + 1,
          totalReflectionWords: prev.stats.totalReflectionWords + charCount(reflection),
          totalBonusExp: prev.stats.totalBonusExp + (final.exp - quest.reward.exp),
          averageBonusPct:
            n === 0 ? bonusPct : Math.round(((prev.stats.averageBonusPct * n + bonusPct) / (n + 1)) * 10) / 10,
          currentWritingStreakDays: writingStreak,
          bestWritingStreakDays: Math.max(prev.stats.bestWritingStreakDays, writingStreak),
        },
      },
    };
  }

  // ---- 静默里程碑：进隐藏目标，UI 永不读取 ----
  if (verdict && verdict.milestoneTags.length > 0) {
    next = { ...next, evolution: ingestMilestones(next.evolution, verdict.milestoneTags, quest.id, now, today, 0.8) };
  }

  // ---- 金库：有美金奖励才落账（当前任务大多只给 EXP）----
  if (final.vaultUsdCents !== undefined && final.vaultUsdCents > 0) {
    const cents: UsdCents = final.vaultUsdCents;
    next = {
      ...next,
      vault: {
        ...next.vault,
        cash: next.vault.cash + cents,
        transactions: [
          ...next.vault.transactions,
          {
            id: `txn_quest_${quest.id}` as (typeof next.vault.transactions)[number]['id'],
            ts: iso(now),
            localDate: today,
            type: 'goal_grant',
            amount: cents,
            assetClass: 'cash',
            questId: quest.id,
            category: '任务奖励',
            note: `${quest.title}${bonusPct > 0 ? `（含复盘加成 ${bonusPct}%）` : ''}`,
          },
        ],
      },
    };
  }

  // ---- 属性点：直接进"待分配池"，分配权始终在玩家手上 ----
  if (final.attributePoints) {
    const granted = Object.values(final.attributePoints).reduce((sum, v) => sum + (v ?? 0), 0);
    if (granted > 0) {
      next = {
        ...next,
        player: { ...next.player, freeAttributePoints: next.player.freeAttributePoints + granted },
      };
    }
  }

  // ---- 属性记账：完成一条任务，只留痕"它练到了哪几维"，**不涨点**（PO 裁定）----
  // 同一个 ts + 同一个 questId 的多条记录在 selectors.recentAttributeNotes 里
  // 会折叠成一行 —— 一条任务练三维修，是一个人做的一件事，不该占三行时间线。
  if (quest.linkedAttributes.length > 0) {
    const ts = iso(now);
    next = {
      ...next,
      player: pushAttributeHistory(
        next.player,
        quest.linkedAttributes.map((key) => ({
          key,
          delta: 0,
          reason: quest.title,
          ts,
          questId: quest.id,
        })),
      ),
    };
  }

  // ---- 任务落定 + 职业统计 ----
  const completedQuest: Quest = {
    ...quest,
    status: 'completed',
    completedAt: iso(now),
    grant,
    journalEntryId,
  };
  next = withQuest(next, completedQuest);
  next = { ...next, player: touchPlayer(next.player, today) };

  if (quest.classId) {
    const track = next.careers.tracks.find((t) => t.classId === quest.classId);
    if (track) {
      const { track: leveled, levelsGained } = grantCareerExp(track, final.exp);
      next = withTrack(next, {
        ...leveled,
        stats: {
          ...track.stats,
          questsCompleted: track.stats.questsCompleted + 1,
          expEarnedTotal: track.stats.expEarnedTotal + final.exp,
          vaultEarnedTotal: track.stats.vaultEarnedTotal + (final.vaultUsdCents ?? 0),
          firstQuestAt: track.stats.firstQuestAt ?? iso(now),
          lastQuestAt: iso(now),
        },
      });
      if (levelsGained > 0) next = { ...next, player: withLevelUpPoints(next.player, levelsGained) };
    }
  }

  // ---- 链：成员全部完成则标记整链完成 ----
  const chainId = quest.chain?.chainId;
  if (chainId) {
    const chain = next.quests.chains[chainId];
    if (chain && !chain.completed) {
      const allDone = chain.questIds.every((id) => next.quests.byId[id]?.status === 'completed');
      if (allDone) {
        next = {
          ...next,
          quests: {
            ...next.quests,
            chains: { ...next.quests.chains, [chainId]: { ...chain, completed: true } },
          },
        };
      }
    }
  }

  // ---- 关系：绑定联系人的任务完成后，在该联系人名下落一条互动 ----
  // 这是"任务 → 关系"唯一自动发生的联动。温度/信任微升，构成闭环：
  // 从卡片派生任务 → 做完 → 关系账本上多一条事实。
  if (quest.linkedContactIds.length > 0) {
    next = { ...next, network: applyQuestInteractions(next.network, quest, now) };
  }

  return next;
};

// ---------------------------------------------------------------------------
// 4. 关系：AskNetworkAdvisor
// ---------------------------------------------------------------------------

/**
 * 向社交智囊求助一次。
 *
 * 三条刻意的设计：
 *
 * ① **建议入库，不是弹窗。** 写进 `contact.adviceHistory` 之后，
 *    玩家下周回来还能看到"我当时问了什么、它说了什么、我做了没有"。
 *    `helpful` / `executed` 双双留 null —— 这两个字段是留给玩家自己填的，
 *    AI 不得替玩家判断它自己有没有用。
 *
 * ② **找不到人时返回原对象**（引用相等），而不是造一个空记录。
 *    调用方拿这个当"什么都没发生"的信号。
 *
 * ③ **`situation` 允许为空。** 空不是错误路径：多数时候玩家自己也不知道
 *    该怎么说，那本身就是一种处境，智囊应当只凭档案说话。
 *
 * 🔻 Phase 4：下面这一行换成真实的 Network Advisor Agent 调用。
 */
export const askNetworkAdvisor: AskNetworkAdvisor = (state, contactId, situation, now, forgedDraft) => {
  const idx = state.network.contacts.findIndex((c) => c.id === contactId);
  if (idx === -1) return state;

  const contact = state.network.contacts[idx]!;
  const draft = forgedDraft ?? mockNetworkAdvisor({ contact, situation, now });
  const askedAt = iso(now);

  const record: NetworkAdviceRecord = {
    // 末尾缀上已有条数：时间戳在"同一毫秒内连问两次"时会撞（人是点不了那么快，
    // 但断言脚本可以）。id 是标识不是时间戳，让它唯一是它的本职。
    id: `adv_${now.getTime().toString(36)}_${contact.adviceHistory.length}` as NetworkAdviceRecord['id'],
    contactId: contact.id,
    askedAt,
    situation: situation.trim(),
    agentId: 'agent_network_advisor' as NetworkAdviceRecord['agentId'],
    advice: draft.advice,
    suggestedAction: draft.suggestedAction,
    avoid: draft.avoid,
    principle: draft.principle,
    helpful: null,
    executed: false,
  };

  const nextContact: Contact = {
    ...contact,
    adviceHistory: [...contact.adviceHistory, record],
  };

  const contacts = [...state.network.contacts];
  contacts[idx] = nextContact;

  return { ...state, network: { ...state.network, contacts } };
};

/**
 * 向智囊团求助（全局检索）：输入一件现实里的困境，在**整个通讯录**里
 * 找最接得住这件事的人（0~2 位）。
 *
 * 与 askNetworkAdvisor 并列而不合并：那个问"关于这个人话怎么说"，
 * 入口在联系人卡片上；这个问"有这件事该找谁"，入口在面板顶部。
 * 一个玩家可能先在检索里发现"原来该找林昭"，再点进林昭的卡片问细节 ——
 * 两条记录各自成线，回看时才分得清"我找过谁"和"我问过什么"。
 *
 * ⚠️ 非幂等：每次调用都是一次新的求助。环形保留最近 50 条
 *    （每条含整段报告文本，50 条足够回看，也不会把存档养成大象）。
 * 🔻 Phase 4：mockSocialSolver 一行换成真实调用。
 */
export const consultNetworkSolver: ConsultNetworkSolver = (state, question, now, forgedDraft) => {
  const q = question.trim();
  if (q.length === 0) return state;

  const draft = forgedDraft ?? mockSocialSolver({ contacts: state.network.contacts, question: q, now });
  const record: SolverConsultation = {
    id: `sol_${now.getTime().toString(36)}_${state.network.solverLog.length}` as SolverConsultation['id'],
    askedAt: iso(now),
    question: q,
    agentId: 'agent_network_advisor' as SolverConsultation['agentId'],
    report: draft.report,
    recommendations: draft.recommendations,
    cautions: draft.cautions,
    principle: draft.principle,
  };

  const merged = [...state.network.solverLog, record];
  const solverLog = merged.length > 50 ? merged.slice(merged.length - 50) : merged;

  return { ...state, network: { ...state.network, solverLog } };
};

/**
 * 手动把一个人记进通讯录 —— 全项目唯一由玩家亲手新增联系人的入口。
 *
 * ---------------------------------------------------------------------------
 * 这条函数真正难的地方，是**没写出来的那些赋值**（见 types/state.ts 的契约注释）
 * ---------------------------------------------------------------------------
 * 一个刚被记下来的人，我们对他没有任何观测。所以：
 *
 *   · `stage: null` —— **等级由玩家自己定**（卡片上那一栏），我们不替他挑一个。
 *     它会进 AI 的上下文（"该说什么不该说什么"），编一个值出来，
 *     等于让一句我们写的话冒充一件玩家知道的事。
 *   · `currentGrade: null` —— 观测值缺席时就是缺席。挑错的代价不只是卡片上多一个字母：
 *     它曾经还会被 `networkSummary` 拿去判「核心圈」（现已随该功能撤下）。
 *   · 四维全 0、`gradeHistory` 空、`interactions` 空、`interactionCount` 0。
 *   · `lastContactAt` / `nextTouchAt` 全 null：他还没进过你的日程 ——
 *     这两本账只记事实，而关于他，此刻还没有事实可记。
 *
 * 唯一由玩家给定的是 `relationType`（分类）与那段可选的 `note` ——
 * 两者都是"玩家知道的事"，不是观测。
 *
 * 非幂等：同名同类型连加两次就是两个人 —— 重名是现实，不是错误，
 * 我们没有任何身份信息可以用来判重（这恰恰是这份名单与通讯录 App 的区别）。
 * 名字为空/全空白时返回**原对象**（引用相等），调用方据此判断"什么都没发生"。
 */
export const createContact: CreateContact = (state, input, now) => {
  const name = input.name.trim();
  if (name.length === 0) return state;

  const trimmedNote = input.note.trim();
  const ts = iso(now);
  // 末尾缀上名单长度：时间戳在"同一毫秒内连加两个"时会撞（人手点不了那么快，
  // 但断言脚本可以）。id 是标识不是时间戳，让它唯一是它的本职 ——
  // 与 askNetworkAdvisor 的 adv_ 同一套写法。
  const id = `c_${now.getTime().toString(36)}_${state.network.contacts.length}` as Contact['id'];

  const contact: Contact = {
    id,
    name,
    alias: null,
    avatarUrl: null,
    relationType: input.relationType,
    stage: null,
    profile: {
      org: null,
      role: null,
      field: null,
      metContext: null,
      metAt: null,
      location: null,
      commonGround: [],
    },
    dimensions: { warmth: 0, trust: 0, influence: 0, reciprocity: 0 },
    gradeHistory: [],
    currentGrade: null,
    // 空串与全空白一律落成 null：「没写」不是一种内容，但它也不是错误
    note: trimmedNote.length > 0 ? trimmedNote : null,
    whyItMatters: [],
    boundaries: [],
    preferences: [],
    openCommitments: [],
    interactions: [],
    contactCadenceDays: DEFAULT_CONTACT_CADENCE_DAYS,
    lastContactAt: null,
    nextTouchAt: null,
    interactionCount: 0,
    adviceHistory: [],
    tags: [],
    starred: false,
    archivedAt: null,
    createdAt: ts,
  };

  return {
    ...state,
    network: { ...state.network, contacts: [...state.network.contacts, contact] },
  };
};

/**
 * 给一段关系定一条等级。
 *
 * 它**不重算任何东西**：等级是玩家的判断，不是从四维推出来的观测值 ——
 * 所以它不碰 `dimensions`、不碰 `currentGrade`、不碰 `gradeHistory`。
 * "定等级顺手把评级也刷新一下"是一个很自然的想法，但那会让两栏互相污染：
 * 玩家把一个人定成「长期同行」，卡片上却因为这个动作变成了另一个字母。
 *
 * 也不写时间戳：改主意不是一次事件（见 SetContactStage 的契约注释）。
 */
export const setContactStage: SetContactStage = (state, contactId, stage) => {
  const current = state.network.contacts.find((c) => c.id === contactId);
  // 人不在名单上 / 定的就是原来那条 —— 两种都返回原对象：
  // 无事发生就绝不产生新引用（store 靠引用相等判断"要不要写盘"）
  if (!current || current.stage === stage) return state;

  return {
    ...state,
    network: {
      ...state.network,
      contacts: state.network.contacts.map((c) => (c.id === contactId ? { ...c, stage } : c)),
    },
  };
};

/**
 * 从联系人卡片派生一条行动任务，**直接写入「进行中」**。
 *
 * 为什么绕开审核门控（draft → offered → claimed）：那道闸门是给 AI
 * 生成物设的，防的是"系统替你做决定"；而这条任务出自玩家亲手的选择，
 * 没有需要防的东西。所以它一步到位：status 直接是 'active'。
 *
 * 完成后的联动在 completeQuest 里：沿 linkedContactIds 落一条互动
 * （温度/信任 +2）。这是一条完整的闭环 —— 关系读得出"我为这段关系做过什么"。
 */
export const createContactQuest: CreateContactQuest = (state, contactId, input, now) => {
  const contact = state.network.contacts.find((c) => c.id === contactId);
  if (!contact) return state;
  const title = input.title.trim();
  if (title.length === 0) return state;

  const ts = iso(now);
  const who = contact.alias ?? contact.name;
  const id = `q_social_${now.getTime().toString(36)}_${state.quests.order.length}` as QuestId;

  const quest: Quest = {
    id,
    classId: null,
    type: 'side',
    status: 'active',
    title,
    subtitle: `这件事做完，你和${who}之间会多一条具体的记录。`,
    narrative: `有些关系不需要刻意维护，需要的是你手里确实有一件和${who}有关的事 —— 你已经把它写下来了。`,
    objective: title,
    difficulty: 2,
    effortEstimate: { unit: 'min', value: 30 },
    reward: { exp: 120 },
    outcomeHints: [],
    linkedGoalIds: [],
    linkedAttributes: [],
    linkedContactIds: [contact.id],
    prerequisiteQuestIds: [],
    dueHint: null,
    proof: null,
    tags: ['社交', '派生'],
    chain: null,
    origin: {
      // 它不是 AI 生成的草稿：sourceIdea 记玩家写下的那句话，agentId 留 null
      agentId: null,
      sourceIdea: title,
      generatedAt: ts,
      reviewed: false,
      reviewerNote: null,
      // 它出自玩家自己的决定，不是从哪一步改出来的
      reroutedFrom: null,
      rerouteHistory: [],
    },
    grant: null,
    journalEntryId: null,
    createdAt: ts,
    claimedAt: ts,
    startedAt: ts,
    turnInOpenedAt: null,
    completedAt: null,
    actualEffortMinutes: null,
  };

  return {
    ...state,
    quests: {
      ...state.quests,
      order: [...state.quests.order, id],
      byId: { ...state.quests.byId, [id]: quest },
    },
  };
};

/**
 * 手写一条任务时的"工时预算"：难度只给星级，工时由这张小表推导。
 *
 * 星级是给玩家的重量感，工时是落在卡片上的"大概要花多久"——
 * 两个都不精确，也都不该让玩家自己填。数字取整不取奇：
 * 一个工作日 = 2h（晚上+碎片），一天 = 6h，都不是字面意义。
 */
const EFFORT_BY_DIFFICULTY: Record<Difficulty, { unit: 'min' | 'hour' | 'day'; value: number }> = {
  1: { unit: 'min', value: 30 },
  2: { unit: 'hour', value: 2 },
  3: { unit: 'hour', value: 6 },
  4: { unit: 'day', value: 2 },
  5: { unit: 'day', value: 7 },
};

/**
 * 玩家亲手写一条任务，**直接写入「进行中」**。
 *
 * 与 createContactQuest 同一条理由：审核闸门（draft → offered）是给
 * AI 生成物设的，防的是"系统替你做决定"；这一条出自玩家自己的手笔 ——
 * 没有需要防的东西。所以它一步到位：status 直接是 'active'，
 * claimedAt / startedAt 都盖在建档这一刻，没有领取与开始两道仪式。
 *
 * 与「从灵感铸链」的分工：那条链由 AI 拆成多步、全部落 draft 等裁决；
 * 这一条是玩家已经想好的一件事，系统只负责把它记下来。
 */
export const createManualQuest: CreateManualQuest = (state, input, now) => {
  const title = input.title.trim();
  if (title.length === 0) return state;

  const policy = state.settings.rewardPolicy;
  const exp = Math.max(0, Math.min(Math.round(input.rewardExp), policy.maxExpPerQuest));
  const difficulty = Math.min(5, Math.max(1, Math.round(input.difficulty))) as Difficulty;

  const ts = iso(now);
  const id = `q_own_${now.getTime().toString(36)}_${state.quests.order.length}` as QuestId;

  const quest: Quest = {
    id,
    classId: input.classId,
    type: 'side',
    status: 'active',
    title,
    subtitle: '自己写下来的一条 —— 做完它，档案里就多一段只属于你的记录。',
    narrative:
      '这件事没有什么名目，只因为你想做。你把它写了下来，它就不再只是一闪而过的念头 —— 接下来，只剩下做。',
    objective: title,
    difficulty,
    effortEstimate: EFFORT_BY_DIFFICULTY[difficulty],
    reward: { exp },
    outcomeHints: [],
    linkedGoalIds: [],
    linkedAttributes: [],
    linkedContactIds: [],
    prerequisiteQuestIds: [],
    dueHint: null,
    proof: null,
    tags: ['自写'],
    chain: null,
    origin: {
      // 它不是 AI 生成的稿子：sourceIdea 记玩家写下的那句话，agentId 留 null
      // （与 createContactQuest 同一套记号）
      agentId: null,
      sourceIdea: title,
      generatedAt: ts,
      reviewed: false,
      reviewerNote: null,
      reroutedFrom: null,
      rerouteHistory: [],
    },
    grant: null,
    journalEntryId: null,
    createdAt: ts,
    claimedAt: ts,
    startedAt: ts,
    turnInOpenedAt: null,
    completedAt: null,
    actualEffortMinutes: null,
  };

  return {
    ...state,
    quests: {
      ...state.quests,
      order: [...state.quests.order, id],
      byId: { ...state.quests.byId, [id]: quest },
    },
  };
};

// ---------------------------------------------------------------------------
// 5. 跨天结算：RunDailyRollover
// ---------------------------------------------------------------------------

/**
 * 跨天结算。
 *
 * 幂等键是 `dailies.lastSettledLocalDate`：**「已经结算完毕的最后一天」**。
 * 判断式是 `刚结束的那一天 > lastSettledLocalDate`，成立才结算 ——
 * 于是同一天重复调用（挂载一次 + 定时器一次 + 切回前台一次）只会生效一次。
 *
 * ---------------------------------------------------------------------------
 * 三条刻意的设计
 * ---------------------------------------------------------------------------
 * ① **只结算"刚结束的那一天"，一次，不补算。**
 *    如果玩家一周没打开，中间会有 5 个整天没结算。逐天补算意味着
 *    ×1.5 的惩罚连乘 5 次 —— 那不是提醒，那是催债，而且是向一个
 *    **刚刚回来的人**催债。连击本来就会全部归零，那已经是这件事真正的代价了。
 *    所以：结算最近结束的那一天，然后把 lastSettled 直接推到那里；
 *    中间那些没有记录的日子，本来就没有 DailyLog，不留假账。
 *
 * ② **只罚那一天"已经存在"的日常。**
 *    今天刚采纳的日常，不该被判昨天漏打 —— 那会让玩家觉得自己被偷袭。
 *    判定用 `createdAt` 与该日结束时刻比。
 *
 * ③ **扣分是精确的，不做 0 下限。**
 *    `exp` 允许被扣成负数：那正是"漏一天补一天半"的字面意思 ——
 *    你今天得先把昨天欠的补上。做成 0 下限会让惩罚在最需要它的时刻
 *    （exp 本来就见底的人）**完全失效**，那才是最坏的一种"温柔"。
 *    进度条侧 `expRatio` 会把负数钳成 0，界面上不会出现负的进度条。
 */
export const runDailyRollover: RunDailyRollover = (state, now) => {
  const activeDay = activeDayKey(now, state.settings.dayRolloverHour);
  const justEnded = shiftDayKey(activeDay, -1);

  let next = state;
  let result: RolloverResult | null = null;

  // ---- 每日部分：已经结过 / 还没结束 —— 什么都不做（但不再早退，周结算还等着）----
  if (justEnded > state.dailies.lastSettledLocalDate) {
    const log = state.dailies.logs[justEnded];
    const checked = new Set<DailyId>(log?.checkedIds ?? []);
    const cutoff = endOfDay(justEnded);
    const eligible = state.dailies.definitions.filter(
      (d) => d.enabled && new Date(d.createdAt).getTime() <= cutoff.getTime(),
    );
    const missedDefs = eligible.filter((d) => !checked.has(d.id));

    const missed = missedDefs.map((d) => ({ id: d.id, title: d.title, penaltyExp: d.penaltyExp }));
    const totalExpPenalty = missed.reduce((sum, m) => sum + m.penaltyExp, 0);

    // 连击：漏打归零（bestStreak 永久保留）；没漏的保住 —— 正面反馈优先展示
    const missedIds = new Set(missedDefs.map((d) => d.id));
    const brokenStreaks = missedDefs
      .filter((d) => d.countsForStreak && d.streak > 0)
      .map((d) => ({ id: d.id, title: d.title, streakLost: d.streak }));
    const keptStreakCount = eligible.filter((d) => !missedIds.has(d.id) && d.countsForStreak).length;

    // 扣 EXP：只扣归属职业线的那部分（通用日常本来就不进任何职业线，见 checkDaily）
    let careers = state.careers;
    for (const def of missedDefs) {
      if (!def.classId) continue;
      const idx = careers.tracks.findIndex((t) => t.classId === def.classId);
      if (idx === -1) continue;
      const tracks = [...careers.tracks];
      const track = tracks[idx]!;
      tracks[idx] = { ...track, exp: track.exp - def.penaltyExp };
      careers = { ...careers, tracks };
    }

    const nextDefs = state.dailies.definitions.map((d) =>
      missedIds.has(d.id) && d.streak > 0 ? { ...d, streak: 0 } : d,
    );

    // 把结算结果写回那一天自己的记录里：账本要能自证，
    // 而不是只有 lastSettledLocalDate 一个人知道发生了什么
    const settledLog: DailyLog = {
      ...(log ?? emptyLog(justEnded)),
      missedIds: missed.map((m) => m.id),
      expPenalized: totalExpPenalty,
    };

    result = {
      fromLocalDate: justEnded,
      toLocalDate: activeDay,
      missed,
      totalExpPenalty,
      brokenStreaks,
      keptStreakCount,
      // 「该日净变化」= 那天赚到的 − 那天漏掉的。
      // 这个数常常仍然是正的，而这句话正是那段提示要说的：
      // 你漏了一件事，但那天你并没有白过。
      netExp: (log?.expEarned ?? 0) - totalExpPenalty,
    };

    next = {
      ...next,
      careers,
      dailies: {
        ...next.dailies,
        definitions: nextDefs,
        logs: { ...next.dailies.logs, [justEnded]: settledLog },
        lastSettledLocalDate: justEnded,
        pendingRolloverNotice: result,
      },
    };
  }

  // ---- 每周部分：与每日同一时刻发生（周一 01:00 跨天时两张牌一起翻）----
  // 判定式：活跃日所属周的「上一周」是否已经结过。
  // 周一 00:30 时 activeDay 还停在周日 → 上一周 = 更早的周 → 不结；
  // 周一 01:00 之后 activeDay 跨进新周 → 上周被完整锁定，结算。
  // 这正是"每周一 01:00 统一检测"在归属日语义下的精确落点。
  const weekStart = weekStartKey(activeDay);
  const lastFullWeekStart = shiftWeekKey(weekStart, -1);
  if (lastFullWeekStart > next.weeklies.lastSettledWeekStart) {
    next = settleWeek(next, lastFullWeekStart, weekStart);
  }

  return { next, result };
};

/**
 * 结算一个**完整结束的周**（周一 → 周日）。语义与每日结算逐条对齐：
 *
 *   · 幂等键 `weeklies.lastSettledWeekStart`，只结"最近一个完整周"，不补算 ——
 *     三周没打开不会收到三次催债，跟每日那条哲学完全一样；
 *   · 只罚那一周"**整周都已经存在**"的周常：createdAt 晚于该周周一 00:00 的
 *     （那一周里才新建的）不为这一周负责 —— 与日常的 createdAt 判定同源；
 *   · 扣 EXP 只扣归属职业线（通用周常只清零连击，不进任何线）；
 *   · 连击归零、bestStreak 保留；结果写回 WeeklyLog 并挂上 pendingWeeklyNotice。
 *
 * 空周（既没有周常、也没有任何记录）不留空结算、不弹空浮层 ——
 * 只安静地推进幂等键，让下周一从零开始记账。
 */
const settleWeek = (
  state: EarthOnlineState,
  weekStart: DateKey,
  currentWeekStart: DateKey,
): EarthOnlineState => {
  const log = state.weeklies.logs[weekStart];
  if (state.weeklies.definitions.length === 0 && log === undefined) {
    return { ...state, weeklies: { ...state.weeklies, lastSettledWeekStart: weekStart } };
  }

  const checked = new Set<WeeklyId>(log?.checkedIds ?? []);
  const weekStartInstant = new Date(`${weekStart}T00:00:00`).getTime();
  const eligible = state.weeklies.definitions.filter(
    (w) => w.enabled && new Date(w.createdAt).getTime() < weekStartInstant,
  );
  const missedDefs = eligible.filter((w) => !checked.has(w.id));

  const missed = missedDefs.map((w) => ({ id: w.id, title: w.title, penaltyExp: w.penaltyExp }));
  const totalExpPenalty = missed.reduce((sum, m) => sum + m.penaltyExp, 0);

  const missedIds = new Set(missedDefs.map((w) => w.id));
  const brokenStreaks = missedDefs
    .filter((w) => w.countsForStreak && w.streak > 0)
    .map((w) => ({ id: w.id, title: w.title, streakLost: w.streak }));
  const keptStreakCount = eligible.filter((w) => !missedIds.has(w.id) && w.countsForStreak).length;

  let careers = state.careers;
  for (const def of missedDefs) {
    if (!def.classId) continue;
    const idx = careers.tracks.findIndex((t) => t.classId === def.classId);
    if (idx === -1) continue;
    const tracks = [...careers.tracks];
    const track = tracks[idx]!;
    tracks[idx] = { ...track, exp: track.exp - def.penaltyExp };
    careers = { ...careers, tracks };
  }

  const nextDefs = state.weeklies.definitions.map((w) =>
    missedIds.has(w.id) && w.streak > 0 ? { ...w, streak: 0 } : w,
  );

  const settledLog: WeeklyLog = {
    ...(log ?? emptyWeeklyLog(weekStart)),
    missedIds: missed.map((m) => m.id),
    expPenalized: totalExpPenalty,
    settled: true,
  };

  const notice: WeeklyRolloverResult = {
    weekStart,
    weekEnd: shiftDayKey(currentWeekStart, -1),
    completedCount: eligible.filter((w) => checked.has(w.id)).length,
    missed,
    totalExpPenalty,
    brokenStreaks,
    keptStreakCount,
    netExp: (log?.expEarned ?? 0) - totalExpPenalty,
  };

  return {
    ...state,
    careers,
    weeklies: {
      ...state.weeklies,
      definitions: nextDefs,
      logs: { ...state.weeklies.logs, [weekStart]: settledLog },
      lastSettledWeekStart: weekStart,
      pendingWeeklyNotice: notice,
    },
  };
};

/**
 * 玩家看过了跨天提示，把它收起来（每日 + 每周两张牌一起收）。
 *
 * 它不是"确认扣分"—— 分在结算时就扣完了，这一步只是收掉那张卡片。
 * 界面不该把一件已经发生的事包装成需要批准的事。
 * 两张牌共用这一个动作：玩家看到的是"结算"这一件事，而不是两次确认。
 */
export const dismissRolloverNotice = (state: EarthOnlineState): EarthOnlineState => {
  const hasDaily = state.dailies.pendingRolloverNotice !== null;
  const hasWeekly = state.weeklies.pendingWeeklyNotice !== null;
  if (!hasDaily && !hasWeekly) return state;

  return {
    ...state,
    dailies: hasDaily ? { ...state.dailies, pendingRolloverNotice: null } : state.dailies,
    weeklies: hasWeekly ? { ...state.weeklies, pendingWeeklyNotice: null } : state.weeklies,
  };
};

// ===========================================================================
// Phase 3 · 任务链的两个新动作
// ===========================================================================

/** 链内所有成员（含已被打回、已从 questIds 里摘掉的那些） */
const membersOfChain = (state: EarthOnlineState, chainId: string): Quest[] =>
  Object.values(state.quests.byId).filter((q) => q.chain?.chainId === chainId);

/**
 * 找一个成员的后继（链内 index + 1 的那一条）。
 *
 * 刻意**不**用 `chain.questIds[index + 1]` 去取：打回会把成员从 questIds 里摘掉，
 * 数组位置从此与 chain.index 错位，那样取到的会是一个随审核历史漂移的邻居。
 * 按 index 反查则永远指向"链上的下一步"这个**语义**位置。
 */
export const successorOf = (state: EarthOnlineState, chainId: string, index: number): Quest | null =>
  membersOfChain(state, chainId).find(
    (q) => q.chain?.index === index + 1 && q.status !== 'rejected' && q.status !== 'rerouted',
  ) ?? null;

/**
 * 「换个做法」：把某一步重写成一条更可行、但更便宜的做法。
 *
 * 形状 B 的落地（见 docs/phase2/reroute-design.md §3.1）。五步：
 *
 *   ① 只对**链式草稿**开放。reroute 的存在意义是"这一步通不到下一步"，
 *      而单条任务没有下一步 —— 对它，玩家该用的是打回。
 *   ② 额度来自 `ChainReview.rerouteCount`（链级软上限 2 次）。
 *   ③ 让 mockReroute 生成替换件（Phase 4 换成模型，见该文件顶部的删除标记）。
 *      两条红线在那边落地：降难度必降奖励、必带后继的 objective 原文。
 *   ④ 旧任务 `draft -> rerouted` 留档，**不删**。
 *   ⑤ 新任务落回同一条链的同一个 index，仍是 draft —— 它还要过一次审核。
 *
 * ⚠️ 与 mockForge 那一行一样：Phase 4 换真身时改的是 `mockReroute` 这一行调用。
 */
export const rerouteQuestDraft: RerouteQuestDraft = (state, questId, request, now, forgedOutcome) => {
  const quest = state.quests.byId[questId];
  if (!quest || quest.status !== 'draft') return state;

  const membership = quest.chain;
  if (!membership) return state; // ② 单任务没有"下一步"，不适用
  const chainId = membership.chainId;

  const chain = state.quests.chains[chainId];
  if (!chain) return state;
  if (chain.review.rerouteCount >= REROUTE_CHAIN_LIMIT) return state;

  const successor = successorOf(state, chainId, membership.index);
  const asked = request.trim().slice(0, REROUTE_REQUEST_MAX_LEN);
  const outcome =
    forgedOutcome ??
    mockReroute({
      quest,
      successor,
      request: asked.length > 0 ? asked : DEFAULT_REROUTE_REQUEST,
    });

  const record: RerouteRecord = {
    at: iso(now),
    request: asked.length > 0 ? asked : DEFAULT_REROUTE_REQUEST,
    before: { title: quest.title, difficulty: quest.difficulty, exp: quest.reward.exp },
    after: { title: outcome.draft.title, difficulty: outcome.draft.difficulty, exp: outcome.draft.reward.exp },
    rejectedReason: outcome.rejectedReason,
  };

  const [replacement] = buildQuests({
    drafts: [outcome.draft],
    chain: { id: chainId, title: chain.title },
    classId: quest.classId,
    agentId: quest.origin.agentId,
    // 灵感原样继承：替换件仍是同一个人为了同一件事铸出来的那一步
    sourceIdea: quest.origin.sourceIdea ?? record.request,
    reviewed: false,
    reviewerNote: null,
    now,
    indexOffset: membership.index,
    totalOverride: membership.total,
    reroutedFrom: quest.id,
    rerouteHistory: [...quest.origin.rerouteHistory, record],
    // 加盐：替换件与被替换的旧任务共存（旧的留档为 rerouted），不能撞 id
    idSalt: `${chainId}h${chain.review.rerouteCount + 1}`,
  });
  if (!replacement) return state;

  // 前置是"这一步之前的那些步骤"，与做法无关 —— 原样继承。
  // （buildQuests 拿到的 prerequisiteTempIds 是空的：替换件的草稿里没有同批次的兄弟。）
  const newQuest: Quest = { ...replacement, prerequisiteQuestIds: [...quest.prerequisiteQuestIds] };

  const byId: Record<QuestId, Quest> = {
    ...state.quests.byId,
    // 旧任务留在 byId 里，状态改为 rerouted（留档但不参与流转）
    [quest.id]: { ...quest, status: 'rerouted' },
    [newQuest.id]: newQuest,
  };

  // 把其它成员指向旧 id 的前置改成指向新 id —— 否则它们的领取条件永远满足不了。
  for (const member of Object.values(byId)) {
    if (member.id === newQuest.id) continue;
    if (!member.prerequisiteQuestIds.includes(quest.id)) continue;
    byId[member.id] = {
      ...member,
      prerequisiteQuestIds: member.prerequisiteQuestIds.map((p) => (p === quest.id ? newQuest.id : p)),
    };
  }

  const replacedIds = chain.questIds.map((id) => (id === quest.id ? newQuest.id : id));
  const stillHasDraft = replacedIds.some((id) => byId[id]?.status === 'draft');

  return {
    ...state,
    quests: {
      ...state.quests,
      // 在**原位**替换：这一步不该因为换了个做法就跳到列表末尾
      order: state.quests.order.map((id) => (id === quest.id ? newQuest.id : id)),
      byId,
      chains: {
        ...state.quests.chains,
        [chainId]: {
          ...chain,
          questIds: replacedIds,
          review: {
            ...chain.review,
            rerouteCount: chain.review.rerouteCount + 1,
            // 换法会产出一条新的 draft：审核重新变成未完成。
            // 不重置的话，链会被记为"已审过"，而那条新草稿永远等不到它的审核。
            reviewedAt: stillHasDraft ? null : chain.review.reviewedAt,
          },
        },
      },
    },
  };
};

/**
 * 整链重生成：只在**整条链都被逐条打回**之后可调用，终身 1 次。
 *
 * 「整条链都被打回」的判定落在**成员**上而不是 `chain.questIds.length === 0` 上：
 * 打回会把成员从 questIds 里摘掉，所以"空了"这件事既可能是"全被打回"，
 * 也可能是"这条链本来就没生成出东西"。前者才配得上一次重来。
 *
 * ⚠️ 链 id **不变**。careers.tracks[].chainIds 里存着它，玩家在履历上
 *    也已经认得这个名字；换一个 id 等于把这条链的历史抹掉重开。
 *    变的是它的成员、它的 rationale、以及 regenerationCount。
 *
 * ⚠️ 旧成员归档而不是删除：它们是被打回的东西，而打回的痕迹
 *    是下一次生成的偏好信号（契约原话）。归档后不再出现在悬赏板上，
 *    但仍然躺在 byId 里等着被读。
 */
/**
 * 重抽时喂给生成器的"这次要什么"。
 *
 * 重生成要"带 playerNote"：玩家的整链意见是这次重抽唯一的输入。
 * 没有意见时至少把被打回的标题带上 —— 那是负样本本身。
 *
 * ⚠️ 单独抽出来是因为它有**两个**读者：下面的纯函数，与 `ai/thunks.ts` 里
 *    组装真身 payload 的那一段。两处各写一遍的话，模型看到的与替身看到的是
 *    两句不同的话，而它们本该是同一句。
 */
export const regenerationIdea = (
  rationale: string,
  rejectedTitles: string[],
  playerNote: string | null,
): string => {
  const note = playerNote?.trim() ?? '';
  return note.length > 0
    ? `${rationale}（这一次的要求：${note}）`
    : `${rationale}（前一轮的 ${rejectedTitles.length} 步全部被否，换一批做法）`;
};

export const regenerateQuestChain: RegenerateQuestChain = (state, chainId, now, forgedOverride) => {
  const chain = state.quests.chains[chainId];
  if (!chain) return state;
  if (chain.review.regenerationCount >= CHAIN_REGENERATION_LIMIT) return state;

  const members = membersOfChain(state, chainId);
  if (members.length === 0) return state;
  if (!members.every((m) => m.status === 'rejected')) return state;

  const rejectedTitles = members.map((m) => m.title);
  const idea = regenerationIdea(chain.rationale, rejectedTitles, chain.review.playerNote);

  const forged =
    forgedOverride ??
    mockForge({
      idea,
      classId: chain.classId,
      deepDeliberation: false,
      existingTitles: rejectedTitles,
    });

  const quests = buildQuests({
    drafts: forged.drafts,
    chain: { id: chainId, title: forged.chainTitle },
    classId: forged.classId,
    agentId: ownerAgentIdFor(state, forged.classId),
    sourceIdea: chain.rationale,
    reviewed: false,
    reviewerNote: forged.reviewerNote,
    now,
    // 加盐：这一批要和被打回的那一批**共存**（旧的是负样本）。
    // 只靠时刻分不开的话，新草稿会顶掉旧 id，痕迹连同归档一起消失。
    // 盐里带 chainId：两条链在同一毫秒重抽时也不会撞。
    idSalt: `${chainId}g${chain.review.regenerationCount + 1}`,
  });
  if (quests.length === 0) return state;

  const byId = { ...state.quests.byId };
  for (const q of quests) byId[q.id] = q;

  const memberIds = new Set(members.map((m) => m.id));

  return {
    ...state,
    quests: {
      ...state.quests,
      // 旧成员从展示顺序里退场，新成员接在末尾
      order: [...state.quests.order.filter((id) => !memberIds.has(id)), ...quests.map((q) => q.id)],
      archivedIds: [...state.quests.archivedIds, ...members.map((m) => m.id)],
      byId,
      chains: {
        ...state.quests.chains,
        [chainId]: {
          ...chain,
          title: forged.chainTitle,
          rationale: forged.rationale,
          questIds: quests.map((q) => q.id),
          linkedGoalIds: [...new Set(quests.flatMap((q) => q.linkedGoalIds))],
          review: {
            playerNote: chain.review.playerNote,
            regenerationCount: chain.review.regenerationCount + 1,
            // 换了做法就是一条新链的审核周期，reroute 额度随之重置
            rerouteCount: 0,
            reviewedAt: null,
          },
          completed: false,
        },
      },
    },
  };
};

/**
 * 哪些链现在可以整链重生成 —— **纯查询，不改状态**。
 *
 * 与 `milestoneGate` 同一个理由：operation 在任何拒绝路径上都只返回原状态，
 * 于是"为什么这颗按钮是灰的"没有任何出口 —— 除非 UI 能先问一句。
 * 悬赏面板据此决定是显示一颗可点的按钮，还是显示"这次机会已经用掉了"。
 *
 * 判据与 `regenerateQuestChain` 的守卫**逐条对应**：成员非空、全部 rejected、
 * 终身额度还有剩。两处若有一处漂移，界面就会长出一颗点了没反应的按钮。
 */
export interface RegenerationCandidate {
  chainId: ChainId;
  title: string;
  rejectedCount: number;
  /** 玩家上一次给的整链意见（重抽时会被当作新输入的一部分） */
  playerNote: string | null;
  /** 还剩几次机会。0 = 终身那一次已经用掉了 */
  remaining: number;
}

export const chainsAwaitingRegeneration = (
  state: EarthOnlineState,
): RegenerationCandidate[] => {
  const out: RegenerationCandidate[] = [];
  for (const chain of Object.values(state.quests.chains)) {
    const remaining = CHAIN_REGENERATION_LIMIT - chain.review.regenerationCount;
    if (remaining <= 0) continue;
    const members = membersOfChain(state, chain.id);
    if (members.length === 0) continue;
    if (!members.every((m) => m.status === 'rejected')) continue;
    out.push({
      chainId: chain.id,
      title: chain.title,
      rejectedCount: members.length,
      playerNote: chain.review.playerNote,
      remaining,
    });
  }
  return out;
};

// ===========================================================================
// Phase 3 · 现实里程碑的正式录入流
// ===========================================================================

/** 一条里程碑记录最多挂几张快照 */
const MILESTONE_SNAPSHOT_CAP = 6;

/**
 * 现在能不能记录这条里程碑 —— **纯查询，不改状态**。
 *
 * 它必须是一个独立导出，因为拒绝的理由需要**被说出来**。
 * operation 本身在任何拒绝路径上都只返回原状态（全项目一致的自律），
 * 于是"为什么点不动"这件事没有任何出口 —— 除非 UI 能先问一句。
 * 面板据此把按钮标成"冷却中 · 还有 173 天"或"本月额度已满"。
 */
export type MilestoneGate =
  | {
      ok: true;
      /** 本次能拿到多少 EXP（月度超额时可能少于定义值，甚至为 0） */
      expGranted: number;
      cappedByMonth: boolean;
      /** 这笔经验会记进哪条职业线（UI 要说出来，否则玩家不知道 EXP 去哪了） */
      creditedClassId: ClassIdLiteral | null;
    }
  | { ok: false; reason: 'already_recorded' | 'cooldown' | 'unknown_definition'; detail: string; daysLeft: number };

/**
 * 现实里程碑该记进哪条职业线。
 *
 * 本项目**没有全局经验池** —— EXP 只存在于 CareerTrack 上。而现实里程碑
 * 恰恰是"这个人"的事，不是"这条线"的事，所以必须替它选一条。
 *
 * 选法是**目标对齐**：取 `linkedGoalIds` 与里程碑重合最多的那条线，
 * 平手时取等级更高的那条。于是"第一笔自己赚来的钱"会进资本线、
 * "论文接收"会进学术线 —— 这个归属在结果上是解释得通的，也经得起玩家追问。
 * 一条线都没有时返回 null，那笔 EXP 就只落在记录里（不凭空造一条职业线出来）。
 */
const creditedTrackFor = (state: EarthOnlineState, goalIds: readonly string[]): CareerTrack | null => {
  const tracks = state.careers.tracks;
  const first = tracks[0];
  if (!first) return null;
  const score = (t: CareerTrack): number => t.linkedGoalIds.filter((g) => goalIds.includes(g)).length;
  return tracks.reduce((best, t) => {
    const diff = score(t) - score(best);
    if (diff !== 0) return diff > 0 ? t : best;
    return t.level > best.level ? t : best;
  }, first);
};

export const milestoneGate = (state: EarthOnlineState, definitionId: string, now: Date): MilestoneGate => {
  const def = getRealityMilestone(definitionId);
  if (!def) return { ok: false, reason: 'unknown_definition', detail: '没有这条里程碑的定义', daysLeft: 0 };

  const counter = state.milestones.counters[def.id];
  if (counter && counter.count > 0) {
    if (!def.repeatable) {
      return {
        ok: false,
        reason: 'already_recorded',
        detail: '这件事只会发生一次，已经记下来了',
        daysLeft: 0,
      };
    }
    if (def.cooldownDays !== null) {
      const last = new Date(counter.lastRecordedAt).getTime();
      const elapsed = Number.isNaN(last) ? Number.POSITIVE_INFINITY : (now.getTime() - last) / 86_400_000;
      if (elapsed < def.cooldownDays) {
        const daysLeft = Math.ceil(def.cooldownDays - elapsed);
        return { ok: false, reason: 'cooldown', detail: `冷却中，还有 ${daysLeft} 天`, daysLeft };
      }
    }
  }

  const month = localMonthKey(now);
  const used = state.milestones.monthlyExpGranted[month] ?? 0;
  const cap = state.settings.rewardPolicy.realityMilestoneMonthlyExpCap;
  const room = Math.max(0, cap - used);
  const expGranted = Math.min(def.exp, room);

  return {
    ok: true,
    expGranted,
    cappedByMonth: expGranted < def.exp,
    creditedClassId: creditedTrackFor(state, def.linkedGoalIds)?.classId ?? null,
  };
};

/**
 * 记录一件现实里已经发生的事。
 *
 * 它**不走任务状态机、不经过 AI**：签证递交、论文接收、第一次过海关 ——
 * 这些事的真实性不由系统判定，由现实判定；玩家记下来，系统发奖。
 * 这是全产品唯一一条"玩家自己说了算"的加经验通路，所以它的闸门是硬编码的：
 *
 *   ① 一次性事件禁止重复提交（`repeatable: false` 的条目第二次直接拒绝）；
 *   ② 可重复的条目有冷却（如海外经历 180 天）；
 *   ③ 月度 1200 EXP 封顶 —— **超过之后仍然记录事件，只是不再发额外 EXP**。
 *      这一条是 PO 明确定下的措辞，也是这条通路的价值所在：
 *      记录本身是目的，EXP 只是附带的。所以封顶之后按钮不该消失。
 *
 * 发奖之外还做一件事：点亮 `grantsGoalMilestoneIds` 指向的终极目标里程碑。
 */
export const recordRealityMilestone: RecordRealityMilestone = (state, input, now) => {
  const gate = milestoneGate(state, input.definitionId, now);
  if (!gate.ok) return state;

  const def = getRealityMilestone(input.definitionId)!;
  const ts = iso(now);
  const month = localMonthKey(now);
  const recordId = `rmr_${now.getTime().toString(36)}_${state.milestones.records.length}`;

  // —— 点亮终极目标里程碑 ——
  // 只点亮"还没亮的"那些。已经亮过的再记一次不重算时间：
  // 一个里程碑的达成时刻是它第一次发生的那一刻，后来的重复不该把它推后。
  const litIds: string[] = [];
  const goals: EndgameGoal[] = state.endgame.goals.map((goal) => {
    const hit = goal.milestones.filter((m) => def.grantsGoalMilestoneIds.includes(m.id) && m.achievedAt === null);
    if (hit.length === 0) return goal;
    litIds.push(...hit.map((m) => m.id));

    const milestones = goal.milestones.map((m) => (hit.some((h) => h.id === m.id) ? { ...m, achievedAt: ts } : m));
    const allDone = milestones.every((m) => m.achievedAt !== null);
    const progress =
      goal.metric.kind === 'milestone_weights'
        ? Math.min(1, milestones.reduce((sum, m) => sum + (m.achievedAt === null ? 0 : m.weight), 0))
        : goal.progress;

    return {
      ...goal,
      milestones,
      progress,
      achieved: allDone,
      achievedAt: goal.achievedAt ?? (allDone ? ts : null),
    };
  });

  const prevCounter = state.milestones.counters[def.id];

  // —— 这笔经验记进哪条线 ——
  const track = creditedTrackFor(state, def.linkedGoalIds);
  const credited = track && gate.expGranted > 0 ? grantCareerExp(track, gate.expGranted) : null;
  const careers = credited
    ? {
        ...state.careers,
        tracks: state.careers.tracks.map((t) =>
          t.classId === track!.classId
            ? // 累计 EXP 一并入账 —— 日常 / 周常 / 任务结算三条路都记这一笔，
              // 里程碑要是漏了，金库页那个「累计 N EXP」就会少算，而少算不会报错。
            { ...credited.track, stats: { ...t.stats, expEarnedTotal: t.stats.expEarnedTotal + gate.expGranted } }
            : t,
        ),
      }
    : state.careers;
  // 升级照例发属性点（每级 1 点，与任务结算同一条口径）
  let player = withLevelUpPoints(touchPlayer(state.player, localDateKey(now)), credited?.levelsGained ?? 0);

  // 目录里给这条里程碑配的属性点也要真的发出去 —— 与任务结算是**同一条口径**：
  // 点进"待分配池"，加在哪儿由玩家自己决定。
  // （`rm_first_income` 的 cap:1 就是这么来的：第一笔自己赚来的钱，
  //   换来的一点该花在哪，是这个人自己要回答的问题。）
  const milestonePoints = Object.values(def.attributePoints ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
  if (milestonePoints > 0) {
    player = { ...player, freeAttributePoints: player.freeAttributePoints + milestonePoints };
  }

  return {
    ...state,
    player,
    careers,
    endgame: { ...state.endgame, goals },
    milestones: {
      ...state.milestones,
      records: [
        ...state.milestones.records,
        {
          id: recordId,
          definitionId: def.id,
          // 目录里的条目**永远**不带自定义标题与分类：它的名字就是目录里的名字。
          // 这两个字段此刻为 null，是"这不是自己写的那条"的意思（同 v5 迁移的口径）
          customTitle: null,
          customCategory: null,
          occurredOn: input.occurredOn,
          recordedAt: ts,
          note: input.note.trim(),
          snapshots: input.snapshots.slice(0, MILESTONE_SNAPSHOT_CAP),
          expGranted: gate.expGranted,
          creditedClassId: credited ? (track?.classId ?? null) : null,
          goalMilestoneIds: litIds,
        },
      ],
      counters: {
        ...state.milestones.counters,
        [def.id]: { count: (prevCounter?.count ?? 0) + 1, lastRecordedAt: ts },
      },
      monthlyExpGranted: {
        ...state.milestones.monthlyExpGranted,
        [month]: (state.milestones.monthlyExpGranted[month] ?? 0) + gate.expGranted,
      },
      introducedToPlayer: true,
    },
  };
};

/**
 * 记录一件**目录里没有**的事。
 *
 * 目录那 16 条是这个产品预设的路径（签证、论文、第一笔钱……），
 * 而人的现实不照着目录长。所以这一栏必须有 —— 但有，不等于开口子：
 *
 *   · **标题必填**：一句话都写不出来的时候，多半是还没想清楚要不要记；
 *   · **不发属性点、不点灯**（点灯规则长在定义上，而它没有定义）；
 *   · **进同一本月度账**：`monthlyExpGranted` 与目录条目共用额度 ——
 *     "自己写"不是绕过封顶的后门（封顶之后照样能记，只是不再发 EXP）。
 *
 * EXP 记进哪条线由玩家指定（`creditedClassId`）。未指定时退回
 * `creditedTrackFor(state, [])` —— 目标对齐分为零，于是取等级最高的那条。
 * 这个兜底不是随机的：它是"你在哪条线上走得最远"。
 */
export const recordCustomMilestone: RecordCustomMilestone = (state, input, now) => {
  const title = input.title.trim();
  if (title.length === 0) return state;

  const ts = iso(now);
  const month = localMonthKey(now);
  const cap = state.settings.rewardPolicy.realityMilestoneMonthlyExpCap;
  const used = state.milestones.monthlyExpGranted[month] ?? 0;
  const expGranted = Math.min(FREE_MILESTONE_EXP, Math.max(0, cap - used));

  const picked = input.creditedClassId
    ? state.careers.tracks.find((t) => t.classId === input.creditedClassId) ?? null
    : null;
  const track = picked ?? creditedTrackFor(state, []);
  const credited = track && expGranted > 0 ? grantCareerExp(track, expGranted) : null;

  const careers = credited
    ? {
        ...state.careers,
        tracks: state.careers.tracks.map((t) =>
          t.classId === track!.classId
            ? { ...credited.track, stats: { ...t.stats, expEarnedTotal: t.stats.expEarnedTotal + expGranted } }
            : t,
        ),
      }
    : state.careers;
  const player = withLevelUpPoints(touchPlayer(state.player, localDateKey(now)), credited?.levelsGained ?? 0);

  return {
    ...state,
    player,
    careers,
    milestones: {
      ...state.milestones,
      records: [
        ...state.milestones.records,
        {
          id: `rmr_${now.getTime().toString(36)}_${state.milestones.records.length}`,
          definitionId: null,
          customTitle: title,
          customCategory: input.category,
          occurredOn: input.occurredOn,
          recordedAt: ts,
          note: input.note.trim(),
          snapshots: input.snapshots.slice(0, MILESTONE_SNAPSHOT_CAP),
          expGranted,
          creditedClassId: credited ? (track?.classId ?? null) : null,
          goalMilestoneIds: [],
        },
      ],
      // counters 一个字都不动：自己写的事没有"第 N 次"，也没有冷却。
      // 在这里写一条 counter，日后就会被某段按 counters 遍历的代码当成定义用。
      monthlyExpGranted: {
        ...state.milestones.monthlyExpGranted,
        [month]: (state.milestones.monthlyExpGranted[month] ?? 0) + expGranted,
      },
      introducedToPlayer: true,
    },
  };
};

/**
 * 给已记录的现实里程碑补一张快照（照片 / 链接）。
 *
 * 记录当下没拍的、过几天翻出来的，都可以往后补 —— 这是"证据"这个东西的常态：
 * 事情发生的当时你在忙，等你想起要留一张图，往往已经在回程的飞机上了。
 * 超出上限时丢掉**最早**的那张而不是拒绝：一张新图比一张旧图更接近玩家此刻想说的话。
 */
export const attachMilestoneSnapshot: AttachMilestoneSnapshot = (state, recordId, snapshot, _now) => {
  const idx = state.milestones.records.findIndex((r) => r.id === recordId);
  if (idx === -1) return state;

  const record = state.milestones.records[idx]!;
  const merged = [...record.snapshots, snapshot];
  const snapshots: MilestoneSnapshot[] =
    merged.length > MILESTONE_SNAPSHOT_CAP ? merged.slice(merged.length - MILESTONE_SNAPSHOT_CAP) : merged;

  const records = [...state.milestones.records];
  records[idx] = { ...record, snapshots };

  return { ...state, milestones: { ...state.milestones, records } };
};

/**
 * 静默喂给进化树。
 *
 * ⚠️ 契约上的警告照旧：**只由 CompleteQuest / Arbiter 链路调用**，
 *    禁止在 UI 组件里调用。它写进去的每一条在界面上都是不可见的
 *    （evolution.revealed 为 false 时，任何组件都不得读这个对象）。
 */
export const feedEvolutionMilestones: FeedEvolutionMilestones = (state, records, now) => {
  if (records.length === 0) return state;

  let evolution = state.evolution;
  for (const r of records) {
    evolution = ingestMilestones(evolution, [r.tag], r.questId, now, r.localDate, r.confidence);
  }
  return { ...state, evolution };
};

// ===========================================================================
// Phase 3 · 篇章的命名权与通关仪式
// ===========================================================================

/**
 * 为某一章定下代号。
 *
 * ⚠️ 传进来的 `chapterId` 是**被命名的那一章**，不是刚完成的那一章 ——
 *    命名权交接的语义是"完成第 N 章时，为下一章命名"
 *    （docs/phase1/chapters-and-lore.md §5）。
 *    这个字段描述它自己所属的章节，HUD 因此只需要读当前聚焦章的这一个值。
 *
 * 空白字符串视为"没起名字"，返回原状态 —— 让一个空格成为一章的代号，
 * 会让 HUD 铭牌上出现一处莫名其妙的留白。
 */
export const nameChapter: NameChapter = (state, chapterId, codename, source, _now) => {
  const name = codename.trim().slice(0, 12);
  if (name.length === 0) return state;

  const idx = state.chapters.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return state;

  const target = state.chapters.chapters[idx]!;
  if (target.playerChosenCodename === name && target.codenameSource === source) return state;

  const chapters = [...state.chapters.chapters];
  chapters[idx] = { ...target, playerChosenCodename: name, codenameSource: source };

  return { ...state, chapters: { ...state.chapters, chapters } };
};

/**
 * 收起通关仪式。
 *
 * 它是**一条独立的动作**，而不是"顺带把 pendingCeremony 清掉"：
 * 玩家可以选择跳过命名（命名的权利包含不命名的权利），
 * 但仪式本身必须被看过一次 —— 一章的结束不该在无人在场的时候发生。
 */
export const dismissChapterCeremony: DismissChapterCeremony = (state, _now) => {
  if (state.chapters.pendingCeremony === null) return state;
  return { ...state, chapters: { ...state.chapters, pendingCeremony: null } };
};

/**
 * 切换 HUD 聚焦的篇章（支线并行时玩家自己决定看哪一条）。
 * 只认已解锁且未完成的章：聚焦到一个不存在的东西上没有意义。
 */
export const focusChapter = (state: EarthOnlineState, chapterId: ChapterId): EarthOnlineState => {
  if (state.chapters.focusedChapterId === chapterId) return state;
  if (!state.chapters.activeChapterIds.includes(chapterId)) return state;
  return { ...state, chapters: { ...state.chapters, focusedChapterId: chapterId } };
};
