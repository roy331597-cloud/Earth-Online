import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { desktopRailPanels, mobileDockPanels } from '@/lib/panels';
import type { PanelKey } from '@/lib/panels';

interface NavProps {
  activePanel: PanelKey | null;
  onSelect: (key: PanelKey) => void;
  /** 面板角标：比如悬赏上挂着"待领取 2"。数字为 0 时自动不显示 */
  badges?: Partial<Record<PanelKey, number>>;
}

/** 取角标数字。名字刻意不带 use 前缀 —— 它不是 hook，只是一个查表 */
const badgeOf = (badges: NavProps['badges'], key: PanelKey): number => badges?.[key] ?? 0;

// ---------------------------------------------------------------------------
// 手机端：底部毛玻璃 Dock
//
// 单手可达是唯一的硬指标 —— 所以它贴底、居中、六项平分宽度
// （Phase 5 加了「成就」：「关系」与「属性」仍旧不进 Dock，
// 它们走场景锚点 —— 见 lib/panels.ts 里那段取舍）。
// 每一项的点击热区高度不低于 44px（拇指的物理下限）；
// 375px 宽的机器上六项各得 ~53px，离这个下限还有余量。
// 点击开的是 Bottom Sheet：从下往上推，与 Dock 同一套手感。
// ---------------------------------------------------------------------------

export function MobileDock({ activePanel, onSelect, badges }: NavProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="px-3 pb-3">
        <nav className="glass-deep pointer-events-auto flex items-stretch gap-1 p-1.5" aria-label="主功能">
          {mobileDockPanels.map((panel) => {
            const badge = badgeOf(badges, panel.key);
            const active = activePanel === panel.key;
            return (
              <button
                key={panel.key}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(panel.key)}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 rounded-lg px-1 pb-1.5 pt-2',
                  'text-[10.5px] leading-none transition-all duration-300 ease-cinematic',
                  active
                    ? 'glass-active'
                    : 'text-white/65 hover:text-white active:scale-[0.94]',
                )}
              >
                <Icon name={panel.iconKey} className="h-[1.35rem] w-[1.35rem]" />
                <span>{panel.label}</span>
                {badge > 0 && (
                  <span className="numeric absolute right-1 top-1 min-w-[1.05rem] rounded-full bg-amber-400/90 px-1 text-[9px] font-semibold leading-[1.05rem] text-ink-950">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PC 端：左侧竖栏
//
// 为什么不是底部 Dock：宽屏的底部是"视线之外"，而左侧竖栏在视线自然落点上，
// 且点击后从右侧滑出面板 —— 手与眼的移动距离被压到最短，
// 中间那片背景（场景）自始至终不被遮住。
//
// 「关系」只在 PC 端出现：手机端它是场景里那个抬头的 NPC（见 lib/panels.ts）。
// ---------------------------------------------------------------------------

export function DesktopRail({ activePanel, onSelect, badges }: NavProps) {
  return (
    <nav
      className="glass-deep pointer-events-auto absolute left-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 p-1.5 md:flex"
      aria-label="主功能"
    >
      {desktopRailPanels.map((panel) => {
        const badge = badgeOf(badges, panel.key);
        const active = activePanel === panel.key;
        return (
          <button
            key={panel.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(panel.key)}
            className={cn(
              'group relative flex w-[8.75rem] items-center gap-2.5 rounded-lg px-3 py-2.5',
              'text-left text-[12.5px] transition-all duration-300 ease-cinematic',
              active
                ? 'glass-active'
                : 'text-white/65 hover:translate-x-0.5 hover:bg-white/5 hover:text-white',
            )}
          >
            <Icon name={panel.iconKey} className="h-[1.15rem] w-[1.15rem] shrink-0" />
            <span className="flex-1 truncate">{panel.label}</span>
            {badge > 0 && (
              <span className="numeric rounded-full bg-amber-400/90 px-1.5 text-[10px] font-semibold leading-[1.15rem] text-ink-950">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
