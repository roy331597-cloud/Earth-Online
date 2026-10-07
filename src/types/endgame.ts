// ============================================================================
// EarthOnline · Phase 1 · 终极目标 / 篇章 / 进化树类型 (endgame.ts)
// 职责：5 大终极目标 + Chapter 进度 + 至高隐藏目标
// ============================================================================

import type {
  ChapterId,
  ClassIdLiteral,
  DateKey,
  ISODateTime,
  NodeId,
  QuestId,
  Ratio,
  UsdCents,
} from './core';

// ---------------------------------------------------------------------------
// 1. 终极目标 (Endgame Goals)
// ---------------------------------------------------------------------------

/**
 * 五大终极目标（写定不可增删，但可扩展里程碑）：
 *   A9_ASSETS                  A9 资产
 *   GLOBAL_MOBILITY            全球通行海外身份
 *   PRIVATE_LAB                私人独立 Lab
 *   GEO_INDEPENDENT_WORK       地理位置无关工作
 *   SOULMATE                   灵魂伴侣
 */
export type GoalIdLiteral =
  | 'A9_ASSETS'
  | 'GLOBAL_MOBILITY'
  | 'PRIVATE_LAB'
  | 'GEO_INDEPENDENT_WORK'
  | 'SOULMATE';

/**
 * 进度曲线。A9 用 log，身份/Lab 用 sqrt，关系用 linear。
 * 这不是数学问题，是游戏手感问题：不同目标的"前进感"需要不同节奏。
 */
export type ProgressCurve = 'linear' | 'sqrt' | 'log';

/** 里程碑：目标的最小推进单位，由任务完成或事件触发 */
export interface GoalMilestone {
  id: string;
  title: string;
  /** 客观达成条件的人类可读描述（同时有一份机器判定 selector） */
  criterion: string;
  /** 该里程碑完成的日期，null 表示未完成 */
  achievedAt: ISODateTime | null;
  /** 触发它的任务 */
  questId: QuestId | null;
  /** 该里程碑对目标进度的贡献权重（0..1 的绝对值） */
  weight: number;
  /** 隐藏里程碑：达成时才揭晓（用于制造"原来这一步也算"的惊喜） */
  hidden: boolean;
}

/**
 * 一条目标里程碑的**机器判据**（Phase 5 模块三补上）。
 *
 * `GoalMilestone.criterion` 的注释从 Phase 1 起就写着"同时有一份机器判定 selector"——
 * 这里补上它等的那半句。判据本身不放在里程碑对象的身上（也不放存档里那份深拷贝），
 * 而是成表放在目录 `GOAL_MILESTONE_CONDITIONS` 里，按稳定的里程碑 id 查：
 * 判据是**静态知识**，跟目录走；存档里只留事实（achievedAt）。
 * 这样老存档（其目录副本里根本没有这个字段）也照样能补判。
 *
 * 只有**从状态本身就能读出来**的事才配写在这里。读不出来的（比如
 * "被动收入 ≥ 月支出"—— 现在还没有一个字段装着被动收入）宁可留空：
 * 一条编出来的判据比没有判据更糟，因为它会静默地点亮一座没到过的站。
 */
export type GoalMilestoneCondition =
  /** 净资产 ≥ amount（美分）。A9 的阶梯全走这一条 */
  | { kind: 'net_worth_usd_cents'; amount: UsdCents }
  /** 某条现实里程碑的累计记录次数 ≥ count（"第二段海外经历"这种第 N 次的事） */
  | { kind: 'reality_milestone_count'; definitionId: string; count: number };

/** 进度的原始度量：有的看钱，有的看条目数，有的看布尔完成度 */
export type GoalMetric =
  | { kind: 'usd_net_worth' }
  | { kind: 'milestone_weights' }
  | { kind: 'count'; unit: string; target: number }
  | { kind: 'boolean' };

