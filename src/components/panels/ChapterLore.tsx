import type { ReactNode } from 'react';
import { CHAPTERS, getChapter } from '@/data/catalog/chapters';
import { cn } from '@/lib/cn';
import { chapterProgressOf } from '@/lib/selectors';
import { useSave } from '@/store/useEarthOnlineStore';
import type { ChapterId } from '@/types';

/**
 * 一章的头牌。
 *
 * 为什么单独抽成一个组件：它同时出现在**金库**（"我在哪一章"是理解职业线的
 * 上下文）和**档案馆**（篇章本身是内容）两处。同一个概念在两处各写一遍，
 * 迟早会长出两个版本 —— 而篇章的题记、离章条件这类文字一旦分叉，
 * 是最难发现的那种不一致。
 *
 * 两处的用法差别只有一个：档案馆要展开**离章条件**（那是它这一节的正题），
 * 金库只要标题与题记（它只需要一个位置感）。所以是一个 `showConditions`
 * 而不是两份组件。
 */
export function ChapterCard({
  id,
  showConditions = false,
  children,
}: {
  id: ChapterId;
  /** 是否展开该章的离章条件清单 */
  showConditions?: boolean;
  /** 条件与题记之间的补充内容（金库的支线格就插在这里） */
  children?: ReactNode;
}) {
  const save = useSave();
  const focused = getChapter(id) ?? CHAPTERS[0];
  const progress = chapterProgressOf(save, focused.id);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="flex items-baseline gap-2">
        <span className="numeric text-[10.5px] tracking-[0.16em] text-amber-400/80">
          CHAPTER {focused.index}
        </span>
        <span className="truncate text-[13.5px] font-medium tracking-wide text-white">{focused.title}</span>
      </div>
      <p className="prose-cinematic mt-1.5 text-[11.5px] leading-relaxed text-white/50">{focused.subtitle}</p>

      {/* 离章条件：真实进度。这一章要往哪走，比"你在第几章"有用得多 */}
      {showConditions && progress && progress.conditionProgress.length > 0 && (
        <>
          <div className="mt-3 text-[10px] tracking-[0.16em] text-white/35">离章条件</div>
          <ul className="mt-1.5 space-y-2">
            {progress.conditionProgress.map((c) => (
              <li key={c.label}>
                <div className="flex items-baseline gap-2 text-[10.5px]">
                  <span className={cn('truncate', c.met ? 'text-amber-300/85' : 'text-white/50')}>
                    {c.met ? '✓ ' : ''}
                    {c.label}
                  </span>
                  <span className="numeric ml-auto shrink-0 text-white/40">
                    {c.current} / {c.target}
                  </span>
                </div>
                <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn('h-full rounded-full', c.met ? 'bg-amber-400/80' : 'bg-white/35')}
                    style={{ width: `${Math.min(100, (c.current / Math.max(1, c.target)) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {children}

      <p className="prose-cinematic mt-3 border-l-2 border-amber-400/25 pl-2.5 text-[11px] leading-relaxed text-white/45">
        {focused.epigraph}
      </p>
    </div>
  );
}
