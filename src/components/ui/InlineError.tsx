/**
 * 一行就地失败说明。
 *
 * 它和 `AgentToast` 分工明确，别把两者混起来用：
 *   · 提示条说的是**结果拿到了，但来源不同**（降级了）。玩家不需要做什么。
 *   · 这一行说的是**结果没拿到**。玩家写的东西还在原地，重试的按钮就在手边。
 *
 * 所以它出现在按钮正下方，而不是屏幕角落 —— 失败要留在现场。
 *
 * 语气：不安慰、不道歉、不拟人化。（"抱歉"是道歉，"再试一次就行"是安慰，
 * 而这个应用从头到尾的立场是对面坐着几个人，不是一个会内疚的服务。）
 */
export function InlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/80" />
      <p className="prose-cinematic min-w-0 flex-1 text-[11.5px] leading-relaxed text-amber-100/75">
        {message}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="收起"
          className="-mr-1 -mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[12px] leading-none text-amber-200/40 transition-colors duration-200 hover:text-amber-200/80"
        >
          ✕
        </button>
      )}
    </div>
  );
}
