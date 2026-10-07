import { getChapter } from '@/data/catalog/chapters';
import { useSave } from '@/store/useEarthOnlineStore';
import type { ChapterId } from '@/types';

interface ChapterPlateProps {
  chapterId: ChapterId;
}

/**
 * 左上角的"篇章铭牌"。
 *
 * AVG 里，玩家需要随时知道"我现在在哪一幕"。
 * 手机端只留一行章名（屏幕寸土寸金）；PC 端多给一句题记 ——
 * 那句题记的作用不是信息，是**语气**：它决定了接下来读任务文案时的心情。
 *
 * Phase 3 加了一行：**玩家自己给这一章起的名字**。
 *
 * 它挂在章名下面，字号比章名小、颜色是暗金的 —— 位置本身就是它的含义：
 * 官方给的那句是标题，你自己写的那句是**注脚**。两者同时在场，
 * 而你的那句在下面托着它。这就是"命名权"这个东西在界面上的样子。
 */
export function ChapterPlate({ chapterId }: ChapterPlateProps) {
  const save = useSave();
  const chapter = getChapter(chapterId);
  if (!chapter) return null;

  const progress = save.chapters.chapters.find((c) => c.id === chapterId);
  const codename = progress?.playerChosenCodename ?? null;

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-30 max-w-[62vw] md:left-6 md:top-6 md:max-w-[24rem]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="glass-pill glass-hover pointer-events-auto inline-block px-3 py-2">
        <div className="flex items-baseline gap-1.5 text-[11px] tracking-wide text-white/55">
          <span className="text-amber-400/70">{ORDINALS[chapter.index] ?? `第 ${chapter.index} 章`}</span>
          <span className="prose-cinematic text-[13px] text-white">{chapter.title}</span>
        </div>

        {/* 你自己写的那个名字。它不会随章节结束而消失 —— 通关之后这块仍挂着 */}
        {codename !== null && (
          <div className="mt-1 flex items-baseline gap-1 text-[11px]">
            <span className="text-amber-400/45">「</span>
            <span className="prose-cinematic numeric tracking-[0.1em] text-amber-200/80">{codename}</span>
            <span className="text-amber-400/45">」</span>
          </div>
        )}

        {/* 题记只在宽屏出现 —— 它是氛围，不是信息，手机端没有余量给它 */}
        <p className="prose-cinematic mt-1.5 hidden text-[11.5px] text-white/45 md:block">
          {chapter.epigraph}
        </p>
      </div>
    </div>
  );
}

const ORDINALS = [
  '第零章',
  '第一章',
  '第二章',
  '第三章',
  '第四章',
  '第五章',
  '第六章',
  '第七章',
  '第八章',
  '第九章',
];
