import { useEffect, useState } from 'react';

/**
 * 开发期断点标尺。
 *
 * PO 要在 F12 里来回切手机 / PC，光靠肉眼判断"现在是哪一端"很费神。
 * 这个小标尺把当前宽度与落在哪一档直接写出来，**只在 dev 环境渲染**，
 * 生产构建里会被整段摇掉（import.meta.env.DEV 在 build 时是死代码）。
 *
 * 阈值与 Tailwind 对齐：
 *   手机  < 768px   → 底部 Dock + Bottom Sheet
 *   平板  768–1023  → 已进入 PC 布局（左竖栏 + 右侧面板）
 *   桌面  ≥ 1024px  → PC 布局 + 宽屏留白
 */
const DEV = import.meta.env.DEV;

type Band = { name: string; range: string; tone: string };

const bandFor = (w: number): Band => {
  if (w < 768) return { name: '手机', range: '< 768 ', tone: 'bg-abyss-400' };
  if (w < 1024) return { name: '平板', range: '768–1023', tone: 'bg-amber-400' };
  return { name: '桌面', range: '≥ 1024', tone: 'bg-emerald-400' };
};

export function BreakpointBadge() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!DEV) return null;

  const band = bandFor(width);

  return (
    <div className="pointer-events-none absolute bottom-[6.5rem] left-3 z-50 md:bottom-6 md:left-6">
      <div className="glass-pill flex items-center gap-2 px-2.5 py-1.5 text-[10.5px] leading-none text-white/60">
        <span className={`h-1.5 w-1.5 rounded-full ${band.tone}`} />
        <span className="text-white/85">{band.name}</span>
        <span className="text-white/30">|</span>
        <span className="numeric">{width}px</span>
        <span className="text-white/30">|</span>
        <span className="text-white/40">{band.range}</span>
      </div>
    </div>
  );
}
