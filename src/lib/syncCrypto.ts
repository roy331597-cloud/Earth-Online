// ============================================================================
// EarthOnline · 云同步的密码学原语 (syncCrypto)
//
// 这一层回答一个问题：**口令怎么变成一把能锁住存档的钥匙，以及一把能向
// 服务器证明"我是我"的凭证。**
//
// ---------------------------------------------------------------------------
// 与 secretStore 的分工（先读这里，免得把两件事混为一谈）
// ---------------------------------------------------------------------------
// secretStore 做的是**混淆**：它保护的是"一眼可用的凭证不被顺手抄走"，
// 挡不住任何有心人 —— 因为解密函数就在浏览器里，谁都能照着跑。
//
// 这一层不同：它是**真加密**。存档在离开这台设备之前就被 AES-GCM 锁上，
// 服务器（以及路上任何一台看得见流量的机器）拿到的只有密文。
// 口令本身**从不离开设备** —— 上路的只有它的导数（密钥与 token）。
//
// 一个口令派生出两样东西（一次 PBKDF2，各取一半）：
//   · 前 32 字节 → AES-GCM-256 密钥：锁存档用；
//   · 后 32 字节 → Bearer token：向服务器出示用。
// 为什么是"一个口令派生两样"而不是"口令 + 独立密码"：玩家只需要记住一件事。
// 而 210,000 次 PBKDF2 迭代保证"从 token 反推口令"与"从密文反推密钥"同样昂贵。
//
// ---------------------------------------------------------------------------
// 纪律
// ---------------------------------------------------------------------------
// · **不读任何全局状态**：crypto 由调用方注入（不传时才取 globalThis），
//   于是 verify-ops 可以在 Node 里直接跑它，不需要浏览器；
// · **不读时钟、不碰 LocalStorage**：纯函数，输入一样输出就一样；
// · 抛错信息里**永不出现口令或密钥** —— 这一层的所有错误都只说"哪里不行"；
// · 只在安全上下文里可用（crypto.subtle 不存在即抛）—— 这不是缺陷，
//   是恰好与"PWA 需要 HTTPS"同一条门槛，见 syncAllowed。
// ============================================================================

/** 14 字节写死不如一个常量。改它 = 旧密文全部作废，所以它是终身的。 */
export const PBKDF2_ITERATIONS = 210_000;

/** 盐的字节数。16 字节是 PBKDF2 的常规下限。 */
export const SALT_BYTES = 16;

/** AES-GCM 的 IV：12 字节是 GCM 的标准长度（96 bit），别改成别的。 */
export const IV_BYTES = 12;

// ---------------------------------------------------------------------------
// 字节 ⇄ 文本 的小工具
//
// 为什么不用 btoa(String.fromCharCode(...bytes))：一条 6MB 的存档会变成
// 六百万个参数的函数调用，直接爆栈。分块处理，顺带把内存摊平。
// ---------------------------------------------------------------------------

const CHUNK = 0x8000;

const bytesToBinary = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
};

const binaryToBytes = (bin: string): Uint8Array => {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
};

export const bytesToB64 = (bytes: Uint8Array): string => btoa(bytesToBinary(bytes));

export const b64ToBytes = (b64: string): Uint8Array => binaryToBytes(atob(b64));

/** base64url：给能放进 URL / 头里的场合用（token 是这类东西） */
export const bytesToB64url = (bytes: Uint8Array): string =>
  bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const b64urlToBytes = (text: string): Uint8Array => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4));
};

// ---------------------------------------------------------------------------
// 随机源
// ---------------------------------------------------------------------------

const randomBytes = (n: number): Uint8Array => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('当前环境没有安全随机源（需要 HTTPS 或 localhost）');
  }
  const out = new Uint8Array(n);
  c.getRandomValues(out);
  return out;
};

/** 一把新盐。服务器首次 claim 时由客户端生成，随 claim 一起交上去。 */
export const randomSalt = (): string => bytesToB64(randomBytes(SALT_BYTES));

// ---------------------------------------------------------------------------
// 口令 → 密钥材料
// ---------------------------------------------------------------------------

const resolveSubtle = (injected?: SubtleCrypto): SubtleCrypto => {
  if (injected) return injected;
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const subtle = c?.subtle;
  if (!subtle) {
    // HTTP 打开时就是这一条。措辞指向"该怎么办"，不是"哪里坏了"。
    throw new Error('当前环境没有 Web Crypto（crypto.subtle 只在 HTTPS 或 localhost 下可用）');
  }
  return subtle;
};

