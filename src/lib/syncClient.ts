// ============================================================================
// EarthOnline · 云同步的客户端协议 (syncClient)
//
// 这一层只做一件件事：**把一段密文运上去，把一段密文取下来。**
//
// 它不知道存档长什么样、不知道 UI 怎么画、不碰 store。那种"知道业务"的活儿
// 全在 useEarthOnlineStore 的 sync 动作里 —— 这样分工有一个很实际的好处：
// 这一层可以拿一个假的 fetch 完整测一遍（401 / 409 / 413 / 断网），
// 而不需要真的有一个服务器（verify-ops ㊲），
// 也可以拿真的服务器完整测一遍（㊳ 起真进程），两边用的是同一份代码。
//
// ---------------------------------------------------------------------------
// 协议（与 server/index.mjs 是一份合同，改动必须两边同时改）
// ---------------------------------------------------------------------------
//   GET    /sync/v1/health  → 200 { ok }
//   GET    /sync/v1/meta    → 200 { claimed, salt, revision, updatedAt, size, maxBytes }（公开）
//   POST   /sync/v1/claim   → 201（首次）/ 200（带旧 token 换口令）/ 409 / 401
//   GET    /sync/v1/save    → 200 密文 + X-Save-Revision / X-Save-UpdatedAt 头；404 = 云端还没有
//   PUT    /sync/v1/save    → 200 { revision, size }；If-Match 对不上 → 409 { revision }；超限 → 413
//   DELETE /sync/v1/save    → 200（旧版本仍留在服务器上，见 server/store.mjs）
//
// 服务端**从不解析密文体** —— revision 与 updatedAt 走请求头，大小走 Content-Length。
// 于是"服务器上只有密文"这件事不是一句承诺，而是它读不懂别的。
//
// ---------------------------------------------------------------------------
// 纪律
// ---------------------------------------------------------------------------
// · 依赖全注入（fetch / now / subtle），仿 ai/thunks.ts 的 deps 模式；
// · 离开本模块的**每一个错误字符串都过 redact()** —— 万一哪天异常里带了凭证；
// · 这里不 console.log 任何东西：密文、token、口令都不该出现在日志里；
// · 同源相对路径（`/sync/v1/...`）：应用与同步服务都在同一个域名后面，
//   没有 CORS，也没有"我在跟哪台服务器说话"这种问题。
// ============================================================================

import { formatBytes, formatUsd } from '@/lib/format';
import { MIGRATIONS } from '@/lib/migrations';
import { decodeSave, encodeSave } from '@/lib/persistence';
import { redact } from '@/lib/secretStore';
import { activeTrack, netWorthUsdCents, trackTitle } from '@/lib/selectors';
import { decryptPayload, deriveKeyMaterial, encryptPayload, randomSalt } from '@/lib/syncCrypto';
import type { DerivedKeys } from '@/lib/syncCrypto';
import { CURRENT_SCHEMA_VERSION } from '@/types';
import type { EarthOnlineState } from '@/types';

/** 与 Caddyfile / server 路由一致。改它要同时改三处（还有 verify-ops ㉛）。 */
export const SYNC_BASE_PATH = '/sync/v1';

/**
 * 够用的 fetch 形状。比 ai/gateway.ts 的 FetchLike 多要一样东西：
 * **响应头**（revision 与 updatedAt 都在头上）。抽出来是为了让测试塞假的进来。
 */
export interface SyncFetchLike {
  (
    input: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text: () => Promise<string>;
  }>;
}

