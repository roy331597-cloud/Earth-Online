import { useState } from 'react';
import type { ReactNode } from 'react';
import { EVOLUTION_TIER_LABELS } from '@/data/catalog/endgame';
import { markRevealMomentShown } from '@/lib/evolutionEngine';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, localDateKey } from '@/lib/format';
import { evolutionView } from '@/lib/selectors';
import type { EvolutionBranchView, EvolutionNodeView, EvolutionRevealedView } from '@/lib/selectors';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';
import type { EvolutionRevealCondition, EvolutionTier, ISODateTime, NodeId } from '@/types';

// ---------------------------------------------------------------------------
// 三 · 至高隐藏目标：人类科技的进化树
//
// 这一块有过两副面孔，Phase 5 换的是第二副：
//   · 雾里 —— 六根没有名字的柱子（下面这个 EvolutionFog，Phase 2 的，一个字没动）；
//   · 雾散之后 —— 从前是六张分支清单，现在是**一张星空图**。
//
// 为什么值得从清单换成图：清单把 22 个节点摊平成 22 行，
// 于是"cb_2 要等 cb_1"这件事只剩下一行小字；而进化树唯一的形状就是**从哪长到哪**。
// 图把它放回去了 —— 未亮的节点是深蓝的空轮廓，亮起来的是金芯带青光，
// 前置已亮而标签还没凑齐的那个（「在途」）会慢慢呼吸。
// 一条分支读到头，能从第一格一路看到第五格是谁。
//
// ⚠️ 组件碰进化树的**唯一通道**是 `evolutionView`，而且拿到的永远是那个视图，
// 不是 `state.evolution`。迷雾分支只读 `revealed` 一个字段，返回的对象里
// 也没有任何一个字符串来自进化树 —— 所以即使有人在这里写错了分支，
// 他也拿不到一个名字。这不是防御性编程，这是 Phase 1 契约里白纸黑字的要求
// （见 selectors.ts 的 evolutionView）。
// Phase 5 模块三起，调用它的组件从一个变成两个：这里（星空图）
// 与圣殿的至高科技树块（SanctuaryPanel 的 TechTreeBlock，只报数、不画图）。
// 两处走的是同一道闸门、同一个 fogOverride —— 雾里的样子在两边必须一致，
// 所以连「窥视中」那条带子（PeekBanner）也是同一份实现。
// ---------------------------------------------------------------------------

export function EvolutionSection() {
  const save = useSave();
  const fogOverride = useEarthOnlineStore((s) => s.fogOverride);
  const view = evolutionView(save, { fogOverride });

  return (
    <section className="pb-2">
      <SectionLabel>至高隐藏目标</SectionLabel>
      {view.revealed ? <EvolutionRevealed view={view} /> : <EvolutionFog view={view} />}
    </section>
  );
}

/**
 * 未揭晓。
 *
 * 它不许显示任何进度、任何名字、任何数量 —— 只给两样东西：
 * 一个**几何轮廓**（几根柱子、每根多高，这是肉眼本来就看得见的），
 * 和一句题记。
 *
 * 那六根柱子是故意画得这么淡的：它们要读起来像"雾里有什么东西立着"，
 * 而不是"你有六个空槽位待填"。前者是神秘，后者是待办清单。
 */
function EvolutionFog({ view }: { view: { branchCount: number; maxTier: number; line: string } }) {
  const pillars = Array.from({ length: view.branchCount }, (_, i) => i);
  const cells = Array.from({ length: view.maxTier }, (_, i) => i);

  return (
    <div className="relative mt-2.5 overflow-hidden rounded-xl border border-abyss-500/25 bg-ink-950/60 p-4">
      {/* 幽光：两层错位的蓝色模糊，位置不对称 —— 对称的光看起来像装饰 */}
      <div className="pointer-events-none absolute -left-6 -top-10 h-28 w-40 rounded-full bg-abyss-500/20 blur-2xl" />
      <div className="pointer-events-none absolute -right-8 bottom-0 h-24 w-32 rounded-full bg-abyss-400/[0.14] blur-2xl" />

      <div className="relative">
        <div className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-abyss-300/60" />
          <span className="text-[10.5px] tracking-[0.18em] text-abyss-300/70">UNKNOWN BRANCHES</span>
          <span className="ml-auto text-[10px] text-white/25">未揭晓</span>
        </div>

        {/* 轮廓：只有形状，没有名字。呼吸很慢，慢到像背景噪声 */}
        <div className="mt-4 flex animate-breathe items-end justify-center gap-2.5">
          {pillars.map((p) => (
            <div key={p} className="flex w-4 flex-col-reverse gap-1.5">
              {cells.map((c) => (
                <span
                  key={c}
                  className={cn(
                    'h-2.5 w-full rounded-[3px]',
                    // 越靠上越淡：雾是从下面漫上来的
                    c === 0 ? 'bg-abyss-400/20' : c === 1 ? 'bg-abyss-400/15' : 'bg-abyss-400/[0.08]',
                  )}
                />
              ))}
            </div>
          ))}
        </div>

        <p className="prose-cinematic mt-4 text-center text-[12.5px] leading-relaxed text-abyss-300/85">
          {view.line}
        </p>
        <p className="mt-2 text-center text-[10px] text-white/25">
          它一直在记录。到该显现的时候，你自然会看见。
        </p>
      </div>
    </div>
  );
}

