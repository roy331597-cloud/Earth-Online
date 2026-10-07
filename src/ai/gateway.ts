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
// 所以这里没有一行是 DeepSeek 专有的 —— 换任何一家兼容厂商，
// 改的只是 `AiRuntimeState.baseUrl`，代码不动。
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
}

export interface ChatFailure {
  ok: false;
  code: AgentErrorCode;
  message: string;
  retryable: boolean;
  latencyMs: number;
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
  message?: { content?: unknown };
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
        last = {
          ok: false,
          code: 'content_refused',
          message: '模型返回了空内容（可能触发了内容策略）',
          retryable: true,
          latencyMs,
        };
        continue;
      }

      return {
        ok: true,
        content,
        latencyMs,
        tokensIn: typeof parsed.usage?.prompt_tokens === 'number' ? parsed.usage.prompt_tokens : 0,
        tokensOut: typeof parsed.usage?.completion_tokens === 'number' ? parsed.usage.completion_tokens : 0,
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

  return last;
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
  /** 给玩家看的那一句话，如「deepseek-chat 响应正常」 */
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
