// ============================================================================
// EarthOnline · Phase 1 · 任务系统类型 (quest.ts)
// 职责：非日常任务状态机 / 任务链 / 日常 / 奖励 / 复盘结算
// ============================================================================

import type {
  AttributeKey,
  ChainId,
  ClassIdLiteral,
  ContactId,
  DailyId,
  DateKey,
  Difficulty,
  EffortEstimate,
  GoalId,
  Id,
  ISODateTime,
  QuestId,
  UsdCents,
  WeeklyId,
} from './core';

// Difficulty 与 EffortEstimate 定义在 core.ts（被奖励政策与 AI 契约共用），
// 此处重新导出，保持 `from './quest'` 的旧引用路径可用。
export type { Difficulty, EffortEstimate };

// ---------------------------------------------------------------------------
// 1. 奖励 (Reward)
// ---------------------------------------------------------------------------

/**
 * 奖励包。EXP 与金库是主奖励；
 * 属性点只在"里程碑级"任务里发放，避免属性通胀。
 */
export interface RewardBundle {
  exp: number;
  /** 可选：真实世界观下的美金奖励（由玩家在复盘时决定是否"真的入账"） */
  vaultUsdCents?: UsdCents;
  /** 可选：直接发放的属性点 */
  attributePoints?: Partial<Record<AttributeKey, number>>;
  /** 可选：道具/称号（Phase 5） */
  itemIds?: string[];
}

/** 结算后的最终奖励，含复盘加成明细。这是写进账本的唯一依据。 */
export interface RewardGrant {
  base: RewardBundle;
  /**
   * 复盘加成百分比，已被 clamp 到 [0, 该难度档位上限]。
   * 未写复盘时为 0；档位判定为 `baseline`（未通过加成资格线）时同样为 0。
   */
  bonusPct: number;
  final: RewardBundle;
  grantedAt: ISODateTime;
  /** 加成来源，用于成功日记里显示"这次为什么多拿了 8%" */
  bonusReason: string | null;
}

// ---------------------------------------------------------------------------
// 2. 任务本体 (Quest)
// ---------------------------------------------------------------------------

export type QuestStatus =
  | 'draft'            // AI 已生成，等待玩家审核（轮 C：整条线一次裁决 —— 主题/理由/每步标题过目后「确认这条线」）
  | 'offered'          // 该条已审核通过，玩家可领取
  | 'claimed'          // 已进入任务清单，尚未开始
  | 'active'           // 执行中
  | 'turn_in_pending'  // 已点"完成"，结算面板待确认（刷新不丢）
  | 'completed'        // 已结算
  | 'expired'          // 过期未完成
  | 'abandoned'        // 玩家主动放弃
  | 'failed'           // 判定失败（仅用于带验证条件的任务）
  | 'rejected'         // 审核时被逐条打回（剔除出链；痕迹保留，作为 AI 偏好信号）
  | 'rerouted';        // 被「换个做法」替换掉的旧版本（留档但不参与流转，见 RerouteRecord）

/** 任务类型。daily 不走非日常流转，见 DailyState。 */
export type QuestType = 'main' | 'side' | 'special' | 'milestone';

/**
 * 任务链元信息。
 *
 * 轮 C（PO 裁定）之后的完整规则，两条：
 *
 *   ① **审核是一次线级的**：draft 阶段整条线一起展示（主题、理由、每步标题），
 *      玩家点一次「确认这条线」（ConfirmQuestChain），全部成员一起过审；
 *   ② **执行是渐进的**：确认后只有第一步出现在悬赏板上，**每完成一步，
 *      下一步才被揭开** —— 未解锁的步骤不是灰掉的卡片，是不存在。
 *      （判据就是下面的 `Quest.prerequisiteQuestIds`，见 selectors.claimableQuests。）
 *
 * 这不是老 `revealed` 字段的回归：那个字段把"看到"存在了存档里，
 * 而这里"看到"是前置状态的**派生**——链自己不需要记住谁被揭开了。
 */
export interface ChainMembership {
  chainId: ChainId;
  /** 在链中的序号，从 0 开始 */
  index: number;
  /** 整条链的规模（用于显示"第 2 / 5 步"时也要谨慎——默认不显示总数） */
  total: number;
  /** 链标题（每个节点都冗余存一份，避免渲染时联表查询） */
  chainTitle: string;
}

/** 可验证的完成条件。有此项的任务在结算时要求玩家提交"证据"。 */
export interface QuestProof {
  /** 人类可读的验证标准，由生成器写死，禁止模糊表述 */
  criterion: string;
  /** 期望的提交形态 */
  kind: 'text' | 'link' | 'number' | 'screenshot';
  /** 玩家实际提交的内容 */
  submitted: string | null;
}

