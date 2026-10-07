// ============================================================================
// EarthOnline · Phase 1 · 全局状态根对象 (state.ts)
// EarthOnlineState —— 唯一持久化到 LocalStorage 的对象
//
// 持久化约定：
//   1) 纯 JSON：无 Date / Map / Set / undefined / 函数 / 循环引用
//   2) 所有派生值（progress、grade、expToNext 之外的展示量）不入库，
//      由 selectors 计算。入库的派生值是"缓存"，必须标注并可在迁移时丢弃。
//   3) 写入前统一走 pruneUndefined()，避免 JSON.stringify 丢字段造成 Schema 漂移。
// ============================================================================

import type { AppSettings, CareerPortfolio, DateKey, DomainEvent, ISODateTime, Player, Vault } from './core';
import type { DailyState, QuestState, WeeklyState } from './quest';
import type { JournalState } from './journal';
import type { MilestoneSnapshot, MilestonesState } from './milestones';
import type { NetworkState } from './network';
import type { ChapterProgressState, EndgameState, EvolutionTreeState } from './endgame';
import type { Unlockables } from './achievements';
import type { WorldState } from './world';
import type { AgentState, AiRuntimeState } from './agents';

// ---------------------------------------------------------------------------
// 1. 存档元数据
// ---------------------------------------------------------------------------

export interface SaveMeta {
  /** Schema 版本，迁移的唯一依据 */
  schemaVersion: number;
  /**
   * 单调递增的修订号。每次成功持久化 +1。
   * 用途：检测多标签页并发写入；解决冲突时以 revision 大者为准 + 事件日志合并。
   */
  revision: number;
  /** 存档创建时间 */
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** 该存档的随机种子，用于给 AI 生成提供稳定的"世界线"一致性 */
  seed: string;
  /** 存档槽位名，如 'main' / 'experiment' */
  slot: string;
  /** 已完成的迁移链，便于排查 */
  migrationHistory: Array<{ from: number; to: number; at: ISODateTime; notes: string }>;
}

// ---------------------------------------------------------------------------
// 2. 全局状态
// ---------------------------------------------------------------------------

export interface EarthOnlineState {
  meta: SaveMeta;

  // —— 玩家与资产 ——
  player: Player;
  vault: Vault;
  careers: CareerPortfolio;

  // —— 进程与目标 ——
  chapters: ChapterProgressState;
  endgame: EndgameState;
  /** 至高隐藏目标。⚠️ revealed === false 时 UI 层禁止读取（见 endgame.ts 注释） */
  evolution: EvolutionTreeState;

  // —— 任务流 ——
  quests: QuestState;
  dailies: DailyState;
  /** 每周规程。与 dailies 平行，只是刻度从"天"换成"周"（结算时点：周一 01:00） */
  weeklies: WeeklyState;

  // —— 记录 ——
  journal: JournalState;
  network: NetworkState;
  /** 现实里程碑：真实世界已发生事件（签证/旅行/论文接收……）的记录 */
  milestones: MilestonesState;

  // —— AI ——
  agents: AgentState;
  ai: AiRuntimeState;

  // —— 世界 ——
  world: WorldState;

  // —— 系统 ——
  events: DomainEvent[];
  settings: AppSettings;

  /**
   * 成就/彩蛋解锁标记。
   *
   * ⚠️ 这里只记"解锁了什么"与"什么时候"，**不记进度** ——
   *    进度由 `lib/achievementEngine` 每次从整份状态现算（见那边的文件头 ②）。
   *    存一份缓存进度就等于接受了"缓存与真值会漂移"，而漂移的那天，
   *    陈列馆会安静地显示一个不成立的条件。
   */
  unlockables: Unlockables;
}

// ---------------------------------------------------------------------------
// 3. 运行时（不持久化）
// ---------------------------------------------------------------------------

/**
 * 瞬时 UI 状态。**不写入 LocalStorage**。
 * Phase 2 会用 Zustand/Context 承载它。
 */
