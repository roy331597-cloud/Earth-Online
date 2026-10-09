// ============================================================================
// EarthOnline · 终极目标与进化树目录（静态设定）
// ============================================================================

import type {
  EndgameGoal,
  EvolutionBranch,
  EvolutionNode,
  EvolutionRevealCondition,
  EvolutionTier,
  GoalMilestoneCondition,
} from '../../types/endgame';

// ---------------------------------------------------------------------------
// 1. 五大终极目标
// ---------------------------------------------------------------------------

/**
 * 曲线选择理由（这是游戏手感问题，不是数学问题）：
 *   A9_ASSETS          log   —— 从 $1k 到 $100M 线性永远是 0.001%，必须对数
 *   GLOBAL_MOBILITY    sqrt  —— 前期的每一步（材料、语言、递交）都应明显推进
 *   PRIVATE_LAB        sqrt  —— 里程碑式推进，前期攒设备也应有反馈
 *   GEO_INDEPENDENT_WORK sqrt —— 早期就应有 30% 的进度感，鼓励尝试
 *   SOULMATE           linear—— 关系不该被加速，也不该被量化的曲线欺骗
 */
export const ENDGAME_GOALS: EndgameGoal[] = [
  {
    id: 'A9_ASSETS',
    title: 'A9 资产',
    definition: '个人净资产达到 100,000,000 USD（9 位数）。',
    narrative: '它不是为了买什么。它是让你在任何一张桌子上，都有权说"不"。',
    curve: 'log',
    metric: { kind: 'usd_net_worth' },
    milestones: [
      { id: 'a9_first_own_money', title: '第一笔自己赚的钱', criterion: '出现第一笔非家庭给予的收入', achievedAt: null, questId: null, weight: 0.04, hidden: false },
      { id: 'a9_first_10k', title: '第一万美金', criterion: '净资产 ≥ $10,000', achievedAt: null, questId: null, weight: 0.06, hidden: false },
      { id: 'a9_first_100k', title: '六位数', criterion: '净资产 ≥ $100,000', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'a9_first_income_stream', title: '非工资性收入', criterion: '出现至少一条不依赖出勤的收入来源', achievedAt: null, questId: null, weight: 0.12, hidden: false },
      { id: 'a9_first_1m', title: '第一个一百万', criterion: '净资产 ≥ $1,000,000', achievedAt: null, questId: null, weight: 0.18, hidden: false },
      { id: 'a9_runway_forever', title: '永远的跑道', criterion: '被动收入 ≥ 月支出', achievedAt: null, questId: null, weight: 0.15, hidden: true },
      { id: 'a9_first_10m', title: '八位数', criterion: '净资产 ≥ $10,000,000', achievedAt: null, questId: null, weight: 0.18, hidden: false },
      { id: 'a9_first_100m', title: 'A9', criterion: '净资产 ≥ $100,000,000', achievedAt: null, questId: null, weight: 0.17, hidden: false },
    ],
    progress: 0,
    achieved: false,
    achievedAt: null,
    drivenByClassIds: ['investor', 'startup_entrepreneur', 'social_media_influencer'],
    visibleToPlayer: true,
  },
  {
    id: 'GLOBAL_MOBILITY',
    title: '全球通行海外身份',
    definition: '持有至少一个可自由通行主要经济体、且允许长期居留与工作的海外身份。',
    narrative: '让世界的边界对你而言，从墙变成门。',
    curve: 'sqrt',
    metric: { kind: 'milestone_weights' },
    milestones: [
      { id: 'gm_first_experience', title: '第一段海外经历', criterion: '完成至少 8 周的海外学习或研究经历', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'gm_language', title: '语言的钥匙', criterion: '目标国语言达到可独立生活与面试的水平', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'gm_second_experience', title: '第二段海外经历', criterion: '再完成一段不少于 8 周的海外经历', achievedAt: null, questId: null, weight: 0.08, hidden: false },
      { id: 'gm_documents', title: '材料成形', criterion: '完成核心申请材料的初稿与第三方评审', achievedAt: null, questId: null, weight: 0.12, hidden: false },
      { id: 'gm_submitted', title: '递交', criterion: '正式递交申请', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'gm_approved', title: '批准', criterion: '获得身份批复', achievedAt: null, questId: null, weight: 0.25, hidden: false },
      { id: 'gm_landed', title: '落地生根', criterion: '在目标地完成地址/税务/账户的实际落地', achievedAt: null, questId: null, weight: 0.2, hidden: false },
    ],
    progress: 0,
    achieved: false,
    achievedAt: null,
    // 语言的钥匙（gm_language）在这条线上 —— 英语（Phase 7）的日常推进直接喂它
    drivenByClassIds: ['computational_biology', 'startup_entrepreneur', 'english_learner'],
    visibleToPlayer: true,
  },
  {
    id: 'PRIVATE_LAB',
    title: '私人独立 Lab',
    definition: '拥有一个可独立发起并完成研究的最小物理或虚拟实验室，且已产出至少一项独立成果。',
    narrative: '一间白墙的房子，一台属于你的机器，和一个只属于你的问题。',
    curve: 'sqrt',
    metric: { kind: 'milestone_weights' },
    milestones: [
      { id: 'pl_first_repro', title: '第一次复现', criterion: '独立复现一项已发表结果', achievedAt: null, questId: null, weight: 0.08, hidden: false },
      { id: 'pl_toolchain', title: '工具箱成形', criterion: '拥有一套可重复使用的自有分析/实验流程', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'pl_first_paper', title: '第一篇署名论文', criterion: '以第一作者产出可被检索的成果', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'pl_first_compute', title: '算力主权', criterion: '拥有稳定的独立算力资源（自购/长期租用）', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'pl_physical_space', title: '物理空间', criterion: '获得可用于实验/设备的稳定空间', achievedAt: null, questId: null, weight: 0.12, hidden: false },
      { id: 'pl_first_output', title: '第一项独立成果', criterion: '产出可公开的独立成果（预印本/工具/数据）', achievedAt: null, questId: null, weight: 0.2, hidden: false },
      { id: 'pl_collaborators', title: '有人愿意来', criterion: '至少一位合作者主动加入你的 Lab 方向', achievedAt: null, questId: null, weight: 0.25, hidden: true },
    ],
    progress: 0,
    achieved: false,
    achievedAt: null,
    drivenByClassIds: ['computational_biology', 'startup_entrepreneur'],
    visibleToPlayer: true,
  },
  {
    id: 'GEO_INDEPENDENT_WORK',
    title: '地理位置无关工作',
    definition: '主要收入来源不依赖你在特定城市的物理出勤。',
    narrative: '你可以在任何一个有网的地方工作。包括你想去的那些地方。',
    curve: 'sqrt',
    metric: { kind: 'milestone_weights' },
    milestones: [
      { id: 'gi_first_side_income', title: '第一次副业收入', criterion: '完成第一笔与学业并行的自主收入', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'gi_first_remote_income', title: '第一笔远程收入', criterion: '收到一笔不依赖出勤的收入', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'gi_skill_portfolio', title: '可迁移的技能栈', criterion: '至少 2 项技能的交付物可完全线上完成', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'gi_async_practice', title: '异步工作习惯', criterion: '连续 30 天在无实时会议的情况下完成交付', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'gi_income_50', title: '一半', criterion: '远程收入占个人总收入 ≥ 50%', achievedAt: null, questId: null, weight: 0.2, hidden: false },
      { id: 'gi_relocated_test', title: '异地验证', criterion: '在异地连续工作 ≥ 30 天且收入未受影响', achievedAt: null, questId: null, weight: 0.1, hidden: false },
      { id: 'gi_income_100', title: '完全无关', criterion: '远程收入占个人总收入 ≥ 90%', achievedAt: null, questId: null, weight: 0.15, hidden: false },
    ],
    progress: 0,
    achieved: false,
    achievedAt: null,
    drivenByClassIds: ['computational_biology', 'social_media_influencer', 'startup_entrepreneur'],
    visibleToPlayer: true,
  },
  {
    id: 'SOULMATE',
    title: '灵魂伴侣',
    definition: '建立至少一段双向、长期、可在对方面前完全做自己的深度亲密关系。',
    narrative: '不是一个完美的人，是一个你不需要解释的人。',
    curve: 'linear',
    metric: { kind: 'milestone_weights' },
    milestones: [
      { id: 'sm_self_complete', title: '自己先站稳', criterion: '在独处状态下拥有稳定的自我评价与生活节律', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'sm_capacity', title: '有余力爱人', criterion: '精力与情绪处于可持续盈余的状态', achievedAt: null, questId: null, weight: 0.15, hidden: false },
      { id: 'sm_encounter', title: '遇见', criterion: '建立一段双向主动的关系', achievedAt: null, questId: null, weight: 0.2, hidden: false },
      { id: 'sm_depth', title: '深度', criterion: '关系图谱中 warmth 与 trust 同时高且稳定 ≥ 90 天', achievedAt: null, questId: null, weight: 0.25, hidden: false },
      { id: 'sm_tested', title: '经过考验', criterion: '共同经历至少一次重大分歧并修复', achievedAt: null, questId: null, weight: 0.25, hidden: true },
    ],
    progress: 0,
    achieved: false,
    achievedAt: null,
    drivenByClassIds: [],
    visibleToPlayer: true,
  },
];

