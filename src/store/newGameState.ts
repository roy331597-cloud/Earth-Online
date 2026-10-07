// ============================================================================
// EarthOnline · 出厂清场 · 新建存档（生产初始档）
//
// PO 裁定：开发过程中为验收造的测试内容 —— 每日任务、初始金钱、社交关系、
// 任务链、日志、里程碑、预先点亮的格子……全部清空。
//
// 「空白」不是「没有」—— 这是一份**结构完全成年的空档**：
// 每一条职业线、每一章、每一格终极目标、每一个进化树节点都在场，
// 只是没有任何一格被点亮、没有任何一笔账、没有任务、没有关系、没有记录。
//
// 它和 `mockState.ts` 的关系：
//   · 两者共享同一份 Agent 花名册（`agentRoster.ts`）、同一批目录深拷贝手法；
//   · mockState 是**测试夹具**（预置了进度、账目、点亮格，991 条断言长在上面），
//     本文件是**生产初始档** —— store 在"第一次打开"与「重新开始」时用它。
//
// 三条纪律（与引擎三纪律同源）：
//   1) 不预置任何"你已经做到过"的东西 —— 所有事实格子留空，
//      等真实的第一次写入由引擎按事实点亮；
//   2) 除注入的 `now` 之外不读任何外部状态 —— 可测、可复现；
//   3) 每个容器都与 mockState 同构（同一批类型、同一批目录），
//      差别只在"里面的数"。
// ============================================================================

import { CLASSES, expToNext } from '@/data/catalog/classes';
import { CHAPTERS } from '@/data/catalog/chapters';
import {
  ENDGAME_GOALS,
  EVOLUTION_NODES,
  EVOLUTION_REVEAL_CONDITIONS,
} from '@/data/catalog/endgame';
import { createInitialSettings, wealthProgressRatio } from '@/data/catalog/policy';
import { activeDayKey, localDateKey, localMonthKey, weekStartKey } from '@/lib/format';
import { CURRENT_SCHEMA_VERSION, DEFAULT_GRADE_WEIGHTS, STORAGE_KEYS } from '@/types';
import type { EarthOnlineState, EvolutionBranch, ISODateTime } from '@/types';
import { createAgentRoster } from './agentRoster';

/** 建角时的体力。mock 为 80 —— 与它同构，免得换个存档像换了个游戏 */
const STARTING_ENERGY = 80;

/**
 * 铸一份全新的初始档。
 *
 * `now` 由调用方注入（store 传 `new Date()`，测试传固定时刻）——
 * 建角时刻会盖在 meta.createdAt、玩家 createdAt、Ch.1 的 startedAt 上，
 * 它是这份存档里**唯一**允许存在的"历史"。
 */
