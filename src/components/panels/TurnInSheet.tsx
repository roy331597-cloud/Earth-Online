import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatLayer, useFloatBursts } from '@/components/ui/ExpFloat';
import { InlineError } from '@/components/ui/InlineError';
import { attributeLabels } from '@/data/catalog/attributes';
import { bonusBandFor, bonusForQuality } from '@/data/catalog/policy';
import { useAgentAction } from '@/hooks/useAgentAction';
import { formatUsd } from '@/lib/format';
import { previewQuality } from '@/lib/mockArbiter';
import { thunks } from '@/store/agentRuntime';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';
import type { Quest } from '@/types';

interface TurnInSheetProps {
  /** 待结算的任务。提交后状态会变成 completed，但面板要留住以便展示结算结果 */
  quest: Quest;
  onClose: () => void;
}

/**
 * 结算面板。
 *
 * 它是整个产品里**唯一**允许"AI 参与裁决"的地方，因此界面上必须让玩家看懂
 * 钱是怎么来的：
 *   留空     → 基础奖励，bonusPct = 0，不产生成功日记条目；
 *   写了内容 → Arbiter 判档 → 按难度区间对齐加成 → 落一条成功日记。
 *
 * 提交后不停在输入态、也不直接关掉，而是**原地换成结算结果**：
 * 「基础 320 → 结算 346（+8%）」这一行，是复盘这件事值不值得写的最佳说明。
 */