export interface DerivedKeys {
  /**
   * AES-GCM 密钥的**原始 32 字节**（base64）。
   *
   * 落进本地同步键槽的就是它 —— 下次启动直接 import，
   * 不必再跑一次 210,000 轮 PBKDF2（那几百毫秒该省，因为它跑在开机路径上）。
   */
  keyB64: string;
  /** Bearer token（base64url）。向服务器出示的那一半。 */
  token: string;
  /** token 的 sha256（hex）。claim 时交给服务器的**验凭证** —— 服务器存它，不存 token。 */
  verifier: string;
  /** 导入好的 AES 密钥，供本次会话直接用 */
  key: CryptoKey;
}

/** 把原始字节导成一把可用的 AES-GCM 密钥（从本地键槽恢复时用这条路） */
export const importAesKey = async (keyB64: string, injected?: SubtleCrypto): Promise<CryptoKey> => {
  const subtle = resolveSubtle(injected);
  const raw = b64ToBytes(keyB64);
  if (raw.length !== 32) throw new Error('同步密钥长度不对（应为 32 字节）');
  return subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

/**
 * 口令 + 盐 → 密钥材料。**同样输入永远同样输出** —— token 的稳定性靠它。
 *
 * 注入的 subtle 不传时取 globalThis。抛错时只说环境，不说内容。
 */
export const deriveKeyMaterial = async (
  passphrase: string,
  saltB64: string,
  injected?: SubtleCrypto,
): Promise<DerivedKeys> => {
  const subtle = resolveSubtle(injected);
  const trimmed = passphrase.trim();
  if (trimmed.length < 8) throw new Error('口令太短（至少 8 位）');

  const salt = b64ToBytes(saltB64);
  const base = await subtle.importKey('raw', new TextEncoder().encode(trimmed) as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    512, // 64 字节 = 32 密钥 + 32 token
  );
  const all = new Uint8Array(bits);
  const keyRaw = all.subarray(0, 32);
  const tokenRaw = all.subarray(32, 64);

  const key = await subtle.importKey('raw', keyRaw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const token = bytesToB64url(tokenRaw);
  return { keyB64: bytesToB64(keyRaw), token, verifier: await computeVerifier(token, subtle), key };
};

/**
 * token → 验凭证（sha256 hex）。
 *
 * **这是服务端唯一要镜像的函数**（server/store.mjs 的 `verifierOf`）——
 * 它必须对"解码后的 32 字节"取摘要，而不是对 base64url 文本取。
 * 两边对不上的症状是"口令明明对，却一直 401"，因此 verify-ops ㊳ 起真服务器回环，
 * 就是为了让这种漂移在交付前大声地失败。
 */
export const computeVerifier = async (token: string, injected?: SubtleCrypto): Promise<string> => {
  const subtle = resolveSubtle(injected);
  const digest = await subtle.digest('SHA-256', b64urlToBytes(token) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------------------
// 锁 / 开（AES-GCM）
// ---------------------------------------------------------------------------

/**
 * 明文 → 上线体：`base64(IV ‖ 密文)`。
 *
 * IV 每次加密都重新随机 —— GCM 下**同一个密钥配同一个 IV 是灾难性的**
 * （会泄露明文异或关系）。12 字节随机在 2^96 空间里碰撞概率可以忽略，
 * 而每次推送本来就是新密文，不需要另做计数器。
 */
export const encryptPayload = async (key: CryptoKey, plaintext: string, injected?: SubtleCrypto): Promise<string> => {
  const subtle = resolveSubtle(injected);
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext)),
  );
  const wire = new Uint8Array(iv.length + ct.length);
  wire.set(iv, 0);
  wire.set(ct, iv.length);
  return bytesToB64(wire);
};

/**
 * 上线体 → 明文。口令不对 / 密文被动过 → GCM 校验失败 → 抛。
 * 调用方拿到抛错时应当说「口令不对，或云端存档已损坏」——
 * 这两种情形在密码学上不可区分，硬要区分就是在编故事。
 */
export const decryptPayload = async (key: CryptoKey, wire: string, injected?: SubtleCrypto): Promise<string> => {
  const subtle = resolveSubtle(injected);
  const all = b64ToBytes(wire);
  if (all.length <= IV_BYTES) throw new Error('云端存档格式不对（长度不足）');
  const iv = all.subarray(0, IV_BYTES);
  const ct = all.subarray(IV_BYTES);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(plain);
};

// ---------------------------------------------------------------------------
// 运行环境门槛
// ---------------------------------------------------------------------------

export interface SyncEnv {
  protocol: string;
  hostname: string;
}

/**
 * 这台设备现在能不能跑云同步。
 *
 * crypto.subtle **只在安全上下文里存在** —— 所以这不是一条产品规则，
 * 是浏览器的事实：http://IP 打开时它根本不可用。把事实翻译成一句话给玩家看，
 * 比让他面对一个点了没反应的按钮好。
 */
export const syncAllowed = (env: SyncEnv | null): boolean => {
  if (env === null) return false;
  if (env.protocol === 'https:') return true;
  const h = env.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
};
