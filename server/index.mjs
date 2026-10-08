// ============================================================================
// EarthOnline · 云同步服务 (server/index.mjs)
//
// 零依赖 Node（node:http + ./store.mjs）—— 没有 npm install，没有 node_modules。
// 它是这一整个特性里唯一活在服务器上的东西，所以它的立场要写死在开头：
//
//   **服务端从不解析密文体。** 它搬运的是一段它读不懂的字节：
//   修订号与更新时间走请求头（X-Save-Revision / X-Save-UpdatedAt），
//   大小走 Content-Length，身份走 verifier（token 解码字节的 sha256）与 Bearer 头。
//   于是"服务器上只有密文"不是一句承诺 —— 是它读不懂别的。
//
// ---------------------------------------------------------------------------
// 合同（与 src/lib/syncClient.ts 头部那份**逐字对应**，改动必须两边同时改）
// ---------------------------------------------------------------------------
//   GET    /sync/v1/health  → 200 { ok }
//   GET    /sync/v1/meta    → 200 { claimed, salt, revision, updatedAt, size, maxBytes }（公开）
//   POST   /sync/v1/claim   → 201（首次）/ 200（带旧 token 换口令）/ 409 / 401
//   GET    /sync/v1/save    → 200 密文 + X-Save-Revision / X-Save-UpdatedAt 头；404 = 云端还没有
//   HEAD   /sync/v1/save    → 与 GET 同一条路由，只是不发体（接入流程拿它验口令）
//   PUT    /sync/v1/save    → 200 { revision, size }；If-Match 对不上 → 409 { revision }；超限 → 413
//   DELETE /sync/v1/save    → 200（旧版本仍留在服务器上，见 store.mjs）
//
// ⚠️ 路径前缀不剥：Caddy 的 `handle /sync/*` 与裸机 nginx 的 `location /sync/`
//    都把原路径转过来，所以这里路由的字面量就是 /sync/v1/...。
//    If-Match 只在**云端非空**时强制 —— 云端空着时任何 If-Match 都接受（首次推送）。
//
// ---------------------------------------------------------------------------
// 环境变量
// ---------------------------------------------------------------------------
//   SYNC_DATA_DIR   默认 /data      数据目录（容器里挂 sync_data 卷）
//   SYNC_PORT       默认 3000       监听端口（0 = 让内核挑一个，测试用）
//   SYNC_MAX_BYTES  默认 20971520   单份密文上限（20MB；存档现实 2~6MB）
//
// ---------------------------------------------------------------------------
// 日志纪律（PO 的安全约束，落地在这一行里）
// ---------------------------------------------------------------------------
//   每个请求只记：method + path + status + 字节数。
//   **Authorization 头、请求体、响应体一个字节都不进日志** ——
//   这台服务器上值得偷的东西只有密文本身，而它也不该出现在日志里。
// ============================================================================

import { createServer } from 'node:http';
import { createStore, verifierOf, timingSafeEqualHex } from './store.mjs';

const PORT = Number(process.env.SYNC_PORT ?? 3000);
const DATA_DIR = process.env.SYNC_DATA_DIR ?? '/data';
const MAX_BYTES = Number(process.env.SYNC_MAX_BYTES ?? 20 * 1024 * 1024);

/** claim 的请求体上限：它只该是 {salt, verifier} 两格，4KB 已经宽到不能再宽 */
const CLAIM_BODY_LIMIT = 4 * 1024;

const BASE = '/sync/v1';

const store = createStore(DATA_DIR);
{
  const rec = store.reconcile();
  if (rec.rolledBack) {
    console.log(
      `[sync] 开机 reconcile：上次写入死在半路，已回滚到最后一份完整存档（另清残件 ${rec.cleaned} 个）`,
    );
  } else if (rec.cleaned > 0) {
    console.log(`[sync] 开机清理了 ${rec.cleaned} 个半途残件`);
  }
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const bearerOf = (req) => {
  const raw = req.headers.authorization ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : null;
};

/** 这个请求有没有带一把对的钥匙 —— 服务器只认识 verifier，现算现比 */
const authed = (req) => {
  const state = store.readState();
  const token = bearerOf(req);
  if (!state.claimed || state.verifier === null || token === null) return false;
  return timingSafeEqualHex(verifierOf(token), state.verifier);
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/**
 * 读体，带上限。**先看 Content-Length 再收字节**：一条声称 100MB 的 PUT
 * 不该有机会把内存吃掉大半才被拒绝。没有 Content-Length（分块）时按累计拦。
 */
const readBody = (req, limit) =>
  new Promise((resolve) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ tooLarge: true });
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        finish({ tooLarge: true });
        req.removeAllListeners('data');
        req.resume(); // 把剩下的倒掉，别让连接悬着
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish({ tooLarge: false, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => finish({ tooLarge: false, text: '' }));
  });

