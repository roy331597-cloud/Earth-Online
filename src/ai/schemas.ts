// ============================================================================
// EarthOnline · Phase 1 · Agent 输出 JSON Schema（唯一权威）
//
// ⚠️ 本文件是 AI 输出契约的**唯一事实来源**。
//    如果修改了某个 Schema，必须同步修改 src/ai/prompts/ 下对应的提示词，
//    否则提示词会与实际校验规则漂移。
//
// 校验策略（Phase 4 实现）：
//    1. JSON.parse（失败 → AgentErrorCode.invalid_json）
//    2. 结构校验（失败 → schema_violation）
//    3. 数值 clamp（修正记录进 AgentResult.corrections，不算失败）
//    4. 任一失败 → 走本地兜底（mock），不阻塞玩家
// ============================================================================

/** 极简 JSON Schema 子集——足够表达本项目所有契约，避免引入 ajv 依赖 */
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  /** 允许 null（本项目大量使用可空字段） */
  nullable?: boolean;
}

const str = (maxLength?: number): JsonSchema => ({ type: 'string', ...(maxLength ? { maxLength } : {}) });
const num = (min?: number, max?: number): JsonSchema => ({
  type: 'number',
  ...(min !== undefined ? { minimum: min } : {}),
  ...(max !== undefined ? { maximum: max } : {}),
});
const arr = (items: JsonSchema, minItems = 0, maxItems = 12): JsonSchema => ({
  type: 'array',
  items,
  minItems,
  maxItems,
});

// ---------------------------------------------------------------------------
// 公共片段
// ---------------------------------------------------------------------------

/**
 * 五个终极目标的合法 id。
 *
 * ⚠️ 它**不再出现在任何 schema 的 enum 上**（2026-10-07 线上事故）：
 *    模型把「全球通行海外身份」写成自造的 OVERSEAS_IDENTITY —— 语义全对、
 *    名字不在册，enum 当场把**整次调度**拒掉（「取值不在允许范围内」），
 *    而那一趟里其余的内容（路由、拟建的新职业线、信心度）全部连坐作废，
 *    玩家拿到一条吓人的提示，实际损失与提示完全不成比例。
 *    先例是 adaptSolverReport 对编造 contactId、adaptArbiterVerdict 对词表外
 *    里程碑标签的处理：**内容层的越界该在适配层被丢弃并留痕，而不是把整单作废**。
 *    所以三个消费点（questDraft / proposedClass / dispatcher 顶层）的 enum 都撤了，
 *    校验只保证"是一串不长的字符串"，认不认得由 adapters 的 filterGoalIds 说了算。
 *
 * 这个数组仍是"哪五个是合法的"的唯一定义处 —— 提示词的对照表（00-shared-context
 * 第一节）与适配层的过滤器都从它出发。改这里就是改全局。
 */
export const GOAL_IDS = ['A9_ASSETS', 'GLOBAL_MOBILITY', 'PRIVATE_LAB', 'GEO_INDEPENDENT_WORK', 'SOULMATE'] as const;
const ATTRIBUTE_KEYS = ['vit', 'int', 'foc', 'cha', 'wil', 'cap'] as const;
const QUEST_TYPES = ['main', 'side', 'special', 'milestone'] as const;
const PROOF_KINDS = ['text', 'link', 'number', 'screenshot'] as const;

const rewardSchema: JsonSchema = {
  type: 'object',
  properties: {
    exp: num(20, 1500),
    vaultUsdCents: { ...num(0), nullable: true },
    attributePoints: {
      type: 'object',
      properties: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, num(0, 2)])),
      // 输出纪律第 2 条教模型"缺失的可选项用 `null`"（00-shared-context 第四节），
      // `attributePoints: null` 就是它最规矩的写法。旧 schema 不认这个 null，
      // 把一份内容完好的草稿整单拒掉（2026-10-07 存档审计的第 4 条调用死在
      // 这一格上：「期望对象，收到 null」）。收下它，落库前由 adapters 擦成
      // "没有这一格"——提示词与 schema 之间不该有互相打架的两套纪律。
      nullable: true,
    },
  },
  required: ['exp'],
};

