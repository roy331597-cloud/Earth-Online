import { useMemo, useState } from 'react';
import { GoldMotes } from '@/components/hud/GoldMotes';
import { CHAPTER_CODENAME_CANDIDATES, getChapter } from '@/data/catalog/chapters';
import { cn } from '@/lib/cn';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';
import { dismissChapterCeremony, nameChapter } from '@/store/operations';
import type { ChapterCeremony, ChapterId } from '@/types';

/** 自选代号长度上限。与 operations 的 nameChapter 同一条口径（那边会再切一刀） */
const CUSTOM_MAX = 12;

/**
 * 通关仪式。
 *
 * 这是整个产品里分量最重的一块 UI —— 一生只发生九次（外加一次隐藏），
 * 而它要承担三件事，顺序不能乱：
 *
 *   ① **结算**：这一段路真的走完了。给三个数字，不给评价。
 *      数字要小：三十天、十一条任务、四千多经验。它是"你这段时间在这儿"，
 *      不是"你的成绩单"。
 *
 *   ② **开图**：DAG 在这里分叉。玩家必须**看见**那几条支线是同时打开的 ——
 *      否则"我可以一边科研一边攒钱"这件事，他永远只能从说明书里读到。
 *
 *   ③ **命名**：把命名权交出去。这是这个应用唯一一次把定义权完全让给玩家，
 *      所以它必须是一个可以拒绝的权利 —— 「先跳过」一直摆在旁边，
 *      而不是藏在某个 ✕ 里。命名的权利包含不命名的权利。
 *
 * 视觉上，全屏暗下 + 金色微粒。粒子是**循环**的（animate-gold-drift）：
 * 一次性的光效读起来像加载，持续飘的尘埃才读起来像"这个时刻还没结束"。
 *
 * ⚠️ 挂在 App 根层，不用 createPortal（SSR 的 renderToString 里没有 document）。
 *     它是 z-[90]：在跨天结算（70）与 Agent 遮罩（80）之上 ——
 *     离章这件事不该被"昨天有两项没打钩"打断。
 */
export function ChapterCeremony() {
  const save = useSave();
  const ceremony = save.chapters.pendingCeremony;
  if (!ceremony) return null;
  // key 让"连续两章通关"时组件彻底重挂（阶段回到第一节），而不是带着上一位的输入框
  return <CeremonyStage key={ceremony.at} ceremony={ceremony} />;
}

