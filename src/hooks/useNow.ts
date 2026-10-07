import { useEffect, useState } from 'react';

/**
 * 会自己走的时钟。
 *
 * 为什么不用 requestAnimationFrame 或 1s：
 *   HUD 只显示到分钟，30 秒一跳足够；1 秒一跳会让整个场景每秒重渲染一次，
 *   在手机上直接把毛玻璃背景模糊 (backdrop-blur) 拖卡。
 *
 * 附带处理：手机切回前台时立刻校准（后台标签页的定时器会被浏览器节流）。
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}
