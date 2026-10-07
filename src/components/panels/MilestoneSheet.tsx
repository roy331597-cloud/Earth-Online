import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FREE_MILESTONE_EXP,
  REALITY_MILESTONES,
  REALITY_MILESTONE_CATEGORY_LABELS,
} from '@/data/catalog/milestones';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, localDateKey } from '@/lib/format';
import { activeTrack } from '@/lib/selectors';
import { PhotoPicker, type PhotoDraft } from '@/components/panels/MilestonePhotos';
import { useEarthOnlineStore, useMutate, useSave } from '@/store/useEarthOnlineStore';
import {
  milestoneGate,
  recordCustomMilestone,
  recordRealityMilestone,
  type MilestoneGate,
} from '@/store/operations';
import type {
  ClassIdLiteral,
  MilestoneSnapshot,
  RealityMilestoneCategory,
  RealityMilestoneDefinition,
} from '@/types';

interface MilestoneSheetProps {
  onClose: () => void;
}

const CATEGORY_ORDER: RealityMilestoneCategory[] = ['mobility', 'academic', 'capital', 'life'];

/**
 * 「记录一件事」。
 *
 * 这是全产品**唯一一条不经任务状态机、也不经 AI 的加经验通路** ——
 * 玩家说"这件事发生了"，系统就信。所以它的界面必须把三件事说清楚：
 *
 *   ① **这不是许愿，是记录。** 所以没有"开始做"，只有「记下来」。
 *      日期可以填过去，可以填不清（只留记录时间）。
 *   ② **哪些还能记。** 一次性事件记过就封口（按钮变成「已记录」且不可点），
 *      可重复的有冷却（「还有 173 天」）。拒绝的理由要在**点之前**就说出来，
 *      而不是点完没有任何反应 —— 那是这个应用最不能有的一种沉默。
 *   ③ **额度还剩多少。** 月度封顶之后按钮**依然可用**，只是不再发 EXP ——
 *      PO 的原话是「仅记录事件不发放额外EXP」。记录本身是目的。
 *
 * ⚠️ portal 到 body。它从档案馆里打开，而面板有 backdrop-filter，
 *     就地渲染会被那个包含块和滚动容器一起吃掉（同 ConfirmDialog 的坑）。
 */