export interface Quest {
  id: QuestId;
  /** 归属职业线。null 表示通用/跨领域任务。 */
  classId: ClassIdLiteral | null;
  type: QuestType;
  status: QuestStatus;
  title: string;
  /** 一行副标题，AVG 风格的简洁描述 */
  subtitle: string;
  /** 叙事化描述（马赛克质感、克制、无鸡汤） */
  narrative: string;
  /** 明确的、可判定的目标陈述 */
  objective: string;
  difficulty: Difficulty;
  effortEstimate: EffortEstimate;
  reward: RewardBundle;
  /** 完成后解锁的、面向玩家的"已知收益"，如技能/资历 */
  outcomeHints: string[];
  /** 关联的终极目标，完成后推进其进度 */
  linkedGoalIds: GoalId[];
  /** 关联的属性成长方向 */
  linkedAttributes: AttributeKey[];
  /**
   * 这条任务和谁有关。从联系人卡片上「派生行动任务」生成的会带一个联系人；
   * 任务完成时会在该联系人名下自动落一条互动（见 operations.completeQuest）。
   */
  linkedContactIds: ContactId[];
  /** 硬性前置（同链之外的前置） */
  prerequisiteQuestIds: QuestId[];
  /** 建议截止时间（仅提示，逾期不惩罚非日常任务） */
  dueHint: ISODateTime | null;
  proof: QuestProof | null;
  /** 标签，用于检索与成就判定 */
  tags: string[];
  /** 任务链归属，非链式任务为 null */
  chain: ChainMembership | null;
  /** 生成来源 */
  origin: {
    agentId: Id<'Agent'> | null;
    /** 玩家原始输入的想法 */
    sourceIdea: string | null;
    generatedAt: ISODateTime;
    /** 是否经过 Agent B 深度推演审核 */
    reviewed: boolean;
    /** 审核批注（玩家可见，作为"参谋意见"） */
    reviewerNote: string | null;
    /**
     * 这条任务是不是由「换个做法」从另一步替换而来的。
     * 指向被替换掉的那条旧任务（旧任务 status 变 'rerouted'，仍留在 byId 里留档）。
     */
    reroutedFrom: QuestId | null;
    /**
     * 这条任务自己经历过的改法记录，按时间正序。
     *
     * 记在**新任务**上而不是旧任务上：旧任务被替换后就冻结了，它在结算面板、
     * 复盘面板里都不再出现；这条链"经历过什么"要在仍然活着的那一步上读得出来。
     * 每次 reroute 都会把 before（旧形态）与 after（新形态）一并写进这里，
     * 于是"改了两次"这件事不需要任何额外查询就能还原。
     */
    rerouteHistory: RerouteRecord[];
  };
  /** 复盘结算结果。status === 'completed' 时必有。 */
  grant: RewardGrant | null;
  /** 关联的成功日记条目（写复盘才有） */
  journalEntryId: string | null;

  // 时间戳
  createdAt: ISODateTime;
  claimedAt: ISODateTime | null;
  startedAt: ISODateTime | null;
  turnInOpenedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  /** 实际耗时（由玩家在结算面板填，可空），Phase 5 用于校准 effortEstimate */
  actualEffortMinutes: number | null;
}

// ---------------------------------------------------------------------------
// 3. 任务集合容器
// ---------------------------------------------------------------------------

export interface QuestState {
  byId: Record<QuestId, Quest>;
  /** 展示顺序（手动拖拽排序 + 按状态分组时不使用此顺序） */
  order: QuestId[];
  /** 玩家主动放弃/过期的历史任务移到归档区 */
  archivedIds: QuestId[];
  /**
   * 任务链容器，按 chainId 索引。
   *
   * 没有它，`ChainReview.regenerationCount`（整链重生成额度，产品上限 1 次）就无处落盘
   * —— `RegenerateQuestChain` 读不到也写不回，**刷新一次页面就能再抽一次卡**，
   * 防无限重生成的上限形同虚设。同理，`review.playerNote` 与 `reviewedAt` 也会随刷新丢失。
   *
   * 放在 QuestState 内而不是 EarthOnlineState 顶层：链与任务是同一条生命周期，
   * `lastSweepAt` 那次草稿清扫理应连带修剪孤儿链。
   */
  chains: Record<ChainId, QuestChain>;
  /** AI 生成但玩家未领取、且已超过 7 天的草稿自动清理 */
  lastSweepAt: ISODateTime | null;
}

