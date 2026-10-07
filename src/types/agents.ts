// ============================================================================
// EarthOnline · Phase 1 · 多智能体系统类型 (agents.ts)
// 职责：Agent 注册表 + AI 运行时状态 + 所有 Agent 的输入/输出契约
//
// 架构立场：
//   1. Agent 是"有档案的员工"，不是无状态的函数调用。注册表持久化，可审计、可退役。
//   2. 每个 Agent 的输出都有严格的 JSON 契约，解析失败即降级为本地兜底，绝不污染存档。
//   3. 数值裁决权永远在本地（clamp），见 core.ts 铁律 #1。
// ============================================================================

import type {
  AgentId,
  AttributeKey,
  ContactId,
  ClassIdLiteral,
  Difficulty,
  EffortEstimate,
  GoalId,
  ISODateTime,
  InvocationId,
  QuestId,
  Ratio,
  UsdCents,
} from './core';
import type { ContactContextForAI, RelationStage, RelationType } from './network';
import type { JournalInsight, EmotionTag, ReflectionQuality } from './journal';
import type { SchemaName } from '../ai/schemas';

// ---------------------------------------------------------------------------
// 1. Agent 注册表
// ---------------------------------------------------------------------------

/**
 * Agent 种类。
 *   dispatcher      调度员：识别想法归属，路由 / 创建 Class
 *   class           各职业专属生成器（可动态创建，数量开放）
 *   blueprints      元生成器：为未知领域铸造一个新的 Class Agent
 *   network_advisor 社交智囊
 *   arbiter         复盘判官
 *   chain_reviewer  深度推演审核官（Agent B）
 */
export type AgentKind =
  | 'dispatcher'
  | 'class'
  | 'blueprints'
  | 'network_advisor'
  | 'arbiter'
  | 'chain_reviewer';

export type AgentStatus = 'active' | 'paused' | 'retired';

/** Agent 的人格与生成参数快照。改变即视为"重新培训"，需留痕。 */
export interface AgentProfile {
  /** 展示名，如「计算生物学 · 首席研究员」 */
  displayName: string;
  /** 该 Agent 的领域宣言（展示用，一行） */
  tagline: string;
  /** system prompt 文件路径（相对 src/ai/prompts/） */
  systemPromptRef: string;
  /** 注入该 Agent 的动态上下文开关 */
  contextInjection: {
    includePlayerAttributes: boolean;
    includeVaultSummary: boolean;
    includeActiveQuests: boolean;
    includeRecentJournal: boolean;
    includeCareerStats: boolean;
    includeNetworkSummary: boolean;
  };
  /** 该 Agent 可见的"近期成功日记条数"上限 */
  journalWindow: number;
}

export interface AgentRuntimeConfig {
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  /** 是否要求 JSON 输出（DeepSeek 的 response_format: json_object） */
  jsonMode: boolean;
  timeoutMs: number;
  maxRetries: number;
}

export interface AgentStats {
  invocations: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  costUsdCents: number;
  lastInvokedAt: ISODateTime | null;
  /** 解析成功率的滑动值，低于 0.8 时提示需要调整 prompt */
  parseSuccessRate: Ratio;
}

export interface AgentRecord {
  id: AgentId;
  kind: AgentKind;
  /** 归属职业线，仅 kind === 'class' 时有值 */
  classId: ClassIdLiteral | null;
  profile: AgentProfile;
  runtime: AgentRuntimeConfig;
  status: AgentStatus;
  stats: AgentStats;
  /** 由哪个 Agent 创建（初始 Agent 为 null；Dispatcher 铸造新 Class Agent 时为本字段赋值） */
  createdByAgentId: AgentId | null;
  createdAt: ISODateTime;
  retiredAt: ISODateTime | null;
  /** prompt 版本号，便于比较不同版本的表现 */
  promptVersion: string;
}

