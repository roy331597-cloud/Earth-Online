import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { describeBytes } from '@/lib/syncClient';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';

/**
 * 云端拉取提议。
 *
 * 它出现的时刻只有一个：**云端那份与本机那份对不上了**（别处推过、或这是
 * 一台刚接入的设备）。这时它把两边的读数摆出来 —— 修订、时间、大小、
 * 本机的进度一句话 —— 然后问一句：拉下来吗？
 *
 * ---------------------------------------------------------------------------
 * 为什么它不是提示条（AgentToast），也不是结算浮层（RolloverNotice）
 * ---------------------------------------------------------------------------
 * 提示条立过一条规矩：**它不做决定**。降级、没接上，那些事都不需要玩家
 * 做什么，所以它浮上来、读完、自己走。
 * 而这一件事恰恰需要玩家做一个**有后果的决定** —— 覆盖哪一边。所以：
 *
 *   · 不自行退场。你不管它，它就在那儿等着；「稍后」也只是把它收起来，
 *     云端那份仍然对不上，下次开机它会再来 —— 它不假装分歧消失了。
 *   · 真正动手前还有一道 ConfirmDialog（"是/否"的那个），
 *     并且拉取前自动给本机留一份快照（在急救箱里）。
 *   · 它**非模态**：没有遮罩、不抢焦点。你可以完全无视它继续玩 ——
 *     唯一被禁掉的是"自动推送"（自动推等于拿旧底子盖掉云端那份）。
 *
 * ---------------------------------------------------------------------------
 * 两条工程约束
 * ---------------------------------------------------------------------------
 * ① **不 createPortal**：与 AgentToast / RolloverNotice 同阵营，挂在 App 根层。
 *    SSR 冒烟会真渲染它一次，那份环境里没有 document。
 * ② **z 层序 76**：在跨天结算（70）之上 —— 一屏同时来两件事时，先让玩家
 *    把结算看完；在 AI 遮罩（80）之下 —— 那是"整个界面正在忙"，盖得住它。
 *    ⚠️ ConfirmDialog 是 z-50 的模态：它打开时这份横幅会先把自己收起来，
 *    否则一条 76 的横幅会浮在对话框的遮罩之上，分层就坏了。
 *    （信息不会丢：对话框里把两边的读数重述了一遍。）
 */
export function CloudPullOffer() {
  const offer = useEarthOnlineStore((s) => s.sync.offer);
  const pull = useEarthOnlineStore((s) => s.syncPull);
  const dismissOffer = useEarthOnlineStore((s) => s.dismissOffer);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (offer === null) return null;

  const when = (iso: string | null): string =>
    iso === null ? '时间未知' : iso.slice(0, 16).replace('T', ' ');

  const runPull = async () => {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    const result = await pull();
    setBusy(false);
    // 成功的话 offer 已被清掉，这个组件整个退场；失败时本地原样未动，
    // 横幅留在原地把原因说出来 —— 它不会自己消失
    if (!result.ok) setMessage(result.message);
  };

  return (
    <>
      {!confirming && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[76] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] md:pb-8">
          <div className="glass-deep pointer-events-auto w-full max-w-md border-white/15 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-abyss-300/70" />

              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] tracking-wide text-white/85">
                  云端有一份存档，和本机的不在同一步上
                </p>

                <div className="mt-2 space-y-0.5">
                  <p className="numeric text-[11px] leading-relaxed text-white/60">
                    <span className="text-white/35">云端　</span>修订 {offer.cloudRevision}
                    {offer.cloudUpdatedAt !== null && <> · {when(offer.cloudUpdatedAt)}</>}
                    {offer.cloudBytes !== null && <> · {describeBytes(offer.cloudBytes)}</>}
                  </p>
                  <p className="numeric text-[11px] leading-relaxed text-white/60">
                    <span className="text-white/35">本机　</span>修订 {offer.localRevision} ·{' '}
                    {when(offer.localUpdatedAt)} · {describeBytes(offer.localBytes)}
                  </p>
                  <p className="prose-cinematic text-[11px] leading-relaxed text-white/40">
                    {offer.localSummary}
                  </p>
                </div>

                {message !== null && (
                  <p className="prose-cinematic mt-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-white/60">
                    {message}
                  </p>
                )}

                {busy ? (
                  <p className="mt-3 text-[11.5px] text-white/45">正在拉取并解开云端那份…</p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setConfirming(true);
                      }}
                      className="flex-1 rounded-lg border border-amber-400/45 bg-amber-400/[0.12] py-2 text-[11.5px] text-amber-100 transition-all duration-300 ease-cinematic hover:bg-amber-400/20 active:scale-[0.99]"
                    >
                      拉取到本机
                    </button>
                    <button
                      type="button"
                      onClick={dismissOffer}
                      className="shrink-0 rounded-lg border border-white/[0.12] px-3 py-2 text-[11.5px] text-white/45 transition hover:border-white/25 hover:text-white/75"
                    >
                      稍后
                    </button>
                  </div>
                )}

                <p className="mt-2 text-[10px] leading-relaxed text-white/30">
                  拉取会覆盖本机（动手前自动留一份快照，在急救箱里）。
                  「稍后」只是收起来 —— 云端那份还在，下次打开它会再来问。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          open
          question="用云端那份覆盖本机？"
          subject={`云端修订 ${offer.cloudRevision}`}
          detail={
            <>
              云端那份：修订 {offer.cloudRevision} · {when(offer.cloudUpdatedAt)}
              {offer.cloudBytes !== null && <> · {describeBytes(offer.cloudBytes)}</>}。
              本机这份会被换掉 —— 换之前自动留一份快照（在急救箱里，随时能捡回来）。
              如果解不开（口令不对或密文损坏），本机一个字都不会动。
            </>
          }
          confirmLabel="拉取"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void runPull()}
        />
      )}
    </>
  );
}
