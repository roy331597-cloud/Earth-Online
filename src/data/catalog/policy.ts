// ============================================================================
// EarthOnline · 全局策略默认值 (policy.ts)
//
// 这里放的是**可调的产品旋钮**：奖励区间、惩罚力度、跨天时刻。
// 与 catalog/ 下其它文件一样是静态设定，不入存档；
// 首次创建存档时会把 DEFAULT_APP_SETTINGS 深拷贝进 state.settings，
// 之后玩家改动的就是自己的那份。
// ============================================================================

import type { AppSettings, BonusBand, Difficulty, RewardPolicy } from '../../types/core';
import type { ReflectionQuality } from '../../types/journal';

// ---------------------------------------------------------------------------
// 1. 复盘加成：两步判定（先判"是否加成"，再按难度浮动）
// ---------------------------------------------------------------------------

/**
 * 设计意图：
 *   - **第一步 —— 是否加成**：档位落到 `baseline`（套话 / 复述目标 / 无任何具体信息）
 *     时，加成直接为 0。不是"少给"，是不给。写满一百字的空话不等于反思。
 *   - **第二步 —— 加成多少**：通过资格线后，按难度档位在区间内浮动：
 *     低难任务区间窄（5 分钟的小事不该靠一段文字套利），
 *     高难任务区间宽（付出越大，反思的边际价值越高）。
 *   - **高难任务上限更高（难度 5 到 20%）、下限略低（5%）**：
 *     宽区间的意义是"更深的反思确实能拿到更多"，而不是"接了难任务就保底"。
 *
 * 得到的两条曲线：
 *   难度 1  →  6% ~ 9%      （窄）
 *   难度 5  →  5% ~ 20%     （宽）
 */
export const REFLECTION_BONUS_BANDS: Record<Difficulty, BonusBand> = {
  1: { minPct: 6, maxPct: 9 },
  2: { minPct: 6, maxPct: 10 },
  3: { minPct: 6, maxPct: 11 },
  4: { minPct: 5, maxPct: 13 },
  5: { minPct: 5, maxPct: 20 },
};

export const bonusBandFor = (difficulty: Difficulty): BonusBand =>
  REFLECTION_BONUS_BANDS[difficulty];

/**
 * 第一步：加成资格审查。
 * `baseline` = 未通过资格线。空复盘（压根没写）连 Arbiter 都不调用，
 * 在更上游就按 0 处理，不经过本函数。
 */
export const qualifiesForBonus = (quality: ReflectionQuality): boolean =>
  quality !== 'baseline';

/**
 * 第二步：通过资格审查后，质量档位 → 区间内的取值。
 *
 * ⚠️ 本函数与 `src/ai/prompts/40-arbiter.md` 中的映射表**必须保持一致**。
 *    客户端即便收到 AI 给的具体 bonusPct，也会用本函数按档位重新对齐，
 *    因此 AI 的数值幻觉无法破坏经济系统（core.ts 铁律 #1）。
 *
 * 单调性与边界：
 *   baseline    → 0（未过资格线，不加成）
 *   solid       → 区间下限
 *   sharp       → 区间 60% 处
 *   revelatory  → 区间上限
 */
export const bonusForQuality = (quality: ReflectionQuality, band: BonusBand): number => {
  const span = band.maxPct - band.minPct;
  switch (quality) {
    case 'baseline':
      return 0;
    case 'solid':
      return band.minPct;
    case 'sharp':
      return Math.round(band.minPct + span * 0.6);
    case 'revelatory':
      return band.maxPct;
  }
};

/**
 * 把任意数值对齐到「该难度 + 该档位」应有的加成。
 * 这是发奖前最后一道闸门。
 */
export const alignBonusPct = (
  rawPct: number,
  quality: ReflectionQuality,
  difficulty: Difficulty,
): number => {
  // 第一步：资格线没过，一律 0 —— AI 给什么数都不认
  if (!qualifiesForBonus(quality)) return 0;

  const band = bonusBandFor(difficulty);
  const aligned = bonusForQuality(quality, band);
  // 若 AI 给的数值本身落在区间内、且与档位预期差距不大（±1），尊重它的判断
  if (Math.abs(rawPct - aligned) <= 1 && rawPct >= band.minPct && rawPct <= band.maxPct) {
    return rawPct;
  }
  return aligned;
};

// ---------------------------------------------------------------------------
// 2. 奖励与惩罚政策
// ---------------------------------------------------------------------------

