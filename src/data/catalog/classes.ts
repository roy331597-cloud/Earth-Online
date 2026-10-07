// ============================================================================
// EarthOnline · 职业头衔目录（静态设定，不入存档）
// 初始 4 条职业线。新的职业线由 Dispatcher + Blueprint Generator 动态铸造。
// ============================================================================

import type { AttributeKey, ClassIdLiteral } from '../../types/core';
import type { ExpCurve, TitleTier } from '../../types/core';
import type { GoalIdLiteral } from '../../types/endgame';
import type { QuestDraft } from '../../types/agents';

export interface ClassCatalogEntry {
  classId: ClassIdLiteral;
  /** 领域名（英文，用于对外与 Agent 人格锚定） */
  displayName: string;
  /**
   * 玩家看到的职业名。
   *
   * 必须与 `agentDisplayName` 分开：后者是**这位 Agent 的名字**
   * （「资本 · 配置者」「创业 · 从 0 到 1」），拿它当职业名会拼出
   * 「资本」「表达」这种半截词。职业名归职业，Agent 名归 Agent ——
   * 玩家在履历里看的是"我是哪条线上的谁"，不是"哪个 Agent 在带我"。
   */
  displayNameCN: string;
  /** 一行领域箴言，显示在职业卡背面 */
  creed: string;
  /** 领域关键词，注入给专属 Agent 做人格锚定 */
  domains: string[];
  /** Agent 展示名 */
  agentDisplayName: string;
  /** Agent 的一句话自我介绍 */
  agentTagline: string;
  expCurve: ExpCurve;
  titleTiers: TitleTier[];
  linkedGoalIds: GoalIdLiteral[];
  attributeWeights: Partial<Record<AttributeKey, number>>;
  /**
   * 推荐给玩家的初始日常（AI 推荐，**不是自动创建的日常**）。
   * 这些推荐会进入待裁决队列：玩家逐条过目，采纳（可先改标题/频率）后才成为
   * 正式日常，忽略即消失。系统与 AI 都不得自动创建日常。
   */
  recommendedDailies: Array<{ title: string; targetPerDay: number; iconKey: string; rationale: string }>;
  /** 初始支线种子：体现该职业线的"内容质量基线"，也是给 Agent 的 few-shot 范例 */
  seedQuests: QuestDraft[];
}

/**
 * 经验曲线说明：expToNext(level) = base * level ^ exponent
 * 横向对比：
 *   comp_bio   慢而深 —— 科研的复利来得晚，但天花板高
 *   investor   前期快 —— 让玩家尽早体会"系统化"的正反馈
 *   influencer 最快   —— 内容有即时反馈是事实，不该假装不是
 *   founder    最慢   —— 创业的斜率本来就很陡
 */