/**
 * 任务链的审核记录（链级信息）。
 *
 * 审核的主入口是**线级的**（ConfirmQuestChain / RejectQuestChain，轮 C），
 * 落到数据上仍是逐条 resolve（draft → offered / rejected，状态记在 Quest 自己身上）——
 * 链因此不持有"已通过 / 被拒绝"的整体状态，它是派生物
 * （全部成员 resolve 完毕即视为审核结束，此时 reviewedAt 落定）。
 *
 * 这里的字段只承载"链级"的两件事：玩家对整条线的备注，
 * 以及"整条链都被打回"时的一次重生成额度。
 */
export interface ChainReview {
  /** 玩家在审核时写下的整链意见；整链重生成时作为输入之一 */
  playerNote: string | null;
  /** 已触发过几次整链重生成（产品上限 1 次，防止无限抽卡） */
  regenerationCount: number;
  /** 整链审核完成（全部成员 resolve）的时间；未完成时为 null */
  reviewedAt: ISODateTime | null;
  /**
   * 这条链里累计发生过几次「换个做法」。
   *
   * 与 regenerationCount 的区别是量纲：重生成是**整链级**的额度（终身 1 次），
   * reroute 是**链级总量**的软上限（默认 2 次，见 REROUTE_CHAIN_LIMIT）。
   * 两者都不限制单条任务——一个人可以对第 2 步改两次，也可能对第 2、4 步各改一次。
   */
  rerouteCount: number;
}

/**
 * 一次「换个做法」的完整记录 —— 改法前后各留一份形态快照。
 *
 * 只记玩家与后续渲染真正用得到的三件事：改之前长什么样、改之后长什么样、
 * 玩家当时说了什么。**不记** Agent 的原始输出：那是 AgentInvocationLog 的职责，
 * 且那份日志按产品约定不进导出文件（见 SaveFile 的类型注释）。
 */
export interface RerouteRecord {
  at: ISODateTime;
  /** 玩家填进微型输入框的修改诉求原文 */
  request: string;
  before: RerouteShape;
  after: RerouteShape;
  /**
   * 降级被拒绝时的原因（如"已经是最低难度"）。
   * 成功替换时为 null。留着它是为了让"为什么没改成"也有一条可读的痕迹。
   */
  rejectedReason: string | null;
}

/** reroute 前后的可比形态。刻意只留最少的字段，避免这份留档长成第二份任务。 */
export interface RerouteShape {
  title: string;
  difficulty: Difficulty;
  /** 最终奖励的 EXP 值，用于在结算与复盘里显示"这一步便宜了 40 点" */
  exp: number;
}