export interface EphemeralUiState {
  /** 当前打开的结算面板所对应的任务 */
  turnInQuestId: string | null;
  /** 待确认的日常打钩（二次确认弹窗） */
  pendingDailyCheckId: string | null;
  /** 跨天结算提示是否已展示 */
  rolloverNoticeShown: boolean;
  /** 当前正在进行的 AI 调用（用于骨架屏） */
  pendingAgentCalls: Array<{ agentId: string; purpose: string; startedAt: number }>;
  /** 未读 toast 队列 */
  toasts: Array<{ id: string; kind: 'info' | 'success' | 'warn' | 'error'; text: string; createdAt: number }>;
}

// ---------------------------------------------------------------------------
// 4. 纯函数契约（Phase 3 实现，此处锁定签名）
// ---------------------------------------------------------------------------

/**
 * 跨天结算。幂等：以 state.dailies.lastSettledLocalDate 为幂等键。
 * 必须纯函数，禁止读 Date.now()（now 由参数注入，便于测试）。
 *
 * 结算时点：settings.dayRolloverHour（默认次日 01:00）。
 * 惩罚范围：**仅该日未打钩的日常本身**，不牵连其它记录、不扣金库。
 */
export type RunDailyRollover = (state: EarthOnlineState, now: Date) => {
  next: EarthOnlineState;
  result: import('./quest').RolloverResult | null;
};

/**
 * 领取任务：offered -> claimed。
 * draft 任务必须先经过**逐条审核**（ReviewQuestDraft）——
 * 链式与单任务走同一个入口；
 * 若存在未完成的 prerequisiteQuestIds，返回原状态并附拒绝原因（Phase 3 契约）。
 */
export type ClaimQuest = (state: EarthOnlineState, questId: string, now: Date) => EarthOnlineState;

/**
 * 逐条审核一个任务草稿（链式与单任务统一入口）。
 *
 * 审核面板会列出整条系列的全部任务，玩家逐个 resolve：
 *   - 'approve'：draft -> offered，随后由玩家自行「领取」；
 *   - 'reject' ：draft -> rejected，从链中剔除——保留痕迹作为 AI 的偏好信号，
 *                且**不阻塞**同链其它任务的推进。
 * 全部成员 resolve 后，链的 `review.reviewedAt` 落定。
 *
 * ⚠️ 这个联合**有意只留两态**，第三个动作不往这里塞。
 *
 * 缺的那个是「换个平缓做法 (Reroute)」：某一步太难或太枯燥时，
 * 玩家想留着重写这一步，而不是把它从链上删掉 —— 打回会让后继任务
 * 悬在半空（桥拆了，对面那一步还在等你）。
 *
 * 它之所以不在这里，是因为这两类动作的性质不同：approve / reject 是本地的、
 * 瞬间完成、永远不会失败；reroute 要等模型回话，可能超时、可能不合约束。
 * 把一个"可能要异步"的动作塞进这个函数的可选参数里，会让它从一个
 * 简单到不用想的契约退化成一个什么都做的入口。
 *
 * 形状、约束、需要的字段、留白项见 `docs/phase2/reroute-design.md`（Phase 4 落地）。
 */
export type ReviewQuestDraft = (
  state: EarthOnlineState,
  questId: string,
  decision: 'approve' | 'reject',
  now: Date,
) => EarthOnlineState;

/**
 * 「换个做法」：把某一步重写成一条更可行、但更便宜的做法。
 *
 * 形状 B（定稿于 `docs/phase2/reroute-design.md` §3.1）：入参是玩家写下的**修改诉求**，
 * 不是新任务本身。玩家说"这一步我做不到"，系统去找一个做得到的走法 ——
 * 而不是让玩家自己把任务抄一遍，那样这件事就退化成一个文本框了。
 *
 * 两条红线（见该文档 §4）：
 *   ① 降难度**必降奖励**：难度下调一档，最终 EXP 按 REDIFFICULTY_REWARD_RATIO 打折。
 *      不这么做的话，reroute 就成了刷分工具 —— 先把难任务改简单，再拿原来的钱。
 *   ② 新形态**必带后继任务的 objective 原文**：改法的合法性判据是"它还通得向下一步"。
 *      把这一步换成与后继无关的事，等于把链悄悄改道了，而那不归这一步管。
 *
 * 状态流转：旧任务 `draft -> rerouted`（留在 byId 里留档），
 * 新任务以同样的 chain 归属、同样的 index 落回 `draft` —— 它仍要过一次审核。
 * 额度：链级软上限 REROUTE_CHAIN_LIMIT（2 次），记在 ChainReview.rerouteCount 上。
 *
 * ⚠️ Phase 3 走 mockReroute 替身（与 GenerateQuestChain 走 mockForge 同一手法）；
 *    Phase 4 换真身时改的是 operations 里那一行调用，签名不变。
 */
