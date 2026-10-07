import { useState } from 'react';
import { PanelShell } from '@/components/panels/PanelShell';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FloatLayer, useFloatBursts } from '@/components/ui/ExpFloat';
import { PanelTabs } from '@/components/ui/PanelTabs';
import { classLabelOf } from '@/data/catalog/classes';
import { WEEKLY_REWARD_TIERS } from '@/data/catalog/policy';
import type { WeeklyRewardTierKey } from '@/data/catalog/policy';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import type { PanelKey } from '@/lib/panels';
import { checkedDailyIds, checkedWeeklyIds, todayKey, weekKeyOf } from '@/lib/selectors';
import { checkDaily, checkWeekly, createWeekly } from '@/store/operations';
import { useEarthOnlineStore, useMutate, useSave } from '@/store/useEarthOnlineStore';
import type { ClassIdLiteral, DailyDefinition, WeeklyDefinition } from '@/types';

interface RoutinePanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 日常面板（两栏：每日任务 / 每周任务）。
 *
 * Phase 2 收官时的定位收缩：这里只住**周期性自律** —— 每日任务与每周任务。
 * 非日常任务（进行中 / 待结算）全部搬去了悬赏中枢，它们的时间感不一样：
 * 任务有始有终，日常无始无终。分开之前，"今天做没做"和"这件事做没做完"
 * 挤在同一屏，两种刻度会互相打架。
 *
 * 两层同住一个面板、各自的刻度不同（一天 / 一周），所以像悬赏四联那样分了栏：
 * 同一时刻，你只需要盯住其中一块。角标沿用悬赏的口径 ——
 * 数的是"还要你动手的数量"，打过的钩不再催。
 *
 * ---------------------------------------------------------------------------
 * 🔴 一条贯穿两栏的红线：**只能由玩家创建**
 * ---------------------------------------------------------------------------
 * 日常与周常是"你给自己定的规矩"。系统与 AI 都不得自动创建、不得自动启用 ——
 * AI 唯一的入口是推荐，采纳与否在玩家（见 ResolveDailyRecommendation 契约）。
 * 所以这个面板里没有"一键生成日常"，创建表单的入口措辞也刻意是
 * 「写下来」，不是「生成」。
 *
 * 每周任务的结算在**每周一 01:00**（归属日跨进新一周的那一刻）：
 * 上周没打钩的条目扣 penaltyExp、连击归零，浮层在 RolloverNotice 里分节展示。
 */
type RoutineTab = 'daily' | 'weekly';

