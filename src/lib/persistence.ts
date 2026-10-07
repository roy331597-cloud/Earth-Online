// ============================================================================
// EarthOnline · 存档的读写（LocalStorage）
//
// 为什么把它从 store 里拆出来单独成文件：
//
// **读写存档这个动作，是这个产品里唯一一处"数据可能悄悄消失"的地方。**
// 它出错的方式全是安静的 —— JSON 里混进一个 Map 会变成 `{}`、
// schemaVersion 对不上会被静默丢弃、存储配额满了会抛异常。
// 这些都不会让界面报错，只会让玩家某一天发现"我的记录没了"。
//
// 放在 store 里就只能在浏览器里手测。拆出来之后，
// `decodeSave / encodeSave` 是纯函数，verify-ops 可以直接喂字符串给它，
// 于是"存档能不能原样回来"变成一条每次都会跑的断言。
//
// ---------------------------------------------------------------------------
// 一条贯穿全产品的约定：**存档必须是纯 JSON**
// ---------------------------------------------------------------------------
// 不许出现 Date / Map / Set / undefined / 函数 / class 实例。
// 时间一律是 ISO 字符串，集合一律是数组，可空一律是 null（不是 undefined）。
//
// 这条约定没有类型系统兜底 —— `Map` 是合法 TS，`JSON.stringify(map)` 也合法，
// 它只是安静地输出 `{}`。所以它由 `encodeSave → decodeSave` 的往返断言来守。
// ============================================================================

import type { EarthOnlineState, MigrationRegistry } from '@/types';

/** 够用的存储接口。抽成接口是为了在 Node 里也能测（见 verify-ops ⑭）。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 取浏览器存储。
 *
 * 三种"没有存储"的情况都必须安静地降级，而不是报错：
 *   - SSR / 构建期（没有 window）—— 这不是故障，是正常环境；
 *   - 无痕模式的某些配置（有 window，但 getItem 抛异常）；
 *   - 存储被策略禁用。
 * 游戏不该因为存不进去而打不开。
 */
export const resolveStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage;
    // 探一下：某些环境里 localStorage 存在但一碰就抛
    const probe = '__eo_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
};

/** 内存兜底：本次会话能玩，关掉就没了（控制台会留一句说明） */
export const createMemoryStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

export const encodeSave = (save: EarthOnlineState): string => JSON.stringify(save);

export interface DecodeOutcome {
  /** 成功解出的存档；null = 用不了，调用方应当以 mock 启动 */
  save: EarthOnlineState | null;
  /** 给控制台留的痕（不打断玩家）。null = 一切正常 */
  note: string | null;
  /**
   * 是否发生了"转存"。
   * 为真时，**原始字符串必须已被挪到 backup 键** —— 绝不原地丢弃玩家数据。
   */
  diverted: boolean;
}

/**
 * 解一份存档。
 *
 * 四种情形：
 *   - 没有存档 → 静默返回 null（调用方建新档）；
 *   - 解析失败 → 转存 backup 键，以新档启动；
 *   - **版本落后** → 逐级调用 migrations 表水合到当前版本，**原地继续用**（不转存、不丢数据）；
 *     任何一级缺迁移都视为不能升，转为转存 backup —— 宁可停在老版本旁边等修复，
 *     也不把没迁干净的存档塞进新代码（那才是真正的数据消失）。
 *   - 版本超前/不存在 → 转存 backup，以新档启动。
 *
 * 共同点依旧是：**永远不原地丢弃**。
 *
 * `now` 只在跑迁移时用（迁移里可能要按"当时是哪一周"定基准），
 * 不注入时退回 epoch(0) —— 确定性优先：同一份输入 + 同一张表 = 同一个输出。
 */
export const decodeSave = (
  raw: string | null,
  currentVersion: number,
  migrations: MigrationRegistry = {},
  now: Date = new Date(0),
): DecodeOutcome => {
  if (raw === null || raw === '') return { save: null, note: null, diverted: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      save: null,
      note: `存档解析失败（${err instanceof Error ? err.message : String(err)}），已转存到 backup 键`,
      diverted: true,
    };
  }

  const version = (parsed as EarthOnlineState | null)?.meta?.schemaVersion;

  if (version === currentVersion) {
    return { save: parsed as EarthOnlineState, note: null, diverted: false };
  }

  if (typeof version === 'number' && version < currentVersion) {
    let data = parsed as Record<string, unknown>;
    for (let v = version + 1; v <= currentVersion; v++) {
      const step = migrations[v];
      if (!step) {
        return {
          save: null,
          note: `存档 v${version} 缺少 v${v} 的迁移，无法升到 v${currentVersion}，已转存到 backup 键`,
          diverted: true,
        };
      }
      data = step(data, now);
    }
    return {
      save: data as unknown as EarthOnlineState,
      note: `存档已从 v${version} 迁移到 v${currentVersion}（数据保留）`,
      diverted: false,
    };
  }

  return {
    save: null,
    note: `存档 schemaVersion=${String(version)} 与当前 v${currentVersion} 不符，已转存到 backup 键`,
    diverted: true,
  };
};
