// ============================================================================
// EarthOnline · Phase 4 · 请求组装 (payloads)
//
// 把存档组装成**发给模型的 user message**。
//
// 与 `digest.ts` 的分工是这个文件存在的全部理由：
//   · digest 进的是 **system prompt** —— 它是"这个人一直是谁"，
//     每一次调用都带着，所以它必须短、必须稳定、必须与任务无关。
//   · payload 进的是 **user message** —— 它是"这一次要你做什么"，
//     只有这一次有用，可以长，也必须具体。
// 把两者混在一起，就会出现"生成任务的调用里塞着复盘判分的字段"这种事。
//
// ---------------------------------------------------------------------------
// 三条纪律
// ---------------------------------------------------------------------------
//   ① **不给它不该看的。** 通讯录的私人记录、日记原文、金库流水 ——
//      每个 Agent 的 `AgentProfile.contextInjection` 早就写好了它该拿到什么，
//      这里照着它取。白名单，不是黑名单。
//   ② **只给真事实。** 每一个字段都必须能在存档里指出来。
//      不给模型一个"看起来合理"的默认值 —— 它会当真，然后据此写出一句
//      与玩家实际处境无关的话，而那比一句空话更伤人。
//   ③ **注入时钟。** 与全项目所有纯函数同一条自律：
//      不读 `new Date()`，"现在"从参数进来。
//
// ⚠️ 全部是纯函数。可以脱离网络单独跑断言 —— 事实上 verify-ops 就是这么做的。
// ============================================================================

import { getClass, expToNext } from '@/data/catalog/classes';
import { getChapter } from '@/data/catalog/chapters';
import { MILESTONE_TAG_VOCABULARY } from '@/data/catalog/endgame';
import { bonusBandFor } from '@/data/catalog/policy';
import { bandForHour } from '@/data/catalog/scenes';
import { activeTrack, netWorthUsdCents, portfolioLevel, trackTitle } from '@/lib/selectors';
import type {
  ArbiterInput,
  ChainReviewInput,
  ClassAgentInput,
  ClassAgentOutput,
  ClassIdLiteral,
  Contact,
  ContactContextForAI,
  DispatcherDecision,
  DispatcherInput,
  EarthOnlineState,
  EmotionTag,
  NetworkAdviceInput,
  Quest,
  SolverConsultInput,
} from '@/types';

/** 最近互动摘要的条数。再多就不是"最近"了 */
const RECENT_INTERACTIONS = 3;
/** 通讯录节选的候选人数。全局检索是要选人，不是要把整本通讯录念给模型听 */
const SOLVER_CANDIDATES = 12;

const daysBetween = (iso: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));

const recentEmotions = (state: EarthOnlineState, n = 4): EmotionTag[] =>
  state.journal.entries
    .slice(0, n)
    .flatMap((e) => e.emotions)
    .slice(0, n);

const chapterTone = (state: EarthOnlineState): string =>
  getChapter(state.chapters.focusedChapterId)?.emotionalTone ?? '';

// ---------------------------------------------------------------------------
// 1. Dispatcher
// ---------------------------------------------------------------------------

/**
 * 现有职业线的摘要。
 *
 * ⚠️ 这一段是**防幻觉的**，不是背景介绍。契约里 `primaryClass` 是个字符串，
 *    模型完全可以顺着语义编一条"数据科学家"出来 —— 除非它手里有一份
 *    "目前只有这四条线"的清单，而且被明确告知只能从里面挑。
 *    清单里带上等级，还顺带解决了另一个问题：它会倾向于把想法归到玩家
 *    正在走的路上，而不是每来一个新想法就另起一条线。
 */
const classCatalogForAI = (
  state: EarthOnlineState,
): DispatcherInput['existingClasses'] =>
  (['computational_biology', 'investor', 'social_media_influencer', 'startup_entrepreneur'] as ClassIdLiteral[])
    .map((classId) => getClass(classId))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => ({
      classId: c.classId,
      displayName: c.displayName,
      level: state.careers.tracks.find((t) => t.classId === c.classId)?.level ?? 0,
      domains: c.domains,
    }));

export const buildDispatcherPayload = (
  state: EarthOnlineState,
  input: { idea: string; deepDeliberation: boolean },
): DispatcherInput => {
  const chapter = getChapter(state.chapters.focusedChapterId);
  return {
    rawIdea: input.idea,
    deepDeduction: input.deepDeliberation,
    preferredShape: 'chain',
    existingClasses: classCatalogForAI(state),
    currentChapter: {
      id: state.chapters.focusedChapterId,
      title: chapter?.title ?? '',
      theme: chapter?.theme ?? '',
      primaryGoalIds: chapter?.primaryGoalIds ?? [],
    },
    playerSnapshot: {
      attributes: state.player.attributes,
      energy: state.player.energy.current,
      level: portfolioLevel(state),
    },
  };
};