export interface SyncDeps {
  fetch: SyncFetchLike;
  now: () => Date;
  /** 只在测试里注入；不传时由 syncCrypto 取 globalThis.crypto.subtle */
  subtle?: SubtleCrypto;
  /** 单次请求的超时（默认 30s：几 MB 的存档要留够上传时间） */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// 结果形状
// ---------------------------------------------------------------------------

export type SyncErrorCode =
  | 'unauthorized' // 401/403：口令不对，或这个 token 已经不作数了
  | 'conflict' // 409：云端修订与 If-Match 对不上（有人在别处写过）
  | 'empty' // 404：云端还没有存档（对 GET /save 而言这不是错误，是状态）
  | 'too_large' // 413：超过服务器允许的大小
  | 'claimed' // 409：这台服务器已经被认领过了（对 claim 而言）
  | 'decrypt' // 解开信封失败：口令不对，或密文被动过（密码学上二者不可区分）
  | 'bad_request' // 400：请求本身不合法（客户端 bug）
  | 'network' // 断网 / 超时 / 环境没有 fetch
  | 'server'; // 5xx 或响应读不懂

export interface SyncFail {
  ok: false;
  code: SyncErrorCode;
  message: string;
  status?: number;
  /** conflict 时：服务器当前的修订号（客户端据此重新裁决） */
  revision?: number | null;
}

const fail = (code: SyncErrorCode, message: string, extra?: { status?: number; revision?: number | null }): SyncFail => ({
  ok: false,
  code,
  message: redact(message),
  ...(extra?.status !== undefined ? { status: extra.status } : {}),
  ...(extra?.revision !== undefined ? { revision: extra.revision } : {}),
});

export interface SyncMeta {
  claimed: boolean;
  /** PBKDF2 的盐（b64）。未 claim 时为 null */
  salt: string | null;
  revision: number | null;
  updatedAt: string | null;
  size: number | null;
  maxBytes: number;
}

// ---------------------------------------------------------------------------
// 请求小工具
// ---------------------------------------------------------------------------

const resolveFetch = (deps: SyncDeps): SyncFetchLike | null => {
  if (typeof deps.fetch === 'function') return deps.fetch;
  const g = globalThis as { fetch?: unknown };
  return typeof g.fetch === 'function' ? (g.fetch as SyncFetchLike) : null;
};

const DEFAULT_TIMEOUT_MS = 30_000;

const withTimeout = async <T>(
  deps: SyncDeps,
  run: (signal?: AbortSignal) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: boolean; err: unknown }> => {
  const ms = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer =
    controller && typeof setTimeout === 'function' ? setTimeout(() => controller.abort(), ms) : null;
  try {
    return { ok: true, value: await run(controller ? controller.signal : undefined) };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return { ok: false, timedOut, err };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};

/** 统一把 HTTP 状态码翻译成本项目的错误码。措辞都指向"接下来怎么办"。 */
const classify = (status: number, fallbackMessage: string): SyncFail => {
  if (status === 401 || status === 403) return fail('unauthorized', '口令不对，或这台设备的接入已被更换', { status });
  if (status === 404) return fail('empty', '云端还没有存档', { status });
  if (status === 409) return fail('conflict', '云端存档已被别处改写', { status });
  if (status === 413) return fail('too_large', '存档超过服务器允许的大小', { status });
  if (status === 400) return fail('bad_request', `请求被拒绝：${fallbackMessage}`, { status });
  if (status >= 500) return fail('server', `服务器出错（HTTP ${status}）：${fallbackMessage}`, { status });
  return fail('server', `未能处理的应答（HTTP ${status}）：${fallbackMessage}`, { status });
};

const readJson = (text: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const errorTextOf = (body: Record<string, unknown> | null): string =>
  typeof body?.error === 'string' ? body.error : '';

// ---------------------------------------------------------------------------
// 六个端点
// ---------------------------------------------------------------------------

export const fetchMeta = async (deps: SyncDeps, base = ''): Promise<SyncMeta | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/meta`, {
      method: 'GET',
      headers: {},
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '连接超时' : `网络异常：${explain(res.err)}`);
  }
  const text = await res.value.text();
  if (!res.value.ok) return classify(res.value.status, errorTextOf(readJson(text)));
  const body = readJson(text);
  if (body === null) return fail('server', '服务器应答不是 JSON');

  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    claimed: body.claimed === true,
    salt: str(body.salt),
    revision: num(body.revision),
    updatedAt: str(body.updatedAt),
    size: num(body.size),
    maxBytes: num(body.maxBytes) ?? 20 * 1024 * 1024,
  };
};

/**
 * 认领这台服务器（首次启用），或换口令时以旧 token 换掉验凭证。
 *
 * 服务器只存 `verifier`（token 的 sha256），不存 token 本身 ——
 * 所以"换口令"必须带着旧 token 来证明身份，这也是它能安全重换的原因。
 */
export const claimServer = async (
  deps: SyncDeps,
  payload: { salt: string; verifier: string; token?: string },
  base = '',
): Promise<{ ok: true; replaced: boolean; status: number } | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.token ? { Authorization: `Bearer ${payload.token}` } : {}),
      },
      body: JSON.stringify({ salt: payload.salt, verifier: payload.verifier }),
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '连接超时' : `网络异常：${explain(res.err)}`);
  }
  const text = await res.value.text();
  if (res.value.status === 200 || res.value.status === 201) {
    return { ok: true, replaced: res.value.status === 200, status: res.value.status };
  }
  if (res.value.status === 409) {
    return fail('claimed', '这台服务器已经有主了 —— 如果云端存档是你自己推上去的，改用「接入」，输入当时设的口令', {
      status: 409,
    });
  }
  return classify(res.value.status, errorTextOf(readJson(text)));
};

export interface PushInput {
  token: string;
  /** 上线体：Base64(IV‖密文) */
  wire: string;
  /** 这次写入基于哪个云端修订（服务器用它做 If-Match）。null = 认为云端还没有 */
  revision: number | null;
  /** 存档自己的 meta.updatedAt，服务器原样存下、原样回给别的设备看 */
  updatedAt: string;
}

export const pushSave = async (
  deps: SyncDeps,
  input: PushInput,
  base = '',
): Promise<{ ok: true; revision: number; size: number } | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/save`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${input.token}`,
        // If-Match 是这条协议里唯一的并发控制：对不上就不写，让玩家裁决
        'If-Match': input.revision === null ? 'none' : String(input.revision),
        // 修订号从 1 起：0 太容易被"空"与"默认值"冒充，而这两件事在这条协议里
        // 必须分得清（null = 云端还没有存档，1 = 第一份）。
        'X-Save-Revision': String(input.revision === null ? 1 : input.revision + 1),
        'X-Save-UpdatedAt': input.updatedAt,
      },
      body: input.wire,
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '推送超时' : `网络异常：${explain(res.err)}`);
  }
  const text = await res.value.text();
  const body = readJson(text);
  if (res.value.status === 200) {
    return {
      ok: true,
      revision: typeof body?.revision === 'number' ? body.revision : (input.revision ?? 0) + 1,
      size: typeof body?.size === 'number' ? body.size : input.wire.length,
    };
  }
  if (res.value.status === 409) {
    const headerRev = res.value.headers.get('x-save-revision');
    const revision =
      typeof body?.revision === 'number' ? body.revision : headerRev !== null ? Number(headerRev) : null;
    return fail('conflict', '推送被拒：云端存档在别处更新过了', {
      status: 409,
      revision: Number.isFinite(revision) ? revision : null,
    });
  }
  return classify(res.value.status, errorTextOf(body));
};

export interface RemoteSave {
  wire: string;
  revision: number | null;
  updatedAt: string | null;
  size: number;
}

export const fetchSave = async (
  deps: SyncDeps,
  token: string,
  base = '',
): Promise<RemoteSave | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/save`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '拉取超时' : `网络异常：${explain(res.err)}`);
  }
  const text = await res.value.text();
  if (!res.value.ok) return classify(res.value.status, errorTextOf(readJson(text)));

