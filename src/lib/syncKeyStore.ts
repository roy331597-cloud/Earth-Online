// ============================================================================
// EarthOnline · 派生同步密钥的本地键槽 (syncKeyStore)
//
// 这是**唯一**读写 `earth-online:sync:key` 的模块。它存的是口令派生的产物
// （AES 密钥的原始字节 + Bearer token），不是口令本身 —— **口令从不落盘**。
//
// ---------------------------------------------------------------------------
// 先把话说清楚：这里做的是「混淆」，不是「加密」（与 secretStore 同一句实话）
// ---------------------------------------------------------------------------
// 能读到 LocalStorage 的人，就一定解得出这一格。那为什么还要存？
//
// 因为它回答的是另一个问题：**"开机之后，凭什么能静默推送、不必每次输口令？"**
// 答案是"把派生物留在本机"。留下派生物有没有额外风险？
// 几乎没有 —— 能读到这一格的人，本来就读得到同一台机器上的**明文存档**
// （earth-online:state:v1）。密钥不比它守着的那个东西更值钱。
//
// 而混淆挡住的，恰恰是没有敌意的那种泄露：贴到群里求助时截图的那一屏、
// 顺手分享的 DevTools、录屏。一串 `eo2:...` 至少不是"抄走就能用"。
//
// 真正的保证在三处，比这一层重要得多：
//   ① 口令本身永不落盘、永不上路（上路的只有派生物）；
//   ② 服务器上只有密文，token 只以 sha256 验凭证的形态存在；
//   ③ 清掉这一格 = 这台设备立刻与云断开，口令本身不受影响。
// ============================================================================

import { resolveStorage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/types/state';

/** 当前混淆格式的版本前缀。与 secretStore 的 eo1: 区分开（换算法时靠它认新旧）。 */
const PREFIX = 'eo2:';

/** 固定盐。作用不是保密（它就在源码里），是让"一眼认出来"失效。 */
const SALT = 0x37;

const codepoints = (s: string, fn: (code: number, i: number) => number): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(fn(s.charCodeAt(i), i) & 0xff);
  }
  return out;
};

const scramble = (s: string): string => codepoints(s, (c, i) => c ^ (SALT + (i % 7)));

const canBase64 = (): boolean => typeof btoa === 'function' && typeof atob === 'function';

const encode = (plain: string): string => {
  const body = canBase64() ? btoa(scramble(plain)) : scramble(plain);
  return `${PREFIX}${body}`;
};

/**
 * 解出键对。与 secretStore.decode 同一套三态契约：
 *   - 对象   正常
 *   - null   没存过 / 存储不可用 / 解不开（格式不认识、被手工改过）
 * 解不开时**不抛错**，当成"没配"—— 重新接入一次即可。
 */
const decode = (stored: string): SyncKeyPair | null => {
  if (!stored.startsWith(PREFIX)) return null;
  const body = stored.slice(PREFIX.length);
  try {
    const json = canBase64() ? scramble(atob(body)) : scramble(body);
    const parsed = JSON.parse(json) as { k?: unknown; t?: unknown } | null;
    if (parsed === null || typeof parsed.k !== 'string' || typeof parsed.t !== 'string') return null;
    if (parsed.k.length === 0 || parsed.t.length === 0) return null;
    return { k: parsed.k, t: parsed.t };
  } catch {
    return null;
  }
};

/** 派生出来的两半：AES 密钥原始字节（b64）与 Bearer token（b64url）。 */
export interface SyncKeyPair {
  k: string;
  t: string;
}

const storage = () => resolveStorage();

export const readSyncKey = (): SyncKeyPair | null => {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEYS.syncKey);
    return raw === null ? null : decode(raw);
  } catch {
    return null;
  }
};

export const writeSyncKey = (pair: SyncKeyPair): void => {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEYS.syncKey, encode(JSON.stringify({ k: pair.k, t: pair.t })));
  } catch {
    // 配额满 / 无痕：静默放弃。后果只是"这次会话结束后要重新输一次口令"
  }
};

export const clearSyncKey = (): void => {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEYS.syncKey);
  } catch {
    /* 同上 */
  }
};

/** 有没有可用的键（用于设置面板显示"已接入"而不是"未接入"）。 */
export const hasSyncKey = (): boolean => readSyncKey() !== null;
