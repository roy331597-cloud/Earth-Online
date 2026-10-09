// ============================================================================
// EarthOnline · Phase 7 · 开局定标类型 (diagnostics.ts)
// 职责：定标流程的持久化形状 —— 目标、考卷、作答、基线，以及档案容器
//
// 为什么整卷要进存档（而不是只活在组件 state 里）：
//   定标是一条"玩家写目标 → 定标师出题 → 玩家作答 → 判分写基线"的长流程，
//   中间隔着一次 AI 调用和一段真人写字的时间。任何一步刷新页面，
//   如果卷子只活在内存里，玩家就得从"重写目标"开始 —— 那是对已经付出的
//   诚实劳动的丢弃。先例：TurnInSheet 的 turn_in_pending（结算中间态同样入库）。
//
// 内容观点取材自《人生进阶指南》(github byoungd/up)，CC BY-NC 4.0，
// 个人非商用工具内引用。
// ============================================================================

import type { ChainId, ISODateTime } from './core';

/** 定标档案在 history 里的环形上限（与其它历史记录同哲学：留近况，不无限长） */
export const DIAGNOSTICS_HISTORY_CAP = 20;

export interface DiagnosticsState {
  /** 正在走的那一次定标。null = 没有进行中的定标；刷新后从这里恢复卷面。 */
  active: DiagnosticRecord | null;
  /** 已结束的定标档案（完成 + 放弃），按结束顺序追加，超出上限裁最旧 */
  history: DiagnosticRecord[];
}

/** 定标记录的状态机：出题之后等待作答 → 完成；任意阶段可放弃。 */
export type DiagnosticStatus = 'awaiting_answers' | 'completed' | 'cancelled';

export interface DiagnosticQuestion {
  id: string;
  /**
   * open：开放题（textarea 作答，接住只有玩家自己知道的处境）
   * choice：选择题（候选 Chip 单选，给出可互相比较的水准锚点）
   *
   * 混合是刻意的（PO 裁定）：光靠选择测不出"你实际怎么说这句话"，
   * 光靠开放没有统一刻度可比 —— 两种题各自承担一半。
   */
  kind: 'open' | 'choice';
  prompt: string;
  /** kind === 'choice' 时的候选项；开放题恒为空数组（纯 JSON，不用 undefined） */
  options: string[];
}

/** 一条作答。questionId 指回 DiagnosticQuestion.id。 */
export interface DiagnosticAnswer {
  questionId: string;
  /** 玩家写的原文 / 选中的选项文本 —— **不做任何归一化**，原样入库 */
  text: string;
}

/** 基线里的一个维度（词汇 / 听力 / 口语 …）。score 为 0~100 的整数。 */
export interface DiagnosticDimension {
  key: string;
  label: string;
  score: number;
}

/**
 * 基线 —— 判分阶段的产物，也是这条线的"出发点读数"。
 *
 * 它不是评分报告：没有总分、没有及格线。它只是把"你现在在哪"
 * 写成一段可回看的话 + 几个可比较的维度，好让后续所有任务
 * 有资格说"这比基线高了"。
 */
export interface DiagnosticBaseline {
  /** 一句话水准判断，如「能读懂，但说不出成段的英文」 */
  levelLabel: string;
  /** 两三句展开 —— 基线卡上正文字号的那段 */
  summary: string;
  dimensions: DiagnosticDimension[];
  /** 已经成立的能力，0~4 条（会印在基线卡上，先说有的） */
  strengths: string[];
  /** 尚未成立 / 最挡路的短板，0~4 条（铸链的 idea 会把它们带上） */
  gaps: string[];
}

/** 适配后的考卷（ai/adapters 的产物，落库前的形状）。 */
export interface DiagnosticSheet {
  /** 定标师把目标改写成"可被测量的一句话" */
  goalReframed: string;
  /**
   * 定标师建议的归属线（开放集合，**只是建议**）。
   * 展示在基线卡上供玩家参考；铸链走 forgeChain 时 classId 仍传 null，
   * 由调度员独立裁定 —— 建议与决定分开，和 draft 审核同一条哲学。
   */
  suggestedClassIds: string[];
  questions: DiagnosticQuestion[];
}

/** 一次定标的完整记录。 */
export interface DiagnosticRecord {
  id: string;
  createdAt: ISODateTime;
  status: DiagnosticStatus;
  /** 玩家写下的目标原话 —— 一字不改。基线卡与收官都会把这句话还给他。 */
  goalRaw: string;
  goalReframed: string;
  suggestedClassIds: string[];
  questions: DiagnosticQuestion[];
  /** 已提交的作答；未交卷时为空数组 */
  answers: DiagnosticAnswer[];
  /** 判分产物；未判分时为 null */
  baseline: DiagnosticBaseline | null;
  /** 铸出的链 id（判分 → 铸链后回填）；未铸出为 null */
  chainId: ChainId | null;
  cancelledAt: ISODateTime | null;
}