  const headerRev = res.value.headers.get('x-save-revision');
  const revision = headerRev !== null && headerRev.length > 0 ? Number(headerRev) : null;
  return {
    wire: text,
    revision: revision !== null && Number.isFinite(revision) ? revision : null,
    updatedAt: res.value.headers.get('X-Save-UpdatedAt'),
    size: text.length,
  };
};

/**
 * 只问一句"这个 token 还作数吗、云端有没有东西"—— **不要正文**。
 *
 * 「接入」流程第一步就是它：口令对不对，只有服务器能回答；而为了回答
 * 这一个问题去下载一份几 MB 的存档是浪费（HEAD 与 GET 同一条路由，
 * 服务器少发一个体而已，见 server/index.mjs）。
 */
export const probeSave = async (
  deps: SyncDeps,
  token: string,
  base = '',
): Promise<{ ok: true; revision: number | null; updatedAt: string | null; size: number | null } | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/save`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '连接超时' : `网络异常：${explain(res.err)}`);
  }
  if (!res.value.ok) {
    const text = await res.value.text();
    return classify(res.value.status, errorTextOf(readJson(text)));
  }
  const headerRev = res.value.headers.get('x-save-revision');
  const sizeHeader = res.value.headers.get('content-length');
  const revision = headerRev !== null && headerRev.length > 0 ? Number(headerRev) : null;
  return {
    ok: true,
    revision: revision !== null && Number.isFinite(revision) ? revision : null,
    updatedAt: res.value.headers.get('X-Save-UpdatedAt'),
    size: sizeHeader !== null && sizeHeader.length > 0 ? Number(sizeHeader) : null,
  };
};

export const deleteSave = async (deps: SyncDeps, token: string, base = ''): Promise<{ ok: true } | SyncFail> => {
  const doFetch = resolveFetch(deps);
  if (!doFetch) return fail('network', '当前运行环境没有 fetch');

  const res = await withTimeout(deps, (signal) =>
    doFetch(`${base}${SYNC_BASE_PATH}/save`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    }),
  );
  if (!res.ok) {
    return fail('network', res.timedOut ? '请求超时' : `网络异常：${explain(res.err)}`);
  }
  const text = await res.value.text();
  if (res.value.ok) return { ok: true };
  return classify(res.value.status, errorTextOf(readJson(text)));
};

const explain = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// 信封：上线的明文长什么样
// ---------------------------------------------------------------------------

export const ENVELOPE_VERSION = 1;

export interface OpenedEnvelope {
  /** 存档主体的 JSON 文本 —— 直接喂给 decodeSave（它会负责迁移与转存） */
  saveJson: string;
  /** 信封里带的 API Key（没有则为 null）。取值方负责立刻写进独立键槽 */
  apiKey: string | null;
}

/**
 * 明文 → 密文。放在信封里的两样东西：
 *   · `save`  —— 整棵存档树（与导出文件里的 state 同一份东西）；
 *   · `apiKey` —— 与存档**分开**存、但在**同一个信封**里走。
 *
 * 为什么把 API Key 也锁进来：换手机时"输入口令即恢复"才是完整的 ——
 * 否则玩家还得回到旧设备上把 sk- 抄一遍。它是密文的一部分，
 * 服务器永远见不到明文，日志里也永远不会出现 `sk-`（verify-ops ㊱ 断言）。
 *
 * `v` 是信封自己的版本号：将来若改结构，老客户端能看懂"我不认识它"，
 * 而不是把一份看不懂的 JSON 当成存档塞进去。
 */
export const buildEnvelope = async (
  key: CryptoKey,
  save: EarthOnlineState,
  apiKey: string | null,
  deps: Pick<SyncDeps, 'subtle'> = {},
): Promise<string> =>
  encryptPayload(key, JSON.stringify({ v: ENVELOPE_VERSION, save, apiKey }), deps.subtle);

export const openEnvelope = async (
  key: CryptoKey,
  wire: string,
  deps: Pick<SyncDeps, 'subtle'> = {},
): Promise<OpenedEnvelope> => {
  const plain = await decryptPayload(key, wire, deps.subtle);
  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new Error('云端存档解开之后不是 JSON —— 这不该发生，请先别覆盖本地');
  }
  if (parsed === null || typeof parsed !== 'object') throw new Error('云端存档的信封不是一个对象');
  const body = parsed as { v?: unknown; save?: unknown; apiKey?: unknown };
  if (body.v !== ENVELOPE_VERSION) {
    throw new Error(`云端存档的信封版本是 ${String(body.v)}，这台设备上的应用还不认识它 —— 请先升级应用`);
  }
  if (body.save === null || typeof body.save !== 'object') throw new Error('云端存档的信封里没有主体');
  const apiKey = typeof body.apiKey === 'string' && body.apiKey.length > 0 ? body.apiKey : null;
  return { saveJson: JSON.stringify(body.save), apiKey };
};

// ---------------------------------------------------------------------------
// 纯决策
// ---------------------------------------------------------------------------

/**
 * 本地与云端谁更新？—— 三选一，**没有任何一条路会自动覆盖**。
 *
 *   'push'  这台设备更靠前（或云端还空着）→ 自动推
 *   'offer' 云端更靠前 → 挂一条横幅请玩家裁决（绝不自动拉）
 *   'equal' 一样新 → 什么都不做
 *
 * ⚠️ revision 是**各设备自己数下去的**，严格说跨设备不全局可比 ——
 * 但同一条存档血脉上的修订号在绝大多数分叉里大小关系是对的，
 * 而即使猜错，代价也只是"多问了一次玩家"：裁决权从来不在这个函数手里。
 */
export const compareCloud = (localRevision: number, cloud: SyncMeta | null): 'push' | 'offer' | 'equal' => {
  if (cloud === null || cloud.revision === null) return 'push';
  if (cloud.revision > localRevision) return 'offer';
  if (cloud.revision < localRevision) return 'push';
  return 'equal';
};

/**
 * 一句话进度摘要。给"要不要拉取"这个决定提供的最少信息 ——
 * 横幅上两边的正文就靠它和 formatBytes。
 */
export const summarizeProgress = (state: EarthOnlineState): string => {
  const track = activeTrack(state);
  const level = track?.level ?? 1;
  const title = trackTitle(track);
  const netWorth = formatUsd(netWorthUsdCents(state.vault));
  const journalCount = state.journal.entries.length;
  return `${title} ${level} 级 · 净资产 ${netWorth} · 成功日记 ${journalCount} 条`;
};

/** 本地存档的字节数（与上线的明文同一把尺子）。 */
export const localSaveBytes = (state: EarthOnlineState): number =>
  new TextEncoder().encode(encodeSave(state)).length;

/** 把字节数说成人话 —— 复用全站那一个 formatBytes，不另造一个。 */
export const describeBytes = formatBytes;

/** 浏览器当前环境；非浏览器（SSR / 构建期）返回 null。 */
export const resolveSyncEnv = (): { protocol: string; hostname: string } | null => {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return null;
  return { protocol: window.location.protocol, hostname: window.location.hostname };
};

/** 区分"成功"与"失败"两种返回。把它写成一个函数，免得每处调用各写一遍 as。 */
export const isFail = <T extends object>(v: T | SyncFail): v is SyncFail => (v as SyncFail).ok === false;

// ---------------------------------------------------------------------------
// 运行时的默认依赖（浏览器）
//
// 这一层不 import 任何 store —— deps 由调用方（useEarthOnlineStore）构造；
// 这里只给一个"真身"版本，让 store 与设置面板不必各写一遍 globalThis 探测。
// fetch 缺失时不在这里抛：交给 withTimeout 统一翻成 network 失败，措辞只有一处。
// ---------------------------------------------------------------------------

const browserFetch: SyncFetchLike = (input, init) => {
  const g = globalThis as { fetch?: unknown };
  if (typeof g.fetch !== 'function') return Promise.reject(new Error('当前运行环境没有 fetch'));
  return (g.fetch as SyncFetchLike)(input, init);
};

export const defaultSyncDeps = (overrides: Partial<SyncDeps> = {}): SyncDeps => ({
  fetch: browserFetch,
  now: () => new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// 三支流程
//
// 把"一串调用按什么次序走、失败了怎么办"从 store 里挤出来放在这里，
// 理由和 gateway / bus 的分工一样：**能注入依赖的地方就能被完整测一遍。**
// store 里的那三个动作于是只剩下"调流程 + 落库 + 通知界面"。
// ---------------------------------------------------------------------------

export interface EnableOutcome {
  ok: true;
  keys: DerivedKeys;
  /** true = 这台服务器已经有主，这次是"接入"（拿口令验证过了） */
  adopted: boolean;
  /** 接入时服务器上那份存档的样子（没有存档则 revision 为 null） */
  cloud: SyncMeta;
}

/**
 * 启用 / 接入。
 *
 *   · 服务器还没主 → 生成新盐、claim（safest：盐是新的，口令只在本地与它的导数一起出现）；
 *   · 服务器已经有主 → 用口令派生的 token **问一次**（HEAD）：401 = 口令不对，
 *     404 = 口令对、云端还没有存档，200 = 口令对、云端有存档（此时只带回头，不带体）。
 *
 * 它**不做任何抉择**：验证通过之后是推还是拉，由 compareCloud 与玩家决定。
 */
export const syncEnableFlow = async (
  deps: SyncDeps,
  input: { passphrase: string },
  base = '',
): Promise<EnableOutcome | SyncFail> => {
  const meta = await fetchMeta(deps, base);
  if (isFail(meta)) return meta;

  const salt = meta.claimed && meta.salt !== null ? meta.salt : randomSalt();
  let keys: DerivedKeys;
  try {
    keys = await deriveKeyMaterial(input.passphrase, salt, deps.subtle);
  } catch (err) {
    return fail('bad_request', err instanceof Error ? err.message : String(err));
  }

  if (!meta.claimed) {
    const claimed = await claimServer(deps, { salt, verifier: keys.verifier }, base);
    if (isFail(claimed)) return claimed;
    return { ok: true, keys, adopted: false, cloud: meta };
  }

  const probe = await probeSave(deps, keys.token, base);
  if (isFail(probe)) {
    // 404 不是错误：口令对、云端还空着。这条路之后是"首次推送"。
    if (probe.code === 'empty') return { ok: true, keys, adopted: true, cloud: meta };
    return probe;
  }
  return {
    ok: true,
    keys,
    adopted: true,
    cloud: { ...meta, revision: probe.revision, updatedAt: probe.updatedAt, size: probe.size },
  };
};

/**
 * 推一次。信封（存档 + API Key）在这里合成，密文在这里产生 ——
 * **明文只存在于这个函数的栈上**，出去的就是一串 Base64。
 */
export const syncPushFlow = async (
  deps: SyncDeps,
  input: { keys: { key: CryptoKey; token: string }; save: EarthOnlineState; apiKey: string | null; revision: number | null },
  base = '',
): Promise<{ ok: true; revision: number; size: number } | SyncFail> => {
  const wire = await buildEnvelope(input.keys.key, input.save, input.apiKey, deps);
  return pushSave(
    deps,
    { token: input.keys.token, wire, revision: input.revision, updatedAt: input.save.meta.updatedAt },
    base,
  );
};

export interface PullOutcome {
  ok: true;
  save: EarthOnlineState;
  /** 信封里带回来的 API Key（可能没有）。取值方负责写进独立键槽 */
  apiKey: string | null;
  revision: number | null;
  /** 迁移/水合过程中的说明（非空时应当告诉玩家，但不必吓他） */
  note: string | null;
}

/**
 * 取一次并解开。
 *
 * 三处复用别处已有的机械，一处也不重写：
 *   · 解密走 openEnvelope（口令不对与密文损坏在这里不可区分，措辞如实）；
 *   · 版本与迁移走 decodeSave + MIGRATIONS —— **与"打开应用"和"从文件导入"
 *     是同一条升级路径**，所以云端存着一份旧版本的档，拉下来照样能读；
 *   · 它**不碰本地任何东西**：拉取是"先成功解开、再考虑替换"，
 *     替换与快照是 store 的事（见 useEarthOnlineStore.syncPull）。
 */
export const syncPullFlow = async (
  deps: SyncDeps,
  input: { keys: { key: CryptoKey; token: string }; now: Date },
  base = '',
): Promise<PullOutcome | SyncFail> => {
  const remote = await fetchSave(deps, input.keys.token, base);
  if (isFail(remote)) return remote;

  let opened: OpenedEnvelope;
  try {
    opened = await openEnvelope(input.keys.key, remote.wire, deps);
  } catch (err) {
    return fail('decrypt', err instanceof Error ? err.message : String(err));
  }

  const decoded = decodeSave(opened.saveJson, CURRENT_SCHEMA_VERSION, MIGRATIONS, input.now);
  if (!decoded.save) {
    return fail('server', `云端存档读不进来：${decoded.note ?? '结构不完整。'}本地那份没有被动过。`);
  }

  return { ok: true, save: decoded.save, apiKey: opened.apiKey, revision: remote.revision, note: decoded.note };
};

export interface RotateOutcome {
  ok: true;
  /** 新口令派生出的钥匙（调用方负责写进本地键槽） */
  keys: DerivedKeys;
  /** 轮换完成后云端的修订号（云端本来就空则为 null） */
  revision: number | null;
  /** 这次轮换是否顺带把本机存档推了上去 */
  pushed: boolean;
}

/**
 * 更换口令：**换锁，不换里面的东西**。
 *
 * ---------------------------------------------------------------------------
 * 为什么它不需要旧口令
 * ---------------------------------------------------------------------------
 * 旧口令的派生物（旧 token）一直在本机键槽里 —— 它才是向服务器证明身份的
 * 东西，而"口令 → 派生物"这一步的产物在换口令时根本不用重算。
 * 所以玩家只需要输一遍**新**口令。
 *
 * ---------------------------------------------------------------------------
 * 次序，以及为什么是这个次序（先推后换）
 * ---------------------------------------------------------------------------
 *   ① 取 /meta（要它的修订号做 If-Match 基准）；
 *   ② 新盐 + 新钥（换口令就换盐 —— 两把口令之间不再共享任何输入）；
 *   ③ 用**本机存档**做重加密的明文来源，以新钥加密、以**旧 token** 推送。
 *      为什么明文来源是"本机新存档"而不是"先把云端那份拉下来"：
 *      拉下来要先解密，而解密的依赖会让失败重试走进死胡同（下面第 ④ 条的
 *      窗口里，云端已经是新钥密文，旧钥解不开它）。本机存档的明文一直在手，
 *      重试永远从同一个干净起点出发。顺带，这条也把"换口令时顺手把
 *      最新进度推上去"免费拿到了 —— 推的内容正是本机存档。
 *   ④ 用旧 token 去 claim，让服务器把 salt + verifier 换成新的那一对。
 *      这一步之后，旧 token 作废、新 token 生效；
 *   ⑤ 调用方在**全部成功之后**才把新钥写进本地键槽。
 *
 * 失败窗口（③ 成功、④ 失败，比如中途断网）是**可重试**的：
 * 旧 token 还没作废，云端的"新钥密文"对重试完全无害 —— 重试的第 ③ 步
 * 会用同一把新口令（派生是确定的）重新推一次、覆盖它，然后重新换验。
 * 玩家要做的只是"再点一次"，并且必须用**同一个新口令**。
 * 密码学上这一步不可逆，但这不是缺陷：旧口令在派生新钥这件事上毫无用处。
 */
export const syncRotatePassphraseFlow = async (
  deps: SyncDeps,
  input: { passphrase: string; oldToken: string; save: EarthOnlineState; apiKey: string | null },
  base = '',
): Promise<RotateOutcome | SyncFail> => {
  const meta = await fetchMeta(deps, base);
  if (isFail(meta)) return meta;

  // 新盐 + 新钥。deriveKeyMaterial 自己会拦下"太短"的口令。
  const salt = randomSalt();
  let keys: DerivedKeys;
  try {
    keys = await deriveKeyMaterial(input.passphrase, salt, deps.subtle);
  } catch (err) {
    return fail('bad_request', err instanceof Error ? err.message : String(err));
  }

  // 服务器没主（卷被清过 / 从没 claim 过）：没有旧验可换，直接重新认领，
  // 顺手用新钥把本机存档设成云端的第一份。
  if (!meta.claimed) {
    const claimed = await claimServer(deps, { salt, verifier: keys.verifier }, base);
    if (isFail(claimed)) return claimed;
    const seeded = await syncPushFlow(
      deps,
      { keys: { key: keys.key, token: keys.token }, save: input.save, apiKey: input.apiKey, revision: null },
      base,
    );
    if (isFail(seeded)) return seeded;
    return { ok: true, keys, revision: seeded.revision, pushed: true };
  }

  // ③ 重加密并推送。认证用旧 token，加密用新钥 —— 这两件事在这条线上正交。
  let revision = meta.revision;
  let pushed = false;
  if (meta.revision !== null) {
    const out = await syncPushFlow(
      deps,
      { keys: { key: keys.key, token: input.oldToken }, save: input.save, apiKey: input.apiKey, revision: meta.revision },
      base,
    );
    if (isFail(out)) return out;
    revision = out.revision;
    pushed = true;
  }

  // ④ 换验。服务器只认 verifier，而这一步之后它认的就是新钥的了。
  const rotated = await claimServer(deps, { salt, verifier: keys.verifier, token: input.oldToken }, base);
  if (isFail(rotated)) return rotated;

  return { ok: true, keys, revision, pushed };
};
