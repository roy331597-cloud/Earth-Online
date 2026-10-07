// ============================================================================
// EarthOnline · Mock Forge（**明确临时的替身**）
//
// 真身是 Phase 4 的两段式调用：
//   Dispatcher（10-dispatcher.md）→ 选职业线
//   Class Agent（20~23-class-*.md）→ 出 QuestDraft[]
//   Chain Reviewer（50-chain-reviewer.md）→ 只在勾选「深度推演」时介入
//   （契约见 types/agents.ts 的 ClassAgentOutput / ChainReviewOutput）
//
// 本文件让 Spark Box 在没有 API Key 的情况下走完整条链路。它刻意**不自己写文案**：
// 草稿一律从 `catalog/classes.ts` 的 `seedQuests` 里取 ——
// 那是给 Agent 的 few-shot 范例，也是这个产品的内容质量基线。
// 替身自己编文案的话，Phase 4 一换成真身，玩家会觉得"换了个游戏"。
//
//   排掉玩家已有的（按标题）→ 从该职业线的种子里取 2~3 条 → 串成一条链
//
// 🔻 Phase 4 接入后，**整个文件删除**，调用点换成真实 API。
// ============================================================================

import { CLASSES, getClass } from '@/data/catalog/classes';
import type { ClassIdLiteral, QuestDraft } from '@/types';

/**
 * 灵感 → 职业线的关键词路由（Dispatcher 的极简替身）。
 *
 * 顺序有意义：先匹到的先赢，所以把"更具体"的词放在前面。
 * 一个词都没匹到就落到计算生物学 —— 不是因为它最像，
 * 而是因为它的种子里"把问题写清楚"这类元任务最多，对模糊输入的容忍度最高。
 */
const ROUTES: Array<{ classId: ClassIdLiteral; keys: string[] }> = [
  {
    classId: 'computational_biology',
    keys: ['论文', '文献', '科研', '研究', '数据', '组学', '测序', '模型', '实验', '复现', '生信', 'biology', 'lab'],
  },
  {
    classId: 'investor',
    keys: ['投资', '理财', '仓位', '交易', '钱', '资产', '基金', '风险', '复利', '财务', '资产配置'],
  },
  {
    classId: 'social_media_influencer',
    keys: ['写作', '内容', '账号', '视频', '创作', '发布', '粉丝', '表达', '输出', '公众号', '小红书'],
  },
  {
    classId: 'startup_entrepreneur',
    keys: ['创业', '产品', '用户', '商业', '变现', '公司', '项目', '客户', '副业', '接单'],
  },
];

export const routeClass = (idea: string): ClassIdLiteral => {
  for (const route of ROUTES) {
    if (route.keys.some((k) => idea.includes(k))) return route.classId;
  }
  return 'computational_biology';
};

export interface ForgeInput {
  idea: string;
  /** 定向职业线；null = 交给 routeClass 判断 */
  classId: ClassIdLiteral | null;
  deepDeliberation: boolean;
  /** 玩家已有任务的标题。替身据此避开重复出题 */
  existingTitles: string[];
}

export interface ForgeOutput {
  classId: ClassIdLiteral;
  chainTitle: string;
  rationale: string;
  drafts: QuestDraft[];
  /** 勾了「深度推演」才有；对应 Agent B 的 reviewerNote */
  reviewerNote: string | null;
}

/** 一条链最少/最多的任务数（产品口径，见指令："2~3 个任务"） */
const MIN_DRAFTS = 2;
const MAX_DRAFTS = 3;

/** 截断到 n 个字符，超出补省略号 */
const clip = (text: string, n: number): string => {
  const t = text.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
};

/**
 * 把灵感铸成一条链的草稿。
 *
 * 关于"排掉已有的"：真实的 Class Agent 会拿到玩家当前的存档摘要
 * （见 00-shared-context.md），本来就不该重复出玩家已经在做的题。
 * 替身用标题做这个判断 —— 糙，但方向是对的。
 */
export const mockForge = (input: ForgeInput): ForgeOutput => {
  const classId = input.classId ?? routeClass(input.idea);
  const entry = getClass(classId);
  const asked = new Set(input.existingTitles);

  // 优先取没出过的；不够 MIN_DRAFTS 时，把出过的补回来 ——
  // 宁可重复，也不要给玩家一条只有一步的"链"（那就不叫链了）
  const fresh = entry?.seedQuests.filter((s) => !asked.has(s.title)) ?? [];
  const used = entry?.seedQuests.filter((s) => asked.has(s.title)) ?? [];
  const drafts = [...fresh, ...used].slice(0, MAX_DRAFTS);

  if (drafts.length < MIN_DRAFTS) {
    // 目录里种子不够（理论上不会发生：四条职业线各 2~3 条）
    throw new Error(`[mockForge] ${classId} 的种子任务不足，无法成链`);
  }

  // 链内的顺序即执行顺序：把前置改写成"上一条"，让它们真的串起来。
  // 种子里原本的 prerequisiteTempIds 是给初始存档用的（多为空），
  // 这里要的是一条首尾相接的链，所以重写成线性依赖。
  const chained: QuestDraft[] = drafts.map((d, i) => ({
    ...d,
    prerequisiteTempIds: i === 0 ? [] : [drafts[i - 1]!.tempId],
  }));

  // 链标题取玩家自己的话，而不是职业线名 ——
  // 「Computational Biology · 从想法到作品」是一句产品文案，
  // 「想让问题变得更具体」才是这个人刚才真的想做的事。
  const chainTitle = clip(input.idea, 14) || (entry ? `${entry.displayName} 入门` : '新的一条链');

  return {
    classId,
    chainTitle,
    rationale: entry
      ? `${entry.creed} 这一串从「${chained[0]!.title}」起步，每一步的产出都是下一步的原料。`
      : '这一串从最小的一步开始，每一步的产出都是下一步的原料。',
    drafts: chained,
    reviewerNote: input.deepDeliberation
      ? `深度推演已过审：把「${chained[0]!.title}」放在第一步是对的 —— 它不需要任何前置条件就能开始。` +
        `末一步的难度最高（${chained[chained.length - 1]!.difficulty} 星），如果第一步做完觉得吃力，` +
        `可以先停在链的中段，不必一次吃完。`
      : null,
  };
};

/** 供界面上展示"会被路由到哪条线"用（玩家写下灵感时实时提示） */
export const previewRoute = (idea: string): { classId: ClassIdLiteral; displayName: string } => {
  const classId = routeClass(idea);
  return { classId, displayName: CLASSES.find((c) => c.classId === classId)?.displayName ?? classId };
};
