// ============================================================================
// EarthOnline · Prompt 运行时组装器
//
// 职责：把「共享上下文 + 角色提示词 + 动态状态摘要」拼成最终 system prompt。
//
// 设计要点：
//   1. 提示词以 .md 原文加载（Vite `?raw`），便于直接编辑与版本管理，
//      不需要把长文本塞进 TS 字符串里转义。
//   2. 动态上下文以「结构化摘要」注入，而非倾倒整个存档 —— 控 token 的同时，
//      避免把玩家的私人数据（如联系人详情、金库明细）无差别地送进每一次调用。
//   3. **白名单注入**：每个 Agent 只拿到它需要的字段（见 AgentProfile.contextInjection）。
// ============================================================================

import type { AgentKind, PromptContextDigest, AgentRuntimeConfig } from '../../types/agents';
import { DEFAULT_AGENT_RUNTIME } from '../schemas';

// ---------------------------------------------------------------------------
// 1. 提示词加载
// ---------------------------------------------------------------------------

import sharedContext from './00-shared-context.md?raw';
import dispatcherPrompt from './10-dispatcher.md?raw';
import classComputationalBiology from './20-class-computational-biology.md?raw';
import classInvestor from './21-class-investor.md?raw';
import classInfluencer from './22-class-influencer.md?raw';
import classEntrepreneur from './23-class-entrepreneur.md?raw';
import blueprintGenerator from './24-class-blueprint-generator.md?raw';
import classEnglish from './25-class-english.md?raw';
import networkAdvisor from './30-network-advisor.md?raw';
import arbiterPrompt from './40-arbiter.md?raw';
import chainReviewer from './50-chain-reviewer.md?raw';
import reroutePrompt from './60-reroute.md?raw';
import diagnosticianPrompt from './70-diagnostician.md?raw';

export const SHARED_CONTEXT = sharedContext;

/** 内置职业线的提示词映射。新职业线的 prompt 由 Blueprint Generator 生成后存库。 */
export const CLASS_PROMPT_REF: Record<string, string> = {
  computational_biology: classComputationalBiology,
  investor: classInvestor,
  social_media_influencer: classInfluencer,
  startup_entrepreneur: classEntrepreneur,
  english_learner: classEnglish,
};

/**
 * 「换个做法」的重写提示词。
 *
 * ⚠️ 它**不在** `ROLE_PROMPTS` 里，也不在 `PROMPT_FILE_MAP` 里：
 *    那两张表都以 `AgentKind` 为键，而改法不是一个新的 Agent 种类 ——
 *    它是**某条职业线的人被叫回来重写自己写过的一步**（见 ai/thunks.ts 的 `reroute`）。
 *    所以它按名字取用，而不是按种类。
 */
export const REROUTE_PROMPT = reroutePrompt;

export const ROLE_PROMPTS = {
  dispatcher: dispatcherPrompt,
  blueprints: blueprintGenerator,
  network_advisor: networkAdvisor,
  arbiter: arbiterPrompt,
  chain_reviewer: chainReviewer,
  /**
   * 定标师两段式共用这一份角色提示词：
   * 出题段不传 schemaName（默认 diagnosticSheet），判分段的调用显式
   * `schemaName: 'diagnosticVerdict'` 覆盖 —— 见 SCHEMA_NAME_BY_KIND 的注释。
   */
  diagnostician: diagnosticianPrompt,
} as const;

/** 供 Agent 注册表的 systemPromptRef 使用（相对 src/ai/prompts/） */
export const PROMPT_FILE_MAP: Record<AgentKind, string[]> = {
  dispatcher: ['10-dispatcher.md'],
  class: [
    '20-class-computational-biology.md',
    '21-class-investor.md',
    '22-class-influencer.md',
    '23-class-entrepreneur.md',
    '25-class-english.md',
  ],
  blueprints: ['24-class-blueprint-generator.md'],
  network_advisor: ['30-network-advisor.md'],
  arbiter: ['40-arbiter.md'],
  chain_reviewer: ['50-chain-reviewer.md'],
  diagnostician: ['70-diagnostician.md'],
};

// ---------------------------------------------------------------------------
// 2. 动态上下文摘要渲染
// ---------------------------------------------------------------------------

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * 把结构化摘要渲染为紧凑的 markdown 块。
 * 目标长度：> 200 字符且 < 800 字符。宁可少写，不要塞满。
 */