const questDraftSchema: JsonSchema = {
  type: 'object',
  properties: {
    tempId: str(40),
    title: str(28),
    subtitle: str(40),
    narrative: str(240),
    objective: str(400),
    type: { type: 'string', enum: QUEST_TYPES },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    effortEstimate: {
      type: 'object',
      properties: {
        unit: { type: 'string', enum: ['min', 'hour', 'day'] },
        value: num(5, 60),
      },
      required: ['unit', 'value'],
    },
    reward: rewardSchema,
    outcomeHints: arr(str(60), 1, 4),
    // 目标 id 不设 enum：认不认得出由 adapters.filterGoalIds 判定（见 GOAL_IDS 注释）
    linkedGoalIds: arr(str(40), 0, 5),
    linkedAttributes: arr({ type: 'string', enum: ATTRIBUTE_KEYS }, 1, 4),
    prerequisiteTempIds: arr(str(40), 0, 8),
    dueHintDays: { ...{ type: 'integer', minimum: 1, maximum: 90 }, nullable: true },
    proof: {
      type: 'object',
      properties: {
        criterion: str(160),
        kind: { type: 'string', enum: PROOF_KINDS },
      },
      required: ['criterion', 'kind'],
      nullable: true,
    },
    tags: arr(str(30), 0, 6),
  },
  required: [
    'tempId', 'title', 'subtitle', 'narrative', 'objective', 'type',
    'difficulty', 'effortEstimate', 'reward', 'outcomeHints',
    'linkedGoalIds', 'linkedAttributes', 'prerequisiteTempIds',
    'dueHintDays', 'proof', 'tags',
  ],
};

// ---------------------------------------------------------------------------
// 各 Agent 输出 Schema
// ---------------------------------------------------------------------------

/** Dispatcher_Agent 输出 */
const dispatcherDecisionSchema: JsonSchema = {
  type: 'object',
  properties: {
    intentSummary: str(80),
    language: { type: 'string', enum: ['zh', 'en', 'mixed'] },
    routing: {
      type: 'object',
      properties: {
        primaryClass: str(48),
        primaryConfidence: num(0, 1),
        secondaryClassIds: arr(str(48), 0, 4),
        rationale: str(120),
      },
      required: ['primaryClass', 'primaryConfidence', 'secondaryClassIds', 'rationale'],
    },
    proposedClass: {
      type: 'object',
      properties: {
        classId: str(48),
        displayName: str(48),
        creed: str(40),
        domains: arr(str(40), 2, 10),
        personaBrief: str(160),
        // 同上：enum 已撤，合法性由适配层过滤（见 GOAL_IDS 注释）
        linkedGoalIds: arr(str(40), 1, 5),
        attributeWeights: {
          type: 'object',
          properties: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, num(0, 1)])),
        },
        titleTiers: arr(
          {
            type: 'object',
            properties: {
              fromLevel: { type: 'integer', minimum: 1, maximum: 99 },
              title: str(24),
              requirementHint: str(60),
            },
            required: ['fromLevel', 'title', 'requirementHint'],
          },
          4, 6,
        ),
        expCurve: {
          type: 'object',
          properties: { base: num(40, 300), exponent: num(1, 2), maxLevel: { type: 'integer', minimum: 30, maximum: 200 } },
          required: ['base', 'exponent', 'maxLevel'],
        },
        justification: str(120),
      },
      required: ['classId', 'displayName', 'creed', 'domains', 'personaBrief', 'linkedGoalIds', 'attributeWeights', 'titleTiers', 'expCurve', 'justification'],
      nullable: true,
    },
    questShape: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['single', 'chain'] },
        // PO 2026-10-09 口径：建议 8~40 步（「几十条也是可以接受的」），
        // 硬上限 60 由 adapters 的 MAX_DRAFTS 守。越界由 validate 的 clamp
        // 记 corrections 收拢（不失败）—— 这里收的是**建议值**，不是链本身。
        suggestedChainLength: { ...{ type: 'integer', minimum: 8, maximum: 40 }, nullable: true },
        suggestedType: { type: 'string', enum: QUEST_TYPES },
      },
      required: ['kind', 'suggestedChainLength', 'suggestedType'],
    },
    // 同上：enum 已撤，合法性由适配层过滤（见 GOAL_IDS 注释）
    linkedGoalIds: arr(str(40), 0, 5),
    clarification: {
      type: 'object',
      properties: {
        question: str(100),
        options: arr(str(60), 2, 4),
        whyItMatters: str(100),
      },
      required: ['question', 'options', 'whyItMatters'],
      nullable: true,
    },
    recommendDeepDeduction: { type: 'boolean' },
    recommendReason: str(120),
  },
  required: ['intentSummary', 'language', 'routing', 'proposedClass', 'questShape', 'linkedGoalIds', 'clarification', 'recommendDeepDeduction', 'recommendReason'],
};

