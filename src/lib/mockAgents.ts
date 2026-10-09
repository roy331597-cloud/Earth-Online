// ============================================================================
// EarthOnline · Phase 4 · 契约形状的本地替身 (mockAgents)
//
// 与 `mockForge` / `mockReroute` / `mockArbiter` / `mockAdvisor` 是同一批替身，
// 但**形状不同**：那四个吐的是纯函数直接吃得下的东西（`ForgeOutput`、`RerouteOutcome`……），
// 这三个吐的是**模型的输出契约**（`DispatcherDecision`、`ClassAgentOutput`、`ChainReviewOutput`）。
//
// ---------------------------------------------------------------------------
// 为什么非要多这么一层
// ---------------------------------------------------------------------------
// 因为 `invokeAgent` 的 mock 回调必须与真身**同构**。如果 Mock 轨道直接吐
// `ForgeOutput`，那么：
//   · 适配层（`ai/adapters.ts`）在 Mock 模式下**永远不会被执行** ——
//     而它恰恰是"模型给了脏东西怎么办"的全部防线。
//     一个只在有 API Key 的机器上才会跑的防线，等于没有防线。
//   · 两条路会在接缝的**两边**分叉：Mock 走接缝下、真身走接缝上，
//     "同一份输入两条路结果一致"这件事就再也断言不了。
//
// 所以 Mock 也吐契约形状，让**同一条管线**从头跑到尾。适配层因此在
// 离线状态下也全程参与，verify-ops 里那批断言才有意义。
//
// 🔻 真身全面接上之后，本文件与那四个 mockForge 之类的替身一起删除。
//    在那之前，它是"离线也能把整条管线跑通"的唯一保证。
// ============================================================================

import { getClass } from '@/data/catalog/classes';
import { mockNetworkAdvisor, mockSocialSolver } from '@/lib/mockAdvisor';
import type { AdvisorInput, SolverInput } from '@/lib/mockAdvisor';
import { mockForge } from '@/lib/mockForge';
import { routeClass } from '@/lib/mockForge';
import type {
  ChainReviewOutput,
  ClassAgentOutput,
  ClassIdLiteral,
  DiagnosticSheetInput,
  DiagnosticSheetOutput,
  DiagnosticVerdictInput,
  DiagnosticVerdictOutput,
  DispatcherDecision,
  ForgeCapacity,
  NetworkAdviceOutput,
  QuestDraft,
} from '@/types';

/** 分钟制的换算：1 小时 = 60 分钟，1 天 = 6 个工作小时 */
const MINUTES_PER_UNIT = { min: 1, hour: 60, day: 360 } as const;

const totalEffortOf = (drafts: QuestDraft[]): ClassAgentOutput['chain'] extends null ? never : {
  unit: 'hour';
  value: number;
} => {
  const minutes = drafts.reduce(
    (acc, d) => acc + d.effortEstimate.value * MINUTES_PER_UNIT[d.effortEstimate.unit],
    0,
  );
  // schema 的下界是 1 小时：一条"零小时"的链在文案上说不通
  return { unit: 'hour', value: Math.max(1, Math.min(90, Math.round(minutes / 60))) };
};

/**
 * Dispatcher 的替身。
 *
 * 它只认真做一件事：把想法归到某条职业线上（`routeClass` 的关键词表）。
 * 别的字段照实填 —— `intentSummary` 用玩家自己的话截断，不编写一句"我理解你想……"
 * 的客套话：那句客套会一路走到 Class Agent 的 payload 里，最后影响生成质量。
 */