export type RerouteQuestDraft = (
  state: EarthOnlineState,
  questId: string,
  request: string,
  now: Date,
  /**
   * 预计算的替换件（Phase 4 接缝）。不给就走 `mockReroute`，一字不改。
   *
   * ⚠️ **红线 ①（降难度必降奖励）由产出 outcome 的一方执行**，
   *    也就是替身 `mockReroute` 或外壳 `adapters.normalizeRerouteOutcome` ——
   *    这个纯函数是纯粹的消费者，不重算奖励。
   *
   *    为什么这么切：奖励换算需要读 policy 与难度档，那是**产出草稿时**
   *    才有的上下文；在这里再算一遍，等于把同一条规则写两处，
   *    而两处实现漂移的那一天，玩家会先于我们发现。
   *    两个产出方现在是两份实现（替身与外壳），所以 verify-ops 里
   *    有一条**交叉断言**：同一份输入，两条路算出来的 EXP 必须相等。
   */
  outcome?: import('../lib/mockReroute').RerouteOutcome | null,
) => EarthOnlineState;

/** 开始执行：claimed -> active */
export type StartQuest = (state: EarthOnlineState, questId: string, now: Date) => EarthOnlineState;

/**
 * 从一句灵感铸造一整条任务链（Spark Box）。
 *
 * 这是**非日常任务唯一的入口**：玩家写下想推进的事，Dispatcher 选择职业线，
 * 对应 Class Agent 产出整条链的草稿。产出全部落在 `draft` 状态上 ——
 * 铸造本身不发奖、不进背包、不影响任何进度，必须再经 `ReviewQuestDraft` 逐条过目。
 *
 * `deepDeliberation` 对应界面上的「深度推演」复选框：勾选时走 Agent A 生成
 * + Agent B 审核的两段式，审核意见落进每条任务的 `origin.reviewerNote`
 * （作为"参谋意见"展示），并置 `origin.reviewed = true`。
 *
 * ⚠️ 幂等性：同一句灵感重复铸造会产生新链，不去重 ——
 *    因为"我又想了一遍同一件事"本身是有效信息，且重生成额度另有闸门
 *    （见 RegenerateQuestChain 与 ChainReview.regenerationCount）。
 */
export type GenerateQuestChain = (
  state: EarthOnlineState,
  input: {
    /** 玩家写下的原始想法，原样留存进 origin.sourceIdea */
    idea: string;
    /** 是否勾选「深度推演」（Agent B 审核） */
    deepDeliberation: boolean;
    /** 定向到某条职业线；null 表示交给 Dispatcher 判断 */
    classId: import('./core').ClassIdLiteral | null;
    /**
     * 预计算的铸造结果（Phase 4 接缝）。
     *
     * 给了它就用它、**跳过替身**；不给（`undefined`）就走 `mockForge`，一字不改。
     *
     * 这个可选参数就是"函数式核心 / 异步外壳"那条分界线本身：
     * 上面异步地等模型回话、校验、擦干净，然后把这包东西递进来；
     * 下面仍然是纯粹的同步落库 —— 不读时钟、不改入参、无事返回原对象。
     *
     * ⚠️ 它的形状与 `mockForge` 的产出**逐字相同**（`ForgeOutput`），
     *    这不是巧合：替身与真身必须在同一个接缝上交接，否则"换真身"
     *    就会变成"换一套逻辑"，而那正是最难测的一类改动。
     */
    forged?: import('../lib/mockForge').ForgeOutput | null;
  },
  now: Date,
) => EarthOnlineState;

/** 点击完成：active -> turn_in_pending */
export type OpenTurnIn = (state: EarthOnlineState, questId: string, now: Date) => EarthOnlineState;

/**
 * 确认结算：turn_in_pending -> completed。
 * 复盘文字由 Arbiter 判定（异步）后回填；本函数负责落账。
 *
 * bonusPct 走两步判定后对齐到 settings.rewardPolicy.reflectionBonusBands 中
 * **该任务难度对应的区间**：
 *   ① 先判定"是否加成"——档位为 baseline（套话/复述）则直接 0%；
 *   ② 通过资格线后，再按质量档位在区间内取值（见 catalog/policy.ts 的 alignBonusPct）。
 */
