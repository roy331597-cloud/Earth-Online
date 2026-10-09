// ============================================================================
// EarthOnline · Phase 1 · 核心类型层 (core.ts)
// 职责：ID / 时间 / 金钱 / 属性 / 玩家 / 金库 / 职业轨迹 / 设置 / 事件日志
//
// 三条工程约定（全项目强制）：
//   1) 时间点一律 ISO-8601 UTC 字符串；同时另存 localDate(DateKey) 表示"日期归属"
//   2) 金额一律整数美分 (UsdCents)，禁止浮点加减
//   3) 持久化对象必须是纯 JSON —— 不允许 Date / Map / Set / undefined 值 / 函数
//      （undefined 用 null 或直接省略字段表达；用 `?` 声明的字段在写入前必须 prune）
// ============================================================================

// ---------------------------------------------------------------------------
// 0. ID 与基础标量
// ---------------------------------------------------------------------------

/**
 * 品牌化 ID：防止 QuestId 被误传进 ContactId 之类的接口。
 *
 * 品牌属性声明为**可选**是刻意的：
 *   - 字面量可以直接赋值（`const id: QuestId = 'q_1'`），catalog 里不用到处 as
 *   - 但 QuestId 与 ContactId 之间仍互不可赋值，类型安全不打折
 */
export type Id<Tag extends string> = string & { readonly __id?: Tag };

/** 仅用于类型层构造品牌 ID，运行期是恒等函数 */
export const asId = <Tag extends string>(raw: string): Id<Tag> => raw as Id<Tag>;

export type QuestId = Id<'Quest'>;
export type ChainId = Id<'Chain'>;
export type ClassId = Id<'Class'>;
export type ChapterId = Id<'Chapter'>;
export type GoalId = Id<'Goal'>;
export type NodeId = Id<'EvoNode'>;
export type ContactId = Id<'Contact'>;
export type JournalId = Id<'Journal'>;
export type AgentId = Id<'Agent'>;
export type SceneId = Id<'Scene'>;
export type AnchorId = Id<'Anchor'>;
export type DailyId = Id<'Daily'>;
export type WeeklyId = Id<'Weekly'>;
export type EventId = Id<'Event'>;
export type TransactionId = Id<'Txn'>;
export type InvocationId = Id<'Inv'>;

/** ISO-8601 UTC，例：'2026-10-06T09:31:00.000Z' */
export type ISODateTime = string;
/** 玩家本地日历日，例：'2026-10-06' —— 日常/惩罚的唯一判定依据 */
export type DateKey = string;
/** IANA 时区，例：'Asia/Shanghai' */
export type Timezone = string;

/** 整数美分。100_000_000 美元 = 10_000_000_000 分 */
export type UsdCents = number;
export const USD = (dollars: number): UsdCents => Math.round(dollars * 100);
export const toUsd = (cents: UsdCents): number => cents / 100;

/** 0..1 的归一化比例 */
export type Ratio = number;

/**
 * 任务难度。1 最轻，5 为里程碑级。
 * 定义在核心层而非 quest.ts，是因为它同时被奖励政策 (RewardPolicy) 与
 * 任务、AI 契约三处引用 —— 放这里可以避免 types 内部出现循环导入。
 */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** 精力/时间预估，用于给玩家"我今天能不能吃得下"的直觉 */
export interface EffortEstimate {
  unit: 'min' | 'hour' | 'day';
  value: number;
}

// ---------------------------------------------------------------------------
// 1. 基础属性 (Base Attributes)
// ---------------------------------------------------------------------------

/**
 * 六维基础属性。设计原则：每一项都必须能被至少一类职业任务真实提升，
 * 且都能映射到某个终极目标，否则就是装饰品。
 */
export interface Attributes {
  /** 体魄 —— 熬夜/久坐的对抗项，影响每日可用精力上限 */
  vit: number;
  /** 智识 —— 科研/工程/学习的核心项 */
  int: number;
  /** 心力 —— 专注与情绪稳定，影响复盘 Bonus 的判定上限 */
  foc: number;
  /** 魅力 —— 表达、内容、社交临场 */
  cha: number;
  /** 意志 —— 长期坚持、抗挫折 */
  wil: number;
  /** 财商 —— 资本配置与风险认知 */
  cap: number;
}

