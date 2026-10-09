// ============================================================================
// EarthOnline · Phase 3 · DeepSeek 底层通信网关 (gateway)
//
// 这一层只做一件事：**把一段文字发出去，把一段文字收回来。**
//
// 它不知道 Quest 是什么，不知道 Agent 有几种，也不碰存档。
// 那种"知道业务"的活儿全在 ai/bus.ts —— 这样分工有一个很实际的好处：
// 这一层可以拿一个假的 fetch 完整测一遍（超时、429、5xx、坏 JSON），
// 而不用假装自己有 API Key。verify-ops 里跑的就是这条路。
//
// 协议：DeepSeek 提供 OpenAI 兼容的 /chat/completions 与 /models，
// 所以这里几乎没有 DeepSeek 专有的东西 —— 换任何一家兼容厂商，
// 改的只是 `AiRuntimeState.baseUrl`，代码几乎不动。
// 唯一的例外是请求体里的 `thinking`（见 chatCompletion）：它按 baseUrl 打了闸，
// 只在 DeepSeek 上出现，理由写在那行旁边。
//
// ⚠️ 这一层**绝不**读 LocalStorage、绝不读 Date.now() 之外的全局状态。
//    密钥由调用方从 secretStore 取好传进来（见 ai/bus.ts）。
// ============================================================================

import type { AgentErrorCode, AgentRuntimeConfig } from '@/types';
import { redact } from '@/lib/secretStore';

/** 一个够用的 fetch 形状。抽出来是为了让测试能塞一个假的进来。 */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface GatewayConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ChatCall {
  systemPrompt: string;
  /** 用户侧内容（本项目一律是结构化 payload 的 JSON 字符串） */
  userContent: string;
  runtime: AgentRuntimeConfig;
}

export interface ChatSuccess {
  ok: true;
  content: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  /**
   * 服务端给的停止原因（'stop' | 'length' | 'content_filter' | …），有才带。
   *
   * 空内容那条路径早就用它说人话（describeEmptyContent）；但"有内容、内容
   * 却不能用"（invalid_json / schema_violation）以前拿不到它，消息里只剩
   * 一句看不懂的 JSON 报错。2026-10-07 的存档审计正是靠"输出恰好断在 1976 字"
   * 这种旁证才排除了截断 —— 而 finish_reason 是**直接证据**：'length' 就是
   * "被输出上限截断了"，处方（加预算）与"模型自己写歪了"（修解析）完全不同。
   */
  finishReason?: string;
}

export interface ChatFailure {
  ok: false;
  code: AgentErrorCode;
  message: string;
  retryable: boolean;
  latencyMs: number;
  /**
   * 这一次调用**已经花掉的**用量（各次尝试累加带上来的）。
   *
   * 只在至少拿到过一次 200 应答时出现 —— 传输层就失败的调用（429/5xx/超时）
   * 没有这个数，也不该编一个出来。bus 靠"有没有这两格"区分两种失败：
   * 对面收下了请求、真的烧了 token 的那一种，账照记。
   */
  tokensIn?: number;
  tokensOut?: number;
}

export type ChatOutcome = ChatSuccess | ChatFailure;

// ---------------------------------------------------------------------------
// HTTP 状态码 → 本项目错误码
// ---------------------------------------------------------------------------

const classifyStatus = (status: number): { code: AgentErrorCode; retryable: boolean } => {
  // 401 / 403 有自己的码：它们是"这个密钥不对"，不是"这次没接上"。
  // 以前它们和"还没配密钥"共用 `not_configured`，于是 bus 那边分不出
  // "闸门拦下的"与"真发出去了但被拒的"—— 而这两件事该说的话完全不同。
  if (status === 401 || status === 403) return { code: 'unauthorized', retryable: false };
  if (status === 402) return { code: 'budget_exceeded', retryable: false };
  if (status === 429) return { code: 'rate_limited', retryable: true };
  if (status >= 500) return { code: 'network_error', retryable: true };
  return { code: 'unknown', retryable: false };
};

const STATUS_HINT: Record<number, string> = {
  401: '密钥无效或已被撤销',
  402: '账户额度不足',
  403: '这个密钥没有访问该模型的权限',
  429: '请求过于频繁，稍后再试',
  500: '服务端内部错误',
  503: '服务暂时不可用',
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    // 没有 setTimeout 的环境（极端受限的运行时）直接跳过退避，不让它挂住
    if (typeof setTimeout !== 'function') resolve();
    else setTimeout(resolve, ms);
  });

/** 指数退避：600ms → 1200ms。刻意短 —— 玩家在等，不是在批处理。 */
const backoffMs = (attempt: number): number => 600 * 2 ** attempt;

const resolveFetch = (injected?: FetchLike): FetchLike | null => {
  if (injected) return injected;
  const g = globalThis as { fetch?: unknown };
  return typeof g.fetch === 'function' ? (g.fetch as unknown as FetchLike) : null;
};