export type CompleteQuest = (
  state: EarthOnlineState,
  questId: string,
  input: { reflection: string; bonusPct: number; bonusReason: string | null; verdict: unknown | null },
  now: Date,
) => EarthOnlineState;

/** 日常打钩（二次确认后调用）：发奖 + 更新连击 */
export type CheckDaily = (state: EarthOnlineState, dailyId: string, now: Date) => EarthOnlineState;

/**
 * 每周规程打钩（二次确认后调用）：发奖 + 推进周连击。
 * 记录落在"当前自然周"（weekStartKey(localDateKey(now))，周一为周首，与 checkDaily 同口径）。
 * 周规程**没有连击加成**：streakBonusPerDay 是"按天"的刻度，不该外推到周。
 */
export type CheckWeekly = (state: EarthOnlineState, weeklyId: string, now: Date) => EarthOnlineState;

/**
 * 新建一条每周任务。
 *
 * 🔴 与日常同一条红线：**只能由玩家创建**。系统与 AI 都不得自动创建、
 *    不得自动启用、不得自动修改 —— 这个契约的调用方只允许是玩家的提交动作。
 *
 * penaltyExp 由 rewardExp × RewardPolicy.dailyMissPenaltyMultiplier 在创建时定格。
 */
export type CreateWeekly = (
  state: EarthOnlineState,
  input: {
    title: string;
    /** 所属职业线；null 为通用周常 */
    classId: import('./core').ClassIdLiteral | null;
    rewardExp: number;
  },
  now: Date,
) => EarthOnlineState;

/**
 * 把一点待分配属性点花在某一维上。
 *
 * 设计立场（PO 裁定）：属性点**只能**手动分配 —— 保留"我在长成什么样"的主动权。
 * 任务完成只记账（AttributeDelta.delta = 0 的留痕），不赠点、不自动加点。
 * **不设撤销**：这个决定是要玩家想一秒钟再点的，撤销会让它变回一个滑杆。
 * 池里没有点时返回原状态（同引用）。
 */
export type SpendAttributePoint = (
  state: EarthOnlineState,
  key: import('./core').AttributeKey,
  now: Date,
) => EarthOnlineState;

/**
 * 向智囊团求助（全局社交检索）：输入一件现实里的困境，
 * 在**整个通讯录**里找最接得住这件事的人（0~2 位），
 * 输出沉稳的分析 + 推荐理由 + 克制高情商的开口建议。
 *
 * 与 AskNetworkAdvisor 的分工：那个是"关于某个人，话怎么说"；
 * 这个是"有这件事，该找谁"。名单里没有对口的人时诚实地说没有（不硬配）。
 *
 * ⚠️ 非幂等：每次调用都是一次新的求助，各落一条 SolverConsultation。
 */
export type ConsultNetworkSolver = (
  state: EarthOnlineState,
  question: string,
  now: Date,
  /**
   * 预计算的检索报告（Phase 4 接缝）。不给就走 `mockSocialSolver`，一字不改。
   *
   * ⚠️ `recommendations[].contactId` 必须已经在**调用方**那里核对过名单 ——
   *    这个纯函数只负责把它写进存档。核对的地方是 `ai/adapters.ts` 的
   *    `adaptSolverReport`（只有那里同时拿得到通讯录与模型的输出）。
   */
  draft?: import('../lib/mockAdvisor').SolverDraft | null,
) => EarthOnlineState;

/**
 * 手动把一个人记进通讯录。
 *
 * 这是全项目**唯一**由玩家亲手新增联系人的入口。它刻意只要三样东西：
 * 名字（必填）、关系类型、一段描述（可留空）。
 *
 * 为什么别的都要不到、也不许替他要：`stage` / `currentGrade` / `dimensions`
 * 都是**观测值** —— 一个刚被记下来的人，我们对他没有任何观测。
 * 于是新联系人一律从"空"起步（stage/currentGrade 为 null、四维全 0、
 * `gradeHistory` 为空、`lastContactAt` 为 null），卡片上也如实写着"还没有记录"。
 * 玩家选的 `relationType` 是**分类**不是观测，所以它是三条里唯一必选的分类项。
 *
 * 他会不会被"该联系了"盯上？不会 —— `nextTouchAt` 从 null 起，
 * 而超期判定读的正是它。一个人还没进过你的日程，就先别催你联系他。
 *
 * 非幂等：同名同类型连加两次就是两个人（重名是现实，不是错误）。
 * 拒绝路径（名字为空/全空白）返回**原对象** —— 调用方以此判断"什么都没发生"。
 */
