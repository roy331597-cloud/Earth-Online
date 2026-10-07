// ============================================================================
// EarthOnline · Phase 3 · AI 服务总线 (bus)
//
// gateway 知道怎么发请求，validate 知道怎么验结构。**bus 决定这件事该不该发生。**
//
// 它是全项目唯一一处"要不要花玩家的钱去问一次模型"的判断点，因此
// 这里集中了四条互相独立的闸门，任何一条不通过都退回 Mock 轨道：
//
//   ① mockModeEnabled           —— 玩家自己按下的开关，优先级最高；
//   ② 没有 API Key              —— 没得选，只能兜底；
//   ③ 本月花费超预算            —— budget_exceeded，静默降级（不打断玩家）；
//   ④ 熔断打开                  —— 连续失败 N 次后暂停，冷却期内不再发请求。
//
// 第 ③④ 条的区别值得写下来：
//   超预算是**确定**的（再发一次还是要花钱），所以直接降级；
//   熔断是**猜测**的（服务可能已经好了），所以带一个冷却期，
//   到点后半开一次试探 —— 一直关着会把一次网络抖动变成一整天的停摆。
//
// ⚠️ 本模块**不写 store**。它返回一个 effect，由调用方（store 或 UI）
//    决定怎么落库。这样它在 verify-ops 里可以脱离 React 完整跑一遍。
// ============================================================================

import { runtimeFor, SCHEMA_NAME_BY_KIND } from '@/ai/prompts';
import { SCHEMAS } from '@/ai/schemas';
import type { SchemaName } from '@/ai/schemas';
import { extractJson, validateAgainst } from '@/ai/validate';
import { chatCompletion } from '@/ai/gateway';
import type { FetchLike } from '@/ai/gateway';
import { redact } from '@/lib/secretStore';
import type {
  AgentErrorCode,
  AgentId,
  AgentInvocationLog,
  AgentKind,
  AgentResult,
  AgentRuntimeConfig,
  AiRuntimeState,
  InvocationId,
  ISODateTime,
} from '@/types';

// ---------------------------------------------------------------------------
// 计费与熔断的门槛
// ---------------------------------------------------------------------------

/**
 * DeepSeek 定价（2026-10 快照，单位：美分 / 百万 token）。
 * ⚠️ 这是**会过期的常量**。它只影响"本月花了多少"这条展示与预算闸门，
 *    不参与任何奖励计算 —— 所以过期了也不会算错玩家的账，只会算错我方的账。
 */
const PRICE_CENTS_PER_MILLION: { in: number; out: number } = { in: 27, out: 110 };

export const CIRCUIT_FAILURE_THRESHOLD = 3;
/** 熔断冷却：到点后放一次半开试探（见文件头第 ④ 条） */
export const CIRCUIT_COOLDOWN_MS = 5 * 60_000;

/**
 * **哪些失败才算"服务出问题了"。**（PO 裁定，2026-10-07）
 *
 *   5xx（网关归类为 `network_error`）与超时（`timeout`）→ 记一笔，攒够就熔断。
 *   **其余一律不记**，尤其是 401 / 403（`unauthorized`）。
 *
 * 为什么这条要单独成一张表：熔断是一个**关于对面**的判断（"这家服务现在不对劲"），
 * 而"密钥填错了"是一个**关于我们**的判断。把后者算进去，会得到这个症状 ——
 * 密钥填错两次之后，提示条改口说"AI 服务暂时熔断，冷却结束后会自动恢复"，
 * 于是玩家去检查网络，而真正要改的那一格在控制室里安安静静地放着。
 * 更糟的是它**不会报错**：冷却五分钟后自动恢复，玩家永远不知道那句话是假的。
 *
 * 429（`rate_limited`）也不在里面：它自带"稍后再试"的语义，由 gateway 的退避处理，
 * 而且它恰恰说明对面是活着的 —— 拿它去推开熔断等于把一个健康的服务停掉五分钟。
 */
const TRIPS_CIRCUIT: ReadonlySet<AgentErrorCode> = new Set<AgentErrorCode>(['network_error', 'timeout']);

const tripsCircuit = (code: AgentErrorCode): boolean => TRIPS_CIRCUIT.has(code);

const tokensToCents = (tokensIn: number, tokensOut: number): number =>
  Math.round(
    ((tokensIn * PRICE_CENTS_PER_MILLION.in + tokensOut * PRICE_CENTS_PER_MILLION.out) / 1_000_000) * 10_000,
  ) / 10_000;