// ---------------------------------------------------------------------------
// 2. Class Agent（职业线专属生成器）
// ---------------------------------------------------------------------------

export const buildClassPayload = (
  state: EarthOnlineState,
  input: { classId: ClassIdLiteral; idea: string; decision: DispatcherDecision },
  now: Date,
): ClassAgentInput => {
  const entry = getClass(input.classId);
  const track = state.careers.tracks.find((t) => t.classId === input.classId);

  // 该职业最近完成的任务标题 —— 提示词要求"避免重复出题"，
  // 而最能防重复的其实不是它已知的那些，是**它刚做完的那些**。
  const recentQuestTitles = Object.values(state.quests.byId)
    .filter((q) => q.classId === input.classId && q.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 5)
    .map((q) => q.title);

  return {
    rawIdea: input.idea,
    dispatch: {
      intentSummary: input.decision.intentSummary,
      questShape: input.decision.questShape,
      linkedGoalIds: input.decision.linkedGoalIds,
      routing: input.decision.routing,
    },
    career: {
      classId: input.classId,
      displayName: entry?.displayName ?? input.classId,
      level: track?.level ?? 0,
      title: trackTitle(track),
      stats: {
        questsCompleted: track?.stats.questsCompleted ?? 0,
        expEarnedTotal: track?.stats.expEarnedTotal ?? 0,
      },
      recentQuestTitles,
    },
    playerSnapshot: {
      attributes: state.player.attributes,
      energy: state.player.energy.current,
      chapterTone: chapterTone(state),
      timeOfDay: bandForHour(now.getHours()).timeOfDay,
    },
    // 金库给量级而不是明细：它需要判断"这条任务的资源前提"，
    // 不需要知道这个人的每一笔流水（见 digest.ts 同一段注释）
    vaultSummary:
      state.vault.cash > 0 || state.vault.holdings.length > 0
        ? { netWorthUsdCents: netWorthUsdCents(state.vault), cashUsdCents: state.vault.cash }
        : null,
    recentInsights: state.journal.entries
      .flatMap((e) => e.verdict?.insights ?? [])
      .slice(0, 2)
      .map((i) => i.text),
  };
};

// ---------------------------------------------------------------------------
// 3. Chain Reviewer（深度推演审核）
// ---------------------------------------------------------------------------

export const buildReviewerPayload = (
  state: EarthOnlineState,
  input: { draft: ClassAgentOutput; idea: string },
): ChainReviewInput => {
  // 近 20 条已结算任务的难度均值与放弃率 —— 审核官用它校准"这条链对这个人难不难"
  const settled = state.quests.order
    .map((id) => state.quests.byId[id])
    .filter((q): q is Quest => q !== undefined && (q.status === 'completed' || q.status === 'abandoned'))
    .slice(-20);
  const done = settled.filter((q) => q.status === 'completed');
  const avgDifficultyCompleted =
    done.length === 0 ? 0 : done.reduce((a, q) => a + q.difficulty, 0) / done.length;

  return {
    draft: input.draft,
    rawIdea: input.idea,
    playerSnapshot: {
      level: portfolioLevel(state),
      energy: state.player.energy.current,
      recentCompletionRate: settled.length === 0 ? 0 : done.length / settled.length,
    },
    recentPerformance: {
      // 没有样本时给 0 而不是编一个 3 —— "不知道"和"中等偏上"是两件事，
      // 后者会让审核官以为这条链对这个人是轻松的
      avgDifficultyCompleted,
      abandonRate: settled.length === 0 ? 0 : (settled.length - done.length) / settled.length,
    },
  };
};

// ---------------------------------------------------------------------------
// 4. Arbiter（复盘判官）
// ---------------------------------------------------------------------------

/**
 * 判分区间取**该任务难度**的那一档，而不是全局最宽区间。
 * 契约上 schema 允许 0~20，但真实可用的范围由难度决定 ——
 * 给一个 5 星任务报上 20% 的区间，模型会照着上限取值。
 */
