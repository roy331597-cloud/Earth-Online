import { useEffect, useState } from 'react';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';

/**
 * AI 运转遮罩。
 *
 * 它回答的是一个问题：**「我刚才点那一下，现在到底有没有人在干活？」**
 *
 * 一个纯本地的应用突然要等两秒钟，最容易的失败方式是转一个圈；
 * 次容易的失败方式是写"加载中…"。两者都在说"机器在处理你"，
 * 而这个应用从头到尾的立场是**对面坐着几个人**。
 * 所以这里显示的是人：谁在干活、干什么、干了几秒。
 *
 * 视觉：半透明暗金微光。金色只走**边缘**（一层极淡的径向渐变），
 * 中心必须足够暗 —— 玩家要能看见遮罩后面那个场景还在，只是被按下了暂停。
 *
 * ⚠️ 与 RolloverNotice 同理，它挂在 App 根层，**不能用 createPortal**：
 *    SSR 冒烟测试会用 renderToString 真渲染一次 App，那份环境里没有 document。
 */
export function AgentBusyOverlay() {
  const activity = useEarthOnlineStore((s) => s.agentActivity);
  /** 秒针。只在真的有 Agent 在跑时才走 —— 空转的定时器没有意义 */
  const [, tick] = useState(0);

  const busy = activity.length > 0;

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // ESC 不给关：它不是一个可以被"取消"的东西。真正的退路在 bus 的超时上
  if (!busy) return null;

  const now = Date.now();

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[80] flex items-center justify-center px-5"
    >
      {/* 底：几乎不透光的暗。用 animate-fade-in 而不是条件类 —— 它只在挂载时放一次 */}
      <div className="absolute inset-0 animate-fade-in bg-ink-950/[0.72] backdrop-blur-[3px]" />

      {/* 暗金微光：两层错位的椭圆，压在最边缘。它读起来像"屏幕外有什么在发热" */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/4 h-72 w-72 animate-breathe rounded-full bg-amber-500/[0.09] blur-3xl" />
        <div
          className="absolute -right-20 bottom-1/4 h-64 w-64 animate-breathe rounded-full bg-amber-400/[0.07] blur-3xl"
          style={{ animationDelay: '1.2s' }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-[10.5px] tracking-[0.28em] text-amber-400/70">AGENT IN SESSION</div>

        <ul className="mt-3 space-y-2">
          {activity.map((a) => (
            <li
              key={a.id}
              className="glass-deep animate-fade-up flex items-center gap-3 border-amber-400/20 px-4 py-3"
            >
              {/* 运转指示：一个脉冲的点，而不是转圈。转圈是"请等待"，脉冲是"在呼吸" */}
              <span className="h-1.5 w-1.5 shrink-0 animate-dot-pulse rounded-full bg-amber-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] tracking-wide text-white/85">
                  {a.name}
                </span>
                <span className="prose-cinematic mt-0.5 block truncate text-[11.5px] text-white/50">
                  {a.label}
                </span>
              </span>
              <span className="numeric shrink-0 text-[10.5px] text-white/35">
                {Math.max(0, Math.floor((now - a.startedAt) / 1000))}s
              </span>
            </li>
          ))}
        </ul>

        {/* 一句话解释"为什么不能快一点"。工具不解释的时候，等待就变成焦躁 */}
        <p className="prose-cinematic mt-3 text-center text-[11px] leading-relaxed text-white/35">
          正在与后台通讯。这一步过去之后，结果会直接出现在你面前。
        </p>
      </div>
    </div>
  );
}
