// ============================================================================
// EarthOnline · Phase 2 · Mock 存档
//
// 用途：Phase 2 只做"看得到"的部分（场景 / HUD / Dock），
//       还没有真实的任务流转与 AI 调用，所以先给一份**结构完整、数值自洽**的存档，
//       让 UI 有东西可渲染，也顺带把类型层跑到真实数据上验一遍。
//
// 三条自律（比"能跑"更重要）：
//   1) 文案不另写一遍 —— 任务文本一律从 `catalog/classes.ts` 的 seedQuests 取，
//      避免同一句话在仓库里有两份会漂移的副本；
//   2) 数字必须能对上 —— 账本合计 = 净资产 $12,500.00，见下方 Vault 区块的推导；
//   3) 隐藏目标在 mock 里也必须保持"静默" —— evolution.revealed = false，
//      UI 层在任何情况下都不许读它。
//
// 出厂清场（2026-10-07）后的定位：本文件**只做测试夹具** ——
// verify-ops 的 991 条断言与两份冒烟都长在这份存档上，值逐字冻结。
// 玩家的初始档走 `newGameState.ts`（空档）；两者共享的花名册在 `agentRoster.ts`。
// ============================================================================

import { CLASSES, expToNext, getClass } from '@/data/catalog/classes';
import { CHAPTERS } from '@/data/catalog/chapters';
import {
  ENDGAME_GOALS,
  EVOLUTION_NODES,
  EVOLUTION_REVEAL_CONDITIONS,
} from '@/data/catalog/endgame';
import { createInitialSettings, wealthProgressRatio } from '@/data/catalog/policy';
import type {
  AttributeDelta,
  ChapterProgress,
  ChainId,
  ClassIdLiteral,
  Contact,
  DailyDefinition,
  DailyLog,
  DailyRecommendation,
  DateKey,
  EarthOnlineState,
  EvolutionBranch,
  GoalIdLiteral,
  ISODateTime,
  Quest,
  QuestChain,
  QuestDraft,
  QuestId,
  VaultTransaction,
  QuestStatus,
  WeeklyDefinition,
  WeeklyLog,
} from '@/types';
import { CURRENT_SCHEMA_VERSION, DEFAULT_GRADE_WEIGHTS, STORAGE_KEYS, USD } from '@/types';
import { createAgentRoster } from './agentRoster';

// ---------------------------------------------------------------------------
// 0. 小工具
// ---------------------------------------------------------------------------

const T = {
  enrollment: '2026-09-03T02:10:00.000Z', // 建角
  scholarship: '2026-09-10T07:00:00.000Z',
  internship: '2026-09-12T09:15:00.000Z',
  decision: '2026-09-18T11:20:00.000Z',
  tutoring: '2026-09-25T10:30:00.000Z',
  manuscript: '2026-10-01T09:00:00.000Z',
  payout: '2026-10-02T08:40:00.000Z',
  transfer: '2026-10-04T15:10:00.000Z',
  etfBuy: '2026-10-05T14:20:00.000Z',
  reproductionDone: '2026-10-06T13:40:00.000Z',
  todayMorning: '2026-10-07T01:30:00.000Z',
} as const;

/** 从职业目录里取一条种子任务的原文，避免把长文案抄第二遍 */
const seedOf = (classId: ClassIdLiteral, tempId: string): QuestDraft => {
  const found = getClass(classId)?.seedQuests.find((s) => s.tempId === tempId);
  if (!found) throw new Error(`[mockState] 目录里没有这条种子任务：${classId}/${tempId}`);
  return found;
};

// ---------------------------------------------------------------------------
// 1. 金库 —— 每一笔都可追溯到一条现实理由
//
//   $1,100 建角注入 + $14,860 各类进账 − $10,680 支出与投资 = 现金 $4,180
//   持仓：ETF $6,820（成本 $7,200，月末估值下修 $380）+ 货币基金 $1,500
//   净资产 = 4,180 + 6,820 + 1,500 = **$12,500.00**
// ---------------------------------------------------------------------------

const txn = (
  id: string,
  ts: ISODateTime,
  localDate: DateKey,
  type: VaultTransaction['type'],
  amountUsd: number,
  assetClass: VaultTransaction['assetClass'],
  category: string,
  note: string,
): VaultTransaction => ({
  id,
  ts,
  localDate,
  type,
  amount: USD(amountUsd),
  assetClass,
  category,
  note,
});

/**
 * 账本。
 *
 * ⚠️ **数组顺序 = 时间顺序，追加型，不许回头插队。**
 * 它不是一个"随便什么顺序的集合"，而是一本按时间往下写的流水账 ——
 * `selectors.recentTransactions` 直接 `slice(-n)` 取最近几笔，**不做排序**，
 * 因为它信这件事：写入方只会往后追加。所以这一行注释是承重的：
 * 谁要往中间插一笔，必须同时想清楚 `recentTransactions` 会不会开始倒着显示。
 * verify-ops 的【⑩】会把它钉住。
 */
const TRANSACTIONS: VaultTransaction[] = [
  txn('txn_001', T.enrollment, '2026-09-03', 'income', 1100, 'cash', '建角注入', '家里打来的启动金（¥8,000）'),
  txn('txn_002', T.scholarship, '2026-09-10', 'income', 4200, 'cash', '奖助学金', '国家助学贷款 + 学院奖学金结转'),
  txn('txn_003', T.internship, '2026-09-12', 'income', 3600, 'cash', '实习补贴', '暑期实习补贴一次性结清'),
  txn('txn_004', T.tutoring, '2026-09-25', 'income', 960, 'cash', '家教', '家教 ×3 次课 —— 第一笔自己赚来的钱'),
  txn('txn_005', T.manuscript, '2026-10-01', 'income', 1800, 'cash', '稿费 / 助研补助', '科普稿费 + 助研补助'),
  txn('txn_006', '2026-10-01T09:05:00.000Z', '2026-10-01', 'expense', -1980, 'cash', '生活支出', '9 月生活费与设备分摊'),
  txn('txn_007', T.payout, '2026-10-02', 'income', 3200, 'cash', '接单尾款', '暑期外包项目尾款'),
  txn('txn_008', T.transfer, '2026-10-04', 'investment_in', -1500, 'bond', '货币基金', '转入货币基金，作为应急备用金'),
  txn('txn_009', T.etfBuy, '2026-10-05', 'investment_in', -7200, 'etf', 'ETF', '买入宽基 ETF（VOO 一类）'),
  txn('txn_010', T.reproductionDone, '2026-10-06', 'valuation', -380, 'etf', '估值刷新', '月末估值下修（浮亏，不动仓位）'),
];

// ---------------------------------------------------------------------------
// 2. 任务 —— 文本全部来自 catalog，只有状态与时间戳是这份存档自己的
//
// 状态覆盖是刻意的：完成 / 执行中 / 已领取 / 待领取 / 待审核 各一条，
// 这样 Phase 3 接面板时，五种卡片一次就能全看到。
// ---------------------------------------------------------------------------

