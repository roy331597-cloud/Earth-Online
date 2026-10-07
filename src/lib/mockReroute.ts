// ============================================================================
// EarthOnline · Phase 3 · 「换个做法」的本地替身 (mockReroute)
//
// 🔻 Phase 4 接入后，**本文件整体删除**，调用点换成 Chain Reviewer 的真实输出
//    （或 Class Agent 的一次定向重写）。与 mockForge / mockArbiter / mockAdvisor
//    是同一批替身，删除标记也一致。
//
// ---------------------------------------------------------------------------
// 这一层的产物**不是**一段文案，而是一份 `QuestDraft` ——
// 和真实模型将来要吐的东西**逐字同构**。所以 operations 里那一行调用换掉之后，
// 下游的 buildQuests、状态流转、留档逻辑一个字都不用动。
//
// 两条红线在这里落地（见 docs/phase2/reroute-design.md §4）：
//
//   ① **降难度必降奖励。** 难度每降一档，EXP 按 REDIFFICULTY_REWARD_RATIO 打折。
//      不这么做的话，reroute 就成了刷分工具：先把难任务改简单，再拿原来的钱。
//
//   ② **新形态必须带后继任务的 objective 原文。**
//      改法的合法性判据只有一条 —— "它还通得向下一步"。
//      一个与后继无关的"更简单的任务"不是 reroute，是把链悄悄改道了。
//
// 另外它**不会**把难度降到 1 以下，也不会把奖励打到底：改法的目的是让这一步
// 变得做得到，不是把它变成一件没有重量的事。
// ============================================================================

import type { Difficulty, Quest, QuestDraft } from '@/types';

/** 难度每降一档，EXP 打的折。⚠️ 与上面两个常量同理：真身那条路也读它 */
export const REDIFFICULTY_REWARD_RATIO = 0.6;

/** 降档后 EXP 的地板：一件没有重量的事不配叫任务 */
export const REROUTE_EXP_FLOOR = 20;

/**
 * 改法最少要降到什么难度（1 是地板）。
 *
 * ⚠️ 这两个常量现在有**两个**使用者：本文件（替身）与 `ai/adapters.ts`
 *    （真身那条路的产出方）。所以它们必须从这里导出，而不是各写一份 ——
 *    两条路算出来的降档上限一旦漂移，玩家会先于我们发现。
 *    verify-ops 里有一条交叉断言钉着这件事。
 */
export const MIN_REROUTE_DIFFICULTY: Difficulty = 1;

/** 一次调用里最多降几档 —— 降太多就不是"换个做法"，是换了一件事 */
export const MAX_REROUTE_DROP = 2;

const MIN_DIFFICULTY = MIN_REROUTE_DIFFICULTY;
const MAX_DROP = MAX_REROUTE_DROP;

export interface RerouteInput {
  /** 被改的那一步 */
  quest: Quest;
  /** 它的后继（链内 index + 1 的那一条）；没有后继时为 null */
  successor: Quest | null;
  /** 玩家写下的修改诉求原文 */
  request: string;
}

export interface RerouteOutcome {
  /** 替换件的草稿形态（与真实模型的输出同构） */
  draft: QuestDraft;
  /** 降了几档（0 表示玩家只要求改写文案、不要求降难度） */
  difficultyDrop: number;
  /** 为什么没能按玩家说的改（成功时为 null） */
  rejectedReason: string | null;
}

/**
 * 从玩家的诉求里读"想降几档"。
 *
 * 这是一个**很朴素的**关键字判读：Phase 3 不接模型，与其假装听得懂人话，
 * 不如只认几个明确的说法，其余一律按"降一档"处理。
 * 真身接上以后这一整段会被删掉 —— 这正是它被单独关在一个函数里的原因。
 */
const readRequestedDrop = (request: string): number => {
  const r = request.toLowerCase();
  if (/不降|别降|保持难度|只是换个做法|太难了?了?不|难度不变/.test(r)) return 0;
  if (/简单很多|大幅降低|降两档|太贵|两档/.test(r)) return 2;
  return 1; // 默认：降一档。这是玩家说"这一步我做不到"时最常见的诉求。
};

const clampDifficulty = (d: number): Difficulty =>
  Math.max(MIN_DIFFICULTY, Math.min(5, Math.round(d))) as Difficulty;

/**
 * 改写标题与目标陈述。
 *
 * 手法是"缩小粒度 + 保留方向"：把原来那件事拆出**第一个能今天就动手的动作**，
 * 而不是换一件更容易但无关的事。所以新标题里一定还留着原任务的核心名词。
 */
