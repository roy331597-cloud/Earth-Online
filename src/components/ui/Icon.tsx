import type { ReactNode } from 'react';
import type { IconKey } from '@/lib/panels';
import type { TimeOfDay } from '@/types';

/**
 * 极简线性图标。
 * 刻意不引第三方图标库：整套 UI 的图标总数不到十个，
 * 引一个库省下的代码量远小于它带来的体积与风格不一致。
 * 统一 24×24 视窗、1.5 描边、currentColor —— 颜色交给外层文字色决定。
 */
interface IconProps {
  name: IconKey;
  className?: string;
}

const PATHS: Record<IconKey, ReactNode> = {
  // 公告栏：钉在墙上的板子，两条待办
  board: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 9h8M8 13h5" />
      <path d="M9 3.5V6h6V3.5" />
    </>
  ),
  // 任务灯：灯泡 + 光晕
  lamp: (
    <>
      <path d="M9.5 17h5M10.5 20h3" />
      <path d="M12 3a5.5 5.5 0 0 0-3.2 9.98c.5.36.7.94.7 1.52h5c0-.58.2-1.16.7-1.52A5.5 5.5 0 0 0 12 3Z" />
    </>
  ),
  // 成功日记：摊开的书
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
      <path d="M12 4v16" />
    </>
  ),
  // 档案馆：归档盒
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
  // 金库：三枚叠起来的硬币
  vault: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
      <path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
    </>
  ),
  // 陈列馆：一枚挂着缎带的徽记。
  // 圆牌里那个环与 hex / gear 的内环同一个做法 —— 三笔画之内交代完"这是个牌"，
  // 再多加一颗星或一圈齿，20px 下就只剩一团灰。
  medal: (
    <>
      <path d="M7.5 3.5 12 10.4l4.5-6.9" />
      <circle cx="12" cy="15.4" r="5.1" />
      <circle cx="12" cy="15.4" r="2" />
    </>
  ),
  // 圣殿：地平线上的一颗星。
  // 用四角星而不是五角星：五条外角在这个尺寸、这个描边下会糊成一朵花，
  // 四角是最省笔画又一眼是"星"的形状 —— 它长在「天边」（anchor_horizon）。
  star: (
    <>
      <path d="M12 5.5c.6 2.9 2.1 4.4 5 5-2.9.6-4.4 2.1-5 5-.6-2.9-2.1-4.4-5-5 2.9-.6 4.4-2.1 5-5Z" />
      <path d="M4 20h16" />
    </>
  ),
  // 关系：一个人
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.13-5.5 7-5.5s7 1.9 7 5.5" />
    </>
  ),
  // 属性：六边形（六维），中心一个点 —— "里面这个人"
  hex: (
    <>
      <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6Z" />
      <circle cx="12" cy="12" r="1.8" />
    </>
  ),
  // 设置（控制室）：八齿齿轮。
  // 齿是**八条短辐条**，不是描出来的齿廓 —— 后者在 20px 下会糊成一圈毛边，
  // 而这一整套图标的笔画都只有 1.5。
  gear: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3.4v2.1M12 18.5v2.1M3.4 12h2.1M18.5 12h2.1M7.3 7.3l-1.5-1.5M16.7 16.7l1.5 1.5M16.7 7.3l1.5-1.5M7.3 16.7l-1.5 1.5" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * 时段图标：给 HUD 用的小太阳/月亮。
 * 与 PanelKey 的图标分开 —— 这一组只出现在一个地方，且要能一眼分辨时段。
 */
export function TimeOfDayGlyph({
  timeOfDay,
  className = 'h-4 w-4',
}: {
  timeOfDay: TimeOfDay;
  className?: string;
}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (timeOfDay) {
    case 'dawn':
    case 'morning':
    case 'afternoon':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </svg>
      );
    case 'dusk':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="4" />
          <path d="M3 20h18M12 4v3M4.9 7.9l1.4 1.4M19.1 7.9l-1.4 1.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      );
  }
}