/** 全体 Class Agent 输出 */
const classAgentOutputSchema: JsonSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['single_quest', 'chain'] },
    chain: {
      type: 'object',
      properties: {
        title: str(28),
        rationale: str(160),
        estimatedTotalEffort: {
          type: 'object',
          properties: { unit: { type: 'string', enum: ['min', 'hour', 'day'] }, value: num(1, 90) },
          required: ['unit', 'value'],
        },
        deliverables: arr(str(60), 1, 5),
      },
      // ⚠️ 这一块刻意**不列 required**：它是包装，不是内容 —— 内容是 quests。
      //    线上的一次回复少写了一句 chain.rationale，整单被打回本地轨道：
      //    模型明明把每一步都给出了，玩家却拿到了模板。而适配器对这一句本来
      //    就有诚实的兜底（职业信条），`title` 缺了能用灵感开头顶上，
      //    `estimatedTotalEffort` / `deliverables` 在真实管线里没有消费者。
      //    必填只该留给"缺了就真的不成链"的东西。
      nullable: true,
    },
    // 上限 200 是**荒谬界**，不是链长口径 —— 2026-10-09 起一条链的硬上限是
    // 60 步，但它在**适配层**守（adapters.MAX_DRAFTS：超出的截断并留痕）。
    // 若 schema 也卡 60，一条 65 步的回复会在校验期被整稿拒掉、降级回本地
    // 轨道 —— 玩家手里的长链反而掉成 5 步模板，那是"没接住"，不是"拦住了"。
    // 曾长期是 7（轮 C 口径的余量）：那才是静默截断，比适配层更早、更隐蔽。
    quests: arr(questDraftSchema, 1, 200),
    closingNote: str(80),
    uncertainties: arr(str(100), 0, 5),
  },
  required: ['mode', 'chain', 'quests', 'closingNote', 'uncertainties'],
};

/** Chain_Reviewer_Agent 输出 */
const chainReviewOutputSchema: JsonSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    reviewerNote: str(120),
    // 上界同 quests：审核官修订的正是那副原始稿，链长跟着走（200 是荒谬界）。
    revisedQuests: arr(questDraftSchema, 1, 200),
    revisionInstructions: arr(str(120), 0, 6),
    difficultyCurve: {
      type: 'object',
      properties: { isAscending: { type: 'boolean' }, comment: str(80) },
      required: ['isAscending', 'comment'],
    },
    spoilerCheck: {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        leakingTempIds: arr(str(40), 0, 200), // 上界同 quests（泄漏清单再长也不超过链长）
        comment: str(80),
      },
      required: ['passed', 'leakingTempIds', 'comment'],
    },
    continuityCheck: {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        brokenJoints: arr(
          {
            type: 'object',
            properties: { fromTempId: str(40), toTempId: str(40), issue: str(100) },
            required: ['fromTempId', 'toTempId', 'issue'],
          },
          0, 200, // 上界同 quests（断口数不可能超过链长）
        ),
      },
      required: ['passed', 'brokenJoints'],
    },
    finalOrder: arr(str(40), 1, 200), // 上界同 quests —— 排的就是刚审过的那条链
  },
  required: ['approved', 'reviewerNote', 'revisedQuests', 'revisionInstructions', 'difficultyCurve', 'spoilerCheck', 'continuityCheck', 'finalOrder'],
};