export function MilestoneSheet({ onClose }: MilestoneSheetProps) {
  const save = useSave();
  const [category, setCategory] = useState<RealityMilestoneCategory>('mobility');
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * 「自己写一件事」那一格是展开的。
   *
   * 它和目录里的条目**互斥**（打开一个就收起另一个）：屏幕上一次只该有
   * 一件正在写的事 —— 两份表单并排，人就会开始琢磨"我这件到底算哪边"。
   */
  const [customOpen, setCustomOpen] = useState(false);

  const now = new Date();
  const month = localDateKey(now).slice(0, 7);
  const used = save.milestones.monthlyExpGranted[month] ?? 0;
  const cap = save.settings.rewardPolicy.realityMilestoneMonthlyExpCap;
  const capped = used >= cap;

  const list = useMemo(() => REALITY_MILESTONES.filter((m) => m.category === category), [category]);
  const selected = list.find((m) => m.id === openId) ?? null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="记录一件事"
        className="glass-deep relative m-3 flex max-h-[86vh] w-full max-w-[27rem] animate-fade-up flex-col overflow-hidden"
        style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        {/* —— 固定的头 —— */}
        <div className="shrink-0 p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] tracking-[0.18em] text-amber-400/75">现实里程碑</div>
              <h3 className="prose-cinematic mt-1 text-[17px] font-medium tracking-wide text-white">
                记录一件事
              </h3>
              <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/50">
                这里只收真事。它不验证，也没有办法验证 —— 唯一的读者是你自己。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="shrink-0 px-1 text-white/40 transition hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* 月度额度。封顶之后仍然显示 —— 它是"还剩多少"，不是"能不能记" */}
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2.5">
            <span className="text-[10.5px] text-white/45">本月额度</span>
            <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-700 ease-cinematic',
                  capped
                    ? 'bg-gradient-to-r from-amber-600 to-amber-300'
                    : 'bg-gradient-to-r from-abyss-500 to-abyss-300',
                )}
                style={{ width: `${Math.min(100, (used / Math.max(1, cap)) * 100)}%` }}
              />
            </div>
            <span className="numeric shrink-0 text-[10.5px] text-white/55">
              {used} / {cap}
            </span>
          </div>

          {capped && (
            <p className="prose-cinematic mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
              本月现实里程碑经验已达峰，仅记录事件不发放额外 EXP。
              写下来这件事本身还会照常发生。
            </p>
          )}

          {/* 类别筛选。四类里「生活本身」不在 PO 列的三个之内，但它是目录里真实存在的一栏 */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setOpenId(null);
                }}
                aria-pressed={category === c}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-all duration-300 ease-cinematic',
                  category === c
                    ? 'border-amber-400/50 bg-amber-400/[0.12] text-amber-100'
                    : 'border-white/[0.12] text-white/50 hover:border-white/25 hover:text-white/80',
                )}
              >
                {REALITY_MILESTONE_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px shrink-0 bg-white/10" />

        {/* —— 正文 —— */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {selected ? (
            <EntryForm def={selected} onDone={() => setOpenId(null)} />
          ) : customOpen ? (
            <CustomEntryForm onDone={() => setCustomOpen(false)} />
          ) : (
            <>
              {/* 自己写一件事 —— **排在最上面**。
                  目录是这个产品预设的路径，而人的现实不照着目录长；
                  如果这一格藏在列表尾巴上，它等于不存在。 */}
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="w-full rounded-xl border border-dashed border-amber-400/35 bg-amber-400/[0.05] p-3.5 text-left transition-all duration-300 ease-cinematic hover:border-amber-400/60 hover:bg-amber-400/[0.1]"
              >
                <span className="text-[12.5px] tracking-wide text-amber-100/90">＋ 自己写一件事</span>
                <span className="prose-cinematic mt-1 block text-[10.5px] leading-relaxed text-white/40">
                  目录里没有的，不代表它不算数。写你觉得值得留下的那件。
                </span>
              </button>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[10px] tracking-[0.18em] text-white/35">或者，从下面挑一件</span>
              </div>

              <ul className="mt-2 space-y-2">
                {list.map((m) => (
                  <MilestoneRow key={m.id} def={m} onPick={() => setOpenId(m.id)} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------

/**
 * 一行一条可记的事。
 *
 * 状态用**按钮本身**表达，而不是另起一列标签：能记的是一颗金边按钮，
 * 记过的是一行灰字，冷却中的写着还剩几天。玩家扫一眼就知道哪些是活的。
 */
function MilestoneRow({ def, onPick }: { def: RealityMilestoneDefinition; onPick: () => void }) {
  const save = useSave();
  const gate = milestoneGate(save, def.id, new Date());
  const counter = save.milestones.counters[def.id];

  return (
    <li
      className={cn(
        'rounded-xl border p-3.5 transition-colors duration-300',
        gate.ok ? 'border-white/[0.1] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[12.5px] tracking-wide',
            gate.ok ? 'text-white/90' : 'text-white/45',
          )}
        >
          {def.title}
        </span>
        {/* 「第 2 次」说的是你已经走到哪了 —— 比一个"可重复"标签有用得多 */}
        {def.repeatable && counter && counter.count > 0 && (
          <span className="numeric shrink-0 text-[9.5px] text-abyss-300/80">
            第 {counter.count + 1} 次
          </span>
        )}
        <span className="numeric shrink-0 text-[10.5px] text-amber-300/70">+{def.exp}</span>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-white/40">{def.subtitle}</p>

      <div className="mt-2.5 flex items-center gap-2">
        {gate.ok ? (
          <>
            <button
              type="button"
              onClick={onPick}
              className="rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-3.5 py-1.5 text-[11.5px] text-amber-100 transition-all duration-300 ease-cinematic hover:bg-amber-400/[0.22] active:scale-[0.98]"
            >
              记下来
            </button>
            {/* 额度已被占满时先说清楚：这条记下去不会加经验 */}
            {gate.cappedByMonth && (
              <span className="text-[10px] leading-tight text-white/35">
                本月额度只剩 {gate.expGranted} EXP
              </span>
            )}
          </>
        ) : (
          <span className="text-[10.5px] text-white/35">
            {gate.reason === 'cooldown'
              ? `${gate.detail}`
              : '已经记下了。它只会发生一次。'}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * 录入表单。
 *
 * 只问三件必要的事：什么时候发生的、发生了什么、有没有留一张图。
 * 刻意**不做**成"填写表单"的样子 —— 它更像写一句话，
 * 因为这条通路真正收集的东西只有那句话。
 */
function EntryForm({ def, onDone }: { def: RealityMilestoneDefinition; onDone: () => void }) {
  const mutate = useMutate();
  const save = useSave();
  const today = localDateKey(new Date());

  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [result, setResult] = useState<{ exp: number; goals: string[] } | null>(null);

  const gate: MilestoneGate = milestoneGate(save, def.id, new Date());
  const canSubmit = note.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;

    const snapshots = [...photoSnapshots(photos), ...linkSnapshots(link)];

    mutate((s) =>
      recordRealityMilestone(
        s,
        { definitionId: def.id, occurredOn, note: note.trim(), snapshots },
        new Date(),
      ),
    );

    // 结果取自**刚写进存档的那一条**，不在这里把额度再算一遍 ——
    // 屏幕上显示的 EXP 与实际入账的 EXP 因此不可能对不上（同 TurnInSheet 的纪律）。
    // 取"最后一条同定义的记录"而不是按日期找：可重复的条目一天里也能记两次。
    const records = useEarthOnlineStore.getState().save.milestones.records;
    const written = [...records].reverse().find((r) => r.definitionId === def.id);
    setResult({ exp: written?.expGranted ?? 0, goals: written?.goalMilestoneIds ?? [] });
  };

  if (result) {
    return (
      <div className="animate-fade-up">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />
          <span className="text-[11px] tracking-[0.18em] text-amber-400/90">已记下</span>
        </div>
        <h4 className="prose-cinematic mt-2 text-[16px] font-medium tracking-wide text-white">
          {def.title}
        </h4>

        <div className="mt-3.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
          {result.exp > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="numeric-gold text-[24px] font-semibold leading-none">+{result.exp}</span>
              <span className="text-[11px] text-white/55">EXP</span>
              {gate.ok && result.exp < def.exp && (
                <span className="ml-auto text-[10.5px] text-white/40">（受本月额度限制）</span>
              )}
            </div>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-white/60">
              本月现实里程碑经验已达峰，这一条只记下了事件，没有发放额外 EXP。
            </p>
          )}
          {gate.ok && gate.creditedClassId && result.exp > 0 && (
            <p className="mt-1.5 text-[10.5px] text-white/40">
              经验记进了{
                save.careers.tracks.find((t) => t.classId === gate.creditedClassId)?.displayName ?? '相关职业线'
              }
              。
            </p>
          )}
        </div>

        {result.goals.length > 0 && (
          <p className="prose-cinematic mt-3 text-[11.5px] leading-relaxed text-abyss-300/85">
            它同时点亮了圣殿里的一格里程碑 —— 那件很远的事，从此有了一个坐标。
          </p>
        )}

        <p className="prose-cinematic mt-3 border-l-2 border-amber-400/25 pl-2.5 text-[11.5px] leading-relaxed text-white/45">
          它现在收在档案馆的里程碑墙上。照片可以过几天补 —— 事情发生的当时你往往在忙。
        </p>

        <button
          type="button"
          onClick={onDone}
          className="mt-4 w-full rounded-lg border border-white/20 bg-white/[0.06] py-2.5 text-[12.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/40 hover:text-white active:scale-[0.99]"
        >
          好
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <button
        type="button"
        onClick={onDone}
        className="text-[11px] text-white/40 transition hover:text-white/70"
      >
        ← 换一件事
      </button>

      <h4 className="prose-cinematic mt-2.5 text-[16px] font-medium tracking-wide text-white">
        {def.title}
      </h4>
      <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/45">{def.subtitle}</p>

      <label className="mt-4 block">
        <span className="text-[11px] tracking-wide text-white/55">什么时候发生的</span>
        <input
          type="date"
          value={occurredOn}
          max={today}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="numeric mt-1.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[12px] text-white focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
        <span className="mt-1 block text-[10px] text-white/30">
          记不清就留着今天 —— 它只影响时间轴上的位置，不影响别的。
        </span>
      </label>

      <label className="mt-3.5 block">
        <span className="text-[11px] tracking-wide text-white/55">发生了什么</span>
        <textarea
          rows={3}
          value={note}
          maxLength={280}
          onChange={(e) => setNote(e.target.value)}
          placeholder={def.evidenceHint}
          className="prose-cinematic mt-1.5 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
        <span className="numeric mt-1 block text-right text-[10px] text-white/25">
          {note.length} / 280
        </span>
      </label>

      <PhotoPicker photos={photos} onChange={setPhotos} />

      <label className="mt-2 block">
        <span className="text-[11px] tracking-wide text-white/55">留个链接（选填）</span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="图床或云盘地址，存不下的大图放这里"
          className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </label>

      <div className="mt-4 flex items-center gap-2">
        <span className="numeric text-[11px] text-amber-300/75">
          {gate.ok ? `+${gate.expGranted} EXP` : '不发经验'}
        </span>
        {occurredOn !== today && (
          <span className="text-[10.5px] text-white/35">{formatDateKeyCN(occurredOn)} 发生</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || !gate.ok}
          className={cn(
            'ml-auto rounded-lg border px-5 py-2.5 text-[12.5px] font-medium transition-all duration-300 ease-cinematic',
            canSubmit && gate.ok
              ? 'border-amber-400/55 bg-amber-400/[0.18] text-amber-100 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/[0.28] active:scale-[0.99]'
              : 'cursor-not-allowed border-white/[0.12] text-white/25',
          )}
        >
          记下来
        </button>
      </div>
      {!canSubmit && (
        <p className="mt-1.5 text-right text-[10px] text-white/25">
          写一句"发生了什么"就能记 —— 不写的话，一年后你也想不起这是哪件事。
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 自己写的一件事
// ---------------------------------------------------------------------------

/** 表单里的草稿图 → 落库的快照。`addedAt` 到这一刻才算数 */
const photoSnapshots = (photos: readonly PhotoDraft[]): MilestoneSnapshot[] =>
  photos.map((p) => ({
    kind: 'photo' as const,
    url: p.url,
    caption: null,
    addedAt: new Date().toISOString(),
  }));

const linkSnapshots = (link: string): MilestoneSnapshot[] => {
  const url = link.trim();
  if (!url.startsWith('http')) return [];
  return [{ kind: 'link' as const, url, caption: null, addedAt: new Date().toISOString() }];
};

/**
 * 自己写一件事。
 *
 * 与 `EntryForm`（从目录里挑一条）的分工：那张表单里每个字都是预先写好的，
 * 玩家只是填空；这张表单里，**除了额度之外每个字都是他自己的**。
 *
 * 所以它长得不一样 —— 只有三样必答（标题、哪一类、什么时候），
 * 描述 / 照片 / 算进哪条线全都可以留空。留空不是"没填完"：
 * 记下来的那一刻，人常常只记得住一句话。
 */
function CustomEntryForm({ onDone }: { onDone: () => void }) {
  const save = useSave();
  const mutate = useMutate();
  const today = localDateKey(new Date());
  const currentTrack = activeTrack(save);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RealityMilestoneCategory>('life');
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [trackId, setTrackId] = useState<ClassIdLiteral | null>(currentTrack?.classId ?? null);
  const [result, setResult] = useState<
    { exp: number; limited: boolean; trackName: string | null; photos: number } | null
  >(null);

  const month = today.slice(0, 7);
  const used = save.milestones.monthlyExpGranted[month] ?? 0;
  const cap = save.settings.rewardPolicy.realityMilestoneMonthlyExpCap;
  const willGrant = Math.min(FREE_MILESTONE_EXP, Math.max(0, cap - used));
  const ready = title.trim().length > 0;

  const submit = () => {
    if (!ready) return;
    mutate((s) =>
      recordCustomMilestone(
        s,
        {
          title,
          category,
          occurredOn,
          note,
          snapshots: [...photoSnapshots(photos), ...linkSnapshots(link)],
          creditedClassId: trackId,
        },
        new Date(),
      ),
    );

    // 结果取自**刚写进存档的那一条**，不在这里把额度再算一遍
    // —— 屏幕上显示的 EXP 与实际入账的 EXP 因此不可能对不上（同 EntryForm 的纪律）。
    // 自定义条目是 definitionId 为 null 的那些，倒着找第一条就是它。
    const records = useEarthOnlineStore.getState().save.milestones.records;
    const written = [...records].reverse().find((r) => r.definitionId === null);
    setResult({
      exp: written?.expGranted ?? 0,
      // "受了额度限制"必须在这里定下来：提交之后 used 已经变了，
      // 到结果页再算一遍会得出一句反过来话的提示
      limited: (written?.expGranted ?? 0) < FREE_MILESTONE_EXP,
      trackName: written?.creditedClassId
        ? save.careers.tracks.find((t) => t.classId === written.creditedClassId)?.displayName ?? null
        : null,
      photos: written?.snapshots.filter((s) => s.kind === 'photo').length ?? 0,
    });
  };

  if (result) {
    return (
      <div className="animate-fade-up">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />
          <span className="text-[11px] tracking-[0.18em] text-amber-400/90">已记下</span>
        </div>
        <h4 className="prose-cinematic mt-2 text-[16px] font-medium tracking-wide text-white">
          {title.trim()}
        </h4>

        <div className="mt-3.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
          {result.exp > 0 ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="numeric-gold text-[24px] font-semibold leading-none">+{result.exp}</span>
                <span className="text-[11px] text-white/55">EXP</span>
                {result.limited && (
                  <span className="ml-auto text-[10.5px] text-white/40">（受本月额度限制）</span>
                )}
              </div>
              {result.trackName && (
                <p className="mt-1.5 text-[10.5px] text-white/40">经验记进了{result.trackName}。</p>
              )}
            </>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-white/60">
              本月现实里程碑经验已达峰，这一条只记下了事件，没有发放额外 EXP。
            </p>
          )}
        </div>

        {result.photos > 0 && (
          <p className="prose-cinematic mt-3 text-[11.5px] leading-relaxed text-abyss-300/85">
            {result.photos} 张图已经压进存档，钉在这条记录上。
          </p>
        )}

        <p className="prose-cinematic mt-3 border-l-2 border-amber-400/25 pl-2.5 text-[11.5px] leading-relaxed text-white/45">
          它现在收在档案馆的里程碑墙上，和目录里那些事钉在同一面墙 —— 没有区别。
        </p>

        <button
          type="button"
          onClick={onDone}
          className="mt-4 w-full rounded-lg border border-white/20 bg-white/[0.06] py-2.5 text-[12.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/40 hover:text-white active:scale-[0.99]"
        >
          好
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <button
        type="button"
        onClick={onDone}
        className="text-[11px] text-white/40 transition hover:text-white/70"
      >
        ← 回目录
      </button>

      <h4 className="prose-cinematic mt-2.5 text-[16px] font-medium tracking-wide text-white">
        自己写一件事
      </h4>
      <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/45">
        标题自己起 —— 写得像你会说的话，别像一条待办。
      </p>

      <label className="mt-3.5 block">
        <span className="text-[11px] tracking-wide text-white/55">这件事是什么</span>
        <input
          type="text"
          value={title}
          autoFocus
          maxLength={40}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="这件事的标题"
          placeholder="比如：第一次自己开完一场会"
          className="prose-cinematic mt-1.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3.5 py-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </label>

      <div className="mt-3">
        <span className="text-[11px] tracking-wide text-white/55">算哪一类</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] transition-all duration-300 ease-cinematic',
                category === c
                  ? 'border-amber-400/50 bg-amber-400/[0.12] text-amber-100'
                  : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
              )}
            >
              {REALITY_MILESTONE_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3.5 block">
        <span className="text-[11px] tracking-wide text-white/55">什么时候发生的</span>
        <input
          type="date"
          value={occurredOn}
          max={today}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="numeric mt-1.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[12px] text-white focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </label>

      <label className="mt-3.5 block">
        <span className="text-[11px] tracking-wide text-white/55">多写几句（选填）</span>
        <textarea
          rows={3}
          value={note}
          maxLength={280}
          onChange={(e) => setNote(e.target.value)}
          placeholder="当时是什么感觉、谁在场、哪一句话让你记住了这件事。"
          className="prose-cinematic mt-1.5 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </label>

      <PhotoPicker photos={photos} onChange={setPhotos} />

      <label className="mt-3 block">
        <span className="text-[11px] tracking-wide text-white/55">留个链接（选填）</span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="图床或云盘地址，存不下的大图放这里"
          className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </label>

      {/* 这笔经验记进哪条线。默认是**你此刻正在走的那条** ——
          自定义条目没有目标对齐分可算，所以这个选择交回给玩家 */}
      {save.careers.tracks.length > 0 && (
        <div className="mt-3">
          <span className="text-[11px] tracking-wide text-white/55">经验算进哪条线</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {save.careers.tracks.map((t) => (
              <button
                key={t.classId}
                type="button"
                aria-pressed={trackId === t.classId}
                onClick={() => setTrackId(t.classId)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[11px] transition-all duration-300 ease-cinematic',
                  trackId === t.classId
                    ? 'border-abyss-400/50 bg-abyss-500/15 text-abyss-300'
                    : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
                )}
              >
                {t.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <span className="numeric text-[11px] text-amber-300/75">
          {willGrant > 0 ? `+${willGrant} EXP` : '不发经验'}
        </span>
        {willGrant < FREE_MILESTONE_EXP && (
          <span className="text-[10.5px] text-white/35">本月额度只剩 {willGrant}</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className={cn(
            'ml-auto rounded-lg border px-5 py-2.5 text-[12.5px] font-medium transition-all duration-300 ease-cinematic',
            ready
              ? 'border-amber-400/55 bg-amber-400/[0.18] text-amber-100 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/[0.28] active:scale-[0.99]'
              : 'cursor-not-allowed border-white/[0.12] text-white/25',
          )}
        >
          记下来
        </button>
      </div>
      {!ready && (
        <p className="mt-1.5 text-right text-[10px] text-white/25">
          起个标题就能记 —— 一句话也行。
        </p>
      )}
    </div>
  );
}
