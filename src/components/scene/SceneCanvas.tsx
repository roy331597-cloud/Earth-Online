import { useEffect, useState } from 'react';
import { SCENE_FALLBACK_GRADIENT, sceneBackgroundUrl } from '@/lib/sceneAssets';
import type { SceneId, TimeOfDay } from '@/types';

interface SceneCanvasProps {
  sceneId: SceneId;
  timeOfDay: TimeOfDay;
  /** 时段色偏，来自 catalog/scenes.ts 的 band.filter.overlay */
  overlayRgba: string;
  vignetteEnabled: boolean;
  /** 场景名，作为图片的 alt（对读屏用户而言这是"你正站在哪里"） */
  sceneName: string;
}

/**
 * 场景底座。
 *
 * 图层从下到上共五层，缺一层都不行：
 *   ① 兜底渐变 —— 断网 / 图 404 时它顶上，看上去仍是"故意的夜色"，而不是白屏
 *   ② 背景图   —— 加载完成后淡入，同时极缓慢推近（kenburns，48s）
 *   ③ 时段色偏 —— 黄昏偏金、深夜偏蓝，让"现在是几点"变成一种体感
 *   ④ 整体压暗 —— 保证任何一张图上的白色与金色文字都读得清
 *   ⑤ 暗角     —— 四周压黑，把视线收进画面中心（可在设置里关掉）
 *
 * 背景图当前走 `lib/sceneAssets.ts` 的 Unsplash 占位解析；
 * 真实素材到位后，本组件只需把 `sceneBackgroundUrl(...)` 换成
 * `scene.backgrounds[timeOfDay]`，其余五层原样不动。
 */
export function SceneCanvas({
  sceneId,
  timeOfDay,
  overlayRgba,
  vignetteEnabled,
  sceneName,
}: SceneCanvasProps) {
  const url = sceneBackgroundUrl(sceneId, timeOfDay);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const ready = readyUrl === url;

  // 预加载：先让浏览器把图拿回来，再淡入。直接切 background-image 会闪一下白。
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    const done = () => {
      if (!cancelled) setReadyUrl(url);
    };
    img.onload = done;
    img.onerror = done; // 加载失败也标记 ready：让兜底渐变成为最终画面，而不是永远停在透明
    img.src = url;
    if (img.complete) done();
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* ① 兜底层 */}
      <div className="absolute inset-0" style={{ background: SCENE_FALLBACK_GRADIENT }} />

      {/* ② 背景图。key={url} 是为了让 kenburns 在换图时从头开始 */}
      <div
        key={url}
        role="img"
        aria-label={sceneName}
        className={[
          'absolute inset-0 bg-cover bg-center',
          /**
           * 提亮三件套：
           *   brightness 1.08 —— 把画面整体抬起来（注意不是 brightness-95：
           *     那个值是**调暗**到 95%，与"提亮"的意图正好相反）；
           *   contrast 1.05   —— 抵消压暗层带来的灰雾，让轮廓重新立起来；
           *   saturate 1.08   —— 补偿半透明黑膜吃掉的饱和度，天色与灯光才不发闷。
           * 三者都很轻：电影感来自克制，一旦开到 1.2 以上就变成滤镜味。
           */
          'brightness-[1.08] contrast-[1.05] saturate-[1.08]',
          'transition-opacity duration-[1600ms] ease-out',
          ready ? 'animate-kenburns opacity-100' : 'opacity-0',
        ].join(' ')}
        style={{ backgroundImage: `url("${url}")` }}
      />

      {/* ③ 时段色偏 */}
      <div className="absolute inset-0 mix-blend-soft-light" style={{ backgroundColor: overlayRgba }} />

      {/**
       * ④ 整体压暗。45% 是上一版的值 —— 它和"中央起暗"的暗角叠在一起，才是画面发闷的主因。
       * 现在降到 20%，剩下的可读性交给三件玻璃自己的底色去承担
       * （面板本来就有一层 bg-ink-800/45~60，不必在场景层重复压暗一遍）。
       */}
      <div className="absolute inset-0 bg-ink-950/20" />

      {/* ⑤ 暗角 */}
      {vignetteEnabled && <div className="absolute inset-0 vignette" />}
    </div>
  );
}

/**
 * 把当前场景的全部时段变体预热一遍。
 * 效果：玩家从"下午"待到"黄昏"时，画面是化开的，不是"啪"地换一张。
 * 只在挂载时调一次，失败静默 —— 这只是体验优化，不是功能。
 */
export function preloadAllTimeOfDayVariants(sceneId: SceneId): void {
  const bands: TimeOfDay[] = ['dawn', 'morning', 'afternoon', 'dusk', 'night', 'deepnight'];
  for (const band of bands) {
    const img = new Image();
    img.src = sceneBackgroundUrl(sceneId, band);
  }
}
