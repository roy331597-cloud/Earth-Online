// ============================================================================
// EarthOnline · 云同步的存储层 (server/store.mjs)
//
// 零依赖（node:fs / node:crypto / node:path）。整个模块只回答一个问题：
// **怎么把一份几 MB 的密文写到盘上，并且永远不原地丢弃上一版。**
//
// ---------------------------------------------------------------------------
// 盘上的三样东西（都在 SYNC_DATA_DIR 里）
// ---------------------------------------------------------------------------
//   state.json     认领信息：{ claimed, salt, verifier, claimedAt }
//                  —— 这台服务器"有没有主、主是谁（verifier）"的全部分量。
//                  服务器只存 verifier（token 的 sha256），token 本身从不上盘。
//   save.bin       当前密文。**第一行是一格 JSON 头**（revision / updatedAt），
//                  换行之后才是密文本身 —— 内容与版本号写在同一个文件里。
//   save.prev.bin  上一版密文（同样的格式）。PUT / DELETE 永远把旧的挪成 prev，
//                  而不是 unlink —— 整条链只保留一代，是有意的上限。
//
// ---------------------------------------------------------------------------
// 为什么修订号要和密文写在一个文件里
// ---------------------------------------------------------------------------
// 分开写（密文一个文件、revision 一个文件）的话，"写完密文、还没写版本号"
// 的崩溃窗口会让盘上出现"新内容 + 旧版本号"的错位 —— 客户端会据此把云端
// 判断成比实际更旧。把两样捆进一个文件、一次 rename 换掉，这个窗口就不
// 存在了：要么整份新状态可见，要么整份旧的可见。
// 那一行头是**服务器自己的簿记**；密文体服务端从不解析（见 index.mjs 的合同）。
//
// ---------------------------------------------------------------------------
// 写入次序，与开机 reconcile 靠什么判定"上次死在半路"
// ---------------------------------------------------------------------------
//   PUT:  写 save.tmp.blob.*  →（有旧 save.bin 则）save.bin → save.prev.bin
//         → save.tmp.blob.* → save.bin
//   崩在"bin 已挪走、tmp 还没到位"之间的话，盘上是"bin 消失 + prev 在"，
//   而 save.tmp.blob.* 残件还留着 —— reconcile 靠这个指纹判定半途写入，
//   先把 prev 挪回 bin（回滚到最后一份完整状态），再清残件。
//   注意"只有 prev、没有 bin"**不一定是**半途：DELETE 之后的正常态就长这样，
//   所以判定必须有 blob 残件这个前提（这也是 tmp 文件名要带 blob / state 前缀的原因：
//   写 state.json 死在半路不该触发密文回滚）。
//
// 先 fsync 文件再 rename（防的是掉电把 rename 提交了、内容还留在页缓存里）。
// 目录本身的 fsync 只尽力而为：Windows 上开不了目录 fd，跳过不影响正确性 ——
// 顶多最近一次 rename 在掉电后回退到旧版本，而那正是双版本链兜住的事。
// ============================================================================

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

export const STATE_FILE = 'state.json';
export const BLOB_FILE = 'save.bin';
export const PREV_FILE = 'save.prev.bin';
const TMP_PREFIX = 'save.tmp.';

/**
 * token → 验凭证（sha256 hex）。**这是服务端唯一要镜像的客户端函数**：
 * 必须与 src/lib/syncCrypto.ts 的 computeVerifier 逐字节一致 —— 对
 * **base64url 解码后的 32 字节**取摘要，而不是对 token 文本取。
 * 两边漂了的症状是"口令明明对，却一直 401"；verify-ops ㊳ 起真服务器回环，
 * 就是为了让这种漂移在交付前大声地失败（它第一次跑就抓到过这处）。
 */
export const verifierOf = (token) =>
  createHash('sha256').update(Buffer.from(token, 'base64url')).digest('hex');

/**
 * 定长的十六进制比较。前提是两边都是 64 字符 hex（sha256 的形态）——
 * 形状不对直接 false，绝不让 Buffer.from(x, 'hex') 的"悄悄截短"混进比较。
 */
export const timingSafeEqualHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

/** 密文文件的编码：头一行 JSON + 换行 + 密文本身（密文是 Base64，没有换行） */
const encodeBlob = (revision, updatedAt, wire) =>
  `${JSON.stringify({ revision, updatedAt })}\n${wire}`;