export const buildArbiterPayload = (
  state: EarthOnlineState,
  input: { quest: Quest; reflection: string },
): ArbiterInput => {
  const band = bonusBandFor(input.quest.difficulty);
  const policy = state.settings.rewardPolicy;

  return {
    quest: {
      questId: input.quest.id,
      title: input.quest.title,
      objective: input.quest.objective,
      type: input.quest.type,
      difficulty: input.quest.difficulty,
      classId: input.quest.classId,
      baseReward: {
        exp: input.quest.reward.exp,
        ...(input.quest.reward.vaultUsdCents !== undefined
          ? { vaultUsdCents: input.quest.reward.vaultUsdCents }
          : {}),
      },
    },
    reflection: input.reflection,
    actualEffortMinutes: input.quest.actualEffortMinutes,
    selfRatedDifficulty: null,
    proof: input.quest.proof
      ? { criterion: input.quest.proof.criterion, submitted: input.quest.proof.submitted }
      : null,
    playerState: {
      energy: state.player.energy.current,
      recentEmotions: recentEmotions(state),
      recentBonusAvg: (() => {
        const bonuses = state.journal.entries.slice(0, 5).map((e) => e.verdict?.bonusPct ?? 0);
        return bonuses.length === 0 ? 0 : bonuses.reduce((a, b) => a + b, 0) / bonuses.length;
      })(),
    },
    // ⚠️ 整张词表发过去，而且**必须**发全：模型的标签严格从这里取，
    //    少发一条，那条里程碑就永远点不亮（而它在界面上完全不可见 —— 没人会发现）
    milestoneTagVocabulary: MILESTONE_TAG_VOCABULARY.map((v) => ({ ...v })),
    policy: {
      bonusMinPct: band.minPct,
      bonusMaxPct: band.maxPct,
      wordCountFloor: policy.reflectionWordCountFloor,
    },
  };
};

// ---------------------------------------------------------------------------
// 5. Network Advisor —— 两种模式
// ---------------------------------------------------------------------------

/**
 * 这个人跟玩家正在走的哪几条职业线沾边。
 *
 * 存档里**没有**这个字段（Contact 上只有 tags / profile.field / commonGround），
 * 所以它是推出来的：拿职业目录的领域关键词去扫这段人的文本。
 *
 * 为什么值得推一次：智囊要回答"该不该跟这个人聊工作上的事"，
 * 而"他是我投资人这条线上认识的人"比"他是我通讯录里的第 7 个人"有用得多。
 * 一个词都没扫到时返回空数组 —— 推不出来就说推不出来，不硬凑一条线。
 */
const relatedClassesOf = (c: Contact): ClassIdLiteral[] => {
  const corpus = [
    c.profile.org ?? '',
    c.profile.role ?? '',
    c.profile.field ?? '',
    c.profile.metContext ?? '',
    ...c.profile.commonGround,
    ...c.tags,
  ]
    .join(' ')
    .toLowerCase();

  const hits: ClassIdLiteral[] = [];
  for (const classId of ['computational_biology', 'investor', 'social_media_influencer', 'startup_entrepreneur'] as ClassIdLiteral[]) {
    const entry = getClass(classId);
    if (!entry) continue;
    // domains 是英文领域词（'bioinformatics'、'venture capital'…），
    // 玩家的档案是中文写的。所以两边都小写化之后做个宽松包含 ——
    // 命中率不高，但**没有假阳性**：一个都没命中就是空数组，
    // 比"猜一条线"安全（猜错了模型会顺着一条不存在的关联写建议）。
    if (entry.domains.some((d) => corpus.includes(d.toLowerCase()))) hits.push(classId);
  }
  return hits;
};

/** 从联系人档案里切出模型真正用得上的那几段。私人记录（互动摘要）只留最近 3 条 */
const contactContextOf = (state: EarthOnlineState, contactId: string, now: Date): ContactContextForAI | null => {
  const c = state.network.contacts.find((x) => x.id === contactId);
  if (!c) return null;

  return {
    relatedClassIds: relatedClassesOf(c),
    contactId: c.id,
    name: c.alias ?? c.name,
    relationType: c.relationType,
    stage: c.stage,
    dimensions: c.dimensions,
    note: c.note,
    whyItMatters: [...c.whyItMatters],
    boundaries: [...c.boundaries],
    preferences: [...c.preferences],
    openCommitments: c.openCommitments.filter((o) => !o.done).map((o) => o.text),
    recentInteractions: c.interactions.slice(-RECENT_INTERACTIONS).map((i) => ({
      localDate: i.localDate,
      channel: i.channel,
      summary: i.summary,
      sentiment: i.sentiment,
    })),
    daysSinceLastContact: c.lastContactAt === null ? -1 : daysBetween(c.lastContactAt, now),
  };
};

