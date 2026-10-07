// ============================================================================
// EarthOnline · Phase 5 · 进化树引擎 (evolutionEngine.ts)
//
// 它接手 `store/operations.ingestMilestones` 留下的后半句话：
//   「只做'记录'这一件事，不做节点点亮：点亮判定是 Phase 5 的事。
//     此刻写进去的记录 consumedByNodeId 为 null，等点亮逻辑接上后再回填。」
//
// 三件事，一件比一件重：
//   ① **点亮**（`lightNodes`）—— 里程碑攒够了，节点就亮。它是静默的：
//      雾还在的时候照样亮，因为那个人确实做到了，只是他还没到该知道的时刻；
//   ② **显形**（`evaluateRevealCondition`）—— 四条揭示条件满足任一，
//      整棵树对玩家现形。它是**单向的**：雾一旦散，就不再回来；
//   ③ **统计**（`stats`）—— 六个分支的进度、点亮总数、最近一次点亮时刻。
//
// 三条纪律，与成就引擎同源（`lib/achievementEngine`）：
//   · 无事返回同一对象（它挂在每一次点击上）；
//   · **只亮不灭** —— 里程碑记录环形保留最近 300 条，旧记录会被挤掉，
//     但点亮与否问的是历史，不是"现在还剩几条记录"，所以 lit 只增不减；
//   · 绝不新增事实 —— 只写 lit / litAt / consumedByNodeId 与三个统计量。
//
// ⚠️ 本文件是整个应用里**唯一**允许读写 `evolution` 内部字段的地方
//    （另一个是 selectors.evolutionView 的那道闸门）。组件一律走视图。
// ============================================================================

import { EVOLUTION_REVEAL_CONDITIONS, MILESTONE_CONFIDENCE_FLOOR } from '@/data/catalog/endgame';
import { getChapter } from '@/data/catalog/chapters';
import type {
  EarthOnlineState,
  EvolutionBranch,
  EvolutionNode,
  EvolutionRevealCondition,
  EvolutionTreeState,
  NodeId,
  Ratio,
  TechMilestoneRecord,
} from '@/types';

/** 六个真实分支。词表里的 `GENERAL` 不算一条"触及的分支"—— 它是通用池，不是方向 */
const REAL_BRANCHES: EvolutionBranch[] = [
  'COMPUTE_BIOLOGY',
  'INTELLIGENCE',
  'MEDICINE',
  'ENERGY',
  'MATERIALS',
  'SPACE',
];

/**
 * 一条记录"碰到"了哪几条分支。
 *
 * ⚠️ 这里**不走词表**。词表把 `literature` / `system_thinking` 记在 `GENERAL` 名下，
 * 因为它们是通用本事；但节点是横着用它们的 —— `cb_1`（生命的计算）与
 * `md_1`（衰老的边界）的 tagFilter 里都有 `literature`。
 * 若按"标签 → 词表里的分支"去算，一条 `literature` 记录会算出"没碰到任何分支"，
 * 而它明明点亮了 COMPUTE_BIOLOGY 里的一颗星 —— 于是玩家会看到图上亮着一个点，
 * 旁边写着"已触及的分支 0"。这种自相矛盾比数字算错更糟。
 *
 * 所以判据反过来：**这条记录喂到了哪些分支的节点，就算碰到了哪些分支。**
 * 它顺带保证了一件事 —— 亮着的节点所在的分支，一定在已触及之列。
 */
const branchesTouchedBy = (
  qualified: readonly TechMilestoneRecord[],
  nodes: readonly EvolutionNode[],
): string[] => {
  const tags = new Set(qualified.map((r) => r.tag));
  const touched = new Set<string>();
  for (const node of nodes) {
    if (node.tagFilter.some((t) => tags.has(t))) touched.add(node.branch);
  }
  return [...touched];
};

/** 够格计入进度的里程碑：可信度过线的那些（门槛与成就判定共用一条线） */
export const qualifyingMilestones = (records: readonly TechMilestoneRecord[]): TechMilestoneRecord[] =>
  records.filter((r) => r.confidence >= MILESTONE_CONFIDENCE_FLOOR);

/**
 * 一条揭示条件此刻算不算成立。
 *
 * 四条都是"已经发生了多少"的计数 —— 没有一条是"你做了某个动作"。
 * 这是刻意的：进化树不该有触发器，它是**长出来的**。
 */