/** Network_Advisor_Agent 输出 */
const networkAdviceOutputSchema: JsonSchema = {
  type: 'object',
  properties: {
    situationRead: str(200),
    humanRead: str(200),
    suggestedAction: {
      type: 'object',
      properties: {
        timing: str(80),
        channel: str(40),
        openingLine: str(200),
        intent: str(80),
      },
      required: ['timing', 'channel', 'openingLine', 'intent'],
      nullable: true,
    },
    avoid: arr(str(100), 1, 6),
    principle: str(60),
    longTermView: str(160),
    energyNote: str(120),
    suggestLogging: { type: 'boolean' },
    confidence: num(0, 1),
    /**
     * 「有这件事，该找谁」的推荐人选（0~2 位）。
     *
     * 只在**全局检索模式**下有值 —— 那时 payload 给的是一份候选名单
     * （`candidates: [{contactId, name, ...}]`），模型从中挑人。
     * 单联系人模式（"关于某个人，话怎么说"）下必须是 `null`：人都定了，
     * 没有可推荐的东西，硬填一条会让玩家看到"智囊建议你去找你刚才问的那个人"。
     *
     * ⚠️ `contactId` 是我们发过去的 id，不是模型想出来的名字。
     *    编造的 id 由 `ai/adapters.ts` 的 `adaptSolverReport` 拦下 ——
     *    这一层只保证它是字符串。
     */
    recommendedContacts: {
      ...arr(
        {
          type: 'object',
          properties: { contactId: str(48), reason: str(160), approach: str(160) },
          required: ['contactId', 'reason', 'approach'],
        },
        0, 2,
      ),
      nullable: true,
    },
  },
  required: ['situationRead', 'humanRead', 'suggestedAction', 'avoid', 'principle', 'longTermView', 'energyNote', 'suggestLogging', 'confidence', 'recommendedContacts'],
};

/**
 * Arbiter_Agent 输出。
 *
 * 加成是两步判定：
 *   ① 先判"是否加成"—— quality === 'baseline'（套话/复述/无具体信息）时 bonusPct 必须为 0；
 *   ② 通过资格线（solid 及以上）后，再在难度区间内取值。
 * schema 上下界（0~20）是产品允许的**最宽区间**，
 * 真实可用的区间由任务难度决定（难度 1 → 6~9%，难度 5 → 5~20%）。
 * 调用方必须再走一次 `alignBonusPct(rawPct, quality, difficulty)`（双保险）。
 * 见 data/catalog/policy.ts 的 REFLECTION_BONUS_BANDS。
 */
const arbiterVerdictSchema: JsonSchema = {
  type: 'object',
  properties: {
    quality: { type: 'string', enum: ['baseline', 'solid', 'sharp', 'revelatory'] },
    bonusPct: num(0, 20),
    comment: str(100),
    insights: arr(
      {
        type: 'object',
        properties: {
          text: str(200),
          kind: { type: 'string', enum: ['method', 'mindset', 'pattern', 'risk', 'relationship', 'capital', 'other'] },
        },
        required: ['text', 'kind'],
      },
      1, 3,
    ),
    milestoneTags: arr(str(40), 0, 3),
    milestoneConfidence: arr(
      {
        type: 'object',
        properties: { tag: str(40), confidence: num(0, 1) },
        required: ['tag', 'confidence'],
      },
      0, 3,
    ),
    emotions: arr(
      { type: 'string', enum: ['calm', 'driven', 'doubtful', 'proud', 'tired', 'curious', 'anxious', 'grateful', 'lonely', 'clear'] },
      1, 3,
    ),
    detectedFluff: { type: 'boolean' },
    suggestedFollowUps: arr(
      {
        type: 'object',
        properties: { title: str(28), rationale: str(80) },
        required: ['title', 'rationale'],
      },
      0, 2,
    ),
  },
  required: ['quality', 'bonusPct', 'comment', 'insights', 'milestoneTags', 'milestoneConfidence', 'emotions', 'detectedFluff', 'suggestedFollowUps'],
};

/** Blueprint_Generator 输出 */
const blueprintOutputSchema: JsonSchema = {
  type: 'object',
  properties: {
    classDefinition: (dispatcherDecisionSchema.properties!.proposedClass as JsonSchema),
    systemPromptBody: str(8000),
    recommendedDailies: arr(
      {
        type: 'object',
        properties: {
          title: str(32),
          targetPerDay: { type: 'integer', minimum: 1, maximum: 5 },
          iconKey: str(24),
          rationale: str(60),
        },
        required: ['title', 'targetPerDay', 'iconKey', 'rationale'],
      },
      2, 4,
    ),
    // 8~10 条，与 catalog/classes.ts 手工维护的四条线同一档深度。
    // 这里曾经是 3：新铸的线只能抽一轮，"整链重抽"当场就没新鲜的可抽了 ——
    // 玩家会看到换了一批 id、文案却一模一样的"新"任务。
    seedQuests: arr(questDraftSchema, 8, 10),
    goalAlignment: str(160),
  },
  required: ['classDefinition', 'systemPromptBody', 'recommendedDailies', 'seedQuests', 'goalAlignment'],
};

