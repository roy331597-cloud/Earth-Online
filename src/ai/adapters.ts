// ============================================================================
// EarthOnline · Phase 4 · 契约适配层 (adapters)
//
// 这一层只做一件事：**把模型给的东西擦干净，再交给纯函数。**
//
// ---------------------------------------------------------------------------
// 为什么 `validate.ts` 还不够
// ---------------------------------------------------------------------------
// `bus.ts` 已经做过一次硬校验了 —— 字段在不在、类型对不对、数值在不在界内。
// 但那一步只回答"**形状**对不对"，不回答"**内容**是不是真的"。
// 下面这些错误全部能通过 JSON Schema，却会让存档出问题：
//
//   · 模型说 `primaryClass: "quantum_chef"` —— 结构合法（它只是个字符串），
//     但职业目录里没有这条线，`buildQuests` 会铸出一批 classId 指不到任何
//     职业卡的任务，玩家点开是空白。
//   · 模型把三条草稿的 `tempId` 全写成 `"quest_1"` —— 结构合法，
//     但 `mintQuestIds` 是 Map，后一条会顶掉前一条，于是两条任务**共用一个 id**，
//     而 `quests.order` 是按 id 索引的。
//   · 模型把 46 个封闭词表外的 `milestoneTags` 塞进来（比如自创 `"excellent"`）——
//     结构合法（它就是个字符串数组），但静默通道会记下一批永远点不亮的标签，
//     而这条通道**在界面上完全不可见**，错了没人看得见。
//   · 模型推荐联系人时编一个 `contactId` —— 结构合法（字符串），
//     玩家点过去会看到一个不存在的人。
//
// 这些是**语义校验**，只能在这一层做，因为只有这一层知道"职业目录有哪些线"
// "通讯录里有谁""哪 44 个标签是合法的"。
//
// ---------------------------------------------------------------------------
// 两条纪律
// ---------------------------------------------------------------------------
//   ① **能修的就修，修不了的就退**。模型多给一条第 4 步任务 → 砍掉并记一笔
//      correction；模型只给了 1 步 → 这不是"少一点"，是"这不是一条链"，
//      退回替身的产出并记一笔。绝不把一条一步的"链"当成正常结果放行。
//   ② **每个修正都要留下痕迹**（返回 `corrections`）。它不是日志，是**证据**：
//      `AgentResult.corrections` 会跟着结果一路走到调用日志里，
//      于是"这个 Agent 最近老是把 classId 编错"变成一个能被看见的事实。
//
// ⚠️ 纯函数：不读时钟、不碰存档、不写日志。可以脱离 React 与网络单独跑断言。
// ============================================================================

import { getClass } from '@/data/catalog/classes';
import { MILESTONE_TAG_VOCABULARY } from '@/data/catalog/endgame';
import {
  MAX_REROUTE_DROP,
  MIN_REROUTE_DIFFICULTY,
  REDIFFICULTY_REWARD_RATIO,
  REROUTE_EXP_FLOOR,
} from '@/lib/mockReroute';
import type { RerouteOutcome } from '@/lib/mockReroute';
// ⚠️ 这三个类型从替身模块里取，是因为**接缝的形状目前就定义在那儿**
//    （ForgeOutput 是 mockForge 的产出，AdvisorDraft/SolverDraft 是 mockAdvisor 的）。
//    真身接上后替身文件的**实现**整体作废，但这三个类型会被提到 types/ 下 ——
//    因为那时它们是"异步外壳交给纯函数的东西"，与替身再无关系。
//    现在就让它们跟着替身走，好过为了一次搬家多开一个文件。
import type { ForgeOutput } from '@/lib/mockForge';
import type { AdvisorDraft, SolverDraft } from '@/lib/mockAdvisor';
import type {
  ArbiterVerdictPayload,
  ChainReviewOutput,
  ClassAgentOutput,
  ClassIdLiteral,
  Contact,
  ContactId,
  Difficulty,
  DispatcherDecision,
  NetworkAdviceOutput,
  Quest,
  QuestDraft,
  ReflectionQuality,
} from '@/types';

/** 修饰结果：`value` 是擦干净的东西，`corrections` 是这一路擦掉的痕迹 */
export interface Adapted<T> {
  value: T;
  /** 空数组 = 模型的原样输出就是干净的（**不是**"没检查"） */
  corrections: string[];
}