export const mockDispatcherDecision = (idea: string, capacity: ForgeCapacity = 'full'): DispatcherDecision => {
  const classId = routeClass(idea);
  const entry = getClass(classId);
  const trimmed = idea.trim();

  return {
    // 玩家自己的话就是最准的归纳。替身没有资格替他总结。
    intentSummary: trimmed.length <= 40 ? trimmed : `${trimmed.slice(0, 40)}…`,
    language: 'zh',
    routing: {
      primaryClass: classId,
      // 0.6：关键词命中本来就只是个猜测，不假装很有把握
      primaryConfidence: 0.6,
      secondaryClassIds: [],
      rationale: `关键词命中「${entry?.displayName ?? classId}」的领域词表`,
    },
    proposedClass: null,
    questShape: {
      kind: 'chain',
      // 8 = PO 2026-10-09 口径（建议 8~40，上限 60）的下沿；与 thunks 的
      // directedDecision 取同一个数 —— 替身与真身对着同一把尺子说话。
      // 回档给 4（「三到五步」的中值）；轻档 8 不变 —— 本地轨道的实际链长
      // 本来由池深决定（mockForge 的双口径注释），这里只是如实回声。
      suggestedChainLength: capacity === 'relapse' ? 4 : 8,
      suggestedType: 'side',
    },
    linkedGoalIds: entry?.linkedGoalIds ?? [],
    clarification: null,
    // 深度推演由玩家自己勾，替身不替他做决定
    recommendDeepDeduction: false,
    recommendReason: '',
  };
};

export interface MockClassInput {
  idea: string;
  classId: ClassIdLiteral;
  deepDeliberation: boolean;
  existingTitles: string[];
}

/**
 * Class Agent 的替身：把 `mockForge` 的产出装进契约信封。
 *
 * 内容一个字都不新写 —— 草稿仍然来自 `catalog/classes.ts` 的种子池
 * （见 mockForge 顶部的说明：那是这个产品的内容质量基线）。
 * 这一层只是把它裹成"模型会吐的那个形状"。
 */
export const mockClassAgentOutput = (input: MockClassInput): ClassAgentOutput => {
  const forged = mockForge({
    idea: input.idea,
    classId: input.classId,
    deepDeliberation: input.deepDeliberation,
    existingTitles: input.existingTitles,
  });

  const chainEffort = totalEffortOf(forged.drafts);

  return {
    mode: 'chain',
    chain: {
      title: forged.chainTitle,
      rationale: forged.rationale,
      estimatedTotalEffort: chainEffort,
      // 预期产出取末一步的 outcomeHints：一条链的价值在**终点**，
      // 不在第一步（第一步几乎总是"把问题写清楚"这类准备动作）
      deliverables: [...forged.drafts[forged.drafts.length - 1]!.outcomeHints].slice(0, 5),
    },
    quests: forged.drafts,
    closingNote: '',
    uncertainties: [],
  };
};

/**
 * Chain Reviewer 的替身。
 *
 * 它**照单全收**（`approved: true`、`revisedQuests` 原样返回）——
 * 这是刻意的：替身没有审稿能力，假装会审只会让"深度推演"这个开关
 * 在没有 API Key 时变成一次无声的空转。所以它如实报告"我没改"，
 * 而玩家勾了深度推演仍然能拿到一条链，只是参谋意见来自 mockForge 的话术。
 *
 * 唯一的真判断是 `difficultyCurve.isAscending` —— 那个从草稿里就能读出来。
 *
 * ⚠️ `reviewerNote` 是**从这个函数自己的输入里长出来的**（第一步轻、末一步重），
 *    而不是从 Class Agent 那边顺过来的。替身替的是审核官这个角色，
 *    它的意见就该由它自己基于草稿说出口 —— 从上游接一段话过来的话，
 *    "审核"就成了一个转发动作，那条链上就再没有第二个人真的看过稿子。
 */