/** 一次性生成的整条任务链（来自 Class Agent 或 Chain Reviewer） */
export interface QuestChain {
  id: ChainId;
  title: string;
  /** 生成这条链的理由：为什么它服务于你的终极目标 */
  rationale: string;
  classId: ClassIdLiteral;
  questIds: QuestId[];
  linkedGoalIds: GoalId[];
  createdAt: ISODateTime;
  /** 玩家审核记录（线级确认 / 打回；全部成员 resolve 后 reviewedAt 落定） */
  review: ChainReview;
  /** 全部成员走完的**派生事实**（completeQuest 在同一链全 completed 时置真）。 */
  completed: boolean;
  /**
   * 玩家**主动收束**这条线的时间（CloseQuestChain；未收束为 null）。
   *
   * 与 `completed` 是两条轨道，别混淆：
   *   - `completed` 是"链自己走完了"的派生事实 —— 机器判定，不可撤销；
   *   - `closedAt`  是"玩家说这条线到此为止"的动作记录 —— 可以是走完之后
   *     补记的收束，也可以是半途叫停（此时 `completed` 保持 false，
   *     未完成的成员转 `abandoned` 归档）。
   * 收官界面的两态文案（「走完了」/「在这里收束」）就按这两个字段判。
   */
  closedAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// 4. 日常 (Dailies) —— 极简机制
//
// 🔴 红线（本次修订明确）：**日常只能由玩家创建。**
//    系统与任何 AI 都不得自动创建、自动启用、自动修改日常。
//    AI 唯一的入口是 `DailyRecommendation`（推荐）——玩家裁决采纳之前，
//    推荐不产生任何奖励、不参与任何结算、不出现在 definitions 里。
// ---------------------------------------------------------------------------

export interface DailyDefinition {
  id: DailyId;
  title: string;
  /**
   * 创建来源。两种取值都意味着"这是玩家的决定"：
   *   - player_created：玩家亲手写下（或逐字编辑后确认）
   *   - ai_recommendation_adopted：AI 推荐、玩家逐条过目后点「采纳」
   */
  origin: 'player_created' | 'ai_recommendation_adopted';
  /** origin 为 ai_recommendation_adopted 时，来源推荐记录的 id；否则为 null */
  adoptedFromRecommendationId: string | null;
  /** 所属职业线，null 为通用日常（如睡眠、运动） */
  classId: ClassIdLiteral | null;
  /** 期望频率：每日 1 次，或每日 N 次 */
  targetPerDay: number;
  /** 单次奖励 */
  reward: RewardBundle;
  /**
   * 漏打惩罚（EXP），实际值 = 本日常奖励 × RewardPolicy.dailyMissPenaltyMultiplier。
   *
   * 作用范围严格限定在该条日常本身：
   *   - 不牵连其它日常、不扣金库、不清除任何已有记录
   *   - 连击归零，但 bestStreak 永久保留
   */
  penaltyExp: number;
  /** 该日常的图标/场景锚点（Phase 2 用） */
  iconKey: string;
  /** 是否计入连击 */
  countsForStreak: boolean;
  /** 当前连击天数 */
  streak: number;
  /** 历史最长连击 */
  bestStreak: number;
  enabled: boolean;
  /** 允许在一天中的哪个时段打钩（可选约束，如"晨跑"只在 05:00-11:00） */
  window: { fromHour: number; toHour: number } | null;
  createdAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

/**
 * AI 推荐的日常。红线：它只是"建议"，不是日常本身——
 * 在玩家明确点「采纳」之前，它不产生奖励、不参与结算、不进入 definitions。
 * 玩家可以修改标题/频率后再采纳（origin 仍记为 ai_recommendation_adopted），
 * 也可以直接忽略（dismissed）。
 */
export interface DailyRecommendation {
  id: string;
  title: string;
  /** 建议频率：每日 1 次，或每日 N 次 */
  targetPerDay: number;
  iconKey: string;
  /** 推荐理由（一行）：为什么这条日常值得做 */
  rationale: string;
  sourceAgentId: Id<'Agent'> | null;
  sourceClassId: ClassIdLiteral | null;
  status: 'pending' | 'adopted' | 'dismissed';
  createdAt: ISODateTime;
  /** 玩家裁决时间（采纳或忽略） */
  resolvedAt: ISODateTime | null;
}

/** 单日的日常执行记录 */
export interface DailyLog {
  localDate: DateKey;
  /** 已打钩的日常 ID（一条日常一天只记一次，即使 targetPerDay > 1） */
  checkedIds: DailyId[];
  /** 每条打钩的精确时间 */
  checkedAt: Record<DailyId, ISODateTime>;
  /** 该日获得的 EXP 与金库 */
  expEarned: number;
  vaultEarned: UsdCents;
  /** 该日被扣的 EXP（漏打惩罚） */
  expPenalized: number;
  /** 该日结束时仍未打钩的日常 */
  missedIds: DailyId[];
  /** 该日的连击加成百分比 */
  streakBonusPct: number;
  /** 玩家当日精力终值，用于 Phase 5 的节律分析 */
  energyAtEndOfDay: number | null;
  /** 是否已做过当日结算（幂等保护，防止重复扣分） */
  settled: boolean;
}

export interface DailyState {
  definitions: DailyDefinition[];
  /** AI 推荐但尚未被玩家裁决的日常（采纳前**绝不生效**，见 DailyRecommendation） */
  recommendations: DailyRecommendation[];
  /** 按 localDate 索引的执行记录，环形保留最近 180 天 */
  logs: Record<DateKey, DailyLog>;
  /** 最近一次跨天结算的日期，防止重复结算 */
  lastSettledLocalDate: DateKey;
  /** 待玩家查看的结算结果（用于"昨天漏了 2 项，扣了 X"的温和提示，看完即清） */
  pendingRolloverNotice: RolloverResult | null;
}

/**
 * 跨天结算结果。这是一个纯函数 runDailyRollover(prevState, now) 的输出契约，
 * 不涉及 AI。UI 呈现时必须使用鼓励性措辞。
 *
 * 结算时点：`settings.dayRolloverHour`（默认次日 01:00）。
 * 幂等键：`DailyState.lastSettledLocalDate`，同一天重复触发只结算一次。
 */
export interface RolloverResult {
  fromLocalDate: DateKey;
  toLocalDate: DateKey;
  /** 仅包含"该日未打钩的日常本身"，不牵连任何其它记录 */
  missed: Array<{ id: DailyId; title: string; penaltyExp: number }>;
  totalExpPenalty: number;
  /** 被中断的连击及其长度 */
  brokenStreaks: Array<{ id: DailyId; title: string; streakLost: number }>;
  /** 保住的连击（正面反馈优先展示） */
  keptStreakCount: number;
  /** 该日净 EXP 变化 */
  netExp: number;
}

// ---------------------------------------------------------------------------
// 5. 每周规程 (Weeklies) —— 与日常同一条红线
//
// 🔴 红线（与日常完全一致）：**每周任务只能由玩家创建。**
//    系统与任何 AI 都不得自动创建、自动启用、自动修改。AI 至多可以"推荐"，
//    而本片不开放这条推荐通路 —— 面板上只认玩家亲手写下的。
//
// 与日常的差异只有刻度：
//   · 打钩周期从"天"变成"周"，周一为一周之始（weekStartKey）；
//   · 结算时点固定在**周一 01:00** —— 与跨天同一时刻，跨天结算顺带做周结算；
//   · 惩罚同样是"该条奖励 × dailyMissPenaltyMultiplier"，创建时定格进 penaltyExp；
//   · 周连击推进同样发生在打钩时，漏掉则在结算时归零（bestStreak 保留）。
// ---------------------------------------------------------------------------

export interface WeeklyDefinition {
  id: WeeklyId;
  title: string;
  /**
   * 目前只有 player_created 一种取值 —— 这是红线在类型上的体现。
   * 将来若开放 AI 推荐，采纳通路应参照 DailyRecommendation 的做法
   * （推荐与定义分离，采纳后才进入本数组）。
   */
  origin: 'player_created';
  /** 所属职业线，null 为通用周常 */
  classId: ClassIdLiteral | null;
  /** 单次（每周一次）奖励 */
  reward: RewardBundle;
  /**
   * 漏做惩罚（EXP）= reward.exp × RewardPolicy.dailyMissPenaltyMultiplier，
   * 创建时定格，之后不随政策变化 —— 与日常惩罚同一条哲学。
   */
  penaltyExp: number;
  /** 是否计入周连击 */
  countsForStreak: boolean;
  /** 当前周连击（连续完成的周数） */
  streak: number;
  bestStreak: number;
  enabled: boolean;
  createdAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

/** 单周的每周规程执行记录。按 weekStart（周一）索引 */
export interface WeeklyLog {
  weekStart: DateKey;
  /** 该周已打钩的周常 ID（一条周常一周只记一次） */
  checkedIds: WeeklyId[];
  /** 每条打钩的精确时间 */
  checkedAt: Record<WeeklyId, ISODateTime>;
  expEarned: number;
  /** 该周被扣的 EXP（周一结算时写回） */
  expPenalized: number;
  /** 结算时该周仍未打钩的周常 */
  missedIds: WeeklyId[];
  /** 是否已做过结算（幂等的主键是 WeeklyState.lastSettledWeekStart） */
  settled: boolean;
}

export interface WeeklyState {
  definitions: WeeklyDefinition[];
  /** 按 weekStart（周一）索引的执行记录，环形保留最近 52 周 */
  logs: Record<DateKey, WeeklyLog>;
  /** 最近一次已结算完毕的"完整周"的周一（幂等键，只结最近一周、不补算） */
  lastSettledWeekStart: DateKey;
  /** 待玩家查看的上周结算（与 pendingRolloverNotice 同一张浮层、分节展示，看完即清） */
  pendingWeeklyNotice: WeeklyRolloverResult | null;
}

/**
 * 每周规程的结算结果。与 RolloverResult 平行、独立落库 ——
 * 周一凌晨跨天时两份结算在同一个时刻各自产生，浮层分节分别呈现，
 * 这样"日"与"周"的任何一方缺失都不会让另一方显示不出来。
 */
export interface WeeklyRolloverResult {
  /** 被结算的那一周（周一） */
  weekStart: DateKey;
  /** 该周的最后一天（周日） */
  weekEnd: DateKey;
  /** 该周完成的周常数（正面反馈优先展示） */
  completedCount: number;
  /** 该周未打钩的周常 */
  missed: Array<{ id: WeeklyId; title: string; penaltyExp: number }>;
  totalExpPenalty: number;
  /** 被中断的周连击及其长度（单位：周） */
  brokenStreaks: Array<{ id: WeeklyId; title: string; streakLost: number }>;
  /** 保住的周连击 */
  keptStreakCount: number;
  /** 该周净 EXP 变化 */
  netExp: number;
}