export type CreateContact = (
  state: EarthOnlineState,
  input: {
    name: string;
    relationType: import('./network').RelationType;
    /** 可选的一段描述。空串与全空白一律落成 null ——「没写」不是一种内容 */
    note: string;
  },
  now: Date,
) => EarthOnlineState;

/**
 * 给一段关系**定一条等级**（也可以改主意再定一次）。
 *
 * 这是 `Contact.stage` 的唯一写入口，也是整个关系图谱里唯一一处
 * "由玩家直接修改一条既有联系人"的操作 —— 它之所以该由人来做，
 * 是因为等级本身就是一个判断，而不是一个可以被算出来的量。
 *
 * 三条纪律：
 *   ① **不写时间戳**：改主意不是一次事件，不值得留档（留了就会变成一种记账压力）。
 *      也正因为它不写时间，签名里没有 `now`。
 *   ② **设成同一个等级 = 什么都没发生**，返回原对象（store 靠引用相等短路，不写盘）。
 *   ③ 联系人不存在 → 原对象返回。
 */
export type SetContactStage = (
  state: EarthOnlineState,
  contactId: string,
  stage: import('./network').RelationStage,
) => EarthOnlineState;

/**
 * 从一个联系人的卡片上派生一条行动任务，**直接写入「进行中」**。
 *
 * 它不走草稿审核门控：审核门控是给 AI 生成物设的闸门，
 * 而这条任务出自玩家自己的决定 —— 没有需要防的东西。
 * 完成后会沿 Quest.linkedContactIds 在该联系人名下落一条互动（温度/信任微升）。
 */
export type CreateContactQuest = (
  state: EarthOnlineState,
  contactId: string,
  input: { title: string },
  now: Date,
) => EarthOnlineState;

/**
 * 玩家裁决一条 AI 推荐的日常：采纳或忽略。
 * 采纳时生成 DailyDefinition（origin 记为 'ai_recommendation_adopted'，
 * adoptedFromRecommendationId 指向本条推荐）；adoptOverrides 承载玩家在采纳前的修改
 * ——最终文本与频率以玩家给的为准。
 *
 * 🔴 这是 AI 影响 daily 系统的**唯一**入口：不存在"自动采纳"。
 */
export type ResolveDailyRecommendation = (
  state: EarthOnlineState,
  recommendationId: string,
  decision: 'adopt' | 'dismiss',
  adoptOverrides: { title?: string; targetPerDay?: number } | null,
  now: Date,
) => EarthOnlineState;

/**
 * 向社交智囊求助：就某个联系人问一次"我该怎么做"。
 *
 * 产出**入库存档**（追加进 contact.adviceHistory），不是一次性的弹窗内容。
 * 理由是 adviceHistory 在 Phase 1 就设计好了：建议的价值在于事后回看
 * "我当时听了什么、后来做了没有"，不存就退化成了一段会消失的文字。
 *
 * `situation` 可以为空字符串 —— 空的时候智囊只依据联系人档案说话。
 * 这不是降级路径：多数时候玩家自己也不知道该怎么说，那本身就是一种处境。
 *
 * 与 GenerateQuestChain 一样，这条契约**不在 Phase 1 的冻结集里**（当时只定了
 * NetworkAdviceRecord 这个产物形状，没定"怎么产生它"）。
 *
 * ⚠️ 幂等性：**非幂等**。每次调用都是一次新的求助，各自成一条记录 ——
 *    重复点击会产生多条建议，这是刻意的：它能记录"你为同一件事反复纠结过"。
 */
export type AskNetworkAdvisor = (
  state: EarthOnlineState,
  contactId: string,
  situation: string,
  now: Date,
  /** 预计算的建议（Phase 4 接缝）。不给就走 `mockNetworkAdvisor`，一字不改 */
  draft?: import('../lib/mockAdvisor').AdvisorDraft | null,
) => EarthOnlineState;

