// ============================================================================
// EarthOnline · 图片压缩（拍进档案馆的那一张）
//
// 存在的理由只有一个：**存档是 LocalStorage，而 LocalStorage 只有几 MB。**
// 手机随手一拍是 3~5 MB，直接塞进存档，第三张就会把浏览器给的空间用完 ——
// 而那时玩家看到的不是"空间不够"，是"这个应用坏了"。
//
// 所以照片进存档之前必须先过这里：长边压到 1280、JPEG 质量 0.72，
// 压完还超标就再降一档，直到落进 300 KB 以内。
// 这条约定不是这里发明的 —— 它是 `MilestoneSnapshot` 的类型注释里早就写下的
// 存储契约，这里只是把它真正实现出来。
//
// ⚠️ 全部代码只在浏览器里跑（事件处理器里调用）。SSR 阶段不会碰到它，
//    但也不能在模块顶层碰 `document` —— 面板冒烟会把整个模块图加载一遍。
// ============================================================================

/** 长边上限（px）。1280 够看清登机牌上的字，也够看清一张合影里的脸 */
const MAX_EDGE = 1280;
/** JPEG 质量。0.72 是"再低就看出糊、再高就白占地方"的那条线 */
const BASE_QUALITY = 0.72;
/** 单张压完之后的硬上限（字节）。超了就降一档重压 */
const MAX_BYTES = 300 * 1024;
/** 降档阶梯：长边与质量一起退。退无可退时接受最后一张（宁可糊，不可丢） */
const FALLBACK_STEPS = [
  { edge: 1024, quality: 0.62 },
  { edge: 860, quality: 0.55 },
] as const;

export interface CompressedImage {
  /** `data:image/jpeg;base64,...` —— 可以直接喂给 `<img src>`，也可以直接进存档 */
  dataUrl: string;
  /** 估算的字节数（base64 解码后的长度） */
  bytes: number;
  width: number;
  height: number;
}

/** base64 data URL 的**真实**字节数（`length` 是字符数，比字节数大三成左右） */
export const dataUrlBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  const body = dataUrl.length - comma - 1;
  // 末尾的 `=` 是补位，每个只占 1 个字符却不对应 3/4 个字节
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body * 3) / 4) - padding);
};

const loadImage = async (file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // 少数浏览器对 HEIC / 特殊色彩空间的图会在这里失败 —— 落到下面的 <img> 路径
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('这张图片读不出来'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const draw = (
  source: CanvasImageSource,
  width: number,
  height: number,
  edge: number,
  quality: number,
): CompressedImage => {
  const scale = Math.min(1, edge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('这台设备画不出图（canvas 不可用）');
  // 缩图会留下锯齿，尤其是照片里的直线（窗框、地平线）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, bytes: dataUrlBytes(dataUrl), width: w, height: h };
};

/**
 * 把一张玩家选的（或刚拍的）照片压进存档能承受的大小。
 *
 * 抛错只有两种情况：选的根本不是图片、或者这张图连读都读不出来。
 * 两种情况都由调用方翻译成一句人话 —— 这里不写 UI 文案。
 */
export const compressImageFile = async (file: File): Promise<CompressedImage> => {
  if (!file.type.startsWith('image/')) throw new Error('这不是一张图片');

  const { source, width, height } = await loadImage(file);
  const first = draw(source, width, height, MAX_EDGE, BASE_QUALITY);
  if (first.bytes <= MAX_BYTES) {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
    return first;
  }

  let best = first;
  for (const step of FALLBACK_STEPS) {
    best = draw(source, width, height, step.edge, step.quality);
    if (best.bytes <= MAX_BYTES) break;
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  return best;
};
