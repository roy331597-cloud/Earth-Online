import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, localDateKey } from '@/lib/format';
import { InlineError } from '@/components/ui/InlineError';
import { PeekBanner } from '@/components/panels/EvolutionSection';
import { PanelShell } from '@/components/panels/PanelShell';
import { useAgentAction } from '@/hooks/useAgentAction';
import type { PanelKey } from '@/lib/panels';
import { composeGoalBrief } from '@/lib/questBriefs';
import { endgameView, evolutionView } from '@/lib/selectors';
import type { ClearComponentView, GoalMilestoneView, GoalView } from '@/lib/selectors';
import { thunks } from '@/store/agentRuntime';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';
import type { GoalIdLiteral, ISODateTime } from '@/types';

interface SanctuaryPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 愿景圣殿。
 *
 * 这一页只回答一个问题：**"我要去的地方，长什么样。"**
 *
 * 三件事，从上往下：
 *   ① 抬头是全通关（UR）的总账 —— 三份等权：五目标 / 篇章 / 徽记。
 *      它放在最前面，是因为这一页的读法本来就是这个方向：
 *      先看一眼"全部"，再看五个"很远"，最后看见那棵树（地平线）。
 *   ② 五张终极目标卡。每一格里程碑都在卡里：亮了的带日期，
 *      没亮的带条件，**藏着的连名字都不给**（闸门在 selectors.endgameView
 *      那边就关好了 —— 这里就算忘了判 null，也拿不到那个名字）。
 *      卡上只有一处交互：没达成的目标可以「拆解成任务链」——交给调度员
 *      拆成几步落在「待议」（这一页只留一行结果，逐条裁决是悬赏那边的事）。
 *   ③ 至高科技树，压在最底下当远景。它有自己的雾（与档案馆同源）：
 *      雾里只给空槽，雾散才给数字。**它不进上面的综合进度** ——
 *      树不设终点，算进去会让数字在掀雾那天回跌（见 selectors 的注释）。
 *
 * 一条纪律：这一页**不催促**。远景不是倒计时，进来的默认读法是
 * "看一眼，然后回到今天"。所以没有任何一处写"还差多少天"或"加油"。
 */