/**
 * 整链重生成：仅在**整条链的任务都被逐条打回**后可调用
 * （review.regenerationCount 上限 1 次，防止无限抽卡）。
 * 带 `playerNote` 重新生成整链草稿（回到 draft）。
 *
 * 注意：逐条打回个别任务**不消耗**这个额度——它是"整条链方向都不对"时的一次重来。
 */
export type RegenerateQuestChain = (
  state: EarthOnlineState,
  chainId: string,
  now: Date,
  /** 预计算的重抽结果（Phase 4 接缝）。不给就走 `mockForge`，一字不改 */
  forged?: import('../lib/mockForge').ForgeOutput | null,
) => EarthOnlineState;

/**
 * 记录一个现实里程碑（签证递交/获批、出国旅行、论文接收……）。
 * 不走任务状态机、不经过 AI：校验冷却与月度上限后直接发 EXP，
 * 并点亮 grantsGoalMilestoneIds 中尚未达成的终极目标里程碑。
 *
 * `snapshots`（快照）：记录当下的那张照片（签证页/登机牌/接收邮件）——
 * 传空数组即可，也可以事后再用 AttachMilestoneSnapshot 补。
 */
export type RecordRealityMilestone = (
  state: EarthOnlineState,
  input: {
    definitionId: string;
    occurredOn: DateKey | null;
    note: string;
    snapshots: MilestoneSnapshot[];
  },
  now: Date,
) => EarthOnlineState;

/**
 * 记录一件**目录里没有**的事。
 *
 * 与 `RecordRealityMilestone` 的分工：那条是"从目录里挑一条"，这条是"自己写一条"。
 * 目录那 16 条覆盖的是这个产品**预设**的路径，而人的现实不会照着目录长 ——
 * 所以玩家要能自己写。写下来之后它就是一条普通记录：进同一面墙、同一份导出、
 * 同一个月度额度。
 *
 * 三条纪律：
 *   ① **标题必填**（空标题返回原对象）—— 它是这条记录的全部由头；
 *   ② **不发"第 N 次"也不设冷却**：目录里的条目才需要防刷，自己写的事
 *      本来就该由自己判断值不值得记；
 *   ③ **不点亮终极目标里程碑**：点灯规则长在定义上（`grantsGoalMilestoneIds`），
 *      而它没有定义 —— 所以它也不会"顺手"点亮任何东西。
 */
export type RecordCustomMilestone = (
  state: EarthOnlineState,
  input: {
    title: string;
    category: import('./milestones').RealityMilestoneCategory;
    occurredOn: DateKey | null;
    note: string;
    snapshots: import('./milestones').MilestoneSnapshot[];
    /**
     * 这笔经验算进哪条职业线。`null` = 让系统挑（取等级最高的那条 ——
     * 本项目没有全局经验池，EXP 必须落在某条线上，见 operations.creditedTrackFor）。
     */
    creditedClassId: import('./core').ClassIdLiteral | null;
  },
  now: Date,
) => EarthOnlineState;

/**
 * 给已记录的现实里程碑补一张"快照"（照片 / 链接）。
 * 记录当下没拍的、过几天翻出来的，都可以往后补。
 * 照片须为**客户端压缩后**的 data URL（见 MilestoneSnapshot 的存储约定）。
 */
export type AttachMilestoneSnapshot = (
  state: EarthOnlineState,
  recordId: string,
  snapshot: MilestoneSnapshot,
  now: Date,
) => EarthOnlineState;

/**
 * 静默喂给进化树。仅由 CompleteQuest / Arbiter 链路调用。
 * ⚠️ 禁止在 UI 组件中调用。
 */
export type FeedEvolutionMilestones = (
  state: EarthOnlineState,
  records: Array<{ tag: string; confidence: number; questId: string; localDate: DateKey }>,
  now: Date,
) => EarthOnlineState;