const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, '')}${path}`;

// ---------------------------------------------------------------------------
// 一次对话补全（含重试）
// ---------------------------------------------------------------------------

interface OpenAiChoice {
  message?: {
    content?: unknown;
    /** 思考模式下的思维链正文（DeepSeek 把"想"与"说"分开放在这里） */
    reasoning_content?: unknown;
  };
  /** 'stop' | 'length' | 'content_filter' | … 空内容时，它是现场唯一的证据 */
  finish_reason?: unknown;
}
interface OpenAiUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
}
interface OpenAiBody {
  choices?: OpenAiChoice[];
  usage?: OpenAiUsage;
  error?: { message?: unknown };
}

/**
 * 空内容不是一种病，是几种病共用的症状。
 *
 * 旧版一律说「可能触发了内容策略」—— 那是猜的，而且猜偏了会把玩家
 * 引到错误的方向（去改措辞）而不是正确的那一格。把手上真实的证据
 * （finish_reason / reasoning_content / 有没有 choices）翻译成人话，
 * 才是这条消息该做的事。2026-10-07 线上事故的真身就是第一种：
 * flash 的思考过程吃满了输出上限，正文没有开始。
 */
const describeEmptyContent = (parsed: OpenAiBody, maxTokens: number): string => {
  const choice = parsed.choices?.[0];
  if (!choice) return '模型返回了空内容（服务端没有返回任何候选）';
  const finish = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
  if (finish === 'length') {
    const reasoning = typeof choice.message?.reasoning_content === 'string' ? choice.message.reasoning_content : '';
    return reasoning.trim().length > 0
      ? `模型返回了空内容（思考过程占满了输出上限 ${maxTokens} token，正文没有开始）`
      : `模型返回了空内容（输出上限 ${maxTokens} token 被耗尽，正文没有开始）`;
  }
  if (finish === 'content_filter') return '模型返回了空内容（触发了服务端的内容过滤）';
  return '模型返回了空内容（服务端没有给出原因）';
};

/**
 * 发一次 chat/completions。
 *
 * 重试策略：只重试**可重试**的失败（429 / 5xx / 网络层异常 / 超时），
 * 次数取 runtime.maxRetries。401 这类重试一百次也是 401，
 * 而且每重试一次都是在把一个无效密钥往服务端再递一遍。
 */
export const chatCompletion = async (
  cfg: GatewayConfig,
  call: ChatCall,
  injectedFetch?: FetchLike,
  now: () => number = () => Date.now(),
): Promise<ChatOutcome> => {
  const doFetch = resolveFetch(injectedFetch);
  const startedAt = now();

  if (!doFetch) {
    return {
      ok: false,
      code: 'network_error',
      message: '当前运行环境没有 fetch，无法发起真实请求（Mock 模式仍可用）',
      retryable: false,
      latencyMs: 0,
    };
  }
  if (cfg.apiKey.trim().length === 0) {
    return {
      ok: false,
      code: 'not_configured',
      message: '尚未配置 API Key',
      retryable: false,
      latencyMs: 0,
    };
  }

  const body = JSON.stringify({
    model: call.runtime.model,
    messages: [
      { role: 'system', content: call.systemPrompt },
      { role: 'user', content: call.userContent },
    ],
    temperature: call.runtime.temperature,
    top_p: call.runtime.topP,
    max_tokens: call.runtime.maxTokens,
    ...(call.runtime.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    // ⚠️ 本文件唯一的厂商专有字段（按 baseUrl 打闸，换别家时它不会出现）。
    //    deepseek-flash 的思考模式**默认开着**，且思考与正文共享 max_tokens：
    //    本项目的提示词是按非思考模型调校的，让它先想满三千 token 再开口，
    //    等于把正文挤没 —— 2026-10-07 线上就是这样连续三次空内容
    //    （finish_reason='length'，见 describeEmptyContent）。
    //    因此**默认关**；要用思考的调用（任务链生成）在 runtime 里显式带
    //    thinking:'enabled' —— 那是运行时开关，不是让这个默认值回来。
    ...(cfg.baseUrl.includes('deepseek')
      ? { thinking: { type: call.runtime.thinking ?? 'disabled' } }
      : {}),
    stream: false,
  });

  const attempts = Math.max(1, Math.floor(call.runtime.maxRetries) + 1);
  let last: ChatFailure = {
    ok: false,
    code: 'unknown',
    message: '调用未发生',
    retryable: false,
    latencyMs: 0,
  };
  // 重试不是免费的：每一次拿到 200 的尝试，对面都已经真的烧了 token。
  // 把各次尝试报出的用量累加进这两格，随最终失败一并带出去（见 ChatFailure.tokensIn）——
  // 只记最后一次的话，一次"空内容 ×3"的事故会在账本上只留下一笔。
  let spentIn = 0;
  let spentOut = 0;
  let reachedServer = false;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer =
      controller && typeof setTimeout === 'function'
        ? setTimeout(() => controller.abort(), call.runtime.timeoutMs)
        : null;

    try {
      const res = await doFetch(joinUrl(cfg.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });

      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const text = await res.text();

      if (!res.ok) {
        const cls = classifyStatus(res.status);
        last = {
          ok: false,
          code: cls.code,
          message: `HTTP ${res.status}：${STATUS_HINT[res.status] ?? extractServerMessage(text) ?? '请求被拒绝'}`,
          retryable: cls.retryable,
          latencyMs,
        };
        if (!cls.retryable) return last;
        continue;
      }

      let parsed: OpenAiBody;
      try {
        parsed = JSON.parse(text) as OpenAiBody;
      } catch {
        // 200 但身体不是 JSON：这是服务端异常，重试一次值得
        last = {
          ok: false,
          code: 'invalid_json',
          message: '响应体不是合法 JSON',
          retryable: true,
          latencyMs,
        };
        continue;
      }

      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        reachedServer = true;
        if (typeof parsed.usage?.prompt_tokens === 'number') spentIn += parsed.usage.prompt_tokens;
        if (typeof parsed.usage?.completion_tokens === 'number') spentOut += parsed.usage.completion_tokens;
        last = {
          ok: false,
          code: 'content_refused',
          message: describeEmptyContent(parsed, call.runtime.maxTokens),
          retryable: true,
          latencyMs,
        };
        continue;
      }

      const finishReason = parsed.choices?.[0]?.finish_reason;
      return {
        ok: true,
        content,
        latencyMs,
        tokensIn: typeof parsed.usage?.prompt_tokens === 'number' ? parsed.usage.prompt_tokens : 0,
        tokensOut: typeof parsed.usage?.completion_tokens === 'number' ? parsed.usage.completion_tokens : 0,
        ...(typeof finishReason === 'string' ? { finishReason } : {}),
      };
    } catch (err) {
      const latencyMs = Math.max(0, Math.round(now() - startedAt));
      const aborted = err instanceof Error && err.name === 'AbortError';
      last = {
        ok: false,
        code: aborted ? 'timeout' : 'network_error',
        message: aborted
          ? `请求超过 ${call.runtime.timeoutMs}ms 未返回`
          : `网络异常：${redact(err instanceof Error ? err.message : String(err))}`,
        retryable: true,
        latencyMs,
      };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  return reachedServer ? { ...last, tokensIn: spentIn, tokensOut: spentOut } : last;
};

const extractServerMessage = (text: string): string | null => {
  try {
    const parsed = JSON.parse(text) as OpenAiBody;
    const msg = parsed.error?.message;
    return typeof msg === 'string' ? redact(msg) : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// 连通性测试（「测试连接」按钮）
//
// 用 GET /models 而不是发一条最小对话：它同样验证了"网络通、密钥有效"，
// 但**不消耗 token、不占用并发额度**。玩家可能会反复点这个按钮，
// 每一次都往账户上记一笔账是很难解释的。
// ---------------------------------------------------------------------------

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  /** 给玩家看的那一句话，如「响应正常」 */
  message: string;
  /** 服务端报告的可用模型（成功时才有） */
  models: string[];
}

export const pingDeepSeek = async (
  cfg: GatewayConfig,
  injectedFetch?: FetchLike,
  now: () => number = () => Date.now(),
): Promise<PingResult> => {
  const doFetch = resolveFetch(injectedFetch);
  const startedAt = now();

  if (!doFetch) {
    return { ok: false, latencyMs: 0, message: '当前运行环境没有 fetch，无法发起真实请求', models: [] };
  }
  if (cfg.apiKey.trim().length === 0) {
    return { ok: false, latencyMs: 0, message: '尚未配置 API Key', models: [] };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer =
    controller && typeof setTimeout === 'function'
      ? setTimeout(() => controller.abort(), 12_000)
      : null;

  try {
    const res = await doFetch(joinUrl(cfg.baseUrl, '/models'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const latencyMs = Math.max(0, Math.round(now() - startedAt));
    const text = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `HTTP ${res.status}：${STATUS_HINT[res.status] ?? extractServerMessage(text) ?? '连接被拒绝'}`,
        models: [],
      };
    }

    let models: string[] = [];
    try {
      const parsed = JSON.parse(text) as { data?: Array<{ id?: unknown }> };
      models = (parsed.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string');
    } catch {
      // 通了但读不出模型列表：不影响"连得上"这个结论
    }

    return { ok: true, latencyMs, message: '响应正常', models };
  } catch (err) {
    const latencyMs = Math.max(0, Math.round(now() - startedAt));
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      message: aborted
        ? '连接超时（12s 未返回）'
        : `网络异常：${redact(err instanceof Error ? err.message : String(err))}`,
      models: [],
    };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};
