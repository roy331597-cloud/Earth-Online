// ============================================================================
// EarthOnline · 出厂清场 · Agent 花名册（mock 与生产初始档的共享件）
//
// 这份名单原先长在 `mockState.ts` 里。清场时它被提出来，理由只有一个：
// **mock 存档与玩家的新建存档必须挂着同一份花名册** —— 调度、职业
// Agent、蓝图铸造者、社交智囊、复盘判官、审核官、定标师，是出厂阵容，不是测试数据。
//
// 清单挪了窝，值一个字都没动：人名、题记、温度、注入策略、prompt 文件名、
// promptVersion 全部与提取前逐字相同（提取时对着原文件抄，mock 的 991 条
// 断言是这件事的审计员）。
//
// ⚠️ mockState 里那句「计算生物学被调用过 6 次」的统计覆写**不在这里** ——
//    那是一次演示留下的账，只属于 mock 存档，留在 mockState.ts 原地。
// ============================================================================

import { getClass } from '@/data/catalog/classes';
import type {
  AgentRecord,
  AgentProfile,
  AgentRuntimeConfig,
  ClassIdLiteral,
  ISODateTime,
} from '@/types';

/** 按给定时刻铸一份完整花名册。每次调用返回全新对象（含 stats），调用方可放心改。 */
export function createAgentRoster(createdAt: ISODateTime): AgentRecord[] {
  const ctx = (over: Partial<AgentProfile['contextInjection']> = {}): AgentProfile['contextInjection'] => ({
    includePlayerAttributes: true,
    includeVaultSummary: false,
    includeActiveQuests: true,
    includeRecentJournal: true,
    includeCareerStats: true,
    includeNetworkSummary: false,
    ...over,
  });

  const runtime = (temperature: number, over: Partial<AgentRuntimeConfig> = {}): AgentRuntimeConfig => ({
    model: 'deepseek-flash',
    temperature,
    topP: 0.9,
    maxTokens: 3072,
    jsonMode: true,
    timeoutMs: 30_000,
    maxRetries: 2,
    ...over,
  });

  const zeroStats = (): AgentRecord['stats'] => ({
    invocations: 0,
    failures: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsdCents: 0,
    lastInvokedAt: null,
    parseSuccessRate: 1,
  });

  const mkAgent = (o: {
    id: string;
    kind: AgentRecord['kind'];
    classId?: ClassIdLiteral | null;
    displayName: string;
    tagline: string;
    promptRef: string;
    temperature: number;
    journalWindow?: number;
    injection?: Partial<AgentProfile['contextInjection']>;
    stats?: Partial<AgentRecord['stats']>;
    createdAt?: ISODateTime;
  }): AgentRecord => ({
    id: o.id,
    kind: o.kind,
    classId: o.classId ?? null,
    profile: {
      displayName: o.displayName,
      tagline: o.tagline,
      systemPromptRef: o.promptRef,
      contextInjection: ctx(o.injection),
      journalWindow: o.journalWindow ?? 5,
    },
    runtime: runtime(o.temperature),
    status: 'active',
    stats: { ...zeroStats(), ...o.stats },
    createdByAgentId: null,
    createdAt: o.createdAt ?? createdAt,
    retiredAt: null,
    promptVersion: 'v1.5',
  });

  const classAgent = (classId: ClassIdLiteral, id: string, promptRef: string): AgentRecord => {
    const entry = getClass(classId);
    if (!entry) throw new Error(`[agentRoster] 职业目录里没有：${classId}`);
    return mkAgent({
      id,
      kind: 'class',
      classId,
      displayName: entry.agentDisplayName,
      tagline: entry.agentTagline,
      promptRef,
      temperature: 0.7,
      injection: { includeVaultSummary: classId === 'investor' || classId === 'startup_entrepreneur' },
    });
  };

  return [
    mkAgent({
      id: 'agent_dispatcher',
      kind: 'dispatcher',
      displayName: '调度 · 分配者',
      tagline: '我不管你想做什么，我只管它该由谁来接手。',
      promptRef: '10-dispatcher.md',
      temperature: 0.2,
      journalWindow: 3,
    }),
    classAgent('computational_biology', 'agent_class_compbio', '20-class-computational-biology.md'),
    classAgent('investor', 'agent_class_investor', '21-class-investor.md'),
    classAgent('social_media_influencer', 'agent_class_influencer', '22-class-influencer.md'),
    classAgent('startup_entrepreneur', 'agent_class_entrepreneur', '23-class-entrepreneur.md'),
    classAgent('english_learner', 'agent_class_english', '25-class-english.md'),
    mkAgent({
      id: 'agent_blueprints',
      kind: 'blueprints',
      displayName: '蓝图 · 铸造者',
      tagline: '当现有职业装不下你想做的事，我来造一个新的容器。',
      promptRef: '24-class-blueprint-generator.md',
      temperature: 0.6,
    }),
    mkAgent({
      id: 'agent_network_advisor',
      kind: 'network_advisor',
      displayName: '社交 · 智囊',
      tagline: '我不教你话术。我只帮你把真正的意图说清楚。',
      promptRef: '30-network-advisor.md',
      temperature: 0.5,
      journalWindow: 3,
      injection: {
        includeVaultSummary: false,
        includeActiveQuests: false,
        includeCareerStats: false,
        includeNetworkSummary: true,
        includeRecentJournal: true,
      },
    }),
    mkAgent({
      id: 'agent_arbiter',
      kind: 'arbiter',
      displayName: '复盘 · 判官',
      tagline: '我读过太多漂亮的空话。所以只认具体的细节。',
      promptRef: '40-arbiter.md',
      temperature: 0.1,
      journalWindow: 8,
      injection: { includeActiveQuests: false, includeCareerStats: false, includeVaultSummary: false },
    }),
    mkAgent({
      id: 'agent_chain_reviewer',
      kind: 'chain_reviewer',
      displayName: '深度推演 · 审核官',
      tagline: '我唯一的工作，是在你动手之前先问一遍：这条链真的接得上吗。',
      promptRef: '50-chain-reviewer.md',
      temperature: 0.3,
      journalWindow: 3,
      injection: { includeActiveQuests: true, includeCareerStats: true },
    }),
    mkAgent({
      id: 'agent_diagnostician',
      kind: 'diagnostician',
      displayName: '定标 · 测绘者',
      tagline: '我不替你做决定，我只把你的起点量出来。',
      promptRef: '70-diagnostician.md',
      temperature: 0.3,
      // 定标看的是"这个人现在在哪"：属性与职业线等级在场；
      // 金库、人脉、在手任务一概不进 —— 起点不该被无关的近况带偏
      injection: { includeVaultSummary: false, includeActiveQuests: false, includeNetworkSummary: false },
    }),
  ];
}
