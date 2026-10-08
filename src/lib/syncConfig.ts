// ============================================================================
// EarthOnline · 云同步的设备级配置 (syncConfig)
//
// 存四件事：开关、上次同步时间、以及"这台设备见过的云端修订号"。
//
// 为什么**不进存档**：它讲的是"这台设备与云的关系"，不是"这个世界里发生了什么"。
// 拉取时若把它一起带过来，等于让对方的设备替这台设备做同步决策 ——
// 与 `uiPrefs` 同一个阵营：设备级的东西留在设备上。
//
// 纪律与 persistence/secretStore 一致：存储不可用时**静默降级**（读写变 no-op），
// 绝不因为"存不下配置"而让任何一个界面崩掉。读到的坏 JSON 当"没配过"。
// ============================================================================

import { resolveStorage } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/types/state';

export interface SyncConfig {
  /** 是否启用云同步。关闭只是"这台设备不再同步"，云端数据原样保留 */
  enabled: boolean;
  /** 上次成功推送 / 拉取的时间（ISO）。null = 从未 */
  lastSyncAt: string | null;
  /**
   * 本设备**最后一次成功推送 / 拉取时**的云端修订号。null = 从未同步过。
   *
   * ⚠️ 它只在推送 / 拉取**成功之后**才写入 —— 不在"看见"云端新修订时写。
   * 这个区别是整个分叉检测的支点：云端修订与它不一致 = 云端动过，
   * 那就挂横幅让玩家裁；而如果"看见了就把知道的数字更新掉"，这个信号
   * 会在挂横幅的那一刻自己熄灭，下次开机再也没人记得这里分过叉。
   */
  cloudRevision: number | null;
  /** 最后一次成功同步时那份云端存档的 updatedAt（ISO）。展示用 */
  cloudUpdatedAt: string | null;
  /**
   * 本设备最后一次成功同步时，**本机存档**的 meta.updatedAt。
   *
   * 用来回答"本地有没有还没推上去的改动"：与 `save.meta.updatedAt` 不等
   * 就是脏了。它是纯局部的比较（自己和自己比），跨设备不同步也不影响 ——
   * 设备级的配置就该只讲这一台设备的事。
   */
  pushedUpdatedAt: string | null;
}

export const EMPTY_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  lastSyncAt: null,
  cloudRevision: null,
  cloudUpdatedAt: null,
  pushedUpdatedAt: null,
};

export const readSyncConfig = (): SyncConfig => {
  const ls = resolveStorage();
  if (!ls) return EMPTY_SYNC_CONFIG;
  try {
    const raw = ls.getItem(STORAGE_KEYS.sync);
    if (raw === null || raw.length === 0) return EMPTY_SYNC_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SyncConfig> | null;
    if (parsed === null || typeof parsed !== 'object') return EMPTY_SYNC_CONFIG;
    return {
      enabled: parsed.enabled === true,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      cloudRevision: typeof parsed.cloudRevision === 'number' ? parsed.cloudRevision : null,
      cloudUpdatedAt: typeof parsed.cloudUpdatedAt === 'string' ? parsed.cloudUpdatedAt : null,
      pushedUpdatedAt: typeof parsed.pushedUpdatedAt === 'string' ? parsed.pushedUpdatedAt : null,
    };
  } catch {
    // 被手工改坏 / 写到一半断电：当没配过。重新启用一次即可，不需要救它 ——
    // 这一格里没有任何**玩家产生的内容**，丢了重填的成本是几秒。
    return EMPTY_SYNC_CONFIG;
  }
};

export const writeSyncConfig = (cfg: SyncConfig): void => {
  const ls = resolveStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEYS.sync, JSON.stringify(cfg));
  } catch {
    // 配额满：静默放弃（同 secretStore 的纪律）。最坏情况 = 下次启动忘了状态
  }
};

export const clearSyncConfig = (): void => {
  const ls = resolveStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEYS.sync);
  } catch {
    /* 同上 */
  }
};