/** 一条链的任务数上限。与 mockForge 的 MAX_DRAFTS 同一个产品口径 */
const MAX_DRAFTS = 3;
const MIN_DRAFTS = 2;

/** 合法的里程碑标签（44 条封闭词表）。模型自创的标签一律拦在这里 */
export const LEGAL_MILESTONE_TAGS: ReadonlySet<string> = new Set(
  MILESTONE_TAG_VOCABULARY.map((v) => v.tag),
);

const clip = (text: string, n: number): string => {
  const t = text.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
};

// ---------------------------------------------------------------------------
// 1. Dispatcher → 职业线
// ---------------------------------------------------------------------------

/**
 * 把 Dispatcher 判定的 `primaryClass` 落成一条**真实存在**的职业线。
 *
 * 契约上说它可能是 `'NEW'`（该造一条新线了）。Phase 4 **不接**那条路：
 * 蓝图的铸造（Blueprint Generator → 写回职业目录）是另一个完整子系统，
 * 混在这里会让 Spark Box 的成功率取决于一个还没做的功能。
 * 所以 `'NEW'` 与"编出来的 classId"走同一条退路。
 *
 * 退路是 `fallback`（调用方传 `routeClass(idea)` 的结果）—— 它至少保证
 * 玩家这次点击**有东西出来**。一次失败的生成比一次保守的生成糟得多。
 */
export const resolveRoutedClass = (
  decision: DispatcherDecision,
  fallback: ClassIdLiteral,
): Adapted<ClassIdLiteral> => {
  const corrections: string[] = [];
  const raw = decision.routing.primaryClass;

  if (raw === 'NEW') {
    corrections.push('Dispatcher 判定需要新建职业线；Phase 4 尚未接蓝图铸造，已退回关键词路由');
    return { value: fallback, corrections };
  }
  if (!getClass(raw)) {
    corrections.push(`Dispatcher 给出了目录里没有的职业线「${raw}」，已退回关键词路由`);
    return { value: fallback, corrections };
  }
  return { value: raw, corrections };
};

// ---------------------------------------------------------------------------
// 2. Class Agent（+ 可选 Chain Reviewer）→ ForgeOutput
// ---------------------------------------------------------------------------

/**
 * 草稿的**结构卫生**。
 *
 * 三件事，顺序不能换：
 *   ① **tempId 去重** —— 见文件头。撞名的后来者改名而不是被丢弃：
 *      丢的是"一条真实存在的任务"，改名只损失一个标识符。
 *      而它原本的 `prerequisiteTempIds` 由 `buildQuests` 兜底（指不到就丢），
 *      这条链的骨架在下一步会被整个重写，所以改名不会留下坏引用。
 *   ② **字符串裁到契约上限**。schema 的 `maxLength` 是硬拦（超了就是 schema_violation），
 *      但 `narrative` 240 字这种限制，模型偶尔会多写两三个字 —— 这一层裁掉比整次调用
 *      作废划算得多，代价只是记一笔。
 *   ③ **`prerequisiteTempIds` 指不到的一律清空** —— `buildQuests` 也会丢，
 *      但在这里丢掉能让"模型给了一条悬空依赖"成为一条可见的 correction。
 */
const sanitizeDrafts = (drafts: QuestDraft[]): Adapted<QuestDraft[]> => {
  const corrections: string[] = [];
  const seen = new Map<string, number>();

  const fixed = drafts.map((d) => {
    const n = (seen.get(d.tempId) ?? 0) + 1;
    seen.set(d.tempId, n);
    const tempId = n === 1 ? d.tempId : `${d.tempId}__${n}`;
    if (n > 1) corrections.push(`草稿 tempId「${d.tempId}」重复，第 ${n} 条已改名（否则两条任务会共用一个 id）`);

    const title = clip(d.title, 28);
    if (title !== d.title.trim()) corrections.push(`任务标题超过 28 字，已截断：「${title}」`);

    return { ...d, tempId, title };
  });

  const ids = new Set(fixed.map((d) => d.tempId));
  const withPrereqs = fixed.map((d) => {
    const kept = d.prerequisiteTempIds.filter((t) => ids.has(t));
    if (kept.length === d.prerequisiteTempIds.length) return d;
    corrections.push(`任务「${d.title}」引用了不存在的上游任务，已断开`);
    return { ...d, prerequisiteTempIds: kept };
  });

  return { value: withPrereqs, corrections };
};

