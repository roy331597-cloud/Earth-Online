import { cn } from '@/lib/cn';
import type { AchievementMark, AchievementTier } from '@/types';

/**
 * 徽记的那枚牌子。
 *
 * 抽出来是因为它有两个消费方，而且**尺寸不同**：陈列馆里的墙（28px 一排）
 * 与解锁时的金色光晕（44px 一枚，一次只看一两枚）。两处各画一遍的话，
 * 第一次调档位颜色就会只调到其中一处 —— 然后同一枚徽记在墙上与在光晕里
 * 是两种铜色，而没有任何地方会报错。
 *
 * 形态是四态的：
 *   已解锁 · 实线环 + 实心点          未解锁 · 同一材质，虚线 + 压暗
 *   暗条(veil/halo) · 虚线白环 + 记号   没有记号也没有名字的那种 · 一个空环
 *
 * ⚠️ 颜色纪律：四档的差别是**材质**的差别，不是亮度的差别；色相只用
 *    ink / 白 / 琥珀 / 深渊蓝。光晕（shadow-glow-gold）只给至高白金 ——
 *    它是这套视觉里最贵的资源，用多了就不值钱。
 */
export const TIER_RING: Record<AchievementTier, string> = {
  BRONZE: 'border-amber-700/60 text-amber-500/70',
  SILVER: 'border-white/25 text-white/55',
  GOLD: 'border-amber-400/55 text-amber-300',
  ASCENDANT: 'border-amber-200/70 text-amber-100 shadow-glow-gold',
};

/** 同一材质压成一行字用的版本：文字不该比圈还抢眼 */
export const TIER_TEXT: Record<AchievementTier, string> = {
  BRONZE: 'text-amber-600/60',
  SILVER: 'text-white/35',
  GOLD: 'text-amber-400/65',
  ASCENDANT: 'text-amber-200/75',
};

interface AchievementSigilProps {
  tier: AchievementTier;
  unlocked: boolean;
  /** 锁着的暗条：连名字都还没给的那种（维度 F）。给它记号，不给点 */
  hidden?: boolean;
  mark?: AchievementMark | null;
  /** 尺寸与边距走这里。默认是陈列馆墙上那一排的尺寸 */
  className?: string;
  glyphClassName?: string;
}

export function AchievementSigil({
  tier,
  unlocked,
  hidden = false,
  mark = null,
  className = 'h-7 w-7',
  glyphClassName = 'h-3.5 w-3.5',
}: AchievementSigilProps) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full border transition-all duration-300',
        className,
        hidden
          ? 'border-dashed border-white/15 text-abyss-300/50'
          : unlocked
            ? TIER_RING[tier]
            : // 锁着的明条：同一种材质，但虚线 + 压暗 —— 它是"还没轮到"，不是"没有"
              cn(TIER_RING[tier], 'border-dashed opacity-45'),
      )}
    >
      {hidden ? (
        <MarkGlyph mark={mark} className={glyphClassName} />
      ) : unlocked ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : null}
    </span>
  );
}

/**
 * 维度 F 的两种记号（veil 隐匿 / halo 光源）。
 *
 * 画法跟着 Icon.tsx 的规矩走：24 视窗、1.5 描边、currentColor。
 * 它们**不进 `IconKey`** —— 那不是导航图标，只有这一处会用到，
 * 而且它们说的是"这件事以什么姿态出现"，不是"点它能去哪"。
 */
export function MarkGlyph({ mark, className = 'h-3.5 w-3.5' }: { mark: AchievementMark | null; className?: string }) {
  if (mark === null) return null;

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

  return mark === 'veil' ? (
    // 隐匿：一个虚线画出的圆，中间一个还没长开的小点
    <svg {...common}>
      <circle cx="12" cy="12" r="4.6" strokeDasharray="2 3" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    // 光源：一个环，八道短光
    <svg {...common}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M18.6 5.4l-1.5 1.5M6.9 17.1l-1.5 1.5" />
    </svg>
  );
}