/** 倒掉字节的上限：64MB 已远超"存档略超限"的现实，再大就不再奉陪 */
const DRAIN_LIMIT = 64 * 1024 * 1024;

/**
 * 把请求体剩下的字节倒掉（不进内存、不解析）。
 *
 * 为什么 413 要先倒完再应答：客户端还在上传途中，服务端若先应答再关连接，
 * 操作系统会因为"带着未读数据关 socket"回一个 RST —— 客户端在收应答的半途
 * 撞上 connection reset，看到的是一句网络错误而不是「太大了」（Windows 尤甚，
 * undici 下这是可复现的竞态）。倒完再答，客户端把体写完、把 413 读完，
 * 连接随后干净地关。
 *
 * 决定仍然是在请求头上就做完的（这正是"读体前拦"的意思：不缓冲、不解析）；
 * 这里花掉的只是带宽。病态巨体到 DRAIN_LIMIT 就 cut，那种场合收不到应答
 * 也无所谓 —— 本就不该有这种体。
 */
const discardBody = (req, limit = DRAIN_LIMIT) =>
  new Promise((resolve) => {
    // 体已经走完了（readBody 的累计路径可能先一步把流读完）—— 不必等一个不会再来的事件
    if (req.readableEnded) {
      resolve({ aborted: false });
      return;
    }
    let seen = 0;
    let done = false;
    const finish = (aborted) => {
      if (done) return;
      done = true;
      req.removeListener('data', onData);
      resolve({ aborted });
    };
    const onData = (chunk) => {
      seen += chunk.length;
      if (seen > limit) {
        req.destroy();
        finish(true);
      }
    };
    req.on('data', onData);
    req.on('end', () => finish(false));
    req.on('error', () => finish(true));
    // ⚠️ 别拿 req.destroyed 当"客户端断了"的信号：流读完之后 autoDestroy 会把它
    //    置真（第一版就栽在这上面 —— 413 送不出去，客户端只等到一个 RST）。
    //    以"有没有读到 end"为准。
    req.on('close', () => finish(!req.readableEnded));
  });

