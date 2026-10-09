// ============================================================================
// EarthOnline · Phase 4 · 异步外壳 (thunks)
//
// `operations.ts` 是纯的、同步的、确定性的：给它一样的状态与一样的入参，
// 它永远给出同一个结果，不读时钟、不发请求、不知道"模型"是什么。
//
// 这个文件是它**上面**的那一层。一次 Agent 调用的全部脏活都在这里：
//
//   ① 起落加载态 —— 发请求前点亮「谁在工作」，`finally` 里熄灯；
//   ② 走总线 —— 重试 / 超时 / 熔断 / 预算四条闸门由 `bus.ts` 判定，
//      任何一条不通过就优雅降级成替身；
//   ③ 硬校验 —— schema 拦形状（`bus.ts` 里），适配器拦语义（`adapters.ts`）；
//   ④ 只递干净的 payload —— 走到 `mutate()` 的那一包东西已经不再是"模型说的话"，
//      而是**系统认过的账**。
//
// ---------------------------------------------------------------------------
// 为什么是工厂而不是一批裸函数
// ---------------------------------------------------------------------------
// `createThunks(deps)` 的六个依赖全是注入的。这不是为了好看：
//   · verify-ops 可以拿一个可变的状态格子 + 一个假 fetch，把 Mock 与 Live
//     两条轨道**完整跑一遍**，不必把整个 store（含 LocalStorage 通道）拖进来；
//   · 测的那个 `applyAgentEffect` 就是跑的那一个（同一份模块导出）；
//   · "现在几点" 与 "密钥是什么" 在这里是参数，于是整条管线可回放。
//
// 生产环境的单例在 `store/agentRuntime.ts` 里组装 —— 那里才可以同时
// 看得见 store 与 secretStore，而这两个都不该被 `ai/` 层知道。
//
// ---------------------------------------------------------------------------
// 一条贯穿全文件的原则：**降级要留痕，但不必都喊出来**
// ---------------------------------------------------------------------------
// 闸门拦下（没配密钥、玩家自己开了离线、熔断、超预算）与真调用失败
// 在结果里长得一模一样 —— 都是"拿替身顶上"。区分它们的是 `BusEffect.reason`
// （见 bus.ts 的注释）。这里据此决定要不要打扰玩家：见 `shouldNotify`。
// ============================================================================

import {
  adaptAdvisorDraft,
  adaptArbiterVerdict,
  adaptClassOutput,
  adaptSolverReport,
  isUsableForge,
  normalizeRerouteOutcome,
  resolveRoutedClass,
  sanitizeDispatcherDecision,
} from '@/ai/adapters';
import { invokeAgent } from '@/ai/bus';
import type { AgentCall, BusContext, BusEffect } from '@/ai/bus';
import type { FetchLike } from '@/ai/gateway';
import { CLASS_PROMPT_REF, REROUTE_PROMPT, ROLE_PROMPTS, buildSystemPrompt } from '@/ai/prompts';
import {
  buildAdvisorPayload,
  buildArbiterPayload,
  buildClassPayload,
  buildDispatcherPayload,
  buildReroutePayload,
  buildReviewerPayload,
  buildSolverPayload,
} from '@/ai/payloads';
import type { SchemaName } from '@/ai/schemas';
import { getClass } from '@/data/catalog/classes';
import { REROUTE_REQUEST_MAX_LEN } from '@/data/catalog/policy';
import { buildDigest } from '@/lib/digest';
import { localMonthKey } from '@/lib/format';
import { mockArbiter, toTurnInInput } from '@/lib/mockArbiter';
import {
  mockAdvisorOutput,
  mockChainReviewOutput,
  mockClassAgentOutput,
  mockDispatcherDecision,
  mockSolverOutput,
} from '@/lib/mockAgents';
import { routeClass } from '@/lib/mockForge';
import { DEFAULT_REROUTE_REQUEST, mockReroute } from '@/lib/mockReroute';
import {
  askNetworkAdvisor,
  completeQuest,
  consultNetworkSolver,
  generateQuestChain,
  regenerateQuestChain,
  regenerationIdea,
  rerouteQuestDraft,
  successorOf,
} from '@/store/operations';
import type {
  AgentId,
  AgentInvocationLog,
  AgentKind,
  AgentRuntimeConfig,
  ClassAgentOutput,
  ClassIdLiteral,
  ChainReviewOutput,
  DispatcherDecision,
  EarthOnlineState,
} from '@/types';

// ---------------------------------------------------------------------------
// 对外形状
// ---------------------------------------------------------------------------

/** 这次结果是谁给的。`'mock'` 包含了"闸门拦下"与"真调用失败后降级"两者 */
export type ThunkSource = 'api' | 'mock';

export type ThunkResult<T> =
  | { ok: true; data: T; source: ThunkSource; corrections: string[] }
  | { ok: false; message: string };

/**
 * 铸链的入口语境。**只影响对玩家说的话** —— 失败提示与等待文案里
 * "你的东西还在哪"；三条路走的是同一根管线（调度 → 生成 → 落「待议」）。
 *
 *   spark      —— 灵感框。失败了，那段话还在框里。
 *   commission —— 悬赏板「让调度员出题」。没有框，素材是系统自己组的处境。
 *   goal       —— 圣殿「拆解成任务链」。素材是目标卡上的那一格里程碑。
 */
export type ForgeSource = 'spark' | 'commission' | 'goal';