interface QuestPatch {
  id: QuestId;
  status: QuestStatus;
  classId: ClassIdLiteral;
  tempId: string;
  chain: Quest['chain'];
  createdAt: ISODateTime;
  claimedAt?: ISODateTime | null;
  startedAt?: ISODateTime | null;
  turnInOpenedAt?: ISODateTime | null;
  completedAt?: ISODateTime | null;
  actualEffortMinutes?: number | null;
  prerequisites?: QuestId[];
  grant?: Quest['grant'];
  journalEntryId?: string | null;
  /** 这条任务和谁有关（默认空数组） */
  linkedContactIds?: Quest['linkedContactIds'];
  /**
   * reroute 的两个字段在 mock 里全部为空（这份档是"还没用过换个做法"的世界），
   * 所以它们在这里是可选的，由 mkQuest 补默认值 —— 免得每个 patch 都写两行 null/[]。
   */
  origin: Omit<Quest['origin'], 'reroutedFrom' | 'rerouteHistory'> & {
    reroutedFrom?: Quest['origin']['reroutedFrom'];
    rerouteHistory?: Quest['origin']['rerouteHistory'];
  };
  proofSubmitted?: string | null;
}

const mkQuest = (patch: QuestPatch): Quest => {
  const seed = seedOf(patch.classId, patch.tempId);
  return {
    id: patch.id,
    classId: patch.classId,
    type: seed.type,
    status: patch.status,
    title: seed.title,
    subtitle: seed.subtitle,
    narrative: seed.narrative,
    objective: seed.objective,
    difficulty: seed.difficulty,
    effortEstimate: seed.effortEstimate,
    reward: seed.reward,
    outcomeHints: seed.outcomeHints,
    linkedGoalIds: seed.linkedGoalIds,
    linkedAttributes: seed.linkedAttributes,
    linkedContactIds: patch.linkedContactIds ?? [],
    prerequisiteQuestIds: patch.prerequisites ?? [],
    dueHint: seed.dueHintDays === null ? null : patch.createdAt,
    proof: seed.proof ? { ...seed.proof, submitted: patch.proofSubmitted ?? null } : null,
    tags: seed.tags,
    chain: patch.chain,
    origin: {
      reroutedFrom: null,
      rerouteHistory: [],
      ...patch.origin,
    },
    grant: patch.grant ?? null,
    journalEntryId: patch.journalEntryId ?? null,
    createdAt: patch.createdAt,
    claimedAt: patch.claimedAt ?? null,
    startedAt: patch.startedAt ?? null,
    turnInOpenedAt: patch.turnInOpenedAt ?? null,
    completedAt: patch.completedAt ?? null,
    actualEffortMinutes: patch.actualEffortMinutes ?? null,
  };
};

const CHAIN_REPRO = {
  chainId: 'ch_repro_dignity',
  chainTitle: '可复现的尊严',
  total: 3,
} as const;

const CHAIN_RISK = {
  chainId: 'ch_risk_discipline',
  chainTitle: '把赌性关进笼子',
  total: 2,
} as const;

const QUESTS: Quest[] = [
  // —— 已完成：这条任务的复盘拿了 8% 加成，是成功日记里唯一一条 ——
  mkQuest({
    id: 'q_cb_repro_figure',
    status: 'completed',
    classId: 'computational_biology',
    tempId: 'cb_seed_1',
    chain: { ...CHAIN_REPRO, index: 0 },
    createdAt: '2026-09-28T11:58:00.000Z',
    claimedAt: '2026-09-28T12:06:00.000Z',
    startedAt: '2026-09-29T01:00:00.000Z',
    turnInOpenedAt: '2026-10-06T13:22:00.000Z',
    completedAt: T.reproductionDone,
    actualEffortMinutes: 260,
    journalEntryId: 'jr_0001',
    proofSubmitted: 'notebooks/repro_main_figure.ipynb（含运行输出与 diff 注释）',
    origin: {
      agentId: 'agent_class_compbio',
      sourceIdea: '想把收藏夹里的论文真正跑通一遍，而不是只收藏',
      generatedAt: '2026-09-28T11:56:00.000Z',
      reviewed: true,
      reviewerNote: '把「至少 3 处差异」写成硬性项是对的：差异才是你真正学到的东西。',
    },
    grant: {
      base: { exp: 180 },
      bonusPct: 8,
      final: { exp: 194 },
      grantedAt: T.reproductionDone,
      bonusReason: '复盘指出了差异的归因方式，属于方法层面的洞见（难度 2 · sharp → 8%）',
    },
  }),

  // —— 执行中：唯一一条正在推进的支线 ——
  //    绑定联系人=c_lin：林昭那次「Docker 镜像怎么压」的来往（it_0003）
  //    在数据上就是这条任务驱动的。完成它，林昭名下会多落一条互动 ——
  //    「任务 → 关系」的闭环在这里有一条活的样本。
  mkQuest({
    id: 'q_cb_docker',
    status: 'active',
    classId: 'computational_biology',
    tempId: 'cb_seed_2',
    chain: { ...CHAIN_REPRO, index: 1 },
    createdAt: '2026-10-06T13:42:00.000Z',
    claimedAt: '2026-10-06T13:46:00.000Z',
    startedAt: T.todayMorning,
    prerequisites: ['q_cb_repro_figure'],
    linkedContactIds: ['c_lin'],
    origin: {
      agentId: 'agent_class_compbio',
      sourceIdea: '复现完之后想让别人也能一条命令跑出来',
      generatedAt: '2026-10-06T13:41:00.000Z',
      reviewed: true,
      reviewerNote: null,
    },
  }),

  // —— 待领取：已通过审核，但前置（Docker 那条）还没完成 ——
  //    它会出现在悬赏板上，却不能领取。这条数据是**故意**留的：
  //    门控逻辑一接上就能立刻看到效果 —— 一处「有前置所以灰掉」的活样本，
  //    同时也是"结算掉 q_cb_docker 它就会解禁"这条闭环的起点。
  mkQuest({
    id: 'q_cb_questions',
    status: 'offered',
    classId: 'computational_biology',
    tempId: 'cb_seed_3',
    chain: { ...CHAIN_REPRO, index: 2 },
    createdAt: '2026-10-06T13:42:00.000Z',
    claimedAt: null,
    prerequisites: ['q_cb_docker'],
    origin: {
      agentId: 'agent_class_compbio',
      sourceIdea: '想让自己的问题变得更具体',
      generatedAt: '2026-10-06T13:41:00.000Z',
      reviewed: true,
      reviewerNote: null,
    },
  }),

  // —— 已领取未开始：另一条链的第一步（无前置，所以领得动）——
  mkQuest({
    id: 'q_inv_pain_audit',
    status: 'claimed',
    classId: 'investor',
    tempId: 'inv_seed_1',
    chain: { ...CHAIN_RISK, index: 0 },
    createdAt: '2026-10-05T13:58:00.000Z',
    claimedAt: '2026-10-06T02:10:00.000Z',
    origin: {
      agentId: 'agent_class_investor',
      sourceIdea: '想知道自己到底在什么状态下最容易做错决定',
      generatedAt: '2026-10-05T13:56:00.000Z',
      reviewed: true,
      reviewerNote: '纳入"无交易记录也可执行"的改法，避免因为没有账户就无从下手。',
    },
  }),

  // —— 待审核：链上第二步还停在 draft，等玩家逐条过目 ——
  mkQuest({
    id: 'q_inv_rulebook',
    status: 'draft',
    classId: 'investor',
    tempId: 'inv_seed_2',
    chain: { ...CHAIN_RISK, index: 1 },
    createdAt: '2026-10-05T13:58:00.000Z',
    prerequisites: ['q_inv_pain_audit'],
    origin: {
      agentId: 'agent_class_investor',
      sourceIdea: '想把纪律从脑子里搬出来',
      generatedAt: '2026-10-05T13:56:00.000Z',
      reviewed: false,
      reviewerNote: null,
    },
  }),
];

