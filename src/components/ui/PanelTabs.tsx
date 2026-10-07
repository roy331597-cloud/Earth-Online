import { cn } from '@/lib/cn';

export interface PanelTab {
  key: string;
  label: string;
  /** 待处理数量。为 0 或省略时不显示角标 */
  badge?: number;
}

interface PanelTabsProps {
  tabs: PanelTab[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * 面板内的标签条。
 *
 * 从 QuestPanel 里抽出来共用（那个面板后来拆掉了）：如今悬赏大厅与日常面板
 * 用的是同一种标签，两份实现迟早会在"激活态的金色到底多亮"这件事上分叉。
 *
 * 关于角标：它显示的是**还要你动手的数量**（待打钩、待审核、待接），
 * 不是"这里一共有多少条"。前者是催办，后者是噪音 ——
 * 一个永远挂着数字的标签，很快就没人看它了。
 */
export function PanelTabs({ tabs, active, onChange }: PanelTabsProps) {
  return (
    <div className="mt-3 flex gap-1 rounded-xl border border-white/10 bg-ink-950/40 p-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] transition-all duration-300 ease-cinematic',
              on
                ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200 shadow-glow-gold'
                : 'border border-transparent text-white/55 hover:text-white',
            )}
          >
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge > 0 && (
              <span
                className={cn(
                  'numeric rounded-full px-1.5 text-[10px] leading-[1.3]',
                  on ? 'bg-amber-400/25 text-amber-100' : 'bg-white/10 text-white/60',
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