/**
 * 一条要弹给玩家的提示。
 *
 * `action` 是 PO 要的那个「一键切换至 Mock 模式」——
 * 它不是每一句提示都该有（"模型返回的内容不合规"就没什么可切的），
 * 所以它是可选字段而不是布尔开关。
 */
export interface Notice {
  tone: 'info' | 'warn';
  title: string;
  body: string;
  action: { kind: 'enable_local_track'; label: string } | null;
}

export interface ThunkDeps {
  getState: () => EarthOnlineState;
  mutate: (pure: (prev: EarthOnlineState) => EarthOnlineState) => void;
  beginAgentCall: (activity: { agentId: string; name: string; label: string }) => string;
  endAgentCall: (id: string) => void;
  notify: (notice: Notice) => void;
  /** 落一次调用的账（用量 / 日志 / 履历）。生产环境就是 `store/agentEffect.ts` 那一份 */
  applyAgentEffect: (effect: BusEffect, month: string) => void;
  /** 明文密钥的读取口。`secretStore.readApiKey` 是唯一实现 */
  readApiKey: () => string | null;
  /** 注入的 fetch（测试用；不传则用全局 fetch） */
  fetchImpl?: FetchLike;
  /** 注入的时钟（测试用） */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const clip = (text: string, n: number): string =>
  text.length <= n ? text : `${text.slice(0, n - 1)}…`;

const KIND_LABEL: Record<AgentKind, string> = {
  dispatcher: '调度 · 分配者',
  class: '职业线 · 生成者',
  blueprints: '蓝图 · 铸造者',
  network_advisor: '社交 · 智囊',
  arbiter: '复盘 · 判官',
  chain_reviewer: '深度推演 · 审核官',
};

/**
 * 从花名册里找该干活的那个 Agent。
 *
 * ⚠️ 不拼 `agent_class_${classId}` 那种字符串：花名册里的真实 id 是
 *    `agent_class_compbio` 而不是 `agent_class_computational_biology`
 *    （见 mockState 的花名册）。拼出来的 id 在 `records` 里查不到，
 *    于是调用日志里那个人永远不会有履历 —— 一个不会报错的谎。
 *
 * 三级退路：精确（种类 + 职业线）→ 同种类第一个 → 任何一种类的第一个。
 * 都找不到时给一个诚实的兜底名字，而不是崩掉：花名册缺人不是玩家的错。
 */
const resolveAgent = (
  state: EarthOnlineState,
  kind: AgentKind,
  classId: ClassIdLiteral | null,
): { id: AgentId; name: string } => {
  const ofKind = state.agents.records.filter((r) => r.kind === kind && r.status !== 'retired');
  const exact = classId === null ? undefined : ofKind.find((r) => r.classId === classId);
  const picked = exact ?? ofKind[0] ?? state.agents.records.find((r) => r.kind === kind);
  return picked
    ? { id: picked.id, name: picked.profile.displayName }
    : { id: `agent_${kind}` as AgentId, name: KIND_LABEL[kind] };
};

// ---------------------------------------------------------------------------
// 提示判定
// ---------------------------------------------------------------------------

/**
 * 这次降级要不要跟玩家说一声。
 *
 * 三条判据，从"是不是意外"出发而不是从"错没错"出发：
 *
 *   · `source === 'api'` —— **发出去了，失败了**。断网、超时、429、模型吐了
 *     不合法的 JSON……除了最后一类（模型自己的问题，替身接得住），其余都意味着
 *     "你刚才那一下没有真的发生"。玩家有权知道。
 *     钱花掉了也一样：账要记，但不必替他做主瞒着。
 *
 *   · 玩家**自己**开着离线开关（或把提供方设成了 mock）—— 那是他的选择，
 *     不是意外。每点一次弹一次"你正在用离线模式"是纯粹的骚扰。
 *
 *   · `budget_exceeded` —— 设计内的静默降级。预算是玩家自己设的，
 *     用尽后自动降级是它承诺过的行为（bus.ts 的闸门 ③）。不提示。
 *
 * 其余（没配密钥、熔断打开）都要说 —— 前者是 PO 点名的那条 401 路径，
 * 后者意味着"后台连着坏了几次"，两件事玩家都该知道，且都能一键切到本地轨道。
 */
const shouldNotify = (
  reason: NonNullable<BusEffect['reason']>,
  state0: EarthOnlineState,
): boolean => {
  if (reason.source === 'api') return true;
  if (state0.ai.mockModeEnabled || state0.ai.provider === 'mock') return false;
  if (reason.code === 'budget_exceeded') return false;
  return true;
};

const ENABLE_LOCAL: Notice['action'] = {
  kind: 'enable_local_track',
  label: '先切到本地轨道',
};

const noticeFor = (reason: NonNullable<BusEffect['reason']>): Notice => {
  // 密钥无效 —— 它有一条自己的说法（PO 裁定）。这是唯一一种"重试没有意义"的失败：
  // 不能含糊地说"这次没接上"，否则玩家会去检查网络，而真正要改的那一格在控制室。
  // 也**不提熔断**：401 不计入熔断失败数（bus.ts 的 tripsCircuit），所以
  // "冷却结束后会自动恢复"这句话在这里是假的 —— 密钥不改，它不会恢复。
  if (reason.code === 'unauthorized') {
    return {
      tone: 'warn',
      title: 'API Key 无效',
      body: '请在控制室核对密钥。这一步已经用本地轨道顶上，你可以先继续；改完密钥会自动切回。',
      action: ENABLE_LOCAL,
    };
  }
  if (reason.source === 'api') {
    return {
      tone: 'warn',
      title: '这次没接上',
      body: `${reason.message} 这一步已经用本地轨道顶上，你可以先继续；等网络稳了再试一次。`,
      action: ENABLE_LOCAL,
    };
  }
  if (reason.code === 'circuit_open') {
    return {
      tone: 'warn',
      title: 'AI 服务暂时熔断',
      body: `${reason.message} 这几分钟里都会走本地轨道，冷却结束后会自动恢复。`,
      action: ENABLE_LOCAL,
    };
  }
  return {
    tone: 'info',
    title: '走的是本地轨道',
    body: `${reason.message} 这一步由本地模板生成，内容和真身的骨架一致；配好密钥后会自动切换。`,
    action: ENABLE_LOCAL,
  };
};

// ---------------------------------------------------------------------------
// 任务链生成的两棒都开深度思考（2026-10-09 PO 裁定）
// ---------------------------------------------------------------------------

/**
 * 生成与审核两棒的运行时覆盖：**显式打开思考模式**，并把输出上限顶到
 * 模型文档上限。
 *
 * - `thinking: 'enabled'` —— 让模型先想再写。一条链要拆到几十步、每步
 *   15 分钟 ~ 2 小时，规划本身就值得花 token；这是 2026-10-07 事故修复时
 *   特意留的那个「显式运行时开关」（见 gateway.ts 里那段注释），现在第一次用上。
 *   别的小决策（调度、改法、顾问、判官）保持默认关闭 —— 快而省，
 *   且它们输出短、不太吃规划。
 * - `maxTokens: 393216` —— PO 裁定「不必设置任务链的 token 上限」。这是
 *   deepseek-flash 的文档输出上限（384K）；max_tokens 是**天花板不是预算**，
 *   顶到模型上限不花钱。几十步的链与思考 token 共享这一份额度，不会被截断。
 *   代价要说清：思考 token 按输出计费，等待也变长 —— 这是换「更小更具体」
 *   付的账，PO 已知并接受。
 * - `timeoutMs: 240_000` —— 思考 + 长输出的往返远超默认 60s。
 *
 * ⚠️ 只喂给**任务链生成 / 整链重抽 / 深度推演审核**三处（见各自调用点）。
 *    「换个做法」（reroute）同属 class 种类，但输出只有一步，保持默认快路径。
 */
const DEEP_CHAIN_RUNTIME: Partial<AgentRuntimeConfig> = {
  thinking: 'enabled',
  maxTokens: 393216,
  timeoutMs: 240_000,
};

// ---------------------------------------------------------------------------
// 跑一次调用（私有）
// ---------------------------------------------------------------------------

interface AgentRun<T> {
  kind: AgentKind;
  agentId: AgentId;
  agentName: string;
  purpose: AgentInvocationLog['purpose'];
  /** 加载遮罩上那行字，例如「正在辨认这段想法属于哪条线…」 */
  label: string;
  /** 角色提示词正文（改法用的是 `REROUTE_PROMPT`，不是按种类取的） */
  rolePrompt: string;
  /** 覆盖按种类推导的 schema（改法用它指定 `rerouteDraft`） */
  schemaName?: SchemaName;
  payload: unknown;
  /** Mock 轨道返回什么。**必须与真身同构**（契约形状），理由见 mockAgents.ts 的文件头 */
  mock: () => T;
  runtimeOverrides?: Partial<AgentRuntimeConfig>;
}

interface AgentRunResult<T> {
  data: T;
  source: ThunkSource;
  corrections: string[];
}

/**
 * 一次调用的完整生命周期。所有 thunk 都从这里走，没有第二条路 ——
 * 于是"忘了熄灯""忘了记账""忘了弹提示"这三类 bug 在结构上不可能发生。
 *
 * 返回 `null` 表示**连替身都拿不出来**（`call.mock` 缺失且真调用失败）。
 * 本文件里每一处调用都给了 `mock`，所以那条路理论上走不到 —— 但接口上留着，
 * 因为"理论上走不到"的分支一旦真的走到了，静默返回一个空对象是最坏的处理。
 */
const makeRunner =
  (deps: ThunkDeps) =>
  async <T>(
    state0: EarthOnlineState,
    now: Date,
    run: AgentRun<T>,
    /**
     * 本次用户操作里"这句话已经说过了"的集合。
     *
     * 一次操作可能叫醒两三个 Agent，而它们多半会因为**同一个**原因一起降级
     * （没配密钥、熔断、断网）。不去重的话，玩家点一下"生成"会看到两条
     * 一字不差一样的提示条 —— 那不是"更清楚"，那是噪音。
     * 归并的单位因此是**这次点击**，不是这次调用。
     */
    said?: Set<string>,
  ): Promise<AgentRunResult<T> | null> => {
    const activityId = deps.beginAgentCall({
      agentId: run.agentId,
      name: run.agentName,
      label: run.label,
    });

    try {
      const call: AgentCall<T> = {
        agentId: run.agentId,
        kind: run.kind,
        purpose: run.purpose,
        systemPrompt: buildSystemPrompt({
          rolePrompt: run.rolePrompt,
          digest: buildDigest(state0, now),
        }),
        payload: run.payload,
        ...(run.schemaName ? { schemaName: run.schemaName } : {}),
        ...(run.runtimeOverrides ? { runtimeOverrides: run.runtimeOverrides } : {}),
        mock: run.mock,
      };

      const ctx: BusContext = {
        // ⚠️ 这里读的是**此刻**的 ai，不是这次操作开始时的 `state0.ai`。
        //
        //    两次调用之间，前一次的 effect 已经落进存档了（熔断计数、本月用量）。
        //    拿快照的话，同一个操作里的第二次失败会拿"开局那个计数 + 1"再算一遍，
        //    把前一次刚记下的失败**覆盖掉** —— 于是"连着坏三次就熔断"在一键之内
        //    永远数不到三，玩家要多点几次才能等到后台停下来。
        //    这是 verify-ops ㉕ 抓到的（先断网再数 consecutiveFailures）。
        //
        //    读活的还有一个顺带的好处：一次操作如果中途就把本月预算花光了，
        //    后面那几次调用会被预算闸门拦下，而不是继续花。
        ai: deps.getState().ai,
        apiKey: deps.readApiKey(),
        // ⚠️ 固定时钟：一次调用里"现在"就是那一个时刻。
        //    让 bus 每次读表的话，两段重试之间能跨过一整个熔断冷却期。
        now: () => now,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      };

      const outcome = await invokeAgent(call, ctx);

      // 落账：无论走的是哪条轨道，这次调用对存档的影响都在这里一次性写回。
      // 它与下面那次领域落库是**两笔**（调用的发生 ≠ 结果的采纳），
      // 所以是两个 mutate —— 合成的代价是"一次生成失败也把用量记丢了"。
      deps.applyAgentEffect(outcome.effect, localMonthKey(now));

      const reason = outcome.effect.reason;
      if (reason !== null && shouldNotify(reason, state0)) {
        const key = `${reason.source}:${reason.code}`;
        if (!said || !said.has(key)) {
          said?.add(key);
          deps.notify(noticeFor(reason));
        }
      }

      if (!outcome.result.ok) return null;

      return {
        data: outcome.result.data,
        source: outcome.result.source === 'api' ? 'api' : 'mock',
        corrections: [...outcome.result.corrections],
      };
    } catch (err) {
      // `invokeAgent` 把网络层的失败都吞进了结果信封，所以走到这里说明是**我们这边**的问题
      // （注入的 fetch 抛了、适配器前的某一步炸了）。即便如此也不能把玩家留在加载态里 ——
      // 而 `finally` 保证的就是这件事。
      deps.notify({
        tone: 'warn',
        title: '这一步出了点问题',
        body: `${err instanceof Error ? err.message : String(err)} 已回退到本地轨道，你可以再试一次。`,
        action: ENABLE_LOCAL,
      });
      return null;
    } finally {
      deps.endAgentCall(activityId);
    }
  };

const mergeSource = (a: ThunkSource, b: ThunkSource): ThunkSource => (a === 'api' || b === 'api' ? 'api' : 'mock');

/**
 * 玩家直接点了某条职业线时用的**合成调度决定**。
 *
 * 不为此叫醒 Dispatcher：它要判断的那件事，玩家刚刚自己回答了。
 * 一次 API 调用换回一个已经知道的答案，是纯粹的浪费 —— 而且会让
 * "我明明选了这条线，它怎么给我出了别的"这种事真的发生。
 *
 * `primaryConfidence` 给 1：这不是猜的。
 */
const directedDecision = (idea: string, classId: ClassIdLiteral): DispatcherDecision => ({
  intentSummary: clip(idea, 40),
  language: 'zh',
  routing: {
    primaryClass: classId,
    primaryConfidence: 1,
    secondaryClassIds: [],
    rationale: '玩家直接指定了这条职业线，无需调度员判定',
  },
  proposedClass: null,
  // 8 = PO 2026-10-09 口径的下沿（建议 8~40，上限 60）。玩家直点职业线时
  // 没有一个真调度员给厚度建议，取"建议带"的下沿是诚实的默认值。
  questShape: { kind: 'chain', suggestedChainLength: 8, suggestedType: 'side' },
  linkedGoalIds: [...(getClass(classId)?.linkedGoalIds ?? [])],
  clarification: null,
  recommendDeepDeduction: false,
  recommendReason: '',
});

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export const createThunks = (deps: ThunkDeps) => {
  const runAgent = makeRunner(deps);
  const clock = (): Date => deps.now?.() ?? new Date();

  // -------------------------------------------------------------------------
  // A · 灵感中枢 → 一条链
  // -------------------------------------------------------------------------

  /**
   * 从一句灵感铸造一条链：调度 → 生成 →（可选）深度推演 → 落「待议」。
   *
   * 三个入口共用它：灵感框（玩家自己写的句子）、悬赏板的「让调度员出题」
   * （素材 = 聚焦篇章 + 最近的终极目标）、圣殿的「拆解成任务链」
   * （素材 = 某个目标未点亮的那一格）。后两个的素材由 `lib/questBriefs`
   * 组合，落到这里都只是同一句 `idea`。
   *
   * 落库仍然走 `generateQuestChain`，产出仍然**全部落在 `draft`** ——
   * 铸造 ≠ 生效这条规则没有因为接上真身而松动。
   */
  const forgeChain = async (input: {
    idea: string;
    classId: ClassIdLiteral | null;
    deepDeliberation: boolean;
    /** 入口语境（见 ForgeSource）。不影响管线，只决定"东西还在哪"那句话怎么说 */
    from?: ForgeSource;
  }): Promise<ThunkResult<{ chainId: string; classId: ClassIdLiteral; stepCount: number }>> => {
    const state0 = deps.getState();
    const now = clock();
    const idea = input.idea.trim();
    if (idea.length === 0) return { ok: false, message: '还没有写下任何想法。' };

    // 失败时那句"你的东西还在哪"按入口换：灵感框里的话当然还在框里，
    // 而「让调度员出题」「拆解成任务链」没有框 —— 说"灵感还在框里"
    // 会让玩家去找一个不存在的东西。
    const from = input.from ?? 'spark';
    const retry = from === 'spark' ? '灵感还在框里，再试一次。' : '再试一次。';
    const routeLabel =
      from === 'commission'
        ? '调度员正在看你的近况…'
        : from === 'goal'
          ? '正在把它拆成能落地的几步…'
          : '正在辨认这段想法属于哪条线…';

    const corrections: string[] = [];
    // 一次点击 = 一条提示。深推演会连叫两个 Agent，若两次都因同一个原因（比如余额见底）
    // 被拦下，不去重就会弹出两条一模一样的提示条 —— 玩家会以为点了两次。
    const said = new Set<string>();
    let source: ThunkSource = 'mock';

    // —— ① 这段想法属于哪条线 ——
    let decision: DispatcherDecision;
    if (input.classId !== null) {
      decision = directedDecision(idea, input.classId);
    } else {
      const agent = resolveAgent(state0, 'dispatcher', null);
      const run = await runAgent(state0, now, {
        kind: 'dispatcher',
        agentId: agent.id,
        agentName: agent.name,
        purpose: 'route_idea',
        label: routeLabel,
        rolePrompt: ROLE_PROMPTS.dispatcher,
        payload: buildDispatcherPayload(state0, { idea, deepDeliberation: input.deepDeliberation }),
        mock: () => mockDispatcherDecision(idea),
      }, said);
      if (run === null) return { ok: false, message: `调度员这次没接上。${retry}` };
      decision = run.data;
      // 调度员写了目录外的目标 id（模型自造的那种）时，在这里擦掉并留痕。
      // 以前 schema 的 enum 会把**整次调度**硬拒 —— 2026-10-07 事故，
      // 见 adapters.filterGoalIds 的注释。丢弃不认得的，其余照常使用。
      const cleanedDecision = sanitizeDispatcherDecision(decision);
      corrections.push(...cleanedDecision.corrections);
      decision = cleanedDecision.value;
      // ⚠️ 调度员的来源**不进**最终的 source：它出的是路由决定（这条想法走哪条线），
      //    那些字一个也不会落进任务链。链上每个字都是从生成那一棒来的 ——
      //    那一棒的来源在下面合并（见 classRun 旁的注释）。若在这里并进来，
      //    "调度走通了真身、生成却由替身顶上"（比如线上那次空内容）会被报成 api，
      //    而落库的是本地模板 —— 正是 ⑤ 的 !usable 分支里说过的那个"不会报错、
      //    只会让人误判的谎"，只是换了个入口。
      corrections.push(...run.corrections);
    }

    // —— ② 归属确认：'NEW' 与目录外的 id 一律退回关键词路由 ——
    // 退路是 `routeClass(idea)`：它至少保证玩家这次点击**有东西出来**。
    // 一次失败的生成比一次保守的生成糟得多（见 adapters.resolveRoutedClass 的注释）。
    const routed = resolveRoutedClass(decision, routeClass(idea));
    corrections.push(...routed.corrections);
    const classId = routed.value;

    // —— ③ 生成 ——
    const classAgent = resolveAgent(state0, 'class', classId);
    const classRun = await runAgent(state0, now, {
      kind: 'class',
      agentId: classAgent.id,
      agentName: classAgent.name,
      purpose: 'generate_quests',
      label: '正在把这一步拆成一条链…',
      // 蓝图为新职业线生成的提示词将在 Phase 5 从这里接进来（按 classId 查库）
      rolePrompt: CLASS_PROMPT_REF[classId] ?? ROLE_PROMPTS.dispatcher,
      payload: buildClassPayload(state0, { classId, idea, decision }, now),
      // 深想 + 不设 token 上限：几十步的链从这里来（见 DEEP_CHAIN_RUNTIME）
      runtimeOverrides: DEEP_CHAIN_RUNTIME,
      mock: () =>
        mockClassAgentOutput({
          idea,
          classId,
          deepDeliberation: input.deepDeliberation,
          existingTitles: state0.quests.order
            .map((id) => state0.quests.byId[id]?.title)
            .filter((t): t is string => typeof t === 'string'),
        }),
    }, said);
    if (classRun === null) return { ok: false, message: `生成这一步没接上。${retry}` };
    const classOut: ClassAgentOutput = classRun.data;
    // 落库的字从这一棒来，来源就记这一棒的：bus 在生成失败（空内容 / schema 不过 /
    // 断网）时会把替身的稿子交回来（source='mock'）—— 这时最终来源必须是 mock。
    // 与 ⑤ 的 !usable 分支同一条规矩：真调用发生过这件事由提示与日志负责。
    source = mergeSource(source, classRun.source);
    corrections.push(...classRun.corrections);

    // —— ④ 深度推演（可选）：第二双眼睛 ——
    let review: ChainReviewOutput | null = null;
    if (input.deepDeliberation) {
      const reviewer = resolveAgent(state0, 'chain_reviewer', null);
      const reviewRun = await runAgent(state0, now, {
        kind: 'chain_reviewer',
        agentId: reviewer.id,
        agentName: reviewer.name,
        purpose: 'review_chain',
        label: '审核官正在逐条过稿…',
        rolePrompt: ROLE_PROMPTS.chain_reviewer,
        payload: buildReviewerPayload(state0, { draft: classOut, idea }),
        // 审核官要把整条链（可能几十步）复述回来 —— 同样深想、同样不设上限
        runtimeOverrides: DEEP_CHAIN_RUNTIME,
        mock: () => mockChainReviewOutput({ drafts: classOut.quests }),
      }, said);
      if (reviewRun === null) {
        // 审核没接上**不**该毁掉整次铸造：稿子已经在手上，只是少了第二双眼睛。
        // 记一笔、照原稿落库 —— 这比"因为审核官请假就不让你生成"合理得多。
        //
        // ⚠️ 走不到这里的是**断网 / 超时 / 500** 那一类：那次调用有替身，bus 会
        //    照常返回一份"审过的"结果（source 变成 mock），提示条负责告诉玩家。
        //    真落到这一行，说明连替身都没能给出结果 —— 也就是我们这边抛了
        //    （见 makeRunner 的 catch）。两种降级的区别值得留在注释里：
        //    前者玩家只是少了一道工序，后者是外壳自己出了问题。
        corrections.push('审核官这次没接上，已按生成稿直接落库');
      } else {
        review = reviewRun.data;
        source = mergeSource(source, reviewRun.source);
        corrections.push(...reviewRun.corrections);
      }
    }

    // —— ⑤ 语义适配：到这里为止，它才第一次成为"能落库的东西" ——
    const adapted = adaptClassOutput(classOut, {
      classId,
      idea,
      deepDeliberation: input.deepDeliberation,
      review,
    });
    corrections.push(...adapted.corrections);

    const usable = isUsableForge(adapted);
    if (!usable) {
      // 模型这一稿凑不成链。递 `null` 就是让纯函数走替身 —— 那条路径一直在，
      // 与"没有密钥"走的是同一条。玩家这次点击必须**有东西出来**。
      //
      // ⚠️ 同时把 source 改回 `'mock'`：真调用虽然发生过，但**落库的不是它给的**。
      //    不改的话，界面会理直气壮地说"这一次是真身铸的"，而链上每个字都来自本地模板
      //    —— 一个不会报错、只会让人误判的谎。调用确实发生过这件事，由下面这条
      //    提示和调用日志共同负责，不该由 `source` 兼职。
      source = 'mock';
      deps.notify({
        tone: 'warn',
        title: '这一稿没能用上',
        body: '生成的结果凑不成一条链，已用本地模板先垫上。你可以先看着，也可以重抽一次。',
        action: null,
      });
    }

    const before = new Set(Object.keys(state0.quests.chains));
    deps.mutate((s) =>
      generateQuestChain(
        s,
        {
          idea,
          deepDeliberation: input.deepDeliberation,
          classId,
          forged: usable ? adapted.value : null,
        },
        now,
      ),
    );

    const after = deps.getState();
    const chainId = Object.keys(after.quests.chains).find((id) => !before.has(id));
    if (chainId === undefined) {
      return { ok: false, message: '链条没有落进存档。多半是状态在生成期间被改动了，你看一眼「待议」。' };
    }
    const stepCount = after.quests.chains[chainId]?.questIds.length ?? 0;

    return { ok: true, data: { chainId, classId, stepCount }, source, corrections };
  };

  /**
   * 整链重抽（仅在整条链都被逐条打回后可用，额度 1 次）。
   *
   * 与 `forgeChain` 的差别只在入口：这边职业线已经定了，也**不再**问调度员，
   * 且必走一遍深度推演的位置 —— 重抽这件事本身就是"上一稿没通过审"的结果。
   * 但额度与状态机全在 `regenerateQuestChain` 里，这里不重复判定。
   */
  const regenerateChain = async (input: {
    chainId: string;
  }): Promise<ThunkResult<{ chainId: string; stepCount: number }>> => {
    const state0 = deps.getState();
    const now = clock();
    const chain = state0.quests.chains[input.chainId];
    if (!chain) return { ok: false, message: '找不到这条链。' };

    const corrections: string[] = [];
    const classId = chain.classId;

    // ⚠️ 这一句必须与 `regenerateQuestChain` 内部算出来的**一模一样**：
    //    模型看到的输入与替身看到的输入是同一个字符串，否则"两条路同构"
    //    就只是句口号。所以两边共用 `regenerationIdea`（它在 operations 里）。
    const rejectedTitles = Object.values(state0.quests.byId)
      .filter((q) => q.chain?.chainId === input.chainId)
      .map((q) => q.title);
    const idea = regenerationIdea(chain.rationale, rejectedTitles, chain.review.playerNote);

    const classAgent = resolveAgent(state0, 'class', classId);
    const classRun = await runAgent(state0, now, {
      kind: 'class',
      agentId: classAgent.id,
      agentName: classAgent.name,
      purpose: 'generate_quests',
      label: '正在重抽这条链…',
      rolePrompt: CLASS_PROMPT_REF[classId] ?? ROLE_PROMPTS.dispatcher,
      payload: buildClassPayload(
        state0,
        {
          classId,
          idea,
          decision: directedDecision(idea, classId),
        },
        now,
      ),
      // 重抽与首发同规格：深想、不设 token 上限
      runtimeOverrides: DEEP_CHAIN_RUNTIME,
      mock: () =>
        mockClassAgentOutput({
          idea,
          classId,
          deepDeliberation: false,
          // 上一稿的标题**必须避开** —— 玩家点重抽的意思就是"别再给我这些"
          existingTitles: rejectedTitles,
        }),
    });
    if (classRun === null) return { ok: false, message: '重抽没接上，额度没有消耗，你可以再试一次。' };
    corrections.push(...classRun.corrections);

    const adapted = adaptClassOutput(classRun.data, {
      classId,
      idea,
      deepDeliberation: false,
      review: null,
    });
    corrections.push(...adapted.corrections);

    // 与 forgeChain 同一条判据：凑不成链就递 `null`，让纯函数走替身。
    // 重抽这条路尤其不能放行一步的"链"—— 玩家点重抽的意思是"再来一批"，
    // 给他一条比原来短得多的链是**更糟**的结果，还不如原样再铸一遍。
    deps.mutate((s) =>
      regenerateQuestChain(s, input.chainId, now, isUsableForge(adapted) ? adapted.value : null),
    );

    const after = deps.getState().quests.chains[input.chainId];
    if (after === undefined || after === chain) {
      return { ok: false, message: '这条链的重抽额度已经用过了。' };
    }

    return {
      ok: true,
      data: { chainId: input.chainId, stepCount: after.questIds.length },
      source: classRun.source,
      corrections,
    };
  };

  // -------------------------------------------------------------------------
  // B · 复盘判官
  // -------------------------------------------------------------------------

  /**
   * 结算一条任务：判官读复盘 → 质量档位 / 加成 / 点评 / 静默里程碑标签 → 落账。
   *
   * 空复盘**不叫醒判官**：那是"我不想写"的正常选择，不是一次失败的调用。
   * 基础奖励照发，但这笔调用根本不发生 —— 所以它在用量账与履历上都不留痕。
   */
  const judgeTurnIn = async (input: {
    questId: string;
    reflection: string;
  }): Promise<ThunkResult<{ questId: string; judged: boolean; bonusReason: string | null }>> => {
    const state0 = deps.getState();
    const now = clock();
    const quest = state0.quests.byId[input.questId];
    if (!quest) return { ok: false, message: '找不到这条任务。' };
    if (quest.status !== 'turn_in_pending') {
      return { ok: false, message: '这条任务已经结算过了。' };
    }

    const text = input.reflection.trim();
    if (text.length === 0) {
      deps.mutate((s) =>
        completeQuest(
          s,
          input.questId,
          { reflection: '', bonusPct: 0, bonusReason: null, verdict: null },
          now,
        ),
      );
      return {
        ok: true,
        data: { questId: input.questId, judged: false, bonusReason: null },
        source: 'mock',
        corrections: [],
      };
    }

    const agent = resolveAgent(state0, 'arbiter', null);
    const floor = state0.settings.rewardPolicy.reflectionWordCountFloor;
    const run = await runAgent(state0, now, {
      kind: 'arbiter',
      agentId: agent.id,
      agentName: agent.name,
      purpose: 'arbitrate_reflection',
      label: '判官正在读你的复盘…',
      rolePrompt: ROLE_PROMPTS.arbiter,
      payload: buildArbiterPayload(state0, { quest, reflection: text }),
      mock: () =>
        mockArbiter({
          reflection: text,
          questTitle: quest.title,
          difficulty: quest.difficulty,
          floorChars: floor,
        }),
    });
    if (run === null) {
      return { ok: false, message: '判官这次没接上。复盘还在框里，再试一次就行。' };
    }

    // 适配器拦语义（词表外的里程碑标签、超量的洞见），
    // 而加成数值的**最终裁决权**不在这里 —— 它在 `completeQuest` 的
    // `alignBonusPct` 里（AI 的数值幻觉破坏不了经济系统，见 types/state.ts）。
    const adapted = adaptArbiterVerdict(run.data);
    deps.mutate((s) => completeQuest(s, input.questId, toTurnInInput(adapted.value, text), now));

    return {
      ok: true,
      data: {
        questId: input.questId,
        judged: true,
        bonusReason: adapted.value.comment.trim() || null,
      },
      source: run.source,
      corrections: [...run.corrections, ...adapted.corrections],
    };
  };

  // -------------------------------------------------------------------------
  // C · 社交智囊（两个入口，同一个人）
  // -------------------------------------------------------------------------

  /** 「关于这个人，话怎么说」—— 产出进 `contact.adviceHistory` 存档 */
  const askAdvisor = async (input: {
    contactId: string;
    situation: string;
  }): Promise<ThunkResult<{ contactName: string }>> => {
    const state0 = deps.getState();
    const now = clock();
    const contact = state0.network.contacts.find((c) => c.id === input.contactId);
    if (!contact) return { ok: false, message: '通讯录里没有这位联系人。' };

    const payload = buildAdvisorPayload(
      state0,
      { contactId: input.contactId, situation: input.situation },
      now,
    );
    if (payload === null) return { ok: false, message: '通讯录里没有这位联系人。' };

    const agent = resolveAgent(state0, 'network_advisor', null);
    const run = await runAgent(state0, now, {
      kind: 'network_advisor',
      agentId: agent.id,
      agentName: agent.name,
      purpose: 'network_advice',
      label: '智囊正在读这份关系…',
      rolePrompt: ROLE_PROMPTS.network_advisor,
      payload,
      mock: () => mockAdvisorOutput({ contact, situation: input.situation, now }),
    });
    if (run === null) return { ok: false, message: '智囊这次没接上。你写的话还在，再试一次。' };

    const adapted = adaptAdvisorDraft(run.data);
    deps.mutate((s) => askNetworkAdvisor(s, input.contactId, input.situation, now, adapted.value));

    return {
      ok: true,
      data: { contactName: contact.alias ?? contact.name },
      source: run.source,
      corrections: [...run.corrections, ...adapted.corrections],
    };
  };

  /** 「有这件事，该找谁」—— 全局检索，产出进一条 `SolverConsultation` */
  const solveNetwork = async (input: {
    question: string;
  }): Promise<ThunkResult<{ recommendedCount: number }>> => {
    const state0 = deps.getState();
    const now = clock();
    const question = input.question.trim();
    if (question.length === 0) return { ok: false, message: '先说说卡在哪儿。' };

    const agent = resolveAgent(state0, 'network_advisor', null);
    const run = await runAgent(state0, now, {
      kind: 'network_advisor',
      agentId: agent.id,
      agentName: agent.name,
      purpose: 'network_advice',
      label: '智囊正在翻整个通讯录…',
      rolePrompt: ROLE_PROMPTS.network_advisor,
      payload: buildSolverPayload(state0, { question }, now),
      mock: () => mockSolverOutput({ contacts: state0.network.contacts, question, now }),
    });
    if (run === null) return { ok: false, message: '智囊这次没接上。你的问题还在，再试一次。' };

    // ⚠️ 这里拦住"模型编了一个通讯录里没有的人"。名单是我们发给它的，
    //    编得出来，所以必须在这里查一次 —— 玩家点过去会看到一张空卡片。
    const adapted = adaptSolverReport(run.data, state0.network.contacts);
    deps.mutate((s) => consultNetworkSolver(s, question, now, adapted.value));

    return {
      ok: true,
      data: { recommendedCount: adapted.value.recommendations.length },
      source: run.source,
      corrections: [...run.corrections, ...adapted.corrections],
    };
  };

  // -------------------------------------------------------------------------
  // D · 换个做法（单步平缓替换）
  // -------------------------------------------------------------------------

  /**
   * 把链上某一步重写成更可行的一版。
   *
   * 两条红线（降难度必降奖励、必带后继的 objective 原文）在**产出**这一侧执行：
   * 替身是 `mockReroute`，真身是 `adapters.normalizeRerouteOutcome`。
   * `rerouteQuestDraft` 只负责落库，它不重算奖励 —— 这件事写在
   * `types/state.ts` 的 `RerouteQuestDraft` 注释里，verify-ops 有一条
   * 交叉断言钉着"两条路算出来的 EXP 必须相等"。
   */
  const reroute = async (input: {
    questId: string;
    request: string;
  }): Promise<ThunkResult<{ questId: string; difficultyDrop: number; rejectedReason: string | null }>> => {
    const state0 = deps.getState();
    const now = clock();
    const quest = state0.quests.byId[input.questId];
    if (!quest) return { ok: false, message: '找不到这一步。' };
    if (!quest.chain) return { ok: false, message: '单条任务没有"下一步"，换个做法对它不适用。' };

    // 与 `rerouteQuestDraft` 内部**同一条**归一化：空则用缺省诉求、超长则截断。
    // 不这么做的话，模型看到的与落库的会是两份不同的文本，而日志里只会留一份。
    const asked =
      input.request.trim().slice(0, REROUTE_REQUEST_MAX_LEN) || DEFAULT_REROUTE_REQUEST;
    const successor = successorOf(state0, quest.chain.chainId, quest.chain.index);

    const agent = resolveAgent(state0, 'class', quest.classId);
    const run = await runAgent(state0, now, {
      kind: 'class',
      agentId: agent.id,
      agentName: agent.name,
      purpose: 'generate_quests',
      label: '正在重写这一步…',
      rolePrompt: REROUTE_PROMPT,
      // 输出是**一个裸的 QuestDraft**，不是整链信封
      schemaName: 'rerouteDraft',
      payload: buildReroutePayload(state0, { quest, successor, request: asked }),
      mock: () => mockReroute({ quest, successor, request: asked }).draft,
    });
    if (run === null) return { ok: false, message: '重写这一步没接上。原任务没动，你可以再试一次。' };

    const adapted = normalizeRerouteOutcome(quest, run.data);
    if (adapted.value === null) {
      deps.notify({
        tone: 'warn',
        title: '这次没改出可用的做法',
        body: '模型给出的替换件不完整，这一步保持原样。你可以换个说法再说一次。',
        action: null,
      });
      return { ok: false, message: '没能改出可用的做法。' };
    }

    deps.mutate((s) => rerouteQuestDraft(s, input.questId, asked, now, adapted.value));

    // 落库可能被三道闸门原样退回（不是 draft、单任务、额度用尽）。
    // 读回状态是最诚实的那种校验：不猜闸门是哪一道，只看结果有没有发生。
    const after = deps.getState().quests.byId[input.questId];
    if (after?.status !== 'rerouted') {
      return { ok: false, message: '这条链的改法额度用完了，或者这一步已经不在可改的状态。' };
    }

    return {
      ok: true,
      data: {
        questId: input.questId,
        difficultyDrop: adapted.value.difficultyDrop,
        rejectedReason: adapted.value.rejectedReason,
      },
      source: run.source,
      corrections: [...run.corrections, ...adapted.corrections],
    };
  };

  return { forgeChain, regenerateChain, judgeTurnIn, askAdvisor, solveNetwork, reroute };
};

export type Thunks = ReturnType<typeof createThunks>;