export const ATTRIBUTE_KEYS = ['vit', 'int', 'foc', 'cha', 'wil', 'cap'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/**
 * 属性成长记录。两种留痕，共用同一条时间线：
 *
 *   ① **涨点**（delta = 1）：目前唯一的来源是玩家手动分配。
 *      `questId` 为 null —— 是谁把这点放上去的，答案永远是玩家自己。
 *   ② **记账**（delta = 0）：任务完成时记下"这条练到了哪几维"。
 *      **它不涨点**（PO 裁定：任务只记账）—— 涨点只有手动这一个出口，
 *      记账行的存在只是让"我在为什么而练"这件事有据可查。`questId` 指向来源任务，
 *      `reason` 存任务标题（渲染时不必再联表）。
 *
 * 可空一律是 null（承本文件的持久化约定），所以 `questId` 不写成可选。
 */
export interface AttributeDelta {
  key: AttributeKey;
  delta: number;
  reason: string;
  ts: ISODateTime;
  questId: QuestId | null;
}

// ---------------------------------------------------------------------------
// 2. 玩家 (Player)
// ---------------------------------------------------------------------------

/** 每日精力：一个软性约束，不做硬性拦截，低精力时只给"提示 + 收益衰减" */
export interface EnergyState {
  /** 当前可用精力 */
  current: number;
  /** 上限，随 vit 与等级成长 */
  max: number;
  /** 上次结算时间，用于按小时恢复 */
  lastRegenAt: ISODateTime;
}

export interface Player {
  /** 玩家自取名 / 游戏内代号 */
  handle: string;
  /** 一句话签名，显示在 HUD 展开态 */
  motto: string;
  avatarUrl: string | null;
  /** 当前活动场景 */
  currentSceneId: SceneId;
  attributes: Attributes;
  /** 属性点池：由升级发放，由玩家手动分配（保留"我在长成什么样"的主动权） */
  freeAttributePoints: number;
  /** 属性成长留痕（涨点 + 任务记账共用一条时间线，见 AttributeDelta）。环形保留最近 200 条 */
  attributeHistory: AttributeDelta[];
  energy: EnergyState;
  /** 玩家自定的当前人生阶段代号（见 chapters-and-lore 第四节） */
  selfDeclaredPhaseName: string | null;
  createdAt: ISODateTime;
  /** 累计登录天数（有任意操作的日历日数） */
  daysActive: number;
  /** 最近一次"有任意操作"的日期，用于连击与活跃度 */
  lastActiveLocalDate: DateKey;
}

// ---------------------------------------------------------------------------
// 3. 美金金库 (Vault)
// ---------------------------------------------------------------------------

export type TransactionType =
  | 'income'        // 主动收入（工资/接单/内容变现）
  | 'expense'       // 支出
  | 'investment_in' // 转入投资标的
  | 'investment_out'// 从投资标的转出
  | 'valuation'     // 持仓估值刷新（非现金流）
  | 'dividend'      // 分红/利息
  | 'fx'            // 换汇
  | 'goal_grant'    // 任务奖励入账
  | 'adjustment';   // 手动校正（需 note）

export type AssetClass =
  | 'cash'
  | 'equity'
  | 'etf'
  | 'crypto'
  | 'bond'
  | 'real_estate'
  | 'business_equity'
  | 'other';

/** 追加型账本条目。任何金额变动必须落一条，禁止直接改 balance */
export interface VaultTransaction {
  id: TransactionId;
  ts: ISODateTime;
  localDate: DateKey;
  type: TransactionType;
  /** 带符号金额：收入为正，支出为负。valuation 用差额表示 */
  amount: UsdCents;
  assetClass: AssetClass;
  /** 关联来源，如某次任务奖励 */
  questId?: QuestId;
  category: string;
  note: string;
}

/** 持仓。价格刷新前只记录成本与数量，市值由 valuation 交易更新 */
export interface AssetHolding {
  id: Id<'Holding'>;
  assetClass: AssetClass;
  /** 标的代号，如 'VOO' / 'BTC' / 'self_lab_equipment' */
  symbol: string;
  label: string;
  quantity: number;
  costBasis: UsdCents;
  /** 最近一次估值 */
  marketValue: UsdCents;
  valuedAt: ISODateTime;
}

/**
 * A9 进度说明：
 *   A9 = 净资产 100,000,000 USD（9 位数）。
 *   进度必须用对数曲线，否则从 $1k 到 $100M 的线性进度永远是 0.001%，玩家会失去反馈感。
 *
 *   ⚠️ 但**裸对数**（log10(netWorth)/8）同样不可用——建角注入 $1,100 时它已经显示 38%。
 *   曲线必须围绕"建角刻度"归一化：建角当天 = 0%，$100M = 100%，并加平滑常数
 *   避免低位过陡。实现见 `catalog/policy.ts` 的 WEALTH_CURVE / wealthProgressRatio。
 *   该值由 selector 计算，**不入库**。
 */
export interface Vault {
  /** 现金（含活期） */
  cash: UsdCents;
  holdings: AssetHolding[];
  /** 负债（正数表示欠款） */
  liabilities: UsdCents;
  transactions: VaultTransaction[];
  /** 最近一次净资产快照，用于画曲线 */
  netWorthHistory: Array<{ localDate: DateKey; netWorth: UsdCents }>;
  /** 显示币种（仅影响 UI 展示，记账一律 USD） */
  displayCurrency: 'USD' | 'CNY';
  /** 月均支出，用于计算 runway */
  monthlyBurn: UsdCents;
}

// ---------------------------------------------------------------------------
// 4. 多重职业头衔 (Multi-Class Portfolio)
// ---------------------------------------------------------------------------

/** 职业领域 ID 是开放的：Dispatcher 可以创建新的 */
export type ClassIdLiteral =
  | 'computational_biology'
  | 'investor'
  | 'social_media_influencer'
  | 'startup_entrepreneur'
  // 英语线（Phase 7 · up 迁移）：第五条初始线 —— 「通往雅思 7.0 的长期线」。
  // 与另外四条同一时刻建角就位（见 newGameState 的 careers.tracks）。
  | 'english_learner'
  | (string & {});

/** 头衔阶梯中的一档，例：Lv.1-9 为「湿实验学徒」 */
export interface TitleTier {
  /** 起始等级（含） */
  fromLevel: number;
  title: string;
  /** 该档位的准入要求描述（展示用） */
  requirementHint: string;
}

/** 经验曲线参数：expToNext(level) = base * level ^ exponent */
export interface ExpCurve {
  base: number;
  exponent: number;
  maxLevel: number;
}

/**
 * 单条职业轨迹。玩家可并行拥有多条。
 * 关键：每个 Class 有自己的 EXP / Level / 支线任务链，
 * 而「完成重要支线」会向 Chapter 与终极目标注入进度。
 */
export interface CareerTrack {
  classId: ClassIdLiteral;
  displayName: string;
  /** 一句话领域箴言，显示在职业卡背面 */
  creed: string;
  level: number;
  exp: number;
  /** expToNext(level) 的缓存，随等级变化重算；避免每帧调用曲线函数 */
  expToNext: number;
  expCurve: ExpCurve;
  titleTiers: TitleTier[];
  /** 该职业的本领域关键词，注入给专属 Agent 做人格锚定 */
  domains: string[];
  /** 关联的终极目标 */
  linkedGoalIds: GoalId[];
  /** 该职业贡献的属性权重：完成本职业任务时属性成长偏向哪些维度 */
  attributeWeights: Partial<Record<AttributeKey, number>>;
  /** 该职业产出的任务链 ID（含已完成的） */
  chainIds: ChainId[];
  /** 该职业的累计统计，用于 Phase 5 的"履历"面板 */
  stats: {
    questsCompleted: number;
    questsAbandoned: number;
    expEarnedTotal: number;
    /** 该职业创造的美分总额（正数） */
    vaultEarnedTotal: UsdCents;
    firstQuestAt: ISODateTime | null;
    lastQuestAt: ISODateTime | null;
  };
  unlockedAt: ISODateTime;
  /** 由哪个 Agent 创建（初始 4 职业为 null） */
  createdByAgentId: AgentId | null;
  /** 玩家手动置顶排序 */
  pinned: boolean;
}

export interface CareerPortfolio {
  tracks: CareerTrack[];
  /** 当前 HUD 上高亮的职业 */
  activeClassId: ClassIdLiteral | null;
  /** 已退役的职业（数据保留，不删） */
  retiredClassIds: ClassIdLiteral[];
}

// ---------------------------------------------------------------------------
// 5. 设置 (AppSettings)
// ---------------------------------------------------------------------------

/** 复盘加成区间。按任务难度分档，见 data/catalog/policy.ts */
export interface BonusBand {
  minPct: number;
  maxPct: number;
}

export interface RewardPolicy {
  /**
   * 按难度分档的复盘加成区间。
   * 难度越高，区间越宽（低难任务窄区间防止套利；高难任务宽区间奖励更深的反思）。
   * 默认值：难度 1 → 6~9%，难度 5 → 5~20%。
   *
   * 加成是两步判定：① 先判定"是否加成"——档位为 baseline（套话/复述）则 0%；
   * ② 通过资格线后，再按难度档位在区间内浮动（见 policy.ts 的 bonusForQuality）。
   */
  reflectionBonusBands: Record<Difficulty, BonusBand>;
  /** 复盘字数低于此值时，判定档位最高只能到 solid（且仍需通过①的资格审查） */
  reflectionWordCountFloor: number;
  /** 现实里程碑每月可发放的 EXP 上限（防刷；按自然月重置） */
  realityMilestoneMonthlyExpCap: number;
  /** 日常漏打的 EXP 惩罚 = 该日常奖励 × 此系数 */
  dailyMissPenaltyMultiplier: number;
  /** 每日首次打钩的连击奖励系数（按 streak 天数线性增长，封顶） */
  streakBonusPerDay: number;
  streakBonusCapPct: number;
  /** 单次任务可发放的 EXP 上限，避免 AI 生成离谱数值 */
  maxExpPerQuest: number;
}

export interface AppSettings {
  timezone: Timezone;
  locale: 'zh-CN' | 'en-US';
  /**
   * 一天的归属切换时刻（小时，0-23）。默认 **次日 01:00**。
   * 含义：00:30 打钩仍算作"昨天"；01:00 之后打开 App 才触发跨天结算。
   * 0 点结算太苛刻（收尾的人会被误判），4 点则等于默许熬夜到凌晨三点。
   */
  dayRolloverHour: number;
  /** 首次进入 App 的引导是否完成 */
  onboarded: boolean;
  /** 场景显示：是否启用暗角渐变（保证文字可读性） */
  vignetteEnabled: boolean;
  /** 音效（Phase 5 用） */
  sfxVolume: number;
  rewardPolicy: RewardPolicy;
  /** 隐藏目标的进度是否在 UI 上完全不可见（默认 true，这是设计底线） */
  evolutionTreeStrictHidden: boolean;
}

// ---------------------------------------------------------------------------
// 6. 领域事件日志 (DomainEvent)
// ---------------------------------------------------------------------------

/**
 * 追加型事件日志。所有状态变更都应产生一条事件。
 * 用途：成就系统 / 周报 / AI 长期记忆 / 撤销 / 埋点，全部无需重跑历史。
 * 策略：环形裁剪，仅保留最近 MAX_EVENTS 条（建议 500）。
 */
export type DomainEventType =
  | 'session.started'
  | 'daily.checked'
  | 'daily.missed'
  | 'daily.rollover'
  | 'daily.recommendation_adopted'
  | 'daily.recommendation_dismissed'
  | 'quest.generated'
  | 'quest.reviewed'
  | 'quest.claimed'
  | 'quest.started'
  | 'quest.turn_in_opened'
  | 'quest.completed'
  | 'quest.abandoned'
  | 'chain.reviewed'
  | 'chain.sealed'
  | 'career.level_up'
  | 'career.created'
  | 'attribute.allocated'
  | 'vault.transaction'
  | 'journal.entry_written'
  | 'network.contact_added'
  | 'network.interaction_logged'
  | 'network.advice_requested'
  | 'endgame.goal_milestone'
  | 'milestone.recorded'
  | 'chapter.advanced'
  | 'chapter.unlocked'
  | 'evolution.node_lit'
  | 'evolution.revealed'
  | 'agent.invoked'
  | 'agent.created'
  | 'agent.failed'
  | 'system.migrated';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: EventId;
  ts: ISODateTime;
  localDate: DateKey;
  type: DomainEventType;
  payload: TPayload;
  /** 触发该事件的 Agent（若是 AI 驱动的动作） */
  sourceAgentId?: AgentId;
  /** 关联任务，便于"这条记录从哪来"的溯源 */
  questId?: QuestId;
}
