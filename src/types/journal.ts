// ============================================================================
// EarthOnline · Phase 1 · 成功日记类型 (journal.ts)
// 职责：复盘心得的永久归档 + Arbiter 判定结果
//
// 设计立场：Success Journal 不是"待办完成记录"，而是"我在哪一刻变强了"的证据集。
// 因此它必须可导出、可回溯、且保留当时的原始心绪（不被后续编辑改写）。
// ============================================================================

import type {
  AgentId,
  ClassIdLiteral,
  DateKey,
  ISODateTime,
  JournalId,
  QuestId,
} from './core';

/**
 * Arbiter 的判定档位。数量少、区分度高，避免玩家陷入"我在被评分"的焦虑。
 *
 * `baseline` 具有特殊语义：它是"未通过加成资格线"的档位（套话 / 复述 / 无具体信息），
 * bonusPct 一律为 0。加成是两步判定：**先判"是否加成"（baseline 即否），
 * 再按难度档位定"加成多少"**。
 */
export type ReflectionQuality = 'baseline' | 'solid' | 'sharp' | 'revelatory';

/** Arbiter 输出的单条洞见，作为长期记忆的原子单位 */
export interface JournalInsight {
  /** 一句话洞见 */
  text: string;
  /** 归类，便于 Phase 5 做主题聚类 */
  kind:
    | 'method'        // 方法层面（怎么做更省力）
    | 'mindset'       // 心态层面
    | 'pattern'       // 发现的自身规律
    | 'risk'          // 识别到的风险/坑
    | 'relationship'  // 人际相关
    | 'capital'        // 金钱/资源配置
    | 'other';
}

/** 情绪标注。用于"我这周的底色是什么颜色"这种轻量可视化 */
export type EmotionTag =
  | 'calm' | 'driven' | 'doubtful' | 'proud' | 'tired'
  | 'curious' | 'anxious' | 'grateful' | 'lonely' | 'clear';

/**
 * Arbiter 判定结果（契约见 agents.ts 的 ArbiterVerdict）。
 * 本类型是"被采纳并落库"后的形态：bonusPct 已被客户端 clamp。
 */
export interface ReflectionVerdict {
  quality: ReflectionQuality;
  /**
   * 最终生效的加成百分比。
   * 已按「任务难度档位 + 质量档位」对齐到 RewardPolicy.reflectionBonusBands 的对应区间
   * （例如难度 5 的 revelatory 为 20%；档位为 baseline 时一律为 0%——不加成）。
   */
  bonusPct: number;
  /** 发放给玩家看的一句话点评（要求：沉稳、具体、不吹捧） */
  comment: string;
  /** 抽出的洞见，进 Success Journal */
  insights: JournalInsight[];
  /**
   * 静默里程碑标签 —— 隐藏目标的唯一数据来源。
   * ⚠️ UI 层禁止读取此字段（用 lint 规则或独立 selector 隔离）。
   */
  milestoneTags: string[];
  /** Arbiter 建议的后续动作（玩家可选择一键建为草稿任务） */
  suggestedFollowUps: Array<{ title: string; rationale: string }>;
}

/**
 * 成功日记条目。一条 = 一次带有复盘的结算。
 *
 * 不可变性约定：entryText 在写入后**永远不被覆盖**。
 * 玩家若想补充，追加到 addenda，保留"当时的我"的原始笔迹。
 */
export interface JournalEntry {
  id: JournalId;
  questId: QuestId;
  questTitle: string;
  classId: ClassIdLiteral | null;
  /** 玩家写下的原始复盘文字 */
  entryText: string;
  /** 后续追加的补记 */
  addenda: Array<{ text: string; ts: ISODateTime }>;
  /** Arbiter 判定 */
  verdict: ReflectionVerdict | null;
  /** 若 Arbiter 调用失败，降级为"仅基础奖励"，此处标记 */
  arbiterFailed: boolean;
  emotions: EmotionTag[];
  /** 玩家自评难度（1-5），用于校准 AI 的 difficulty 估计 */
  selfRatedDifficulty: number | null;
  /** 关联属性成长 */
  attributeKeys: string[];
  localDate: DateKey;
  createdAt: ISODateTime;
  /** 是否被玩家标记为"值得回看" */
  starred: boolean;
  /** 是否已被用于构建 AI 长期记忆摘要 */
  consumedByMemoryDigest: boolean;
}

export interface JournalState {
  entries: JournalEntry[];
  /** 月度摘要（由 AI 生成，Phase 4 接入；Phase 1 先留字段） */
  monthlyDigests: Array<{
    month: string;            // 'YYYY-MM'
    summary: string;
    dominantEmotions: EmotionTag[];
    topInsights: string[];
    generatedAt: ISODateTime;
    agentId: AgentId | null;
  }>;
  /** 累计统计 */
  stats: {
    totalEntries: number;
    totalReflectionWords: number;
    /** 因复盘获得的额外 EXP 总额 */
    totalBonusExp: number;
    /** 平均加成百分比，反映"复盘质量是否在提升" */
    averageBonusPct: number;
    currentWritingStreakDays: number;
    bestWritingStreakDays: number;
  };
}
