// ============================================================================
// EarthOnline · 场景目录（静态设定）
// 视觉规范见需求文档：场景即界面 / 暗角渐变 / 空间锚定标签
//
// Phase 1 只提供结构与一个可运行的首场景占位。
// 背景图资源（Phase 2 替换为真实摄影/原画）：
//   public/scenes/guanghua/{default,dawn,morning,afternoon,dusk,night,deepnight}.jpg
// ============================================================================

import type { SceneId } from '../../types/core';
import type { Scene, TimeOfDayBand } from '../../types/world';

// ---------------------------------------------------------------------------
// 1. 时段分带（HUD 用）
// ---------------------------------------------------------------------------

/**
 * 时段划分刻意让「深夜」与「清晨」分开：
 * 凌晨 4 点还醒着的人和 5 点起床的人，需要不同的正反馈。
 */
export const TIME_OF_DAY_BANDS: TimeOfDayBand[] = [
  { timeOfDay: 'dawn', label: '清晨', fromHour: 4, toHour: 7, filter: { overlay: 'rgba(255, 214, 170, 0.10)', variantKey: 'dawn' }, moodWords: ['清冽', '无人打扰', '先手'] },
  { timeOfDay: 'morning', label: '上午', fromHour: 7, toHour: 12, filter: { overlay: 'rgba(255, 255, 255, 0.04)', variantKey: 'morning' }, moodWords: ['明亮', '推进', '锐利'] },
  { timeOfDay: 'afternoon', label: '下午', fromHour: 12, toHour: 17, filter: { overlay: 'rgba(255, 236, 210, 0.06)', variantKey: 'afternoon' }, moodWords: ['温吞', '需要方法', '耐力'] },
  { timeOfDay: 'dusk', label: '黄昏', fromHour: 17, toHour: 20, filter: { overlay: 'rgba(255, 150, 90, 0.12)', variantKey: 'dusk' }, moodWords: ['金色', '收束', '回望'] },
  { timeOfDay: 'night', label: '夜晚', fromHour: 20, toHour: 24, filter: { overlay: 'rgba(30, 50, 100, 0.28)', variantKey: 'night' }, moodWords: ['安静', '深度工作', '独处'] },
  { timeOfDay: 'deepnight', label: '深夜', fromHour: 0, toHour: 4, filter: { overlay: 'rgba(10, 20, 50, 0.45)', variantKey: 'deepnight' }, moodWords: ['寂静', '诚实', '该睡了'] },
];

// ---------------------------------------------------------------------------
// 2. 首场景：光华楼（校园 + 都市远景）
// ---------------------------------------------------------------------------

/**
 * 场景设计意图：
 *   - 一栋真实存在的建筑作为视觉锚点，玩家一眼认得出"这是我每天路过的地方"
 *   - 锚点全部用百分比定位，手机竖屏与桌面横屏共用一份数据
 *   - 「进化树」锚点默认不可见（requiresEvolutionRevealed），
 *     它会在隐藏目标揭示后出现在远处某一扇窗的位置 —— 这就是"某扇窗亮了"
 *   - 「天边」反过来：从一开始就在，什么都不藏 —— 圣殿是明牌
 *     （五张目标卡 + 一座远景的树），它要的是"抬头就能看见目的地"
 */
