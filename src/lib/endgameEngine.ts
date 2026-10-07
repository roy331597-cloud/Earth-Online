// ============================================================================
// EarthOnline · Phase 5 · 终局目标引擎 (endgameEngine.ts)
//
// 它补上 `GoalMilestone.criterion` 从 Phase 1 起就等着的那半句话：
// 里程碑的**机器判据**。此前点亮只有一条通路 —— 现实里程碑定义上的
// `grantsGoalMilestoneIds`（`store/operations.recordRealityMilestone`）；
// 没有定义去"授予"的那些格子，全靠这一趟来读。
//
// 一件事：**点亮 + 重算达成态**。
//   ① 按目录表 `GOAL_MILESTONE_CONDITIONS` 逐格判 —— 键是里程碑 id，
//      查目录，不读存档里那份深拷贝（老档没有这个字段，补判就无从谈起）；
//   ② 一个目标每一格都有了时刻 → `achieved` 为真，`achievedAt` 取最后一格
//      落下的那一刻（ISO 串按字典序比较即时间序，全部由 `toISOString` 产出）。
//
// 三条纪律，与成就 / 进化树引擎同源：
//   · 无事返回同一对象 —— 它挂在每一次点击的写入漏斗上；
//   · **只亮不灭**：achievedAt 一旦写下就不再清，achieved 同理；
//   · 只写事实 —— milestone.achievedAt / goal.achieved / goal.achievedAt。
//     展示用的 `progress` **不在这条链上**：进度数学只有一处，在 selectors
//     （`goalProgress` / `endgameView`），否则迟早出现账本和页面各说各话。
//
// 点亮语义 = **系统第一次看见它为真**。
// 不是"你刚刚做成了什么"的那一刻，而是这一趟扫描第一次发现条件成立的时刻。
// 对净资产这类**状态谓词**，二者本来就不是一回事 —— 没人能指着哪一天说
// "你是在这一天变成六位数的"。所以它不派发浮层、不发 EXP、不写日记：
// 它记的是一笔账。谁想为这件事做一场仪式，自己去看前后两份状态（见圣殿面板）。
// ============================================================================

import { GOAL_MILESTONE_CONDITIONS } from '@/data/catalog/endgame';
import { netWorthUsdCents } from '@/lib/selectors';
import type { EarthOnlineState, EndgameGoal, GoalMilestoneCondition, SyncEndgame } from '@/types';

/** 一条判据此刻算不算成立 */
const conditionMet = (condition: GoalMilestoneCondition, state: EarthOnlineState): boolean => {
  switch (condition.kind) {
    case 'net_worth_usd_cents':
      // 口径与 HUD / 金库 / Ch.5 全部走同一条：selectors.netWorthUsdCents
      return netWorthUsdCents(state.vault) >= condition.amount;

    case 'reality_milestone_count':
      // 读 counters 而不是去数 records：它与冷却判定、"第 N 次"文案
      // （`milestoneGate` 也读它）是**同一本账**。两处各数一遍，
      // 迟早会数出两个数，而玩家会拿页面上的那个来质问另一个。
      return (state.milestones.counters[condition.definitionId]?.count ?? 0) >= condition.count;
  }
};

/**
 * 一个目标的一次推进。返回 null = 这一格无事发生，连对象都不换。
 *
 * `ts` 由调用方统一传入：同一趟里点亮的多格共享同一个时刻 ——
 * 一天里跨过的五档净值，它们的"第一次被看见"就是同一次扫描。
 */
const syncGoal = (goal: EndgameGoal, state: EarthOnlineState, ts: string): EndgameGoal | null => {
  const fresh = goal.milestones.filter((m) => {
    if (m.achievedAt !== null) return false;
    const condition = GOAL_MILESTONE_CONDITIONS[m.id];
    return condition !== undefined && conditionMet(condition, state);
  });

  const milestones =
    fresh.length === 0
      ? goal.milestones
      : goal.milestones.map((m) =>
          fresh.includes(m) ? { ...m, achievedAt: ts } : m,
        );

  const allDone = milestones.every((m) => m.achievedAt !== null);
  const achieved = goal.achieved || allDone;
  const achievedAt =
    goal.achievedAt ??
    (allDone
      ? milestones.reduce<string | null>(
          (max, m) => (m.achievedAt !== null && (max === null || m.achievedAt > max) ? m.achievedAt : max),
          null,
        )
      : null);

  if (fresh.length === 0 && achieved === goal.achieved && achievedAt === goal.achievedAt) return null;

  return { ...goal, milestones, achieved, achievedAt };
};

/**
 * 终局目标的一次推进。挂在 store 的写入漏斗最前面。
 *
 * ⚠️ 位置不是随手放的：chapterEngine 的 `labMilestoneCount` 读 PRIVATE_LAB
 *    目标的已亮里程碑数（Ch.7 的机器代理），achievements 的 `goal_achieved`
 *    读 `goal.achieved` 这个事实 —— 这两道下游工序必须看见这一趟刚点亮的格子，
 *    所以它得跑在最前面。
 */
export const syncEndgame: SyncEndgame = (state, now) => {
  const ts = now.toISOString();
  let touched = false;

  const goals = state.endgame.goals.map((goal) => {
    const next = syncGoal(goal, state, ts);
    if (next === null) return goal;
    touched = true;
    return next;
  });

  if (!touched) return state;
  return { ...state, endgame: { ...state.endgame, goals } };
};
