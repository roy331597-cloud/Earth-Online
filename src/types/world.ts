// ============================================================================
// EarthOnline · Phase 1 · 场景 / 空间锚点 / HUD 类型 (world.ts)
// 职责：场景即界面 (Scene-as-Canvas) 的数据契约
//
// 注意：这里只定义数据。所有渲染属于 Phase 2。
// ============================================================================

import type {
  AnchorId,
  DateKey,
  ISODateTime,
  SceneId,
  QuestId,
  ContactId,
  ClassIdLiteral,
} from './core';

// ---------------------------------------------------------------------------
// 1. 时间感 (Time of Day)
// ---------------------------------------------------------------------------

/**
 * HUD 上显示的时段。玩家要求：上午 / 下午 / 黄昏 / 深夜。
 * 这里补一个「清晨」：凌晨 4-7 点的人群（本项目 PO 就可能属于这一群），
 * 用一个专属时段来正向反馈，比归入"深夜"更友好。
 */
export type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night' | 'deepnight';

export interface TimeOfDayBand {
  timeOfDay: TimeOfDay;
  label: string;      // '清晨' / '上午' ...
  fromHour: number;   // 含
  toHour: number;     // 不含
  /** 场景滤镜叠加（Phase 2 用） */
  filter: {
    /** 叠加色，rgba 字符串 */
    overlay: string;
    /** 建议的背景图变体 key，如 'default_dusk' */
    variantKey: string;
  };
  /** 注入给 AI 的氛围词，用于任务文案的时段适配 */
  moodWords: string[];
}

// ---------------------------------------------------------------------------
// 2. 场景 (Scene)
// ---------------------------------------------------------------------------

export interface SceneVignette {
  enabled: boolean;
  /** 暗角强度 0..1 */
  intensity: number;
  color: string;
}

/** 场景背景图的多时段变体 */
export interface SceneBackgroundSet {
  default: string;
  dawn?: string;
  morning?: string;
  afternoon?: string;
  dusk?: string;
  night?: string;
  deepnight?: string;
}

/**
 * 空间锚定标签：绝对定位悬浮在场景的透视位置。
 * 定位用百分比而非像素 —— 手机端与桌面端必须共用同一份数据。
 */
export interface SpatialAnchor {
  id: AnchorId;
  /** 显示文本，如「光华楼」 */
  label: string;
  /** 水平位置 0..1（相对场景宽度） */
  xPct: number;
  /** 垂直位置 0..1（相对场景高度） */
  yPct: number;
  /** 视觉缩放，用于伪造景深（远处的建筑 label 小一点） */
  scale: number;
  /** 锚点类型决定交互行为 */
  kind: 'building' | 'quest_board' | 'npc' | 'terminal' | 'ambient';
  /** 点击后打开哪个面板 */
  binding: AnchorBinding;
  iconKey: string | null;
  /** 条件显示：不满足时完全不渲染 */
  visibleWhen: AnchorVisibility | null;
  /** 悬停/点击时的提示文案（AVG 风格的一句话） */
  hoverHint: string;
  /** 该锚点是否已解锁（有些锚点随篇章解锁） */
  unlocked: boolean;
}

/** 锚点点击后打开什么 */
export type AnchorBinding =
  | { type: 'quest_board' }
  | { type: 'career'; classId: ClassIdLiteral }
  | { type: 'network' }
  | { type: 'journal' }
  | { type: 'vault' }
  | { type: 'evolution_tree' }        // ⚠️ 仅在 revealed 后可用
  | { type: 'sanctuary' }              // 天边 —— 终局愿景圣殿（第三块不入 Dock 的面板）
  | { type: 'daily_board' }
  | { type: 'attributes' }             // 玻璃幕墙 —— 人物属性面板（不入 Dock 的独立入口）
  | { type: 'quest'; questId: QuestId }
  | { type: 'contact'; contactId: ContactId }
  | { type: 'chapter_intro' }
  | { type: 'none' };                  // 纯装饰

export interface AnchorVisibility {
  /** 需要处于这些时段才显示 */
  timeOfDay?: TimeOfDay[];
  /** 需要已解锁的篇章 */
  chapterIds?: string[];
  /** 需要某个日常在今日未完成（用于"提醒式"锚点） */
  requiresPendingDaily?: boolean;
  /** 需要某个任务处于 active 状态 */
  requiresActiveQuest?: boolean;
  /** 需要进化树已揭示 */
  requiresEvolutionRevealed?: boolean;
}

export interface Scene {
  id: SceneId;
  /** 中文场景名，如「光华楼 · 夜」 */
  name: string;
  /** 场景类型，决定 HUD 的地点语义 */
  locationKind: 'campus' | 'city' | 'lab' | 'home' | 'transit' | 'abroad' | 'abstract';
  backgrounds: SceneBackgroundSet;
  vignette: SceneVignette;
  anchors: SpatialAnchor[];
  /** 该场景的默认时段变体策略；null 表示跟随真实时间 */
  fixedTimeOfDay: TimeOfDay | null;
  /** 场景解锁条件（篇章） */
  unlockedByChapterIds: string[];
  /** 场景描述，进入时以 AVG 字幕形式出现一次 */
  introLine: string;
}

// ---------------------------------------------------------------------------
// 3. HUD
// ---------------------------------------------------------------------------

export type LocationMode = 'fixed' | 'gps';

/**
 * 右上角沉浸式药丸卡片的数据源。
 * 全部为**派生数据**（由 selector 从真实时间与存档计算），不入库。
 */
export interface HudSnapshot {
  /** 真实时间 */
  now: ISODateTime;
  localTimeLabel: string;     // '23:41'
  localDate: DateKey;
  timeOfDay: TimeOfDay;
  timeOfDayLabel: string;     // '深夜'
  /** 当前地点 */
  locationMode: LocationMode;
  locationLabel: string;      // '光华楼 · 西辅楼'
  sceneId: SceneId;
  /** 一句话状态，AVG 语气，随机/条件生成，给沉浸感收尾 */
  ambientLine: string;
  /** 简短数值摘要，展开态才显示 */
  quickStats: {
    level: number;
    activeClassTitle: string;
    activeQuestCount: number;
    pendingDailyCount: number;
    netWorthLabel: string;
  };
  /** 是否处于"深夜建议休息"状态（只提示，不阻拦） */
  suggestRest: boolean;
}

export interface WorldState {
  /** 当前激活场景 ID（也存在 Player.currentSceneId，这里为场景运行时状态） */
  activeSceneId: SceneId;
  /** 所有已解锁场景 */
  unlockedSceneIds: SceneId[];
  /** 玩家自定义的固定地点名（当 locationMode === 'fixed'） */
  customLocationLabel: string | null;
  /** 每个场景的锚点覆盖（玩家可拖动锚点位置，Phase 2） */
  anchorOverrides: Record<AnchorId, { xPct: number; yPct: number } | undefined>;
  /** 是否允许 GPS（默认关闭，隐私优先） */
  gpsAllowed: boolean;
  /** 上次 GPS 定位结果与时间（若开启） */
  lastGpsFix: { label: string; lat: number; lng: number; at: ISODateTime } | null;
}
