import { GoldMotes } from '@/components/hud/GoldMotes';
import { AchievementSigil, TIER_TEXT } from '@/components/ui/AchievementSigil';
import { dismissAchievementOvation, hallOfFameView } from '@/lib/achievementEngine';
import { cn } from '@/lib/cn';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';

/**
 * 金色光晕 · 解锁弹窗。
 *
 * 它做的事只有一件：**在你刚刚做过什么之后，告诉你那件事有名字了。**
 * 所以它不发奖、不给 EXP、不写任何新数值 —— 它只把名字交出来，
 * 然后把那几枚从"待看队列"里划掉（见 achievementEngine 的三条纪律）。
 *
 * ⚠️ 队列是**入存档**的（`unlockables.pendingAchievementIds`）：
 *    刷新一次页面不该让一枚刚点亮的徽记悄无声息地过去。所以这里读的是存档，
 *    而不是某次操作的返回值 —— 关掉网页再回来，它还在这儿等着。
 *
 * ⚠️ z-[88]：在提示条（85）之上，在通关仪式（90）之下。这三者的次序是刻意的 ——
 *    如果某一次点击既通关了一章又点亮了徽记，先发生的是仪式（一生几次的事），
 *    光晕在它背后等着，不会丢；等仪式收走，它自己就浮上来了。
 *
 * ⚠️ 与 ChapterCeremony 一样挂在 App 根层，不用 createPortal
 *    （SSR 的 renderToString 里没有 document）。
 */
export function AchievementOvation() {
  const save = useSave();
  const pending = hallOfFameView(save).pending;
  if (pending.length === 0) return null;

  // key 让"新的几枚"彻底重挂：粒子重新撒一次，淡入重来一遍。
  // 用上墙时刻做种子（不是 Math.random）—— 同一批徽记每次渲染落回同一片星图。
  const seed = pending[0].unlockedAt ?? pending[0].id;
  return <OvationStage key={`${seed}:${pending.length}`} seed={seed} slots={pending} />;
}

function OvationStage({
  seed,
  slots,
}: {
  seed: string;
  slots: ReturnType<typeof hallOfFameView>['pending'];
}) {
  const mutate = useEarthOnlineStore((s) => s.mutate);
  const single = slots.length === 1 ? slots[0] : null;

  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center px-5">
      {/* 比通关仪式浅一档（0.78 vs 0.88）：一枚徽记不该把整个世界关掉 */}
      <div className="absolute inset-0 animate-fade-in bg-ink-950/[0.78]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 animate-breathe rounded-full bg-amber-400/[0.06] blur-3xl" />
      </div>
      <GoldMotes seed={seed} count={14} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={single ? `解锁 ${single.title ?? ''}` : `${slots.length} 枚徽记上墙`}
        className="glass-deep relative w-full max-w-sm animate-pop-in px-5 py-6"
      >
        <div className="text-center">
          <div className="text-[10px] tracking-[0.32em] text-amber-400/70">陈列馆 · 上墙</div>
          {single === null ? (
            <>
              <h2 className="prose-cinematic mt-3 text-[19px] font-medium leading-snug tracking-wide text-white">
                {slots.length} 枚徽记一起上墙
              </h2>
              {/* 一句话交代"为什么一次来这么多"，两种情形都算上：
                  刚刚一起达成的（比如雾散的那一刻），与早就做到、今天才被算上的 */}
              <p className="prose-cinematic mt-2 text-[11.5px] leading-relaxed text-white/45">
                有些是刚刚发生的，有些是你早就做到了、今天才被算上的。
              </p>
            </>
          ) : (
            <>
              <div className="mt-4 flex justify-center">
                <AchievementSigil
                  tier={single.tier}
                  unlocked
                  className="h-11 w-11"
                  glyphClassName="h-5 w-5"
                />
              </div>
              <h2 className="prose-cinematic mt-3.5 text-[21px] font-medium leading-snug tracking-wide text-amber-100">
                {single.title}
              </h2>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className={cn('text-[10px] tracking-wider', TIER_TEXT[single.tier])}>
                  {single.tierLabel}
                </span>
                {single.epithet !== null && (
                  <span className="numeric text-[10px] tracking-[0.14em] text-amber-300/55">
                    {single.epithet}
                  </span>
                )}
              </div>
              {single.epigraph !== null && (
                <p className="prose-cinematic mt-3 text-[12.5px] leading-relaxed text-white/55">
                  {single.epigraph}
                </p>
              )}
            </>
          )}
        </div>

        {/* 一次好几枚的时候，题记要全给 —— 这一屏本来就是为它们存在的。
            但滚动的只有这一块，标题与按钮始终在原位。 */}
        {single === null && (
          <ul className="mt-4 max-h-[44vh] space-y-2 overflow-y-auto pr-1 no-scrollbar">
            {slots.map((slot) => (
              <li key={slot.id} className="flex gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <AchievementSigil tier={slot.tier} unlocked className="h-6 w-6" glyphClassName="h-3 w-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="prose-cinematic truncate text-[13px] text-white/90">{slot.title}</span>
                    <span className={cn('ml-auto shrink-0 text-[9.5px] tracking-wider', TIER_TEXT[slot.tier])}>
                      {slot.tierLabel}
                    </span>
                  </div>
                  {slot.epigraph !== null && (
                    <p className="prose-cinematic mt-0.5 text-[11px] leading-relaxed text-white/45">
                      {slot.epigraph}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => mutate((s) => dismissAchievementOvation(s, new Date()))}
          className="mt-6 w-full rounded-lg border border-amber-400/45 bg-amber-400/15 py-2.5 text-[12.5px] font-medium text-amber-100 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]"
        >
          收下
        </button>
        <p className="mt-2.5 text-center text-[10.5px] text-white/25">
          它会挂在「成就」那一页上，随时可以回去看。
        </p>
      </div>
    </div>
  );
}