export function RoutinePanel({ panel, onClose }: RoutinePanelProps) {
  const save = useSave();
  const now = useNow();
  const [tab, setTab] = useState<RoutineTab>('daily');

  // 角标口径与悬赏四联一致：**还要你动手的数量**（打过的钩不再催）。
  const dailies = save.dailies.definitions.filter((d) => d.enabled);
  const checkedToday = checkedDailyIds(save, now);
  const weeklies = save.weeklies.definitions.filter((w) => w.enabled);
  const checkedThisWeek = checkedWeeklyIds(save, now);

  const subheader = (
    <PanelTabs
      active={tab}
      onChange={(k) => setTab(k as RoutineTab)}
      tabs={[
        {
          key: 'daily',
          label: '每日任务',
          badge: dailies.filter((d) => !checkedToday.has(d.id)).length,
        },
        {
          key: 'weekly',
          label: '每周任务',
          badge: weeklies.filter((w) => !checkedThisWeek.has(w.id)).length,
        },
      ]}
    />
  );

  return (
    <PanelShell panel={panel} onClose={onClose} subheader={subheader}>
      <div className="pt-3.5">{tab === 'daily' ? <DailySection /> : <WeeklySection />}</div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 栏 A · 每日任务
// ---------------------------------------------------------------------------

function DailySection() {
  const save = useSave();
  const now = useNow();
  const checked = checkedDailyIds(save, now);
  const dailies = save.dailies.definitions.filter((d) => d.enabled);
  const todayLog = save.dailies.logs[todayKey(now)];
  const done = dailies.filter((d) => checked.has(d.id)).length;

  return (
    <section>
      {dailies.length === 0 ? (
        <EmptyHint text="还没有任何日常。日常只能由你自己写下来 —— 系统不会替你安排生活。" />
      ) : (
        <>
          {/* 栏名已由标签条给出，这里不再重复；头一行只留进度与今天入账的账。 */}
          <div className="flex items-baseline justify-between text-[11.5px]">
            <span className="text-white/55">
              今日 <span className="numeric text-white/85">{done}</span> / {dailies.length}
            </span>
            <span className="numeric text-[11px] text-white/45">+{todayLog?.expEarned ?? 0} EXP</span>
          </div>
          <ProgressBar ratio={dailies.length === 0 ? 0 : done / dailies.length} />

          <ul className="mt-3 space-y-2">
            {dailies.map((d) => (
              <DailyRow key={d.id} def={d} checked={checked.has(d.id)} />
            ))}
          </ul>

          <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
            打钩即发奖，一天一次；跨天未打钩会在结算时扣该条日常的 EXP，连击归零。
          </p>
        </>
      )}
    </section>
  );
}

/**
 * 打钩按钮。日与周共用 —— 两栏的复选框手感必须一模一样，
 * 否则"打钩"这个动作会分裂成两种肌肉记忆。
 */
function CheckBox({
  checked,
  ariaLabel,
  onPress,
}: {
  checked: boolean;
  ariaLabel: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      disabled={checked}
      onClick={onPress}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ease-cinematic',
        checked
          ? 'animate-pop-in border-amber-400/60 bg-amber-400/20 text-amber-300'
          : 'border-white/25 text-transparent hover:border-amber-400/60 hover:bg-amber-400/10 active:scale-95',
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    </button>
  );
}

function DailyRow({ def, checked }: { def: DailyDefinition; checked: boolean }) {
  const mutate = useMutate();
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const { bursts, push } = useFloatBursts();

  const policy = useEarthOnlineStore((s) => s.save.settings.rewardPolicy);
  // 打钩前的连击决定这一钩的加成 —— 今天这一钩算进明天
  const bonusPct = Math.min(def.streak * policy.streakBonusPerDay * 100, policy.streakBonusCapPct);
  const willGain = Math.round(def.reward.exp * (1 + bonusPct / 100));

  const confirm = () => {
    // 打钩前后的日志差额 = 这一钩真正入账的 EXP。
    // 不拿 willGain 来显示：那是**预测**（弹窗里已经用它了），
    // 飘走的数字必须等于账本上真实增加的那个数，否则两处算法迟早会漂移。
    const before = useEarthOnlineStore.getState().save.dailies.logs[todayKey(now)]?.expEarned ?? 0;

    mutate((s) => checkDaily(s, def.id, new Date()));
    setConfirming(false);

    const after = useEarthOnlineStore.getState().save;
    const log = after.dailies.logs[todayKey(now)];
    const streak = after.dailies.definitions.find((d) => d.id === def.id)?.streak;
    if (log && streak !== undefined) {
      push(`+${log.expEarned - before} EXP · 连击 ${streak} 天`);
    }
  };

  return (
    <li className="relative">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300 ease-cinematic',
          checked
            ? 'border-amber-400/25 bg-amber-400/[0.07]'
            : 'border-white/10 bg-white/[0.04] hover:border-amber-400/35',
        )}
      >
        <CheckBox
          checked={checked}
          ariaLabel={checked ? `${def.title}（今日已完成）` : `完成 ${def.title}`}
          onPress={() => setConfirming(true)}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-tight text-white/90">{def.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-white/40">
            <span className="numeric">{def.reward.exp} EXP</span>
            {def.countsForStreak && (
              <span className={cn('numeric', checked ? 'text-amber-400/80' : '')}>
                连击 {def.streak} 天
              </span>
            )}
            {def.window && (
              <span className="text-abyss-300/70">
                建议 {String(def.window.fromHour).padStart(2, '0')}:00–
                {String(def.window.toHour).padStart(2, '0')}:00
              </span>
            )}
          </div>
        </div>

        {checked && <span className="shrink-0 text-[10.5px] text-amber-400/70">已完成</span>}
      </div>

      <FloatLayer bursts={bursts} />

      <ConfirmDialog
        open={confirming}
        question="确认完成今日"
        subject={`${def.title}？`}
        detail={
          <>
            奖励 <span className="numeric text-amber-400/90">+{willGain} EXP</span>
            {bonusPct > 0 && <>（含连击加成 {Math.round(bonusPct)}%）</>}
            <br />
            连击将记为 <span className="numeric text-white/70">{def.streak + 1}</span> 天；打钩后今日不可撤销。
          </>
        }
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// 栏 B · 每周任务
// ---------------------------------------------------------------------------

function WeeklySection() {
  const save = useSave();
  const now = useNow();
  const checked = checkedWeeklyIds(save, now);
  const weeklies = save.weeklies.definitions.filter((w) => w.enabled);
  const weekStart = weekKeyOf(now);
  const weekLog = save.weeklies.logs[weekStart];
  const done = weeklies.filter((w) => checked.has(w.id)).length;

  const [creating, setCreating] = useState(false);

  return (
    <section>
      {/* 同每日栏：栏名交给标签条，头一行只留进度与本周入账的账。 */}
      <div className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-white/55">
          本周 <span className="numeric text-white/85">{done}</span> / {weeklies.length}
        </span>
        <span className="numeric text-[11px] text-white/45">+{weekLog?.expEarned ?? 0} EXP</span>
      </div>
      <ProgressBar ratio={weeklies.length === 0 ? 0 : done / weeklies.length} />

      {weeklies.length === 0 && !creating ? (
        <EmptyHint text="还没有每周任务。选一两件「这周结束前做完一次」的事 —— 别贪多，周常的重量是按周量的。" />
      ) : (
        <ul className="mt-3 space-y-2">
          {weeklies.map((w) => (
            <WeeklyRow key={w.id} def={w} checked={checked.has(w.id)} />
          ))}
        </ul>
      )}

      {/* 创建入口。红线照旧：写下来的笔只有玩家能拿 —— 所以按钮叫「写一条」，不叫「生成」 */}
      {creating ? (
        <WeeklyCreateForm onDone={() => setCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-3 w-full rounded-lg border border-dashed border-white/20 py-2 text-[11.5px] text-white/55 transition-all duration-300 ease-cinematic hover:border-amber-400/45 hover:text-amber-200"
        >
          ＋ 写一条每周任务
        </button>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
        周常只能由你自己写。一周打一次钩，周一 01:00 结算；仍未打钩的，结算时扣该条的 EXP、连击归零。
      </p>
    </section>
  );
}

function WeeklyRow({ def, checked }: { def: WeeklyDefinition; checked: boolean }) {
  const mutate = useMutate();
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const { bursts, push } = useFloatBursts();

  const classLabel = def.classId ? classLabelOf(def.classId) : null;

  const confirm = () => {
    // 与 DailyRow 同一条纪律：飘走的数字取账本差额，不在这里把奖励算第二遍。
    // 周常没有连击加成（streakBonusPerDay 是按天的刻度），所以差额通常就是原值。
    const before = useEarthOnlineStore.getState().save.weeklies.logs[weekKeyOf(now)]?.expEarned ?? 0;

    mutate((s) => checkWeekly(s, def.id, new Date()));
    setConfirming(false);

    const after = useEarthOnlineStore.getState().save;
    const log = after.weeklies.logs[weekKeyOf(now)];
    const streak = after.weeklies.definitions.find((w) => w.id === def.id)?.streak;
    if (log && streak !== undefined) {
      push(`+${log.expEarned - before} EXP · 连击 ${streak} 周`);
    }
  };

  return (
    <li className="relative">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-300 ease-cinematic',
          checked
            ? 'border-amber-400/25 bg-amber-400/[0.07]'
            : 'border-white/10 bg-white/[0.04] hover:border-amber-400/35',
        )}
      >
        <CheckBox
          checked={checked}
          ariaLabel={checked ? `${def.title}（本周已完成）` : `完成 ${def.title}`}
          onPress={() => setConfirming(true)}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-tight text-white/90">{def.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-white/40">
            {classLabel && (
              <span className="rounded border border-abyss-500/30 bg-abyss-500/10 px-1 py-px leading-[1.4] text-abyss-300/90">
                {classLabel}
              </span>
            )}
            <span className="numeric">{def.reward.exp} EXP</span>
            {def.countsForStreak && (
              <span className={cn('numeric', checked ? 'text-amber-400/80' : '')}>
                连击 {def.streak} 周
              </span>
            )}
          </div>
        </div>

        {checked && <span className="shrink-0 text-[10.5px] text-amber-400/70">已完成</span>}
      </div>

      <FloatLayer bursts={bursts} />

      <ConfirmDialog
        open={confirming}
        question="确认完成本周"
        subject={`${def.title}？`}
        detail={
          <>
            奖励 <span className="numeric text-amber-400/90">+{def.reward.exp} EXP</span>
            <br />
            连击将记为 <span className="numeric text-white/70">{def.streak + 1}</span> 周；本周内不做会扣{' '}
            <span className="numeric text-white/60">−{def.penaltyExp} EXP</span>。打钩后本周不可撤销。
          </>
        }
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

/**
 * 写一条周常。
 *
 * 表单只有三个字段，且三档奖励是**预置刻度**而不是自由输入 ——
 * 自由输入会诱导"把数字写大一点反正做不到"；三档把"这条周常有多重"
 * 变成一个先要想清楚的选择（轻 / 中 / 重，各自的定位写在提示里）。
 */
function WeeklyCreateForm({ onDone }: { onDone: () => void }) {
  const save = useSave();
  const mutate = useMutate();
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState<ClassIdLiteral | null>(null);
  const [tier, setTier] = useState<WeeklyRewardTierKey>('medium');

  const ready = title.trim().length > 0;
  const selectedTier = WEEKLY_REWARD_TIERS.find((t) => t.key === tier) ?? WEEKLY_REWARD_TIERS[1];

  const submit = () => {
    if (!ready) return;
    mutate((s) => createWeekly(s, { title: title.trim(), classId, rewardExp: selectedTier.exp }, new Date()));
    onDone();
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={40}
        placeholder="这周结束前，我要做完的那一件事…"
        aria-label="每周任务标题"
        className="w-full rounded-lg border border-white/[0.12] bg-ink-950/45 px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      {/* 归属职业线。通用永远排第一 —— "不给它挂任何线"必须是默认选项 */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ChoiceChip active={classId === null} onClick={() => setClassId(null)}>
          通用
        </ChoiceChip>
        {save.careers.tracks.map((t) => (
          <ChoiceChip key={t.classId} active={classId === t.classId} onClick={() => setClassId(t.classId)}>
            {classLabelOf(t.classId)}
          </ChoiceChip>
        ))}
      </div>

      {/* 三档重量 */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {WEEKLY_REWARD_TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tier === t.key}
            onClick={() => setTier(t.key)}
            className={cn(
              'rounded-lg border px-2 py-2 text-center transition-all duration-300 ease-cinematic',
              tier === t.key
                ? 'border-amber-400/50 bg-amber-400/[0.12]'
                : 'border-white/[0.12] bg-white/[0.03] hover:border-white/25',
            )}
          >
            <div className={cn('text-[12px]', tier === t.key ? 'text-amber-200' : 'text-white/70')}>{t.label}</div>
            <div className="numeric mt-0.5 text-[10.5px] text-white/40">{t.exp} EXP</div>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">{selectedTier.hint}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="glass-pill glass-hover flex-1 py-2 text-[12px] text-white/60"
        >
          算了
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className={cn(
            'flex-[1.4] rounded-lg border py-2 text-[12px] transition-all duration-300 ease-cinematic',
            ready
              ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 hover:scale-[1.02] hover:bg-amber-400/25'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          写下来
        </button>
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
        AI 只会向你推荐，采纳与否在你 —— 但写下来的这支笔，只有你能拿。
      </p>
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] transition-all duration-300 ease-cinematic',
        active
          ? 'border-abyss-400/60 bg-abyss-500/20 text-abyss-300'
          : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 共用件
// ---------------------------------------------------------------------------

function ProgressBar({ ratio }: { ratio: number }) {
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-abyss-500 to-amber-400 transition-all duration-700 ease-cinematic"
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4">
      <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">{text}</p>
    </div>
  );
}
