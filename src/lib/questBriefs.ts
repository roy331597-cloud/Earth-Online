// ============================================================================
// EarthOnline · 出题的两份素材（questBriefs.ts）
//
// 三条"不用先写灵感"的出题入口，各自把**此刻的处境**组一句话，
// 交给同一条铸链管线（thunks.forgeChain）：
//
//   · 悬赏板「让调度员出题」—— 玩家没有具体想法，让系统按处境出题。
//     素材 = 距达成最近的终极目标 + 聚焦篇章（`composeCommissionBrief`）。
//   · 圣殿「拆解成任务链」—— 玩家指着某个目标说"帮我拆"。
//     素材 = 该目标未点亮的那一格里程碑（`composeGoalBrief`）。
//   · 悬赏板「回航」（Phase 7）—— 完成过、但停了 ≥3 天，请系统铺一条
//     最小的回归路。素材 = 最近搁下的一条链 + 最近的终极目标
//     （`composeReturnBrief`）。语气从"进取"换成"恢复"。
//   · 开局定标（Phase 7）—— 答完定标卷之后自动铸链。
//     素材 = 定标师改写的目标 + 基线 + 短板（`composeDiagnosisIdea`）。
//     这条的素材不是"处境"而是**读数**：玩家刚坐下来答完一张卷子。
//
// 产出一律落「待议」—— 与灵感框同一条闸门：铸造 ≠ 生效，玩家点头之前不算数。
//
// ⚠️ 雾的纪律：隐藏且未达成的里程碑在 endgameView 里连名字都是 null。
//    这里只取"有名字、有判据"的那一格 —— 素材里永远不许出现藏着的格子。
//    少了这层过滤，玩家会在悬赏板的一份草稿里读到本该自己发现的东西。
// ============================================================================

import { chapterMap, endgameView } from '@/lib/selectors';
import type { ChapterMapNode, GoalView } from '@/lib/selectors';
import type {
  ClassIdLiteral,
  DiagnosticBaseline,
  EarthOnlineState,
  GoalIdLiteral,
  ISODateTime,
  QuestChain,
} from '@/types';

/** 未点亮、且**看得见**的下一格里程碑（藏着的格子在这里被挡下） */
const nextVisibleMilestone = (goal: GoalView) =>
  goal.milestones.find((m) => !m.achieved && m.title !== null && m.criterion !== null) ?? null;

/** 距达成最近的目标：未达成里进度最高的那个；全都达成就没有素材了 */
const nearestGoal = (state: EarthOnlineState): GoalView | null => {
  const open = endgameView(state)
    .goals.filter((g) => !g.achieved)
    .sort((a, b) => b.progress - a.progress);
  return open[0] ?? null;
};

/** 聚焦篇章：玩家的 focusedChapterId；它要是已经翻篇了，退回第一张在走的 */
const focusedChapter = (state: EarthOnlineState): ChapterMapNode | null => {
  const nodes = chapterMap(state);
  const focused = nodes.find((n) => n.id === state.chapters.focusedChapterId);
  if (focused && (focused.status === 'active' || focused.status === 'available')) return focused;
  return nodes.find((n) => n.status === 'active') ?? null;
};

/** 这一章最该先动的那一步：第一条未达成的条件 */
const firstOpenCondition = (state: EarthOnlineState, chapterId: string): string | null => {
  const progress = state.chapters.chapters.find((c) => c.id === chapterId);
  const open = progress?.conditionProgress.find((c) => !c.met);
  return open?.label ?? null;
};

/**
 * 「让调度员出题」的素材：把玩家此刻的两处处境写成一段实话 ——
 * 最近的那个终极目标（它未点亮的第一格），和眼下正在走的这一章。
 *
 * 目标是主语，因为目标是"想去的地方"；篇章是状语，因为它是"此刻站的地方"。
 * 两者都取不到（全通关了）时返回 null —— 没有处境的题不该被出出来。
 */
export const composeCommissionBrief = (state: EarthOnlineState): string | null => {
  const parts: string[] = [];

  const goal = nearestGoal(state);
  if (goal) {
    const step = nextVisibleMilestone(goal);
    parts.push(
      step
        ? `把「${goal.title}」再拉近一步：先够到「${step.title}」—— ${step.criterion}`
        : `把「${goal.title}」再拉近一步`,
    );
  }

  const chapter = focusedChapter(state);
  if (chapter) {
    const open = firstOpenCondition(state, chapter.id);
    parts.push(
      open
        ? `眼下这一章「${chapter.title}」还在走，还差：${open}`
        : `眼下这一章「${chapter.title}」还在走`,
    );
  }

  if (parts.length === 0) return null;
  return `${parts.join('。')}。`;
};

/**
 * 「拆解成任务链」的素材：某个终极目标 + 它未点亮的第一格。
 * 返回的 `classId` 是挂在这条目标上的职业线（没有就 null，交给调度员路由）——
 * 目标已经达成 / 找不到时返回 null（卡片上的按钮本就不该出现）。
 */