export const evaluateRevealCondition = (
  condition: EvolutionRevealCondition,
  state: EarthOnlineState,
): boolean => {
  const qualified = qualifyingMilestones(state.evolution.techMilestones);

  switch (condition.kind) {
    case 'total_milestones':
      return qualified.length >= condition.threshold;

    case 'lit_nodes':
      return state.evolution.nodes.filter((n) => n.lit).length >= condition.threshold;

    case 'branches_touched':
      return branchesTouchedBy(qualified, state.evolution.nodes).length >= condition.threshold;

    case 'chapter_reached': {
      // 「抵达」= 已解锁，不是已完成：玩家站在第七章的地界上就算到了
      const maxIndex = state.chapters.chapters.reduce(
        (max, c) => (c.unlocked ? Math.max(max, getChapter(c.id)?.index ?? 0) : max),
        0,
      );
      return maxIndex >= condition.threshold;
    }

    case 'total_quests_completed': {
      // 只数 completed。结算是唯一算数的终点 ——
      // turn_in_pending 是"按了完成、还没确认"，expired / failed / abandoned
      // 各有各的意思，都不能被念成"做成了一件事"。
      // （目录里此刻没有条目用这条，但契约里有，就不留一个空分支等它将来撞上）
      let done = 0;
      for (const quest of Object.values(state.quests.byId)) {
        if (quest.status === 'completed') done += 1;
      }
      return done >= condition.threshold;
    }
  }
};

/**
 * 一个节点此刻攒够了几种**不同的**标签。
 *
 * 去重是这条判据的全部要害：`requiredTagCount` 说的是"几种"，不是"几条"。
 * 同一条 reproducibility 抽中五次，只证明了一件事发生了五次。
 */
const distinctTagsOf = (node: EvolutionNode, qualified: readonly TechMilestoneRecord[]): Set<string> =>
  new Set(qualified.filter((r) => node.tagFilter.includes(r.tag)).map((r) => r.tag));

/**
 * 这个节点还差几种标签（0 = 标签这一关已经过了）。
 *
 * 导出给视图用：详情卡要说"还差什么"，而它必须和点亮判定用同一把尺子 ——
 * 两处各数一遍，迟早会出现卡片说"凑齐了"而节点不亮的那种夜晚。
 */
export const tagsShortOf = (
  node: EvolutionNode,
  qualified: readonly TechMilestoneRecord[],
): number => Math.max(0, node.requiredTagCount - distinctTagsOf(node, qualified).size);

/**
 * 点亮一批节点，并回填"这条记录被谁吃掉了"。
 *
 * 单趟扫描 + 就地级联：节点的前置恒在同分支的低层级（见 catalog/endgame.ts），
 * 而 nodes 数组正是按分支分组、层级升序存的 —— 所以一趟走下来，
 * 刚点亮的 cb_1 能在同一趟里把 cb_2 的前置判过，不需要循环到不动点。
 */
const lightNodes = (
  prev: EvolutionTreeState,
  qualified: readonly TechMilestoneRecord[],
  now: Date,
): { nodes: EvolutionNode[]; fresh: EvolutionNode[] } | null => {
  const lit = new Set(prev.nodes.filter((n) => n.lit).map((n) => n.id));
  const fresh: EvolutionNode[] = [];

  for (const node of prev.nodes) {
    if (lit.has(node.id)) continue;
    if (!node.prerequisites.every((p) => lit.has(p))) continue;
    if (distinctTagsOf(node, qualified).size < node.requiredTagCount) continue;

    lit.add(node.id);
    fresh.push({
      ...node,
      lit: true,
      litAt: now.toISOString(),
      // 记住它是在雾里亮的还是雾散之后亮的 ——
      // 这两件事对玩家不是同一件事（后者他能亲眼看着它亮）
      litWhileRevealed: prev.revealed,
    });
  }

  if (fresh.length === 0) return null;

  const freshById = new Map(fresh.map((n) => [n.id, n]));
  return { nodes: prev.nodes.map((n) => freshById.get(n.id) ?? n), fresh };
};

/**
 * 回填 `consumedByNodeId`。
 *
 * ⚠️ 一个标签可以被**多个**节点消费（`literature` 同时喂 cb_1 与 md_1），
 *    而这一格只能装一个 id。所以规则是"先吃到的那个记名"，已经填过的不覆盖 ——
 *    这一格是给"这条记录最后去了哪儿"留的痕迹，不是一份完整的账。
 *    真要算完整归属，正确的做法是把 TagFilter 反查一遍，而不是在这一格上做文章。
 */
const backfillConsumed = (
  records: TechMilestoneRecord[],
  freshNodes: readonly EvolutionNode[],
): TechMilestoneRecord[] => {
  const ownerByTag = new Map<string, NodeId>();
  for (const node of freshNodes) {
    for (const tag of node.tagFilter) {
      if (!ownerByTag.has(tag)) ownerByTag.set(tag, node.id);
    }
  }

  let touched = false;
  const next = records.map((r) => {
    if (r.consumedByNodeId !== null) return r;
    if (r.confidence < MILESTONE_CONFIDENCE_FLOOR) return r;
    const owner = ownerByTag.get(r.tag);
    if (owner === undefined) return r;
    touched = true;
    return { ...r, consumedByNodeId: owner };
  });

  return touched ? next : records;
};