export const CLASSES: ClassCatalogEntry[] = [
  // ==========================================================================
  // 1. 计算生物学
  // ==========================================================================
  {
    classId: 'computational_biology',
    displayName: 'Computational Biology',
    displayNameCN: '计算生物学者',
    creed: '先让结果可复现，再让它有意义。',
    domains: [
      'single-cell omics', 'protein structure & folding', 'ML for biology',
      'reproducible pipelines', 'statistical genetics', 'GPU compute',
      'preprint culture', 'bench-to-dry-lab translation',
    ],
    agentDisplayName: '计算生物学 · 首席研究员',
    agentTagline: '我关心的不是这个结果有多漂亮，而是换个数据集它还站不站得住。',
    expCurve: { base: 120, exponent: 1.38, maxLevel: 99 },
    titleTiers: [
      { fromLevel: 1, title: '湿实验学徒', requirementHint: '先亲手碰过实验台，再谈建模' },
      { fromLevel: 5, title: '数据炼金术士', requirementHint: '能独立清洗一份真实的组学数据' },
      { fromLevel: 10, title: '模型编织者', requirementHint: '完成一次从假设到评估的完整闭环' },
      { fromLevel: 17, title: '独立研究者', requirementHint: '提出过一个自己能回答的问题' },
      { fromLevel: 26, title: '首席研究员', requirementHint: '有可被引用的成果，并带过一个人' },
      { fromLevel: 41, title: '领域定义者', requirementHint: '你的方法成为别人的默认选项' },
      { fromLevel: 61, title: '学派开创者', requirementHint: '你提的问题比你的答案活得更久' },
    ],
    linkedGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
    attributeWeights: { int: 0.4, foc: 0.25, wil: 0.2, vit: 0.15 },
    recommendedDailies: [
      { title: '读一篇论文的 Figure 而不是 Abstract', targetPerDay: 1, iconKey: 'paper', rationale: '图表是结论的骨架，读图比读摘要更接近科研本身' },
      { title: '代码提交（哪怕只有一行）', targetPerDay: 1, iconKey: 'commit', rationale: '科研的手感来自双手每天与数据的接触' },
      { title: '记录一个今天没搞懂的问题', targetPerDay: 1, iconKey: 'question', rationale: '问题的库存决定未来的研究品味' },
    ],
    seedQuests: [
      {
        tempId: 'cb_seed_1',
        title: '复现一张图的尊严',
        subtitle: '从读懂，到亲手跑通',
        narrative:
          '你收藏夹里躺着几十篇「有空再看」的论文。今晚只做一件事：挑一篇，把它的主图重新画出来。不要求超越，只要求像素级地诚实。',
        objective:
          '选择一篇近 3 年内、有公开数据的组学或结构生物学论文，下载其原始数据，用自己的代码复现论文主图，并记录至少 3 处与原文的差异及可能原因。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'hour', value: 4 },
        reward: { exp: 180 },
        outcomeHints: ['一份可复现的 notebook', '对"论文与代码之间的鸿沟"的第一次真实体感'],
        linkedGoalIds: ['PRIVATE_LAB'],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 7,
        proof: { criterion: '仓库链接或包含运行输出的 notebook 链接', kind: 'link' },
        tags: ['reproducibility', 'omics', 'foundation'],
      },
      {
        tempId: 'cb_seed_2',
        title: '把流水线写进 Docker',
        subtitle: '让别人能在你的机器之外跑通它',
        narrative: '能跑通和能交付，之间隔着一条叫"环境"的河。',
        objective:
          '为你现有的任意一段分析脚本编写 Dockerfile，确保在一台干净的机器上（或 CI 里）能一条命令跑出结果，并写出 README。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 6 },
        reward: { exp: 320 },
        outcomeHints: ['一个可被别人复用的分析镜像', '从"我的电脑上能跑"毕业'],
        linkedGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['int', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: 'Dockerfile 与 README 的仓库链接', kind: 'link' },
        tags: ['engineering', 'reproducibility'],
      },
      {
        tempId: 'cb_seed_3',
        title: '把问题写成一句话',
        subtitle: '你真正的研究品味从这一刻开始',
        narrative:
          '大多数人的问题不是"找不到答案"，而是"问题太大"。把它砍到一句话能说完，砍到能被一次实验否定。',
        objective:
          '写下 5 个你真正想回答的科学问题，每个压缩到一句 25 字以内的问句，并为每一个标注：它需要什么数据？怎么算被否定？',
        type: 'special',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 60 },
        reward: { exp: 150, attributePoints: { int: 1 } },
        outcomeHints: ['一份属于你自己的 research question 清单'],
        linkedGoalIds: ['PRIVATE_LAB'],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 3,
        proof: { criterion: '5 个问题及其否证条件', kind: 'text' },
        tags: ['taste', 'research_direction'],
      },
      {
        tempId: 'cb_seed_4',
        title: '让它能被再跑一遍',
        subtitle: '从"这次跑通了"到"下次还能跑"',
        narrative:
          '你现在手里的那段代码，是这次跑通了，还是每次都跑得通？这两件事之间隔着一整套习惯。今晚只补第一块砖。',
        objective:
          '挑一段你最近手敲进 REPL 或 notebook 里、能出结果的分析代码，把它整理成一个带入口的脚本或函数：参数提出来、路径写成变量、无交互运行。在干净的新会话里从头跑一次，确认结果一致。',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 45 },
        reward: { exp: 90 },
        outcomeHints: ['一个不依赖你的记忆也能跑通的脚本'],
        linkedGoalIds: ['PRIVATE_LAB'],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 3,
        proof: { criterion: '脚本文件与一次干净运行的输出', kind: 'text' },
        tags: ['reproducibility', 'engineering'],
      },
      {
        tempId: 'cb_seed_5',
        title: '一份数据字典',
        subtitle: '三个月后的你会感谢现在的你',
        narrative:
          '数据里最贵的不是算力，是"这一列到底是什么"。你以为自己记得，直到半年后打开自己的文件。',
        objective:
          '为你最常用的那份数据集写一份数据字典：逐列写明含义、单位、取值范围、缺失情况，以及你在处理时做过的一次主观决定（比如为什么把某些值当缺失）。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 90 },
        reward: { exp: 140 },
        outcomeHints: ['一份能交给别人的数据说明', '对自己处理习惯的一次盘点'],
        linkedGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['int'],
        prerequisiteTempIds: [],
        dueHintDays: 5,
        proof: { criterion: '数据字典文档链接', kind: 'link' },
        tags: ['data_hygiene', 'foundation'],
      },
      {
        tempId: 'cb_seed_6',
        title: '讲给一个外行听',
        subtitle: '讲不通，说明还没真懂',
        narrative:
          '你不是在简化，你是在暴露自己的理解漏洞。对方不懂是正常的，讲不下去的那一刻才是重点。',
        objective:
          '找一个完全不做这行的朋友（或对着录音设备），用不超过 3 分钟讲清楚你最近在做什么、为什么它重要。不许用任何专业名词。记录你在哪一句话卡住了。',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 30 },
        reward: { exp: 80, attributePoints: { cha: 1 } },
        outcomeHints: ['一次真实的表达压力测试', '一份"我其实没想清楚"的位置清单'],
        linkedGoalIds: [],
        linkedAttributes: ['cha', 'int'],
        prerequisiteTempIds: [],
        dueHintDays: 3,
        proof: { criterion: '录音或一段 200 字的复述稿', kind: 'text' },
        tags: ['communication', 'taste'],
      },
      {
        tempId: 'cb_seed_7',
        title: '同一件事跑五遍',
        subtitle: '先知道你的结果有多不结实',
        narrative:
          '你报出去的那个数字，换一个随机种子还在吗？这个问题不该等到审稿人问。',
        objective:
          '选一个带随机性的分析（初始化、采样、划分），固定除种子外的一切条件跑 5 遍，记录结果分布（均值、极差、最坏一次）。写一段话说明这个波动对你结论的影响。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 3 },
        reward: { exp: 260 },
        outcomeHints: ['一条属于你自己的误差棒', '对"显著"二字的免疫力'],
        linkedGoalIds: ['PRIVATE_LAB'],
        linkedAttributes: ['int', 'foc', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 7,
        proof: { criterion: '5 次运行记录与波动说明', kind: 'text' },
        tags: ['statistics', 'robustness'],
      },
      {
        tempId: 'cb_seed_8',
        title: '在看到数据之前',
        subtitle: '把预期先写下来，再动手',
        narrative:
          '你的分析是在验证一个假设，还是在给一个已经产生的结论找证据？这两者的区别，只在时间顺序里。',
        objective:
          '选一个你明天就要开始的分析，现在先写下：主假设、预期效应方向、判断成败的指标与阈值、以及"如果结果相反我会怎么解释"。写完存档，做完分析后再回头对照一次。',
        type: 'special',
        difficulty: 4,
        effortEstimate: { unit: 'hour', value: 4 },
        reward: { exp: 420, attributePoints: { int: 1 } },
        outcomeHints: ['一份写在自己之前的研究预案', '一次与事后合理化的正面交锋'],
        linkedGoalIds: ['PRIVATE_LAB'],
        linkedAttributes: ['int', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: '预案文档 + 事后对照记录', kind: 'text' },
        tags: ['methodology', 'honesty'],
      },
      {
        tempId: 'cb_seed_9',
        title: '把这个东西投出去',
        subtitle: '完成比完美更稀缺',
        narrative:
          '它在你硬盘里躺着的每一天，都等于没有。没人会因为你没投出去而少批评你一句，因为根本没人看得到。',
        objective:
          '把你手上已经足够完整的那份工作整理成一份可公开的形式（preprint / 技术报告 / 博客长文），上传到一个有公开链接的地方，并把链接发给至少一位同行征求意见。',
        type: 'milestone',
        difficulty: 5,
        effortEstimate: { unit: 'day', value: 20 },
        reward: { exp: 800, attributePoints: { wil: 1 } },
        outcomeHints: ['一个公开的、可以被引用的链接', '一次把作品交出去的心理门槛'],
        linkedGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['wil', 'int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 45,
        proof: { criterion: '公开链接（preprint / 报告 / 长文）', kind: 'link' },
        tags: ['publishing', 'milestone'],
      },
    ],
  },

  // ==========================================================================
  // 2. 投资 / 交易
  // ==========================================================================
  {
    classId: 'investor',
    displayName: 'Investor / Trader',
    displayNameCN: '投资者',
    creed: '先求不败，再求胜。',
    domains: [
      'position sizing', 'risk of ruin', 'expected value', 'base rates',
      'cognitive bias', 'portfolio construction', 'research journaling',
      'drawdown psychology', 'capital allocation',
    ],
    agentDisplayName: '资本 · 配置者',
    agentTagline: '我不预测明天，我准备的不是预测，是应对。',
    expCurve: { base: 100, exponent: 1.3, maxLevel: 99 },
    titleTiers: [
      { fromLevel: 1, title: '账本看守', requirementHint: '先搞清楚自己每一分钱在哪' },
      { fromLevel: 5, title: '概率学徒', requirementHint: '开始用期望值而不是希望值思考' },
      { fromLevel: 10, title: '风险定价者', requirementHint: '能在下注前说出最坏情况' },
      { fromLevel: 17, title: '系统化执行者', requirementHint: '有一套写下来、并且真的执行的规则' },
      { fromLevel: 26, title: '资本配置者', requirementHint: '开始决定钱去哪，而不只是买什么' },
      { fromLevel: 41, title: '周期穿越者', requirementHint: '经历完整一轮并活下来了' },
      { fromLevel: 61, title: '时间的盟友', requirementHint: '复利替你工作的时间超过你工作的时间' },
    ],
    linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
    attributeWeights: { cap: 0.4, foc: 0.25, wil: 0.2, int: 0.15 },
    recommendedDailies: [
      { title: '记录今日净值与持仓理由', targetPerDay: 1, iconKey: 'ledger', rationale: '账本是唯一不会骗你的记录' },
      { title: '一次"不操作"的自我确认', targetPerDay: 1, iconKey: 'hold', rationale: '"不操作"与"什么都没做"是两码事' },
      { title: '读完一段经典文本并摘一句', targetPerDay: 1, iconKey: 'book', rationale: '先继承一百年的常识，再谈自己的判断' },
    ],
    seedQuests: [
      {
        tempId: 'inv_seed_1',
        title: '痛苦审计',
        subtitle: '先看清你已经踩过的坑',
        narrative:
          '大多数人研究市场五年，却从未研究过自己。今晚把过去的记录摊开——不是看赚了多少，是看你在什么状态下最容易犯错。',
        objective:
          '如果你已有真实交易/投资记录：把它们按"决策时的状态"分类（疲惫 / 兴奋 / 随大流 / 独立判断），找出亏损最集中的那一类情境。如果还没有：改从过去一年所有冲动决定里找（冲动消费、订阅、抽卡、跟风买入）。两种情况都需写成不超过 500 字的自画像，含至少 3 个具体案例。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 3 },
        reward: { exp: 300, attributePoints: { cap: 1 } },
        outcomeHints: ['一份关于你自己行为偏差的客观档案'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['cap', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 7,
        proof: { criterion: '自画像文本（需含至少 3 条具体案例）', kind: 'text' },
        tags: ['bias', 'self_audit', 'foundation'],
      },
      {
        tempId: 'inv_seed_2',
        title: '写一份仓位规则',
        subtitle: '把纪律从脑子里搬出来',
        narrative:
          '规则写在脑子里，等于没有规则。它会在你最需要它的那一天，被情绪安静地覆盖。',
        objective:
          '写下你的仓位管理规则：单笔最大风险占比、总仓位上限、亏损到什么程度必须停下来。规则必须具体到数字，且能被执行者（哪怕是三个月后的你自己）无歧义地执行。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 90 },
        reward: { exp: 220 },
        outcomeHints: ['一份可执行的 risk policy', '一次把赌性关进笼子的机会'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['cap', 'wil'],
        prerequisiteTempIds: ['inv_seed_1'],
        dueHintDays: 5,
        proof: { criterion: '含具体数值阈值的规则文本', kind: 'text' },
        tags: ['risk', 'discipline'],
      },
      {
        tempId: 'inv_seed_3',
        title: '逆向压力测试',
        subtitle: '如果明天跌 40%，我会做什么',
        narrative: '真正的风险不是波动，是你在波动里做出的那个决定。',
        objective:
          '假设你的全部持仓在明天开盘后下跌 40%，逐项写下你会执行的具体动作（买入/卖出/不动），并注明依据。写完后自评：这些动作是否与你上一条仓位规则冲突？',
        type: 'special',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 2 },
        reward: { exp: 280, attributePoints: { cap: 1 } },
        outcomeHints: ['一份预先准备好的应对方案', '对自身风险承受力的真实刻度'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['cap', 'foc', 'wil'],
        prerequisiteTempIds: ['inv_seed_2'],
        dueHintDays: 7,
        proof: { criterion: '逐项应对方案文本', kind: 'text' },
        tags: ['stress_test', 'risk'],
      },
      {
        tempId: 'inv_seed_4',
        title: '把每一笔都写下来',
        subtitle: '不是为了记数，是为了记当时在想什么',
        narrative:
          '决策日志的价值不在数字，在于三个月后你能看清自己当时是在推理，还是在找理由。这两者在当下长得一模一样。',
        objective:
          '建一个决策日志（表格或文档皆可），为最近一个月内的每一笔买入/卖出补一条记录，每条包含：当时的理由、预期、以及"什么情况会证明我错了"。此后每笔操作当天补写。',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 30 },
        reward: { exp: 80 },
        outcomeHints: ['一份能反过来审判自己的记录'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['wil', 'int'],
        prerequisiteTempIds: [],
        dueHintDays: 5,
        proof: { criterion: '决策日志链接或截图', kind: 'link' },
        tags: ['journal', 'discipline'],
      },
      {
        tempId: 'inv_seed_5',
        title: '算一次真实的期望值',
        subtitle: '把"感觉不错"换成两种结果与它们的概率',
        narrative:
          '大多数人对期望值的直觉是错的，而且错得很有方向 —— 赢的时候算得小，输的时候算得小，唯独把概率记反了。',
        objective:
          '选一个你正在考虑或已经持有的标的，写下上涨情形与下跌情形各自的幅度、你给的概率，乘出来算期望值。再写一句：这个概率是从哪里来的？如果来源是"感觉"，就照实写"感觉"。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 90 },
        reward: { exp: 150 },
        outcomeHints: ['一次把直觉摆到纸上的机会', '一份概率的来源清单（可能很尴尬）'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['int'],
        prerequisiteTempIds: ['inv_seed_4'],
        dueHintDays: 7,
        proof: { criterion: '期望值计算与概率来源说明', kind: 'text' },
        tags: ['probability', 'thinking'],
      },
      {
        tempId: 'inv_seed_6',
        title: '读一本老书的前三章',
        subtitle: '市场会变，人不会',
        narrative:
          '经典之所以是经典，是因为它讲的是人的行为，而人的行为在四十年里没怎么更新过。前三章通常就够了。',
        objective:
          '挑一本被反复提及的投资经典（不是讲行情的，是讲人与风险的），读完前三章，写下一条你原本不同意、读完仍然不同意的观点，并说明理由。',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 60 },
        reward: { exp: 100 },
        outcomeHints: ['一条带着反对意见的读书笔记'],
        linkedGoalIds: [],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: '笔记（含明确的不同意理由）', kind: 'text' },
        tags: ['reading', 'foundation'],
      },
      {
        tempId: 'inv_seed_7',
        title: '找一个你信以为真的数字',
        subtitle: '它可能只是被抄了三遍的估计值',
        narrative:
          '你在决策里用过的每一个数字，都有一个源头。有的源头是统计，有的源头是某个人的一句话。这两者的分量不该一样。',
        objective:
          '挑一个你经常引用、以为理所当然的市场或行业数字，回溯它的原始出处。写下：原始研究的样本与时间、被引用过程中发生了什么变化、你现在还信它几分。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 3 },
        reward: { exp: 240, attributePoints: { int: 1 } },
        outcomeHints: ['一个被查过户口的数字', '对二手结论的抵抗力'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['int', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: '溯源说明（含原始出处链接）', kind: 'link' },
        tags: ['fact_check', 'base_rate'],
      },
      {
        tempId: 'inv_seed_8',
        title: '一次不操作的三十天',
        subtitle: '把手按住，看会发生什么',
        narrative:
          '多数人亏的不是判断，是次数。这条任务唯一要做的事就是什么都不做 —— 而它很可能是这份清单里最难的一条。',
        objective:
          '从今天起三十天内不做任何主动买卖（既定的定投与强制再平衡除外）。每天只在决策日志里记一句"今天想动的事实与我最终没动的理由"。结束时写下这三十天里最难忍的是哪一天，以及当时在想什么。',
        type: 'special',
        difficulty: 4,
        effortEstimate: { unit: 'day', value: 30 },
        reward: { exp: 600, attributePoints: { wil: 2 } },
        outcomeHints: ['三十条当日冲动的原始记录', '一次对"我其实不必行动"的亲身体感'],
        linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['wil', 'foc'],
        prerequisiteTempIds: ['inv_seed_4'],
        dueHintDays: 45,
        proof: { criterion: '30 天日志记录（截图或链接）', kind: 'link' },
        tags: ['temperament', 'milestone'],
      },
      {
        tempId: 'inv_seed_9',
        title: '写下你的卖出条件',
        subtitle: '现在写，跌的时候就不必现想',
        narrative:
          '卖出决定之所以难，是因为它总被要求在情绪最盛的那一刻做出。提前写好，等于把判断权交还给冷静时的你。',
        objective:
          '为你持有的每一个主要仓位写下卖出条件（可含：基本面恶化到何种程度、估值到何区间、持有理由被证伪的具体信号）。写成一条能被第三人核对的规则，而不是"看情况"。',
        type: 'side',
        difficulty: 4,
        effortEstimate: { unit: 'hour', value: 2 },
        reward: { exp: 320 },
        outcomeHints: ['一组能被别人执行的卖出规则', '一次对持有理由的再确认'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['int', 'wil'],
        prerequisiteTempIds: ['inv_seed_4'],
        dueHintDays: 14,
        proof: { criterion: '卖出条件清单', kind: 'text' },
        tags: ['risk', 'discipline'],
      },
    ],
  },

  // ==========================================================================
  // 3. 自媒体 / 影响力
  // ==========================================================================
  {
    classId: 'social_media_influencer',
    displayName: 'Social Media Influencer',
    displayNameCN: '内容创作者',
    creed: '被记住的不是你说过什么，是你让谁觉得自己被理解。',
    domains: [
      'hook writing', 'content banking', 'distribution mechanics',
      'audience trust', 'completion rate', 'series design',
      'personal brand', 'community building',
    ],
    agentDisplayName: '表达 · 内容创作者',
    agentTagline: '我不追热点。我追的是三年后还有人翻出来看的那条。',
    expCurve: { base: 90, exponent: 1.28, maxLevel: 99 },
    titleTiers: [
      { fromLevel: 1, title: '匿名观察者', requirementHint: '还没有作品，但已经在观察' },
      { fromLevel: 5, title: '表达练习生', requirementHint: '完成第一批公开发布' },
      { fromLevel: 10, title: '内容创作者', requirementHint: '开始有自己的选题直觉' },
      { fromLevel: 17, title: '小有名气', requirementHint: '有人因为是你而点开' },
      { fromLevel: 26, title: '小？网红', requirementHint: '你的推荐会被当成参考' },
      { fromLevel: 41, title: '你就是话题', requirementHint: '你提出的话题别人在讨论' },
      { fromLevel: 61, title: '群体的声音', requirementHint: '你的表达成为一种语言' },
    ],
    linkedGoalIds: ['GEO_INDEPENDENT_WORK', 'A9_ASSETS'],
    attributeWeights: { cha: 0.4, foc: 0.2, int: 0.2, wil: 0.2 },
    recommendedDailies: [
      { title: '写 100 字，不发布也行', targetPerDay: 1, iconKey: 'pen', rationale: '表达能力只对每天使用它的人增长' },
      { title: '拆解一条爆款的结构', targetPerDay: 1, iconKey: 'teardown', rationale: '被拆解过的运气才能被复用' },
    ],
    seedQuests: [
      {
        tempId: 'inf_seed_1',
        title: '一百条墓志铭',
        subtitle: '先证明你能持续，再谈天赋',
        narrative:
          '绝大多数人不是输在不会做内容，是输在第九条。天赋的事情以后再说，先把量堆出来，让自己看见自己在没有反馈的时候是什么样子。',
        objective:
          '连续发布 10 条内容（可以是短文/图文/短视频），主题围绕你真实在做的事。要求：每条记录发布后的 3 个数据点，并写下你发布前的那 30 秒在想什么。',
        type: 'side',
        difficulty: 4,
        effortEstimate: { unit: 'day', value: 10 },
        reward: { exp: 500, attributePoints: { cha: 1 } },
        outcomeHints: ['10 条公开作品', '对"没有反馈时你还做不做"的一次真实回答'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: '10 条内容的链接清单 + 数据记录表', kind: 'link' },
        tags: ['consistency', 'publishing'],
      },
      {
        tempId: 'inf_seed_2',
        title: '拆掉一条爆款',
        subtitle: '把玄学变成可复用的结构',
        narrative:
          '爆款不是运气，是有人在前三秒做了一个你没注意到的决定。把它拆开看，别嫉妒它。',
        objective:
          '选取同领域中数据最好的 3 条内容，逐秒/逐段拆解其开场钩子、信息密度曲线、以及一个具体的收尾动作。产出一份可套用的结构模板。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'hour', value: 3 },
        reward: { exp: 220 },
        outcomeHints: ['一份属于你自己的内容结构模板'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'int'],
        prerequisiteTempIds: ['inf_seed_1'],
        dueHintDays: 7,
        proof: { criterion: '拆解文档（含 3 个案例）', kind: 'text' },
        tags: ['craft', 'structure'],
      },
      {
        tempId: 'inf_seed_3',
        title: '一句话的三种写法',
        subtitle: '同一件事，热身三遍',
        narrative:
          '写不动通常不是没内容，是第一次就想写最终稿。先把同一句话改三遍，你会发现前三遍都是热身。',
        objective:
          '挑一个你最近想讲的观点，用三种不同的方式各写一句开场（一个提问、一个反常识断言、一个具体场景），写完给自己选一个，并写下一句为什么选它。',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 45 },
        reward: { exp: 90 },
        outcomeHints: ['三句可以互相替换的开场', '一次对"我到底想说什么"的确认'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'int'],
        prerequisiteTempIds: [],
        dueHintDays: 3,
        proof: { criterion: '三句开场 + 选择理由', kind: 'text' },
        tags: ['writing', 'craft'],
      },
      {
        tempId: 'inf_seed_4',
        title: '建一个选题库',
        subtitle: '灵感不该在做题时才去找',
        narrative:
          '靠灵感更新的人，倒下的时候都是因为"今天不知道发什么"。选题库不是储备内容，是储备状态。',
        objective:
          '建一个可以随时往里丢东西的选题库（备忘录、表格、语音都行），一次性写入至少 20 条候选选题。每条只写一句话，不评判、不排序、不删除。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'hour', value: 2 },
        reward: { exp: 160 },
        outcomeHints: ['一个不需要灵感也能开机的来源池', '二十条你真正想讲的话'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 7,
        proof: { criterion: '选题库链接或截图（≥20 条）', kind: 'link' },
        tags: ['pipeline', 'consistency'],
      },
      {
        tempId: 'inf_seed_5',
        title: '做一条你自己会收藏的',
        subtitle: '先取悦那个最苛刻的观众',
        narrative:
          '你的第一条标准不该是数据，是"如果这条是别人发的，我会不会存下来"。这个标准你骗不了自己。',
        objective:
          '按你当前能拿出的最高标准做一条内容，发布前先问自己一句：如果这是陌生人发的，我会收藏吗？如果答案是否定的，改到答案为是再发。发布后记录真实的自评与数据差异。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 4 },
        reward: { exp: 280 },
        outcomeHints: ['一条你自己认可的作品', '自评与外部反馈之间的一次对照'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'foc'],
        prerequisiteTempIds: ['inf_seed_2'],
        dueHintDays: 10,
        proof: { criterion: '内容链接 + 自评记录', kind: 'link' },
        tags: ['craft', 'standard'],
      },
      {
        tempId: 'inf_seed_6',
        title: '回应一个真实的提问',
        subtitle: '问题比选题诚实',
        narrative:
          '自己想的选题总带着表演成分，别人问的问题不会。挑一个真问题回答，你说的每句话都有人接得住。',
        objective:
          '从评论、私信、社群里挑一个真实的、具体的问题，认真做一条回应内容（不需要长，但必须只回答那一个问题）。发布后把提问者的反馈记下来。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 90 },
        reward: { exp: 180 },
        outcomeHints: ['一条有明确收件人的内容', '一次"被需要"的具体体感'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK', 'SOULMATE'],
        linkedAttributes: ['cha'],
        prerequisiteTempIds: [],
        dueHintDays: 5,
        proof: { criterion: '原问题截图 + 回应内容链接', kind: 'link' },
        tags: ['community', 'listening'],
      },
      {
        tempId: 'inf_seed_7',
        title: '把一条变成一组',
        subtitle: '一条内容的价值上限是它自己被多少人看到',
        narrative:
          '你有一条讲清楚了的东西，就等于有了一个系列的开头。观众记住的是系列，不是某一条。',
        objective:
          '挑你目前数据或自评最好的一条内容，围绕它拆出一个至少 5 条的系列大纲（每条一句话、各自的角度不重复）。发布其中至少 2 条。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 5 },
        reward: { exp: 320, attributePoints: { cha: 1 } },
        outcomeHints: ['一个可以持续讲下去的角度', '从单条到系列的一次结构升级'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'int', 'foc'],
        prerequisiteTempIds: ['inf_seed_4'],
        dueHintDays: 14,
        proof: { criterion: '系列大纲 + 至少 2 条已发布链接', kind: 'link' },
        tags: ['series', 'leverage'],
      },
      {
        tempId: 'inf_seed_8',
        title: '公开一次失败',
        subtitle: '这是最难的一条，也是最有效的信任',
        narrative:
          '展示成功会让人羡慕，展示失败会让人靠近。后者更贵，而且不需要你有任何成绩。',
        objective:
          '选一件你确实做砸了、且已经能平静谈论的事，公开讲清楚：当时的目标、你的判断、实际发生了什么、你现在改了什么。不卖惨、不甩锅、不总结成鸡汤。',
        type: 'special',
        difficulty: 4,
        effortEstimate: { unit: 'hour', value: 3 },
        reward: { exp: 380, attributePoints: { cha: 1, wil: 1 } },
        outcomeHints: ['一次不需要成绩支撑的表达', '与观众之间一层真实的连接'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK', 'SOULMATE'],
        linkedAttributes: ['cha', 'wil'],
        prerequisiteTempIds: [],
        dueHintDays: 21,
        proof: { criterion: '内容链接', kind: 'link' },
        tags: ['honesty', 'trust'],
      },
      {
        tempId: 'inf_seed_9',
        title: '六十天不断更',
        subtitle: '把"我在做这件事"变成事实',
        narrative:
          '身份不是想出来的，是重复出来的。六十天之后你不需要再向任何人解释你在做什么。',
        objective:
          '连续六十天每天发布一条内容（可以是短内容，允许粗糙，但不允许空窗）。在日历上记录每一天的完成情况，断掉的那天如实标记并从头计时或补记说明。',
        type: 'milestone',
        difficulty: 5,
        effortEstimate: { unit: 'day', value: 60 },
        reward: { exp: 900, attributePoints: { wil: 2, cha: 1 } },
        outcomeHints: ['六十天的连续记录', '一个不再需要启动成本的习惯'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['wil', 'foc', 'cha'],
        prerequisiteTempIds: ['inf_seed_1'],
        dueHintDays: 75,
        proof: { criterion: '60 天发布记录（日历或数据后台截图）', kind: 'link' },
        tags: ['milestone', 'identity'],
      },
    ],
  },

  // ==========================================================================
  // 4. 创业
  // ==========================================================================
  {
    classId: 'startup_entrepreneur',
    displayName: 'Startup Entrepreneur',
    displayNameCN: '创业者',
    creed: '市场不关心你的努力，它只回答一个问题：这是真的吗？',
    domains: [
      'customer discovery', 'falsifiable hypothesis', 'minimum viable test',
      'cash flow', 'distribution first', 'founder psychology',
      'pricing', 'focus and killing your darlings',
    ],
    agentDisplayName: '创业 · 从 0 到 1',
    agentTagline: '我唯一的工作是杀死那些错误的假设，越快越好，越便宜越好。',
    expCurve: { base: 110, exponent: 1.4, maxLevel: 99 },
    titleTiers: [
      { fromLevel: 1, title: '谁有麻烦？', requirementHint: '先学会听别人抱怨' },
      { fromLevel: 5, title: '确认痛点', requirementHint: '完成第一轮真实用户对话' },
      { fromLevel: 10, title: 'mvp', requirementHint: '用最小成本验证过一个假设' },
      { fromLevel: 17, title: 'cash flow', requirementHint: '拿到第一笔真实的钱' },
      { fromLevel: 26, title: '系统建造者', requirementHint: '让事情在你不在时也能运转' },
      { fromLevel: 41, title: '组织设计者', requirementHint: '开始为别人设计成长的容器' },
      { fromLevel: 61, title: '从 0 到 1 ', requirementHint: '你创造过不存在的东西' },
    ],
    linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK', 'PRIVATE_LAB'],
    attributeWeights: { cha: 0.3, wil: 0.25, cap: 0.2, foc: 0.25 },
    recommendedDailies: [
      { title: '和一个人聊他真实的问题', targetPerDay: 1, iconKey: 'talk', rationale: '创业的原材料是别人的真实处境，不是灵感' },
      { title: '写下一个今天被推翻的假设', targetPerDay: 1, iconKey: 'hypothesis', rationale: '被杀死得越早的假设越便宜' },
    ],
    seedQuests: [
      {
        tempId: 'ent_seed_1',
        title: '五个人的抱怨',
        subtitle: '在写代码之前，先听到真实的痛',
        narrative:
          '你想做的那个东西，可能已经在某个人的 Excel 里被丑陋地解决着。去找那个人。不要问"你会用吗"，问"你现在怎么熬过来的"。',
        objective:
          '与 5 位目标用户进行不少于 20 分钟的真实对话。全程不问"你会不会用某个产品"，只问他们现在如何解决该问题、花了多少钱与时间。整理成 5 份访谈记录。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 5 },
        reward: { exp: 350, attributePoints: { cha: 1 } },
        outcomeHints: ['5 份一手访谈记录', '一个被现实修正过的问题定义'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['cha', 'int'],
        prerequisiteTempIds: [],
        dueHintDays: 10,
        proof: { criterion: '5 份访谈记录（含原话引用）', kind: 'text' },
        tags: ['discovery', 'foundation'],
      },
      {
        tempId: 'ent_seed_2',
        title: '可被否证的假设',
        subtitle: '把想法压缩成一句能被杀死的话',
        narrative:
          '不可否证的想法不是想法，是信仰。信仰不需要验证，但也无法进步。',
        objective:
          '基于访谈结果，写出你的核心假设（格式：我认为【某类人】会因为【某个动机】而愿意为【某个方案】付出【某个价格】），并设计一个成本低于 200 元、7 天内可完成的验证实验。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 2 },
        reward: { exp: 260 },
        outcomeHints: ['一个可执行的验证方案'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['cap', 'foc'],
        prerequisiteTempIds: ['ent_seed_1'],
        dueHintDays: 7,
        proof: { criterion: '假设陈述 + 验证实验设计（含成本与判定标准）', kind: 'text' },
        tags: ['hypothesis', 'validation'],
      },
      {
        tempId: 'ent_seed_3',
        title: '把你上个月花的钱分个类',
        subtitle: '你的账本已经替你说出你在做什么',
        narrative: '你以为你在做的事，和你花钱的地方可能是两件事。这条任务不评判，只分类。',
        objective:
          '导出上个月的全部支出，逐笔分类（生存、工具、成长、社交、情绪、其他）。算出各类占比，写一句：这个分布符合我以为的自己吗？',
        type: 'side',
        difficulty: 1,
        effortEstimate: { unit: 'min', value: 30 },
        reward: { exp: 80 },
        outcomeHints: ['一份不带情绪的资金流向图', '你真实投入方向的第一份证据'],
        linkedGoalIds: ['A9_ASSETS'],
        linkedAttributes: ['int', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 5,
        proof: { criterion: '分类表（含占比）与一句自评', kind: 'text' },
        tags: ['cash_flow', 'self_audit'],
      },
      {
        tempId: 'ent_seed_4',
        title: '预售给三个人',
        subtitle: '钱是最诚实的问卷',
        narrative:
          '"听起来不错"是零成本回答。要拿到真实反馈，必须让对方付出一点代价 —— 哪怕是十块钱。',
        objective:
          '在东西还不存在的情况下，向至少 3 个目标用户提出预售或预定（可以是一笔定金、一次预付，或明确的时间承诺）。记录每个人的具体反应与拒绝理由。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 4 },
        reward: { exp: 300, attributePoints: { cha: 1 } },
        outcomeHints: ['三条含拒绝在内的真实反馈', '一次把"喜欢"和"会买"分开的经历'],
        linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'wil', 'cap'],
        prerequisiteTempIds: ['ent_seed_2'],
        dueHintDays: 10,
        proof: { criterion: '3 份预售/预定记录（含拒绝理由）', kind: 'text' },
        tags: ['validation', 'pricing'],
      },
      {
        tempId: 'ent_seed_5',
        title: '一个下午的落地页',
        subtitle: '用一段能被转发的说明代替商业计划',
        narrative:
          '写不出清楚的一句话，说明你还没想清楚卖给谁。落地页是这个思考最便宜的载体。',
        objective:
          '用一个下午做出一个单页说明并公开可访问：谁的问题、你提供什么、凭什么可信、下一步怎么联系你。发给你认为最可能泼冷水的 3 个人，收集他们看不懂的地方。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'hour', value: 4 },
        reward: { exp: 200 },
        outcomeHints: ['一个可以发给陌生人的链接', '三个"别人看不懂"的位置'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK', 'A9_ASSETS'],
        linkedAttributes: ['cap', 'int', 'cha'],
        prerequisiteTempIds: [],
        dueHintDays: 7,
        proof: { criterion: '落地页链接 + 3 条反馈记录', kind: 'link' },
        tags: ['distribution', 'clarity'],
      },
      {
        tempId: 'ent_seed_6',
        title: '写下你的死亡条件',
        subtitle: '提前约定好什么时候停手',
        narrative:
          '没有预设停止条件的项目不会停止，它只会拖到你耗尽为止。事先写好，是为了不让那一刻由情绪决定。',
        objective:
          '为你手上的项目写下明确的停止条件：到什么时间、消耗到什么成本、验证到什么结果时就关掉它。写成具体数字与日期，并告诉至少一个人，请他在条件触发时提醒你。',
        type: 'side',
        difficulty: 2,
        effortEstimate: { unit: 'min', value: 90 },
        reward: { exp: 160 },
        outcomeHints: ['一条提前约定好的止损线', '一个会替你盯着的证人'],
        linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['wil', 'cap'],
        prerequisiteTempIds: ['ent_seed_2'],
        dueHintDays: 7,
        proof: { criterion: '停止条件文本（含数字与日期）', kind: 'text' },
        tags: ['focus', 'killing_darlings'],
      },
      {
        tempId: 'ent_seed_7',
        title: '亲手服务一次客户',
        subtitle: '交付环节里藏着你所有没看见的成本',
        narrative:
          '坐在会议室里想交付流程，和亲手交付一次，是两个完全不同的信息量级。前者省力，后者有效。',
        objective:
          '不借助任何自动化或外包，完整亲手服务一位客户或用户（完成一次交付、一次答疑、一次售后），并记录整个过程中的每一步耗时与最卡的地方。',
        type: 'side',
        difficulty: 3,
        effortEstimate: { unit: 'hour', value: 6 },
        reward: { exp: 340 },
        outcomeHints: ['一份真实的交付耗时表', '对自动化优先级的第一手判断'],
        linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cha', 'cap', 'foc'],
        prerequisiteTempIds: [],
        dueHintDays: 14,
        proof: { criterion: '交付过程记录（含每步耗时）', kind: 'text' },
        tags: ['delivery', 'ops'],
      },
      {
        tempId: 'ent_seed_8',
        title: '关掉一件事',
        subtitle: '取舍不是想通了，是做完了',
        narrative:
          '你不需要更多时间来开始新的事，你需要腾出那个时间。关掉一样东西比启动一样东西更能说明你是谁。',
        objective:
          '从你正在做的事情里挑一件 —— 不是最差的，而是最不该由你来做的 —— 正式关停它：通知相关的人、归档材料、取消订阅与开销。写一句：腾出来的时间准备去哪儿。',
        type: 'special',
        difficulty: 4,
        effortEstimate: { unit: 'hour', value: 2 },
        reward: { exp: 420, attributePoints: { wil: 1, foc: 1 } },
        outcomeHints: ['一次真实的减负', '一句关于时间去向的承诺'],
        linkedGoalIds: ['GEO_INDEPENDENT_WORK', 'A9_ASSETS'],
        linkedAttributes: ['wil', 'foc'],
        prerequisiteTempIds: ['ent_seed_6'],
        dueHintDays: 14,
        proof: { criterion: '关停动作的凭证（归档/通知/退订截图）', kind: 'link' },
        tags: ['focus', 'killing_darlings'],
      },
      {
        tempId: 'ent_seed_9',
        title: '拿到第一笔十块钱',
        subtitle: '从"我在做"到"有人买"',
        narrative:
          '第一个付费用户和第二万个之间隔着的不是方法，是那道门坎本身。先过去一次，你之后的所有判断都会变。',
        objective:
          '以任何合规的方式，让你的项目收到来自非亲友的第一笔真实收入（金额不限，哪怕是十块钱）。记录成交路径：他从哪里看到你、犹豫了什么、最后为什么付钱。',
        type: 'milestone',
        difficulty: 5,
        effortEstimate: { unit: 'day', value: 14 },
        reward: { exp: 700, attributePoints: { wil: 1, cha: 1 } },
        outcomeHints: ['一张真实的收款记录', '一条可被复述的成交路径'],
        linkedGoalIds: ['A9_ASSETS', 'GEO_INDEPENDENT_WORK'],
        linkedAttributes: ['cap', 'cha', 'wil'],
        prerequisiteTempIds: ['ent_seed_4'],
        dueHintDays: 60,
        proof: { criterion: '收款凭证 + 成交路径说明', kind: 'link' },
        tags: ['milestone', 'revenue'],
      },
    ],
  },
];

export const getClass = (id: ClassIdLiteral): ClassCatalogEntry | undefined =>
  CLASSES.find((c) => c.classId === id);

/**
 * 职业名的**唯一**取法。
 *
 * 存在的理由和 panels.ts 一样：同一个概念在两处各写一遍，迟早会长出两个版本。
 * 悬赏板的职业小标签与金库的职业卡必须显示同一个词，所以只有这一个出口。
 * 查不到（被 Dispatcher 动态铸造出来、catalog 里没有的新职业）时退回 classId 本身 ——
 * 显示一个原始 id 不好看，但比显示「未知」诚实：它确实还没被命名。
 */
export const classLabelOf = (id: ClassIdLiteral): string =>
  getClass(id)?.displayNameCN ?? String(id);

/** 根据等级取当前头衔 */
export const titleForLevel = (entry: ClassCatalogEntry, level: number): string => {
  let title = entry.titleTiers[0]?.title ?? '未知';
  for (const tier of entry.titleTiers) {
    if (level >= tier.fromLevel) title = tier.title;
  }
  return title;
};

/** 经验曲线求值：升到下一级所需经验 */
export const expToNext = (curve: ExpCurve, level: number): number =>
  level >= curve.maxLevel ? 0 : Math.round(curve.base * Math.pow(level, curve.exponent));
