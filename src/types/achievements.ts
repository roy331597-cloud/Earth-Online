// ============================================================================
// EarthOnline · Phase 5 · 史诗成就 (achievements.ts)
//
// 成就与另外几套记录的分工（这三者看起来像，其实是三件事）：
//
//   · 现实里程碑（milestones.ts）—— **现实里发生过的事**。玩家自己声明，
//     系统不验证。它回答的是"我在门外真的做成了什么"。
//   · 进化树节点（endgame.ts）  —— **人类尺度的坐标**。静默运转、绝大多数时候
//     不可见。它回答的是"我可能在参与什么"。
//   · 成就（本文件）            —— **这个人本身的样子**。它不新增任何事实，
//     只是把已经发生的事**命名**一次：原来那件事有个名字，叫「闭馆音乐的聆听者」。
//
// 所以成就的触发条件必须全部落在**已经存在的状态**上 —— 不打新点、不发奖、
// 不改任何数值。解锁的唯一后果是往 `unlockables` 里记一个 id 和一个时刻。
// 这条纪律带来两个好处：① 补发是天然正确的（老档里已经做到的事，一算就知道）；
// ② 成就永远不会因为"没触发"而让玩家少拿到什么。
// ============================================================================

import type { ISODateTime } from './core';
import type { EvolutionBranch } from './endgame';
import type { GoalIdLiteral } from './endgame';
import type { RelationStage, RelationType } from './network';

// ---------------------------------------------------------------------------
// 1. 维度与档位
// ---------------------------------------------------------------------------

/**
 * 六大维度。字母（A~F）只是排面，真正的键是这六个词。
 *
 * 它们不是六个"分类"，是六段**不同的人生** —— 复旦的四年、从湿实验到计算的转向、
 * 把重力摆脱掉的资本、离开锚地的迁徙、同频的人、以及那三件现在还说不出口的事。
 * 玩家在陈列馆里看到的每一栏，都是他这辈子的一条剖面。
 */
export type AchievementDimension =
  | 'FUDAN'        // A · 复旦往事
  | 'CARBON'       // B · 碳硅之变
  | 'GRAVITY'      // C · 重力摆脱
  | 'ANCHORLESS'   // D · 无锚之鸟
  | 'ECHO'         // E · 同频的回响
  | 'ABYSS';       // F · 至高隐藏

/**
 * 四档徽记：青铜 / 白银 / 黄金 / 至高白金。
 *
 * 档位说的**不是难度，是稀有度** —— 青铜是一件事的开始，至高白金是这件事的终局。
 * 所以同一条线上四条成就的档位天然递增，而不同线之间不比较：
 * 「告别移液枪」与「第一枚硬币的落地声」都是青铜，它们没有高下之分。
 */
export type AchievementTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'ASCENDANT';

/**
 * 维度 F 的两种记号。
 *
 *   veil（🌌）—— **隐匿**：你曾经以为自己在做一件很窄的事。
 *   halo（👑）—— **光源**：你的答案成了别人的起点。
 *
 * 与档位是两个维度上的事：档位描述"这件事有多重"，记号描述"它以什么姿态出现"。
 * 维度 F 之外一律为 null —— 那不是一栏可以随便挂记号的地方。
 */
export type AchievementMark = 'veil' | 'halo';

// ---------------------------------------------------------------------------
// 2. 达成条件（机器判定的那一半）
// ---------------------------------------------------------------------------

/**
 * 一条成就的机械判据。
 *
 * 为什么用**判别联合**而不是一个 `(state) => boolean` 的谓词函数：
 *
 *   ① 陈列馆要把"还差多少"印在剪影下面（3 / 21 次），谓词函数给不出 current；
 *   ② 数据与判定分开之后，`verify-ops` 能对每一条条件单独造一个小存档来验，
 *      而不是只能对整棵状态树做端到端断言；
 *   ③ 目录是纯数据，可以整份被 JSON 读出、被审阅、被翻译。
 *
 * 每一条的 `count` / `amount` / `months` 都是**目标值**；判定结果统一成
 * `{ met, current, target }` 三元组，于是"进度条"与"是否达成"永远同一个来源。
 */