export function TurnInSheet({ quest, onClose }: TurnInSheetProps) {
  const { busy, error, run, clearError } = useAgentAction();
  const [reflection, setReflection] = useState('');
  const [settled, setSettled] = useState(false);
  /** 这次结算让待分配池涨了多少（含升级发的点）。0 = 这条没带点 */
  const [grantedPoints, setGrantedPoints] = useState(0);
  const { bursts, push } = useFloatBursts();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // 政策里的字数下限读存档，不写死 —— 玩家在设置里调过之后，这里的提示要跟着变
  const floor = useEarthOnlineStore((s) => s.save.settings.rewardPolicy.reflectionWordCountFloor);
  const chars = reflection.replace(/\s/g, '').length;
  const band = bonusBandFor(quest.difficulty);
  /**
   * 「有洞见」档位在该难度下的规范值。**不要写死 8** ——
   * sharp 档取的是区间 60% 处，难度 1/2/3/4/5 依次是 8/8/9/10/14。
   * 写死的话，高难度任务会提示 8% 却实发 10%，正是这套策略最想避免的那种漂移。
   */
  const sharpPct = bonusForQuality('sharp', band);
  const grant = quest.grant;

  useEffect(() => {
    // 只读一次当前值来定位光标，不参与后续渲染
    if (!settled) areaRef.current?.focus();
  }, [settled]);

  /**
   * 提交结算。
   *
   * 判官（Arbiter）现在是真的：`judgeTurnIn` 会走总线、校验、再落账。
   * 但**这里读结果的姿势一个字没变** —— 仍然是"结算前后的账本差额"，
   * 而不是把加成算第二遍。理由与 Phase 3 时一样：mutate 是同步的，
   * thunk 回来时落库已经结束，此刻 getState() 读到的就是结算结果，
   * 屏幕上飘的数字与实际入账的数字因此不可能对不上。
   */
  const submit = () => {
    if (busy) return;
    void run(async () => {
      const beforePoints = useEarthOnlineStore.getState().save.player.freeAttributePoints;

      const result = await thunks.judgeTurnIn({ questId: quest.id, reflection });
      if (!result.ok) return result;

      setSettled(true);

      const after = useEarthOnlineStore.getState().save;
      const written = after.quests.byId[quest.id];
      const exp = written?.grant?.final.exp;
      if (exp !== undefined) push(`+${exp} EXP`);

      setGrantedPoints(after.player.freeAttributePoints - beforePoints);
      return result;
    });
  };

  // 与 ConfirmDialog 同理：必须 portal 到 body，否则会被面板的 backdrop-filter
  // 夺走 fixed 的包含块，再被滚动容器裁掉（详见 ConfirmDialog 的注释）
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="关闭结算面板"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        className={[
          'glass-deep relative m-3 w-full max-w-[26rem] animate-fade-up overflow-hidden',
          settled ? 'shadow-glow-gold-lg' : '',
        ].join(' ')}
        style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <FloatLayer bursts={bursts} />

        {/* ------------------------------ 待结算 ------------------------------ */}
        {!settled ? (
          <div className="max-h-[76vh] overflow-y-auto p-5 no-scrollbar">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {quest.chain && (
                  <div className="text-[11px] tracking-wider text-abyss-300/80">
                    {quest.chain.chainTitle} · 第 {quest.chain.index + 1}/{quest.chain.total} 步
                  </div>
                )}
                <h3 className="prose-cinematic mt-1 text-[17px] font-medium tracking-wide text-white">
                  {quest.title}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-white/55">{quest.objective}</p>
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

            {/* 基础奖励 */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <div className="text-[10.5px] tracking-[0.18em] text-white/40">基础奖励</div>
              <div className="mt-2 flex items-baseline gap-4">
                <div>
                  <div className="numeric text-[20px] font-semibold leading-none text-white">
                    {quest.reward.exp}
                  </div>
                  <div className="mt-1 text-[10.5px] text-white/40">EXP</div>
                </div>
                {quest.reward.vaultUsdCents !== undefined && (
                  <div>
                    <div className="numeric-gold text-[20px] font-semibold leading-none">
                      {formatUsd(quest.reward.vaultUsdCents)}
                    </div>
                    <div className="mt-1 text-[10.5px] text-white/40">入账</div>
                  </div>
                )}
              </div>
            </div>

            {/* 复盘输入 */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <label htmlFor="turnin-reflection" className="text-[11.5px] tracking-wide text-white/60">
                  复盘（选填）
                </label>
                <span className="numeric text-[10.5px] text-white/35">
                  {chars} / {floor} 字
                </span>
              </div>
              <textarea
                id="turnin-reflection"
                ref={areaRef}
                rows={4}
                value={reflection}
                maxLength={1200}
                onChange={(e) => setReflection(e.target.value)}
                placeholder={`记录本次任务的突破、顿悟或阻碍...（选填，输入可获 ${band.minPct}%~${band.maxPct}% 动态加成）`}
                className="mt-2 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/45 px-3.5 py-3 text-[12.5px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
              />

              {/* 实时档位预览：与真身同一套策略，不会出现"提示 8% 实际给 6%" */}
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                {chars === 0 ? (
                  <span className="text-white/35">留空即按基础奖励结算，不产生日记条目。</span>
                ) : previewQuality(chars, floor) === 'sharp' ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />
                    <span className="text-amber-400/90">已达「有洞见」档位，预计加成 {sharpPct}%</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-abyss-400" />
                    <span className="text-abyss-300/90">
                      再加 {floor - chars} 字可达更高档位（当前约 {band.minPct}%）
                    </span>
                  </>
                )}
              </div>
            </div>

            {error && <InlineError message={error} onDismiss={clearError} />}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="glass-pill glass-hover flex-1 py-2.5 text-[12.5px] text-white/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                稍后再说
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="flex-[1.4] rounded-lg border border-amber-400/50 bg-amber-400/15 py-2.5 text-[12.5px] font-medium text-amber-200 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? '判官正在过目…' : '提交结算'}
              </button>
            </div>
          </div>
        ) : (
          /* ------------------------------ 结算结果 ------------------------------ */
          <div className="p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />
              <span className="text-[11px] tracking-[0.18em] text-amber-400/90">已结算</span>
            </div>
            <h3 className="prose-cinematic mt-2 text-[17px] font-medium tracking-wide text-white">
              {quest.title}
            </h3>

            {grant && (
              <>
                {/* 基础 → 结算 的对照。玩家一眼看懂复盘换来了什么 */}
                <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="numeric text-[15px] text-white/45 line-through">
                      {grant.base.exp}
                    </span>
                    <span className="text-white/25">→</span>
                    <span className="numeric text-[26px] font-semibold leading-none text-amber-400">
                      {grant.final.exp}
                    </span>
                    <span className="text-[11px] text-white/50">EXP</span>
                    {grant.bonusPct > 0 && (
                      <span className="numeric-gold ml-auto text-[13px] font-semibold">
                        +{grant.bonusPct}%
                      </span>
                    )}
                  </div>
                  {grant.final.vaultUsdCents !== undefined && grant.final.vaultUsdCents > 0 && (
                    <div className="numeric-gold mt-2.5 text-[15px] font-semibold">
                      {formatUsd(grant.final.vaultUsdCents)}
                      <span className="ml-1 text-[10.5px] font-normal text-white/40">已入账</span>
                    </div>
                  )}
                </div>

                {/* Arbiter 的一句话点评 */}
                {grant.bonusReason && (
                  <div className="mt-3.5 border-l-2 border-abyss-500/60 pl-3">
                    <div className="text-[10.5px] tracking-wider text-abyss-300/80">判定</div>
                    <p className="prose-cinematic mt-1 text-[12.5px] leading-relaxed text-white/75">
                      {grant.bonusReason}
                    </p>
                  </div>
                )}

                <div className="mt-3.5 flex items-center gap-2 text-[11px] text-white/45">
                  {quest.journalEntryId ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-amber-400/70" />
                      已存入成功日记 · {quest.journalEntryId}
                    </>
                  ) : (
                    <>
                      <span className="h-1 w-1 rounded-full bg-white/25" />
                      未写复盘，本次不产生日记条目
                    </>
                  )}
                </div>
              </>
            )}

            {/* 属性记账行：任务不预告属性（PO 裁定），做完只留一句"它练到了哪儿"。
                真正的涨点只有一个来源 —— 属性面板里的手动分配。 */}
            {quest.linkedAttributes.length > 0 && (
              <p className="mt-3 text-[11px] text-white/45">
                这条练到了{' '}
                <span className="text-abyss-300/90">{attributeLabels(quest.linkedAttributes)}</span>
              </p>
            )}

            {grantedPoints > 0 && (
              <p className="mt-1.5 text-[11px] text-amber-200/85">
                ＋{grantedPoints} 待分配点 · 去「人物属性」面板决定它长在哪一维。
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg border border-white/20 bg-white/[0.06] py-2.5 text-[12.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/40 hover:text-white active:scale-[0.99]"
            >
              收下
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