/**
 * 篇章 DAG 推进引擎的**唯一入口**。
 *
 * 它做四件事，每次从头重算，不依赖任何增量标记：
 *   ① 对照 `catalog/chapters.ts` 的 exitCondition，把每章的 conditionProgress 重算一遍；
 *   ② 所有条件达成的**已解锁且未完成**的篇章 → 判定离章（completed = true，
 *      completedAt 落定，expEarnedInChapter / questsCompletedInChapter 定格）；
 *   ③ 沿 DAG 入边（requires / requiresOneOf）解锁下游篇章，
 *      把满足条件的推进 activeChapterIds，并记下进入本章时的净资产快照；
 *   ④ 有新离章时产出一份 ChapterCeremony（通关仪式 + 命名权交接）挂在
 *      chapters.pendingCeremony 上，等玩家点开、命名、看完再清。
 *
 * ⚠️ 幂等 + 可重入：无事发生时**必须返回同一个对象**（store 靠引用相等短路，
 *    否则每次 mutate 都会写盘一次）。这是它敢被挂在 mutate 里的前提。
 */
export type SyncChapters = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/**
 * 命名权交接：玩家为某一章定下代号。
 *
 * 文档语义（`docs/phase1/chapters-and-lore.md` §5）：完成第 N 章时，
 * 玩家为**下一章**命名 —— 所以调用方传进来的 chapterId 是**被命名的那一章**，
 * 而不是刚完成的那一章。代号写进 `ChapterProgress.playerChosenCodename`，
 * 从此出现在 HUD 铭牌与该章所有日记页眉上。
 *
 * `source` 区分"从三个候选里挑的"与"自己写的"——两者都合法，
 * 但后者才真正是玩家的命名。留这个标记是为了让 HUD 对后者多一点分量。
 */
export type NameChapter = (
  state: EarthOnlineState,
  chapterId: import('./core').ChapterId,
  codename: string,
  source: 'candidate' | 'custom',
  now: Date,
) => EarthOnlineState;

/** 玩家看完通关仪式，收起浮层（清空 chapters.pendingCeremony） */
export type DismissChapterCeremony = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/**
 * 成就引擎的**唯一入口**（实现见 `lib/achievementEngine.ts`）。
 *
 * 它每次从头重算全部 23 条判据，不依赖任何增量标记 —— 与 SyncChapters 同一套
 * 设计：没有"上次算到哪"的游标，也就没有一只会和存档不同步的幽灵。
 * 一旦某条成立，就把它写进 `unlockables`（id + 时刻 + 待看队列），
 * **此后永不复判**（"只增不减"，见引擎文件头 ②）。
 *
 * ⚠️ 幂等 + 可重入：无事发生时**必须返回同一个对象**。它被挂在 store.mutate 里，
 *    每次点击都要跑一遍；只要它一动手就产新引用，这个应用就会在每一次点击后
 *    写一次盘。这是它敢被挂上去的前提。
 */
export type SyncAchievements = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/**
 * 玩家看完那场金色光晕，把待看队列清空（`pendingAchievementIds`）。
 * 只清队列，不动已解锁名单 —— 收起浮层不是把徽记摘下来。
 */
export type DismissAchievementOvation = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/**
 * 进化树推进（Phase 5 模块二）：点亮节点 → 回填消费痕迹 → 判显形 → 记账。
 *
 * ⚠️ 与另外两道工序同一条纪律：**无事发生时必须返回同一个对象**。
 *    它挂在同一个写入漏斗上，每次点击都要跑一遍。
 *
 * ⚠️ 它**不看** `revealed` 决定要不要点亮：雾里照样亮。原因见引擎文件头 ——
 *    "你做到了"与"你知道了"是两件事，树在雾里也是活的。
 */
export type SyncEvolution = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/**
 * 终局目标推进（Phase 5 模块三）：按机器判据点亮目标里程碑 → 重算达成态。
 *
 * 分工一句话：**进度数学在 selectors，事实在这里**。
 * 它只写事实 —— milestone.achievedAt / goal.achieved / goal.achievedAt；
 * 展示用的 `progress` 绝不进这条链（types/endgame.ts 写死了：由 selector 重算）。
 *
 * 判据不在存档里那份目录深拷贝上找，而是按稳定的里程碑 id 去查目录表
 * `GOAL_MILESTONE_CONDITIONS` —— 判据是**静态知识**，跟目录走；存档里只留事实。
 * 这样老存档（其副本里根本没有这个字段）也照样能补判。
 *
 * 点亮语义 = "系统第一次看见它为真"（同成就上墙的哲学）：写下的是一笔账，
 * 不是一场仪式 —— 它不派发任何浮层，圣殿面板自己去看前后两份状态。
 *
 * ⚠️ 与另外三道工序同一条纪律：**无事发生时必须返回同一个对象**。
 */