export interface EndgameGoal {
  id: GoalIdLiteral;
  title: string;
  /** 一句话定义"达成"的客观标准 */
  definition: string;
  /** 叙事化描述，AVG 语气 */
  narrative: string;
  curve: ProgressCurve;
  metric: GoalMetric;
  milestones: GoalMilestone[];
  /** 缓存的展示进度 0..1（由 selector 重算） */
  progress: Ratio;
  /** 是否已达成 */
  achieved: boolean;
  achievedAt: ISODateTime | null;
  /** 主要由哪些职业线推进 */
  drivenByClassIds: ClassIdLiteral[];
  /** 是否对玩家可见（SOULMATE 初期可能不想被看见？保留开关） */
  visibleToPlayer: boolean;
}

// ---------------------------------------------------------------------------
// 2. Chapter
// ---------------------------------------------------------------------------

/**
 * 篇章所处的支线。整张图从 Ch.1 出发，分叉出多条支线再汇回主线：
 * 学术（Ch.2）与世界（Ch.3）同为 Ch.4 的入口（任一完成即可进入，另一条随时可补），
 * 资本（Ch.5）在 Ch.6 并入，关系（Ch.8）全程并行——不阻塞任何线，也不被任何线要求。
 */
export type ChapterBranch =
  | 'trunk'      // 主干：起点、汇流点与终局
  | 'academic'   // 学术支线
  | 'world'      // 世界支线（海外经历）
  | 'capital'    // 资本支线
  | 'bond';      // 关系支线（全程并行）

/** 篇章的静态定义（放 catalog，不入存档） */
export interface ChapterDefinition {
  id: ChapterId;
  /** 展示序号：用于"第 N 章"的称呼与排序，**不再表示解锁顺序** */
  index: number;
  /** 代号，如 'FIRST_LIGHT' */
  codename: string;
  /** 文学化主标题，如「课表之外」 */
  title: string;
  /** 功能性副标题，如「校园、副业与第一笔自己赚来的钱」 */
  subtitle: string;
  /** 题记 */
  epigraph: string;
  /** 该章的主题陈述 */
  theme: string;
  /** 进入条件的人类可读描述 */
  entryCondition: string;
  /** 离开条件的人类可读描述 */
  exitCondition: string;
  /** 本章主推的终极目标 */
  primaryGoalIds: GoalIdLiteral[];
  /** 情绪基调，会注入给 AI 影响任务文案 */
  emotionalTone: string;

  // ---- DAG 结构：篇章不是线性关卡，而是"分叉 → 并行 → 汇流"的有向无环图 ----

  /** 所属支线（用于履历视图与地图分组） */
  branch: ChapterBranch;
  /**
   * 前置篇章：**全部**完成后本篇章才解锁（DAG 的入边；空数组 = 无此约束）。
   * 例：Ch.6 要求 Ch.4 与 Ch.5 都完成，但两条线之间顺序与节奏自由
   * （先海外研究、再产出论文，或反过来，都合法）。
   */
  requires: ChapterId[];
  /**
   * 前置篇章：**至少其一**完成即满足（空数组 = 无此约束）。
   * 与 `requires` 是 AND 关系——两者同时满足才解锁。
   *
   * 目前仅 Ch.4 使用：学术线（Ch.2）或世界线（Ch.3）**任一完成**即可进入
   * ——先跑通一段研究、或者先出去看一次，都足以开启研究生篇章；
   * 另一条线不构成门锁，随时可以作为支线补上。
   */
  requiresOneOf: ChapterId[];
  /** 是否为汇流点：多条支线在此合流回主线（地图上的视觉标记） */
  isConvergence: boolean;
}

