import { useEffect } from 'react';
import { activeDayKey } from '@/lib/format';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';

/**
 * 跨天结算的**触发器**。
 *
 * 触发条件是「日期翻页」，不是「时钟走动」 —— 所以这个 hook 的依赖是
 * `activeDay`（今天是哪一天，且已按 01:00 的切换时刻折算过），不是 `now`。
 * 直接依赖 `now` 会让它每 30 秒跑一遍全量日常的扫描：不写盘、不出错，
 * 但也没必要。
 *
 * 三个时机一并覆盖了：
 *   ① **启动时** —— effect 在挂载时就会跑一次（`useNow` 给的初始值是此刻）；
 *   ② **跨天时** —— `activeDay` 变了自己会再跑；
 *   ③ **切回前台时** —— `useNow` 本来就在 `visibilitychange` 上校准时钟，
 *      它一跳，这里的 `activeDay` 就可能跟着变。手机后台标签页的定时器
 *      会被浏览器节流，所以这一条不是锦上添花，是手机端唯一的可靠路径。
 *
 * 注意 effect 里刻意用了当时的 `now` 而不是依赖它：只要日期没变，
 * 早 20 秒还是晚 20 秒问这一次，答案完全一样。
 */
export function useDailyRollover(now: Date): void {
  const rollover = useEarthOnlineStore((s) => s.rollover);
  const rolloverHour = useEarthOnlineStore((s) => s.save.settings.dayRolloverHour);
  const activeDay = activeDayKey(now, rolloverHour);

  useEffect(() => {
    rollover(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上：触发条件是日期，不是时间
  }, [activeDay, rolloverHour, rollover]);
}