/** 六条分支各亮了几个（lit / total），顺序与视觉上的分支顺序无关，只是一份查表 */
const computeBranchProgress = (nodes: readonly EvolutionNode[]): Record<EvolutionBranch, Ratio> => {
  const out = {} as Record<EvolutionBranch, Ratio>;
  for (const branch of REAL_BRANCHES) {
    const inBranch = nodes.filter((n) => n.branch === branch);
    out[branch] = inBranch.length === 0 ? 0 : inBranch.filter((n) => n.lit).length / inBranch.length;
  }
  return out;
};

const sameProgress = (
  a: Record<EvolutionBranch, Ratio>,
  b: Record<EvolutionBranch, Ratio>,
): boolean => REAL_BRANCHES.every((branch) => a[branch] === b[branch]);

/**
 * 进化树的一次推进。挂在 store 的写入漏斗上，与 syncChapters / syncAchievements
 * 同一条链、同一个 `now`。
 */
export const syncEvolution = (state: EarthOnlineState, now: Date): EarthOnlineState => {
  const prev = state.evolution;
  const qualified = qualifyingMilestones(prev.techMilestones);

  // —— ① 点亮 ——
  const lighting = lightNodes(prev, qualified, now);
  const nextNodes = lighting?.nodes ?? prev.nodes;
  const freshNodes = lighting?.fresh ?? [];

  // —— ② 回填 ——
  const milestones =
    freshNodes.length === 0 ? prev.techMilestones : backfillConsumed(prev.techMilestones, freshNodes);

  // —— ③ 显形 ——
  // 条件表按目录重算：`met` 是**当前状态**的读数，不是一次性的开关。
  // 逐条比过，全都没变就沿用旧数组 —— 否则每次点击都会产生一个新对象。
  //
  // ⚠️ 判的是**刚点亮之后**的那棵树，不是传进来的那棵。
  //    `lit_nodes` 数的是 candles：如果拿入参去判，这一趟刚亮的三个节点不算数，
  //    掀雾就会**慢一次点击** —— 玩家明明看着第五颗星亮了，雾却要等他再做一件事才散。
  //    这种"差一次"的错不会崩，只会让那一刻的因果看起来莫名其妙。
  const staged: EarthOnlineState =
    nextNodes === prev.nodes ? state : { ...state, evolution: { ...prev, nodes: nextNodes } };
  const revealConditions = EVOLUTION_REVEAL_CONDITIONS.map((c) => ({
    ...c,
    met: evaluateRevealCondition(c, staged),
  }));
  const conditionsChanged = revealConditions.some(
    (c, i) => c.met !== (prev.revealConditions[i]?.met ?? false),
  );
  const nextConditions = conditionsChanged ? revealConditions : prev.revealConditions;
  const shouldReveal = !prev.revealed && revealConditions.some((c) => c.met);
  // 雾一旦散了就不再回来。这条单向性写在这里，而不是靠"条件不会退回去"——
  // 条件确实会退（里程碑记录只保留最近 300 条），但**看见过**这件事不会。
  const revealed = prev.revealed || shouldReveal;

  // —— ④ 统计 ——
  const litNodes = nextNodes.filter((n) => n.lit);
  const branchProgress = computeBranchProgress(nextNodes);
  const lastLitAt = litNodes.reduce<string | null>(
    (max, n) => (n.litAt !== null && (max === null || n.litAt > max) ? n.litAt : max),
    null,
  );
  const stats = {
    litNodeCount: litNodes.length,
    totalNodeCount: nextNodes.length,
    branchProgress,
    lastLitAt: lastLitAt ?? prev.stats.lastLitAt,
  };
  const statsChanged =
    stats.litNodeCount !== prev.stats.litNodeCount ||
    stats.totalNodeCount !== prev.stats.totalNodeCount ||
    stats.lastLitAt !== prev.stats.lastLitAt ||
    !sameProgress(stats.branchProgress, prev.stats.branchProgress);

  if (
    lighting === null &&
    milestones === prev.techMilestones &&
    !conditionsChanged &&
    !shouldReveal &&
    !statsChanged
  ) {
    return state; // 无事发生：连 evolution 这一格都不换
  }

  return {
    ...state,
    evolution: {
      ...prev,
      nodes: nextNodes,
      techMilestones: milestones,
      revealConditions: nextConditions,
      revealed,
      revealedAt: shouldReveal ? now.toISOString() : prev.revealedAt,
      stats: statsChanged ? stats : prev.stats,
    },
  };
};

/**
 * 玩家看过了「第一次看见」那张卡。
 *
 * 与 `dismissAchievementOvation` 同一个形状：只翻一个一次性开关，
 * 不动这棵树上的任何别的东西。之后再进档案馆，看到的就是常态的星空图。
 */
export const markRevealMomentShown = (state: EarthOnlineState): EarthOnlineState => {
  if (state.evolution.revealMomentShown) return state;
  return { ...state, evolution: { ...state.evolution, revealMomentShown: true } };
};