// ---------------------------------------------------------------------------
// 调用请求
// ---------------------------------------------------------------------------

export interface AgentCall<T> {
  agentId: AgentId;
  kind: AgentKind;
  purpose: AgentInvocationLog['purpose'];
  /** 由 prompts/index.ts 的 buildSystemPrompt 渲染好的完整系统提示词 */
  systemPrompt: string;
  /** 用户侧 payload（会被 JSON.stringify；**不得含密钥**） */
  payload: unknown;
  schemaName?: SchemaName;
  /** 覆盖该 Agent 的默认推理参数 */
  runtimeOverrides?: Partial<AgentRuntimeConfig>;
  /**
   * Mock 轨道要返回什么。
   * 没给的话，Mock 轨道只能返回 not_configured —— 那意味着这个 Agent
   * 在离线状态下没有替身，调用方应当自己先拦住。
   */
  mock?: () => T;
}

export interface BusContext {
  ai: AiRuntimeState;
  /** 明文密钥。由调用方从 secretStore 取，bus 自己不碰存储。 */
  apiKey: string | null;
  /** 注入的 fetch（测试用；不传则用全局 fetch） */
  fetchImpl?: FetchLike;
  /** 注入的时钟（测试用） */
  now?: () => Date;
}

/**
 * 一次调用对存档的全部影响。调用方拿到它之后**一次性**写回，
 * 而不是让 bus 自己去 setState —— 那会让这次调用在两次渲染之间落库。
 */
export interface BusEffect {
  invocation: AgentInvocationLog | null;
  /** 本月用量增量（美分可能是小数：一次调用约 0.2 分） */
  usage: { tokensIn: number; tokensOut: number; costUsdCents: number };
  /** 是否发生了真实计费（Mock 轨道不计费） */
  billed: boolean;
  /** 调用之后的熔断状态 */
  circuit: AiRuntimeState['circuitBreaker'];
  /**
   * 这次调用**为什么没能走真身**（走通了就是 null）。
   *
   * 为什么非得单独记这一笔：闸门拦下（比如没配密钥）与真调用失败（比如超时）
   * 在结果里**长得一模一样** —— 都是 `ok: true` + `source: 'mock'`，
   * 因为两者都已经优雅地降级成了替身。于是一个"这次到底是不是出事了"
   * 的判断，在调用方那里无凭无据。
   *
   * `source` 就是那个凭据：
   *   · `'gate'` —— **压根没发出去**（没配密钥 / 玩家自己开了 Mock / 熔断 / 超预算）。
   *     这是设计内的降级，多半不该打扰玩家；
   *   · `'api'` —— **发出去了，失败了**（断网、超时、429、输出不合法……）。
   *     除了"输出不合法"这一类（模型的问题，替身接得住），其它都值得说一声。
   *
   * ⚠️ 这个判断属于调用方。bus 只如实记录，不替任何人决定"要不要弹窗"。
   */
  reason: { code: AgentErrorCode; message: string; source: 'gate' | 'api' } | null;
}

export interface BusOutcome<T> {
  result: AgentResult<T>;
  effect: BusEffect;
}

// ---------------------------------------------------------------------------
// 闸门判定
// ---------------------------------------------------------------------------

/** 冷却期满则半开：清掉 openedAt 但**保留**失败计数，让下一次失败直接再熔断 */
const halfOpenIfCold = (
  prev: AiRuntimeState['circuitBreaker'],
  nowMs: number,
): AiRuntimeState['circuitBreaker'] => {
  if (!prev.open || prev.openedAt === null) return prev;
  const opened = new Date(prev.openedAt).getTime();
  if (Number.isNaN(opened) || nowMs - opened < CIRCUIT_COOLDOWN_MS) return prev;
  return { open: false, consecutiveFailures: prev.consecutiveFailures, openedAt: null };
};

interface GateResult {
  /** 能不能走真实 API */
  allowed: boolean;
  /** 不能走时要报的错误码 */
  code: AgentErrorCode;
  message: string;
  circuit: AiRuntimeState['circuitBreaker'];
}