export type AchievementCondition =
  /** 累计打过多少次日常的钩（`dailies.logs[*].checkedIds` 的总数） */
  | { kind: 'daily_checks'; count: number }
  /** 有过一次「在本地时间 hour 点之前打钩」 */
  | { kind: 'daily_check_before_hour'; hour: number }
  /** 有过一次「在本地时间 hour 点之后打钩」 */
  | { kind: 'daily_check_after_hour'; hour: number }
  /** 有过一次「在本地时间 hour 点之后交卷」的任务（completedAt 落在深夜） */
  | { kind: 'quest_completed_after_hour'; hour: number }
  /** 在某个职业线上完成过多少条任务 */
  | { kind: 'career_quests_completed'; classId: string; count: number }
  /** 研究里程碑里出现过这些标签中的任意几个（按**不同标签**去重计数） */
  | { kind: 'tech_tags'; tags: string[]; count: number }
  /** 记录过这些目录条目中的任意几条（按 id 去重计数） */
  | { kind: 'reality_milestones'; definitionIds: string[]; count: number }
  /** 净资产达到某个数（美分） */
  | { kind: 'net_worth_usd_cents'; amount: number }
  /**
   * 净资产能覆盖多少个月的支出（净资产 ÷ 月均支出）。
   *
   * ⚠️ 与 selectors 的 `runwayMonths` **不是一回事**：那个算的是"手头的现金能撑几个月"
   *    （现金 ÷ 月均支出），是这个产品给玩家看的那把尺子；这一条量的是"全部身家
   *    能挡多久"。两个数不一样，名字也就不能共用 —— 口径混起来的那天，
   *    玩家会发现徽记上写的和他面板上看到对不上。
   *
   * 月均支出为 0 时**永远不成立**：一个还没记账的人不该白得一座防御工事。
   */
  | { kind: 'net_worth_coverage_months'; months: number }
  /** 金库里出现过多少笔主动收入（type = 'income'，且金额为正） */
  | { kind: 'vault_income_count'; count: number }
  /** 某个终极目标已达成 */
  | { kind: 'goal_achieved'; goalId: GoalIdLiteral }
  /** 通讯录里的互动记录总条数 */
  | { kind: 'network_interactions'; count: number }
  /** 面对面的互动（见面 / 饭局）累计次数 */
  | { kind: 'network_face_to_face'; count: number }
  /**
   * 有一个联系人被玩家亲手定到了这些等级中的任意一档。
   * `relationType` 给了就再缩一层（如"必须是一位导师"）。
   *
   * ⚠️ 判据读的是 `Contact.stage`（**玩家的判断**），不是 `currentGrade`（系统的观测）。
   *    这一点是刻意的：等级是玩家自己定的尺子，成就就不该去量系统算出来的那个数。
   */
  | { kind: 'contact_stage'; stages: RelationStage[]; relationType?: RelationType }
  /** 至高隐藏目标已对玩家揭晓 */
  | { kind: 'evolution_revealed' }
  /** 按分支 / 层级统计已点亮的进化树节点 */
  | { kind: 'evolution_lit_nodes'; branch?: EvolutionBranch; tier?: number; count: number }
  /**
   * 任意一条成立即成立。
   *
   * 存在的理由：现实里有几件事本来就有两条路到。比如「第一枚硬币的落地声」——
   * 记一件里程碑算，在金库里落下第一笔收入也算。**两条路都算数，不该逼玩家
   * 走系统偏爱的那一条**；把其中一条写成"正规路径"、另一条当作特例，
   * 是系统在替玩家评判他的人生该怎么记账。
   */
  | { kind: 'any_of'; of: AchievementCondition[] };

/** 一次判定的结果。`current` 与 `target` 供陈列馆画进度，`met` 才是解锁依据 */
export interface AchievementProgress {
  met: boolean;
  current: number;
  target: number;
}

// ---------------------------------------------------------------------------
// 3. 条目定义（放 catalog，不入存档）
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  dimension: AchievementDimension;
  tier: AchievementTier;
  /**
   * 至高隐藏条目：**未解锁时连名字都不给**。
   *
   * 陈列馆上它只显示一枚剪影、一个记号（veil / halo）和一句不点破的线索。
   * 只有维度 F 的三条是 true —— 别的地方藏名字只是在故作神秘，
   * 而这三条藏名字是因为**那个坐标系本身还没显形**（见 evolution.revealed）。
   */
  hidden: boolean;
  /** 维度 F 的记号；其余为 null */
  mark: AchievementMark | null;
  /** 中文题名 */
  title: string;
  /** 英文副名（终局四条有），没有就 null */
  epithet: string | null;
  /** 一行文学题记：拿到之后才读得到的那个"原来如此" */
  epigraph: string;
  /** 人类可读的达成条件（与 condition 是同一件事的两种语言） */
  criterion: string;
  /** 未解锁时给的那句隐晦线索 —— 它必须**不点破**，只指方向 */
  clue: string;
  condition: AchievementCondition;
}

// ---------------------------------------------------------------------------
// 4. 存档里那一格
// ---------------------------------------------------------------------------

/**
 * 已解锁的成就（`EarthOnlineState.unlockables` 里的一格，见 types/state.ts）。
 *
 * 三份数据各司其职，缺一不可：
 *   · `achievementIds`        —— 解锁的**判据**（只增不减：到过就是到过）
 *   · `achievementUnlockedAt` —— 陈列馆要印的那行日期
 *   · `pendingAchievementIds` —— 还没被看见的那些（金色光晕弹窗的队列）
 *
 * ⚠️ 队列是**入存档**的，与 ChapterCeremony 同一条哲学：
 *    刷新一次页面不该让一枚刚点亮的徽记悄无声息地过去。
 */
export interface Unlockables {
  achievementIds: string[];
  /**
   * id → **上墙时刻**：这枚徽记被挂在陈列馆上的那一天。
   *
   * 它**不是**"你做成那件事的日子"，两者在补发时会分开：老档第一次加载时，
   * 那些早就做到的事是同一天一起上墙的。所以陈列馆印这行字时写的是「上墙」，
   * 不写「达成于」—— 一个看起来像日期、其实是另一件事的日期，比没有日期更坏。
   */
  achievementUnlockedAt: Record<string, ISODateTime>;
  /** 还没给玩家看过的那几枚（看完即清） */
  pendingAchievementIds: string[];
  easterEggIds: string[];
  /** 首次进入各系统的引导是否已完成 */
  tourCompleted: Record<string, boolean>;
}