export function createNewGameState(now: Date = new Date()): EarthOnlineState {
  const nowIso: ISODateTime = now.toISOString();
  const settings = createInitialSettings();
  // 日常/周常的"今天是哪一天"必须与结算口径一致（次日 01:00 换日）
  const today = activeDayKey(now, settings.dayRolloverHour);

  // 目录模板必须**深拷贝**后才允许写进度：mockState 在这里踩过同一条纪律
  // （共享引用 = 一次点亮污染全项目）。
  const endgameGoals = JSON.parse(JSON.stringify(ENDGAME_GOALS)) as typeof ENDGAME_GOALS;
  for (const goal of endgameGoals) {
    // 空档的进度从 0 现算：净值 0 落在财富曲线的最底端，
    // 权重型目标的格子一格没亮（achievedAt 全为 null），合计自然是 0。
    if (goal.metric.kind === 'usd_net_worth') {
      goal.progress = wealthProgressRatio(0);
    } else if (goal.metric.kind === 'milestone_weights') {
      goal.progress = goal.milestones.reduce((s, m) => s + (m.achievedAt ? m.weight : 0), 0);
    }
  }

  const evolutionNodes = JSON.parse(JSON.stringify(EVOLUTION_NODES)) as typeof EVOLUTION_NODES;
  // 一格都不点亮：mock 里的 cb_1 是那份存档自己的历史，空档没有这种历史。
  const BRANCHES: EvolutionBranch[] = [
    'COMPUTE_BIOLOGY',
    'ENERGY',
    'MATERIALS',
    'INTELLIGENCE',
    'MEDICINE',
    'SPACE',
  ];
  const branchProgress = {} as Record<EvolutionBranch, number>;
  for (const branch of BRANCHES) {
    const nodes = evolutionNodes.filter((n) => n.branch === branch);
    branchProgress[branch] = nodes.length === 0 ? 0 : nodes.filter((n) => n.lit).length / nodes.length;
  }

  return {
    meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      // 每份新档有自己的种子（目前无读者，留给将来的程序化内容）
      seed: `earth-${now.getTime().toString(36)}`,
      slot: 'main',
      migrationHistory: [],
    },

    player: {
      // 占位称呼：全应用都用「你」称呼玩家，这不是名字，命名权在玩家手上
      handle: '你',
      motto: '',
      avatarUrl: null,
      currentSceneId: 'guanghua',
      attributes: { vit: 0, int: 0, foc: 0, cha: 0, wil: 0, cap: 0 },
      freeAttributePoints: 0,
      attributeHistory: [],
      energy: { current: STARTING_ENERGY, max: STARTING_ENERGY, lastRegenAt: nowIso },
      selfDeclaredPhaseName: null,
      createdAt: nowIso,
      // 建角当天算第 1 天（与 touchPlayer 的"含今天"计数一致）
      daysActive: 1,
      lastActiveLocalDate: localDateKey(now),
    },

    vault: {
      cash: 0,
      holdings: [],
      liabilities: 0,
      transactions: [],
      netWorthHistory: [],
      displayCurrency: 'USD',
      monthlyBurn: 0,
    },

    careers: {
      // 四条初始职业线**全部在场**（目录说的是「初始 4 条」），
      // 只是全部停在 Lv.1 / 0 EXP —— 不是"未解锁"，是"还没开始动"。
      tracks: CLASSES.map((entry) => ({
        classId: entry.classId,
        displayName: entry.displayName,
        creed: entry.creed,
        level: 1,
        exp: 0,
        expToNext: expToNext(entry.expCurve, 1),
        expCurve: entry.expCurve,
        titleTiers: entry.titleTiers,
        domains: entry.domains,
        linkedGoalIds: entry.linkedGoalIds,
        attributeWeights: entry.attributeWeights,
        chainIds: [],
        stats: {
          questsCompleted: 0,
          questsAbandoned: 0,
          expEarnedTotal: 0,
          vaultEarnedTotal: 0,
          firstQuestAt: null,
          lastQuestAt: null,
        },
        unlockedAt: nowIso,
        createdByAgentId: null,
        pinned: false,
      })),
      // 空档没有"正在走的职业线"，由选择器回退到等级最高那条（并列时取首条）
      activeClassId: null,
      retiredClassIds: [],
    },

    chapters: {
      activeChapterIds: ['CH1'],
      focusedChapterId: 'CH1',
      chapters: CHAPTERS.map((def) => {
        const isCurrent = def.id === 'CH1';
        return {
          id: def.id,
          unlocked: isCurrent,
          completed: false,
          // 条件进度行由篇章引擎在第一次写入时按事实派生（deriveRows），
          // 这里不替它预写 —— 预写就等于替引擎撒了一次谎。
          conditionProgress: [],
          expEarnedInChapter: 0,
          questsCompletedInChapter: 0,
          startedAt: isCurrent ? nowIso : null,
          completedAt: null,
          playerChosenCodename: null,
          codenameSource: null,
          // 建角时净资产为 0：如实记下（引擎对 0 / null 的除法护栏见 chapterEngine）
          entryNetWorthUsdCents: isCurrent ? 0 : null,
        };
      }),
      completedCount: 0,
      pendingCeremony: null,
    },

    endgame: { goals: endgameGoals },

    evolution: {
      revealed: false, // 静默运转。UI 层不得读取本对象的任何字段。
      revealedAt: null,
      revealMomentShown: false,
      nodes: evolutionNodes,
      techMilestones: [],
      revealConditions: JSON.parse(JSON.stringify(EVOLUTION_REVEAL_CONDITIONS)) as typeof EVOLUTION_REVEAL_CONDITIONS,
      stats: {
        litNodeCount: 0,
        totalNodeCount: evolutionNodes.length,
        branchProgress,
        lastLitAt: null,
      },
      sceneHooks: [],
    },

    quests: {
      byId: {},
      order: [],
      archivedIds: [],
      chains: {},
      lastSweepAt: null,
    },

    dailies: {
      definitions: [],
      recommendations: [],
      logs: {},
      // 「已经结算完毕的最后一天」= 建角当天：新档没有需要补结的历史
      lastSettledLocalDate: today,
      pendingRolloverNotice: null,
    },

    weeklies: {
      definitions: [],
      logs: {},
      lastSettledWeekStart: weekStartKey(today),
      pendingWeeklyNotice: null,
    },

    journal: {
      entries: [],
      monthlyDigests: [],
      stats: {
        totalEntries: 0,
        totalReflectionWords: 0,
        totalBonusExp: 0,
        averageBonusPct: 0,
        currentWritingStreakDays: 0,
        bestWritingStreakDays: 0,
      },
    },

    network: {
      contacts: [],
      graphLayout: {},
      lastReminderCheckAt: null,
      gradeWeights: { ...DEFAULT_GRADE_WEIGHTS },
      solverLog: [],
    },

    milestones: {
      records: [],
      counters: {},
      monthlyExpGranted: {},
      introducedToPlayer: false,
    },

    agents: {
      // 花名册是出厂阵容，不是测试数据 —— 但每一个的账都是零：
      // 一次都没被调用过（mock 里那条"被调用过 6 次"只属于 mock）。
      records: createAgentRoster(nowIso),
      invocations: [],
      dispatcherId: 'agent_dispatcher',
      retiredClassIds: [],
    },

    ai: {
      provider: 'mock',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKeyStorageKey: STORAGE_KEYS.apiKey,
      configured: false,
      mockModeEnabled: true,
      usage: {
        month: localMonthKey(now),
        tokensIn: 0,
        tokensOut: 0,
        costUsdCents: 0,
        budgetUsdCents: 2_000, // $20 / 月（默认预算，可在设置里改）
      },
      lastHealthCheck: null,
      circuitBreaker: { open: false, consecutiveFailures: 0, openedAt: null },
    },

    world: {
      activeSceneId: 'guanghua',
      unlockedSceneIds: ['guanghua'],
      customLocationLabel: null,
      anchorOverrides: {},
      gpsAllowed: false, // 隐私优先，默认关
      lastGpsFix: null,
    },

    events: [],

    settings,

    unlockables: {
      // 空白起步：建角那一刻，这个人还没有任何一枚徽记。
      // 三档队列（判据 / 日期 / 待看）都从空开始，由成就引擎在第一次写入时
      // 按真实状态现算 —— 空档不预置任何"你已经做到过"的东西。
      achievementIds: [],
      achievementUnlockedAt: {},
      pendingAchievementIds: [],
      easterEggIds: [],
      tourCompleted: {},
    },
  };
}
