// ============================================================================
// EarthOnline · Phase 2 · 展示层格式化
//
// 铁律：账本里永远是整数美分 (UsdCents)，只有"给人看"的这一刻才变成字符串。
// 任何格式化函数都不得参与运算，也不得回写存档。
// ============================================================================

import type { DateKey, ISODateTime, UsdCents } from '@/types';

/**
 * 需求点名的展示格式：`$ 12,500.00`
 * 美元符号与数字之间留一个空格 —— 这是 A9 金库那一行数字的专属气质。
 */
export const formatUsd = (cents: UsdCents): string => {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  const body = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$ ${body}`;
};

/** 不带小数点的紧凑写法，仅用于进度条刻度、图表轴等不需要精确度的位置 */
export const formatUsdShort = (cents: UsdCents): string => {
  const dollars = Math.round(cents / 100);
  if (Math.abs(dollars) >= 100_000_000) return `$${(dollars / 100_000_000).toFixed(1)}亿`;
  if (Math.abs(dollars) >= 10_000) return `$${Math.round(dollars / 1000)}k`;
  return `$${dollars.toLocaleString('en-US')}`;
};

/** 'HH:mm'，24 小时制，两位补零 */
export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * 本地日历日 'YYYY-MM-DD'。
 * ⚠️ 必须用本地时间构造，禁止 `toISOString().slice(0,10)` ——
 *    那会把 UTC+8 的凌晨 07:00 之前全部算成前一天。
 */
export const localDateKey = (date: Date): DateKey =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 'YYYY-MM'，用于现实里程碑的月度 EXP 额度 */
export const localMonthKey = (date: Date): string => localDateKey(date).slice(0, 7);

/** '2026-10-07' → '10 月 7 日'（轻量，不依赖 Intl 的语言包） */
export const formatDateKeyCN = (key: DateKey): string => {
  const [, m, d] = key.split('-');
  if (!m || !d) return key;
  return `${Number(m)} 月 ${Number(d)} 日`;
};

/** 把 ISO 时间戳转成本地时钟文本，失败时返回占位符而不是抛错 */
export const formatIsoClock = (iso: ISODateTime): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--:--' : formatClock(d);
};

/** 两个时间点之间的天数（向下取整），用于"多久没联系了" */
export const daysBetween = (fromIso: ISODateTime, now: Date): number => {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
};

// ---------------------------------------------------------------------------
// 日历日的加减（跨天结算与"归属日"判定用）
//
// 为什么单独放一组：**本地日历日不是固定 86400 秒**。
// 夏令时的那一天有 23 或 25 小时，用时间戳加减会算错"昨天是哪天"。
// `new Date(y, m-1, d + delta)` 让运行时的日历自己去处理跨月、跨年、闰年。
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' 前后挪几天。跨月跨年由 Date 自己处理。 */
export const shiftDayKey = (key: DateKey, delta: number): DateKey => {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + delta));
};

/**
 * **归属日**：此刻算作哪一天。
 *
 * 切换时刻是 `settings.dayRolloverHour`（默认次日 01:00）：
 * 00:30 打的那一钩属于昨天 —— 凌晨的人不该被判成"今天还没开始"。
 * 0 点结算太苛刻（收尾的人会被误判），4 点等于默许熬夜到凌晨三点。
 */
export const activeDayKey = (now: Date, rolloverHour: number): DateKey =>
  now.getHours() < rolloverHour ? shiftDayKey(localDateKey(now), -1) : localDateKey(now);

/** 某一天的结束时刻（本地 23:59:59.999）。用于判断"某样东西在那天是否已经存在" */
export const endOfDay = (key: DateKey): Date => new Date(`${key}T23:59:59.999`);

// ---------------------------------------------------------------------------
// 周（每周规程用）
//
// 一周以**周一**为锚：周一到周日。「周日属于上一个周一」不是随手定的 ——
// 它让"上周"这个词在中文语境里落在大家都认的那七天
// （周一上班时说的"上周"，指的是刚过去的那一周，而不是含明天的那一周）。
// 和日一样，周键也是 'YYYY-MM-DD' 字符串，字面序即时间序。
// ---------------------------------------------------------------------------

/**
 * 某一天所在周的周一：'2026-10-07'(三) → '2026-10-05'；'2026-10-11'(日) → '2026-10-05'。
 * 返回值本身就是那一天的 DateKey，所以"周"的一切判定都能直接和日期比较。
 */
export const weekStartKey = (key: DateKey): DateKey => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  // getDay(): 0 = 周日。把它折成"距离本周一已经过了几天"：周一 0，周日 6。
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return shiftDayKey(key, -daysSinceMonday);
};

/** 周键（必须传周一）前后挪几周 */
export const shiftWeekKey = (mondayKey: DateKey, deltaWeeks: number): DateKey =>
  shiftDayKey(mondayKey, deltaWeeks * 7);

/**
 * 字节数的人话写法（`218 KB` / `1.4 MB`）。
 *
 * 只在**告诉玩家"这东西占了多少地方"**时用 —— 照片进存档是这个应用里
 * 唯一一处玩家会真的撞上存储上限的地方，那里需要一个能读懂的数字。
 */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