const rewriteTitle = (quest: Quest): string => {
  const core = quest.title.replace(/^(做|完成|写|跑|整理|联系|搭|建|读完)/, '').trim();
  return `先把「${core}」做成一版`;
};

const rewriteObjective = (quest: Quest, successor: Quest | null): string => {
  const base = quest.objective.replace(/[。；;]$/, '');
  if (successor === null) {
    return `用一个下午能做完的规模，做出${base}的第一版（允许粗糙、允许不完整）。`;
  }
  return (
    `用一个下午能做完的规模，做出能支撑下一步的第一步：${base}。` +
    `做完这一版，你就能接着往下走 —— 下一步是「${successor.objective}」。`
  );
};

const rewriteNarrative = (quest: Quest, successor: Quest | null, request: string): string => {
  const asked = request.trim().length > 0 ? `你说的是：「${request.trim()}」。` : '';
  const bridge =
    successor === null
      ? '这一步不需要一次做对，它只需要存在。'
      : `降低的是这一版的规模，不是方向 —— 后面那一步还在原地等你，` +
        `而它要的那点东西，这一版必须给得出来。`;
  return `${asked}${quest.narrative} 换一个做法：把门槛砍到能迈过去的高度，先让这件事真的发生过。${bridge}`;
};

/** 难度降档后的奖励重算。属性点与金库一并按同一比例下调，口径只有一个。 */
const rescaleReward = (quest: Quest, ratio: number): QuestDraft['reward'] => {
  const exp = Math.max(REROUTE_EXP_FLOOR, Math.round(quest.reward.exp * ratio));
  return {
    exp,
    ...(quest.reward.vaultUsdCents !== undefined
      ? { vaultUsdCents: Math.max(0, Math.round(quest.reward.vaultUsdCents * ratio)) }
      : {}),
    ...(quest.reward.attributePoints !== undefined
      ? {
          attributePoints: Object.fromEntries(
            Object.entries(quest.reward.attributePoints).map(([k, v]) => [
              k,
              Math.max(0, Math.round((v ?? 0) * ratio)),
            ]),
          ) as QuestDraft['reward']['attributePoints'],
        }
      : {}),
  };
};

/**
 * 生成替换件。
 *
 * ⚠️ 纯函数：不读时钟（`tempId` 用原任务 id 派生），不碰存储。
 *    时间戳由 operations 在落库时统一盖，与其它所有 operation 同一条口径。
 */
export const mockReroute = (input: RerouteInput): RerouteOutcome => {
  const { quest, successor, request } = input;

  const requestedDrop = readRequestedDrop(request);
  const floorDrop = Math.max(0, quest.difficulty - MIN_DIFFICULTY);
  const difficultyDrop = Math.min(requestedDrop, floorDrop, MAX_DROP);
  const difficulty = clampDifficulty(quest.difficulty - difficultyDrop);
  const ratio = difficultyDrop === 0 ? 1 : REDIFFICULTY_REWARD_RATIO ** difficultyDrop;

  const draft: QuestDraft = {
    // 派生自原 id：同一步骤改出来的替换件，在日志里能一眼看出它是从哪儿来的
    tempId: `${quest.id}_rr`,
    title: rewriteTitle(quest),
    subtitle: `改法 · 比原来低 ${difficultyDrop} 档`,
    narrative: rewriteNarrative(quest, successor, request),
    objective: rewriteObjective(quest, successor),
    type: quest.type,
    difficulty,
    // 工作量估算随难度同向缩水，但保底 30 分钟 —— 一件"零成本"的事不配叫任务
    effortEstimate: {
      unit: quest.effortEstimate.unit,
      value: Math.max(30, Math.round(quest.effortEstimate.value * (difficulty / Math.max(1, quest.difficulty)))),
    },
    reward: rescaleReward(quest, ratio),
    outcomeHints: quest.outcomeHints,
    linkedGoalIds: quest.linkedGoalIds,
    linkedAttributes: quest.linkedAttributes,
    // 前置由 operations 从原任务继承（草稿里的 tempId 只在本批次内有意义）
    prerequisiteTempIds: [],
    dueHintDays: null,
    proof: null,
    tags: [...new Set([...quest.tags, '改法'])],
  };

  return {
    draft,
    difficultyDrop,
    // 已经是 1 档时诚实地说"没法再降了"——但仍然允许改写（只要不降难度就不打折）
    rejectedReason:
      requestedDrop > 0 && floorDrop === 0
        ? '这一步已经在最低难度，无法再降；已保留原难度，只重写做法。'
        : null,
  };
};

/** 缺省诉求：玩家什么也没写就点了按钮 */
export const DEFAULT_REROUTE_REQUEST = '这一步我做不动，换个更可行的做法。';