export const DEFAULT_REWARD_POLICY: RewardPolicy = {
  reflectionBonusBands: REFLECTION_BONUS_BANDS,

  /**
   * 复盘字数下限。低于此值时判定档位最高只能到 `solid`；
   * 但能否拿到加成仍要先过 baseline 资格审查（短而空 → 0%）。
   * 30 字大约是一句半有信息量的中文。
   */
  reflectionWordCountFloor: 30,

  /**
   * 日常漏打惩罚 = 该日常奖励 × 此系数（即"漏一天补一天半"）。
   *
   * 作用范围严格限定：
   *   - 只扣该条日常对应的 EXP
   *   - **只针对该日未打钩的那条日常本身**，不牵连其它日常、不扣金库、
   *     不清除已有记录、不影响已获得的等级
   *   - 连击归零，但历史最长记录（bestStreak）永久保留
   */
  dailyMissPenaltyMultiplier: 1.5,

  /** 连击每个自然日带来的额外加成比例 */
  streakBonusPerDay: 0.02,
  /** 连击加成封顶 */
  streakBonusCapPct: 15,
  /** 单次任务 EXP 上限，防止 AI 生成离谱数值 */
  maxExpPerQuest: 1500,

  /**
   * 现实里程碑每月可发放的 EXP 上限（防刷）。
   * 超出后当月不再发放新 EXP，但记录本身仍会写入时间轴（事实照记，只是不涨分）。
   */
  realityMilestoneMonthlyExpCap: 1200,
};

// ---------------------------------------------------------------------------
// 3. 财富曲线（A9 的对数进度）
// ---------------------------------------------------------------------------

/**
 * 建角注入：游戏开始时由家庭 / 奖学金打入的启动资金。
 * ¥8000 ≈ **$1,100**（按 ~7.3 汇率）。
 *
 * 它是财富曲线的**起点刻度**，不是白送的分——有了它：
 *   - log(0) / log(1) 的边界问题不复存在；
 *   - 曲线从"建角当天 = 0%"开始，而不是一上来就显示几十个点。
 */
export const INITIAL_VAULT_USD_CENTS = 110_000;

/**
 * A9 财富进度曲线（对数 + 归一化）。对应 core.ts Vault 的说明与 README §6 决策 9。
 *
 *   progress = [log10(x + K) − log10(start + K)] / [log10(target + K) − log10(start + K)]
 *
 * 三个旋钮：
 *   - `startUsdCents`（$1,100）：进度刻度从这里起 —— 建角当天是 0%；
 *   - `targetUsdCents`（$100M）：A9 终极目标，曲线在此到 100%；
 *   - `smoothingUsdCents`（$10k）：平滑常数 K，避免 log 在低位过陡，
 *     让"$1k → $10k"这一档也有可见、连续的反馈。
 *
 * ⚠️ 不要退回 `log10(netWorth) / 8` 的裸对数写法——那个公式在 $1,100 时
 *    就已经显示 38%，前期反馈全失真了。
 */
export const WEALTH_CURVE = {
  startUsdCents: INITIAL_VAULT_USD_CENTS,
  targetUsdCents: 10_000_000_000,
  smoothingUsdCents: 1_000_000,
} as const;

/**
 * 财富进度 0..1（由 selector 调用，**不入库**）。
 * 低于建角刻度时按 0 处理；达到目标即 1。纯函数，可单测。
 */
export const wealthProgressRatio = (netWorthUsdCents: number): number => {
  const { startUsdCents, targetUsdCents, smoothingUsdCents: k } = WEALTH_CURVE;
  const x = Math.max(netWorthUsdCents, 0);
  const logStart = Math.log10(startUsdCents + k);
  const logTarget = Math.log10(targetUsdCents + k);
  const ratio = (Math.log10(x + k) - logStart) / (logTarget - logStart);
  return Math.min(1, Math.max(0, ratio));
};

// ---------------------------------------------------------------------------
// 3.5 每周规程的创建档位
// ---------------------------------------------------------------------------

/**
 * 玩家新建每周任务时可选的三档。为什么是"选档"而不是"填数字"：
 *   - 每周任务的分量是"这一周"的单位，玩家对它的直觉是轻/中/重，不是 60/150/300；
 *   - 数值藏在档位后面，玩家改不动它，也就没人会去算"哪一个档位最划算"。
 *
 * 惩罚不在这里 —— 它由 `dailyMissPenaltyMultiplier`（1.5，与日常同一枚旋钮）
 * 在创建时定格进 WeeklyDefinition.penaltyExp，惩罚系数全项目只有一份。
 */
export const WEEKLY_REWARD_TIERS = [
  { key: 'light', label: '轻', exp: 60, hint: '一周里顺手就能挪出时间做的事' },
  { key: 'medium', label: '中', exp: 150, hint: '需要腾出半天、提前安排的事' },
  { key: 'heavy', label: '重', exp: 300, hint: '这一周的主线，别的都得给它让路' },
] as const;

export type WeeklyRewardTierKey = (typeof WEEKLY_REWARD_TIERS)[number]['key'];

// ---------------------------------------------------------------------------
// 3.6 每日任务的创建档位
// ---------------------------------------------------------------------------