const decodeBlob = (raw) => {
  const text = raw.toString('utf8');
  const cut = text.indexOf('\n');
  if (cut < 0) return null;
  let head;
  try {
    head = JSON.parse(text.slice(0, cut));
  } catch {
    return null;
  }
  const revision =
    typeof head.revision === 'number' && Number.isFinite(head.revision) ? head.revision : null;
  if (revision === null) return null;
  return {
    revision,
    updatedAt: typeof head.updatedAt === 'string' ? head.updatedAt : null,
    wire: text.slice(cut + 1),
  };
};

/**
 * 打开（必要时创建）一块数据目录，返回这五个动作。
 * 不抛错是刻意的：调用方是 HTTP 层，它需要的是"每种情况怎么应答"，
 * 而不是一串要各自 try/catch 的异常。
 */
export const createStore = (dir) => {
  mkdirSync(dir, { recursive: true });

  const at = (name) => join(dir, name);

  /** 先写 tmp、fsync、再 rename —— 任何读者要么看到旧的整份，要么看到新的整份 */
  const atomicWriteState = (state) => {
    const tmp = at(`${TMP_PREFIX}state.${process.pid}.${Date.now()}`);
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, JSON.stringify(state, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, at(STATE_FILE));
  };

  /**
   * 认领信息。文件不在 / 读坏了 → 当作"没有主"。
   * 密文一个字节都不会被动 —— 假如此时盘上还有密文，客户端会把"服务器说没主、
   * 却有一份旧密文"的分歧摆到玩家的裁决横幅上（推的时候撞上冲突，由人裁定）。
   */
  const readState = () => {
    const unclaimed = { claimed: false, salt: null, verifier: null, claimedAt: null };
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(at(STATE_FILE), 'utf8'));
    } catch {
      return unclaimed;
    }
    if (parsed === null || typeof parsed !== 'object' || parsed.claimed !== true) return unclaimed;
    return {
      claimed: true,
      salt: typeof parsed.salt === 'string' ? parsed.salt : null,
      verifier: typeof parsed.verifier === 'string' ? parsed.verifier : null,
      claimedAt: typeof parsed.claimedAt === 'string' ? parsed.claimedAt : null,
    };
  };

  const writeState = (state) => atomicWriteState(state);

  /** 当前密文；没有 / 头读不懂 → null（读不懂也不删，留着给人排查） */
  const readBlob = () => {
    try {
      return decodeBlob(readFileSync(at(BLOB_FILE)));
    } catch {
      return null;
    }
  };

  /**
   * 写入一份新密文。次序见文件头：旧 bin 先挪 prev，tmp 再 rename 上位。
   * revision 由调用方校验过（正整数）；这里只管落盘。
   */
  const putBlob = ({ wire, revision, updatedAt }) => {
    const tmp = at(`${TMP_PREFIX}blob.${process.pid}.${Date.now()}`);
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, encodeBlob(revision, updatedAt, wire));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(at(BLOB_FILE))) renameSync(at(BLOB_FILE), at(PREV_FILE));
    renameSync(tmp, at(BLOB_FILE));
  };

  /** 删除 = 挪进 prev（从不 unlink）。返回"原来有没有" */
  const deleteBlob = () => {
    if (!existsSync(at(BLOB_FILE))) return false;
    renameSync(at(BLOB_FILE), at(PREV_FILE));
    return true;
  };

  /**
   * 开机统一收拾一次：判定与回滚的规则见文件头。
   * 返回值是给日志看的（rolledBack=回滚了 / cleaned=清掉的残件数）。
   */
  const reconcile = () => {
    const stray = readdirSync(dir).filter((n) => n.startsWith(TMP_PREFIX));
    let rolledBack = false;
    if (stray.some((n) => n.startsWith(`${TMP_PREFIX}blob.`))) {
      // 有密文的半途残件 = 上次 PUT 死在 rename 之间
      if (!existsSync(at(BLOB_FILE)) && existsSync(at(PREV_FILE))) {
        renameSync(at(PREV_FILE), at(BLOB_FILE));
        rolledBack = true;
      }
    }
    for (const n of stray) {
      try {
        unlinkSync(at(n));
      } catch {
        // 清不掉也不挡路：下一次开机还会来清
      }
    }
    return { rolledBack, cleaned: stray.length };
  };

  return { readState, writeState, readBlob, putBlob, deleteBlob, reconcile };
};
