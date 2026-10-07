// ============================================================================
// EarthOnline · 出题的两份素材（questBriefs.ts）
//
// 两条"不用先写灵感"的出题入口，各自把**此刻的处境**组一句话，
// 交给同一条铸链管线（thunks.forgeChain）：
//
//   · 悬赏板「让调度员出题」—— 玩家没有具体想法，让系统按处境出题。
//     素材 = 距达成最近的终极目标 + 聚焦篇章（`composeCommissionBrief`）。
//   · 圣殿「拆解成任务链」—— 玩家指着某个目标说"帮我拆"。
//     素材 = 该目标未点亮的那一格里程碑（`composeGoalBrief`）。
//
// 产出一律落「待议」—— 与灵感框同一条闸门：铸造 ≠ 生效，玩家点头之前不算数。
//
// ⚠️ 雾的纪律：隐藏且未达成的里程碑在 endgameView 里连名字都是 null。
//    这里只取"有名字、有判据"的那一格 —— 素材里永远不许出现藏着的格子。
//    少了这层过滤，玩家会在悬赏板的一份草稿里读到本该自己发现的东西。
// ============================================================================

import { chapterMap, endgameView } from '@/lib/selectors';
import type { ChapterMapNode, GoalView } from '@/lib/selectors';
import type { ClassIdLiteral, EarthOnlineState, GoalIdLiteral } from '@/types';

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