// ---------------------------------------------------------------------------
// 导出表
// ---------------------------------------------------------------------------

export const SCHEMAS = {
  dispatcherDecision: dispatcherDecisionSchema,
  classAgentOutput: classAgentOutputSchema,
  chainReviewOutput: chainReviewOutputSchema,
  networkAdviceOutput: networkAdviceOutputSchema,
  arbiterVerdict: arbiterVerdictSchema,
  blueprintOutput: blueprintOutputSchema,
  /**
   * 「换个做法」的输出：**一个裸的 `QuestDraft`**，没有信封。
   *
   * 为什么复用 `questDraftSchema` 而不是另写一份：改写的产物与生成时的原子单位
   * 逐字同构，另写一份就会有两份需要同步的字段表 —— 而它们漂移的那天，
   * 正是「模型钻了宽松的那一份的空子」的那天。
   *
   * 调用时用 `AgentCall.schemaName` 显式指定（`SCHEMA_NAME_BY_KIND` 里没有它，
   * 因为改法不是一个新的 Agent 种类，见 prompts/index.ts 的 REROUTE_PROMPT）。
   */
  rerouteDraft: questDraftSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;

/**
 * 各 Agent 的默认推理参数。
 * 温度设计意图：
 *   dispatcher      0.2 —— 路由要稳定，不能今天归这条线明天归那条线
 *   class agents    0.7 —— 需要一点文学性来写叙事，但不要飘
 *   chain_reviewer  0.2 —— 审稿必须严格、可复现
 *   network_advisor 0.6 —— 需要一点人情味
 *   arbiter         0.1 —— 判分必须极其稳定，同一份复盘今天 6 分明天 9 分是灾难
 *   blueprint       0.5 —— 需要创造力，但结构必须严谨
 */
export const DEFAULT_AGENT_RUNTIME = {
  dispatcher: { temperature: 0.2, topP: 0.9, maxTokens: 1200 },
  // class 3000 → 6000：2026-10-07 的存档审计里，一条**三步**链的实际输出已经
  // 写到 2259 token —— 顶到 3000 的 75%。中文的 token 密度本就偏高，3000 是
  // 必然要破的线，而破线的那一刻就是截断（invalid_json，账已付、内容全废）。
  // maxTokens 是天花板不是预算，抬它不花钱。
  // ⚠️ 这里只是"未带 override 时的默认"。任务链生成 / 重抽 / 审核三处走
  //    thunks 的 DEEP_CHAIN_RUNTIME（打开思考 + 393216 上限），不落在这里；
  //    「换个做法」同属 class 种类但走的就是这个 6000 默认（单步小输出）。
  class: { temperature: 0.7, topP: 0.95, maxTokens: 6000 },
  // chain_reviewer 3000 → 6000：审核官要把整条链**复述回来**（revisedQuests 是
  // 完整草稿），输出天然是生成那一棒的一到两倍 —— 3000 对它从一开始就是小鞋。
  // 同 class：真实调用经 DEEP_CHAIN_RUNTIME 提额，这里只是兜底默认。
  chain_reviewer: { temperature: 0.2, topP: 0.9, maxTokens: 6000 },
  network_advisor: { temperature: 0.6, topP: 0.95, maxTokens: 1200 },
  arbiter: { temperature: 0.1, topP: 0.9, maxTokens: 1000 },
  blueprints: { temperature: 0.5, topP: 0.95, maxTokens: 4000 },
} as const;

/** 本地兜底（mock）时使用的固定返回，保证离线也能玩 */
export const MOCK_FALLBACK = {
  /** 无 API Key 时的兜底任务，直接取职业线的 seedQuests */
  questSource: 'class_seed_quests',
  /**
   * 复盘判定的兜底：档位固定为 baseline（即"未通过加成资格线"）。
   * 加成分数**不写死数值**，由 bonusForQuality('baseline', bonusBandFor(difficulty)) 求得
   * （本次修订后 baseline 一律为 0% —— 离线时不发加成）；且不写洞见、
   * 不打里程碑标签 —— 离线不该推进隐藏目标。
   */
  arbiterQuality: 'baseline' as const,
  arbiterComment: '记录下来了。这次按基础奖励发放。',
} as const;
