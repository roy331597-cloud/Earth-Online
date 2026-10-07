// ============================================================================
// EarthOnline · 篇章目录（静态设定，不入存档）
// 叙事设定详见 docs/phase1/chapters-and-lore.md
//
// 篇章不是线性关卡，而是一张 DAG（有向无环图）：
// 从 Ch.1 分叉出多条支线，再一层层汇回主线。
//
//                    ┌─ Ch.2 把名字写进引文 ─┐
//                    │        （学术支线）      ├─ Ch.4 把问题磨成针 ─┐
//   Ch.1 课表之外 ───┼─ Ch.3 候鸟的第一段航程 ─┘   （Ch.2 / Ch.3 任一）  ├─ Ch.6 无锚之船 ─ Ch.7 白墙与服务器 ─ Ch.9 点亮进化树
//                    │                                                 │
//                    ├─ Ch.5 河流开始改道 ────────────────────────────┘
//                    │
//                    └─ Ch.8 同频者（全程并行，不阻塞任何线，也不被任何线要求）
//
//   - `requires` 是机器判定：全部完成才解锁；Ch.4 例外地用 `requiresOneOf`
//     （学术或世界，二选一即可——另一条线不构成门锁，随时可以补）；
//   - 同一时刻可以有多个 activeChapter——先海外研究再产出论文、
//     一边科研一边积累财富，都是合法的走法；
//   - Ch.4 / Ch.6 / Ch.7 是汇流点：支线在这里并回主线。
// ============================================================================

import type { ChapterId } from '../../types/core';
import type { ChapterBranch, ChapterDefinition } from '../../types/endgame';

