// ============================================================================
// EarthOnline · Mock Arbiter（**明确临时的替身**）
//
// 真实 Arbiter 是 Phase 4 的 DeepSeek 调用（契约见 types/agents.ts 的
// ArbiterVerdictPayload 与 ai/prompts/40-arbiter.md）。
// 本文件只是让结算面板在没有 API Key 的情况下**能走完整条链路**：
//
//   写复盘 → 出判定 → 对齐加成 → 落成功日记 → 静默里程碑入库
//
// 因此它必须遵守与真身同样的两条硬约束，否则 Phase 4 一换就会"行为突变"：
//   ① `milestoneTags` 只能从 MILESTONE_TAG_VOCABULARY 里取，不得自创；
//   ② `bonusPct` 只是"建议值" —— 真身给什么数都过不了 alignBonusPct 这道闸门。
//      替身干脆直接从 policy 的档位规范值反推，于是它与闸门的结论必然一致，
//      界面上"预计加成 N%"和实际入账的 N% 也就不可能对不上。
//
// 🔻 Phase 4 接入后，**整个文件删除**，调用点换成真实 API。
// ============================================================================

import { MILESTONE_TAG_VOCABULARY } from '@/data/catalog/endgame';
import { bonusBandFor, bonusForQuality } from '@/data/catalog/policy';
import type { ArbiterVerdictPayload, Difficulty, EmotionTag, JournalInsight } from '@/types';

// ---------------------------------------------------------------------------
// 语料
// ---------------------------------------------------------------------------

/** 一句话点评池：沉稳、具体、不吹捧，也不安慰 */
const COMMENTS = [
  '你写下的不是「完成了」，而是「哪里卡住了」—— 后者才是能复用的那部分。',
  '这段记录里有具体的判断依据，而不是笼统的感想。三个月后它仍然有用。',
  '你没有停在结果上，而是往回找了原因。这是把一次经历变成方法的分界线。',
];

/** 关键词 → 里程碑标签。命中即认为该标签"真实匹配"（真身由 LLM 判断） */
const TAG_RULES: Array<{ tag: string; keys: string[] }> = [
  { tag: 'reproducibility', keys: ['复现', '重现', '跑通', '对不上', '差异', '原文'] },
  { tag: 'literature', keys: ['文献', '论文', '补充材料', '方法部分', '摘要'] },
  { tag: 'pipeline', keys: ['流水线', '脚本', '自动化', '批处理', '流程'] },
  { tag: 'engineering', keys: ['docker', 'Docker', '容器', 'ci', 'CI', '文档', '部署'] },
  { tag: 'omics', keys: ['组学', '测序', '表达矩阵', 'TPM', 'count', '基因'] },
  { tag: 'modeling', keys: ['模型', '训练', '预测', '推理'] },
  { tag: 'validation', keys: ['验证', '独立数据', '复算', '第三方'] },
  { tag: 'research_question', keys: ['问题', '假设', '想知道'] },
  { tag: 'measurement', keys: ['测量', '指标', '净值', '记录下'] },
  { tag: 'failure_mode', keys: ['失败', '踩坑', '失效', '做错', '亏'] },
];

/** 关键词 → 情绪。只做粗匹配，用途是让日记条目带上"底色"而不是空数组 */
const EMOTION_RULES: Array<{ tag: EmotionTag; keys: string[] }> = [
  { tag: 'tired', keys: ['累', '困', '熬夜', '疲'] },
  { tag: 'clear', keys: ['清楚', '明白', '搞懂', '通了', '想通'] },
  { tag: 'curious', keys: ['好奇', '想知道', '为什么'] },
  { tag: 'proud', keys: ['终于', '搞定', '做到了'] },
  { tag: 'doubtful', keys: ['不确定', '怀疑', '也许'] },
  { tag: 'anxious', keys: ['焦虑', '担心', '害怕', '来不及'] },
  { tag: 'calm', keys: ['平静', '安静', '慢慢'] },
  { tag: 'driven', keys: ['下一步', '继续', '打算'] },
];