/**
 * 已揭晓（含"隔着玻璃看"）。
 *
 * 六条分支不是六张并列的清单 —— 分支顺序按"人类先驯服了什么"排
 * （见 selectors 的 BRANCH_ORDER），所以从上往下读，本身就是一段历史。
 */
function EvolutionRevealed({ view }: { view: EvolutionRevealedView }) {
  const [selected, setSelected] = useState<NodeId | null>(null);

  const allNodes = view.branches.flatMap((b) => b.nodes);
  const picked = selected === null ? null : allNodes.find((n) => n.id === selected) ?? null;
  // 节点视图里刻意不带 branch —— 它嵌套在分支里，两处各存一份迟早会说岔。
  // 反查一次比多一个会漂移的字段便宜。
  const pickedBranch =
    picked === null ? null : view.branches.find((b) => b.nodes.some((n) => n.id === picked.id)) ?? null;
  const nameOf = new Map(allNodes.map((n) => [n.id, n.name]));

  // 雾还没散而你看得见 —— 那是控制室的窥视开关，不是这个世界给你的东西。
  // 得挂一条带子说清楚，否则"我明明记得雾还在"会变成一桩解释不清的旧事。
  const showMoment = view.revealedAt !== null && !view.revealMomentShown;
  const metConditions = view.revealConditions.filter((c) => c.met);

  return (
    <div className="mt-2.5 space-y-2.5">
      {view.peeking && <PeekBanner />}
      {showMoment && <RevealMoment conditions={metConditions} />}

      <div className="rounded-xl border border-abyss-500/30 bg-abyss-500/[0.08] px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11.5px] text-abyss-300">人类科技的进化树</span>
          <span className="numeric ml-auto text-[12px] text-amber-300/90">
            {view.litNodeCount} / {view.totalNodeCount}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">
          点任意一颗星，看它要什么。空的是还没到的，呼吸的是下一步能碰的。
        </p>
      </div>

      <StarMap
        branches={view.branches}
        selected={selected}
        onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
      />

      {picked !== null && pickedBranch !== null && (
        <NodeCard
          node={picked}
          branchLabel={pickedBranch.label}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="space-y-2">
        {view.branches.map((b) => (
          <BranchRow key={b.id} branch={b} />
        ))}
      </div>

      {metConditions.length > 0 && <DoorsMet conditions={metConditions} at={view.revealedAt} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 星空图
//
// 六条泳道（一分支一条）× 五个层位（层级从左到右）。**为什么横着长**：
// 一列一列的竖排到了 375px 的机器上，五字的分支名（"生命的计算"）无论
// 是横排还是竖排都挤不下，而"从哪长到哪"又必须在图上看得见。
// 横过来之后，一条分支就是一条线，从左读到右，正好是它成长的次序；
// 分支名占左边一条窄栏，五个层位沿上沿标一次就够了。
//
// 全部用 SVG：连线是它的本职，且一处 viewBox 就能两端通吃。
// 坐标是**纯几何**，不含任何内容 —— 所以这个文件里没有一个数字来自进化树。
// ---------------------------------------------------------------------------

const MAP_W = 360;
const MAP_H = 300;
const LANE_Y0 = 34;
const LANE_H = 46;
const NODE_X0 = 90;
const NODE_DX = 58;
/** 点击热区半径。比视觉半径大得多 —— 星星 17px 大，但手指要 36px 才点得准 */
const HIT_R = 18;

const nodeX = (tier: number): number => NODE_X0 + (tier - 1) * NODE_DX;
const laneY = (index: number): number => LANE_Y0 + index * LANE_H;

interface Cell {
  node: EvolutionNodeView;
  x: number;
  y: number;
  /** 前置已全部点亮 —— "下一步就能碰" */
  reachable: boolean;
}

/** 一条分支的三个态：已亮 / 在途 / 未达。**只读视图给的字段，不自己算** */
const stateOf = (node: EvolutionNodeView, reachable: boolean): 'lit' | 'inflight' | 'far' =>
  node.lit ? 'lit' : reachable ? 'inflight' : 'far';

function StarMap({
  branches,
  selected,
  onSelect,
}: {
  branches: EvolutionBranchView[];
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
}) {
  // 先把坐标算出来：连线要按 id 找两端，节点自己也要用
  const cells: Cell[][] = branches.map((b, i) =>
    b.nodes.map((node) => ({
      node,
      x: nodeX(node.tier),
      y: laneY(i),
      reachable: !node.lit && node.blockedBy.length === 0,
    })),
  );
  const pos = new Map<NodeId, { x: number; y: number }>();
  for (const lane of cells) for (const c of lane) pos.set(c.node.id, { x: c.x, y: c.y });

  return (
    <div className="rounded-xl border border-abyss-500/20 bg-ink-950/70 px-1 py-2">
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full"
        role="group"
        aria-label="人类科技的进化树，六个分支"
      >
        {/* 层位刻度。只标一次，写在最上面 —— 它是尺子，不是每一行的标题。
            文案直接取目录的 EVOLUTION_TIER_LABELS：那是静态设定、不是存档，
            既不受迷雾门控，也不该在这里被抄成第二份（抄一份就是给了它们分头漂移的机会） */}
        {TIERS.map((tier) => (
          <text
            key={tier}
            x={nodeX(tier)}
            y={16}
            textAnchor="middle"
            className="fill-white/25"
            style={{ fontSize: 9 }}
          >
            {EVOLUTION_TIER_LABELS[tier]}
          </text>
        ))}

        {/* 连线先画，节点压在上面 */}
        {cells.map((lane) =>
          lane.map((c) =>
            c.node.prerequisites.map((pid) => {
              const from = pos.get(pid);
              if (from === undefined) return null; // 指向已删节点的老档：不画，也不报错
              const lit = c.node.lit;
              return (
                <line
                  key={`${pid}-${c.node.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={c.x}
                  y2={c.y}
                  strokeWidth={1}
                  strokeDasharray={lit ? undefined : '3 4'}
                  className={cn(
                    lit
                      ? 'stroke-amber-400/50'
                      : c.reachable
                        ? 'stroke-abyss-300/40'
                        : 'stroke-abyss-400/[0.16]',
                  )}
                />
              );
            }),
          ),
        )}

        {branches.map((b, i) => (
          <g key={b.id}>
            {/* 分支名：左栏，右对齐。这一栏就是它的"路牌" */}
            <text
              x={64}
              y={laneY(i) + 3.5}
              textAnchor="end"
              className={b.litCount > 0 ? 'fill-abyss-300/80' : 'fill-white/35'}
              style={{ fontSize: 10.5 }}
            >
              {b.label}
            </text>
            {cells[i].map((c) => (
              <Star
                key={c.node.id}
                cell={c}
                selected={selected === c.node.id}
                onSelect={onSelect}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** 五个层位。它是一条**尺子**（刻度是几何），不是内容 —— 所以写死在这里不含剧透 */
const TIERS: EvolutionTier[] = [1, 2, 3, 4, 5];

function Star({
  cell,
  selected,
  onSelect,
}: {
  cell: Cell;
  selected: boolean;
  onSelect: (id: NodeId) => void;
}) {
  const { node, x, y } = cell;
  const state = stateOf(node, cell.reachable);
  const lit = state === 'lit';

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.name}，${node.tierLabel}，${lit ? '已点亮' : cell.reachable ? '可推进' : '尚未抵达'}`}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      className="cursor-pointer outline-none"
    >
      <title>{`${node.name} · ${node.tierLabel}`}</title>

      {/* 点击热区：透明，只负责让手指点得中 */}
      <circle cx={x} cy={y} r={HIT_R} className="fill-transparent" />

      {lit && (
        <>
          {/* 青光在外、金芯在内。金是"这件事成了"，青是"它还在亮" */}
          <circle cx={x} cy={y} r={15} className="fill-abyss-400/[0.13]" />
          <circle cx={x} cy={y} r={10.5} className="fill-amber-300/[0.16]" />
        </>
      )}

      {/* 本体轮廓：未亮的深蓝空心，已亮的金色实心 */}
      <circle
        cx={x}
        cy={y}
        r={7}
        strokeWidth={lit ? 1.2 : 1}
        className={cn(
          lit ? 'stroke-amber-300/90' : 'stroke-abyss-400/40',
          lit ? 'fill-amber-400/25' : 'fill-none',
        )}
      />
      <circle
        cx={x}
        cy={y}
        r={lit ? 3 : 1.6}
        className={cn(lit ? 'fill-amber-300' : 'fill-abyss-400/35')}
      />

      {/* 在途：呼吸的那一圈。没有 transform，所以不会踩到 SVG 的变换原点问题 */}
      {state === 'inflight' && (
        <circle
          cx={x}
          cy={y}
          r={10}
          strokeWidth={1}
          strokeDasharray="2 3"
          className="animate-breathe stroke-abyss-300/45 fill-none"
        />
      )}

      {/* 选中的那一颗：一圈更亮的光，别让它混在别的星里 */}
      {selected && (
        <circle cx={x} cy={y} r={13} strokeWidth={1} className="stroke-amber-300/70 fill-none" />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// 详情卡
// ---------------------------------------------------------------------------

function NodeCard({
  node,
  branchLabel,
  nameOf,
  onClose,
}: {
  node: EvolutionNodeView;
  branchLabel: string;
  nameOf: Map<NodeId, string>;
  onClose: () => void;
}) {
  const lit = node.lit;

  return (
    <article
      className={cn(
        'animate-fade-up rounded-xl border p-3.5',
        lit ? 'border-amber-300/25 bg-amber-300/[0.05]' : 'border-abyss-500/25 bg-abyss-500/[0.05]',
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] tracking-[0.14em] text-white/35">{branchLabel}</span>
        <span
          className={cn(
            'numeric text-[9.5px]',
            lit ? 'text-amber-300/80' : 'text-white/30',
          )}
        >
          {node.tierLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起详情"
          className="ml-auto -mr-1 -mt-1 rounded-md px-2 py-1 text-[11px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
        >
          收起
        </button>
      </div>

      <h4
        className={cn(
          'mt-1.5 text-[13.5px] leading-snug',
          lit ? 'text-amber-100/95' : 'text-white/80',
        )}
      >
        {node.name}
      </h4>

      <p className="prose-cinematic mt-1.5 text-[11.5px] leading-relaxed text-white/55">
        {node.criterion}
      </p>

      <div className="mt-2.5 border-t border-white/10 pt-2.5">
        {lit ? (
          <p className="text-[10.5px] leading-relaxed text-amber-300/75">
            {node.litWhileRevealed
              ? `它在 ${litOn(node.litAt)} 亮起 —— 那一次你是看着它亮的。`
              : `它在 ${litOn(node.litAt)} 亮起。那时候你还不知道有这棵树。`}
          </p>
        ) : (
          <div className="space-y-1">
            {node.blockedBy.length > 0 && (
              <p className="text-[10.5px] leading-relaxed text-white/40">
                要等
                {node.blockedBy.map((id) => `「${nameOf.get(id) ?? id}」`).join('、')}
                先亮。
              </p>
            )}
            {node.tagsShort > 0 && (
              <p className="text-[10.5px] leading-relaxed text-abyss-300/75">
                标签还差 {node.tagsShort} 种 —— 同一种标签记十次也只算一种。
              </p>
            )}
            {node.blockedBy.length === 0 && node.tagsShort === 0 && (
              <p className="text-[10.5px] leading-relaxed text-white/40">
                条件都齐了。下一次写入时它会亮。
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

const litOn = (iso: ISODateTime | null): string => {
  if (iso === null) return '某一刻';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '某一刻';
  return formatDateKeyCN(localDateKey(d));
};

// ---------------------------------------------------------------------------
// 分支的题记与进度
//
// 节点搬到图上了，但这六句题记不能跟着一起丢 —— 它们是这个分支唯一的解释，
// 而"解释"不该长在星星上。所以图下面是六行：一行一句，加一条进度。
// ---------------------------------------------------------------------------

function BranchRow({ branch }: { branch: EvolutionBranchView }) {
  return (
    <article className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[11.5px] text-white/75">{branch.label}</span>
        <span
          className={cn(
            'numeric ml-auto shrink-0 text-[10px]',
            branch.litCount > 0 ? 'text-amber-300/85' : 'text-white/25',
          )}
        >
          {branch.litCount} / {branch.nodes.length}
        </span>
      </div>

      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-abyss-500 to-abyss-300 transition-[width] duration-700 ease-cinematic"
          style={{ width: `${Math.max(0, Math.min(1, branch.progress)) * 100}%` }}
        />
      </div>

      <p className="prose-cinematic mt-1.5 text-[10.5px] leading-relaxed text-abyss-300/60">
        {branch.epigraph}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 一起看：窥视带 / 第一次看见 / 你从哪扇门进来的
// ---------------------------------------------------------------------------

/**
 * 雾没散而你看得见时的带子。它必须出现在最上面 —— 否则这一屏会被当成"雾散了"。
 * 导出给圣殿的树块复用：同一个开关、同一条谎言边界，换一页也不能换成另一句话。
 */
export function PeekBanner() {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
      <span className="shrink-0 text-[10px] tracking-[0.14em] text-amber-300/80">窥视中</span>
      <span className="text-[10.5px] leading-relaxed text-white/45">
        这棵树还没对你显形。你看到的是它此刻的样子，关掉控制室的开关，雾就回来。
      </span>
    </div>
  );
}

/**
 * 「第一次看见」。
 *
 * 一次性：看过一次就不再出现（`revealMomentShown`，与金色光晕同一个形状）。
 * 它说的是一件已经发生的事 —— 雾散了 —— 所以它给的是**日期与门**，
 * 不是"恭喜解锁新功能"。那四扇门在这里读起来像一份事后写的记录。
 */
function RevealMoment({ conditions }: { conditions: EvolutionRevealCondition[] }) {
  const mutate = useEarthOnlineStore((s) => s.mutate);

  return (
    <div className="animate-fade-up relative overflow-hidden rounded-xl border border-abyss-400/30 bg-ink-950/80 p-4">
      <div className="pointer-events-none absolute -left-8 -top-12 h-32 w-44 rounded-full bg-abyss-500/25 blur-2xl" />
      <div className="pointer-events-none absolute -right-10 -bottom-6 h-24 w-36 rounded-full bg-amber-300/[0.10] blur-2xl" />

      <div className="relative">
        <div className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-abyss-300/70" />
          <span className="text-[10.5px] tracking-[0.18em] text-abyss-300/70">FOG LIFTED</span>
          <button
            type="button"
            onClick={() => mutate((s) => markRevealMomentShown(s))}
            className="ml-auto rounded-md px-2 py-0.5 text-[10.5px] text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            看过了
          </button>
        </div>

        <p className="prose-cinematic mt-3 text-[12.5px] leading-relaxed text-white/75">
          雾散的时候没有声音。你只是忽然发现，
          那些你以为互不相干的事，一直在往同一个方向上长。
        </p>

        {conditions.length > 0 && (
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-abyss-300/70">
            推开这扇雾的是：
            {conditions.map((c) => `${c.label} 到 ${c.threshold}`).join('，')}。
          </p>
        )}
      </div>
    </div>
  );
}

/** 事后：你是从哪扇门进来的。一条都没成立就不出现（比如用调试指令强行揭晓的档） */
function DoorsMet({
  conditions,
  at,
}: {
  conditions: EvolutionRevealCondition[];
  at: ISODateTime | null;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] tracking-[0.14em] text-white/35">它从哪扇门里进来</span>
        {at !== null && (
          <span className="numeric ml-auto text-[10px] text-white/25">{litOn(at)}</span>
        )}
      </div>
      <ul className="mt-1.5 space-y-1">
        {conditions.map((c) => (
          <li key={c.kind} className="flex items-baseline gap-2 text-[10.5px]">
            <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-abyss-300/70" />
            <span className="text-white/50">{c.label}</span>
            <span className="numeric ml-auto text-abyss-300/70">≥ {c.threshold}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-[10.5px] tracking-[0.18em] text-white/45', className)}>
      {children}
    </h3>
  );
}