const questsById = {} as Record<QuestId, Quest>;
for (const q of QUESTS) questsById[q.id] = q;

/**
 * 任务链容器（`QuestState.chains`）。
 *
 * 两条链的 review 状态是刻意错开的，覆盖两种真实情形：
 *   - 复现链：三条全部 resolve 过（完成 / 执行中 / 待领取），`reviewedAt` 已落定；
 *   - 风控链：第二条还停在 draft（等着逐条过目），所以 `reviewedAt` 仍为 null、
 *     重生成额度一次都没用掉 —— Phase 3 接入 `RegenerateQuestChain` 时，
 *     这条链就是现成的测试样本。
 *
 * `linkedGoalIds` 取该链各成员的并集（见 catalog/classes.ts 的 seedQuests）。
 */
const CHAINS: QuestChain[] = [
  {
    id: 'ch_repro_dignity',
    title: '可复现的尊严',
    rationale:
      '把一个结论从「我读懂了」推到「别人能一条命令跑通」，这是独立研究者最基础的信用。',
    classId: 'computational_biology',
    questIds: ['q_cb_repro_figure', 'q_cb_docker', 'q_cb_questions'],
    linkedGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
    createdAt: '2026-09-28T11:56:00.000Z',
    review: {
      playerNote: '先跑通，再打包，最后才谈提问 —— 顺序别反。',
      regenerationCount: 0,
      rerouteCount: 0,
      reviewedAt: '2026-09-28T12:06:00.000Z',
    },
    completed: false,
  },
  {
    id: 'ch_risk_discipline',
    title: '把赌性关进笼子',
    rationale: 'A9 不是靠一次重仓得来的；先看清自己在什么状态下会做错决定，再谈规则。',
    classId: 'investor',
    questIds: ['q_inv_pain_audit', 'q_inv_rulebook'],
    linkedGoalIds: ['A9_ASSETS'],
    createdAt: '2026-10-05T13:56:00.000Z',
    review: {
      playerNote: null,
      regenerationCount: 0,
      rerouteCount: 0,
      // 第二条仍是 draft，链尚未审核完毕
      reviewedAt: null,
    },
    completed: false,
  },
];

const chainsById = {} as Record<ChainId, QuestChain>;
for (const c of CHAINS) chainsById[c.id] = c;

// ---------------------------------------------------------------------------
// 3. 日常 —— 只能由玩家创建；AI 推荐在玩家裁决前不生效
// ---------------------------------------------------------------------------

const DAILIES: DailyDefinition[] = [
  {
    id: 'd_sleep',
    title: '睡够 7 小时',
    origin: 'player_created',
    adoptedFromRecommendationId: null,
    classId: null,
    targetPerDay: 1,
    reward: { exp: 60 },
    penaltyExp: 90,
    iconKey: 'sleep',
    countsForStreak: true,
    streak: 22,
    bestStreak: 31,
    enabled: true,
    window: { fromHour: 5, toHour: 11 },
    createdAt: T.enrollment,
    archivedAt: null,
  },
  {
    id: 'd_paper_figure',
    title: '读一篇论文的 Figure 而不是 Abstract',
    origin: 'ai_recommendation_adopted',
    adoptedFromRecommendationId: 'rec_seed_paper',
    classId: 'computational_biology',
    targetPerDay: 1,
    reward: { exp: 80 },
    penaltyExp: 120,
    iconKey: 'paper',
    countsForStreak: true,
    streak: 6,
    bestStreak: 12,
    enabled: true,
    window: null,
    createdAt: T.internship,
    archivedAt: null,
  },
  {
    id: 'd_commit',
    title: '代码提交（哪怕只有一行）',
    origin: 'ai_recommendation_adopted',
    adoptedFromRecommendationId: 'rec_seed_commit',
    classId: 'computational_biology',
    targetPerDay: 1,
    reward: { exp: 70 },
    penaltyExp: 105,
    iconKey: 'commit',
    countsForStreak: true,
    streak: 14,
    bestStreak: 14,
    enabled: true,
    window: null,
    createdAt: '2026-09-12T09:32:00.000Z',
    archivedAt: null,
  },
];

const RECOMMENDATIONS: DailyRecommendation[] = [
  {
    id: 'rec_seed_paper',
    title: '读一篇论文的 Figure 而不是 Abstract',
    targetPerDay: 1,
    iconKey: 'paper',
    rationale: '图表是结论的骨架，读图比读摘要更接近科研本身',
    sourceAgentId: 'agent_class_compbio',
    sourceClassId: 'computational_biology',
    status: 'adopted',
    createdAt: T.internship,
    resolvedAt: '2026-09-12T09:30:00.000Z',
  },
  {
    id: 'rec_seed_commit',
    title: '代码提交（哪怕只有一行）',
    targetPerDay: 1,
    iconKey: 'commit',
    rationale: '科研的手感来自双手每天与数据的接触',
    sourceAgentId: 'agent_class_compbio',
    sourceClassId: 'computational_biology',
    status: 'adopted',
    createdAt: '2026-09-12T09:31:00.000Z',
    resolvedAt: '2026-09-12T09:32:00.000Z',
  },
  {
    id: 'rec_ledger',
    title: '记录今日净值与持仓理由',
    targetPerDay: 1,
    iconKey: 'ledger',
    rationale: '账本是唯一不会骗你的记录',
    sourceAgentId: 'agent_class_investor',
    sourceClassId: 'investor',
    status: 'pending', // 等玩家裁决 —— 采纳之前它什么都不是
    createdAt: '2026-10-05T14:02:00.000Z',
    resolvedAt: null,
  },
];

