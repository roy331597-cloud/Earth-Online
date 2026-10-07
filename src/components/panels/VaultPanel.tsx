import type { ReactNode } from 'react';
import { ChapterCard } from '@/components/panels/ChapterLore';
import { PanelShell } from '@/components/panels/PanelShell';
import { CLASSES, classLabelOf } from '@/data/catalog/classes';
import { CHAPTERS, CHAPTER_BRANCH_LABELS, getChapter } from '@/data/catalog/chapters';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, formatUsd } from '@/lib/format';
import type { PanelKey } from '@/lib/panels';
import {
  a9Progress,
  expRatio,
  netWorthUsdCents,
  recentTransactions,
  runwayMonths,
  trackTitle,
  wealthMagnitude,
} from '@/lib/selectors';
import { useSave } from '@/store/useEarthOnlineStore';
import type { CareerTrack, ChapterBranch, ChapterId, UsdCents, VaultTransaction } from '@/types';

interface VaultPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 金库与职业履历。
 *
 * 上下两半，共用同一个滚动条 —— 不是两个标签页。理由是它们回答的是同一个问题：
 * **「我这段时间到底攒下了什么。」** 上面是钱，下面是能力，
 * 分开看会让人只盯着其中一半优化。
 *
 * 这一页有一条不能破的规矩：**金色只给一个数字**（净资产）。
 * 职业等级、EXP、流水金额一律走白与蓝灰。金色在这个产品里的语义是"目标"，
 * 一页里出现两次，它就不再是目标了，只是配色。
 */