/** 篇章的运行期进度（入存档） */
export interface ChapterProgress {
  id: ChapterId;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 是否已完成 */
  completed: boolean;
  /** 完成条件 checklist 的机器判定结果 */
  conditionProgress: Array<{
    label: string;
    current: number;
    target: number;
    met: boolean;
  }>;
  /** 本章贡献的 EXP 汇总，用于"这一章我成长了多少" */
  expEarnedInChapter: number;
  questsCompletedInChapter: number;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  /**
   * 玩家为本章命名的代号（命名权，见 chapters-and-lore §5）。
   *
   * ⚠️ 语义以 `docs/phase1/chapters-and-lore.md` 为准：完成第 N 章时，
   *    玩家为**下一章**命名 —— 也就是说这个字段描述的是**它自己所属的这一章**，
   *    由上一章的通关仪式写入。所以 HUD 只读"当前聚焦章"的这一个字段，
   *    不需要再往上找"是谁给我起的名字"。
   */
  playerChosenCodename: string | null;
  /**
   * 那个代号是**从候选里挑的**，还是**自己写的**。
   * 两者都算数，但后者才是真正意义上的命名 —— HUD 上会给它多一点分量
   * （自定义的用金色，候选的用常规文字色）。这个区分只在展示层有意义，
   * 但它必须落盘，否则刷新一次就分不出来了。
   */
  codenameSource: 'candidate' | 'custom' | null;
  /**
   * 进入本章时的净资产快照（美分）。
   *
   * Ch.5 的离章条件是"净资产相对进入本章时提升 10 倍"——没有这个快照，
   * 那句话就没有基准可言，只能退化成一条永远判不了的进度条。
   * 解锁那一刻由 SyncChapters 定格，之后不再变动（重新进入本章才会重置）。
   */
  entryNetWorthUsdCents: number | null;
}

/**
 * 一次通关仪式的全部素材。由 SyncChapters 产出、挂在 pendingCeremony 上，
 * 玩家看完并完成命名（或跳过命名）后清空。
 *
 * 它是**入存档的**：刷新页面不该让刚刚达成的那一章悄无声息地过去，
 * 也不该让命名权那一步凭空消失。与 pendingRolloverNotice 同一条哲学。
 */
export interface ChapterCeremony {
  /** 刚刚完成的篇章 */
  completedChapterId: ChapterId;
  completedTitle: string;
  completedCodename: string;
  /** 本章小结（仪式上展示的"这一章你走了多远"） */
  summary: {
    expEarned: number;
    questsCompleted: number;
    /** 本章在籍天数（startedAt → now）；无记录时为 0 */
    daysInChapter: number;
  };
  /** 本次离章同时解锁的篇章（按 catalog 顺序） */
  unlockedChapterIds: ChapterId[];
  /**
   * 命名权交接给哪一章（= unlockedChapterIds 里第一张非隐藏章）。
   * 没有新章可命名时为 null —— 仪式照常进行，只是少一步。
   */
  namingForChapterId: ChapterId | null;
  /** 该章的主推目标标题，命名界面上的一句话上下文 */
  namingContext: string | null;
  at: ISODateTime;
}

export interface ChapterProgressState {
  /**
   * 当前已解锁且未完成的篇章。支线可并行推进，因此是一个数组
   * （例如"一边科研一边攒钱"时同时含有 CH2 与 CH5）。
   */
  activeChapterIds: ChapterId[];
  /** HUD 聚焦展示的那一个（玩家可手动切换；默认取最近解锁的支线） */
  focusedChapterId: ChapterId;
  chapters: ChapterProgress[];
  /** 已完成章节数 */
  completedCount: number;
  /** 待玩家查看的通关仪式（看完即清，见 ChapterCeremony） */
  pendingCeremony: ChapterCeremony | null;
}

// ---------------------------------------------------------------------------
// 3. 至高隐藏目标：人类科技进化树 (Evolution Tree)
// ---------------------------------------------------------------------------

export type EvolutionBranch =
  | 'COMPUTE_BIOLOGY'  // 生命的计算
  | 'ENERGY'           // 能量的驯服
  | 'MATERIALS'        // 物质的编织
  | 'INTELLIGENCE'     // 心智的镜像
  | 'MEDICINE'         // 衰老的边界
  | 'SPACE';           // 出走与远望

