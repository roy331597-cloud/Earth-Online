import { useMemo } from 'react';

/**
 * 金色微粒。
 *
 * 从 ChapterCeremony 里搬出来的 —— 通关仪式与成就光晕是同一类时刻
 * （"这件事一辈子只发生几次"），它们该用同一种空气。两处各写一份的话，
 * 第一次调粒子密度就会只调到其中一处，而没有人会记得还有另一处。
 *
 * ⚠️ 位置由**确定性伪随机**生成（种子由调用方给，通常是那个时刻的 ISO 串），
 *     不是 Math.random()：同一个时刻每次渲染必须落回同一片星图，
 *     否则任何一次父组件重渲染都会让整屏尘埃瞬间乱跳一下。
 *
 * 形态是**循环**的（animate-gold-drift）：一次性的光效读起来像加载，
 * 持续飘的尘埃才读起来像"这个时刻还没结束"。
 */
export function GoldMotes({ seed, count = 22 }: { seed: string; count?: number }) {
  const motes = useMemo(() => {
    const rnd = mulberry(hashOf(seed));
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rnd() * 100,
      top: 55 + rnd() * 45, // 只在下半屏起步：向上飘的那一段才走得完整
      size: 1.5 + rnd() * 2.5,
      delay: rnd() * 7,
      duration: 5.5 + rnd() * 4.5,
      opacity: 0.25 + rnd() * 0.5,
    }));
  }, [seed, count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {motes.map((m) => (
        <span
          key={m.id}
          className="gold-mote animate-gold-drift absolute rounded-full bg-amber-300"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: `${m.size}px`,
            height: `${m.size}px`,
            opacity: m.opacity,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/** 32 位字符串散列（FNV-1a）。只用来给粒子定种子，不追求任何密码学性质 */
export const hashOf = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** mulberry32：一行一个的确定性伪随机 */
export const mulberry = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
