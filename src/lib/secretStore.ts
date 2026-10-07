// ============================================================================
// EarthOnline · Phase 3 · API Key 的本地独立存储区 (secretStore)
//
// 这是**唯一**读写 `earth-online:secret:deepseek` 的模块。
//
// ---------------------------------------------------------------------------
// 先把话说清楚：这里做的是「混淆」，不是「加密」
// ---------------------------------------------------------------------------
// 纯前端没有真正的密钥保管。任何能在浏览器里跑起来的解密函数，
// 玩家（或任何能打开 DevTools 的人）都能照着跑一遍。声称"加密存储"
// 是在骗自己 —— 它挡不住任何有敌意的读者。
//
// 那为什么还要做这一层？因为它挡得住**没有敌意的泄露**：
//
//   · 玩家把一段 LocalStorage 内容贴到群里问"我这个存档怎么坏了"；
//   · 浏览器插件、屏幕共享、录屏时 DevTools 里那一屏；
//   · 通用日志 / 导出文件 / 未来可能加的埋点。
//
// 明文 `sk-xxxx` 在这些场合是**一眼可用的凭证**，换成一串
// `eo1:QmFz...` 之后它至少不再是"抄走就能用"。这就是全部收益，不多也不少。
//
// 真正的防线在另外三处，它们比这一层重要得多：
//   ① 不随存档导出（SaveFile 只带 state，键不在里面）；
//   ② 不出现在任何日志、调用记录、错误信息里（见 ai/bus.ts 的 redact）；
//   ③ UI 上永远只显示掩码（maskApiKey），输入框用完即弃。
// ============================================================================

import { resolveStorage } from '@/lib/persistence';
import type { StorageLike } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/types/state';

/** 当前混淆格式的版本前缀。将来换算法时靠它区分新旧。 */
const PREFIX = 'eo1:';

/** 固定盐。它的作用不是保密（它就在源码里），是让"一眼认出来"失效。 */
const SALT = 0x5a;

const codepoints = (s: string, fn: (code: number, i: number) => number): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(fn(s.charCodeAt(i), i) & 0xff);
  }
  return out;
};

const scramble = (s: string): string => codepoints(s, (c, i) => c ^ (SALT + (i % 7)));

const canBase64 = (): boolean =>
  typeof btoa === 'function' && typeof atob === 'function';

const encode = (plain: string): string => {
  const body = canBase64() ? btoa(scramble(plain)) : scramble(plain);
  return `${PREFIX}${body}`;
};

/**
 * 解出明文。
 *
 * 返回值有三种，调用方必须区分：
 *   - string  正常
 *   - null    没存过 / 存储不可用
 *   - ''      存过但解不开（格式不认识、被手工改过）——
 *             这时**不抛错**，当成"没配"，让玩家重新填一遍即可。
 */
const decode = (stored: string): string | null => {
  if (!stored.startsWith(PREFIX)) return null;
  const body = stored.slice(PREFIX.length);
  try {
    const unscrambled = canBase64() ? scramble(atob(body)) : scramble(body);
    return unscrambled.length > 0 ? unscrambled : null;
  } catch {
    return null;
  }
};

/** 取存储；不可用时返回 null（读写都退化成 no-op，绝不抛错打断应用启动） */
const storage = (): StorageLike | null => resolveStorage();

export const readApiKey = (): string | null => {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEYS.apiKey);
    return raw === null ? null : decode(raw);
  } catch {
    return null;
  }
};

/** 写入。空串等价于清除 —— 别让一个空 key 混进存储里冒充"已配置"。 */
export const writeApiKey = (key: string): void => {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    clearApiKey();
    return;
  }
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEYS.apiKey, encode(trimmed));
  } catch {
    // 配额满 / 无痕模式：安静地放弃。这一条不该让任何一个界面崩掉。
  }
};

export const clearApiKey = (): void => {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEYS.apiKey);
  } catch {
    /* 同上 */
  }
};

export const hasApiKey = (): boolean => {
  const key = readApiKey();
  return key !== null && key.length > 0;
};

/**
 * 掩码。**这是 UI 层唯一允许持有的形态。**
 * `sk-1234567890abcdef` → `sk-1234••••••••cdef`
 * 太短的一律全掩 —— 宁可少显示，也不要把一个短 key 整条露出来。
 */
export const maskApiKey = (key: string | null): string => {
  if (key === null || key.length === 0) return '未配置';
  const head = key.slice(0, 7);
  const tail = key.slice(-4);
  if (key.length <= 14) return `${head}${'•'.repeat(Math.max(4, key.length - 7))}`;
  return `${head}${'•'.repeat(8)}${tail}`;
};

/**
 * 形态校验。**只做形态，不做真伪** —— 真伪只有一次真实请求能回答，
 * 那是「测试连接」的职责。这里拦的是"把别的东西粘进输入框"。
 */
export const isWellFormedApiKey = (key: string): boolean => {
  const t = key.trim();
  if (!t.startsWith('sk-')) return false;
  if (t.length < 20 || t.length > 200) return false;
  // 后半段只允许 base64url 与连字符
  return /^sk-[A-Za-z0-9_-]+$/.test(t);
};

/**
 * 调用日志与错误信息在落盘前的最后一道关口。
 * 任何要写进 `state.agents.invocations` 或抛给 UI 的字符串，
 * 都必须先过这里 —— 万一哪天真身接上、异常信息里带了 Authorization 头。
 */
export const redact = (text: string): string =>
  text.replace(/sk-[A-Za-z0-9_-]{8,}/g, (m) => `${m.slice(0, 7)}••••`);