/**
 * 节点层级：解语 → 复现 → 改良 → 提问 → 点亮
 *
 *   1 解语 —— 能读懂人类已有的答案，并亲手跑通
 *   2 复现 —— 亲手把答案完整做一遍，且别人也能跑通
 *   3 改良 —— 让答案比原来更好，且被独立验证
 *   4 提问 —— 提出一个还没有答案的问题，并让别人也想问
 *   5 点亮 —— 你的答案成为别人的起点（AlphaFold 量级）
 *
 * tier 3 往上不是"再努力一点"就能到的，tier 5 可能耗掉一个人十年。
 * 这正是设计意图：它是至高隐藏目标，不是周任务。
 */
export type EvolutionTier = 1 | 2 | 3 | 4 | 5;

export interface EvolutionNode {
  id: NodeId;
  branch: EvolutionBranch;
  tier: EvolutionTier;
  /** 人类可读的节点名，如「AlphaFold 级的折叠直觉」 */
  name: string;
  /** 点亮条件的人类可读描述 */
  criterion: string;
  /** 前置节点 */
  prerequisites: NodeId[];
  /**
   * 需要累积的**不同**标签数量（配合 tagFilter 去重统计）。
   * 约束：requiredTagCount 不得大于 tagFilter 在里程碑词表中能匹配到的标签总数，
   * 否则该节点永远无法点亮（见 catalog/endgame.ts 的校验注释）。
   */
  requiredTagCount: number;
  /** 只统计匹配这些前缀的 milestoneTags */
  tagFilter: string[];
  /** 节点是否已点亮 */
  lit: boolean;
  litAt: ISODateTime | null;
  /** 点亮时玩家是否已被揭示进化树的存在 */
  litWhileRevealed: boolean;
}

/** 静默里程碑记录：由 Arbiter 在每次复盘时抽取，UI 层永不可见 */
export interface TechMilestoneRecord {
  id: string;
  ts: ISODateTime;
  localDate: DateKey;
  tag: string;
  /** 来源任务 */
  questId: QuestId;
  /** Arbiter 给出的可信度 0..1，低可信度不计入进度 */
  confidence: number;
  /** 该记录是否已计入某个节点 */
  consumedByNodeId: NodeId | null;
}

/** 揭示条件：满足任一即可让隐藏目标显形 */
export interface EvolutionRevealCondition {
  kind:
    | 'total_milestones'      // 累计里程碑数
    | 'lit_nodes'             // 已点亮节点数
    | 'branches_touched'      // 触及的分支数
    | 'chapter_reached'       // 抵达某篇章
    | 'total_quests_completed';
  label: string;
  threshold: number;
  met: boolean;
}

export interface EvolutionTreeState {
  /**
   * 是否已对玩家揭示。
   * ⚠️ 为 false 时，任何 UI 组件都不得读取或渲染本对象的任何字段。
   *    （ESLint 自定义规则 / 独立 selector 隔离，见 Phase 2）
   */
  revealed: boolean;
  revealedAt: ISODateTime | null;
  /** 揭示时播放的那段文案的 ID（一次性，播完记录，不重播） */
  revealMomentShown: boolean;

  nodes: EvolutionNode[];
  /** 所有已采集的里程碑（环形保留最近 300 条） */
  techMilestones: TechMilestoneRecord[];

  revealConditions: EvolutionRevealCondition[];

  stats: {
    litNodeCount: number;
    totalNodeCount: number;
    /** 各分支的进度 0..1 */
    branchProgress: Record<EvolutionBranch, Ratio>;
    /** 最近一次点亮时间 */
    lastLitAt: ISODateTime | null;
  };

  /** 已点亮节点在场景中的挂载位置（Phase 2 的"某扇窗亮了一盏灯"） */
  sceneHooks: Array<{ nodeId: NodeId; sceneId: string; anchorId: string }>;
}

export interface EndgameState {
  goals: EndgameGoal[];
}