export function SanctuaryPanel({ panel, onClose }: SanctuaryPanelProps) {
  const save = useSave();
  const view = endgameView(save);

  // 「拆解成任务链」：把某个目标交给调度员拆成一串能落地的步骤。
  // 产出一律落「待议」（与灵感框同一条闸门）—— 这一页只留一行结果，
  // 不把草稿搬进来：圣殿回答"我要去的地方长什么样"，
  // 逐条过目是悬赏中枢那边的事。
  const [decomposingId, setDecomposingId] = useState<string | null>(null);
  const [decomposed, setDecomposed] = useState<{ goalId: string; stepCount: number } | null>(null);
  const { busy, error, run, clearError } = useAgentAction();

  const decompose = (goalId: GoalIdLiteral) => {
    if (busy) return;
    setDecomposed(null);
    setDecomposingId(goalId);
    void run(async () => {
      const brief = composeGoalBrief(save, goalId);
      if (brief === null) return { ok: false as const, message: '这个目标已经达成了 —— 它不需要拆了。' };
      const result = await thunks.forgeChain({
        idea: brief.idea,
        classId: brief.classId,
        deepDeliberation: false,
        from: 'goal',
      });
      if (result.ok) setDecomposed({ goalId, stepCount: result.data.stepCount });
      return result;
    }).finally(() => setDecomposingId(null));
  };

  return (
    <PanelShell panel={panel} onClose={onClose}>
      {/* ================= 抬头：全通关（UR） ================= */}
      <section className="pt-3.5">
        <div className="flex items-center gap-3">
          <UrSigil complete={view.clear.complete} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[10.5px] tracking-[0.16em] text-white/45">全通关</span>
              <span className="numeric ml-auto text-[11px] text-amber-300/85">
                {Math.round(view.clear.progress * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-amber-400/55 transition-all duration-700 ease-cinematic"
                style={{ width: `${Math.round(view.clear.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {view.clear.components.map((c) => (
            <ClearRow key={c.key} component={c} />
          ))}
        </ul>

        <p className="prose-cinematic mt-2.5 text-[11.5px] leading-relaxed text-white/35">
          三份等权，谁也不比谁更重。三份都走完的那一天，上面那枚徽记会亮 ——
          在那之前，它只是一块形状。
        </p>
      </section>

      {/* ================= 五个很远的地方 ================= */}
      {view.goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          decompose={{
            busy: busy && decomposingId === goal.id,
            doneStepCount: decomposed?.goalId === goal.id ? decomposed.stepCount : null,
            onRun: () => decompose(goal.id),
          }}
        />
      ))}

      {error && (
        <div className="mt-4">
          <InlineError message={error} onDismiss={clearError} />
        </div>
      )}

      {/* ================= 地平线：至高科技树 ================= */}
      <TechTreeBlock />

      <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25">
        它还远。远的东西不需要天天看 —— 知道它在，就够了。
      </p>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// UR 徽记
// ---------------------------------------------------------------------------

/**
 * UR 徽记：全通关点亮的那一枚。
 *
 * 它是这一页唯一一个"点亮的瞬间会改变什么"的元素 ——
 * 达成的版本也不换形状，只换材质（描边、底色、光晕），
 * 与陈列馆的四档同一条纪律：差别是材质，不是亮度。
 */
function UrSigil({ complete }: { complete: boolean }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10.5px] tracking-[0.08em] transition-all duration-700 ease-cinematic',
        complete
          ? 'border-amber-300/80 bg-amber-400/15 text-amber-200 shadow-[0_0_22px_rgba(251,191,36,0.30)]'
          : 'border-white/15 bg-white/[0.03] text-white/25',
      )}
      aria-label={complete ? '全通关已点亮' : '全通关未达成'}
    >
      UR
    </span>
  );
}

/** 综合进度里的一份：一行读数 */
function ClearRow({ component }: { component: ClearComponentView }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-[3.8rem] shrink-0 text-[10.5px] text-white/45">{component.label}</span>
      <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-amber-400/35 transition-all duration-700 ease-cinematic"
          style={{ width: `${Math.round(component.ratio * 100)}%` }}
        />
      </div>
      <span className="w-[5.6rem] shrink-0 text-right text-[10px] tracking-wider text-white/30">
        {component.line}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 一张终极目标卡
// ---------------------------------------------------------------------------

/** 一张目标卡上的「拆解」控制器（面板持有状态，卡片只渲染） */
interface GoalDecompose {
  busy: boolean;
  /** 拆完之后：这一拆拟了几步（null = 还没拆过） */
  doneStepCount: number | null;
  onRun: () => void;
}

function GoalCard({ goal, decompose }: { goal: GoalView; decompose: GoalDecompose }) {
  const pct = Math.round(goal.progress * 100);

  return (
    <article
      className={cn(
        'mt-6 rounded-xl border px-3.5 py-3',
        goal.achieved
          ? 'border-amber-300/30 bg-amber-400/[0.05]'
          : 'border-white/[0.09] bg-white/[0.025]',
      )}
    >
      <div className="flex items-baseline gap-2">
        <h4 className="prose-cinematic text-[13.5px] tracking-wide text-white/85">{goal.title}</h4>
        {goal.achieved ? (
          <span className="ml-auto shrink-0 text-[10px] tracking-wider text-amber-300/85">
            已达成 · {litOn(goal.achievedAt)}
          </span>
        ) : (
          <span className="numeric ml-auto shrink-0 text-[10px] text-white/30">
            {goal.litCount} / {goal.totalCount}
          </span>
        )}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-white/40">{goal.definition}</p>
      <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-abyss-300/70">
        {goal.narrative}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-amber-400/50 transition-all duration-700 ease-cinematic"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="numeric shrink-0 text-[10px] text-white/35">{pct}%</span>
      </div>

      <ul className="mt-2.5 divide-y divide-white/[0.05] border-t border-white/[0.07]">
        {goal.milestones.map((m) => (
          <MilestoneRow key={m.id} milestone={m} />
        ))}
      </ul>

      {/* 拆解入口。只给没达成的目标 —— 已经亮了的格子没有"下一步"可拆 */}
      {!goal.achieved && (
        <div className="mt-2.5 border-t border-white/[0.07] pt-2.5">
          {decompose.doneStepCount !== null ? (
            <p className="text-[10.5px] leading-relaxed text-white/40">
              调度员拟了 {decompose.doneStepCount} 步，在「悬赏 · 待议」里等你过目。
            </p>
          ) : (
            <button
              type="button"
              disabled={decompose.busy}
              onClick={decompose.onRun}
              className={cn(
                'glass-pill glass-hover px-2.5 py-1.5 text-[11px] text-white/55',
                decompose.busy && 'cursor-not-allowed opacity-60',
              )}
            >
              {decompose.busy ? '调度员正在拆…' : '拆解成任务链'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * 一格里程碑。三种处境：
 *   已亮 —— 琥珀实点 + 日期（点亮的日子，不是"达成"的日子：
 *           净资产这类状态谓词，写下的时刻是**系统第一次看见它为真**，
 *           见 endgameEngine 文件头）；
 *   未亮 —— 空心点 + 条件原文；
 *   藏着 —— 一个遮住的形状，连名字都不给（title 为 null 就是它）。
 */
function MilestoneRow({ milestone: m }: { milestone: GoalMilestoneView }) {
  if (m.title === null) {
    return (
      <li className="flex items-center gap-2.5 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-white/15" />
        <span
          className="block h-2.5 w-24 rounded-full bg-white/[0.06]"
          aria-label="尚未命名的里程碑"
        />
        <span className="ml-auto shrink-0 text-[10px] text-white/20">还没有名字</span>
      </li>
    );
  }

  return (
    <li className="flex items-baseline gap-2.5 py-2">
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full',
          m.achieved ? 'bg-amber-400/90' : 'border border-white/20',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'prose-cinematic text-[12px] leading-snug',
              m.achieved ? 'text-white/85' : 'text-white/55',
            )}
          >
            {m.title}
          </span>
          {m.achieved && (
            <span className="numeric ml-auto shrink-0 text-[10px] tracking-wider text-amber-300/55">
              点亮 {litOn(m.achievedAt)}
            </span>
          )}
        </div>
        {!m.achieved && m.criterion !== null && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">{m.criterion}</p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 地平线：至高科技树
// ---------------------------------------------------------------------------

/**
 * 至高科技树的远景块。
 *
 * 它和档案馆里那张星空图是**同一棵树的两副面孔**：
 * 那边是"看它长什么样"（泳道、连线、点击），这边只要一个读数 ——
 * 站在圣殿里的人问的是"它还剩多少"，不是"cb_2 要等谁"。
 *
 * 雾的规矩与档案馆完全一致（同一个 evolutionView、同一个 fogOverride）：
 *   · 雾里 —— 六个空槽 + 那句题记。不出现任何数字；
 *   · 雾散 —— 点亮数 / 总数 + 百分比 + 六条分支的 mini 条；
 *   · 窥视 —— 数字照给，但头上挂带子（复用档案馆的 PeekBanner）。
 */
function TechTreeBlock() {
  const save = useSave();
  const fogOverride = useEarthOnlineStore((s) => s.fogOverride);
  const view = evolutionView(save, { fogOverride });

  return (
    <section className="mt-6">
      <h3 className="text-[10.5px] tracking-[0.18em] text-white/45">至高科技树</h3>

      {view.revealed ? (
        <div className="mt-2.5 rounded-xl border border-abyss-500/30 bg-abyss-500/[0.07] px-3.5 py-3">
          {view.peeking && (
            <div className="mb-2.5">
              <PeekBanner />
            </div>
          )}

          <div className="flex items-baseline gap-2">
            <span className="text-[11.5px] text-abyss-300">人类的六条支线</span>
            <span className="numeric ml-auto text-[12px] text-amber-300/90">
              {view.litNodeCount} / {view.totalNodeCount}
            </span>
          </div>

          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-amber-400/45 transition-all duration-700 ease-cinematic"
              style={{
                width: `${view.totalNodeCount === 0 ? 0 : Math.round((view.litNodeCount / view.totalNodeCount) * 100)}%`,
              }}
            />
          </div>

          <ul className="mt-2.5 space-y-1.5">
            {view.branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="w-[4.6rem] shrink-0 truncate text-[10.5px] text-white/55">{b.label}</span>
                <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-abyss-500 to-abyss-300 transition-[width] duration-700 ease-cinematic"
                    style={{ width: `${Math.max(0, Math.min(1, b.progress)) * 100}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'numeric w-[3.2rem] shrink-0 text-right text-[10px]',
                    b.litCount > 0 ? 'text-amber-300/75' : 'text-white/25',
                  )}
                >
                  {b.litCount} / {b.nodes.length}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2.5 text-[10px] leading-relaxed text-white/25">
            完整的一张图在档案馆里 —— 这一页只报数，那张图才看得见"从哪长到哪"。
          </p>
        </div>
      ) : (
        <div className="relative mt-2.5 overflow-hidden rounded-xl border border-abyss-500/25 bg-ink-950/60 p-4">
          {/* 幽光：与档案馆那片雾同一套做法，两层错位的蓝色模糊 */}
          <div className="pointer-events-none absolute -left-6 -top-10 h-28 w-40 rounded-full bg-abyss-500/20 blur-2xl" />
          <div className="pointer-events-none absolute -right-8 bottom-0 h-24 w-32 rounded-full bg-abyss-400/[0.14] blur-2xl" />

          <div className="relative">
            {/* 空槽：只给形状，不给名字、不给数字 —— 与 CH9 在篇章台上的「——」同一种语言 */}
            <div className="mt-1 flex animate-breathe items-center justify-center gap-2">
              {Array.from({ length: view.branchCount }, (_, i) => (
                <span key={i} className="h-2.5 w-6 rounded-[3px] bg-abyss-400/[0.16]" />
              ))}
            </div>

            <p className="prose-cinematic mt-3.5 text-center text-[12px] leading-relaxed text-abyss-300/80">
              {view.line}
            </p>
            <p className="mt-1.5 text-center text-[10px] text-white/25">
              它一直在记录。到该显现的时候，你自然会看见。
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * 点亮的日子。
 *
 * ⚠️ 措辞是「点亮」不是「达成」：净资产这类判据是**状态谓词**，
 *    引擎写下的是"系统第一次看见它为真"的时刻，不是你在哪一天跨过它的
 *    （见 endgameEngine 的文件头）。解析不出日期时返回 '某一刻' ——
 *    宁可含糊，也不印 NaN。
 */
const litOn = (iso: ISODateTime | null): string => {
  if (iso === null) return '某一刻';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '某一刻';
  return formatDateKeyCN(localDateKey(d));
};