/**
 * 玩家新建每日任务时可选的三档：40 / 80 / 160。
 *
 * 刻度锚在难度-经验带上（见 prompts/00-shared-context.md：难度1 ≈ 40~80，
 * 难度2 ≈ 100~180）：轻档对"顺手的小事"（难度1 下沿），中档对"每天腾出
 * 一点时间"（难度1 上沿），重档对"今天的头等大事"（难度2 中段）。
 * 周常三档（60/150/300）走难度 1→3，日常只走 1→2 —— 每天都要做的事，
 * 整条链应当比一次性的周常更轻；但一条日常走满一周（×7），总量会超过
 * 同档周常，日常的价值在坚持本身。
 *
 * 惩罚与周常同款（同一枚 dailyMissPenaltyMultiplier 旋钮，创建时定格进
 * DailyDefinition.penaltyExp），数值同样藏在档位后面，玩家改不动、也不用算。
 */
export const DAILY_REWARD_TIERS = [
  { key: 'light', label: '轻', exp: 40, hint: '顺手就能做完的小事，几分钟也算数' },
  { key: 'medium', label: '中', exp: 80, hint: '每天要专门腾出一点时间的事' },
  { key: 'heavy', label: '重', exp: 160, hint: '今天的头等大事，别的先给它让路' },
] as const;

export type DailyRewardTierKey = (typeof DAILY_REWARD_TIERS)[number]['key'];

// ---------------------------------------------------------------------------
// 3.7 自己动手的任务：手写一条时的创建档位
// ---------------------------------------------------------------------------

/**
 * 玩家手写一条任务时可选的三档：60 / 150 / 300，难度 1 / 2 / 3。
 *
 * 与周常三档取同值，但含义不同：周常的刻度是"这一周"，任务的刻度是
 * "这件事本身"。同值不是偷懒 —— 三档分别贴着难度-经验带的 d1 / d2 / d3
 * （40~80 / 100~180 / 250~400），两处量的本来就是同一把尺子。
 *
 * 手写的任务**直接进「进行中」**，不经过审核闸门（那道闸门防的是
 * "系统替你做决定"，玩家自己写的没有需要防的东西，见 CreateManualQuest）。
 * 所以三档也是玩家对自己诚实的一次选择：写多大，就是多大。
 */
export const QUEST_REWARD_TIERS = [
  { key: 'light', label: '轻', exp: 60, difficulty: 1, hint: '一两个晚上就能做完的一步' },
  { key: 'medium', label: '中', exp: 150, difficulty: 2, hint: '要花上几天、得在心里排一排的事' },
  { key: 'heavy', label: '重', exp: 300, difficulty: 3, hint: '这一阵子的头等大事，别的都得给它让路' },
] as const;

export type QuestRewardTierKey = (typeof QUEST_REWARD_TIERS)[number]['key'];

// ---------------------------------------------------------------------------
// 3b. 任务链的两枚额度旋钮（Phase 3）
//
// 它们是两种完全不同性质的上限，放在一起只是为了好找：
//
//   · REGENERATION —— **整链级**，终身 1 次。用在"这条链的方向整个不对"的时候。
//     之所以卡到 1，是因为它对玩家来说是一次"重抽"：抽第二次的快感
//     会立刻变成"那我多抽几次总能抽到想要的"，而这条链本来该做的事
//     就从"推进目标"变成了"刷任务"。
//
//   · REROUTE —— **链级总量**，默认 2 次。用在"这一条我做不到"的时候。
//     它不改变链的方向，只降低某一步的门槛，所以不需要卡到 1；
//     但它必须有上限，否则玩家会把整条链逐步削成一条平地 ——
//     而"平地"正是这个产品最不该提供的东西。
//
// 两枚旋钮都记在 `ChainReview` 上并**入存档**：额度是玩家与系统之间的约定，
// 不能靠内存计数（刷新一次就白送一次）。
// ---------------------------------------------------------------------------

/** 整条链一生可以重生成几次 */
export const CHAIN_REGENERATION_LIMIT = 1;

/** 一条链累计可以「换个做法」几次 */
export const REROUTE_CHAIN_LIMIT = 2;

/** 「换个做法」的微型输入框的长度上限（它是一次诉求，不是一篇复盘） */
export const REROUTE_REQUEST_MAX_LEN = 80;

// ---------------------------------------------------------------------------
// 4. 应用默认设置
// ---------------------------------------------------------------------------

export const DEFAULT_APP_SETTINGS: AppSettings = {
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN',

  /**
   * 一天的归属切换时刻：**次日 01:00**。
   *
   * 含义：00:30 打钩算作"昨天"的日常；01:00 之后打开 App 才触发跨天结算。
   * 为什么不是 00:00：0 点到 1 点之间还在收尾的人，不应该被判为漏打。
   * 为什么不是 4:00：那会把"熬夜到三点"变成一种系统默许的常态，
   * 而本产品的态度是——该睡的时候，系统也不假装现在是昨天。
   */
  dayRolloverHour: 1,

  onboarded: false,
  vignetteEnabled: true,
  sfxVolume: 0.6,
  rewardPolicy: DEFAULT_REWARD_POLICY,

  /** 隐藏目标的进度在 UI 上完全不可见。这是设计底线，默认开启 */
  evolutionTreeStrictHidden: true,
};

/** 深拷贝一份设置进新存档（避免存档与常量共享引用） */
export const createInitialSettings = (): AppSettings =>
  JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings;