function CeremonyStage({ ceremony }: { ceremony: ChapterCeremony }) {
  const mutate = useEarthOnlineStore((s) => s.mutate);
  const completed = getChapter(ceremony.completedChapterId);
  const namingId: ChapterId | null = ceremony.namingForChapterId;
  const namingChapter = namingId === null ? undefined : getChapter(namingId);
  const unlocked = ceremony.unlockedChapterIds
    .map((id) => getChapter(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  /** 步骤下标。命名那一步只在真的有交接对象时才存在 */
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  // 有解锁才插"开图"那一屏 —— 空着的一屏会把仪式拖长而不增加任何东西
  const steps = useMemo(
    () => [0, ...(unlocked.length > 0 ? [1] : []), ...(namingId ? [2] : [])],
    [unlocked.length, namingId],
  );
  const at = steps[Math.min(step, steps.length - 1)];
  const last = at === steps[steps.length - 1];

  const finish = () => mutate((s) => dismissChapterCeremony(s, new Date()));

  const confirmName = () => {
    const text = (chosen ?? custom).trim();
    if (namingId === null) {
      finish();
      return;
    }
    if (text.length === 0) {
      finish();
      return;
    }
    // 两步合成一次写入：命名之后紧接着收仪式，中间不落一次盘
    mutate((s) =>
      dismissChapterCeremony(
        nameChapter(s, namingId, text.slice(0, CUSTOM_MAX), chosen ? 'candidate' : 'custom', new Date()),
        new Date(),
      ),
    );
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden px-5">
      {/* 全屏暗下。0.88 是刻意的：背后的场景必须还在，但只能剩一个轮廓 */}
      <div className="absolute inset-0 animate-fade-in bg-ink-950/[0.88]" />

      {/* 中央的金色穹顶光。它让"暗"有了方向，不是一个平地板的黑 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 animate-breathe rounded-full bg-amber-500/[0.07] blur-3xl" />
      </div>

      <GoldMotes seed={ceremony.at} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${ceremony.completedTitle} 完结`}
        className="relative w-full max-w-lg"
      >
        {/* ===================== ① 离章 ===================== */}
        {at === 0 && (
          <section className="animate-fade-up">
            <div className="text-center">
              <div className="text-[10.5px] tracking-[0.32em] text-amber-400/70">
                {ordinalOf(completed?.index)} · 完结
              </div>
              <h2 className="prose-cinematic mt-3 text-[30px] font-medium leading-tight tracking-wide text-white">
                {ceremony.completedTitle}
              </h2>
              {/* 玩家自己给这一章起过的名字，是他自己写给自己的 */}
              {ceremony.completedCodename !== ceremony.completedTitle && (
                <p className="numeric mt-2 text-[12px] tracking-[0.18em] text-amber-300/70">
                  「{ceremony.completedCodename}」
                </p>
              )}
            </div>

            {completed && (
              <p className="prose-cinematic mx-auto mt-5 max-w-[24rem] text-center text-[13px] leading-relaxed text-white/55">
                {completed.epigraph}
              </p>
            )}

            <div className="mt-7 grid grid-cols-3 gap-2">
              <Stat label="在这章里" value={`${ceremony.summary.daysInChapter}`} unit="天" />
              <Stat label="走完的任务" value={`${ceremony.summary.questsCompleted}`} unit="条" />
              <Stat label="得到" value={`${ceremony.summary.expEarned}`} unit="EXP" gold />
            </div>

            {/* 三行都没有一句"你做得很好"——那是判官该说的话，不是这一屏的职责 */}
            <p className="mt-4 text-center text-[11px] text-white/30">
              这些数字不会被比较，也不会被评级。它只是证明你在这里待过。
            </p>
          </section>
        )}

        {/* ===================== ② 开图 ===================== */}
        {at === 1 && (
          <section>
            <div className="animate-fade-up text-center">
              <div className="text-[10.5px] tracking-[0.32em] text-abyss-300/80">
                {unlocked.length > 1 ? `${unlocked.length} 条支线同时打开` : '一条新支线打开'}
              </div>
              <p className="prose-cinematic mt-3 text-[13px] leading-relaxed text-white/55">
                接下来的路不再是单行道。它们并行存在，你可以同时走在几条上面。
              </p>
            </div>

            <ul className="mt-6 space-y-2.5">
              {unlocked.map((c, i) => (
                <li
                  key={c.id}
                  className="glass-deep animate-fade-up flex items-start gap-3 border-abyss-400/25 px-4 py-3.5"
                  style={{ animationDelay: `${140 + i * 130}ms` }}
                >
                  <span className="numeric mt-0.5 shrink-0 text-[10.5px] text-abyss-300/70">
                    {String(c.index).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="prose-cinematic truncate text-[14px] text-white/90">{c.title}</span>
                      <span className="shrink-0 text-[9.5px] text-white/30">{branchLabelOf(c.branch)}</span>
                    </span>
                    <span className="prose-cinematic mt-1 block text-[11.5px] leading-relaxed text-white/45">
                      {c.epigraph}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Ch.4 那种二选一的汇合点值得单独提一句 —— 它是这张图上唯一"选了就变路"的地方 */}
            {unlocked.some((c) => c.isConvergence) && (
              <p className="mt-3 text-center text-[11px] text-abyss-300/70">
                有些章是汇合点：几条线在那边接回来，走哪一条都能到，只是顺序不同。
              </p>
            )}
          </section>
        )}

        {/* ===================== ③ 命名权交接 ===================== */}
        {at === 2 && namingId !== null && (
          <section className="animate-fade-up">
            <div className="text-center">
              <div className="text-[10.5px] tracking-[0.32em] text-amber-400/70">命名权</div>
              <h2 className="prose-cinematic mt-3 text-[22px] font-medium leading-snug tracking-wide text-white">
                接下来这一章，你想叫它什么？
              </h2>
              <p className="prose-cinematic mt-3 text-[12.5px] leading-relaxed text-white/50">
                {namingChapter ? `「${namingChapter.title}」` : '下一章'}
                {ceremony.namingContext ? `　·　${ceremony.namingContext}` : ''}
              </p>
            </div>

            <div className="mt-6 space-y-2">
              {(CHAPTER_CODENAME_CANDIDATES[namingId] ?? []).map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setChosen(c);
                    setCustom('');
                  }}
                  aria-pressed={chosen === c}
                  className={cn(
                    'w-full rounded-xl border px-4 py-3 text-left transition-all duration-300 ease-cinematic',
                    chosen === c
                      ? 'border-amber-400/60 bg-amber-400/[0.13] text-white shadow-glow-gold'
                      : 'border-white/[0.12] bg-white/[0.04] text-white/75 hover:border-white/25 hover:bg-white/[0.07]',
                  )}
                >
                  <span className="prose-cinematic text-[14px] tracking-wide">{c}</span>
                  <span className="ml-2 text-[10.5px] text-white/30">{TONES[i] ?? ''}</span>
                </button>
              ))}
            </div>

            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] tracking-wide text-white/45">或者，自己写一个</span>
                <span className={cn('numeric text-[10px]', custom.length > 0 ? 'text-white/40' : 'text-white/25')}>
                  {custom.length} / {CUSTOM_MAX}
                </span>
              </div>
              <input
                type="text"
                value={custom}
                maxLength={CUSTOM_MAX}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setChosen(null);
                }}
                placeholder="这个词会一直刻在你的铭牌上"
                className="prose-cinematic mt-2 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
              />
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/30">
              起了名之后，它会出现在左上角的铭牌与每一页日记的页眉。
            </p>
          </section>
        )}

        {/* ===================== 行动条 ===================== */}
        <div className="mt-8 flex items-center gap-2.5">
          {at === 2 ? (
            <>
              {/* 「先跳过」始终在旁边，不藏起来：命名的权利包含不命名的权利 */}
              <button
                type="button"
                onClick={finish}
                className="glass-pill glass-hover flex-1 py-2.5 text-[12.5px] text-white/55"
              >
                先跳过
              </button>
              <button
                type="button"
                onClick={confirmName}
                disabled={(chosen ?? custom).trim().length === 0}
                className={cn(
                  'flex-[1.6] rounded-lg border py-2.5 text-[12.5px] font-medium transition-all duration-300 ease-cinematic',
                  (chosen ?? custom).trim().length > 0
                    ? 'border-amber-400/55 bg-amber-400/20 text-amber-100 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/30 active:scale-[0.99]'
                    : 'cursor-not-allowed border-white/[0.12] text-white/25',
                )}
              >
                就叫它这个
              </button>
            </>
          ) : (
            <>
              <span className="numeric text-[10.5px] tracking-[0.2em] text-white/25">
                {step + 1} / {steps.length}
              </span>
              <button
                type="button"
                onClick={() => (last ? finish() : setStep((n) => n + 1))}
                className="ml-auto rounded-lg border border-amber-400/45 bg-amber-400/15 px-6 py-2.5 text-[12.5px] font-medium text-amber-100 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]"
              >
                {last ? '开始下一章' : '继续'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** 一个数字 + 一个量词。金色的位置留给 EXP —— 与 HUD 同一条规矩 */
function Stat({
  label,
  value,
  unit,
  gold = false,
}: {
  label: string;
  value: string;
  unit: string;
  gold?: boolean;
}) {
  return (
    <div className="glass-pill px-3 py-3.5 text-center">
      <div className="text-[10px] tracking-wide text-white/40">{label}</div>
      <div className={cn('numeric mt-1.5 text-[22px] font-semibold leading-none', gold ? 'numeric-gold' : 'text-white')}>
        {value}
      </div>
      <div className="mt-1 text-[10px] text-white/35">{unit}</div>
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

const ordinalOf = (index: number | undefined): string =>
  index === undefined ? '本章' : (ORDINALS[index] ?? `第 ${index} 章`);

const BRANCH_LABELS: Record<string, string> = {
  trunk: '主干',
  academic: '学术支线',
  world: '世界支线',
  capital: '资本支线',
  bond: '关系支线',
};

const branchLabelOf = (branch: string): string => BRANCH_LABELS[branch] ?? '';

/**
 * 三个候选各自的语气。
 *
 * 顺序**不是随意的**：catalog 的候选池按"动作 / 意象 / 状态"三种语气排列
 * （见 catalog/chapters.ts 的注释）。标出来是为了让玩家知道自己挑的不只是
 * 一个词，是**记住这段日子的方式** —— 所以这三个标签必须与池子的排列一一对应，
 * 改池子就要改这里。
 */
const TONES = ['动作', '意象', '状态'];