// ---------------------------------------------------------------------------
// 服务器
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const method = (req.method ?? 'GET').toUpperCase();
  const path = (req.url ?? '/').split('?')[0];

  // 日志只装这四个数字/词，别的什么都不进
  let status = 500;
  let size = 0;

  const json = (code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { ...JSON_HEADERS, 'content-length': Buffer.byteLength(body) });
    res.end(body);
    status = code;
    size = Buffer.byteLength(body);
  };
  const fail = (code, error) => json(code, { error });

  try {
    if (path === `${BASE}/health`) {
      if (method === 'GET' || method === 'HEAD') json(200, { ok: true });
      else fail(404, 'no_route');
    } else if (path === `${BASE}/meta`) {
      // 公开：还没有口令的设备也要能问"这台服务器有没有主、云端多新"
      if (method !== 'GET') {
        fail(404, 'no_route');
      } else {
        const state = store.readState();
        const blob = store.readBlob();
        json(200, {
          claimed: state.claimed,
          salt: state.claimed ? state.salt : null,
          revision: blob === null ? null : blob.revision,
          updatedAt: blob === null ? null : blob.updatedAt,
          size: blob === null ? null : Buffer.byteLength(blob.wire),
          maxBytes: MAX_BYTES,
        });
      }
    } else if (path === `${BASE}/claim`) {
      if (method !== 'POST') {
        fail(404, 'no_route');
      } else {
        const r = await readBody(req, CLAIM_BODY_LIMIT);
        if (r.tooLarge) {
          status = 413; // 决定就是它；下面只是把它送到（理由见 discardBody）
          const drained = await discardBody(req);
          if (!drained.aborted) {
            res.setHeader('connection', 'close');
            fail(413, 'too_large');
          }
        } else {
          let body = null;
          try {
            body = JSON.parse(r.text);
          } catch {
            body = null;
          }
          const wellFormed =
            body !== null &&
            typeof body === 'object' &&
            typeof body.salt === 'string' &&
            body.salt.length > 0 &&
            body.salt.length <= 128 &&
            typeof body.verifier === 'string' &&
            /^[0-9a-f]{64}$/.test(body.verifier);
          if (!wellFormed) {
            fail(400, 'bad_request');
          } else {
            const state = store.readState();
            if (!state.claimed) {
              store.writeState({
                claimed: true,
                salt: body.salt,
                verifier: body.verifier,
                claimedAt: new Date().toISOString(),
              });
              json(201, {});
            } else if (authed(req)) {
              // 换口令：带着旧 token 来证明身份，服务器换掉 salt + verifier。
              // 这一步之后旧 token 作废 —— "别的设备要用新口令重新接入"的机械形态。
              store.writeState({
                ...state,
                salt: body.salt,
                verifier: body.verifier,
                rotatedAt: new Date().toISOString(),
              });
              json(200, {});
            } else {
              // 已经有主、又拿不出旧钥匙 —— 与"首次 claim 撞上已有主"同一句应答：
              // 客户端据此把玩家引向「接入」
              fail(409, 'claimed');
            }
          }
        }
      }
    } else if (path === `${BASE}/save`) {
      if (!authed(req)) {
        fail(401, 'unauthorized');
      } else if (method === 'GET' || method === 'HEAD') {
        const blob = store.readBlob();
        if (blob === null) {
          fail(404, 'empty');
        } else {
          const bytes = Buffer.byteLength(blob.wire);
          res.writeHead(200, {
            'content-type': 'application/octet-stream',
            'cache-control': 'no-store',
            'x-save-revision': String(blob.revision),
            // ⚠️ 头名与客户端逐字符一致（X-Save-UpdatedAt，没有第二个连字符）——
            //    假服务器对头名大小写不敏感，只有真 HTTP 会把这个漂移暴露出来（㊳ 抓到过）
            'X-Save-UpdatedAt': blob.updatedAt ?? '',
            'content-length': String(bytes),
          });
          // HEAD 不会真的发体（Node 对 HEAD 响应自动压掉 body），但头一样齐全
          res.end(method === 'GET' ? blob.wire : undefined);
          status = 200;
          size = method === 'GET' ? bytes : 0;
        }
      } else if (method === 'PUT') {
        const declared = Number(req.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          status = 413;
          const drained = await discardBody(req);
          if (!drained.aborted) {
            res.setHeader('connection', 'close');
            fail(413, 'too_large');
          }
        } else {
          const r = await readBody(req, MAX_BYTES);
          if (r.tooLarge) {
            status = 413;
            const drained = await discardBody(req);
            if (!drained.aborted) {
              res.setHeader('connection', 'close');
              fail(413, 'too_large');
            }
          } else {
            const blob = store.readBlob();
            const ifMatch = req.headers['if-match'] ?? null;
            if (blob !== null && ifMatch !== String(blob.revision)) {
              // 冲突要把**当前**修订带回给客户端 —— 它据此把两边摆到玩家的裁决横幅上
              res.setHeader('x-save-revision', String(blob.revision));
              json(409, { error: 'conflict', revision: blob.revision });
            } else {
              const revision = Number(req.headers['x-save-revision']);
              if (!Number.isInteger(revision) || revision < 1) {
                fail(400, 'bad_revision');
              } else {
                const updatedAtRaw = req.headers['x-save-updatedat'];
                const updatedAt = typeof updatedAtRaw === 'string' ? updatedAtRaw : '';
                store.putBlob({ wire: r.text, revision, updatedAt });
                json(200, { revision, size: Buffer.byteLength(r.text) });
              }
            }
          }
        }
      } else if (method === 'DELETE') {
        if (!store.deleteBlob()) {
          fail(404, 'empty');
        } else {
          json(200, {});
        }
      } else {
        fail(404, 'no_route');
      }
    } else {
      fail(404, 'no_route');
    }
  } catch (err) {
    // 意外异常的原文不进日志也不进应答（里面可能带路径）；给一句人话就够定位
    console.error(`[sync] 内部错误：${err instanceof Error ? err.name : 'unknown'}`);
    if (!res.headersSent) fail(500, 'internal');
  } finally {
    // ⚠️ 这一行是**唯一**的请求日志（纪律见文件头）
    console.log(`[sync] ${method} ${path} ${status} ${size}B`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addr = server.address();
  const port = addr !== null && typeof addr === 'object' ? addr.port : PORT;
  console.log(
    `[sync] 数据目录 ${DATA_DIR} · 密文上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB · 服务端不解析密文体`,
  );
  // 机器可读的一行：测试从 stdout 里读它拿真实端口（SYNC_PORT=0 时尤其）
  console.log(`[sync] SYNC_LISTENING port=${port}`);
});

const shutdown = () => {
  console.log('[sync] 收到退出信号，关门');
  server.close(() => process.exit(0));
  // 关门不成就到点强制走人，别把容器停成僵尸
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