/**
 * 目标里程碑的**机器判据表**（Phase 5 模块三）。
 *
 * 键是里程碑的稳定 id（`GoalMilestone.id`），值是 `GoalMilestoneCondition`。
 * 它是**部分表**，不是全表 —— 没进这张表的里程碑要么已另有触发通路
 * （`grantsGoalMilestoneIds`，比如 gm_language 由 rm_language_key 直接点亮），
 * 要么此刻还没有一条能从状态本身读出来的判据（宁可留空也不编，理由见
 * `GoalMilestoneCondition` 的注释）。引擎按 id 来这里查：`lib/endgameEngine.ts`。
 *
 * 为什么不把判据挂到 GoalMilestone 对象上：那是**存档里的深拷贝** ——
 * 老存档（副本里根本没有这个字段）就无从补判；判据是静态知识，该跟目录走，
 * 存档里只留事实（achievedAt）。
 *
 * ⚠️ verify-ops 钉住这张表：每个键都必须真实存在于 ENDGAME_GOALS 的里程碑里，
 *    不许有孤儿键；A9 的金额档位严格递增，且与里程碑 criterion 的文案对得上。
 */
export const GOAL_MILESTONE_CONDITIONS: Record<string, GoalMilestoneCondition> = {
  // —— A9 的阶梯：五档净资产 ——
  // 判据是状态谓词（"净资产 ≥ 某数"），不是事件：钱到了哪一档，哪几档同时算数。
  // 一步从五位数跨到七位数的人，会在一趟里点亮三格 —— 这不是谎言，
  // 是三件同时为真的事实。
  a9_first_10k: { kind: 'net_worth_usd_cents', amount: 1_000_000 }, // $10,000
  a9_first_100k: { kind: 'net_worth_usd_cents', amount: 10_000_000 }, // $100,000
  a9_first_1m: { kind: 'net_worth_usd_cents', amount: 100_000_000 }, // $1,000,000
  a9_first_10m: { kind: 'net_worth_usd_cents', amount: 1_000_000_000 }, // $10,000,000
  a9_first_100m: { kind: 'net_worth_usd_cents', amount: 10_000_000_000 }, // $100,000,000

  // —— 第二段海外经历：由 rm_overseas_experience 的**计数**判定 ——
  // 第一段由 grants 点亮（记录那一刻）；第二段必须等计数真的到 2。
  // 这件事只有 counters 知道 —— 它与"第 N 次"文案、冷却判定是同一本账
  // （definition 侧不再点亮这一格，见 catalog/milestones.ts 的注释）。
  gm_second_experience: {
    kind: 'reality_milestone_count',
    definitionId: 'rm_overseas_experience',
    count: 2,
  },
};

