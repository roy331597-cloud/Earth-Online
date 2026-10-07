import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getPanel } from '@/lib/panels';
import type { PanelKey } from '@/lib/panels';

interface PanelShellProps {
  panel: PanelKey;
  onClose: () => void;
  /**
   * 标题下方的常驻区域（如标签页切换条）。
   * 它**不随内容滚动** —— 切标签这件事不该需要先把内容滚回顶部。
   */
  subheader?: ReactNode;
  children: ReactNode;
}

/**
 * 面板外壳：手机端 Bottom Sheet / PC 端右侧竖长面板。
 *
 * 从 PanelPlaceholder 里抽出来，是因为"面板该长在哪、怎么进出"
 * 只应该有一份实现。每个新面板各自写一遍 safe-area 与定位，
 * 迟早会出现"有一个面板在 iPhone 上被 Dock 挡住"这种事。
 *
 * 两端的共同约定：
 *   手机：遮罩只盖到 Dock 上方，Dock 保持可见可用（一次点击换面板）
 *   PC  ：面板贴右边栏，**不遮挡场景中央** —— 背景自始至终在呼吸
 */
export function PanelShell({ panel, onClose, subheader, children }: PanelShellProps) {
  const meta = getPanel(panel);

  return (
    <>
      {/* ================= 手机端：Bottom Sheet ================= */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="关闭面板"
          onClick={onClose}
          className="absolute inset-x-0 top-0 z-30 animate-fade-in bg-ink-950/40"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
        />
        <div
          className="absolute inset-x-0 z-40 animate-sheet-up"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
        >
          {/* 固定的头（含标签条）+ 独立滚动的正文：与 PC 端结构一致 */}
          <div className="glass-deep mx-3 flex max-h-[64vh] flex-col overflow-hidden rounded-2xl">
            <div className="shrink-0 p-4 pb-3">
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
              <header className="flex items-center gap-2">
                <Icon name={meta.iconKey} className="h-[1.1rem] w-[1.1rem] text-amber-400/80" />
                <h2 className="truncate text-[15px] font-medium tracking-wide text-white">
                  {meta.title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="关闭面板"
                  className="ml-auto shrink-0 px-2 py-1 text-white/40 transition hover:text-white"
                >
                  ✕
                </button>
              </header>
              <p className="prose-cinematic mt-1.5 text-[12.5px] text-white/55">{meta.tagline}</p>
              {subheader}
            </div>
            <div className="h-px shrink-0 bg-white/10" />
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">{children}</div>
          </div>
        </div>
      </div>

      {/* ================= PC 端：右侧滑出面板 ================= */}
      <aside className="absolute bottom-6 right-6 top-24 z-40 hidden w-[22rem] animate-panel-in md:block">
        <div className="glass-deep flex h-full flex-col overflow-hidden">
          <div className="shrink-0 p-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <header className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon name={meta.iconKey} className="h-[1.1rem] w-[1.1rem] text-amber-400/80" />
                  <h2 className="truncate text-[15px] font-medium tracking-wide text-white">
                    {meta.title}
                  </h2>
                </div>
                <p className="prose-cinematic mt-1.5 text-[12.5px] text-white/55">{meta.tagline}</p>
              </header>
              <button
                type="button"
                onClick={onClose}
                className="glass-pill shrink-0 px-2 py-1 text-[10.5px] tracking-wider text-white/55 transition hover:text-white"
              >
                ESC
              </button>
            </div>
            {subheader}
          </div>
          <div className="h-px shrink-0 bg-white/10" />
          <div className="flex-1 overflow-y-auto p-5 no-scrollbar">{children}</div>
        </div>
      </aside>
    </>
  );
}