/**
 * 昨天（尚未结算）。
 *
 * ⚠️ 这里**故意漏了 d_commit** —— 三条都打满的存档很好看，
 * 但它让跨天结算这条链路永远没有可演示的路径。
 * 漏掉一条、保住两条，才是这个机制真正要处理的那种日子：
 * 你并不是什么都没做，你只是有一件事没做。
 * 结算后它会产出：扣 105 EXP、连击 14 归零、另外两条保住。
 */
const LOG_YESTERDAY: DailyLog = {
  localDate: '2026-10-06',
  checkedIds: ['d_sleep', 'd_paper_figure'],
  checkedAt: {
    d_sleep: '2026-10-06T00:40:00.000Z',
    d_paper_figure: '2026-10-06T05:10:00.000Z',
  },
  expEarned: 161, // (60 + 80) × 1.15（连击封顶加成）
  vaultEarned: 0,
  expPenalized: 0,
  missedIds: [],
  streakBonusPct: 15,
  energyAtEndOfDay: 42,
  settled: true,
};

const LOG_TODAY: DailyLog = {
  localDate: '2026-10-07',
  checkedIds: ['d_sleep', 'd_commit'],
  checkedAt: {
    d_sleep: '2026-10-07T00:35:00.000Z',
    d_commit: '2026-10-07T03:05:00.000Z',
  },
  expEarned: 130,
  vaultEarned: 0,
  expPenalized: 0,
  missedIds: [],
  streakBonusPct: 0, // 连击加成在跨天结算时才算，今天还没到
  energyAtEndOfDay: null,
  settled: false,
};

// ---------------------------------------------------------------------------
// 3.5 每周规程 —— 与日常同一条红线（只能由玩家创建），刻度从"天"换成"周"
//
// 三条周常覆盖三种状态：稳定在做的、在爬连击的、以及**上周漏掉的那条**
// （跑两次步）—— 和昨天故意漏掉 d_commit 是同一个用意：
// 让"周一 01:00 的周结算"这条链路一打开就有真实的路径可走。
// 结算后它会产出：扣 150 EXP、连击 2 周归零、另外两条保住。
// ---------------------------------------------------------------------------

const WEEKLIES: WeeklyDefinition[] = [
  {
    id: 'w_plan',
    title: '给这一周定三件要事',
    origin: 'player_created',
    classId: null,
    reward: { exp: 60 },
    penaltyExp: 90,
    countsForStreak: true,
    streak: 3,
    bestStreak: 5,
    enabled: true,
    createdAt: T.enrollment,
    archivedAt: null,
  },
  {
    id: 'w_reading',
    title: '读完一份长东西（论文 / 长文）并留下笔记',
    origin: 'player_created',
    classId: 'computational_biology',
    reward: { exp: 150 },
    penaltyExp: 225,
    countsForStreak: true,
    streak: 2,
    bestStreak: 4,
    enabled: true,
    createdAt: T.internship,
    archivedAt: null,
  },
  {
    id: 'w_run',
    title: '跑两次步',
    origin: 'player_created',
    classId: null,
    reward: { exp: 100 },
    penaltyExp: 150,
    countsForStreak: true,
    streak: 2,
    bestStreak: 6,
    enabled: true,
    createdAt: T.enrollment,
    archivedAt: null,
  },
];

/**
 * 周记录。两个周的留法是照抄每日的那套「故意差一天」：
 *
 *   · 09-28 那周（周一 → 周日 10-04）：打了 2/3，**故意漏掉 w_run** ——
 *     尚未结算（lastSettledWeekStart 停在 09-21），本周一之后打开就会触发。
 *   · 10-05 这一周：已经打完「给这一周定三件要事」，其余两条还在等。
 */
const WEEKLY_LOGS: Record<DateKey, WeeklyLog> = {
  '2026-09-28': {
    weekStart: '2026-09-28',
    checkedIds: ['w_plan', 'w_reading'],
    checkedAt: {
      w_plan: '2026-09-28T14:10:00.000Z',
      w_reading: '2026-10-03T07:40:00.000Z',
    },
    expEarned: 210, // 60 + 150
    expPenalized: 0,
    missedIds: [],
    settled: false,
  },
  '2026-10-05': {
    weekStart: '2026-10-05',
    checkedIds: ['w_plan'],
    checkedAt: { w_plan: '2026-10-05T13:20:00.000Z' },
    expEarned: 60,
    expPenalized: 0,
    missedIds: [],
    settled: false,
  },
};

// ---------------------------------------------------------------------------
// 3.6 属性留痕 —— 涨点（手动分配）与记账（任务）共用的时间线
//
// 三条记录各代表一种真实情形：
//   · 09-30 手动把一点放进心力（涨点，delta = 1，questId 为 null）；
//   · 复现任务的记账行（delta = 0，"这条练到了 智识 · 心力"）——
//     与成功日记 jr_0001 的 attributeKeys 对齐；
//   · 池里还剩 2 点没分配 —— 面板上那排金色的「+」就在等这个。
// ---------------------------------------------------------------------------

const ATTRIBUTE_HISTORY: AttributeDelta[] = [
  {
    key: 'foc',
    delta: 1,
    reason: '手动分配',
    ts: '2026-09-30T14:20:00.000Z',
    questId: null,
  },
  {
    key: 'int',
    delta: 0,
    reason: '复现一张图的尊严',
    ts: T.reproductionDone,
    questId: 'q_cb_repro_figure',
  },
  {
    key: 'foc',
    delta: 0,
    reason: '复现一张图的尊严',
    ts: T.reproductionDone,
    questId: 'q_cb_repro_figure',
  },
];

// ---------------------------------------------------------------------------
// 4. 成功日记 —— 一条，但它决定了进化树的第一个节点
// ---------------------------------------------------------------------------

const JOURNAL_ENTRY = {
  id: 'jr_0001',
  questId: 'q_cb_repro_figure' as QuestId,
  questTitle: '复现一张图的尊严',
  classId: 'computational_biology' as ClassIdLiteral,
  entryText:
    '跑通之后才发现，原文的 Figure 3 用的是 log2(TPM+1)，我先用了 log2(TPM)，低表达那一端的整体分布就右移了。第二个卡点是他们做过批次校正，方法写在补充材料第 4 页，正文只字未提。最费时间的其实不是写代码，是我一开始默认「论文写的顺序就是数据处理的顺序」。下次我会先把方法部分逐字抄成一份 checklist，再动键盘。',
  addenda: [],
  verdict: {
    quality: 'sharp' as const,
    bonusPct: 8,
    comment:
      '你找到的差异不是「结果对不上」，而是「假设对不上」——这两件事在实验记录里经常被混为一谈。',
    insights: [
      { text: '论文正文的方法描述总比实际执行少一步，那一步藏在补充材料里。', kind: 'method' as const },
      { text: '我把「读的顺序」默认成了「做的顺序」，这是复现效率最低的习惯。', kind: 'pattern' as const },
    ],
    milestoneTags: ['reproducibility', 'literature'],
    suggestedFollowUps: [
      {
        title: '给常用论文建一份「方法缺页」清单',
        rationale: '把每次踩到的隐含步骤记在同一处，三个月后它就是你的复现效率曲线。',
      },
    ],
  },
  arbiterFailed: false,
  emotions: ['clear' as const, 'tired' as const],
  selfRatedDifficulty: 3, // 自评比系统给的 2 高 —— 这条偏差在 Phase 3 会回灌给难度校准
  attributeKeys: ['int', 'foc'],
  localDate: '2026-10-06',
  createdAt: T.reproductionDone,
  starred: true,
  consumedByMemoryDigest: false,
};