const evaluateGates = (ctx: BusContext, nowMs: number): GateResult => {
  const { ai } = ctx;
  const circuit = halfOpenIfCold(ai.circuitBreaker, nowMs);

  if (ai.mockModeEnabled) {
    return { allowed: false, code: 'not_configured', message: '处于 Mock 模式', circuit };
  }
  if (ai.provider === 'mock') {
    return { allowed: false, code: 'not_configured', message: 'AI 提供方设置为 mock', circuit };
  }
  if (ctx.apiKey === null || ctx.apiKey.trim().length === 0) {
    return { allowed: false, code: 'not_configured', message: '尚未配置 API Key', circuit };
  }
  if (circuit.open) {
    return {
      allowed: false,
      code: 'circuit_open',
      message: '连续调用失败，AI 服务已暂时熔断（稍后会自动重试）',
      circuit,
    };
  }
  if (ai.usage.costUsdCents >= ai.usage.budgetUsdCents) {
    return {
      allowed: false,
      code: 'budget_exceeded',
      message: `本月 AI 预算已用尽（$${(ai.usage.budgetUsdCents / 100).toFixed(2)}），已自动降级为本地生成`,
      circuit,
    };
  }
  return { allowed: true, code: 'unknown', message: '', circuit };
};

// ---------------------------------------------------------------------------
// 调用日志
// ---------------------------------------------------------------------------

let invocationSeq = 0;

/**
 * 生成调用 id。
 *
 * 用「时刻 + 自增序号」而不是纯随机：日志是要人读的，
 * 按 id 排出来就是时间顺序。序号是模块级的 —— 它不需要跨会话唯一，
 * 因为日志本身按 id 存在数组里，刷新页面后重新从 0 开始也不会撞。
 */
const nextInvocationId = (nowMs: number): InvocationId =>
  `inv_${nowMs.toString(36)}_${(invocationSeq++).toString(36)}` as InvocationId;