export const mockChainReviewOutput = (input: {
  drafts: QuestDraft[];
}): ChainReviewOutput => {
  const difficulties = input.drafts.map((d) => d.difficulty);
  const ascending = difficulties.every((d, i) => i === 0 || d >= difficulties[i - 1]!);

  const first = input.drafts[0]!;
  const last = input.drafts[input.drafts.length - 1]!;
  const reviewerNote =
    `深度推演已过审：把「${first.title}」放在第一步是对的 —— 它不需要任何前置条件就能开始。` +
    (input.drafts.length > 1
      ? `末一步的难度最高（${last.difficulty} 星），如果第一步做完觉得吃力，可以先停在链的中段，不必一次吃完。`
      : '这一条单独成立，不必凑数拆成多步。');

  return {
    approved: true,
    reviewerNote,
    revisedQuests: input.drafts,
    revisionInstructions: [],
    difficultyCurve: {
      isAscending: ascending,
      comment: ascending ? '难度逐级上升' : '难度有回落，但仍在可接受范围',
    },
    // 经过一次就以通过记录：替身没做真正的剧透检查，但它也没有改写任何文案 ——
    // "没改"比"改了但没查"更接近事实
    spoilerCheck: { passed: true, leakingTempIds: [], comment: '' },
    continuityCheck: { passed: true, brokenJoints: [] },
    finalOrder: input.drafts.map((d) => d.tempId),
  };
};

// ---------------------------------------------------------------------------
// 社交智囊的替身（两个入口共用一份输出契约）
// ---------------------------------------------------------------------------

/**
 * `mockAdvisor` / `mockSocialSolver` 的产出（`AdvisorDraft` / `SolverDraft`）
 * 与模型的输出契约（`NetworkAdviceOutput`）**不是同一个形状**：
 * 前者是适配器**擦干净之后**的样子，后者是模型嘴里那份。
 *
 * 于是有两个选择：把替身直接接到适配器的下游（那 Mock 轨道就绕过了适配器），
 * 或者在这里把它**装回契约形状**，让同一段适配器在两条路上都跑一遍。
 * 选后者。理由见本文件头顶那段 —— 一个只在配了密钥的机器上才执行的防线，
 * 等于没有防线；而 verify-ops 里测的就是这段防线。
 *
 * 装箱是**无损**的，不是敷演：
 *   · `situationRead` 放整段正文、`humanRead` 留空串 ——
 *     适配器会用 `\n\n` 把两者拼起来，空串被 `filter(Boolean)` 丢掉，
 *     出来的就是原文一字不差。替身的正文本来就是一整块，不该假装分过段。
 *   · `avoid` 本来就是 `cautions`，`recommendations` 本来就是
 *     `recommendedContacts`（`contactId` 都是真的，因为替身读的就是真实通讯录）。
 */
export const mockAdvisorOutput = (input: AdvisorInput): NetworkAdviceOutput => {
  const draft = mockNetworkAdvisor(input);
  return {
    situationRead: draft.advice,
    humanRead: '',
    suggestedAction: draft.suggestedAction,
    avoid: [...draft.avoid],
    principle: draft.principle,
    longTermView: '',
    energyNote: '',
    suggestLogging: false,
    confidence: 0.6,
    recommendedContacts: null,
  };
};

export const mockSolverOutput = (input: SolverInput): NetworkAdviceOutput => {
  const draft = mockSocialSolver(input);
  return {
    situationRead: draft.report,
    humanRead: '',
    suggestedAction: null,
    avoid: [...draft.cautions],
    principle: draft.principle,
    longTermView: '',
    energyNote: '',
    suggestLogging: false,
    confidence: 0.6,
    recommendedContacts: draft.recommendations.map((r) => ({
      contactId: r.contactId,
      reason: r.reason,
      approach: r.approach,
    })),
  };
};

// ---------------------------------------------------------------------------
// 定标师的替身（两段式：出题与判分各一个函数，中间隔着真人作答）
// ---------------------------------------------------------------------------

/**
 * 出题替身。
 *
 * 它出的是**通用题面** —— 对任何目标都成立的四道题 —— 而不是假装读懂了目标。
 * 替身没有语言能力，装出"为你量身出题"的样子只会更假；唯一用到目标原话的
 * 地方是题面里的引用，让玩家认得出这是给他出的一张卷子。
 *
 * `suggestedClassIds` 用 `routeClass` 猜一次（与调度员同一张关键词表），
 * 但**只在 `existingClasses` 名单里才给出** —— 契约本来也只许从这里挑；
 * 猜不着就给空数组，宁可不说，不拿一个默认值冒充"AI 的建议"。
 */
