// ============================================================================
// 生成 PWA 图标：黑金风格 —— 夜的底，一枚金点悬在地平线上方
//
//   node scripts/gen-icons.mjs
//
// 为什么是一个脚本，而不是几张"拖进来就完事"的图片：
//   · 图标应该是**可重放**的 —— 改一处数值，五个尺寸一起重来，
//     而不是拿画图软件缩放五次、五次各有各的意外；
//   · 项目零图形依赖（没有 sharp / canvas），所以这里用 Node 自带的 zlib
//     手写 PNG（签名 + IHDR + IDAT + IEND），几十行，跑一遍几毫秒。
//
// 构图来自应用自己：HUD 顶部那枚呼吸的琥珀点，与场景锚点「天边」——
// 所有还很远的事，都挂在那条线上。底色直接取 theme_color / background_color。
//
// 产物（全部不透明 —— iOS 的 apple-touch-icon 不接受透明通道）：
//   public/icon-192.png            launcher（any）
//   public/icon-512.png            launcher（any）
//   public/icon-512-maskable.png   安卓自适应图标（内容缩进安全区，圆形裁切不伤构图）
//   public/apple-touch-icon.png    iOS 主屏图标 180×180
//   public/icon.svg                同一构图的矢量版（favicon 与 manifest 的 any 档）
// ============================================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

// —— 调色板（与 index.html / manifest.webmanifest 同一组数） ——
const BG_TOP = [0x0a, 0x0a, 0x0c]; // #0a0a0c（theme_color）
const BG_BOTTOM = [0x05, 0x05, 0x07]; // #050507（background_color）
const GOLD = [0xfb, 0xbf, 0x24]; // #fbbf24 —— 全项目唯一的金（amber-400）

// —— 构图（归一化坐标；正稿与 maskable 版只是整体缩放不同） ——
const DOT = { x: 0.5, y: 0.472, r: 0.062 };
const LINE = { y: 0.615, halfW: 0.235, halfH: 0.0026 };
const GLOW = { r: 0.34, a: 0.28 };
const DOT_AA = 0.008; // 点边缘的抗锯齿带宽
const MASKABLE_SCALE = 0.72; // 内容缩到 72%，落在圆形的安全区里

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 渲染一张 RGBA 位图。scale < 1 = 内容整体缩小（maskable 用）。 */
function render(size, scale = 1) {
  const px = Buffer.alloc(size * size * 4, 255);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const bgT = clamp01(v); // 竖直渐变：上 #0a0a0c → 下 #050507
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      // 屏幕坐标 → 构图坐标（scale=1 时等同；maskable 把内容向中心收缩）
      const cu = 0.5 + (u - 0.5) / scale;
      const cv = 0.5 + (v - 0.5) / scale;

      let r = BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * bgT;
      let g = BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * bgT;
      let b = BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * bgT;
      const over = (a) => {
        r += (GOLD[0] - r) * a;
        g += (GOLD[1] - g) * a;
        b += (GOLD[2] - b) * a;
      };

      // ① 光晕：金点周围一圈极淡的金
      const dGlow = Math.hypot(cu - DOT.x, cv - DOT.y);
      over(GLOW.a * clamp01(1 - dGlow / GLOW.r));

      // ② 地平线：中间实、两端化开（线性渐隐，与 icon.svg 的 gradient 对账）
      const dy = Math.abs(cv - LINE.y);
      const lx = clamp01(1 - Math.abs(cu - DOT.x) / LINE.halfW);
      const lineCover = 1 - smooth(LINE.halfH, LINE.halfH + 0.0018, dy);
      over(0.65 * lx * lineCover);

      // ③ 金点：实心 + 一像素级的抗锯齿边
      const dDot = Math.hypot(cu - DOT.x, cv - DOT.y);
      over(1 - smooth(DOT.r, DOT.r + DOT_AA, dDot));

      const at = (y * size + x) * 4;
      px[at] = Math.round(r);
      px[at + 1] = Math.round(g);
      px[at + 2] = Math.round(b);
    }
  }
  return px;
}

// —— 手写 PNG（8bit RGBA） ——
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePng = (size, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 颜色类型：RGBA
  const stride = size * 4 + 1; // 每行前缀一个 filter 字节（0 = 不过滤）
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

// —— 产出 + 自检（写完立刻读回来核签名与 IHDR，不靠"应该是对的"） ——
const write = (name, size, scale) => {
  const file = join(OUT, name);
  writeFileSync(file, encodePng(size, render(size, scale)));
  const back = readFileSync(file);
  const w = back.readUInt32BE(16);
  const h = back.readUInt32BE(20);
  const ok = back.subarray(0, 8).equals(PNG_SIG) && w === size && h === size;
  console.log(`${ok ? '✅' : '❌'} ${name}  ${w}×${h}  ${(back.length / 1024).toFixed(1)} kB`);
  return ok;
};

let ok = true;
ok = write('icon-192.png', 192, 1) && ok;
ok = write('icon-512.png', 512, 1) && ok;
ok = write('icon-512-maskable.png', 512, MASKABLE_SCALE) && ok;
ok = write('apple-touch-icon.png', 180, 1) && ok;

// —— 矢量版：同一构图的 SVG（数值与上面常量同源，改一处两边一起新） ——
const f = (n) => (n * 512).toFixed(2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="地球OL">
  <!-- 夜的底：上 #0a0a0c → 下 #050507（与 manifest 的 theme / background 同值） -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0c"/>
      <stop offset="1" stop-color="#050507"/>
    </linearGradient>
    <radialGradient id="glow" cx="${f(DOT.x)}" cy="${f(DOT.y)}" r="${f(GLOW.r)}">
      <stop offset="0" stop-color="#fbbf24" stop-opacity="${GLOW.a}"/>
      <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="horizon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fbbf24" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fbbf24" stop-opacity="0.65"/>
      <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#glow)"/>
  <rect x="${f(DOT.x - LINE.halfW)}" y="${f(LINE.y - LINE.halfH)}" width="${f(LINE.halfW * 2)}" height="${f(LINE.halfH * 2)}" fill="url(#horizon)"/>
  <circle cx="${f(DOT.x)}" cy="${f(DOT.y)}" r="${f(DOT.r)}" fill="#fbbf24"/>
</svg>
`;
writeFileSync(join(OUT, 'icon.svg'), svg);
console.log(`✅ icon.svg  （矢量版，与上面的 PNG 同一组常量）`);

process.exit(ok ? 0 : 1);
