import { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatBurst {
  id: number;
  text: string;
}

/** 与 tailwind.config.js 的 float-up 时长一致（1.5s） */
const BURST_MS = 1500;

/**
 * 打钩/结算后那句金色的「+92 EXP」。
 *
 * 为什么要自己管生命周期而不交给 CSS：动画结束后元素必须**从 DOM 里消失**，
 * 否则飘走的数字会一层层堆在同一个位置，透明度叠加成一块金斑。
 * 所以动画只管视觉，清理由这里的定时器负责。
 */
export function useFloatBursts(): {
  bursts: FloatBurst[];
  push: (text: string) => void;
} {
  const [bursts, setBursts] = useState<FloatBurst[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const push = useCallback((text: string) => {
    seq.current += 1;
    const id = seq.current;
    setBursts((prev) => [...prev, { id, text }]);
    const t = window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, BURST_MS);
    timers.current.push(t);
  }, []);

  // 卸载时清掉所有待触发的定时器，避免对已卸载组件 setState
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  return { bursts, push };
}

/**
 * 浮动层。放在**相对定位**的父元素里，绝对定位到该元素的右上角。
 * `pointer-events-none`：它只是反馈，绝不能挡住下一次点击。
 */
export function FloatLayer({ bursts }: { bursts: FloatBurst[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {bursts.map((b) => (
        <span
          key={b.id}
          className="numeric-gold absolute right-1 top-1 animate-float-up whitespace-nowrap text-[13px] font-semibold drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]"
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}