// ---------------------------------------------------------------------------
// 2. 至高隐藏目标：人类科技进化树
// ---------------------------------------------------------------------------

/**
 * 层级语义（**成就维度刻意拉高**）：
 *
 *   tier 1 解语 —— 能读懂人类已有的答案，并亲手跑通
 *   tier 2 复现 —— 亲手把答案完整做一遍，且别人也能跑通
 *   tier 3 改良 —— 让答案比原来更好，且被独立验证
 *   tier 4 提问 —— 提出一个还没有答案的问题，并让别人也想问
 *   tier 5 点亮 —— 你的答案成为别人的起点（AlphaFold 量级）
 *
 * 注意 tier 3 往上不是"再努力一点"就能到的：
 * 一个 tier 5 节点可能耗掉一个人十年。这正是设计意图 ——
 * 它是"至高隐藏目标"，不是周任务。
 *
 * ⚠️ 本数据在 evolution.revealed === false 时禁止被 UI 读取。
 */
export const EVOLUTION_NODES: EvolutionNode[] = [
  // ========================= 生命的计算 =========================
  {
    id: 'cb_1', branch: 'COMPUTE_BIOLOGY', tier: 1,
    name: '能与这个领域对话',
    criterion: '完整读懂一项前沿工作，并亲手复现出它的核心结果',
    prerequisites: [], requiredTagCount: 2, tagFilter: ['omics', 'reproducibility', 'literature'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'cb_2', branch: 'COMPUTE_BIOLOGY', tier: 2,
    name: '让结果可以再次发生',
    criterion: '交付一条他人可复现、可复用的完整分析流水线',
    prerequisites: ['cb_1'], requiredTagCount: 2, tagFilter: ['pipeline', 'engineering'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'cb_3', branch: 'COMPUTE_BIOLOGY', tier: 3,
    name: '让预测取代一次实验',
    criterion: '构建出在真实任务上可替代一次湿实验的预测模型，并被独立验证',
    prerequisites: ['cb_2'], requiredTagCount: 3, tagFilter: ['protein', 'modeling', 'validation'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'cb_4', branch: 'COMPUTE_BIOLOGY', tier: 4,
    name: '提出一个领域还没有答案的问题',
    criterion: '提出并公开一个可被否证的原创问题，且引发了同行的实质性讨论',
    prerequisites: ['cb_3'], requiredTagCount: 2, tagFilter: ['research_question', 'novelty'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'cb_5', branch: 'COMPUTE_BIOLOGY', tier: 5,
    name: 'AlphaFold 量级的方法',
    criterion:
      '你的方法改变了整个领域的工作方式 —— 人们不再做原先那件事，因为你的方法做得更好、更快、更便宜',
    prerequisites: ['cb_4'], requiredTagCount: 3, tagFilter: ['paradigm', 'adoption', 'citation'],
    lit: false, litAt: null, litWhileRevealed: false,
  },

  // ========================= 心智的镜像 =========================
  {
    id: 'ai_1', branch: 'INTELLIGENCE', tier: 1,
    name: '理解学习的本质',
    criterion: '不依赖高层封装，从零实现一个可训练的模型',
    prerequisites: [], requiredTagCount: 2, tagFilter: ['ml_foundation', 'from_scratch'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'ai_2', branch: 'INTELLIGENCE', tier: 2,
    name: '可评估的智能',
    criterion: '为一个智能系统建立可信的评估体系，并解释它为什么可信',
    prerequisites: ['ai_1'], requiredTagCount: 2, tagFilter: ['evaluation', 'benchmark'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'ai_3', branch: 'INTELLIGENCE', tier: 3,
    name: '对齐的边缘',
    criterion: '在真实系统中识别出一次失效模式，并给出可验证的缓解方案',
    prerequisites: ['ai_2'], requiredTagCount: 2, tagFilter: ['alignment', 'failure_mode'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'ai_4', branch: 'INTELLIGENCE', tier: 4,
    name: '镜子里的问题',
    criterion: '提出一个关于智能本身的开放问题，并把它推进到可被研究的状态',
    prerequisites: ['ai_3'], requiredTagCount: 2, tagFilter: ['intelligence', 'research_question'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'ai_5', branch: 'INTELLIGENCE', tier: 5,
    name: '一个被真实世界信任的系统',
    criterion: '你构建的智能系统被大规模真实使用，且其行为边界被认为可靠',
    prerequisites: ['ai_4'], requiredTagCount: 2, tagFilter: ['deployment', 'scale', 'paradigm'],
    lit: false, litAt: null, litWhileRevealed: false,
  },

  // ========================= 衰老的边界 =========================
  {
    id: 'md_1', branch: 'MEDICINE', tier: 1,
    name: '时间的解剖',
    criterion: '系统理解一条衰老相关通路，并能说清它的证据链',
    prerequisites: [], requiredTagCount: 2, tagFilter: ['aging_pathway', 'literature'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'md_2', branch: 'MEDICINE', tier: 2,
    name: '可测量的衰老',
    criterion: '使用或构建一个衰老生物标志物评估，并说明其局限',
    prerequisites: ['md_1'], requiredTagCount: 2, tagFilter: ['biomarker', 'measurement'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'md_3', branch: 'MEDICINE', tier: 3,
    name: '让时间慢一点',
    criterion: '在一个可验证的模型上复现某干预的效果，并排除常见偏差',
    prerequisites: ['md_2'], requiredTagCount: 2, tagFilter: ['intervention', 'replication'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'md_4', branch: 'MEDICINE', tier: 4,
    name: '逆转一个可测量的衰老指标',
    criterion: '在严格对照下实现一项可重复的逆转结果，并公开全部数据',
    prerequisites: ['md_3'], requiredTagCount: 2, tagFilter: ['longevity', 'clinical_translation'],
    lit: false, litAt: null, litWhileRevealed: false,
  },

  // ========================= 能量的驯服 =========================
  {
    id: 'en_1', branch: 'ENERGY', tier: 1,
    name: '能量的账本',
    criterion: '完整核算一个真实系统的能量流，误差可解释',
    prerequisites: [], requiredTagCount: 2, tagFilter: ['energy_audit', 'system_thinking'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'en_2', branch: 'ENERGY', tier: 2,
    name: '效率的极限',
    criterion: '识别并优化一个真实存在的能量损耗点，且可测量',
    prerequisites: ['en_1'], requiredTagCount: 2, tagFilter: ['optimization', 'efficiency'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'en_3', branch: 'ENERGY', tier: 3,
    name: '让损耗下降一个数量级',
    criterion: '在真实尺度上把某环节的损耗降低一个数量级，并经受住第三方复算',
    prerequisites: ['en_2'], requiredTagCount: 2, tagFilter: ['grid_scale', 'storage'],
    lit: false, litAt: null, litWhileRevealed: false,
  },

  // ========================= 物质的编织 =========================
  {
    id: 'mt_1', branch: 'MATERIALS', tier: 1,
    name: '原子尺度的手工',
    criterion: '完成一次材料/结构的设计-验证闭环',
    prerequisites: [], requiredTagCount: 1, tagFilter: ['materials', 'design_loop'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'mt_2', branch: 'MATERIALS', tier: 3,
    name: '让材料自己找到结构',
    criterion: '设计出可自组装或可生成式设计的结构，并在真实条件下成立',
    prerequisites: ['mt_1'], requiredTagCount: 2, tagFilter: ['self_assembly', 'generative_design'],
    lit: false, litAt: null, litWhileRevealed: false,
  },

  // ========================= 出走与远望 =========================
  {
    id: 'sp_1', branch: 'SPACE', tier: 1,
    name: '离开地面的算术',
    criterion: '复现一次轨道/发射相关的核心计算，并说清每一项假设',
    prerequisites: [], requiredTagCount: 2, tagFilter: ['orbital', 'launch_window'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'sp_2', branch: 'SPACE', tier: 2,
    name: '第二个故乡',
    criterion: '参与或推进一个与地外生存相关的真实问题',
    prerequisites: ['sp_1'], requiredTagCount: 2, tagFilter: ['habitat', 'space'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
  {
    id: 'sp_3', branch: 'SPACE', tier: 3,
    name: '让一次发射因为你的计算而不同',
    criterion: '你的计算或模型被真实任务采用，并影响了决策',
    prerequisites: ['sp_2'], requiredTagCount: 1, tagFilter: ['flight_heritage'],
    lit: false, litAt: null, litWhileRevealed: false,
  },
];

/**
 * 揭示条件：满足任意一条即让进化树显形。
 *
 * 阈值刻意设得"玩家不可能猜到"，但一旦触发就必然有足够内容可看。
 * 由于节点维度已拉高到 tier 5 = AlphaFold 量级，最短路径是**累计里程碑**：
 * 大约在玩家真正持续产出 1~2 年之后。
 */
export const EVOLUTION_REVEAL_CONDITIONS: EvolutionRevealCondition[] = [
  { kind: 'total_milestones', label: '累计重要研究里程碑', threshold: 15, met: false },
  { kind: 'lit_nodes', label: '已点亮的节点', threshold: 3, met: false },
  { kind: 'branches_touched', label: '已触及的分支', threshold: 3, met: false },
  { kind: 'chapter_reached', label: '抵达篇章', threshold: 7, met: false },
];

/**
 * 给 Arbiter 的里程碑标签词表：AI 只能从这里选，不得自创。
 * 这是防止标签漂移（同一个成就被写成十种不同 tag）的关键约束。
 *
 * ⚠️ 每个节点的 tagFilter 都必须能在本表中找到匹配项；
 *    节点的 requiredTagCount 不得大于其 tagFilter 能匹配到的标签数。
 */
export const MILESTONE_TAG_VOCABULARY: Array<{ branch: string; tag: string; description: string }> = [
  // —— 生命的计算 ——
  { branch: 'COMPUTE_BIOLOGY', tag: 'omics', description: '完成一次真实的组学数据分析' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'reproducibility', description: '成功复现他人结果' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'pipeline', description: '构建可复用的分析流水线' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'engineering', description: '完成工程化交付（容器/CI/文档）' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'protein', description: '深入蛋白质结构/序列相关工作' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'modeling', description: '训练或评估一个生物预测模型' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'validation', description: '模型/结论被独立数据或第三方验证' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'research_question', description: '提出一个明确的原创科学问题' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'novelty', description: '产出具有原创性的结果' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'adoption', description: '成果被他人实际使用' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'citation', description: '成果被正式引用或致谢' },
  { branch: 'COMPUTE_BIOLOGY', tag: 'paradigm', description: '改变了领域的工作方式' },

  // —— 心智的镜像 ——
  { branch: 'INTELLIGENCE', tag: 'ml_foundation', description: '掌握机器学习基础并动手实现' },
  { branch: 'INTELLIGENCE', tag: 'from_scratch', description: '从零实现算法而非调用库' },
  { branch: 'INTELLIGENCE', tag: 'evaluation', description: '建立可信的评估体系' },
  { branch: 'INTELLIGENCE', tag: 'benchmark', description: '在标准基准上完成对比' },
  { branch: 'INTELLIGENCE', tag: 'alignment', description: '关注并对齐系统的目标与行为' },
  { branch: 'INTELLIGENCE', tag: 'failure_mode', description: '识别系统失效模式' },
  { branch: 'INTELLIGENCE', tag: 'intelligence', description: '推进关于智能本身的问题' },
  { branch: 'INTELLIGENCE', tag: 'deployment', description: '系统被真实部署使用' },
  { branch: 'INTELLIGENCE', tag: 'scale', description: '在真实规模上验证系统' },

  // —— 衰老的边界 ——
  { branch: 'MEDICINE', tag: 'aging_pathway', description: '深入某条衰老相关通路' },
  { branch: 'MEDICINE', tag: 'biomarker', description: '接触或构建衰老/健康标志物' },
  { branch: 'MEDICINE', tag: 'measurement', description: '建立可量化的健康测量' },
  { branch: 'MEDICINE', tag: 'intervention', description: '设计或执行一次干预' },
  { branch: 'MEDICINE', tag: 'replication', description: '复现一项生物学效应' },
  { branch: 'MEDICINE', tag: 'longevity', description: '在衰老指标上取得可重复的改善' },
  { branch: 'MEDICINE', tag: 'clinical_translation', description: '工作推进到可转化的阶段' },

  // —— 能量的驯服 ——
  { branch: 'ENERGY', tag: 'energy_audit', description: '完成一次能量流核算' },
  { branch: 'ENERGY', tag: 'optimization', description: '优化一个真实系统的效率' },
  { branch: 'ENERGY', tag: 'efficiency', description: '显著降低损耗' },
  { branch: 'ENERGY', tag: 'grid_scale', description: '在电网/系统尺度上工作' },
  { branch: 'ENERGY', tag: 'storage', description: '涉及储能与转换环节' },

  // —— 物质的编织 ——
  { branch: 'MATERIALS', tag: 'materials', description: '完成材料层面的工作' },
  { branch: 'MATERIALS', tag: 'design_loop', description: '完成设计-验证闭环' },
  { branch: 'MATERIALS', tag: 'self_assembly', description: '实现自组装或自发有序结构' },
  { branch: 'MATERIALS', tag: 'generative_design', description: '用生成式方法设计新结构' },

  // —— 出走与远望 ——
  { branch: 'SPACE', tag: 'orbital', description: '掌握轨道/发射相关计算' },
  { branch: 'SPACE', tag: 'launch_window', description: '处理发射窗口/任务规划约束' },
  { branch: 'SPACE', tag: 'habitat', description: '参与地外生存相关问题' },
  { branch: 'SPACE', tag: 'space', description: '参与航天相关硬问题' },
  { branch: 'SPACE', tag: 'flight_heritage', description: '成果被真实航天任务采用' },

  // —— 通用 ——
  { branch: 'GENERAL', tag: 'literature', description: '系统性阅读并整理某一领域文献' },
  { branch: 'GENERAL', tag: 'system_thinking', description: '用系统视角分析问题' },
];

/**
 * 可信度门槛：低于这条线的标签**不算数**。
 *
 * `TechMilestoneRecord.confidence` 的注释写着"低可信度不计入进度"，门槛落在
 * 这里，是因为它属于**标签管线的契约**，不属于某一个消费方 —— 成就判定
 * （`lib/achievementEngine`）与节点点亮（Phase 5 的进化树引擎）读的是同一条线，
 * 抄成两份的那天，会出现"徽记亮了但节点没亮"这种谁也解释不清的画面。
 *
 * 0.5 这个数不是随手取的：Arbiter 替身给的三档可信度是 [0.82, 0.70, 0.58]，
 * 门槛定在 0.5 之下，第三档才算数。定高一点（0.6）会**静默地**切掉每一条
 * 抽到三标签的复盘 —— 没有任何报错，只是这里永远少一点。
 */
export const MILESTONE_CONFIDENCE_FLOOR = 0.5;

// ---------------------------------------------------------------------------
// 4. 进化树的对外措辞
//
// ⚠️ 这几个表**只在 evolution.revealed 为真时才可以被读取**。
//    未揭晓时走 selectors.evolutionView 的迷雾分支，
//    那个分支里没有任何一个字符串来自本文件（见 verify-ops ⑯）。
// ---------------------------------------------------------------------------

export const EVOLUTION_BRANCH_LABELS: Record<EvolutionBranch, string> = {
  COMPUTE_BIOLOGY: '生命的计算',
  INTELLIGENCE: '心智的镜像',
  MEDICINE: '衰老的边界',
  ENERGY: '能量的驯服',
  MATERIALS: '物质的编织',
  SPACE: '出走与远望',
};

/**
 * 每个分支的一句题记。
 *
 * 它们不是在解释这个分支做什么 —— 那种句子在「档案」里会显得像产品说明书。
 * 它们要说的是**这一支人类走了多久**，让玩家在点亮节点之前先感到分量。
 */
export const EVOLUTION_BRANCH_EPIGRAPHS: Record<EvolutionBranch, string> = {
  COMPUTE_BIOLOGY: '生命第一次被写成可以被运行的东西。',
  INTELLIGENCE: '我们造了一面镜子，然后开始害怕它照得太清楚。',
  MEDICINE: '所有医学的终点，都是让人多一次说再见的机会。',
  ENERGY: '每一次文明的跃升，都是一次对能量的重新驯服。',
  MATERIALS: '人类的历史，一半写在材料的名字里：青铜、铁、硅。',
  SPACE: '离开，是这颗星球上唯一一种不会过期的浪漫。',
};

/** 节点层级。顺序即成长：解语 → 复现 → 改良 → 提问 → 点亮 */
export const EVOLUTION_TIER_LABELS: Record<EvolutionTier, string> = {
  1: '解语',
  2: '复现',
  3: '改良',
  4: '提问',
  5: '点亮',
};

/**
 * 未揭晓时唯一的对外文案。
 *
 * 只有这一句 —— 迷雾状态下再多的字都是剧透。
 * 「你还不知道自己正在点亮什么」：它同时是事实、是邀请，也是一句很轻的安慰
 * （你现在做的那些看起来没有回报的事，在这个坐标系里是有方向的）。
 */
export const EVOLUTION_FOG_LINE = '你还不知道自己正在点亮什么。';
