import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  /** 主问句。用场景的语气，不用系统提示的语气 */
  question: string;
  /** 高亮的主体（通常是任务/日常的名字），以金色呈现 */
  subject?: string;
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 轻量二次确认。
 *
 * 为什么打钩需要二次确认：日常是**一天一次、不可撤销**的动作（协议见
 * types/quest.ts 的 DailyLog —— 一条日常一天只记一次）。误触一次，
 * 要么今天白打，要么连击断在这儿。多问一句的成本远低于这个代价。
 *
 * 刻意不做成"底部抽屉"：那会让人以为进入了另一个流程。
 * 它只是一个悬浮的提问，两个按钮，回车即确认。
 */
export function ConfirmDialog({
  open,
  question,
  subject,
  detail,
  confirmLabel = '确认',
  cancelLabel = '再想想',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;
  // SSR（含冒烟测试）没有 body，此时不渲染 —— 对话框本来就只在交互后出现
  if (typeof document === 'undefined') return null;

  /**
   * ⚠️ 必须挂到 body，不能就地渲染。
   *
   * 面板用了 `backdrop-blur`，而 CSS 里 `backdrop-filter` 会为 fixed 后代
   * **创建包含块** —— 于是 `fixed inset-0` 会退化成"相对面板定位"，
   * 再被外层滚动容器的 `overflow-y-auto` 裁掉。这个坑在手机上表现为
   * "确认框只盖住半个抽屉"，很难一眼看出原因。
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="取消"
        onClick={onCancel}
        className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-deep relative w-full max-w-[19rem] animate-fade-up p-4"
      >
        <p className="prose-cinematic text-[13.5px] leading-relaxed text-white/80">{question}</p>
        {subject && (
          <p className="prose-cinematic mt-1 text-[15px] font-medium tracking-wide text-amber-400">
            {subject}
          </p>
        )}
        {detail && <div className="mt-2 text-[11.5px] leading-relaxed text-white/50">{detail}</div>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="glass-pill glass-hover flex-1 py-2 text-[12.5px] text-white/70"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-amber-400/50 bg-amber-400/15 py-2 text-[12.5px] font-medium text-amber-200 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.03] hover:bg-amber-400/25 active:scale-[0.99]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