/** 一次调用日志。环形保留最近 200 条，避免 LocalStorage 爆掉。 */
export interface AgentInvocationLog {
  id: InvocationId;
  agentId: AgentId;
  ts: ISODateTime;
  purpose:
    | 'route_idea'
    | 'generate_quests'
    | 'review_chain'
    | 'arbitrate_reflection'
    | 'network_advice'
    | 'create_class'
    | 'monthly_digest';
  /** 输入摘要（原文过长时截断），用于复盘 Agent 表现 */
  inputDigest: string;
  /** 原始输出（调试用，仅保留最近 20 条完整原文） */
  rawOutput: string | null;
  parsedOk: boolean;
  errorMessage: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AgentState {
  records: AgentRecord[];
  invocations: AgentInvocationLog[];
  /** Dispatcher 是唯一永不退役的 Agent */
  dispatcherId: AgentId;
  /** 已退役但保留档案的 classId 列表 */
  retiredClassIds: ClassIdLiteral[];
}

// ---------------------------------------------------------------------------
// 2. AI 运行时（DeepSeek 接口预留）
// ---------------------------------------------------------------------------

export interface AiRuntimeState {
  provider: 'deepseek' | 'mock';
  baseUrl: string;
  /** 默认模型 */
  model: string;
  /**
   * API Key 不存于此对象。仅存"在 LocalStorage 中的键名"，
   * 真正的 key 由独立模块读写，避免存档导出时泄漏。
   */
  apiKeyStorageKey: string;
  /** 是否已配置可用 key */
  configured: boolean;
  /** Mock 模式：无 key 时用本地模板库生成任务，保证离线可用 */
  mockModeEnabled: boolean;
  usage: {
    /** 自然月，'YYYY-MM' */
    month: string;
    tokensIn: number;
    tokensOut: number;
    costUsdCents: number;
    /** 月度预算，超出后自动降级为 mock */
    budgetUsdCents: number;
  };
  /** 最近一次连通性测试 */
  lastHealthCheck: { ok: boolean; at: ISODateTime; message: string } | null;
  /** 全局熔断：连续失败 N 次后暂停 AI 调用，改为提示玩家 */
  circuitBreaker: { open: boolean; consecutiveFailures: number; openedAt: ISODateTime | null };
}

// ---------------------------------------------------------------------------
// 3. 通用：调用信封 (Envelope)
// ---------------------------------------------------------------------------

/** 所有 Agent 调用的统一返回信封。失败时前端走本地兜底，不阻塞玩家。 */
export type AgentResult<T> =
  | {
      ok: true;
      data: T;
      invocationId: InvocationId;
      agentId: AgentId;
      /** 本次调用是实时 API 还是 mock 兜底 */
      source: 'api' | 'mock' | 'cache';
      latencyMs: number;
      /** 若 AI 输出被本地规则修正过（如 clamp 数值），记录修正说明 */
      corrections: string[];
    }
  | {
      ok: false;
      error: { code: AgentErrorCode; message: string; retryable: boolean };
      invocationId: InvocationId | null;
      agentId: AgentId;
    };

/**
 * 一次调用为什么没成。
 *
 * 分成三族，因为三族该被**区别对待**（见 bus.ts 的 `tripsCircuit`）：
 *
 *   · **对面病了**（`network_error` / `timeout`）—— 5xx、断网、超时。
 *     它们会推开熔断：服务现在不对劲，再发几次也只是白等。
 *   · **我们这边不对**（`unauthorized`）—— 401 / 403。密钥无效不是服务的错，
 *     重试一百次也是同一个 401。它**不计入熔断**：把"密钥填错了"报成
 *     "AI 服务暂时熔断"，会让人去检查网络，而真正要改的那一格在控制室里。
 *   · **闸门拦下的**（`not_configured` / `budget_exceeded` / `circuit_open`）——
 *     压根没发出去，是设计内的降级。
 */
export type AgentErrorCode =
  | 'not_configured'
  /** 密钥无效或没有权限（HTTP 401 / 403）。与"还没配密钥"是两件事，所以是两个码。 */
  | 'unauthorized'
  | 'network_error'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_json'
  | 'schema_violation'
  | 'budget_exceeded'
  | 'circuit_open'
  | 'content_refused'
  | 'unknown';

// ---------------------------------------------------------------------------
// 4. Dispatcher 契约
// ---------------------------------------------------------------------------

export interface DispatcherInput {
  /** 玩家原始输入的想法/意图，例如"我想做一个能预测蛋白结合位点的模型" */
  rawIdea: string;
  /** 玩家是否勾选了深度推演 */
  deepDeduction: boolean;
  /** 期望的任务形态偏好（可空） */
  preferredShape: 'single' | 'chain' | 'auto' | null;
  /** 现有职业线摘要（由本地组装，避免 AI 幻觉出不存在的 classId） */
  existingClasses: Array<{ classId: ClassIdLiteral; displayName: string; level: number; domains: string[] }>;
  /** 当前篇章上下文 */
  currentChapter: { id: string; title: string; theme: string; primaryGoalIds: GoalId[] };
  /** 玩家当前属性与精力，用于难度建议 */
  playerSnapshot: { attributes: Record<AttributeKey, number>; energy: number; level: number };
}

export interface DispatcherDecision {
  /** 对玩家想法的一句话归纳（会回显给玩家确认理解无误） */
  intentSummary: string;
  /** 语言检测 */
  language: 'zh' | 'en' | 'mixed';