export const CHAPTERS: ChapterDefinition[] = [
  {
    id: 'CH1',
    index: 1,
    codename: 'BEYOND_TIMETABLE',
    title: '课表之外',
    subtitle: '校园、副业与第一笔自己赚来的钱',
    epigraph: '你还不知道要去哪。但你已经开始把时间，花在四年后还留着的东西上。',
    theme:
      '同样的四年，学分是下限，课表之外的时间才是上限。一边把专业基础打扎实，一边用副业和兼职换取第一笔本金与最早的现实感。',
    branch: 'trunk',
    requires: [],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition: '游戏开始',
    exitCondition:
      '连续 30 天有记录；至少一条职业线达 Lv.5；并且出现第一笔自己赚来的收入（至少 1 笔非家庭给予的进账）',
    primaryGoalIds: ['GEO_INDEPENDENT_WORK', 'A9_ASSETS'],
    emotionalTone: '干净、有点穷但很自由、图书馆闭馆时的风',
  },
  {
    id: 'CH2',
    index: 2,
    codename: 'CITATION',
    title: '把名字写进引文',
    subtitle: '本科科研与第一次真实产出',
    epigraph: '在人类知识的墙上，先钉下第一枚属于你的钉子。',
    theme:
      '从"学这门课的人"变成"做过一件可被检验的事的人"。哪怕只是一份复现、一个开源工具、一份数据集，只要它真实存在、能被别人使用，性质就完全不同了。',
    branch: 'academic',
    requires: ['CH1'],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition: 'Ch.1 完成（学术支线开启；可与 Ch.3 / Ch.5 / Ch.8 并行）',
    exitCondition:
      '产出至少 1 项可被外部检索/使用的成果（预印本 / 开源仓库 / 公开数据集 / 会议投稿）',
    primaryGoalIds: ['PRIVATE_LAB'],
    emotionalTone: '专注、第一次被审稿人或用户认真对待',
  },
  {
    id: 'CH3',
    index: 3,
    codename: 'FIRST_FLIGHT',
    title: '候鸟的第一段航程',
    subtitle: '第一段海外经历',
    epigraph: '第一次独自过海关的时候，你会发现自己其实很小，但也很完整。',
    theme:
      '把"世界"从一个词变成一个具体的房间、一条街、一种说不利索的语言。这段经历的价值不在于履历上多一行，而在于你从此知道自己在陌生环境里能活成什么样。',
    branch: 'world',
    requires: ['CH1'],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition:
      'Ch.1 完成（世界支线开启；可以先于 Ch.2 走——先海外研究、再产出论文是被允许的）',
    exitCondition:
      '完成至少 1 段不少于 8 周的海外学习/研究经历，并在当地独立完成一件完整的事（一项研究、一个项目、或一份报告）',
    primaryGoalIds: ['GLOBAL_MOBILITY', 'GEO_INDEPENDENT_WORK'],
    emotionalTone: '开阔、陌生、语言不够用但活下来了',
  },
  {
    id: 'CH4',
    index: 4,
    codename: 'NEEDLE',
    title: '把问题磨成针',
    subtitle: '研究生阶段与学术能力的成型',
    epigraph: '把一个含糊的困惑，磨成一根能扎穿它的针。',
    theme:
      '研究生不是延长学生时代，而是第一次真正拥有一个属于自己的问题。你要学会把它磨得足够细、足够具体，细到别人绕不过去，它就成了你的。',
    branch: 'academic',
    requires: [],
    requiresOneOf: ['CH2', 'CH3'],
    isConvergence: true,
    entryCondition:
      'Ch.2 或 Ch.3 任一完成（汇流点①：学术 / 世界二选一即可进入；另一条线随时可补）',
    exitCondition:
      '研究生阶段产出至少 1 项可作为第一作者的成果，且方法论可被他人复用；如再有第二段海外经历，额外计入进度',
    primaryGoalIds: ['PRIVATE_LAB', 'GEO_INDEPENDENT_WORK'],
    emotionalTone: '深潜、枯燥中的锋利、开始有自己的方法',
  },
  {
    id: 'CH5',
    index: 5,
    codename: 'RIVERBED',
    title: '河流开始改道',
    subtitle: '财富的数量级跃升',
    epigraph: '钱不是目标，是让选择自由的燃料。',
    theme:
      '从"用时间换钱"转向"用系统换钱"。建立第一个正期望系统，让收入第一次不依赖出勤，并理解复利与风险的真实含义。',
    branch: 'capital',
    requires: ['CH1'],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition:
      'Ch.1 完成（资本支线开启；可与学术线全程并行——一边科研一边积累财富）',
    exitCondition:
      '出现至少 1 条非工资性收入，且净资产相对进入本章时的快照提升 10 倍' +
      '（Ch.1 起赚到的钱都已计入该快照——它保证的是"再跃升一个数量级"）',
    primaryGoalIds: ['A9_ASSETS'],
    emotionalTone: '冷静、概率思维、不表现出赌性',
  },
  {
    id: 'CH6',
    index: 6,
    codename: 'NO_ANCHOR',
    title: '无锚之船',
    subtitle: '海外身份与地理自由',
    epigraph: '自由不是没有锚，是你自己决定抛在哪里。',
    theme: '把"地理位置无关"从一种工作方式，变成一件写在证件上的事实。',
    branch: 'trunk',
    requires: ['CH4', 'CH5'],
    requiresOneOf: [],
    isConvergence: true,
    entryCondition: 'Ch.4 与 Ch.5 均完成（汇流点②：学术 × 世界 × 资本在此并回主线）',
    exitCondition: '海外身份进程实质推进至递交或获批，且已完成至少 1 段长期异地工作验证',
    primaryGoalIds: ['GLOBAL_MOBILITY', 'GEO_INDEPENDENT_WORK'],
    emotionalTone: '开阔、漂泊感与掌控感并存',
  },
  {
    id: 'CH7',
    index: 7,
    codename: 'WHITE_WALLS',
    title: '白墙与服务器',
    subtitle: '私人独立 Lab',
    epigraph: '给自己买一间房，四壁皆白，中间放一台只属于自己的机器。',
    theme: '从租用别人的设备，到拥有提问的自由。学术与资本在这里合流。',
    branch: 'trunk',
    requires: ['CH6'],
    requiresOneOf: [],
    isConvergence: true,
    entryCondition: 'Ch.6 完成（汇流点③：学术 × 资本 × 自由合流）',
    exitCondition: 'Lab 实体/虚拟形态落地，并产出至少 1 项独立成果',
    primaryGoalIds: ['PRIVATE_LAB'],
    emotionalTone: '沉静、器物感、造物主的清晨',
  },
  {
    id: 'CH8',
    index: 8,
    codename: 'RESONANCE',
    title: '同频者',
    subtitle: '灵魂伴侣与深度连接',
    epigraph: '你终于有能力，去遇见那个不需要你解释的人。',
    theme: '把自己变成一个值得靠近的人，然后允许关系发生。',
    branch: 'bond',
    requires: ['CH1'],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition:
      'Ch.1 完成后的任意时刻（全程并行；不设硬前置，也不必等事业线走完）',
    exitCondition: '建立至少 1 段双向深度关系（warmth 与 trust 双高且长期稳定）',
    primaryGoalIds: ['SOULMATE'],
    emotionalTone: '温暖、不焦躁、不功利',
  },
  {
    id: 'CH9',
    index: 9,
    codename: 'IGNITION',
    title: '点亮进化树',
    subtitle: '至高隐藏目标',
    epigraph: '你不再追光。你成为光源本身。',
    theme: '不主动领取、不显示进度、无任何提示 —— 直到它自己亮起来。',
    branch: 'trunk',
    requires: ['CH7'],
    requiresOneOf: [],
    isConvergence: false,
    entryCondition:
      'Ch.7 完成，且隐藏条件触发（evolution.revealed 由后台累积自动置真；不满足时即使 Ch.7 已完成也不可见）',
    exitCondition: '不设终点。此后进入 Endless 模式，进化树继续生长。',
    primaryGoalIds: [],
    emotionalTone: '震撼 —— 这是全产品唯一允许打破沉浸的时刻',
  },
];