const buildLog = (args: {
  id: InvocationId | null;
  agentId: AgentId;
  at: ISODateTime;
  purpose: AgentInvocationLog['purpose'];
  inputDigest: string;
  rawOutput: string | null;
  parsedOk: boolean;
  errorMessage: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}): AgentInvocationLog => ({
  id: args.id ?? (0 as unknown as InvocationId),
  agentId: args.agentId,
  ts: args.at,
  purpose: args.purpose,
  // 摘要只留 240 字：日志是给人看的线索，不是第二份存档
  inputDigest: args.inputDigest.slice(0, 240),
  // ⚠️ 原始输出可能很长，且理论上可能把 payload 回显出来；截断并且过一遍 redact
  rawOutput: args.rawOutput === null ? null : redact(args.rawOutput.slice(0, 4000)),
  parsedOk: args.parsedOk,
  errorMessage: args.errorMessage === null ? null : redact(args.errorMessage),
  latencyMs: args.latencyMs,
  tokensIn: args.tokensIn,
  tokensOut: args.tokensOut,
});

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export const invokeAgent = async <T>(call: AgentCall<T>, ctx: BusContext): Promise<BusOutcome<T>> => {
  const clock = ctx.now ?? (() => new Date());
  const at = clock();
  const nowMs = at.getTime();
  const iso = at.toISOString();
  const runtime = runtimeFor(call.kind, {
    ...(ctx.ai.model ? { model: ctx.ai.model } : {}),
    ...call.runtimeOverrides,
  });
  const schemaName: SchemaName = call.schemaName ?? SCHEMA_NAME_BY_KIND[call.kind];
  const id = nextInvocationId(nowMs);
  const inputDigest = typeof call.payload === 'string' ? call.payload : JSON.stringify(call.payload ?? null);

  const gates = evaluateGates(ctx, nowMs);

  const mockOutcome = (
    code: AgentErrorCode,
    message: string,
    source: 'gate' | 'api',
    latencyMs = 0,
  ): BusOutcome<T> => {
    if (call.mock) {
      return {
        result: {
          ok: true,
          data: call.mock(),
          invocationId: id,
          agentId: call.agentId,
          source: 'mock',
          latencyMs,
          corrections: [],
        },
        effect: {
          invocation: buildLog({
            id,
            agentId: call.agentId,
            at: iso,
            purpose: call.purpose,
            inputDigest,
            rawOutput: null,
            parsedOk: true,
            errorMessage: null,
            latencyMs,
            tokensIn: 0,
            tokensOut: 0,
          }),
          usage: { tokensIn: 0, tokensOut: 0, costUsdCents: 0 },
          billed: false,
          circuit: gates.circuit,
          reason: { code, message, source },
        },
      };
    }
    return {
      result: {
        ok: false,
        error: { code, message, retryable: code !== 'not_configured' },
        invocationId: id,
        agentId: call.agentId,
      },
      effect: {
        invocation: buildLog({
          id,
          agentId: call.agentId,
          at: iso,
          purpose: call.purpose,
          inputDigest,
          rawOutput: null,
          parsedOk: false,
          errorMessage: message,
          latencyMs,
          tokensIn: 0,
          tokensOut: 0,
        }),
        usage: { tokensIn: 0, tokensOut: 0, costUsdCents: 0 },
        billed: false,
        circuit: gates.circuit,
        reason: { code, message, source },
      },
    };
  };

  // —— 闸门未通过：走 Mock 轨道 ——
  if (!gates.allowed) return mockOutcome(gates.code, gates.message, 'gate');

  // —— 真实调用 ——
  const chat = await chatCompletion(
    { baseUrl: ctx.ai.baseUrl, apiKey: ctx.apiKey ?? '' },
    { systemPrompt: call.systemPrompt, userContent: inputDigest, runtime },
    ctx.fetchImpl,
    () => clock().getTime(),
  );

  if (!chat.ok) {
    // 只有"对面病了"才推进熔断计数（见 tripsCircuit）。
    // 密钥无效走到这里时，计数与 openedAt 一个字节都不动 —— 连新对象都不建，
    // 免得给出一条"熔断状态更新了"的假 diff。
    const circuit = tripsCircuit(chat.code)
      ? (() => {
          const failures = gates.circuit.consecutiveFailures + 1;
          return failures >= CIRCUIT_FAILURE_THRESHOLD
            ? { open: true, consecutiveFailures: failures, openedAt: iso }
            : { open: gates.circuit.open, consecutiveFailures: failures, openedAt: gates.circuit.openedAt };
        })()
      : gates.circuit;

    // 失败也**可能是**可重试的，但"重试"由 gateway 内部做完了。
    // 走到这里说明重试也没救回来 —— 那就降级，同时给熔断记一笔（如果该记）。
    const fallback = mockOutcome(chat.code, chat.message, 'api', chat.latencyMs);
    // 账分两种记：
    //   · 传输层没走通的（429/5xx/超时/断网）没有可结算的 token —— 429 不计费，
    //     超时计不计费我方无从知晓。与其编一个数字入账，不如记 0，然后由
    //     lastHealthCheck 与熔断把"这家服务现在不对劲"讲清楚。
    //   · 拿到了 200 的那一种（如"空内容"）不是：对面收下了请求、真的烧了 token，
    //     gateway 把各次尝试的用量累加带了出来（ChatFailure.tokensIn/Out）——
    //     那笔钱照记，与 failureOutcome 对 schema_violation 的语义一致：
    //     账本不该因为"结果不能用"就少一笔。billed 取"有没有这个数"，
    //     也就是"服务端是否真的应答过"（agentEffect 拿它决定 configured）。
    const tokensIn = chat.tokensIn ?? 0;
    const tokensOut = chat.tokensOut ?? 0;
    return {
      result: call.mock
        ? fallback.result
        : {
            ok: false,
            error: { code: chat.code, message: chat.message, retryable: chat.retryable },
            invocationId: id,
            agentId: call.agentId,
          },
      effect: {
        invocation: buildLog({
          id,
          agentId: call.agentId,
          at: iso,
          purpose: call.purpose,
          inputDigest,
          rawOutput: null,
          parsedOk: false,
          errorMessage: chat.message,
          latencyMs: chat.latencyMs,
          tokensIn,
          tokensOut,
        }),
        usage: { tokensIn, tokensOut, costUsdCents: tokensToCents(tokensIn, tokensOut) },
        billed: chat.tokensIn !== undefined || chat.tokensOut !== undefined,
        circuit,
        reason: { code: chat.code, message: chat.message, source: 'api' },
      },
    };
  }

  // —— 解析 ——
  const extracted = extractJson(chat.content);
  if (!extracted.ok) {
    return failureOutcome(call, ctx, id, iso, inputDigest, chat, 'invalid_json', extracted.message, gates.circuit);
  }

  const validated = validateAgainst(SCHEMAS[schemaName], extracted.value);
  if (!validated.ok) {
    return failureOutcome(
      call,
      ctx,
      id,
      iso,
      inputDigest,
      chat,
      'schema_violation',
      `${validated.path}：${validated.message}`,
      gates.circuit,
    );
  }

  const circuit = { open: false, consecutiveFailures: 0, openedAt: null };

  return {
    result: {
      ok: true,
      data: validated.value as T,
      invocationId: id,
      agentId: call.agentId,
      source: 'api',
      latencyMs: chat.latencyMs,
      corrections: validated.corrections,
    },
    effect: {
      invocation: buildLog({
        id,
        agentId: call.agentId,
        at: iso,
        purpose: call.purpose,
        inputDigest,
        rawOutput: chat.content,
        parsedOk: true,
        errorMessage: null,
        latencyMs: chat.latencyMs,
        tokensIn: chat.tokensIn,
        tokensOut: chat.tokensOut,
      }),
      usage: { tokensIn: chat.tokensIn, tokensOut: chat.tokensOut, costUsdCents: tokensToCents(chat.tokensIn, chat.tokensOut) },
      billed: true,
      circuit,
      reason: null,
    },
  };
};

