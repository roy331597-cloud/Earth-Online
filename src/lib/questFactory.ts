// ============================================================================
// EarthOnline · 任务铸造厂
//
// 职责只有一件事：把 **AI 给的 `QuestDraft`** 落成**能进存档的 `Quest`**。
//
// 为什么值得单独一个文件，而不是塞进 operations.ts：
// 这是全项目唯一一处"外来数据 → 持久化事实"的边界。Phase 4 接真实 API 后，
// 服务器返回的仍然只是一堆 `QuestDraft`；草稿里没有 id、没有时间戳、
// 前置关系还写在 `tempId` 上。**这一层转换在真身接上以后一个字都不用改**，
// 变的只有上游是谁在产出草稿。所以它不属于 mock，属于核心。
//
// 三条纪律：
//   ① 生成物一律是 `draft` —— 铸造不等于生效，玩家逐条审核才算数；
//   ② id 由**时间戳 + 序号**推导，不读 Date.now()（时间从参数进来）；
//   ③ 草稿里出现的 `prerequisiteTempIds` 必须真的解析成 QuestId；
//      指不到的就丢弃，绝不留一个悬空的 id 让下游去猜。
// ============================================================================

import type { Quest, QuestChain, QuestDraft, QuestId } from '@/types';

/**
 * 给一批草稿分配真实 QuestId。
 *
 * 形如 `q_m1a2b3c_0`：前缀 + 铸造时刻的 base36 + 序号。
 * 之所以把时刻编进 id 而不是用自增计数：id 必须**跨存档唯一**，
 * 否则两次铸造（或两份存档合并）会撞在一起，而 order 数组是按 id 索引的。
 *
 * `salt` 是给"替换件"这类**与旧任务同时存在**的铸造留的口子。
 * 时刻只能分清不同的毫秒，分不清同一毫秒里的两次铸造 ——
 * 而这正是「整链重抽」和「换个做法」会遇到的情况：
 * 它们在同一个 `now` 下重新铸造，若不加盐，新任务的 id 会与旧成员**逐字相同**，
 * 于是那几条本该留档的旧任务被新草稿原地顶掉，痕迹与负样本一起消失。
 */
export const mintQuestIds = (drafts: QuestDraft[], now: Date, salt = ''): Map<string, QuestId> => {
  const stamp = `${now.getTime().toString(36)}${salt}`;
  const map = new Map<string, QuestId>();
  drafts.forEach((d, i) => {
    map.set(d.tempId, `q_${stamp}_${i}` as QuestId);
  });
  return map;
};

export interface BuildQuestsInput {
  drafts: QuestDraft[];
  /** 草稿属于哪条链 */
  chain: { id: QuestChain['id']; title: string };
  classId: Quest['classId'];
  agentId: Quest['origin']['agentId'];
  /** 玩家写下的原始灵感，原样存进每一条的 origin */
  sourceIdea: string;
  /** 是否经 Agent B 审核（「深度推演」） */
  reviewed: boolean;
  /** 参谋意见，逐条冗余一份 */
  reviewerNote: string | null;
  now: Date;

  // —— 以下三个只有「换个做法」那条路径会用到 ——
  // reroute 产出的同样是 QuestDraft，只是它只有一条，且要放回原来那一步的位置上。
  // 与其为它单写一份铸造逻辑（那会让 mintQuestIds 的调用点变成两处，
  // 两处各自演化），不如在这里留三个可选的口子。

  /** 链内起始序号（reroute 把替换件放回原 index），默认 0 */
  indexOffset?: number;
  /** 覆盖链规模（reroute 时原链 total 不变），默认取 drafts.length */
  totalOverride?: number;
  /** 这条任务是从哪一步改出来的；null 表示不是改出来的 */
  reroutedFrom?: QuestId | null;
  /** 这一步自己经历过的改法记录（含本次），默认空数组 */
  rerouteHistory?: Quest['origin']['rerouteHistory'];

  /**
   * id 加盐。只有"替换件"这条路径需要（见 mintQuestIds 的说明）：
   * 它铸出来的任务要和被替换掉的那几条**同时存在**，所以不能只靠时刻区分。
   */
  idSalt?: string;
}

/**
 * 把草稿转成任务。
 *
 * 草稿里**没有**的字段一律给保守默认值，而不是编一个听起来合理的数：
 * 例如 `dueHint` 由 `dueHintDays` 推算，草稿没给就是 null（不设截止日），
 * 而不是替玩家擅自定一个月 —— 提醒一旦不准确，玩家就会开始无视所有提醒。
 */
export const buildQuests = (input: BuildQuestsInput): Quest[] => {
  const { drafts, chain, classId, agentId, sourceIdea, reviewed, reviewerNote, now } = input;
  const ids = mintQuestIds(drafts, now, input.idSalt ?? '');
  const ts = now.toISOString();
  const total = input.totalOverride ?? drafts.length;
  const indexOffset = input.indexOffset ?? 0;
  const reroutedFrom = input.reroutedFrom ?? null;
  const rerouteHistory = input.rerouteHistory ?? [];

  return drafts.map((d, index) => {
    // 指不到的 tempId 直接丢弃：宁可少一个前置，也不要一个永远满足不了的条件
    const prerequisites = d.prerequisiteTempIds
      .map((t) => ids.get(t))
      .filter((id): id is QuestId => id !== undefined);

    return {
      id: ids.get(d.tempId)!,
      classId,
      type: d.type,
      status: 'draft',
      title: d.title,
      subtitle: d.subtitle,
      narrative: d.narrative,
      objective: d.objective,
      difficulty: d.difficulty,
      effortEstimate: d.effortEstimate,
      reward: d.reward,
      outcomeHints: d.outcomeHints,
      linkedGoalIds: d.linkedGoalIds,
      linkedAttributes: d.linkedAttributes,
      // AI 浇出来的任务和具体的人没有绑带：绑定联系人只发生在
      // 玩家从卡片上「派生行动任务」的那条路径上（见 operations.createContactQuest）
      linkedContactIds: [],
      prerequisiteQuestIds: prerequisites,
      dueHint:
        d.dueHintDays === null ? null : new Date(now.getTime() + d.dueHintDays * 86_400_000).toISOString(),
      proof: d.proof ? { ...d.proof, submitted: null } : null,
      tags: d.tags,
      chain: { chainId: chain.id, index: index + indexOffset, total, chainTitle: chain.title },
      origin: {
        agentId,
        sourceIdea,
        generatedAt: ts,
        reviewed,
        reviewerNote,
        reroutedFrom,
        rerouteHistory,
      },
      grant: null,
      journalEntryId: null,
      createdAt: ts,
      claimedAt: null,
      startedAt: null,
      turnInOpenedAt: null,
      completedAt: null,
      actualEffortMinutes: null,
    };
  });
};