export const mockDiagnosticSheet = (input: DiagnosticSheetInput): DiagnosticSheetOutput => {
  const goal = input.goalRaw.trim();
  const gist = goal.length <= 30 ? goal : `${goal.slice(0, 30)}…`;
  const guess = routeClass(goal);
  const known = input.existingClasses.some((c) => c.classId === guess);

  return {
    goalReframed: `把「${gist}」走成一件看得见的事：知道现在在哪、下一步往哪走、走完留下什么。`,
    suggestedClassIds: known ? [guess] : [],
    questions: [
      {
        kind: 'open',
        prompt: `关于「${gist}」：写下你现在最真实的状况 —— 已经做过什么、做到什么程度、最近一次尝试的结果是什么。`,
        options: [],
      },
      {
        kind: 'open',
        prompt: '写下你手头与这件事有关的一个具体困难（哪怕就是"不知道从哪开始"），并说说它让你卡了多久。',
        options: [],
      },
      {
        kind: 'choice',
        prompt: '过去一个月，你为这件事实际动手过几次？',
        options: ['四次以上，且留下了产物', '一两次，没留下什么', '想过，没动手', '还没开始'],
      },
      {
        kind: 'choice',
        prompt: '现在最挡路的是哪一样？',
        options: ['不知道从哪开始', '开始了但坚持不住', '在做，但看不出进步', '有推进，缺一个更高的目标'],
      },
    ],
  };
};

/**
 * 判分替身。
 *
 * ⚠️ 它**判不了内容** —— 这一点必须诚实。本地轨道读不出"他答得对不对"，
 *    只读得出**卷面信号**：答了几题、展开写了多少字。所以维度只给两条
 *    （覆盖 / 详略），基线文案也只说卷面本身告诉了我们什么，
 *    不替他伪造水准判断。真身（有 API Key 时）读到的是答案文本本身
 *    （判据见 70-diagnostician.md：只读答案、不读心情）。
 */
export const mockDiagnosticVerdict = (input: DiagnosticVerdictInput): DiagnosticVerdictOutput => {
  const total = input.questions.length;
  const answered = input.answers.filter((a) => a.text.trim().length > 0);
  const charTotal = answered.reduce((n, a) => n + a.text.trim().length, 0);
  const unanswered = total - answered.length;

  const coverage = Math.round((answered.length / Math.max(1, total)) * 100);
  // 240 字封顶：一题写到这个量，卷面上能说的就都说了
  const detail = Math.min(100, Math.round(charTotal / 2.4));

  const levelLabel =
    answered.length === 0
      ? '卷面留空 · 起点未知'
      : unanswered === 0
        ? '卷面完整 · 起点待考'
        : `答了 ${answered.length}/${total} · 起点部分未知`;

  const gaps: string[] = [];
  if (unanswered > 0) gaps.push(`还有 ${unanswered} 个测点没有作答 —— 那些位置的真实水平仍是未知数`);
  if (answered.length > 0 && detail < 40) gaps.push('自述普遍简短，这份基线因此偏粗');

  return {
    levelLabel,
    summary: `已记下你在这套卷子上的作答：${answered.length}/${total} 题有回应，共约 ${charTotal} 字。这份基线只量卷面本身 —— 答得越实，它越接近你的真实起点；留空的位置标为未知。`,
    dimensions: [
      { key: 'coverage', label: '卷面覆盖', score: coverage },
      { key: 'detail', label: '自述详略', score: detail },
    ],
    strengths: answered.length === 0 ? [] : [`${answered.length} 条自述，可作起点的第一批证据`],
    gaps,
  };
};
