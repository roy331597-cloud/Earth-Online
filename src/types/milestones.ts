// ============================================================================
// EarthOnline · Phase 1 · 现实里程碑类型 (milestones.ts)
// 职责：真实世界事件（签证、出国旅行、论文接收……）的"特殊任务达成"记录
//
// 为什么单独一层、不复用 Quest 状态机：
//   Quest 描述"计划要做的事"（领取 → 执行 → 交卷），有完整的执行状态；
//   现实里程碑描述"已经发生的事"（发生 → 记录 → 发奖），没有执行过程，
//   也不经过 AI。玩家自己声明，系统按固定额度发放 EXP。
//
// 诚信约定：系统不验证真实性（也无法验证）。记录面板要求玩家自述一句
// "发生了什么"；造假唯一伤害的是玩家自己的进度曲线。
// ============================================================================

import type { AttributeKey, ClassIdLiteral, DateKey, ISODateTime } from './core';
import type { GoalIdLiteral } from './endgame';

/** 现实事件的四类（用于记录面板分组与配色） */
export type RealityMilestoneCategory = 'mobility' | 'academic' | 'capital' | 'life';

/** 现实里程碑的静态定义（放 catalog，不入存档） */
export interface RealityMilestoneDefinition {
  id: string;
  title: string;
  subtitle: string;
  category: RealityMilestoneCategory;
  /**
   * 固定 EXP 额度。设计上刻意"小"（80~500）——它是顺带记下的一笔，
   * 不是主要收入；涨的是"被看见了"的感觉，不是数值膨胀。
   */
  exp: number;
  /** 可选：少量属性点 */
  attributePoints?: Partial<Record<AttributeKey, number>>;
  /** 与哪些终极目标相关（记录后提示"这推进了 X"，展示用） */
  linkedGoalIds: GoalIdLiteral[];
  /** 记录时自动点亮的终极目标里程碑 id（对应 GoalMilestone.id，已点亮的不重复点） */
  grantsGoalMilestoneIds: string[];
  /** 是否可重复记录（如"每完成一段海外经历"） */
  repeatable: boolean;
  /**
   * 可重复记录时的最小间隔天数。
   * 不可重复时为 null；可重复但**不设冷却**时也为 null
   * （此时防刷交给 RewardPolicy.realityMilestoneMonthlyExpCap 月度上限）。
   */
  cooldownDays: number | null;
  /** 记录面板上的自述提示（例："哪一天、哪个口岸、飞去了哪"） */
  evidenceHint: string;
  iconKey: string;
}

/**
 * 快照：附在一条现实里程碑上的"当下的照片"。
 * 签证页、登机牌的一角、论文接收邮件里的那行字。
 * 效果：未来在成功日记 / 档案馆里，记录不再是一行冷冰冰的绿字，
 * 而是可以点开的绝版回忆。
 *
 * 存储约定（LocalStorage 容量有限，详见 README 附注）：
 *   - 照片必须**先经客户端压缩**再转 data URL 存入
 *     （长边 ≤ 1280、JPEG 质量 ≈ 0.72、单张 ≤ 300KB）；原图不落存档。
 *     这件事由 `lib/image.ts` 的 `compressImageFile` 执行，调用方不许自己
 *     拿 FileReader 读原图 —— 一张 4 MB 的原图能直接把存档顶爆。
 *   - 放不下的素材用 kind='link'（图床 / 云盘链接），存档里只留一行 URL。
 *
 * （与 Vault 的"净资产快照"同名不同物：那边是数值口径，这边是照片。）
 */
export interface MilestoneSnapshot {
  /** photo = 本地压缩后的 Base64 data URL；link = 外部链接 */
  kind: 'photo' | 'link';
  /** `data:image/jpeg;base64,...` 或 `https://...` —— 可直接渲染 */
  url: string;
  /** 一句话注脚（如"2027-03-14，广州，第 214 号窗口"） */
  caption: string | null;
  addedAt: ISODateTime;
}

/** 一条已发生的现实事件记录（入存档） */
export interface RealityMilestoneRecord {
  id: string;
  /**
   * 对应目录里的哪一条定义。
   *
   * `null` = **玩家自己写的一件事**（见 customTitle / customCategory）：
   * 目录是给人挑的，不是给人限的 —— 目录里没有的，不代表它不算数。
   * 这类记录没有冷却、没有"第 N 次"，也不点亮任何终极目标里程碑
   * （那些都由定义驱动，而它没有定义）。
   */
  definitionId: string | null;
  /**
   * 自己写的那件事的标题（`definitionId === null` 时才有值）。
   * 目录里的条目从定义取标题，自己写的那条，标题当然也是自己写的。
   */
  customTitle: string | null;
  /** 自己写的那条属于哪一类（目录里的从定义取，这里存玩家选的那一枚） */
  customCategory: RealityMilestoneCategory | null;
  /**
   * 事件实际发生的日期（玩家自述，可空——记不清具体日期时只留记录时间）。
   * 只影响时间轴/周报的归属，不影响发奖。
   */
  occurredOn: DateKey | null;
  /** 玩家写下这条记录的精确时间 */
  recordedAt: ISODateTime;
  /** 玩家自述（一句话：发生了什么） */
  note: string;
  /**
   * 快照：照片 / 链接（可在记录时附上，也可事后再补，当然也可以一件都不放）。
   * 见 MilestoneSnapshot 的存储约定。
   */
  snapshots: MilestoneSnapshot[];
  /** 实际发放的 EXP（发奖时按当月剩余额度计算并写死，可审计） */
  expGranted: number;
  /**
   * 这笔 EXP 记进了哪条职业线。
   *
   * 现实里程碑没有归属职业线 —— 它是"这个人"的事，不是"这条线"的事。
   * 但本项目的 EXP 只存在于 CareerTrack 上（没有全局经验池），所以必须选一条。
   * 选法是**目标对齐**：取 linkedGoalIds 重合最多的那条线（见 operations 的
   * `creditedTrackFor`），于是"第一笔自己赚来的钱"会记进资本线，
   * "论文接收"会记进学术线 —— 这个选择是解释得通的，也是可审计的。
   *
   * null = 这条记录来自 v3 之前的旧存档，当时还没有这个字段。
   */
  creditedClassId: ClassIdLiteral | null;
  /** 实际点亮的终极目标里程碑 id */
  goalMilestoneIds: string[];
}

export interface MilestonesState {
  records: RealityMilestoneRecord[];
  /** definitionId → 累计次数 / 最近一次记录时间（用于冷却与"第 N 次"文案） */
  counters: Record<string, { count: number; lastRecordedAt: ISODateTime }>;
  /** 'YYYY-MM' → 该月已发放的 EXP（对照 RewardPolicy.realityMilestoneMonthlyExpCap） */
  monthlyExpGranted: Record<string, number>;
  /** 玩家是否已知晓"现实事件可以记录"（首次引导用） */
  introducedToPlayer: boolean;
}