/**
 * 走到这里说明"请求成功、拿回了内容，但内容不能用"。
 * 与网络失败分开处理：这条路径**已经花了钱**，用量必须照记 ——
 * 一次 schema_violation 不该让账本少一笔。
 *
 * ⚠️ 它也照旧推进熔断计数（不在 401 解绑的范围内）：401 是**我们这边的配置**错了，
 *    而这里是对面的模型在持续吐出不能用的东西 —— 那正是熔断存在的理由，
 *    不然玩家会一边失败一边继续为每一次失败付费。
 */
const failureOutcome = <T>(
  call: AgentCall<T>,
  _ctx: BusContext,
  id: InvocationId,
  iso: ISODateTime,
  inputDigest: string,
  chat: { latencyMs: number; tokensIn?: number; tokensOut?: number; content: string },
  code: AgentErrorCode,
  message: string,
  circuit0: AiRuntimeState['circuitBreaker'],
): BusOutcome<T> => {
  const failures = circuit0.consecutiveFailures + 1;
  const tokensIn = chat.tokensIn ?? 0;
  const tokensOut = chat.tokensOut ?? 0;

  return {
    result: call.mock
      ? {
          ok: true,
          data: call.mock(),
          invocationId: id,
          agentId: call.agentId,
          source: 'mock',
          latencyMs: chat.latencyMs,
          corrections: [message],
        }
      : {
          ok: false,
          error: { code, message, retryable: true },
          invocationId: id,
          agentId: call.agentId,
        },
    effect: {
      invocation: buildLog({
        id,
        agentId: call.agentId,
        at: iso,
        purpose: call.purpose,
        inputDigest,
        rawOutput: chat.content,
        parsedOk: false,
        errorMessage: message,
        latencyMs: chat.latencyMs,
        tokensIn,
        tokensOut,
      }),
      usage: { tokensIn, tokensOut, costUsdCents: tokensToCents(tokensIn, tokensOut) },
      billed: true,
      circuit:
        failures >= CIRCUIT_FAILURE_THRESHOLD
          ? { open: true, consecutiveFailures: failures, openedAt: iso }
          : { open: circuit0.open, consecutiveFailures: failures, openedAt: circuit0.openedAt },
      // 请求成功、内容不能用。它是 `source: 'api'` —— 钱已经花了，
      // 玩家有权知道"这次模型给了个不合法的东西，所以这次是本地生成的结果"。
      reason: { code, message, source: 'api' },
    },
  };
};

// ---------------------------------------------------------------------------
// 把 effect 应用回存档（纯函数，供 store 直接调用）
// ---------------------------------------------------------------------------

/** 日志环形保留上限。它只在被读的时候有用，留太多等于给存档增重。 */
export const INVOCATION_LOG_CAP = 200;

export const applyBusEffect = (
  state: { ai: AiRuntimeState; agents: { invocations: AgentInvocationLog[] } },
  effect: BusEffect,
  month: string,
): { ai: AiRuntimeState; invocations: AgentInvocationLog[] } => {
  const rolled = state.ai.usage.month === month ? state.ai.usage : {
    month,
    tokensIn: 0,
    tokensOut: 0,
    costUsdCents: 0,
    budgetUsdCents: state.ai.usage.budgetUsdCents,
  };

  const usage = {
    ...rolled,
    tokensIn: rolled.tokensIn + effect.usage.tokensIn,
    tokensOut: rolled.tokensOut + effect.usage.tokensOut,
    costUsdCents: Math.round((rolled.costUsdCents + effect.usage.costUsdCents) * 10_000) / 10_000,
  };

  const invocations = effect.invocation
    ? [...state.agents.invocations, effect.invocation].slice(-INVOCATION_LOG_CAP)
    : state.agents.invocations;

  return {
    ai: { ...state.ai, usage, circuitBreaker: effect.circuit, configured: true },
    invocations,
  };
};

export const noteHealthCheck = (
  ai: AiRuntimeState,
  check: { ok: boolean; at: ISODateTime; message: string },
): AiRuntimeState => ({ ...ai, lastHealthCheck: check });
