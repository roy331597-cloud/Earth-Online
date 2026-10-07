// ============================================================================
// EarthOnline · Phase 4 · Prompt 上下文摘要 (digest)
//
// 把一整棵存档压成 `PromptContextDigest` —— Agent 每一次调用**唯一**拿得到的
// 关于这个人的信息。
//
// ---------------------------------------------------------------------------
// 为什么它是白名单，而不是"把存档喂进去"
// ---------------------------------------------------------------------------
// 三条理由，任何一条单独成立都够：
//
//   ① **隐私。** 存档里有通讯录的私人记录、金库的每一笔流水、成功日记的原文。
//      一次"帮我生成一条任务"的调用没有理由读得到这些。白名单是这件事唯一的
//      强制手段 —— 少写一个字段不会报错，多写一个字段也不会，所以它只能靠
//      **这个文件本身足够短**来保证可读性。
//   ② **token。** 完整存档是几十万字符。摘要的目标是 300~800 字符。
//   ③ **质量。** 模型拿到的上下文越长，越容易抓错重点。给它的应该是
//      "这个人现在站在哪儿"，不是"这个人四年来发生过什么"。
//
// ---------------------------------------------------------------------------
// 它与 renderContextDigest 的分工
// ---------------------------------------------------------------------------
// 这个文件负责**取哪些字段**（从存档里挑）；
// `ai/prompts/index.ts` 的 `renderContextDigest` 负责**怎么排版**（markdown）。
// 分开的理由：排版要按 prompt 的语感调，取数要按存档的结构改，
// 两者的变更节奏和评审人都不一样。
//
// ⚠️ 与全项目所有 selector 同一条自律：**纯函数**，不读 Date.now()（now 从参数进来）。
// ============================================================================

import { getClass } from '@/data/catalog/classes';
import { getChapter } from '@/data/catalog/chapters';
import { bandForHour } from '@/data/catalog/scenes';
import { formatUsdShort } from '@/lib/format';
import {
  activeTrack,
  goalProgress,
  netWorthUsdCents,
  portfolioLevel,
  trackTitle,
} from '@/lib/selectors';
import type { PromptContextDigest } from '@/types';
import type { EarthOnlineState } from '@/types';

/** 摘要里最多带几条进行中的任务。再多就是在让模型替玩家做日程规划了 */
const MAX_ACTIVE_QUESTS = 6;
/** 最近复盘的条数。它是"这个人最近在想什么"最真实的信号 */
const MAX_RECENT_JOURNAL = 3;

/**
 * 最近复盘的摘录长度。
 *
 * 60 字是刻意的：短到不可能把玩家的整段私人反思带出去，
 * 又长到足以让模型看出他在关注什么。**这是隐私与质量之间那条线的位置**，
 * 想改它的人应当先想清楚这一点，而不是因为"模型说它想要更多上下文"。
 */
const EXCERPT_CHARS = 60;

export const buildDigest = (state: EarthOnlineState, now: Date): PromptContextDigest => {
  const focused = getChapter(state.chapters.focusedChapterId);
  const activeIds = state.chapters.activeChapterIds;

  // 并行支线：除当前聚焦之外，还有哪几条路同时开着。
  // 这一条对生成质量的影响比看上去大 —— 没有它，模型会把一个
  // 同时在科研、攒钱、写东西的人，写成"正在读本科的学生"。
  const parallelChapterTitles = activeIds
    .filter((id) => id !== state.chapters.focusedChapterId)
    .map((id) => getChapter(id)?.title)
    .filter((t): t is string => typeof t === 'string');

  const track = activeTrack(state);
  const cls = track ? getClass(track.classId) : undefined;

  return {
    player: {
      handle: state.player.handle,
      level: portfolioLevel(state),
      attributes: state.player.attributes,
      energy: state.player.energy.current,
    },
    chapter: {
      title: focused?.title ?? '未命名篇章',
      subtitle: focused?.subtitle ?? '',
      theme: focused?.theme ?? '',
      // 情绪基调进 prompt 的原因：它决定了文案的**语气**，
      // 而语气是这一类生成物最容易崩的地方（把"有点穷但很自由"写成励志腔）
      emotionalTone: focused?.emotionalTone ?? '',
      parallelChapterTitles,
    },
    // 进度现算（selectors.goalProgress），不读存档里那份缓存 ——
    // 引擎点亮的格子不会去动缓存，读它会让模型看到一个半旧的百分比。
    endgameGoals: state.endgame.goals
      .filter((g) => g.visibleToPlayer)
      .map((g) => ({ id: g.id, title: g.title, progressPct: goalProgress(state, g) })),
    activeCareer: {
      classId: track?.classId ?? null,
      displayName: cls?.displayName ?? '尚未确立',
      level: track?.level ?? 0,
      title: trackTitle(track),
    },
    activeQuests: state.quests.order
      .map((id) => state.quests.byId[id])
      .filter((q): q is NonNullable<typeof q> => q !== undefined && q.status === 'active')
      .slice(0, MAX_ACTIVE_QUESTS)
      .map((q) => ({ title: q.title, status: q.status, difficulty: q.difficulty })),
    recentJournal: state.journal.entries.slice(0, MAX_RECENT_JOURNAL).map((e) => ({
      questTitle: e.questTitle,
      excerpt: clip(e.entryText, EXCERPT_CHARS),
      bonusPct: e.verdict?.bonusPct ?? 0,
    })),
    // 金库只给量级，不给明细：模型需要知道"他有没有钱做这件事"（决定任务的资源前提），
    // 不需要知道他上个月在哪家店花了多少。`formatUsdShort` 保证它读起来是个量级。
    vaultSummary:
      state.vault.cash > 0 || state.vault.holdings.length > 0
        ? { netWorthLabel: formatUsdShort(netWorthUsdCents(state.vault)) }
        : null,
    // 名单只报人数。这里原来还带一句"其中 N 位超期未联系"——
    // 随「该联系了」一起撤了：那是一句**催**，而摘要该给的是处境，不是催促。
    // （模型仍然知道他有几个人可以找；该不该联系，由玩家自己判断。）
    networkSummary: { totalContacts: state.network.contacts.length },
    timeOfDay: bandForHour(now.getHours()).timeOfDay,
    mockMode: state.ai.mockModeEnabled || state.ai.provider === 'mock',
  };
};

const clip = (text: string, n: number): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
};