export function VaultPanel({ panel, onClose }: VaultPanelProps) {
  const save = useSave();
  return (
    <PanelShell panel={panel} onClose={onClose}>
      <VaultSection />
      <div className="my-5 h-px bg-white/10" />
      <PortfolioSection />
      <div className="my-5 h-px bg-white/10" />
      <ChapterLocator activeChapterIds={save.chapters.activeChapterIds} />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 上半 · A9 金库
// ---------------------------------------------------------------------------

function VaultSection() {
  const save = useSave();
  const netWorth = netWorthUsdCents(save.vault);
  const a9 = a9Progress(save);
  const magnitude = wealthMagnitude(netWorth);
  const runway = runwayMonths(save.vault);
  const flows = recentTransactions(save.vault, 8);
  const hidden = save.vault.transactions.length - flows.length;

  return (
    <section className="pt-3.5">
      <SectionLabel>A9 瑞士银行 · 净资产</SectionLabel>

      {/* 唯一的金色数字。呼吸微光用已有的 breathe 关键帧，不新增动画 */}
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="numeric-gold animate-breathe text-[30px] font-semibold leading-none tracking-tight shadow-glow-gold-lg">
          {formatUsd(netWorth)}
        </span>
        <span className="text-[11px] text-white/35">USD</span>
      </div>

      {/* A9 对数进度：终点 $100M。线性画法下这里永远是 0%，所以只能这么画 */}
      <div className="mt-3.5">
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-200 transition-[width] duration-700 ease-cinematic"
            style={{ width: `${Math.max(0.8, a9 * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-white/40">
          <span>建角刻度 $ 1,100</span>
          <span className="numeric text-amber-400/80">A9 {(a9 * 100).toFixed(1)}%</span>
          <span>$ 100M</span>
        </div>
      </div>

      {/* 数量级阶梯 —— 补的正是"翻十倍却看不出变化"那一段反馈 */}
      <DecadeLadder magnitude={magnitude} netWorth={netWorth} />

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-ink-950/40 p-2.5">
        <MiniStat label="现金" value={formatUsd(save.vault.cash)} />
        <MiniStat label="持仓市值" value={formatUsd(save.vault.holdings.reduce((s, h) => s + h.marketValue, 0))} />
        <MiniStat
          label="跑道"
          value={runway >= 12 ? `${(runway / 12).toFixed(1)} 年` : `${runway.toFixed(1)} 月`}
        />
      </div>

      <SectionLabel className="mt-5">近期流水</SectionLabel>
      <ul className="mt-2 space-y-1.5">
        {flows.map((t) => (
          <FlowRow key={t.id} txn={t} />
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-[10.5px] text-white/30">
          以上是最近 {flows.length} 笔。账本共 {save.vault.transactions.length} 笔，全部保留。
        </p>
      )}
    </section>
  );
}

/**
 * 数量级阶梯。
 *
 * 为什么需要它：`$1,100 → $12,500` 是一次十倍的跨越，但 A9 总进度只动了 4 个点。
 * 对数总进度解决的是"终点太远"，解决不了"我刚翻了一倍却看不见"。
 * 所以这里补一层**以十倍为刻度**的尺子，并把"距离下一个数量级还差多少钱"
 * 直接写成数字 —— 那才是这个阶段真正够得着的目标。
 */
function DecadeLadder({
  magnitude,
  netWorth,
}: {
  magnitude: ReturnType<typeof wealthMagnitude>;
  netWorth: UsdCents;
}) {
  const rungs = Array.from({ length: Math.min(magnitude.decadesToTarget, 4) + 1 }, (_, i) =>
    magnitude.decadeUsdCents * Math.pow(10, i),
  );
  const remaining = Math.max(0, magnitude.nextDecadeUsdCents - netWorth);

  return (
    <div className="mt-3.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1">
        {rungs.map((cents, i) => (
          <div key={cents} className="flex min-w-0 flex-1 flex-col gap-1">
            <div className={cn('h-1 rounded-full', i === 0 ? 'bg-amber-400/70' : 'bg-white/[0.12]')} />
            <span
              className={cn(
                'numeric truncate text-[9.5px]',
                i === 0 ? 'text-amber-300/90' : 'text-white/30',
              )}
            >
              {decadeLabel(cents)}
            </span>
          </div>
        ))}
      </div>

      {/* 当前数量级内部的进度：一条更细的、叠在第一格上的填充 */}
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-amber-400/60 transition-[width] duration-700 ease-cinematic"
          style={{ width: `${magnitude.ratioWithinDecade * 100}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        {magnitude.decadesToTarget === 0 ? (
          // A9 是 $100M，"再往上是 0 个数量级"在满级存档里会变成一句怪话。
          // 走到这里就说明刻度已经跨过去了 —— 直说，不要留一条永远填不满的进度条。
          <>已经站在第 <span className="numeric">9</span> 位数的门槛上了。这条尺子到此为止。</>
        ) : (
          <>
            正走在 <span className="numeric text-white/70">{decadeLabel(magnitude.decadeUsdCents)}</span> 到{' '}
            <span className="numeric text-white/70">{decadeLabel(magnitude.nextDecadeUsdCents)}</span> 之间，
            还差 <span className="numeric text-amber-300/90">{formatUsd(remaining)}</span> 跨过去。再往上是{' '}
            <span className="numeric">{magnitude.decadesToTarget}</span> 个数量级。
          </>
        )}
      </p>
    </div>
  );
}

/** $10k / $100k / $1M / $10M / $100M —— 阶梯轴上要的是"几个零"，不是精确金额 */
function decadeLabel(cents: UsdCents): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${dollars / 1_000_000}M`;
  if (dollars >= 1_000) return `$${dollars / 1_000}k`;
  return `$${dollars}`;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="numeric truncate text-[12.5px] font-medium leading-none text-white/85">{value}</div>
      <div className="mt-1 text-[10px] tracking-wider text-white/35">{label}</div>
    </div>
  );
}

/**
 * 一条流水。
 *
 * 收入金色、支出白灰 —— 但**不用红色**：红色会让花钱变成一件有罪的事，
 * 而这个产品里"把钱花在设备上"是完全正当的。金额带符号，一眼看得出方向。
 */
function FlowRow({ txn }: { txn: VaultTransaction }) {
  const income = txn.amount > 0;
  return (
    <li className="glass-hover flex items-baseline gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
      <span className="shrink-0 text-[10px] text-white/30">{formatDateKeyCN(txn.localDate)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-white/80">{txn.category}</span>
        <span className="block truncate text-[10.5px] text-white/35">{txn.note}</span>
      </span>
      <span className={cn('numeric shrink-0 text-[12px]', income ? 'text-amber-300/95' : 'text-white/55')}>
        {income ? '+' : '−'}
        {formatUsd(Math.abs(txn.amount))}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 下半 · 多重职业轨迹
// ---------------------------------------------------------------------------

function PortfolioSection() {
  const save = useSave();
  const byClass = new Map(save.careers.tracks.map((t) => [t.classId, t]));

  return (
    <section>
      <SectionLabel>
        职业轨迹 · {save.careers.tracks.length} 条并行
      </SectionLabel>
      <div className="mt-2.5 space-y-2">
        {/* 遍历 catalog 而不是存档：界面顺序应当是设定顺序，不该被"哪条后来加的"影响 */}
        {CLASSES.map((entry) => {
          const track = byClass.get(entry.classId);
          if (!track) return null;
          return (
            <TrackCard
              key={entry.classId}
              track={track}
              label={classLabelOf(entry.classId)}
              creed={entry.creed}
              active={save.careers.activeClassId === entry.classId}
            />
          );
        })}
      </div>
    </section>
  );
}

function TrackCard({
  track,
  label,
  creed,
  active,
}: {
  track: CareerTrack;
  label: string;
  creed: string;
  active: boolean;
}) {
  const ratio = expRatio(track);
  const nextTier = track.titleTiers.find((t) => t.fromLevel > track.level);
  const maxed = track.expToNext <= 0;

  return (
    <article
      className={cn(
        'glass-hover rounded-xl border p-3.5',
        active ? 'border-abyss-400/35 bg-abyss-500/[0.08]' : 'border-white/10 bg-white/[0.04]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-[12.5px] font-medium tracking-wide text-white/90">{label}</span>
        <span
          className={cn(
            'numeric ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] leading-[1.4]',
            active
              ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
              : 'border-white/[0.12] bg-white/[0.04] text-white/45',
          )}
        >
          Lv.{track.level}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="truncate text-[11.5px] text-abyss-300/90">{trackTitle(track)}</span>
        <span className="ml-auto shrink-0 text-[10px] text-white/30">
          {maxed ? '已满级' : `${track.exp} / ${track.expToNext} EXP`}
        </span>
      </div>

      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-cinematic',
            maxed ? 'bg-amber-400' : 'bg-gradient-to-r from-abyss-500 to-abyss-300',
          )}
          style={{ width: `${Math.max(maxed ? 100 : 1.5, ratio * 100)}%` }}
        />
      </div>

      <p className="prose-cinematic mt-2 text-[11px] leading-relaxed text-white/40">{creed}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/30">
        <span>
          完成 <span className="numeric text-white/55">{track.stats.questsCompleted}</span> 件
        </span>
        <span>
          累计 <span className="numeric text-white/55">{track.stats.expEarnedTotal.toLocaleString('en-US')}</span> EXP
        </span>
        {nextTier && (
          <span className="text-abyss-300/70">
            再 {nextTier.fromLevel - track.level} 级 → {nextTier.title}
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 篇章定位器
// ---------------------------------------------------------------------------

/** 四条支线。主干不列 —— 它一直在走，写出来只是凑数。 */
const SHOWN_BRANCHES: ChapterBranch[] = ['academic', 'world', 'capital', 'bond'];

/**
 * 金库这一页只需要**位置感** —— 我在哪一章、这一章的支线开着没。
 * 离章条件那张清单是档案馆的正题，这里不重复（一张清单在两处出现，
 * 就会有两种读法，然后其中一种会先过期）。
 */
function ChapterLocator({ activeChapterIds }: { activeChapterIds: ChapterId[] }) {
  const focused = getChapter(activeChapterIds[0] ?? 'CH1') ?? CHAPTERS[0];
  const litBranches = new Set(
    activeChapterIds.map((id) => getChapter(id)?.branch).filter(Boolean) as ChapterBranch[],
  );
  // 支线的开启条件写在 catalog 里（"Ch.1 完成（学术支线开启）"），这里只取括号里的那半句
  const unlockHint = (b: ChapterBranch): string => {
    const def = CHAPTERS.find((c) => c.branch === b);
    const m = def?.entryCondition.match(/（([^）]+)）/);
    return m?.[1] ?? def?.entryCondition ?? '';
  };

  return (
    <section>
      <SectionLabel>篇章定位</SectionLabel>

      <div className="mt-2.5">
        <ChapterCard id={focused.id}>
          {/* 支线：亮 = 本章已开启。四条都是后续篇章的入口，现在全暗着才是对的 */}
          <div className="mt-3.5 grid grid-cols-2 gap-1.5">
            {SHOWN_BRANCHES.map((b) => {
              const lit = litBranches.has(b);
              return (
                <div
                  key={b}
                  className={cn(
                    'rounded-lg border px-2.5 py-2',
                    lit ? 'border-amber-400/35 bg-amber-400/[0.08]' : 'border-white/[0.07] bg-white/[0.02]',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', lit ? 'bg-amber-400' : 'bg-white/20')}
                    />
                    <span className={cn('text-[11px]', lit ? 'text-amber-200' : 'text-white/45')}>
                      {CHAPTER_BRANCH_LABELS[b]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[9.5px] text-white/30" title={unlockHint(b)}>
                    {lit ? '已开启' : unlockHint(b)}
                  </p>
                </div>
              );
            })}
          </div>
        </ChapterCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[10.5px] tracking-[0.18em] text-white/45', className)}>{children}</h3>
  );
}
