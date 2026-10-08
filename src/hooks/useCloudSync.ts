import { useEffect } from 'react';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';

/**
 * 云同步的**触发器**。
 *
 * 它只做一件事：在对的时刻问 store 一句"云端动了吗"（`syncCheckOnOpen`）。
 * 问完之后的三种走法全在 store 里 —— 挂提议、补推、或什么都不做；
 * 这个 hook 不裁决任何东西，它只负责**什么时候醒来**：
 *
 *   ① **开机** —— effect 挂载时跑一次。这是手机端的主动脉：一天里
 *      最要紧的那一次检查就是"刚打开应用"。
 *   ② **切回前台** —— 手机后台标签页的定时器会被浏览器节流/冻住，
 *      visibilitychange 是移动端唯一可靠的复苏信号（与 useDailyRollover 同理）。
 *   ③ **网络回来** —— 离线时那次检查会安静地落成"离线"状态；
 *      online 事件让它一恢复就补上，不必等玩家手动点。
 *
 * 依赖是 `enabled` 而不是"永远挂着"：没启用同步的设备不该为它发一次
 * 网络请求 —— 这也是"停用"立刻生效的实现方式（依赖一变，effect 重排）。
 *
 * SSR 安全：`useDailyRollover` 同款 —— 没有 document/window 时只跑挂载那一次
 * 检查，而检查内部有 syncAllowed 门槛兜底（无 window 时直接返回）。
 * 冒烟脚本会真渲染一次 App，这条不能少。
 */
export function useCloudSync(): void {
  const check = useEarthOnlineStore((s) => s.syncCheckOnOpen);
  const enabled = useEarthOnlineStore((s) => s.sync.enabled);

  useEffect(() => {
    if (!enabled) return;
    void check();

    if (typeof document === 'undefined') return; // 构建期 / SSR：只跑上面那一次

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onOnline = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, check]);
}