  /**
   * 归属判定。
   * classId 为 'NEW' 时，proposedClass 必须有值，且 needsBlueprint = true。
   */
  routing: {
    primaryClass: ClassIdLiteral | 'NEW';
    primaryConfidence: Ratio;      // 0..1
    /** 跨领域：这个想法同时属于哪些已有职业线 */
    secondaryClassIds: ClassIdLiteral[];
    rationale: string;
  };

  /** routing.primaryClass === 'NEW' 时必填 */
  proposedClass: ProposedClass | null;

  /** 任务形态建议 */
  questShape: {
    kind: 'single' | 'chain';
    /** chain 时的建议步数（Agent B 会最终裁定） */
    suggestedChainLength: number | null;
    suggestedType: 'main' | 'side' | 'special' | 'milestone';
  };

  /** 该想法最应服务的终极目标 */
  linkedGoalIds: GoalId[];

  /**
   * 信息不足时的**唯一一个**澄清问题。
   * 契约：最多一个问题，且必须给出候选选项。禁止连环追问。
   */
  clarification: {
    question: string;
    options: string[];
    whyItMatters: string;
  } | null;

  /** 是否建议走深度推演（即使玩家没勾，也可建议） */
  recommendDeepDeduction: boolean;
  recommendReason: string;
}

/** Dispatcher 提议创建的新职业 */
export interface ProposedClass {
  classId: ClassIdLiteral;
  displayName: string;
  creed: string;
  /** 该领域的关键词，注入给新建的 Class Agent */
  domains: string[];
  /** 该 Agent 的人格描述（会作为生成 agent 的输入） */
  personaBrief: string;
  /** 关联终极目标 */
  linkedGoalIds: GoalId[];
  /** 属性权重建议 */
  attributeWeights: Partial<Record<AttributeKey, number>>;
  /** 头衔阶梯建议（3-6 档） */
  titleTiers: Array<{ fromLevel: number; title: string; requirementHint: string }>;
  /** 经验曲线建议 */
  expCurve: { base: number; exponent: number; maxLevel: number };
  /** 为什么这个领域值得独立成线 */
  justification: string;
}

// ---------------------------------------------------------------------------
// 5. Class Agent 契约
// ---------------------------------------------------------------------------

export interface ClassAgentInput {
  /** 玩家原始想法（可能来自 Dispatcher 转发） */
  rawIdea: string;
  /**
   * Dispatcher 的意图归纳与形态建议。
   * 取整个 `routing` 而不是只取 routing.secondaryClassIds：
   * 职业 Agent 需要知道"这个想法还沾了哪条线"，也就需要看到归属判定本身
   * （primaryClass 除外——那已经由调用方决定把请求发给谁了）。
   */
  dispatch: Pick<DispatcherDecision, 'intentSummary' | 'questShape' | 'linkedGoalIds' | 'routing'>;
  /** 该职业线的当前状态 */
  career: {
    classId: ClassIdLiteral;
    displayName: string;
    level: number;
    title: string;
    stats: { questsCompleted: number; expEarnedTotal: number };
    /** 该职业最近完成的 5 个任务标题，避免生成重复内容 */
    recentQuestTitles: string[];
  };
  /** 玩家上下文 */
  playerSnapshot: {
    attributes: Record<AttributeKey, number>;
    energy: number;
    /** 当前篇章的情绪基调，影响文案语气 */
    chapterTone: string;
    timeOfDay: string;
  };
  /** 金库量级（可能影响任务中的金钱建议，注意：不提供投资建议） */
  vaultSummary: { netWorthUsdCents: UsdCents; cashUsdCents: UsdCents } | null;
  /** 近期成功日记的两条洞见，用于延续玩家的关注点 */
  recentInsights: string[];
}

/** 单个任务草稿。这是"AI 生成 → 玩家审核 → 领取"链路的原子单位。 */
export interface QuestDraft {
  /** 链内临时 ID，用于表达 prerequisites 关系，落库时替换为真实 QuestId */
  tempId: string;
  title: string;
  subtitle: string;
  narrative: string;
  objective: string;
  type: 'main' | 'side' | 'special' | 'milestone';
  difficulty: Difficulty;
  effortEstimate: EffortEstimate;
  reward: {
    exp: number;
    vaultUsdCents?: UsdCents;
    attributePoints?: Partial<Record<AttributeKey, number>>;
  };
  /** 完成后对玩家的可见收益（资历/技能/作品） */
  outcomeHints: string[];
  linkedGoalIds: GoalId[];
  linkedAttributes: AttributeKey[];
  /** 指向同批次其它任务的 tempId */
  prerequisiteTempIds: string[];
  dueHintDays: number | null;
  /** 可验证完成条件。契约：必须具体到能被第三人判断真假 */
  proof: { criterion: string; kind: 'text' | 'link' | 'number' | 'screenshot' } | null;
  tags: string[];
}

export interface ClassAgentOutput {
  /** 生成模式自述，便于调试 */
  mode: 'single_quest' | 'chain';
  /**
   * 链的包装块。四个字段都可缺省 —— 校验器不把它们列为必填（见 schemas.ts）：
   * `title` / `rationale` 缺了，`adaptClassOutput` 有诚实的兜底顶上（灵感开头 /
   * 职业信条）并记一笔 corrections；`estimatedTotalEffort` / `deliverables`
   * 在真实管线里没有消费者。一次"少写一句理由就整单退回模板"的线上事故，
   * 就是从这里放行的。
   */
  chain: {
    title?: string;
    /** 为什么这条链能把你推向终极目标（玩家可见） */
    rationale?: string;
    /** 该链整体预估周期 */
    estimatedTotalEffort?: EffortEstimate;
    /** 该链预期产出的"作品/证据"，这是最有价值的部分 */
    deliverables?: string[];
  } | null;
  quests: QuestDraft[];
  /** 给玩家的一句寄语（克制、不吹捧） */
  closingNote: string;
  /** 生成器自评：本次生成中哪些信息不确定 */
  uncertainties: string[];
}

// ---------------------------------------------------------------------------
// 6. Chain Reviewer（Agent B · 深度推演审核）契约
// ---------------------------------------------------------------------------

export interface ChainReviewInput {
  /** Agent A 的完整输出 */
  draft: ClassAgentOutput;
  /** 玩家的原始想法 */
  rawIdea: string;
  /** 玩家当前等级与精力 */
  playerSnapshot: { level: number; energy: number; recentCompletionRate: Ratio };
  /** 该职业近期完成情况，用于难度校准 */
  recentPerformance: { avgDifficultyCompleted: number; abandonRate: Ratio };
}

export interface ChainReviewOutput {
  approved: boolean;
  /** 审核意见（玩家可见，作为"参谋意见"展示在审核面板上） */
  reviewerNote: string;
  /** 修订后的任务列表（按建议执行顺序排列；整链会一并列给玩家审核） */
  revisedQuests: QuestDraft[];
  /** 若 approved === false，说明需要 Agent A 重做的要点 */
  revisionInstructions: string[];