export const GUANGHUA_SCENE: Scene = {
  id: 'guanghua',
  name: '光华楼 · 西辅楼前',
  locationKind: 'campus',
  backgrounds: {
    default: '/scenes/guanghua/default.jpg',
    dawn: '/scenes/guanghua/dawn.jpg',
    morning: '/scenes/guanghua/morning.jpg',
    afternoon: '/scenes/guanghua/afternoon.jpg',
    dusk: '/scenes/guanghua/dusk.jpg',
    night: '/scenes/guanghua/night.jpg',
    deepnight: '/scenes/guanghua/deepnight.jpg',
  },
  vignette: {
    enabled: true,
    intensity: 0.55,
    color: 'rgba(0, 0, 0, 0.85)',
  },
  fixedTimeOfDay: null, // 跟随真实时间
  unlockedByChapterIds: ['CH1'],
  introLine: '风从草坪上穿过去，你在这里站了一会儿。今天要做的事，不多，但要紧。',

  anchors: [
    {
      id: 'anchor_quest_board',
      label: '今日公告栏',
      xPct: 0.18,
      yPct: 0.72,
      scale: 1.0,
      kind: 'quest_board',
      binding: { type: 'quest_board' },
      iconKey: 'board',
      visibleWhen: null,
      hoverHint: '该做的事，都在这儿了。',
      unlocked: true,
    },
    {
      id: 'anchor_daily_board',
      label: '任务灯',
      xPct: 0.78,
      yPct: 0.66,
      scale: 0.92,
      kind: 'terminal',
      binding: { type: 'daily_board' },
      iconKey: 'lamp',
      visibleWhen: null,
      hoverHint: '灯还亮着，说明今天还没做完。',
      unlocked: true,
    },
    /**
     * 玻璃幕墙。属性面板不进 Dock —— 它由这面墙进入（network 之外的第二例）。
     * 语义是刻意的：属性不是"设置里的一个数字"，是你路过时会从中看见自己的东西。
     */
    {
      id: 'anchor_glass_wall',
      label: '玻璃幕墙',
      xPct: 0.12,
      yPct: 0.38,
      scale: 0.88,
      kind: 'building',
      binding: { type: 'attributes' },
      iconKey: 'glass',
      visibleWhen: null,
      hoverHint: '路过很多次，很少停下来看一眼里面那个人。',
      unlocked: true,
    },
    {
      id: 'anchor_lab_window',
      label: '实验室的窗',
      xPct: 0.52,
      yPct: 0.30,
      scale: 0.85,
      kind: 'building',
      binding: { type: 'career', classId: 'computational_biology' },
      iconKey: 'flask',
      visibleWhen: null,
      hoverHint: '凌晨两点，那一层的灯通常只有你。',
      unlocked: true,
    },
    {
      id: 'anchor_city_skyline',
      label: '远处的写字楼',
      xPct: 0.86,
      yPct: 0.22,
      scale: 0.7,
      kind: 'building',
      binding: { type: 'vault' },
      iconKey: 'tower',
      visibleWhen: null,
      hoverHint: '那里面有人在用别的方式赚钱。你只是想选一个自己能接受的方式。',
      unlocked: true,
    },
    {
      id: 'anchor_bench',
      label: '长椅',
      xPct: 0.34,
      yPct: 0.84,
      scale: 0.95,
      kind: 'ambient',
      binding: { type: 'journal' },
      iconKey: 'bench',
      visibleWhen: null,
      hoverHint: '坐下来写两句。写完你会发现，今天其实没那么糟。',
      unlocked: true,
    },
    {
      id: 'anchor_someone',
      label: '有人刚好抬头',
      xPct: 0.64,
      yPct: 0.58,
      scale: 0.9,
      kind: 'npc',
      binding: { type: 'network' },
      iconKey: 'person',
      visibleWhen: null,
      hoverHint: '你想起有个人，很久没联系了。',
      unlocked: true,
    },
    /**
     * ⚠️ 隐藏锚点。它对应的就是"某一扇窗，从此不再是暗的"。
     *
     * 两条门是**并联**的，缺一条就永远出不来：
     *   · `unlocked` 是静态目录里的闸（Phase 2 写的是 false，
     *     当时的设想是 operations 层到点把它改掉 —— 但没人会去改一份常量目录，
     *     那个开关从来就没有被拨动过）；
     *   · `requiresEvolutionRevealed` 是运行时读存档的那一票
     *     （visibleAnchors 的铁律 ①）。
     * Phase 5 把前者放行，让后者成为唯一说了算的那道门 ——
     * 雾没散的时候窗子照样是暗的，散的那一刻它自己亮起来。
     */
    {
      id: 'anchor_evolution_window',
      label: '一扇窗',
      xPct: 0.44,
      yPct: 0.41,
      scale: 0.8,
      kind: 'ambient',
      binding: { type: 'evolution_tree' },
      iconKey: 'window_lit',
      visibleWhen: { requiresEvolutionRevealed: true },
      hoverHint: '其中一扇窗，今天不是暗的。',
      unlocked: true,
    },
    /**
     * 天边 —— 圣殿的手机端入口（第三块不入 Dock 的面板，与幕墙、NPC 同一种走法）。
     *
     * 与「一扇窗」刻意相反：那个锚点藏着雾，这个锚点什么都不藏。
     * 圣殿对雾免疫 —— 五张目标卡是明牌，进化树在殿内也只以空槽的形状出现
     * （见圣殿面板的雾分支），所以它不需要任何揭示门控，从第一天起就站在那儿。
     * "抬头就能看见要去的地方"这件事本身，就是这个锚点要说的全部。
     */
    {
      id: 'anchor_horizon',
      label: '天边',
      xPct: 0.33,
      yPct: 0.18,
      scale: 0.72,
      kind: 'ambient',
      binding: { type: 'sanctuary' },
      iconKey: 'horizon',
      visibleWhen: null,
      hoverHint: '往那边看。所有还很远的事，都挂在那条线上。',
      unlocked: true,
    },
  ],
};

export const SCENES: Scene[] = [GUANGHUA_SCENE];

export const getScene = (id: SceneId): Scene | undefined => SCENES.find((s) => s.id === id);

/** 由真实小时数取时段分带 */
export const bandForHour = (hour: number): TimeOfDayBand => {
  const band = TIME_OF_DAY_BANDS.find((b) =>
    b.fromHour < b.toHour ? hour >= b.fromHour && hour < b.toHour : hour >= b.fromHour || hour < b.toHour,
  );
  return band ?? TIME_OF_DAY_BANDS[TIME_OF_DAY_BANDS.length - 1];
};