export const getChapter = (id: string): ChapterDefinition | undefined =>
  CHAPTERS.find((c) => c.id === id);

/**
 * 解锁判定：`requires` 全部完成、且 `requiresOneOf`（若非空）至少完成其一
 * ——两者是 AND 关系。Ch.4 借此把"学术线 / 世界线"变成二选一的入口。
 * ⚠️ Ch.9 例外：它还要 evolution.revealed 为真，由运行期 selector 另行把关，
 *    见 `HIDDEN_CHAPTER_IDS`。
 */
export const isChapterUnlocked = (
  def: ChapterDefinition,
  completedIds: readonly ChapterId[],
): boolean =>
  def.requires.every((id) => completedIds.includes(id)) &&
  (def.requiresOneOf.length === 0 ||
    def.requiresOneOf.some((id) => completedIds.includes(id)));

/** 需要额外隐藏条件、不能仅凭 requires 解锁的篇章 */
export const HIDDEN_CHAPTER_IDS: readonly ChapterId[] = ['CH9'];

/**
 * 当前所有"已解锁且未完成"的篇章。
 * 支线可并行，因此通常有多个（例如同时推进 Ch.2 与 Ch.5）。
 */
export const getActiveChapters = (
  completedIds: readonly ChapterId[],
): ChapterDefinition[] =>
  CHAPTERS.filter(
    (c) =>
      !HIDDEN_CHAPTER_IDS.includes(c.id) &&
      !completedIds.includes(c.id) &&
      isChapterUnlocked(c, completedIds),
  );

/** 支线的展示名。用于地图与履历视图的分组标签 */
export const CHAPTER_BRANCH_LABELS: Record<ChapterBranch, string> = {
  trunk: '主干',
  academic: '学术支线',
  world: '世界支线',
  capital: '资本支线',
  bond: '关系支线',
};

/**
 * 篇章的"人生阶段"分组。用于 Phase 5 的履历视图：
 * 玩家回头看时，看到的不该是 9 个关卡，而是三段人生。
 * （幕只是展示分组，不参与解锁判定。）
 */
export const CHAPTER_ACTS = [
  { act: 'I', title: '求学', chapterIds: ['CH1', 'CH2', 'CH3', 'CH4'] },
  { act: 'II', title: '立业', chapterIds: ['CH5', 'CH6'] },
  { act: 'III', title: '造物', chapterIds: ['CH7', 'CH8', 'CH9'] },
] as const;

// ---------------------------------------------------------------------------
// 命名权候选池（Phase 3）
//
// 命名权的规则（docs/phase1/chapters-and-lore.md §5）：每完成一章，
// 玩家为**下一章**选一个代号 —— 从三个候选里挑，或自己写一个。
//
// 候选不是随机词：三个各占一种语气 ——
//   第一个偏**动作**（你打算做什么），
//   第二个偏**意象**（这一章是什么样子），
//   第三个偏**状态**（走完这一章你会变成谁）。
// 三选一因此不只是在挑词，是在挑"我想用哪种方式记住这段日子"。
//
// 玩家自己写的那个不受任何约束（长度会被截到 12 字），
// 这三个候选只是给一个不必空着发呆的起点。
// ---------------------------------------------------------------------------

export const CHAPTER_CODENAME_CANDIDATES: Record<ChapterId, readonly [string, string, string]> = {
  CH1: ['课表之外', '图书馆闭馆的风', '还留着的东西'],
  CH2: ['第一枚钉子', '引文里的名字', '可被检验的人'],
  CH3: ['过海关的人', '说不利索的语言', '很小但很完整'],
  CH4: ['磨一根针', '自己的问题', '细到绕不过去'],
  CH5: ['改道', '正期望', '不依赖出勤'],
  CH6: ['自选的锚', '写在证件上', '漂泊与掌控'],
  CH7: ['白墙', '提问的自由', '造物的清晨'],
  CH8: ['同频', '不必解释', '值得靠近的人'],
  CH9: ['光源', '不再追光', '成为起点'],
};
