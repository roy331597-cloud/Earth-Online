import { PanelShell } from '@/components/panels/PanelShell';
import { getChapter } from '@/data/catalog/chapters';
import { getClass } from '@/data/catalog/classes';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, formatIsoClock } from '@/lib/format';
import type { PanelKey } from '@/lib/panels';
import { useSave } from '@/store/useEarthOnlineStore';
import type { JournalEntry, JournalState, ReflectionQuality } from '@/types';

interface JournalPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 成功日记查看器。
 *
 * 它是结算面板的**归宿**：那边写完的那段话，最终要在这里被重新读到。
 * 所以这一页的排版只有一个任务 —— 让文字本身好看，其余元素都得让开。
 *
 * 三条刻意的取舍：
 *   ① **不做摘要、不做标签云**。日记的价值在于"当时具体写了什么"，
 *      任何二次概括都是在替玩家回忆，而不是让他回忆。
 *   ② 自己的话排在点评**上面**。Arbiter 是旁注，不是正文。
 *   ③ 倒序，且不分组、不折叠 —— 每写一条就往上长一条，
 *      这个列表本身就是"我写了多少"最直观的证据。
 */
export function JournalPanel({ panel, onClose }: JournalPanelProps) {
  const save = useSave();
  // 存档里本来就是最新在前（completeQuest 用 unshift 语义），
  // 这里再排一次是为了防住"旧存档 / 手工导入"这类路径 —— 顺序是展示层的责任
  const entries = [...save.journal.entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const subheader = (
    <>
      <JournalMasthead />
      <StatsBar stats={save.journal.stats} />
    </>
  );

  if (entries.length === 0) {
    return (
      <PanelShell panel={panel} onClose={onClose} subheader={subheader}>
        <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4">
          <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">
            还没有条目。结算任务时写点什么，它就会出现在这里 ——
            哪怕只是一句「今天卡在哪儿了」。
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell panel={panel} onClose={onClose} subheader={subheader}>
      <div className="space-y-3 pt-3.5">
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 页眉
// ---------------------------------------------------------------------------

/**
 * 日记页眉上那一行。
 *
 * 它是"命名权"这件事的第二个落点（第一个是 HUD 的铭牌）：
 * 一个名字被刻在页眉上，意味着**这一沓纸是同一个人的**。
 * 所以它画的是一条书上的running head —— 中间一个词，两边各一道细线，
 * 像一本真的册子，而不是一张带标题的列表。
 *
 * 没起过名字时它什么都不渲染。空白也是一种状态，不必用占位文案填满。
 */
function JournalMasthead() {
  const save = useSave();
  const focused = save.chapters.focusedChapterId;
  const progress = save.chapters.chapters.find((c) => c.id === focused);
  const codename = progress?.playerChosenCodename ?? null;
  if (codename === null) return null;

  const chapter = getChapter(focused);

  return (
    <div className="mt-3 flex items-center gap-2.5">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-400/25" />
      <span className="prose-cinematic numeric shrink-0 text-[11px] tracking-[0.16em] text-amber-200/75">
        {codename}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-400/25" />
      {chapter && (
        <span className="shrink-0 text-[9.5px] tracking-wide text-white/25">{chapter.title}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 累计统计
// ---------------------------------------------------------------------------

function StatsBar({ stats }: { stats: JournalState['stats'] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-ink-950/40 p-2.5">
      <Stat label="条目" value={String(stats.totalEntries)} />
      <Stat label="平均加成" value={`${stats.averageBonusPct}%`} gold />
      <Stat label="连续写作" value={`${stats.currentWritingStreakDays} 天`} />
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="text-center">
      <div className={cn('numeric text-[15px] font-semibold leading-none', gold ? 'text-amber-400' : 'text-white/85')}>
        {value}
      </div>
      <div className="mt-1 text-[10px] tracking-wider text-white/35">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 卡片
// ---------------------------------------------------------------------------

/** 档位徽标。基调用蓝、高调给金 —— 不用红色，这里没有"差"这一档，只有"还没到" */
const QUALITY_META: Record<ReflectionQuality, { label: string; tone: 'calm' | 'gold' }> = {
  baseline: { label: '未过线', tone: 'calm' },
  solid: { label: '站得住', tone: 'calm' },
  sharp: { label: '有洞见', tone: 'gold' },
  revelatory: { label: '重构', tone: 'gold' },
};

function EntryCard({ entry }: { entry: JournalEntry }) {
  const verdict = entry.verdict;
  const quality = verdict ? QUALITY_META[verdict.quality] : null;
  const label = entry.classId ? getClass(entry.classId)?.agentDisplayName.split('·')[0]?.trim() : null;

  return (
    <article className="glass-hover rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      {/* 头：任务名 + 时间 */}
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 truncate text-[13px] font-medium tracking-wide text-white/90">
          {entry.questTitle}
        </h3>
        <span className="ml-auto shrink-0 text-[10.5px] text-white/35">
          <span className="numeric">{formatIsoClock(entry.createdAt)}</span>
          <span className="ml-1.5">{formatDateKeyCN(entry.localDate)}</span>
        </span>
      </div>

      {/* 徽标行：职业线 + 档位 + 加成 */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {label && (
          <span className="rounded-md border border-abyss-500/30 bg-abyss-500/15 px-1.5 py-0.5 text-[10px] leading-[1.4] text-abyss-300">
            {label}
          </span>
        )}
        {quality ? (
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[10px] leading-[1.4]',
              quality.tone === 'gold'
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                : 'border-abyss-400/30 bg-abyss-500/10 text-abyss-300/90',
            )}
          >
            {quality.label}
          </span>
        ) : (
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] leading-[1.4] text-white/35">
            无判定
          </span>
        )}
        {verdict && verdict.bonusPct > 0 && (
          <span className="numeric-gold text-[12px] font-semibold">+{verdict.bonusPct}%</span>
        )}
      </div>

      {/* 正文 —— 这一页的主角，行距给足 */}
      <p className="prose-cinematic mt-2.5 whitespace-pre-wrap text-[12.5px] leading-[1.75] text-white/80">
        {entry.entryText}
      </p>

      {/* 点评：旁注的语气，靠左边线站开 */}
      {verdict?.comment && (
        <div className="mt-3 border-l-2 border-abyss-500/60 pl-2.5">
          <p className="prose-cinematic text-[11.5px] leading-relaxed text-white/60">{verdict.comment}</p>
        </div>
      )}

      {entry.arbiterFailed && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-white/30">
          这次没有拿到判定，奖励按基础发放。文字已经存下来了。
        </p>
      )}

      {/* 情绪底色：只有一个词时也显示 —— 它是当时的状态，不是标签云 */}
      {entry.emotions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {entry.emotions.map((e) => (
            <span key={e} className="text-[10px] text-white/30">
              #{EMOTION_LABEL[e] ?? e}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

const EMOTION_LABEL: Record<string, string> = {
  calm: '平静',
  driven: '想往前',
  doubtful: '存疑',
  proud: '痛快',
  tired: '疲惫',
  curious: '好奇',
  anxious: '焦虑',
  grateful: '感谢',
  lonely: '独处',
  clear: '想清楚了',
};