export const composeGoalBrief = (
  state: EarthOnlineState,
  goalId: GoalIdLiteral,
): { idea: string; classId: ClassIdLiteral | null } | null => {
  const goal = endgameView(state).goals.find((g) => g.id === goalId);
  if (!goal || goal.achieved) return null;

  const step = nextVisibleMilestone(goal);
  const idea = step
    ? `把「${goal.title}」拆成能落地的一串：先够到「${step.title}」—— ${step.criterion}。每一步都要是我这几天真能动手做的事。`
    : `把「${goal.title}」拆成能落地的一串：每一步都要是我这几天真能动手做的事。`;

  const classId =
    state.careers.tracks.find((t) => t.linkedGoalIds.includes(goalId))?.classId ?? null;
  return { idea, classId };
};

/**
 * 最近搁下的那条链：未走完、未收束、且**真的走进过**（有已完成成员）的链里，
 * 动得最晚的一条。
 *
 * 三个条件各挡一种东西：completed / closedAt 挡"已经翻篇的"；
 * "有已完成成员"挡"还没开始的"—— 一条只确认过、一步没动的链不算搁下，
 * 那是没起跑，不是停下。它"最后动过"的时刻取链内最新一次 completedAt，
 * 而不是 createdAt：玩家可能在旧链上走了很多天才停，创建时间会撒谎。
 */
const mostRecentOpenChain = (state: EarthOnlineState): QuestChain | null => {
  let best: QuestChain | null = null;
  let bestAt: ISODateTime | null = null;

  for (const chain of Object.values(state.quests.chains)) {
    if (chain.completed || chain.closedAt !== null) continue;

    const lastDoneAt = chain.questIds.reduce<ISODateTime | null>((latest, id) => {
      const at = state.quests.byId[id]?.completedAt ?? null;
      return at !== null && (latest === null || at > latest) ? at : latest;
    }, null);
    if (lastDoneAt === null) continue;

    if (bestAt === null || lastDoneAt > bestAt) {
      best = chain;
      bestAt = lastDoneAt;
    }
  }
  return best;
};

/**
 * 「回航」的素材：停航 ≥3 天后，请系统铺一条最小的回归路。
 *
 * 语气与另外两条不同：那两条是**进取**（再拉近一步 / 拆一条路），
 * 这一条是**恢复** —— 只说"停在哪、想去哪、想重新动起来"，不写"你该做什么"。
 * 方向与规格分两条显式通道走：idea 只带处境，容量档在 payload 的
 * `capacity` 字段（见 ai/thunks.ts 的注释）—— 别把"几步、多长"拼进这句，
 * 那会污染 sourceIdea 与链标题的兜底。
 *
 * 不返回 null：按钮亮起的前提是"完成过、且停了 ≥3 天"（selectors.isStalled），
 * 无论链与目标取不取得到，恢复的意图那句话都成立 —— 点得亮，就出得了题。
 */
export const composeReturnBrief = (state: EarthOnlineState): string => {
  const parts: string[] = ['歇了一阵，我想回来继续走。'];

  const chain = mostRecentOpenChain(state);
  if (chain) {
    const done = chain.questIds.filter(
      (id) => state.quests.byId[id]?.status === 'completed',
    ).length;
    parts.push(`上次搁下的是「${chain.title}」：${chain.questIds.length} 步里走过 ${done} 步。`);
  }

  const goal = nearestGoal(state);
  if (goal) parts.push(`想去的地方没变：「${goal.title}」。`);

  parts.push('不用从头讲起，请让我从最小的一步重新开始。');
  return parts.join('');
};

/**
 * 「开局定标」的素材：把定标师量出来的读数交给铸链管线。
 *
 * 与上面三条的差别是素材的性质：那三条写的是**处境**（谁在哪、想要什么），
 * 这一条写的是**读数**（起点长什么样）。所以格式也换了 ——
 * 「【开局定标】目标改写。基线：…。短板：…。」，让调度员一眼看出
 * 这条链的出发点是一张刚答完的卷子，而不是一句随手写的灵感。
 *
 * 短板最多带 3 条（adapters 已封顶 4 条，这里再收一道）：idea 是路由的
 * 输入也是链标题的兜底，不该长到读不完。容量与链长**不在这里** ——
 * 它们走 payload 的 `capacity` 字段（同 composeReturnBrief 的注释）。
 */
export const composeDiagnosisIdea = (
  goalReframed: string,
  baseline: Pick<DiagnosticBaseline, 'summary' | 'gaps'>,
): string => {
  const parts = [`【开局定标】${goalReframed.trim()}。基线：${baseline.summary.trim()}。`];
  const gaps = baseline.gaps
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (gaps.length > 0) parts.push(`短板：${gaps.join('、')}。`);
  parts.push('请按这个起点，从最小的一步排起。');
  return parts.join('');
};