export const buildAdvisorPayload = (
  state: EarthOnlineState,
  input: { contactId: string; situation: string },
  now: Date,
): NetworkAdviceInput | null => {
  const contact = contactContextOf(state, input.contactId, now);
  if (!contact) return null;

  return {
    situation: input.situation,
    questionKind: 'general',
    contact,
    playerState: {
      energy: state.player.energy.current,
      recentEmotions: recentEmotions(state),
      currentChapterTone: chapterTone(state),
    },
  };
};

/**
 * 全局检索：「有这件事，该找谁」。
 *
 * 候选人的**排序是有讲究的**：按"最近有交集"排，而不是按档案完整度。
 * 这是因为模型拿到 12 个人时，排在前面的会被更认真地读 ——
 * 而一个半年没说过话的人，即使档案写得再漂亮，也不是今晚该去麻烦的人。
 */
export const buildSolverPayload = (
  state: EarthOnlineState,
  input: { question: string },
  now: Date,
): SolverConsultInput => {
  const candidates = [...state.network.contacts]
    .sort((a, b) => (b.lastContactAt ?? '').localeCompare(a.lastContactAt ?? ''))
    .slice(0, SOLVER_CANDIDATES)
    .map((c) => ({
      contactId: c.id,
      name: c.alias ?? c.name,
      relationType: c.relationType,
      stage: c.stage,
      field: [c.profile.org, c.profile.role, c.profile.field].filter(Boolean).join(' · '),
      // 手动加进来的人往往只有这一段 —— 名单里"值得被想起"的那点依据全在这里
      note: c.note,
      commonGround: [...c.profile.commonGround],
      whyItMatters: [...c.whyItMatters],
      boundaries: [...c.boundaries],
      recentInteractions: c.interactions.slice(-RECENT_INTERACTIONS).map((i) => i.summary),
      daysSinceLastContact: c.lastContactAt === null ? -1 : daysBetween(c.lastContactAt, now),
    }));

  return {
    question: input.question,
    candidates,
    playerState: {
      energy: state.player.energy.current,
      recentEmotions: recentEmotions(state),
      currentChapterTone: chapterTone(state),
    },
  };
};

// ---------------------------------------------------------------------------
// 6. Reroute（换个做法）
// ---------------------------------------------------------------------------

/**
 * 「换个做法」的输入。
 *
 * 契约（types/state.ts 的 RerouteQuestDraft 注释 ②）要求新形态**必须**带着
 * 后继任务的 objective 原文发过去 —— 改法的合法性判据是"它还通得向下一步"。
 * 不带这个，模型会欢快地把这一步换成一件与后面完全无关的事，
 * 等于把整条链悄悄改道，而那不归这一步管。
 */
export interface ReroutePayload {
  quest: {
    title: string;
    objective: string;
    difficulty: number;
    effortEstimate: Quest['effortEstimate'];
    reward: Quest['reward'];
    tags: string[];
  };
  /** 玩家的修改诉求原文 */
  request: string;
  /** 后继任务。没有后继（末一步）时为 null —— 那时"平缓"只意味着降低强度 */
  successor: { title: string; objective: string } | null;
  /** 这一步在整个链里的位置，供模型判断"现在能松到什么程度" */
  position: { index: number; total: number; chainTitle: string } | null;
  playerSnapshot: { energy: number; level: number; chapterTone: string };
}

export const buildReroutePayload = (
  state: EarthOnlineState,
  input: { quest: Quest; successor: Quest | null; request: string },
): ReroutePayload => ({
  quest: {
    title: input.quest.title,
    objective: input.quest.objective,
    difficulty: input.quest.difficulty,
    effortEstimate: input.quest.effortEstimate,
    reward: input.quest.reward,
    tags: [...input.quest.tags],
  },
  request: input.request,
  successor: input.successor
    ? { title: input.successor.title, objective: input.successor.objective }
    : null,
  position: input.quest.chain
    ? {
        index: input.quest.chain.index,
        total: input.quest.chain.total,
        chainTitle: input.quest.chain.chainTitle,
      }
    : null,
  playerSnapshot: {
    energy: state.player.energy.current,
    level: portfolioLevel(state),
    chapterTone: chapterTone(state),
  },
});

// ---------------------------------------------------------------------------
// 7. 一些小工具（给 thunks 层用，也是纯的）
// ---------------------------------------------------------------------------

/** 该职业线的升级门槛，用于把"还要多久升级"讲给模型听 */
export const nextLevelHint = (state: EarthOnlineState): string => {
  const track = activeTrack(state);
  if (!track) return '尚未确立职业线';
  const entry = getClass(track.classId);
  if (!entry) return '';
  return `距离 Lv.${track.level + 1} 还需 ${expToNext(entry.expCurve, track.level)} EXP`;
};