  /** 难度曲线自评 */
  difficultyCurve: {
    /** 是否呈阶梯上升 */
    isAscending: boolean;
    comment: string;
  };

  /**
   * 剧透检查（降压版）：任务 N 的文案不得给出任务 N+1 的答案/结论。
   * 整链在审核时已全部展示给玩家，因此不再要求"互相不可见"；
   * 但玩家仍是按顺序执行的，提前把后面的结论写在前面，会削弱执行时的新鲜感。
   */
  spoilerCheck: {
    passed: boolean;
    leakingTempIds: string[];
    comment: string;
  };

  /** 串联性检查：每个任务的产出是否真的被下一个任务使用 */
  continuityCheck: {
    passed: boolean;
    /** 断链的地方 */
    brokenJoints: Array<{ fromTempId: string; toTempId: string; issue: string }>;
  };

  /** 最终建议的解锁顺序（tempId 数组） */
  finalOrder: string[];
}

// ---------------------------------------------------------------------------
// 7. Network Advisor 契约
// ---------------------------------------------------------------------------

export interface NetworkAdviceInput {
  /** 玩家描述当前处境 */
  situation: string;
  /** 需要针对的具体问题 */
  questionKind: 'first_contact' | 'deepen' | 'repair' | 'boundary' | 'reconnect' | 'difficult_conversation' | 'general';
  /** 精简的联系人上下文（见 network.ts 的 ContactContextForAI） */
  contact: ContactContextForAI;
  /** 玩家自身状态，用于判断"你现在适合处理这件事吗" */
  playerState: {
    energy: number;
    /** 近期情绪标签，若玩家处于低谷，AI 应先照顾状态 */
    recentEmotions: EmotionTag[];
    currentChapterTone: string;
  };
}

/**
 * 「有这件事，该找谁」——全局检索模式的输入（见 NetworkAdviceInput 的分工）。
 *
 * 与单联系人模式共用同一个 Agent 与同一份输出契约，
 * 区别只在 payload：那边给一个 `contact`，这边给一份 `candidates` 名单。
 * 输出里的 `recommendedContacts` 就是在这份名单里挑人。
 *
 * ⚠️ `candidates` 里的 `contactId` 是**我们发的**，模型没有别的 id 来源 ——
 *    所以"挑不出来"是允许的（返回空数组），"挑了一个名单外的"才叫出错。
 */
export interface SolverConsultInput {
  /** 玩家描述的现实困境 */
  question: string;
  /** 通讯录节选。刻意不整本发过去：几十个人的私人档案不该为一次求助全部出门 */
  candidates: Array<{
    contactId: ContactId;
    name: string;
    relationType: RelationType;
    /** `null` = 还没定过（手动加进名单的人从这里起步） */
    stage: RelationStage | null;
    /** 领域 / 角色 / 在哪里认识的 —— 检索真正依赖的那几个字段 */
    field: string;
    /** 玩家亲手写的一段话（可能为 null）。唯一能说明"这个人是谁"的叙述性字段 */
    note: string | null;
    /** 共同点与"为什么重要"，这是模型判断"接不接得住"的主要依据 */
    commonGround: string[];
    whyItMatters: string[];
    /** 边界。开口建议必须绕开它们 */
    boundaries: string[];
    /** 最近交集摘要（最多 3 条） */
    recentInteractions: string[];
    daysSinceLastContact: number;
  }>;
  playerState: {
    energy: number;
    recentEmotions: EmotionTag[];
    currentChapterTone: string;
  };
}

export interface NetworkAdviceOutput {
  /** 对处境的复述（先确认理解，再给建议） */
  situationRead: string;
  /** 对人性的中性观察 —— 看透，但不评判，不带目的性 */
  humanRead: string;
  /** 核心建议动作 */
  suggestedAction: {
    timing: string;
    channel: string;
    /** 可直接使用的开场白。要求：真诚、具体、无套路感 */
    openingLine: string;
    intent: string;
  } | null;
  /** 明确不要做的事。高情商 = 知道不做什么 */
  avoid: string[];
  /** 底层心法，一行 */
  principle: string;
  /** 长期视角：这件事放到三个月/三年尺度上看 */
  longTermView: string;
  /** 能量提示：如果玩家现在状态不好，是否建议暂缓 */
  energyNote: string;
  /** 建议之后是否值得记一条互动 */
  suggestLogging: boolean;
  confidence: Ratio;
  /**
   * 「有这件事，该找谁」——全局检索模式下的推荐人选（0~2 位）。
   *
   * 单联系人模式（`askNetworkAdvisor`）下恒为 `null`/缺省：
   * 那时人已经定了，没有可推荐的东西。
   *
   * ⚠️ `contactId` 必须是调用方在 payload 里给出的候选 id 之一。
   *    模型看不到通讯录，它只是被要求"只能从上面这份名单里挑" ——
   *    所以 `contactId` 编造得出来，而它编出来的那一刻**必须被拦住**：
   *    玩家点过去会看到一张不存在的联系人卡。拦住它的地方是
   *    `ai/adapters.ts` 的 `adaptSolverReport`（那里才查得到真实名单）。
   */
  recommendedContacts: Array<{ contactId: string; reason: string; approach: string }> | null;
}

// ---------------------------------------------------------------------------
// 8. Arbiter（复盘判官）契约
// ---------------------------------------------------------------------------

export interface ArbiterInput {
  quest: {
    questId: QuestId;
    title: string;
    objective: string;
    type: string;
    difficulty: Difficulty;
    classId: ClassIdLiteral | null;
    /** 基础奖励，用于让 Arbiter 知道上限语境 */
    baseReward: { exp: number; vaultUsdCents?: UsdCents };
  };
  /** 玩家写下的复盘原文 */
  reflection: string;
  /** 实际耗时（可空） */
  actualEffortMinutes: number | null;
  /** 玩家自评难度 1-5（可空） */
  selfRatedDifficulty: number | null;
  /** 该任务的验证条件与玩家提交的证据 */
  proof: { criterion: string; submitted: string | null } | null;
  /** 玩家近期状态，用于判定的"温度" */
  playerState: { energy: number; recentEmotions: EmotionTag[]; recentBonusAvg: number };
  /** 本任务关联的进化树标签候选域（帮助 Arbiter 精确打标） */
  milestoneTagVocabulary: Array<{ branch: string; tag: string; description: string }>;
  /**
   * 本地规则：判分区间与硬约束，Arbiter 必须遵守。
   * 两步判定：先判"是否加成"（baseline → 0%），再在 [bonusMinPct, bonusMaxPct] 内取值。
   */
  policy: { bonusMinPct: number; bonusMaxPct: number; wordCountFloor: number };
}

export interface ArbiterVerdictPayload {
  /** 质量档位 */
  quality: ReflectionQuality;
  /** 建议加成百分比。契约：必须落在 [policy.bonusMinPct, policy.bonusMaxPct] 内 */
  bonusPct: number;
  /** 给玩家看的一句话点评。要求：具体、沉稳、不安慰、不吹捧 */
  comment: string;
  /** 抽出的洞见 */
  insights: JournalInsight[];
  /**
   * 静默里程碑标签。必须从 milestoneTagVocabulary 中选取，不得自创。
   * ⚠️ 这些标签不会展示给玩家。
   */
  milestoneTags: string[];
  /** 每个标签的可信度 */
  milestoneConfidence: Array<{ tag: string; confidence: Ratio }>;
  /** 情绪标签 */
  emotions: EmotionTag[];
  /** 是否识破了"空话套话"（用于调试判定质量） */
  detectedFluff: boolean;
  /** 建议的后续动作（玩家可选择一键建草稿） */
  suggestedFollowUps: Array<{ title: string; rationale: string }>;
}

// ---------------------------------------------------------------------------
// 9. Blueprint Generator（新建职业）契约
// ---------------------------------------------------------------------------

export interface BlueprintInput {
  /** 触发新建的原始想法 */
  rawIdea: string;
  /** Dispatcher 的提议（作为参考，可被修正） */
  proposal: ProposedClass;
  /** 现有职业线列表，避免重复与人格撞车 */
  existingClasses: Array<{ classId: ClassIdLiteral; displayName: string; creed: string; domains: string[] }>;
}

export interface BlueprintOutput {
  /** 最终确定的职业定义 */
  classDefinition: ProposedClass;
  /** 为该职业新写的 system prompt 正文（不含输出契约部分，由模板自动拼接） */
  systemPromptBody: string;
  /**
   * 该职业的初始日常**推荐**（2-4 条）。
   * 🔴 只是建议：日常只能由玩家创建——这些推荐会进入待裁决队列，
   * 玩家逐条采纳（可先改标题/频率）后才成为正式日常，忽略即消失。
   */
  recommendedDailies: Array<{ title: string; targetPerDay: number; iconKey: string; rationale: string }>;
  /** 该职业的初始支线任务种子（3 条，玩家可领取） */
  seedQuests: QuestDraft[];
  /** 该职业如何推进玩家的终极目标 */
  goalAlignment: string;
}

// ---------------------------------------------------------------------------
// 10. Prompt 组装器的输入契约
// ---------------------------------------------------------------------------

/** 组装 system prompt 时注入的动态上下文（精简、控 token） */
export interface PromptContextDigest {
  player: { handle: string; level: number; attributes: Record<AttributeKey, number>; energy: number };
  chapter: {
    title: string;
    subtitle: string;
    theme: string;
    emotionalTone: string;
    /**
     * 同时可推进的其它支线标题（篇章是 DAG，可并行）。
     * AI 的任务文案不应假设"玩家只在这一个篇章里"。
     */
    parallelChapterTitles: string[];
  };
  endgameGoals: Array<{ id: GoalId; title: string; progressPct: number }>;
  activeCareer: { classId: ClassIdLiteral | null; displayName: string; level: number; title: string };
  activeQuests: Array<{ title: string; status: string; difficulty: Difficulty }>;
  recentJournal: Array<{ questTitle: string; excerpt: string; bonusPct: number }>;
  vaultSummary: { netWorthLabel: string } | null;
  networkSummary: { totalContacts: number } | null;
  timeOfDay: string;
  /** 当前是否处于 mock 模式，影响 prompt 里的自我要求 */
  mockMode: boolean;
}

/** 一次完整的待发送请求 */
export interface AgentRequest<TPayload> {
  agentId: AgentId;
  /** 已组装好的 system prompt 全文 */
  systemPrompt: string;
  /** 结构化输入（会被序列化为 JSON 放进 user message） */
  payload: TPayload;
  runtime: AgentRuntimeConfig;
  /** 期望的输出 Schema 名，用于解析校验（见 src/ai/schemas.ts） */
  schemaName: SchemaName;
}