export type SyncEndgame = (state: EarthOnlineState, now: Date) => EarthOnlineState;

/** 玩家看过「第一次看见」那张卡（`evolution.revealMomentShown` 翻成 true，一次性） */
export type MarkRevealMomentShown = (state: EarthOnlineState) => EarthOnlineState;

/** 由 selectors 计算的 HUD 快照 */
export type BuildHudSnapshot = (state: EarthOnlineState, now: Date) => import('./world').HudSnapshot;

// ---------------------------------------------------------------------------
// 5. 当前 Schema 版本
// ---------------------------------------------------------------------------

/**
 * v2（2026-10-07 收官批）：新增 weeklies 容器、player.attributeHistory、
 * network.solverLog、quest.linkedContactIds —— 旧档由 src/lib/migrations.ts 水合，
 * 数据全部保留（详见那条迁移的注释）。
 *
 * v3（Phase 3 开工批）：新增 QuestStatus.'rerouted'、Quest.origin.reroutedFrom /
 * rerouteHistory、ChainReview.rerouteCount、ChapterProgress.entryNetWorthUsdCents、
 * ChapterProgressState.pendingCeremony —— 同样只补空字段，数据全部保留。
 *
 * v4（2026-10-07 手动添加联系人）：新增 Contact.note（玩家写的那段话）。
 * 老档里的每一条联系人补 null —— **不替他们补任何内容**：
 * 那份空白是真实的（那些人身上确实没有这段记录），填上反而成了编造。
 *
 * v5（2026-10-07 自由记录与照片）：RealityMilestoneRecord 允许"自己写的一条"
 * （definitionId 可空 + customTitle / customCategory），并给了照片一条真正能走的路。
 * 老档里的每一条记录都是目录里的条目：补 `customTitle: null` / `customCategory: null`，
 * definitionId **一个字都不动** —— 它们本来就有定义。
 *
 * v6（2026-10-07 史诗成就陈列馆）：unlockables 从内联字面量升成 Unlockables，
 * 多出 `achievementUnlockedAt`（陈列馆要印的那行日期）与 `pendingAchievementIds`
 * （金色光晕的待看队列）。老档两个字段都补空 —— **不补造时间**：
 * 那些是"这一版之前就已经做到的事"，它们的日期没有人知道，
 * 编一个出来就是在档案上写一个假的日子。
 */
export const CURRENT_SCHEMA_VERSION = 6;

/**
 * 迁移注册表。每一次结构性变更都必须新增一条迁移，禁止原地改老迁移。
 * key = 目标版本号。迁移是**纯数据变换**：只补字段、只搬数据，
 * 不读时钟 —— 需要时间戳的场合用调用方注入的 now。
 *
 * 实现见 `src/lib/migrations.ts`（decodeSave 在版本落后时逐级调用）。
 */
export type MigrationRegistry = Record<
  number,
  (prev: Record<string, unknown>, now: Date) => Record<string, unknown>
>;

/**
 * LocalStorage 存储键（Phase 2 使用）。
 * 注意：API Key 使用**独立键**，不随存档导出。
 *
 * 另注：state 键名里的 "v1" **不随 schemaVersion 走** —— 它是存储槽的名字，
 * 不是数据的版本。改它等于把旧档变成孤儿（loadOrCreate 找不到就建新档），
 * 那正是迁移机制要避免的事。
 */
export const STORAGE_KEYS = {
  state: 'earth-online:state:v1',
  stateBackup: 'earth-online:state:backup',
  apiKey: 'earth-online:secret:deepseek',
  uiPrefs: 'earth-online:ui-prefs',
} as const;

// ---------------------------------------------------------------------------
// 6. 存档导出格式（用于备份/迁移/调试）
// ---------------------------------------------------------------------------

export interface SaveFile {
  format: 'earth-online-save';
  formatVersion: 1;
  exportedAt: ISODateTime;
  /** 不含 API Key 与调用原始输出 */
  state: EarthOnlineState;
  /** 可选：成功日记者导出为可读文本 */
  journalPlainText: string | null;
}
