import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { formatDateKeyCN } from '@/lib/format';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';
import type { RolloverResult, WeeklyRolloverResult } from '@/types';

/**
 * 跨天 / 跨周结算浮层。
 *
 * 两个结算共用这一张卡、**分节展示**（每天一节「昨日结算」，每周一节「上周结算」）——
 * 周一凌晨跨天时会同时触发两者，一前一后跳两个浮层会像系统弹窗；
 * 一封信里两段话，才是这件事该有的分量。
 *
 * 这份文案有一条不能破的规矩：**正面在前，缺漏在后，且不许有第二人称的指责。**
 * 「你有 1 项没打钩」可以，「你又偷懒了」不行 —— 一个自我管理工具对使用者
 * 施加羞耻感，只会让人下一次不敢打开它。所以：
 *
 *   · 第一个数字永远是**保住了多少**，不是漏了多少；
 *   · 漏掉的那项只陈述事实（"没有打钩"），不解释成态度问题；
 *   · 连击断了说成「停在 14 天」——那是它真实发生过的长度，不是归零的失败；
 *   · 结尾一句把话收住：你并不是什么都没做，你只是有一件事没做。
 *
 * 它渲染在 App 的根层（不在任何面板里），所以不会被面板的 backdrop-filter
 * 关进包含块 —— 这里**不能**用 createPortal：SSR 冒烟测试会用
 * renderToString 真渲染一次 App，而那份环境里没有 document。
 */