// ---------------------------------------------------------------------------
// 5. 关系图谱 —— 三个维度各不同的人
// ---------------------------------------------------------------------------

const CONTACTS: Contact[] = [
  {
    id: 'c_chen',
    name: '陈立',
    alias: '陈老师',
    avatarUrl: null,
    relationType: 'mentor',
    stage: 'trusted',
    profile: {
      org: '复旦大学生命科学学院',
      role: '副教授',
      field: '计算生物学 · 单细胞组学',
      metContext: '大二下学期的选修课上，他用一节课讲了 scRNA-seq 的质控陷阱',
      metAt: '2026-03-05T02:00:00.000Z',
      location: '上海',
      commonGround: ['都习惯把方法部分逐字读完', '都不太用 PPT'],
    },
    dimensions: { warmth: 72, trust: 68, influence: 80, reciprocity: 55 },
    gradeHistory: [{ grade: 'A', score: 69.1, computedAt: T.manuscript }],
    currentGrade: 'A',
    note: '本科阶段最重要的一位老师。他说话不快，但每句都落在问题上；对我的耐心大概来自他自己也走过这条路。',
    whyItMatters: [
      '他是我目前唯一能问「这个方向值不值得做」的人',
      '他手里有真实的组学数据，而我现在最缺的就是真实数据',
    ],
    boundaries: ['不要在晚上 11 点之后发消息', '不要拿没跑通的结果去问他，他在意细节'],
    preferences: ['偏好邮件而不是微信，且喜欢一条说清', '回复慢，但一定会回'],
    openCommitments: [
      { text: '把上一次讨论的复现笔记发他一份', dueAt: '2026-10-10T02:00:00.000Z', done: false },
    ],
    interactions: [
      {
        id: 'it_0001',
        contactId: 'c_chen',
        ts: '2026-09-20T06:00:00.000Z',
        localDate: '2026-09-20',
        channel: 'email',
        summary: '把复现卡住的三个问题整理成一封邮件发过去，他回了四百字',
        sentiment: 'positive',
        delta: { trust: 4, warmth: 2 },
        initiatedByMe: true,
        followUpAt: null,
        followUpNote: null,
        questId: null,
      },
      {
        id: 'it_0002',
        contactId: 'c_chen',
        ts: T.payout,
        localDate: '2026-10-02',
        channel: 'meeting',
        summary: '办公室聊了四十分钟，他建议我先别急着换方向',
        sentiment: 'positive',
        delta: { trust: 3 },
        initiatedByMe: false,
        followUpAt: '2026-10-10T02:00:00.000Z',
        followUpNote: '把复现笔记发他一份',
        questId: null,
      },
    ],
    contactCadenceDays: 14,
    lastContactAt: T.payout,
    nextTouchAt: '2026-10-16T08:40:00.000Z',
    interactionCount: 7,
    adviceHistory: [
      {
        id: 'adv_0001',
        contactId: 'c_chen',
        askedAt: '2026-09-19T13:00:00.000Z',
        situation: '有三个月没主动联系，一开口就想请他给一份数据用，怕显得太功利。',
        agentId: 'agent_network_advisor',
        advice:
          '先别谈数据。你要恢复的不是这次请求的成功率，是「我平时会找你」这件事本身的真实性。把复现卡住的地方整理成三个具体问题——这既是你真实的处境，也是他最愿意回答的东西。数据的事，等他问起你在做什么的时候再提。',
        suggestedAction: {
          timing: '这周内的上午',
          channel: '邮件',
          openingLine:
            '陈老师，我在复现 XX 那篇的 Figure 3，卡在批次校正的处理顺序上。翻了补充材料还是没想通，想请教您三个问题。',
          intent: '让对方花最小的力气进入状态，且问的确实是你自己的问题。',
        },
        avoid: ['不要在开头解释为什么这么久没联系', '不要附上一整份未整理的笔记让他自己找重点'],
        principle: '关系里的信任靠「你问的问题像不像真的在做」，不靠寒暄的频率。',
        helpful: true,
        executed: true,
      },
    ],
    tags: ['科研', '导师'],
    starred: true,
    archivedAt: null,
    createdAt: '2026-03-05T02:00:00.000Z',
  },
  {
    id: 'c_lin',
    name: '林昭',
    alias: null,
    avatarUrl: null,
    relationType: 'collaborator',
    stage: 'connected',
    profile: {
      org: '同校 · 计算机科学学院',
      role: '大三在读',
      field: '系统方向 / 高性能计算',
      metContext: '一门交叉学科课程的组队项目，他负责把模型塞进显存',
      metAt: '2026-04-18T06:00:00.000Z',
      location: '上海',
      commonGround: ['都在做「没人要求我们做」的项目'],
    },
    dimensions: { warmth: 64, trust: 58, influence: 42, reciprocity: 70 },
    gradeHistory: [{ grade: 'B', score: 59.9, computedAt: T.manuscript }],
    currentGrade: 'B',
    note: '同校认识，做系统方向。技术判断比我准，说话直，从不客套 —— 这在同龄人里很少见。',
    whyItMatters: ['他是那个会在我把代码写歪的时候直接说「这不行」的人'],
    boundaries: ['不要在他赶 deadline 的时候让他帮忙调环境'],
    preferences: ['只聊具体的问题，不聊规划', '喜欢被直接指出错误'],
    openCommitments: [],
    interactions: [
      {
        id: 'it_0003',
        contactId: 'c_lin',
        ts: '2026-09-30T12:00:00.000Z',
        localDate: '2026-09-30',
        channel: 'message',
        summary: '问他 Docker 镜像体积怎么压下去，他直接甩了个多阶段构建的例子',
        sentiment: 'positive',
        delta: { trust: 2, reciprocity: 2 },
        initiatedByMe: true,
        followUpAt: null,
        followUpNote: null,
        questId: 'q_cb_docker',
      },
    ],
    contactCadenceDays: 21,
    lastContactAt: '2026-09-30T12:00:00.000Z',
    nextTouchAt: '2026-10-21T12:00:00.000Z',
    interactionCount: 12,
    adviceHistory: [],
    tags: ['技术', '合作者'],
    starred: false,
    archivedAt: null,
    createdAt: '2026-04-18T06:00:00.000Z',
  },
  {
    id: 'c_zhao',
    name: '赵启',
    alias: '老赵',
    avatarUrl: null,
    relationType: 'friend',
    stage: 'dormant',
    profile: {
      org: '北京某互联网公司',
      role: '后端工程师',
      field: '服务端',
      metContext: '高中同桌，毕业后一个在上海一个在北京',
      metAt: '2020-09-01T00:00:00.000Z',
      location: '北京',
      commonGround: ['都熬夜', '都说过要一起做点东西但一直没开始'],
    },
    dimensions: { warmth: 76, trust: 74, influence: 38, reciprocity: 34 },
    gradeHistory: [{ grade: 'C', score: 58.6, computedAt: T.manuscript }],
    currentGrade: 'C',
    note: '高中同桌，认识最久的朋友。毕业后一个在上海一个在北京，联系靠想起来，不靠日程。',
    whyItMatters: ['认识最久的人。在他面前我不需要解释我在干嘛 —— 这件事本身很稀有'],
    boundaries: ['不要只在自己有事的时候找他'],
    preferences: ['喜欢打电话而不是打字', '讨厌话题被草草收尾'],
    openCommitments: [{ text: '说好国庆一起吃饭，没定下来', dueAt: null, done: false }],
    interactions: [
      {
        id: 'it_0004',
        contactId: 'c_zhao',
        ts: '2026-08-14T13:00:00.000Z',
        localDate: '2026-08-14',
        channel: 'call',
        summary: '聊了一个多小时，他说他想辞职但不敢',
        sentiment: 'positive',
        delta: { warmth: 3, trust: 3 },
        initiatedByMe: false,
        followUpAt: null,
        followUpNote: null,
        questId: null,
      },
    ],
    contactCadenceDays: 30,
    lastContactAt: '2026-08-14T13:00:00.000Z',
    nextTouchAt: '2026-09-13T13:00:00.000Z',
    interactionCount: 23,
    adviceHistory: [],
    tags: ['朋友', '老同学'],
    starred: false,
    archivedAt: null,
    createdAt: '2020-09-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// 6. Agent 注册表 —— 名单本体在 `agentRoster.ts`（与生产初始档共享）
// ---------------------------------------------------------------------------

const AGENTS = createAgentRoster(T.enrollment);

// 计算生物学 Agent 是唯一真正被调用过的（生成过那条复现任务）
const compbio = AGENTS.find((a) => a.id === 'agent_class_compbio');
if (compbio) {
  compbio.stats = {
    invocations: 6,
    failures: 0,
    tokensIn: 6_480,
    tokensOut: 4_120,
    costUsdCents: 84,
    lastInvokedAt: T.reproductionDone,
    parseSuccessRate: 0.92,
  };
}

// ---------------------------------------------------------------------------
// 7. 篇章 —— Ch.1 在走，三条条件已达成两条
// ---------------------------------------------------------------------------

const chapterProgress: ChapterProgress[] = CHAPTERS.map((def) => {
  const isCurrent = def.id === 'CH1';
  return {
    id: def.id,
    unlocked: isCurrent,
    completed: false,
    conditionProgress: isCurrent
      ? [
          { label: '连续记录天数', current: 22, target: 30, met: false },
          { label: '最高职业线等级', current: 5, target: 5, met: true },
          { label: '非家庭给予的收入笔数', current: 6, target: 1, met: true },
        ]
      : [],
    expEarnedInChapter: isCurrent ? 1_240 : 0,
    questsCompletedInChapter: isCurrent ? 4 : 0,
    startedAt: isCurrent ? T.enrollment : null,
    completedAt: null,
    playerChosenCodename: null,
    codenameSource: null,
    // 进入 Ch.1 时的净资产（$12,500.00，与下方账本同一个数）。
    // 引擎只对"已解锁且未完成"的章补写这个快照，这里先给上，免得首帧结算出 0 倍。
    entryNetWorthUsdCents: isCurrent ? 1_250_000 : null,
  };
});

// ---------------------------------------------------------------------------
// 8. 终极目标 —— 从目录深拷贝后打上这份存档的进度
// ---------------------------------------------------------------------------

const NET_WORTH_CENTS = 1_250_000; // $12,500.00，与上方账本一致

const endgameGoals = JSON.parse(JSON.stringify(ENDGAME_GOALS)) as typeof ENDGAME_GOALS;
{
  const achievedAtOf = (goalId: GoalIdLiteral, milestoneId: string, at: ISODateTime) => {
    const goal = endgameGoals.find((g) => g.id === goalId);
    const m = goal?.milestones.find((x) => x.id === milestoneId);
    if (m) m.achievedAt = at;
  };
  achievedAtOf('A9_ASSETS', 'a9_first_own_money', T.tutoring);
  achievedAtOf('GEO_INDEPENDENT_WORK', 'gi_first_side_income', T.tutoring);
  // 金库建角时就有 $12,500 —— "第一万美金"这条**状态谓词**从一开始就为真。
  // 在这里提前点亮（而不是留给引擎在第一次点击时发现），是为了它的日期读起来
  // 是一段历史，而不是"今天"：引擎盖的时刻是"系统第一次看见它为真"，
  // 让建角档的第一次点击去补这个章，会把 2026-10-07 印在那格上。
  achievedAtOf('A9_ASSETS', 'a9_first_10k', T.enrollment);

  for (const goal of endgameGoals) {
    if (goal.metric.kind === 'usd_net_worth') {
      goal.progress = wealthProgressRatio(NET_WORTH_CENTS); // ≈ 7.8%，不是裸对数的 38%
    } else if (goal.metric.kind === 'milestone_weights') {
      goal.progress = goal.milestones.reduce((s, m) => s + (m.achievedAt ? m.weight : 0), 0);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. 进化树 —— 静默运转中：cb_1 已点亮，但玩家永远不知道
//
// 两条静默标签来自那条复现任务的复盘。它们凑齐了 cb_1 的 requiredTagCount = 2，
// 所以 cb_1 在 2026-10-06 那天晚上被点着了 —— 而屏幕上不会有任何提示。
// 这正是设计要的效果：**揭示之前，一切都不存在。**
// ---------------------------------------------------------------------------

const evolutionNodes = JSON.parse(JSON.stringify(EVOLUTION_NODES)) as typeof EVOLUTION_NODES;
{
  const cb1 = evolutionNodes.find((n) => n.id === 'cb_1');
  if (cb1) {
    cb1.lit = true;
    cb1.litAt = T.reproductionDone;
    cb1.litWhileRevealed = false;
  }
}

const BRANCHES: EvolutionBranch[] = [
  'COMPUTE_BIOLOGY',
  'ENERGY',
  'MATERIALS',
  'INTELLIGENCE',
  'MEDICINE',
  'SPACE',
];

const branchProgress = {} as Record<EvolutionBranch, number>;
for (const branch of BRANCHES) {
  const nodes = evolutionNodes.filter((n) => n.branch === branch);
  branchProgress[branch] = nodes.length === 0 ? 0 : nodes.filter((n) => n.lit).length / nodes.length;
}

// ---------------------------------------------------------------------------
// 10. 四条职业线的进度（只影响 careers.tracks，其余字段一律从 catalog 取）
// ---------------------------------------------------------------------------

interface TrackProgress {
  level: number;
  exp: number;
  completed: number;
  earned: number;
  chainIds: ChainId[];
  firstQuestAt: ISODateTime | null;
  lastQuestAt: ISODateTime | null;
}

/** 建角默认：Lv.1、0 EXP、无链。不是"未解锁"，是"还没开始动"。 */
const FRESH_TRACK: TrackProgress = {
  level: 1,
  exp: 0,
  completed: 0,
  earned: 0,
  chainIds: [],
  firstQuestAt: null,
  lastQuestAt: null,
};

const TRACK_PROGRESS: Record<string, TrackProgress> = {
  computational_biology: {
    level: 5,
    exp: 210,
    completed: 4,
    earned: 1_180,
    chainIds: ['ch_repro_dignity'],
    firstQuestAt: T.internship,
    lastQuestAt: T.reproductionDone,
  },
  investor: {
    level: 3,
    exp: 88,
    completed: 1,
    earned: 260,
    chainIds: ['ch_risk_discipline'],
    firstQuestAt: '2026-09-18T11:30:00.000Z',
    lastQuestAt: '2026-09-18T11:30:00.000Z',
  },
  // 后两条：刚开线 —— 12 EXP 是"发过一条东西"，0 EXP 是"什么都还没发"。
  // 0 就写 0，不凑一个好看的数：这个面板的价值全在它说的是实话。
  social_media_influencer: { ...FRESH_TRACK, exp: 12, earned: 12 },
  startup_entrepreneur: { ...FRESH_TRACK },
};

const trackProgressFor = (classId: string): TrackProgress =>
  TRACK_PROGRESS[classId] ?? FRESH_TRACK;

// ---------------------------------------------------------------------------
// 11. 根对象
// ---------------------------------------------------------------------------

export function createMockState(): EarthOnlineState {
  const settings = createInitialSettings();
  settings.onboarded = true; // mock 存档已经过了首次引导

  return {
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 47,
      createdAt: T.enrollment,
      updatedAt: T.todayMorning,
      seed: 'guanghua-2026-autumn',
      slot: 'main',
      migrationHistory: [],
    },

    player: {
      handle: '你', // 占位：命名权在 PO 手上
      motto: '还不太知道要去哪，但已经在走了。',
      avatarUrl: null,
      currentSceneId: 'guanghua',
      attributes: { vit: 12, int: 21, foc: 17, cha: 14, wil: 16, cap: 11 },
      freeAttributePoints: 2,
      attributeHistory: ATTRIBUTE_HISTORY,
      energy: { current: 62, max: 80, lastRegenAt: '2026-10-07T01:00:00.000Z' },
      selfDeclaredPhaseName: null,
      createdAt: T.enrollment,
      daysActive: 34,
      lastActiveLocalDate: '2026-10-07',
    },

    vault: {
      cash: 418_000, // $4,180.00
      holdings: [
        {
          id: 'hold_etf',
          assetClass: 'etf',
          symbol: 'VOO',
          label: '宽基 ETF',
          quantity: 12,
          costBasis: 720_000, // $7,200.00 成本
          marketValue: 682_000, // $6,820.00 月末估值
          valuedAt: T.reproductionDone,
        },
        {
          id: 'hold_mmf',
          assetClass: 'bond',
          symbol: 'MMF',
          label: '货币基金（应急备用）',
          quantity: 1,
          costBasis: 150_000,
          marketValue: 150_000, // $1,500.00
          valuedAt: T.transfer,
        },
      ],
      liabilities: 0,
      transactions: TRANSACTIONS,
      netWorthHistory: [
        { localDate: '2026-09-03', netWorth: 110_000 },
        { localDate: '2026-09-18', netWorth: 530_000 },
        { localDate: '2026-10-01', netWorth: 986_000 },
        { localDate: '2026-10-07', netWorth: NET_WORTH_CENTS },
      ],
      displayCurrency: 'USD',
      monthlyBurn: 98_000, // $980.00 / 月
    },

    careers: {
      /**
       * 四条初始职业线**全部在场**，各自停在不同阶段：
       *   计算生物 Lv.5 —— 已经摸到第二档头衔（数据炼金术士）
       *   投资     Lv.3 —— 在走，但比主线慢
       *   内容创作 Lv.1 —— 刚开，还没出过东西
       *   创业     Lv.1 —— 刚开，0 EXP
       *
       * 之所以不是"开两条、留两条未解锁"：catalog/classes.ts 写的是
       * 「初始 4 条职业线」，四条都是建角就给的。真正会被 Dispatcher 动态铸造的
       * 是**第五、第六条**。职业面板要展示的是"我在几条线上同时活着"，
       * 少画两条会让这个面板看起来像个待办清单。
       */
      tracks: CLASSES.map((entry, i) => {
        const P = trackProgressFor(entry.classId);
        return {
          classId: entry.classId,
          displayName: entry.displayName,
          creed: entry.creed,
          level: P.level,
          exp: P.exp,
          expToNext: expToNext(entry.expCurve, P.level),
          expCurve: entry.expCurve,
          titleTiers: entry.titleTiers,
          domains: entry.domains,
          linkedGoalIds: entry.linkedGoalIds,
          attributeWeights: entry.attributeWeights,
          chainIds: P.chainIds,
          stats: {
            questsCompleted: P.completed,
            questsAbandoned: 0,
            expEarnedTotal: P.earned,
            vaultEarnedTotal: 0,
            firstQuestAt: P.firstQuestAt,
            lastQuestAt: P.lastQuestAt,
          },
          unlockedAt: T.enrollment,
          createdByAgentId: null,
          pinned: i === 0,
        };
      }),
      activeClassId: 'computational_biology',
      retiredClassIds: [],
    },

    chapters: {
      activeChapterIds: ['CH1'],
      focusedChapterId: 'CH1',
      chapters: chapterProgress,
      completedCount: 0,
      pendingCeremony: null,
    },

    endgame: { goals: endgameGoals },

    evolution: {
      revealed: false, // ⚠️ 静默运转。UI 层不得读取本对象的任何字段。
      revealedAt: null,
      revealMomentShown: false,
      nodes: evolutionNodes,
      techMilestones: [
        {
          id: 'tm_0001',
          ts: T.reproductionDone,
          localDate: '2026-10-06',
          tag: 'reproducibility',
          questId: 'q_cb_repro_figure',
          confidence: 0.88,
          consumedByNodeId: 'cb_1',
        },
        {
          id: 'tm_0002',
          ts: T.reproductionDone,
          localDate: '2026-10-06',
          tag: 'literature',
          questId: 'q_cb_repro_figure',
          confidence: 0.64,
          consumedByNodeId: 'cb_1',
        },
      ],
      revealConditions: JSON.parse(JSON.stringify(EVOLUTION_REVEAL_CONDITIONS)) as typeof EVOLUTION_REVEAL_CONDITIONS,
      stats: {
        litNodeCount: evolutionNodes.filter((n) => n.lit).length,
        totalNodeCount: evolutionNodes.length,
        branchProgress,
        lastLitAt: T.reproductionDone,
      },
      sceneHooks: [],
    },

    quests: {
      byId: questsById,
      order: QUESTS.map((q) => q.id),
      archivedIds: [],
      chains: chainsById,
      lastSweepAt: null,
    },

    dailies: {
      definitions: DAILIES,
      recommendations: RECOMMENDATIONS,
      logs: { '2026-10-06': LOG_YESTERDAY, '2026-10-07': LOG_TODAY },
      /**
       * 「已经结算完毕的最后一天」。
       *
       * 放在 10-05 而不是 10-06：这意味着**玩家上次打开是前天**，
       * 于是今天（10-07，01:00 之后）打开会触发一次真实结算 ——
       * 10-06 那天结束了，但还没结过账。这正是这条链路要演示的那一步。
       * 结算完它会被推到 10-06，同一天再打开就是幂等的空操作。
       */
      lastSettledLocalDate: '2026-10-05',
      pendingRolloverNotice: null,
    },

    weeklies: {
      definitions: WEEKLIES,
      logs: WEEKLY_LOGS,
      /**
       * 与 lastSettledLocalDate 是同一套手法（差一个周期）：
       * 停在 09-21 意味着 09-28 那一周已经完整结束但还没结过账 ——
       * 周一 01:00 之后打开就会触发一次真实的周结算。
       */
      lastSettledWeekStart: '2026-09-21',
      pendingWeeklyNotice: null,
    },

    journal: {
      entries: [JOURNAL_ENTRY],
      monthlyDigests: [],
      stats: {
        totalEntries: 1,
        totalReflectionWords: 152,
        totalBonusExp: 14, // 194 − 180
        averageBonusPct: 8,
        currentWritingStreakDays: 1,
        bestWritingStreakDays: 1,
      },
    },

    network: {
      contacts: CONTACTS,
      graphLayout: {},
      lastReminderCheckAt: null,
      gradeWeights: { ...DEFAULT_GRADE_WEIGHTS },
      solverLog: [],
    },

    milestones: {
      records: [
        {
          id: 'rmr_0001',
          definitionId: 'rm_first_income',
          customTitle: null,
          customCategory: null,
          occurredOn: '2026-09-25',
          recordedAt: T.tutoring,
          note: '第一次靠家教赚到钱，三次课，每次两小时。钱不多，但那是第一条不属于家里的进账。',
          snapshots: [],
          expGranted: 200,
          // 「第一笔自己赚来的钱」按目标对齐记进了资本线（A9_ASSETS）
          creditedClassId: 'investor',
          goalMilestoneIds: ['a9_first_own_money', 'gi_first_side_income'],
        },
      ],
      counters: { rm_first_income: { count: 1, lastRecordedAt: T.tutoring } },
      monthlyExpGranted: { '2026-09': 200 },
      introducedToPlayer: true,
    },

    agents: {
      records: AGENTS,
      invocations: [
        {
          id: 'inv_0001',
          agentId: 'agent_class_compbio',
          ts: '2026-09-28T11:56:00.000Z',
          purpose: 'generate_quests',
          inputDigest: '想法：把收藏夹里的论文真正跑通一遍，而不是只收藏',
          rawOutput: null,
          parsedOk: true,
          errorMessage: null,
          latencyMs: 4_820,
          tokensIn: 1_120,
          tokensOut: 860,
        },
      ],
      dispatcherId: 'agent_dispatcher',
      retiredClassIds: [],
    },

    ai: {
      provider: 'mock', // Phase 2 不发起任何真实请求
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKeyStorageKey: STORAGE_KEYS.apiKey,
      configured: false,
      mockModeEnabled: true,
      usage: {
        month: '2026-10',
        tokensIn: 0,
        tokensOut: 0,
        costUsdCents: 0,
        budgetUsdCents: 2_000, // $20 / 月
      },
      lastHealthCheck: null,
      circuitBreaker: { open: false, consecutiveFailures: 0, openedAt: null },
    },

    world: {
      activeSceneId: 'guanghua',
      unlockedSceneIds: ['guanghua'],
      customLocationLabel: null,
      anchorOverrides: {},
      gpsAllowed: false, // 隐私优先，默认关
      lastGpsFix: null,
    },

    events: [
      {
        id: 'ev_0006',
        ts: T.todayMorning,
        localDate: '2026-10-07',
        type: 'quest.started',
        payload: { questId: 'q_cb_docker' },
        questId: 'q_cb_docker',
      },
      {
        id: 'ev_0005',
        ts: '2026-10-07T03:05:00.000Z',
        localDate: '2026-10-07',
        type: 'daily.checked',
        payload: { dailyId: 'd_commit', streak: 14 },
      },
      {
        id: 'ev_0004',
        ts: T.reproductionDone,
        localDate: '2026-10-06',
        type: 'quest.completed',
        payload: { questId: 'q_cb_repro_figure', bonusPct: 8, finalExp: 194 },
        questId: 'q_cb_repro_figure',
      },
      {
        id: 'ev_0003',
        ts: T.reproductionDone,
        localDate: '2026-10-06',
        type: 'journal.entry_written',
        payload: { entryId: 'jr_0001', quality: 'sharp' },
        questId: 'q_cb_repro_figure',
      },
      {
        id: 'ev_0002',
        ts: T.tutoring,
        localDate: '2026-09-25',
        type: 'milestone.recorded',
        payload: { definitionId: 'rm_first_income', expGranted: 200 },
      },
      {
        id: 'ev_0001',
        ts: T.enrollment,
        localDate: '2026-09-03',
        type: 'session.started',
        payload: { sceneId: 'guanghua' },
      },
    ],

    settings,

    unlockables: {
      // 空白起步：建角那一刻，这个人还没有任何一枚徽记。
      // 三档队列（判据 / 日期 / 待看）都从空开始，由成就引擎在第一次写入时
      // 按真实状态现算 —— mock 存档不预置任何"你已经做到过"的东西。
      achievementIds: [],
      achievementUnlockedAt: {},
      pendingAchievementIds: [],
      easterEggIds: [],
      tourCompleted: {},
    },
  };
}

/** 存档槽位标识，用于 LocalStorage 键与将来的多槽位 */
export const MOCK_SLOT = 'main' as const;
