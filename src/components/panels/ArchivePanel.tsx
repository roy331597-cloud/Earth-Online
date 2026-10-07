import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChapterCard } from '@/components/panels/ChapterLore';
import { EvolutionSection } from '@/components/panels/EvolutionSection';
import { MilestoneSheet } from '@/components/panels/MilestoneSheet';
import { AttachPhotoButton } from '@/components/panels/MilestonePhotos';
import { PanelShell } from '@/components/panels/PanelShell';
import { CHAPTER_ACTS } from '@/data/catalog/chapters';
import { REALITY_MILESTONE_CATEGORY_LABELS } from '@/data/catalog/milestones';
import { cn } from '@/lib/cn';
import { formatDateKeyCN } from '@/lib/format';
import type { PanelKey } from '@/lib/panels';
import { chapterMap, milestoneWall } from '@/lib/selectors';
import type { ChapterMapNode } from '@/lib/selectors';
import { useSave } from '@/store/useEarthOnlineStore';
import type { MilestoneSnapshot } from '@/types';

interface ArchivePanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 档案馆。
 *
 * 这一页回答的问题，和另外五个面板都不一样。悬赏、日常、日记、金库、关系，
 * 说的都是**现在**：现在该做什么、现在有多少钱、那个人多久没联系了。
 * 档案馆是唯一一个**回头看**的地方 —— 所以它从头到尾没有一条"待办"。
 *
 * 三节，由近及远：
 *   ① 篇章履历 —— 我在人生的哪一段（九章的真实位置）
 *   ② 现实里程碑 —— 我在这段路上真的做成过什么（有日期的证据）
 *   ③ 进化树 —— 我可能在参与什么（还没到该知道的时刻）
 *
 * 第三节是刻意与整个产品反向的：其余所有地方都在"推"，
 * 只有这里在"藏"。它必须存在，也只能是这样存在。
 */
