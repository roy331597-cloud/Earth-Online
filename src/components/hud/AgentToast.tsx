import { useEffect } from 'react';
import { enableLocalTrack } from '@/store/agentRuntime';
import { useToastStore } from '@/store/useToastStore';
import type { ToastItem } from '@/store/useToastStore';

/**
 * 提示条。
 *
 * 一次 Agent 调用降级了 —— 没配密钥、网断了、熔断开着 —— 结果还是会出来
 * （替身接住了），但"发生了什么"必须被说出来。这个组件就是说这句的地方。
 *
 * ---------------------------------------------------------------------------
 * 为什么是提示条，而不是弹窗或错误对话框
 * ---------------------------------------------------------------------------
 * 因为**没有任何东西失败到需要玩家做决定**：任务照样生成了、复盘照样结算了。
 * 打断他、要求他点"确定"，是把系统的内部状况伪装成他的问题。
 * 所以：从底部浮上来、能读完、能自己走。
 *
 * 唯一的例外是那个「先切到本地轨道」的按钮 —— 它不是"确认"，是**一个去处**：
 * 你要是嫌它烦，点一下就再也不会看到这条提示了。
 *
 * ---------------------------------------------------------------------------
 * 两条工程约束
 * ---------------------------------------------------------------------------
 * ① **不能用 createPortal**。它与 RolloverNotice / AgentBusyOverlay 同阵营，
 *    挂在 App 根层。SSR 冒烟测试会真渲染一次 App，那份环境里没有 document。
 * ② **z 层序**：结算 70 / 遮罩 80 / 提示条 85 / 仪式 90。
 *    提示条压在遮罩**之上**是刻意的：提示往往在"上一个 Agent 刚跑完、
 *    下一个已经起跑"的那一刻出现（比如调度员没接上、职业 Agent 已经开工），
 *    压在下面会让整条提示的寿命都花在遮罩背后。
 */

/** 停留时长。带按钮的多留一会儿 —— 那是要读、要决定的东西 */
const DWELL_MS = 12_000;
const DWELL_WITH_ACTION_MS = 20_000;

function Toast({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const ms = item.action ? DWELL_WITH_ACTION_MS : DWELL_MS;
    const id = setTimeout(() => dismiss(item.id), ms);
    return () => clearTimeout(id);
  }, [item.id, item.action, dismiss]);

  const warn = item.tone === 'warn';

  return (
    <li className="glass-deep animate-fade-up pointer-events-auto w-full max-w-sm border-white/15 px-4 py-3.5">
      <div className="flex items-start gap-3">
        {/* 提示点：与遮罩上那个脉冲点同一个语言 —— 金点 = 系统在说话。
            警告用琥珀，普通用更冷的一档，两者都不是红色：这里没有任何东西坏了 */}
        <span
          className={
            warn
              ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400'
              : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-abyss-300/70'
          }
        />

        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] tracking-wide text-white/85">{item.title}</p>
          <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/50">
            {item.body}
          </p>

          {item.action && (
            <button
              type="button"
              onClick={() => {
                // 只有一种动作，且它只做一件事。将来多起来时这里该改成映射表，
                // 但现在写成一个 if 比写成一个只有一项的表更清楚。
                if (item.action?.kind === 'enable_local_track') enableLocalTrack();
                dismiss(item.id);
              }}
              className="glass-pill glass-hover mt-2.5 px-3 py-1.5 text-[11.5px] text-amber-300"
            >
              {item.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => dismiss(item.id)}
          aria-label="收起这条提示"
          className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-[13px] leading-none text-white/30 transition-colors duration-200 hover:text-white/70"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

export function AgentToast() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[85] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] md:pb-8"
    >
      {toasts.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>
  );
}