export function renderContextDigest(d: PromptContextDigest): string {
  const lines: string[] = [];

  lines.push('## 当前玩家状态');
  lines.push(
    `- 代号：${d.player.handle} ｜ 综合等级：Lv.${d.player.level} ｜ 当前精力：${d.player.energy}`,
  );
  lines.push(
    `- 六维：体魄${d.player.attributes.vit} 智识${d.player.attributes.int} 心力${d.player.attributes.foc} ` +
      `魅力${d.player.attributes.cha} 意志${d.player.attributes.wil} 财商${d.player.attributes.cap}`,
  );
  lines.push(`- 时段：${d.timeOfDay}`);

  lines.push('');
  lines.push('## 当前篇章');
  lines.push(`- ${d.chapter.title} · ${d.chapter.subtitle}`);
  lines.push(`- 主题：${d.chapter.theme}`);
  lines.push(`- 情绪基调（你的文案必须贴合）：${d.chapter.emotionalTone}`);
  if (d.chapter.parallelChapterTitles.length) {
    lines.push(
      `- 并行支线（他同时在推进多段路，不要把他锁死在单一阶段）：` +
        d.chapter.parallelChapterTitles.join('、'),
    );
  }

  if (d.endgameGoals.length) {
    lines.push('');
    lines.push('## 终极目标进度');
    for (const g of d.endgameGoals) {
      lines.push(`- ${g.title}：${pct(g.progressPct)}`);
    }
  }

  lines.push('');
  lines.push('## 当前职业线');
  lines.push(
    d.activeCareer.classId
      ? `- ${d.activeCareer.displayName} ｜ Lv.${d.activeCareer.level} ｜ 头衔：${d.activeCareer.title}`
      : '- 尚未确立职业线',
  );

  if (d.activeQuests.length) {
    lines.push('');
    lines.push('## 进行中的任务（避免重复生成）');
    for (const q of d.activeQuests.slice(0, 6)) {
      lines.push(`- [${q.status}] ${q.title}（难度 ${q.difficulty}）`);
    }
  }

  if (d.recentJournal.length) {
    lines.push('');
    lines.push('## 近期复盘洞见（延续他的关注点）');
    for (const j of d.recentJournal.slice(0, 3)) {
      lines.push(`- 《${j.questTitle}》+${j.bonusPct}%：${j.excerpt}`);
    }
  }

  if (d.vaultSummary) {
    lines.push('');
    lines.push('## 金库量级');
    lines.push(`- 净资产：${d.vaultSummary.netWorthLabel}`);
    lines.push('- 注意：仅可用于判断任务的资源前提，不得据此给出任何投资建议。');
  }

  if (d.networkSummary) {
    lines.push('');
    lines.push('## 关系网概况');
    // 只报人数，不报"谁该联系了"：关系的位置由玩家自己定（卡片上的「关系等级」），
    // 我们不替他惦记、也不推着他去联系谁。
    lines.push(`- 联系人 ${d.networkSummary.totalContacts} 位`);
  }

  if (d.mockMode) {
    lines.push('');
    lines.push('## 运行模式');
    lines.push('- 当前为离线兜底模式，输出会被本地模板替换。请仍然严格按契约返回 JSON。');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. System Prompt 组装
// ---------------------------------------------------------------------------

export interface BuildSystemPromptOptions {
  /** 角色提示词正文 */
  rolePrompt: string;
  /** 动态上下文摘要；不传则跳过注入 */
  digest?: PromptContextDigest | null;
  /**
   * 新铸造的职业线（由 Blueprint Generator 生产），
   * 会追加在角色提示词之后。此时 rolePrompt 可传空字符串。
   */
  generatedBody?: string | null;
  /** 是否附加"只输出 JSON"的收尾约束（默认 true） */
  appendJsonReminder?: boolean;
}

/**
 * 组装最终 system prompt。
 *
 * 结构：
 *   [共享上下文]
 *   ---
 *   [角色提示词 / 动态生成的职业提示词]
 *   ---
 *   [当前玩家状态摘要]
 *   ---
 *   [JSON 收尾约束]
 */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const parts: string[] = [SHARED_CONTEXT];

  const role = opts.generatedBody ?? opts.rolePrompt;
  if (role) parts.push(role);

  if (opts.digest) parts.push(renderContextDigest(opts.digest));

  if (opts.appendJsonReminder !== false) {
    parts.push(
      [
        '---',
        '',
        '## 最后提醒',
        '',
        '你的回复必须是**一个合法的 JSON 对象**，且仅此而已。',
        '不要 markdown 围栏，不要解释，不要在 JSON 前后添加任何字符。',
        '所有字符串值中的引号需正确转义。缺失的可选字段用 `null`。',
      ].join('\n'),
    );
  }

  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// 4. 便捷构造：按 Agent 种类取默认运行时参数
// ---------------------------------------------------------------------------

export function runtimeFor(kind: AgentKind, overrides?: Partial<AgentRuntimeConfig>): AgentRuntimeConfig {
  const preset = DEFAULT_AGENT_RUNTIME[kind];
  return {
    model: 'deepseek-flash',
    temperature: preset.temperature,
    topP: preset.topP,
    maxTokens: preset.maxTokens,
    jsonMode: true,
    timeoutMs: 60_000,
    maxRetries: 2,
    ...overrides,
  };
}

/**
 * 各 Agent 的输出 schema 名映射（与 src/ai/schemas.ts 的 SCHEMAS 键一一对应）。
 * Phase 4 的调用器用它做校验。
 */
export const SCHEMA_NAME_BY_KIND = {
  dispatcher: 'dispatcherDecision',
  class: 'classAgentOutput',
  chain_reviewer: 'chainReviewOutput',
  network_advisor: 'networkAdviceOutput',
  arbiter: 'arbiterVerdict',
  blueprints: 'blueprintOutput',
  // 定标师两段式的**默认**输出：出题。判分那一段在调用时以
  // schemaName: 'diagnosticVerdict' 显式覆盖（与 rerouteDraft 同一手法）。
  diagnostician: 'diagnosticSheet',
} as const;
