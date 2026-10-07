// ============================================================================
// EarthOnline · 现实里程碑目录（静态设定，不入存档）
//
// 这些是"真实世界里已经发生的事"：签证递交、第一次过海关、论文被接收……
// 玩家在「记录一件事」面板里自行声明 → 固定 EXP 入账 + 可点亮终极目标里程碑。
//
// 设计约束：
//   - EXP 额度刻意小（80~500）：它是"被看见了"，不是主要经济来源；
//   - 一次性事件不可重复记录；可重复条目视配置带冷却或不带
//     （不带冷却的，防刷交给月度上限兜底——每段真实发生的旅程都值得记录）；
//   - 月度总上限见 RewardPolicy.realityMilestoneMonthlyExpCap（防刷）；
//   - 部分条目与篇章离开条件直接相关：
//       rm_overseas_experience  ↔ Ch.3「候鸟的第一段航程」离开条件
//       rm_visa_submitted / rm_visa_approved ↔ Ch.6「无锚之船」离开条件
//     （Phase 3 的章节 selector 会同时检查任务完成与里程碑记录）
// ============================================================================

import type { RealityMilestoneCategory, RealityMilestoneDefinition } from '../../types/milestones';

export const REALITY_MILESTONES: RealityMilestoneDefinition[] = [
  // ------------------------- 移动 · 世界支线 -------------------------
  {
    id: 'rm_first_border',
    title: '第一次独自过海关',
    subtitle: '世界线从这一格开始',
    category: 'mobility',
    exp: 120,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: [],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪一天、哪个口岸、飞去了哪',
    iconKey: 'passport-stamp',
  },
  {
    id: 'rm_overseas_trip',
    title: '一段海外旅行',
    subtitle: '不少于 7 天，走出游客区的那种',
    category: 'mobility',
    exp: 150,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: [],
    repeatable: true,
    // 不设冷却（玩家裁定）：每段真实发生的旅程都值得记录，防刷由月度上限兜底
    cooldownDays: null,
    evidenceHint: '去了哪里、待了几天、印象最深的一天',
    iconKey: 'suitcase',
  },
  {
    id: 'rm_overseas_experience',
    title: '完成一段海外经历',
    subtitle: '学习或研究，不少于 8 周',
    category: 'mobility',
    exp: 300,
    linkedGoalIds: ['GLOBAL_MOBILITY', 'GEO_INDEPENDENT_WORK'],
    // ⚠️ 只点第一格。"第二段"是**第 N 次**的语义，不是"又一次记录"——
    // 一次记录点亮两格是谎言（同一笔事实被念成两件达成）。
    // gm_second_experience 的判据在 GOAL_MILESTONE_CONDITIONS 里按计数判（≥ 2 次）。
    grantsGoalMilestoneIds: ['gm_first_experience'],
    repeatable: true,
    cooldownDays: 180,
    evidenceHint: '在哪、跟谁、做了什么事',
    iconKey: 'bird-migration',
  },
  {
    id: 'rm_language_key',
    title: '语言的钥匙',
    subtitle: '目标语言可以独立生活与面试',
    category: 'mobility',
    exp: 200,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: ['gm_language'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '例：用该语言完成一次 30 分钟以上的正式面试，或独自办完一件完整的事务',
    iconKey: 'key',
  },
  {
    id: 'rm_visa_documents',
    title: '材料成形',
    subtitle: '身份申请的核心材料完成初稿',
    category: 'mobility',
    exp: 100,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: ['gm_documents'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪一类申请、材料交给谁看过一遍',
    iconKey: 'folder-check',
  },
  {
    id: 'rm_visa_submitted',
    title: '递交',
    subtitle: '申请正式进入系统',
    category: 'mobility',
    exp: 150,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: ['gm_submitted'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪个国家/地区、哪一类申请、哪一天提交',
    iconKey: 'upload',
  },
  {
    id: 'rm_visa_approved',
    title: '获批',
    subtitle: '证件上多了一行属于你的字',
    category: 'mobility',
    exp: 400,
    attributePoints: { wil: 1 },
    linkedGoalIds: ['GLOBAL_MOBILITY', 'GEO_INDEPENDENT_WORK'],
    grantsGoalMilestoneIds: ['gm_approved'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪一天收到结果、等了多久',
    iconKey: 'stamp',
  },
  {
    id: 'rm_visa_landed',
    title: '落地生根',
    subtitle: '地址、账户、税务，一样样办完',
    category: 'mobility',
    exp: 300,
    linkedGoalIds: ['GLOBAL_MOBILITY'],
    grantsGoalMilestoneIds: ['gm_landed'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '在哪个城市、办完了哪几件事',
    iconKey: 'home-pin',
  },

  // ------------------------- 学术 · 论文与产出 -------------------------
  {
    id: 'rm_first_repro',
    title: '独立复现一项结果',
    subtitle: '从读懂到亲手跑通',
    category: 'academic',
    exp: 250,
    linkedGoalIds: ['PRIVATE_LAB'],
    grantsGoalMilestoneIds: ['pl_first_repro'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '复现了哪项工作、卡在哪里、怎么通的',
    iconKey: 'reproduce',
  },
  {
    id: 'rm_preprint_public',
    title: '成果公开',
    subtitle: '预印本 / 开源仓库 / 公开数据集',
    category: 'academic',
    exp: 200,
    linkedGoalIds: ['PRIVATE_LAB'],
    grantsGoalMilestoneIds: ['pl_first_output'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '公开了什么、链接或名字',
    iconKey: 'globe-code',
  },
  {
    id: 'rm_paper_submitted',
    title: '论文投稿',
    subtitle: '把它交给审稿人',
    category: 'academic',
    exp: 120,
    linkedGoalIds: ['PRIVATE_LAB'],
    grantsGoalMilestoneIds: [],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '投给了哪里、哪一天',
    iconKey: 'paper-plane',
  },
  {
    id: 'rm_paper_accepted',
    title: '论文被接收',
    subtitle: '有人的墙上多了一枚你的钉子',
    category: 'academic',
    exp: 500,
    attributePoints: { int: 1 },
    linkedGoalIds: ['PRIVATE_LAB'],
    grantsGoalMilestoneIds: ['pl_first_paper'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪篇、中了哪里、等了多久',
    iconKey: 'citation',
  },
  {
    id: 'rm_conference_talk',
    title: '在会议上做报告',
    subtitle: '把工作讲给不客气的人听',
    category: 'academic',
    exp: 300,
    linkedGoalIds: ['PRIVATE_LAB'],
    grantsGoalMilestoneIds: [],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪个会、讲了什么、被问了什么',
    iconKey: 'podium',
  },

  // ------------------------- 资本 · 第一块钱 -------------------------
  {
    id: 'rm_first_income',
    title: '第一笔自己赚的钱',
    subtitle: '不是家里给的',
    category: 'capital',
    exp: 200,
    attributePoints: { cap: 1 },
    linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
    grantsGoalMilestoneIds: ['a9_first_own_money', 'gi_first_side_income'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '怎么赚到的、多少钱',
    iconKey: 'coin',
  },
  {
    id: 'rm_first_client',
    title: '第一个付费客户',
    subtitle: '有人为你的交付掏了钱',
    category: 'capital',
    exp: 250,
    linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
    grantsGoalMilestoneIds: [],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '交付了什么、怎么找到你的',
    iconKey: 'handshake',
  },
  {
    id: 'rm_first_remote_income',
    title: '第一笔远程收入',
    subtitle: '钱到账时，你不在任何人的办公室里',
    category: 'capital',
    exp: 250,
    linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
    grantsGoalMilestoneIds: ['gi_first_remote_income'],
    repeatable: false,
    cooldownDays: null,
    evidenceHint: '哪一笔、来自哪个平台或客户',
    iconKey: 'wifi-coin',
  },
];

export const getRealityMilestone = (id: string): RealityMilestoneDefinition | undefined =>
  REALITY_MILESTONES.find((m) => m.id === id);

export const REALITY_MILESTONE_CATEGORY_LABELS: Record<RealityMilestoneCategory, string> = {
  mobility: '移动与世界',
  academic: '纸与成果',
  capital: '第一块钱',
  life: '生活本身',
};

/**
 * **自己写的一件事**值多少 EXP（固定值，目录里那 16 条才是 80~500 的阶梯）。
 *
 * 取这个阶梯的**底价**是有意的：这一栏要的是"可以写"，不是"写得值钱"。
 * 目录里没有的事不代表它小 —— 但它也不该比目录里的任何一条更值钱，
 * 否则"自己编一条"就成了最优解，而这面墙的全部价值在于上面钉的都是真事。
 *
 * 拿不满 100 只有一种情况：本月的现实里程碑额度快见底了
 * （`realityMilestoneMonthlyExpCap`，与目录条目共用同一本账）。
 */
export const FREE_MILESTONE_EXP = 100;

/** 一次记录里最多带几张图。3 张 ≈ 一张 A4 纸的厚度，也 ≈ 1 MB 存档 */
export const MILESTONE_PHOTO_MAX = 3;