export function RolloverNotice() {
  const save = useSave();
  const dismiss = useEarthOnlineStore((s) => s.dismissRollover);
  const result = save.dailies.pendingRolloverNotice;
  const weekly = save.weeklies.pendingWeeklyNotice;

  // ESC 收起来。面板那边也挂了同一条键，同时按到不会有副作用（那边只是关面板）
  useEffect(() => {
    if (!result && !weekly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, weekly, dismiss]);

  if (!result && !weekly) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5">
      {/* 点哪儿都能收起来。它不是需要"确认"的对话框，只是一句话 */}
      <button
        type="button"
        aria-label="收起结算提示"
        onClick={dismiss}
        className="absolute inset-0 animate-fade-in bg-ink-950/55"
      />
      <div
        role="status"
        className="glass-deep animate-fade-up relative max-h-[86vh] w-full max-w-md overflow-y-auto border-white/[0.14] p-5 no-scrollbar"
      >
        {/* ------------------------------ 昨日 ------------------------------ */}
        {result && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[10.5px] tracking-[0.18em] text-amber-400/80">昨日结算</span>
              <span className="numeric text-[10.5px] text-white/35">
                {formatDateKeyCN(result.fromLocalDate)}
              </span>
            </div>

            <p className="mt-2 text-[14px] leading-relaxed text-white/85">{leadLine(result)}</p>

            {/* 保住的那部分 —— 有才写，没有不写一句"你什么都没保住" */}
            {result.keptStreakCount > 0 && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-abyss-300/85">
                其中 <span className="numeric">{result.keptStreakCount}</span> 项的连击继续往下走。
              </p>
            )}

            {result.missed.length > 0 && (
              <MissList
                items={result.missed.map((m) => ({ id: m.id, title: m.title, penaltyExp: m.penaltyExp, whenLabel: '昨天没有打钩' }))}
              />
            )}

            {result.brokenStreaks.length > 0 && (
              <p className="mt-3 text-[11.5px] leading-relaxed text-white/45">
                {result.brokenStreaks.map((b) => `${b.title} 的连击停在 ${b.streakLost} 天`).join('；')}
                。它记着那个长度，从这里重新数。
              </p>
            )}

            <NetRow label={`${formatDateKeyCN(result.fromLocalDate)} 净收`} net={result.netExp} />
          </>
        )}

        {/* ------------------------------ 上周 ------------------------------ */}
        {weekly && (
          <div className={cn(result && 'mt-4 border-t border-white/[0.08] pt-3.5')}>
            <div className="flex items-baseline gap-2">
              <span className="text-[10.5px] tracking-[0.18em] text-abyss-300/85">上周结算</span>
              <span className="numeric text-[10.5px] text-white/35">
                {formatDateKeyCN(weekly.weekStart)} – {formatDateKeyCN(weekly.weekEnd)}
              </span>
            </div>

            <p className="mt-2 text-[14px] leading-relaxed text-white/85">{weeklyLeadLine(weekly)}</p>

            {weekly.keptStreakCount > 0 && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-abyss-300/85">
                其中 <span className="numeric">{weekly.keptStreakCount}</span> 条的周连击继续往下走。
              </p>
            )}

            {weekly.missed.length > 0 && (
              <MissList
                items={weekly.missed.map((m) => ({ id: m.id, title: m.title, penaltyExp: m.penaltyExp, whenLabel: '上周没有打钩' }))}
              />
            )}

            {weekly.brokenStreaks.length > 0 && (
              <p className="mt-3 text-[11.5px] leading-relaxed text-white/45">
                {weekly.brokenStreaks.map((b) => `${b.title} 的连击停在 ${b.streakLost} 周`).join('；')}
                。它记着那个长度，从这周重新数。
              </p>
            )}

            <NetRow label="上周净收" net={weekly.netExp} />
          </div>
        )}

        <div className="mt-3.5 flex border-t border-white/[0.08] pt-3">
          <button
            type="button"
            onClick={dismiss}
            className="glass-pill glass-hover ml-auto px-3 py-1.5 text-[11.5px] text-white/70"
          >
            {result ? '开始今天' : '开始这一周'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MissItem {
  id: string;
  title: string;
  penaltyExp: number;
  whenLabel: string;
}

function MissList({ items }: { items: MissItem[] }) {
  return (
    <ul className="mt-3.5 space-y-1.5">
      {items.map((m) => (
        <li
          key={m.id}
          className="flex items-baseline gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/70">
            {m.title} · {m.whenLabel}
          </span>
          <span className="numeric shrink-0 text-[11.5px] text-white/45">−{m.penaltyExp} EXP</span>
        </li>
      ))}
    </ul>
  );
}

/** 净变化。四舍五入到整数：EXP 本来就只是量级，不是账目 */
function NetRow({ label, net }: { label: string; net: number }) {
  return (
    <div className="mt-3.5 flex items-center gap-2 border-t border-white/[0.08] pt-3">
      <span className="text-[11px] text-white/40">{label}</span>
      <span className={cn('numeric text-[13px]', net >= 0 ? 'text-amber-300/90' : 'text-white/60')}>
        {net >= 0 ? '+' : '−'}
        {Math.abs(Math.round(net))} EXP
      </span>
    </div>
  );
}

/** 第一句。**先报保住的，再报漏掉的** —— 顺序本身就是态度 */
function leadLine(result: RolloverResult): string {
  const missed = result.missed.length;
  if (missed === 0) {
    return `${formatDateKeyCN(result.fromLocalDate)} 全部打满了，一件没落。`;
  }
  const kept = result.keptStreakCount;
  if (kept === 0) {
    return `昨天有 ${missed} 项没有打钩。`;
  }
  return `昨天有 ${missed} 项没有打钩 —— 你并不是什么都没做，你只是有一件事没做。`;
}

/** 周版第一句。同一套语气，尺度从"一天"换成"一周" */
function weeklyLeadLine(weekly: WeeklyRolloverResult): string {
  const missed = weekly.missed.length;
  if (missed === 0) {
    return '上周的周常全部走完了，一件没落。';
  }
  const kept = weekly.keptStreakCount;
  if (kept === 0) {
    return `上周有 ${missed} 件没有打钩。`;
  }
  return `上周有 ${missed} 件没有打钩 —— 一周里做成的事，不会因为漏了一件就消失。`;
}