export function ArchivePanel({ panel, onClose }: ArchivePanelProps) {
  return (
    <PanelShell panel={panel} onClose={onClose}>
      <ChapterArchive />
      <div className="my-5 h-px bg-white/10" />
      <RealityMilestoneWall />
      <div className="my-5 h-px bg-white/10" />
      <EvolutionSection />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 一 · 篇章履历
// ---------------------------------------------------------------------------

function ChapterArchive() {
  const save = useSave();
  const nodes = chapterMap(save);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focused = save.chapters.focusedChapterId;

  return (
    <section className="pt-3.5">
      <SectionLabel>篇章履历</SectionLabel>
      <div className="mt-2.5">
        {/* 离章条件在这里展开 —— 金库那份只要位置感，这份要的是"往哪走" */}
        <ChapterCard id={focused} showConditions />
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[10.5px] tracking-[0.16em] text-white/45">九章总览</span>
        <span className="numeric ml-auto text-[10px] text-white/30">
          {nodes.filter((n) => n.status === 'completed').length} / 9
        </span>
      </div>

      <div className="mt-2 space-y-3">
        {CHAPTER_ACTS.map((act) => (
          <div key={act.act}>
            <div className="flex items-baseline gap-2">
              <span className="numeric text-[10px] tracking-[0.14em] text-amber-400/65">
                第 {act.act} 幕
              </span>
              <span className="text-[10.5px] text-white/40">{act.title}</span>
            </div>
            <ul className="mt-1.5 space-y-px">
              {act.chapterIds.map((id, i, arr) => {
                const node = byId.get(id);
                return node ? (
                  <ChapterRow key={id} node={node} last={i === arr.length - 1} />
                ) : null;
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
        幕只是回看时的分段，不参与解锁。除主干外的支线可以并行推进。
      </p>
    </section>
  );
}

/**
 * 一行一章。左边是刻度，右边是状态。
 *
 * 未解锁的章节**照样显示名字** —— 这是有意的：九章是地图，遮住地图
 * 只会让人不知道自己走到哪儿了。唯一的例外是 `hidden`（Ch.9），
 * selector 已经把它的标题换成了占位符，因为那一章本身就是秘密。
 */
function ChapterRow({ node, last }: { node: ChapterMapNode; last: boolean }) {
  const done = node.status === 'completed';
  const active = node.status === 'active';
  const hidden = node.status === 'hidden';
  const shown = node.status === 'available' || active;

  return (
    <li className="relative flex items-center gap-2.5 pl-4">
      {/* 竖线 + 节点。metro 图那种画法：一条主干，九个站点 */}
      {!last && (
        <span
          className={cn(
            'absolute left-[5px] top-[14px] bottom-[-4px] w-px',
            done ? 'bg-amber-400/25' : 'bg-white/[0.09]',
          )}
        />
      )}
      <span
        className={cn(
          'absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border',
          done
            ? 'border-amber-400/70 bg-amber-400/80'
            : active
              ? 'animate-dot-pulse border-amber-400/70 bg-amber-400/25'
              : hidden
                ? 'border-dashed border-white/25 bg-transparent'
                : 'border-white/20 bg-white/[0.06]',
        )}
      />

      <span
        className={cn(
          'numeric w-4 shrink-0 text-[10.5px]',
          done || active ? 'text-white/70' : 'text-white/30',
        )}
      >
        {String(node.index).padStart(2, '0')}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[11.5px]',
          hidden
            ? 'tracking-[0.3em] text-white/20'
            : done
              ? 'text-white/85'
              : shown
                ? 'text-white/70'
                : 'text-white/35',
        )}
        title={hidden ? undefined : node.subtitle}
      >
        {node.title}
      </span>

      {/* 汇合点（Ch.4 那种"学术线 / 世界线二选一"）值得单独标一下 ——
          它是这张图里唯一一处"你的选择会真的改变路径"的地方 */}
      {node.isConvergence && !hidden && (
        <span className="shrink-0 text-[9.5px] text-abyss-300/60" title="多条支线在此汇合">
          汇合
        </span>
      )}
      <span
        className={cn(
          'shrink-0 text-[9.5px]',
          node.branch === 'trunk' ? 'text-white/25' : 'text-abyss-300/55',
        )}
      >
        {hidden ? '' : node.branchLabel}
      </span>
      <span className="w-3 shrink-0 text-center text-[10px] text-amber-400/75">{done ? '✓' : ''}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 二 · 现实里程碑墙
// ---------------------------------------------------------------------------

/**
 * 这面墙上只有**在现实里真的发生过的事**。
 *
 * 它是这个产品里唯一一处不依赖任何游戏内数值的证据：任务可以点两下完成，
 * 这里的每一条都得先在门外发生。所以它不该长得像一张列表 ——
 * 它更像一面钉着票据的墙，日期在前，说明在后。
 */
function RealityMilestoneWall() {
  const save = useSave();
  const [recording, setRecording] = useState(false);
  const entries = milestoneWall(save);
  const spent = entries.reduce((sum, e) => sum + e.record.expGranted, 0);

  return (
    <section>
      <SectionLabel className="flex items-baseline">
        现实里程碑
        {entries.length > 0 && (
          <span className="numeric ml-2 text-[10px] tracking-normal text-white/30">
            {entries.length} 条 · 累计 {spent} EXP
          </span>
        )}
        {/* 这一页别的按钮都是"往回想"的，只有这颗是"往这儿放"的 ——
            放在标题行上，是因为它属于这一节，而不是属于整页 */}
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="glass-pill glass-hover ml-auto px-2.5 py-1 text-[10.5px] text-amber-100/85"
        >
          记录一件事
        </button>
      </SectionLabel>

      {entries.length === 0 ? (
        <p className="mt-2.5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3.5 text-[11.5px] leading-relaxed text-white/40">
          还没有记录。这一栏只收真事 —— 签证、旅行、论文、第一笔自己的钱，
          写下来才会出现在这儿。
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {entries.map((e) => (
            <li
              key={e.record.id}
              className="glass-hover rounded-xl border border-white/10 bg-white/[0.04] p-3.5"
            >
              <div className="flex items-baseline gap-2">
                <span className="numeric shrink-0 text-[10.5px] tracking-[0.1em] text-amber-400/80">
                  {formatDateKeyCN(e.displayDate)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-wide text-white/90">
                  {e.title}
                </span>
                {/* 「第 2 次」比一个"可重复"标签有用：它说的是你已经走到哪了 */}
                {e.repeatable && e.timesRecorded > 1 && (
                  <span className="numeric shrink-0 rounded-md border border-abyss-400/30 bg-abyss-500/10 px-1.5 py-0.5 text-[9.5px] leading-[1.4] text-abyss-300/85">
                    第 {e.timesRecorded} 次
                  </span>
                )}
                {/* 自己写的那条要认得出是自己写的 —— 但**不降级**：
                    同一个位置、同一档字号，只是换一种颜色。它不是二等公民，
                    只是来源不同（同 `e.custom` 的判据：definitionId 为 null） */}
                {e.custom && (
                  <span className="shrink-0 rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[9.5px] leading-[1.4] text-white/45">
                    自己写的
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[10.5px] text-white/35">
                  {REALITY_MILESTONE_CATEGORY_LABELS[e.category]}
                </span>
                {e.subtitle && (
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-white/30">
                    {e.subtitle}
                  </span>
                )}
              </div>

              {e.record.note && (
                <p className="prose-cinematic mt-2 border-l-2 border-amber-400/25 pl-2.5 text-[11.5px] leading-relaxed text-white/55">
                  {e.record.note}
                </p>
              )}

              {/* 图与链接直接摆出来。一个数字（"2 张快照"）指的是一个仓库，
                  而缩略图指的是那件事本身 —— 后者才是这面墙存在的理由 */}
              <SnapshotStrip snapshots={e.record.snapshots} />

              <div className="mt-2 flex items-center gap-3 text-[10px] text-white/30">
                <span className="numeric text-amber-300/70">+{e.record.expGranted} EXP</span>
                {/* 事件发生的日子 ≠ 写下来的日子。记不清日期时只留后者，这里也就只剩一个 */}
                {e.record.occurredOn && e.record.occurredOn !== e.record.recordedAt.slice(0, 10) && (
                  <span>{formatDateKeyCN(e.record.recordedAt.slice(0, 10))} 记下</span>
                )}
                {/* 事后补一张。录入结果页上那句"照片可以过几天补"的落点就是这里 ——
                    没有它，那句话就是一句空话 */}
                <span className="ml-auto">
                  <AttachPhotoButton
                    recordId={e.record.id}
                    photoCount={e.record.snapshots.filter((s) => s.kind === 'photo').length}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {recording && <MilestoneSheet onClose={() => setRecording(false)} />}
    </section>
  );
}

/**
 * 一条记录上的图与链接。
 *
 * 图**点开是原图**（新标签页）：缩略图只有 64px，而存档里那张的长边是 1280 ——
 * 想看清字得点开。链接按域名显示，因为一串 `https://...` 对人是没有意义的。
 *
 * 一条都没有时**不占位**：没有图的记录不该在下面留一行空白等着被填。
 */
function SnapshotStrip({ snapshots }: { snapshots: MilestoneSnapshot[] }) {
  if (snapshots.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {snapshots.map((s, i) =>
        s.kind === 'photo' ? (
          <a
            key={`p-${s.addedAt}-${i}`}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`看第 ${i + 1} 张原图`}
            className="block overflow-hidden rounded-lg border border-white/15 transition-all duration-300 ease-cinematic hover:border-amber-400/45"
          >
            <img
              src={s.url}
              alt={s.caption ?? '这条记录的照片'}
              loading="lazy"
              className="h-16 w-16 object-cover"
            />
          </a>
        ) : (
          <a
            key={`l-${s.addedAt}-${i}`}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="max-w-[11rem] truncate rounded-lg border border-white/[0.12] bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-abyss-300/85 transition-all duration-300 ease-cinematic hover:border-abyss-400/45 hover:text-abyss-300"
          >
            {linkHost(s.url)} ↗
          </a>
        ),
      )}
    </div>
  );
}

/** 只为了让链接说人话：`https://example.com/a/b` → `example.com`。解不出来就老实说"链接" */
const linkHost = (url: string): string => url.replace(/^https?:\/\//, '').split(/[/?#]/)[0] || '链接';

// ---------------------------------------------------------------------------

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[10.5px] tracking-[0.18em] text-white/45', className)}>
      {children}
    </h3>
  );
}