/**
 * 按 `finalOrder`（一串 tempId）给草稿排序。
 *
 * 排序是**稳定**的：没被 `finalOrder` 提到的草稿保持原相对位置 ——
 * 审核官漏写一个 tempId 时，那条任务会留在原地而不是掉到队尾。
 */
const applyFinalOrder = (drafts: QuestDraft[], order: string[]): QuestDraft[] => {
  if (order.length === 0) return drafts;
  const rank = new Map(order.map((id, i) => [id, i]));
  return drafts
    .map((d, i) => ({ d, i, r: rank.get(d.tempId) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.r !== b.r ? a.r - b.r : a.i - b.i))
    .map((x) => x.d);
};

/**
 * 把「一条链」重写成首尾相接的形式。
 *
 * 模型（无论 Class Agent 还是 Reviewer）给的前置关系是按语义写的，
 * 可能是并行的、也可能是空的。但 Spark Box 卖的是**一条链** ——
 * 玩家看到的是"第 1/3 步"，那个数字必须是真的。
 * 所以草稿里的 `prerequisiteTempIds` 在这里被整体重写为线性依赖，
 * 与 `mockForge` 完全同一手法。
 */
const linearize = (drafts: QuestDraft[]): QuestDraft[] =>
  drafts.map((d, i) => ({
    ...d,
    prerequisiteTempIds: i === 0 ? [] : [drafts[i - 1]!.tempId],
  }));

export interface AdaptForgeContext {
  /** 已经过 `resolveRoutedClass` 确认的归属职业线 */
  classId: ClassIdLiteral;
  /** 玩家写下的原始灵感。链标题空着时用它 */
  idea: string;
  deepDeliberation: boolean;
  /** 深度推演的产出；未勾选时为 null */
  review: ChainReviewOutput | null;
}

/**
 * Class Agent（+ 可选的 Chain Reviewer）→ `ForgeOutput`。
 *
 * `ForgeOutput` 正是 `generateQuestChain` 的 mock 替身产出那个形状 ——
 * 换句话说，**真身与替身在同一个接缝上交接**：接缝以上是异步外壳，
 * 接缝以下是那批一条没改过的纯函数。
 */
export const adaptClassOutput = (
  out: ClassAgentOutput,
  ctx: AdaptForgeContext,
): Adapted<ForgeOutput> => {
  const corrections: string[] = [];

  // —— 取哪一份草稿 ——
  // 审核官是终审。它给了一份非空的修订稿就以它为准；只给了一份（或空），
  // 那不是"少一点"，是这一环没干活 —— 退回 Class Agent 的原稿并记一笔。
  let raw: QuestDraft[] = out.quests;
  if (ctx.review) {
    if (ctx.review.revisedQuests.length >= MIN_DRAFTS) {
      raw = ctx.review.revisedQuests;
      corrections.push(...(ctx.review.approved ? [] : ['审核官未通过这一稿，但给出了可用的修订稿，按修订稿采用']));
    } else if (ctx.review.revisedQuests.length > 0) {
      corrections.push('审核官只返回了 1 步修订稿（成不了链），已退回生成稿');
    } else {
      corrections.push('审核官返回了空修订稿，已退回生成稿');
    }
  }

  if (raw.length === 0) {
    // schema 保证 `quests` 至少 1 条，所以走到这里说明是修订稿把它清空了。
    // 返回空值而不是抛异常：调用方据此走替身，玩家不会看到一次白屏。
    return { value: null as unknown as ForgeOutput, corrections: [...corrections, '没有任何可用草稿'] };
  }

  const sanitized = sanitizeDrafts(raw);
  corrections.push(...sanitized.corrections);

  let drafts = sanitized.value;
  if (ctx.review) drafts = applyFinalOrder(drafts, ctx.review.finalOrder);

  if (drafts.length > MAX_DRAFTS) {
    corrections.push(`模型给了 ${drafts.length} 步，已截到 ${MAX_DRAFTS} 步（一条链不该长到让人望而生畏）`);
    drafts = drafts.slice(0, MAX_DRAFTS);
  }
  if (drafts.length === 1) {
    corrections.push('只生成出 1 步 —— 这不成链，交由调用方决定是否退回替身');
    // 不在这里凑数：把一步硬拆成两步，会铸出一条"第一步是空跑"的假链。
    // 让它以 1 步的形态返回，由调用方（thunk）按"成不了链"处理。
  }

  // 链的包装块：模型少写一句不毁整稿（校验器对这一块不设必填，见 schemas.ts）。
  // 两处兜底都记一笔 —— 和截断、退回一样，"模型偷过懒"是证据，不是日志。
  const chain = out.chain;
  const titleFromModel = chain?.title?.trim();
  const chainTitle = titleFromModel ? clip(titleFromModel, 28) : clip(ctx.idea, 14) || '新的一条链';
  if (!titleFromModel) corrections.push('模型没写链标题，已用灵感开头顶上');

  const entry = getClass(ctx.classId);
  const rationaleFromModel = chain?.rationale?.trim();
  const rationale = rationaleFromModel
    ? clip(rationaleFromModel, 160)
    : entry
      ? `${entry.creed} 这一串从「${drafts[0]!.title}」起步，每一步的产出都是下一步的原料。`
      : '这一串从最小的一步开始，每一步的产出都是下一步的原料。';
  if (!rationaleFromModel) corrections.push('模型没写链的理由，已按职业信条兜底');

  return {
    value: {
      classId: ctx.classId,
      chainTitle,
      rationale,
      drafts: linearize(drafts),
      // 只有勾了深度推演才有参谋意见 —— 未勾选却带着 note 落库，
      // 会让审核面板显示一条"玩家没要求过的"批注
      reviewerNote: ctx.deepDeliberation ? (ctx.review?.reviewerNote?.trim() || null) : null,
    },
    corrections,
  };
};

/**
 * 这一稿能不能落库。
 *
 * ⚠️ 判据是"**成不成链**"，不是"有没有值"。
 *
 * 这里曾经只写 `a.value != null`，而 `adaptClassOutput` 对"只生成出 1 步"
 * 是**照样返回一个值**的（它把决定权留给调用方，见上面的注释）。
 * 于是那句注释成了空话：一步的"链"直接落库、`source` 还标着 `api` ——
 * 玩家会看到一条只有第 1/1 步的链，而且系统坚持说这是真身给的。
 * 这是 verify-ops ㉕ 抓到的（一条只在"模型偷懒"时才发作的路径）。
 *
 * 返回 false 不是失败，是**降级**：调用方递 `null`，纯函数走替身，
 * 玩家这一次点击仍然有东西出来。
 */
export const isUsableForge = (a: Adapted<ForgeOutput>): boolean =>
  a.value != null && a.value.drafts.length >= MIN_DRAFTS;

// ---------------------------------------------------------------------------
// 3. Arbiter → 落库判定
// ---------------------------------------------------------------------------

/**
 * Arbiter 的产出 → `completeQuest` 的 `verdict` 字段。
 *
 * 这里**不做**加成数值的裁决 —— 那是 `completeQuest` 内部 `alignBonusPct`
 * 的职责（AI 的数值幻觉破坏不了经济系统，见 types/state.ts 的 CompleteQuest）。
 * 这一层只做两件纯函数做不到的事：
 *
 *   ① **里程碑标签过封闭词表**。模型很容易顺着语义自创一个更贴切的标签
 *      （`"excellent"`、`"research_taste"`），而静默通道在界面上完全不可见 ——
 *      错了没有任何人会注意到，直到某天进化树点亮逻辑拿到一批永远匹配不上的锚点。
 *      这是**唯一**一处能拦住它的地方。
 *   ② **洞见/追问的裁剪**：schema 允许 1~3 条洞见、0~2 条追问，
 *      但落库的 `ReflectionVerdict` 只是展示材料，多出来的没有去处。
 */
export const adaptArbiterVerdict = (out: ArbiterVerdictPayload): Adapted<ArbiterVerdictPayload> => {
  const corrections: string[] = [];

  const legal: string[] = [];
  const illegal: string[] = [];
  for (const tag of out.milestoneTags) {
    (LEGAL_MILESTONE_TAGS.has(tag) ? legal : illegal).push(tag);
  }
  if (illegal.length > 0) {
    corrections.push(`里程碑标签 ${illegal.map((t) => `「${t}」`).join('')} 不在封闭词表内，已丢弃`);
  }
  if (new Set(legal).size !== legal.length) {
    corrections.push('里程碑标签有重复，已去重');
  }

  const EMPTY_INSIGHT_KINDS = ['method', 'mindset', 'pattern', 'risk', 'relationship', 'capital', 'other'];

  return {
    value: {
      ...out,
      // 去重后保留原顺序：`Set` 的迭代顺序就是插入顺序，不会打乱模型的排序
      milestoneTags: [...new Set(legal)],
      milestoneConfidence: out.milestoneConfidence.filter((m) => legal.includes(m.tag)),
      // 空文本的洞见是纯粹的噪音：它在日记里会渲染成一个没有内容的圆点
      insights: out.insights
        .filter((i) => i.text.trim().length > 0)
        .slice(0, 3)
        .map((i) => (EMPTY_INSIGHT_KINDS.includes(i.kind) ? i : { ...i, kind: 'other' as const })),
      suggestedFollowUps: out.suggestedFollowUps.filter((f) => f.title.trim().length > 0).slice(0, 2),
    },
    corrections,
  };
};

// ---------------------------------------------------------------------------
// 4. Network Advisor → 替身产出的那两种形状
// ---------------------------------------------------------------------------

/**
 * 单联系人智囊 → `AdvisorDraft`（`askNetworkAdvisor` 的替身产出形状）。
 *
 * `advice` 由 `situationRead` + `humanRead` 拼成 —— prompt 把这两段分开写
 * （先复述局面，再讲人性），而落库的是一段连读的话。中间加一个空行，
 * 因为它们是两个自然的段落，不是一句话的两半。
 */
export const adaptAdvisorDraft = (out: NetworkAdviceOutput): Adapted<AdvisorDraft> => {
  const corrections: string[] = [];
  const advice = [out.situationRead.trim(), out.humanRead.trim()].filter(Boolean).join('\n\n');

  if (!advice) corrections.push('模型既没复述局面也没讲人性，建议正文为空');

  return {
    value: {
      advice,
      suggestedAction: out.suggestedAction,
      // 去重：prompt 要求 avoid 具体可执行，但模型常把同一件事换个说法写两遍
      avoid: [...new Set(out.avoid.map((a) => a.trim()).filter(Boolean))],
      principle: out.principle.trim(),
    },
    corrections,
  };
};

/**
 * 全局智囊（"有这件事，该找谁"）→ `SolverDraft`。
 *
 * ⚠️ 这里最关键的一条：**推荐的人必须在通讯录里**。
 * 模型看不到真实的联系人 id，它只是被要求"如果这个人的名字在上面的名单里，
 * 就把 id 带上"。编一个 id 是它最容易犯的错，而代价是玩家点开一个空卡片。
 * 所以每个 `contactId` 都要在 `contacts` 里查一次，查不到的整条推荐丢掉。
 */
export const adaptSolverReport = (
  out: NetworkAdviceOutput,
  contacts: Contact[],
): Adapted<SolverDraft> => {
  const corrections: string[] = [];
  const byId = new Map(contacts.map((c) => [c.id as string, c]));

  const raw = out.recommendedContacts ?? [];
  const recommendations: SolverDraft['recommendations'] = [];
  const seen = new Set<string>();

  for (const rec of raw) {
    const id = rec.contactId.trim();
    if (!byId.has(id)) {
      corrections.push(`模型推荐了一个通讯录里没有的人（${id || '空 id'}），已丢弃`);
      continue;
    }
    if (seen.has(id)) continue; // 同一个人推荐两次：静默去重，不值得记一笔
    seen.add(id);
    recommendations.push({
      contactId: id as ContactId,
      reason: rec.reason.trim(),
      approach: rec.approach.trim(),
    });
    if (recommendations.length >= 2) break; // 契约上限：0~2 位
  }

  // 一个都没匹配上时，**不**把模型嘴里的名字硬凑成一条推荐 —— 它可能只是
  // 在正文里提了一句"你姑妈那种人会懂"。名单里没有对口的人，就诚实地说没有。
  const report = [out.situationRead.trim(), out.humanRead.trim()].filter(Boolean).join('\n\n');

  return {
    value: {
      report,
      recommendations,
      cautions: [...new Set(out.avoid.map((a) => a.trim()).filter(Boolean))].slice(0, 4),
      principle: out.principle.trim(),
    },
    corrections,
  };
};

// ---------------------------------------------------------------------------
// 5. Reroute → `mockReroute` 的产出形状
// ---------------------------------------------------------------------------

/**
 * 真身那条路上，**「降难度必降奖励」这条红线的执行点**。
 *
 * 红线在替身里由 `mockReroute` 执行，真身接上后没人执行 —— 除非这里做。
 * 不做的话，模型只要吐回一条 `difficulty: 1` 且**原封不动**带着原奖励的草稿，
 * reroute 就当场变成了刷分工具：先把难任务改简单，再拿原来的钱。
 * 而这条链路上没有任何一环会因此报错。
 *
 * 三件事，每一件都是**上限**而不是重算 —— 因为真身给的数不必与替身相等，
 * 但它绝不能超过那条线：
 *   ① 降档数取 `min(模型想降的, 地板, MAX_REROUTE_DROP)`，且**不许升难度**；
 *   ② EXP 取 `min(模型给的, 按档位打折后的值)`；
 *   ③ 金库奖励与属性点按同一条比例封顶（口径只有一个）。
 *
 * ⚠️ 常量从 `mockReroute` 导入而不是在这里重写一份 —— 两条路算出来的上限
 *    一旦漂移，玩家会先于我们发现（verify-ops 里有交叉断言钉着）。
 */
export const normalizeRerouteOutcome = (
  quest: Quest,
  rawDraft: QuestDraft,
): Adapted<RerouteOutcome | null> => {
  const sanitized = sanitizeDrafts([rawDraft]);
  const draft0 = sanitized.value[0];
  if (!draft0) return { value: null, corrections: [...sanitized.corrections, '模型没有给出可用的替换件'] };

  const corrections: string[] = [...sanitized.corrections];

  const floor = Math.max(0, quest.difficulty - MIN_REROUTE_DIFFICULTY);
  const wanted = quest.difficulty - draft0.difficulty; // 模型想降几档（负数=想升）
  if (wanted < 0) corrections.push('模型把这一步改得更难了 —— 改法的目的不是加码，已按原难度处理');
  const drop = Math.max(0, Math.min(wanted, floor, MAX_REROUTE_DROP));
  if (wanted > MAX_REROUTE_DROP) {
    corrections.push(`模型一次降了 ${wanted} 档（上限 ${MAX_REROUTE_DROP}），已按上限处理`);
  }

  const difficulty = Math.max(MIN_REROUTE_DIFFICULTY, quest.difficulty - drop) as Difficulty;
  const ratio = drop === 0 ? 1 : REDIFFICULTY_REWARD_RATIO ** drop;

  const capExp = Math.max(REROUTE_EXP_FLOOR, Math.round(quest.reward.exp * ratio));
  const exp = Math.min(draft0.reward.exp, capExp);
  if (draft0.reward.exp > capExp) {
    corrections.push(`替换件的奖励高于降档后的上限（${draft0.reward.exp} → ${capExp}），已按上限执行`);
  }

  const reward: QuestDraft['reward'] = {
    ...draft0.reward,
    exp,
    ...(draft0.reward.vaultUsdCents !== undefined
      ? { vaultUsdCents: Math.min(draft0.reward.vaultUsdCents, Math.round(quest.reward.vaultUsdCents ?? 0)) }
      : {}),
  };

  return {
    value: {
      draft: { ...draft0, difficulty, reward },
      difficultyDrop: drop,
      rejectedReason:
        wanted > 0 && floor === 0
          ? '这一步已经在最低难度，无法再降；已保留原难度，只重写做法。'
          : null,
    },
    corrections,
  };
};

/** 质量档位的合法集合。`readVerdict` 也会拦一次，这里是让它在 adapter 层就可读 */
export const LEGAL_QUALITIES: readonly ReflectionQuality[] = ['baseline', 'solid', 'sharp', 'revelatory'];