/** 合法的里程碑标签白名单。真身被 prompt 约束，替身靠这行代码约束。 */
const LEGAL_TAGS = new Set(MILESTONE_TAG_VOCABULARY.map((v) => v.tag));

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** djb2。用途只有一个：让同一段文字永远得到同一个点评，而不是每次重渲染都换一句 */
const hash = (text: string): number => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const sentences = (text: string): string[] =>
  text
    .split(/[。！？；\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export interface MockArbiterInput {
  reflection: string;
  questTitle: string;
  difficulty: Difficulty;
  /** 复盘字数下限，来自 settings.rewardPolicy.reflectionWordCountFloor */
  floorChars: number;
}

/**
 * 替身判定的规则（两步判定的第一步落在这里）：
 *   - 字数 < 下限 → `solid`（过了清淡线，但没到"有洞见"）
 *   - 字数 ≥ 下限 → `sharp`
 * `revelatory` 刻意不给：那是"重构了我对某件事的理解"，替身没资格判。
 */
export const mockArbiter = (input: MockArbiterInput): ArbiterVerdictPayload => {
  const text = input.reflection.trim();
  const chars = text.replace(/\s/g, '').length;
  const longEnough = chars >= input.floorChars;

  const quality = longEnough ? ('sharp' as const) : ('solid' as const);

  /**
   * 建议值直接取**该难度、该档位的规范值**，而不是写一个固定的 8。
   *
   * 写死 8 在难度 1/2/3 上碰巧是对的（sharp 档规范值分别是 8/8/9，
   * 而 alignBonusPct 允许 ±1 的偏差），但它依赖的是容差而不是规则：
   * 换一个难度、或者 policy 里调整了区间，这个 8 就会当场变成"提示 8%、实发 10%"。
   * 从 policy 推导则永远不会漂 —— 替身与真身之间也不再有暗中的算术分歧。
   */
  const bonusPct = bonusForQuality(quality, bonusBandFor(input.difficulty));

  const matched = TAG_RULES.filter((r) => r.keys.some((k) => text.includes(k)))
    .map((r) => r.tag)
    .filter((tag) => LEGAL_TAGS.has(tag))
    .slice(0, 3);

  const parts = sentences(text);
  const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), '');

  const insights: JournalInsight[] = [];
  if (longest) {
    insights.push({
      text: `你写到「${clip(longest, 30)}」—— 这句话本身就是一个可复用的判断。`,
      kind: 'method',
    });
  }
  if (parts.length > 1) {
    insights.push({
      text: '这段记录里既有事件也有归因，两者分开写是让它以后还能被读懂的关键。',
      kind: 'pattern',
    });
  }

  const emotions = EMOTION_RULES.filter((r) => r.keys.some((k) => text.includes(k)))
    .map((r) => r.tag)
    .slice(0, 2);

  return {
    quality,
    bonusPct,
    comment: COMMENTS[hash(text) % COMMENTS.length] ?? COMMENTS[0]!,
    insights,
    milestoneTags: matched,
    milestoneConfidence: matched.map((tag, i) => ({ tag, confidence: [0.82, 0.7, 0.58][i] ?? 0.58 })),
    emotions,
    detectedFluff: !longEnough,
    suggestedFollowUps: longest
      ? [
          {
            title: `把「${clip(longest, 18)}」变成一个可复用的步骤`,
            rationale: '能被写成一个步骤的东西，下次就不必重新想一遍。',
          },
        ]
      : [],
  };
};

/**
 * 把 Arbiter 的输出装成 `CompleteQuest` 的入参。
 *
 * 注意 `bonusPct` 在这里只是**建议值**：真正的数值由 completeQuest 内部的
 * `alignBonusPct(建议值, 档位, 难度)` 决定。替身与真身走的是同一条闸门。
 */
export const toTurnInInput = (
  payload: ArbiterVerdictPayload,
  reflection: string,
): { reflection: string; bonusPct: number; bonusReason: string | null; verdict: unknown } => ({
  reflection,
  bonusPct: payload.bonusPct,
  bonusReason: payload.comment,
  verdict: payload,
});

/** 结算面板上的"预计加成"预览。与真身同一套策略，不会出现"提示 8% 实际给 6%" */
export const previewQuality = (chars: number, floorChars: number): 'solid' | 'sharp' =>
  chars >= floorChars ? 'sharp' : 'solid';
