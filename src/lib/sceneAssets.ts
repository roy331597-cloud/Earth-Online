// ============================================================================
// EarthOnline · Phase 2 · 场景背景解析层（**临时占位，可整层删除**）
//
// 为什么单独一层：
//   Phase 1 的 `catalog/scenes.ts` 已经把背景图路径写成了本地资源
//   （`/scenes/guanghua/dusk.jpg`），但那批真实摄影/原画还没到位。
//   为了让 `npm run dev` 第一眼就是沉浸的，这里把
//   「sceneId + 时段」映射到 Unsplash 占位图。
//
// 真实素材到位后：把 public/scenes/guanghua/*.jpg 放进去，
// 然后删掉本文件、让 SceneCanvas 直接读 `scene.backgrounds` 即可。
// **Phase 1 的 catalog 不需要任何改动。**
// ============================================================================

import type { TimeOfDay } from '@/types';
import type { SceneId } from '@/types';

const UNSPLASH = (id: string, w = 1920): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=78`;

/**
 * 选图标准（这是给未来的自己看的）：
 *   1. **必须有地平线/地面透视** —— 锚点是钉在透视里的，俯拍图无处可钉；
 *   2. 尽量无人脸、无强主体 —— 场景是画布，主体应该是玩家的锚点；
 *   3. 冷暖要能撑住各自时段的气氛词（见 scenes.ts 的 moodWords）。
 */
const GUANGHUA_PLACEHOLDERS: Record<TimeOfDay | 'default', string> = {
  // 黄昏 · 城市峡谷里最后一束光落在街尽头，路面还湿着 —— 本场景的主定妆照
  default: UNSPLASH('photo-1519501025264-65ba15a82390'),
  dusk: UNSPLASH('photo-1519501025264-65ba15a82390'),

  // 清晨 · 校园草坪上的日出与远处的城市轮廓
  dawn: UNSPLASH('photo-1541339907198-e08756dedf3f'),

  // 上午 · 街面视角，深处的透视一眼望不到头（"明亮 / 推进 / 锐利"）
  morning: UNSPLASH('photo-1449824913935-59a10b8d2000'),

  // 下午 · 主楼与草坪，光变得温吞（"需要方法 / 耐力"）
  afternoon: UNSPLASH('photo-1562774053-701939374585'),

  // 夜晚 · 城市灯火在玻璃上重复自己
  night: UNSPLASH('photo-1480714378408-67cf0d13bc1b'),

  // 深夜 · 只剩冷蓝色的天际线与水面
  deepnight: UNSPLASH('photo-1477959858617-67f85cf4f1df'),
};

/** 备用图（未启用）：留给后续场景，如「自习室 · 深夜」「图书馆 · 闭馆前」 */
export const SPARE_PLACEHOLDERS = {
  library: UNSPLASH('photo-1498243691581-b145c3f54a5a'),
  cityDusk: UNSPLASH('photo-1513635269975-59663e0ac1ad'),
} as const;

/**
 * 取某场景在某时段的背景图。
 * 未登记的 sceneId 一律退回光华楼的那一套 —— 宁可图不对，也不能白屏。
 */
export const sceneBackgroundUrl = (sceneId: SceneId | string, timeOfDay: TimeOfDay): string => {
  void sceneId; // 目前只有光华楼一个场景；多场景时在此处按 id 分表
  return GUANGHUA_PLACEHOLDERS[timeOfDay] ?? GUANGHUA_PLACEHOLDERS.default;
};

/**
 * 兜底层：即使图片 404 或断网，底下这层渐变也要看起来是"故意设计的夜色"。
 * 它永远渲染，图片加载成功只是盖在它上面。
 */
export const SCENE_FALLBACK_GRADIENT =
  'radial-gradient(120% 90% at 50% 12%, #16213f 0%, #0a0e16 45%, #05070c 100%)';
