import { useEffect, useMemo, useState } from 'react';
import { BreakpointBadge } from '@/components/dev/BreakpointBadge';
import { AgentBusyOverlay } from '@/components/hud/AgentBusyOverlay';
import { AgentToast } from '@/components/hud/AgentToast';
import { AchievementOvation } from '@/components/hud/AchievementOvation';
import { ChapterCeremony } from '@/components/hud/ChapterCeremony';
import { ChapterPlate } from '@/components/hud/ChapterPlate';
import { RolloverNotice } from '@/components/hud/RolloverNotice';
import { StatusHud } from '@/components/hud/StatusHud';
import { DesktopRail, MobileDock } from '@/components/nav/DockNav';
import { ArchivePanel } from '@/components/panels/ArchivePanel';
import { AttributePanel } from '@/components/panels/AttributePanel';
import { HallOfFamePanel } from '@/components/panels/HallOfFamePanel';
import { BountyPanel } from '@/components/panels/BountyPanel';
import { JournalPanel } from '@/components/panels/JournalPanel';
import { NetworkPanel } from '@/components/panels/NetworkPanel';
import { PanelPlaceholder } from '@/components/panels/PanelPlaceholder';
import { RoutinePanel } from '@/components/panels/RoutinePanel';
import { SanctuaryPanel } from '@/components/panels/SanctuaryPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import { VaultPanel } from '@/components/panels/VaultPanel';
import { SceneAnchors } from '@/components/scene/SceneAnchors';
import { SceneCanvas, preloadAllTimeOfDayVariants } from '@/components/scene/SceneCanvas';
import { GUANGHUA_SCENE, bandForHour, getScene } from '@/data/catalog/scenes';
import { useDailyRollover } from '@/hooks/useDailyRollover';
import { useNow } from '@/hooks/useNow';
import type { PanelKey } from '@/lib/panels';
import { hasApiKey } from '@/lib/secretStore';
import {
  a9Progress,
  buildAnchorContext,
  buildHudSnapshot,
  navBadges,
  visibleAnchors,
} from '@/lib/selectors';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';

/**
 * 《地球OL》主界面。
 *
 * 结构只有一句话：**场景是画布，界面是浮在画布上的标签。**
 * 所以 DOM 是"一层背景 + 若干绝对定位的浮层"，中间没有流式布局容器 ——
 * 一旦出现 reflow 就会破坏"这是一个空间"的错觉。
 *
 * 布局断点只有一处：768px（Tailwind 的 md）。
 *   < 768   手机：右上紧凑 HUD、左上篇章铭牌、底部 Dock 开 Sheet
 *   ≥ 768   PC  ：右上作战室卡片、左上铭牌带题记、左侧竖栏开右侧面板，
 *                 且面板刻意避开画面中央 —— 背景自始至终是可见的
 *
 * 面板路由只有一处分支，按"任务流走到哪一段"来分：
 *   「悬赏」→ BountyPanel    四联中枢：悬赏板 / 进行中 / 待议 / 灵感（含 Spark Box）
 *   「日常」→ RoutinePanel   周期性自律：每日任务 + 每周任务（执行中任务已迁往悬赏）
 *   「日记」→ JournalPanel   结算之后的归宿：成功日记查看器
 *   「金库」→ VaultPanel     结算之后攒下的东西：钱 + 能力（含职业履历与篇章定位）
 *   「关系」→ NetworkPanel   与任务流平行的一条线：联系人 + 社交智囊 + 全局检索
 *   「属性」→ AttributePanel 玻璃幕墙：六维 + 自由加点（不入 Dock 的第二块面板）
 *   「档案」→ ArchivePanel   不在任务流上：回头看的那一页（篇章 / 里程碑 / 进化树）
 *   「成就」→ HallOfFamePanel 也不在任务流上：这一页上挂的全是**玩家自己挣来的**
 *                            （六栏徽记，题目与线索都由 catalog/achievements 说了算）
 *   「圣殿」→ SanctuaryPanel 很远的地方：五大终极目标 + 至高科技树 + UR 综合进度
 *                            （不挂任务流，也不藏 —— "抬头就能看见要去的地方"）
 *   「设置」→ SettingsPanel  控制室：AI 总线 / 存档安全 / 危险区（不入 Dock，从 HUD 齿轮进）
 *   十个面板至此全部接管，PanelPlaceholder 退成兜底。
 *
 * 另外挂了四层全局件：
 *   · **场景锚点**（SceneAnchors）：上面这些面板的第二个入口。手机端的
 *     「关系」「属性」「圣殿」没有进 Dock（见 lib/panels.ts 的说明），分别从场景里的
 *     「有人刚好抬头」「玻璃幕墙」「天边」进去 —— 界面上的东西该长在场景里。
 *   · **跨天结算**（RolloverNotice z-70）、**AI 运转遮罩**（AgentBusyOverlay z-80）、
 *     **提示条**（AgentToast z-85）、**金色光晕**（AchievementOvation z-88）
 *     与 **通关仪式**（ChapterCeremony z-90）：
 *     挂在根层而不是某个面板里，因为它们跟"你正在看哪一页"无关。
 *     四者的高低次序见下方 JSX 里的说明。
 */
export default function App() {
  const now = useNow();
  const save = useSave();
  const persistIfFresh = useEarthOnlineStore((s) => s.persistIfFresh);
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);

  // 跨天结算：开机、跨天、切回前台三个时机都会问到（见 useDailyRollover）
  useDailyRollover(now);

  // 挂载时做两件事：把新建的存档落盘；把其余时段背景图预热一遍
  useEffect(() => {
    persistIfFresh();
    preloadAllTimeOfDayVariants(save.world.activeSceneId);
    // 有意只跑一次：这两件事都与"当前状态"无关
  }, [persistIfFresh, save.world.activeSceneId]);

  // ESC 关面板（PC 端的常规预期；手机端有遮罩与 ✕）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scene = getScene(save.world.activeSceneId);
  const band = bandForHour(now.getHours());
  const hud = buildHudSnapshot(save, now);
  const a9 = a9Progress(save);

  // 锚点可见性：规则在 selectors，这里只负责把当前世界状态递进去
  const anchorCtx = useMemo(() => buildAnchorContext(save, now), [save, now]);

  // 角标口径统一在 selectors.navBadges 里（含"日常"那一格的合并计数裁定）——
  // 组件层只负责把当前状态递进去，不负责决定"什么算一件等你的事"。
  const badges = useMemo(() => navBadges(save, now), [save, now]);

  const togglePanel = (key: PanelKey) => setActivePanel((prev) => (prev === key ? null : key));

  /**
   * 控制室那个小圆点：只标**需要你动手的事**，不标"有新东西"。
   * 两种来源 —— 打开了真实轨道却没有密钥、或者熔断开着。
   *
   * 没配密钥本身不是错误（Mock 轨道是完整可玩的），但"你以为在用真身、
   * 其实在走模板"这件事必须被说出来。这条红点说的是这个，不是催你充值。
   */
  const hasSettingsAlert = useMemo(
    () => (!save.ai.mockModeEnabled && !hasApiKey()) || save.ai.circuitBreaker.open,
    [save.ai.mockModeEnabled, save.ai.circuitBreaker.open],
  );

  return (
    <div className="app-shell relative w-full overflow-hidden bg-ink-950 text-white">
      {/* ① 场景：唯一的背景层，也是整个界面的本体 */}
      <SceneCanvas
        sceneId={save.world.activeSceneId}
        timeOfDay={hud.timeOfDay}
        overlayRgba={band.filter.overlay}
        vignetteEnabled={save.settings.vignetteEnabled}
        sceneName={scene?.name ?? '光华楼'}
      />

      {/* ② 浮层：全部绝对定位，互不 reflow */}
      <ChapterPlate chapterId={save.chapters.focusedChapterId} />
      <StatusHud
        hud={hud}
        a9={a9}
        onOpenVault={() => setActivePanel('vault')}
        onOpenSettings={() => setActivePanel((prev) => (prev === 'settings' ? null : 'settings'))}
        settingsAlert={hasSettingsAlert}
      />

      {/* 场景锚点在导航下面：它们是画面的一部分，不该盖住 Dock 与 HUD */}
      <SceneAnchors
        anchors={visibleAnchors(scene ?? GUANGHUA_SCENE, anchorCtx)}
        activePanel={activePanel}
        onOpen={(key) => setActivePanel((prev) => (prev === key ? null : key))}
      />

      <DesktopRail activePanel={activePanel} onSelect={togglePanel} badges={badges} />
      <MobileDock activePanel={activePanel} onSelect={togglePanel} badges={badges} />

      {activePanel === 'bounty' ? (
        <BountyPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'dailies' ? (
        <RoutinePanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'journal' ? (
        <JournalPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'vault' ? (
        <VaultPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'network' ? (
        <NetworkPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'attributes' ? (
        <AttributePanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'archive' ? (
        <ArchivePanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'hall' ? (
        <HallOfFamePanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'sanctuary' ? (
        <SanctuaryPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : activePanel === 'settings' ? (
        <SettingsPanel panel={activePanel} onClose={() => setActivePanel(null)} />
      ) : (
        <PanelPlaceholder panel={activePanel} onClose={() => setActivePanel(null)} />
      )}

      {/*
        根层的五件浮层，按 z 从低到高：
        结算 70 / 遮罩 80 / 提示条 85 / 金色光晕 88 / 仪式 90。
        它们都不在面板里面 —— 因为这五件事跟"你正在看哪一页"无关。

        ① 跨天结算：可能在你刚打开应用时就站在你面前
        ② AI 遮罩：AI 在等的时候，整个界面对你都是"忙着"的，
           所以它必须能盖住任何面板，也必须能盖住结算
        ③ 提示条：一次调用的结果（降级了、没接上）。它在遮罩之上，
           因为提示常常与下一次调用同时发生（见 AgentToast 的文件头）
        ④ 金色光晕：一枚徽记点亮。它够重，所以压得住任何面板；
           但它没有重到能把一个人一生只有几次的那件事挡住
        ⑤ 通关仪式：一个人一辈子只遇到几次的事，
           在它面前，上面四层都该让路
      */}
      <RolloverNotice />
      <AgentBusyOverlay />
      {/* 提示条压在遮罩**之上**（85 vs 80）：提示常在"上一个 Agent 刚跑完、
          下一个已起跑"的那一刻出现，压在下面会整条寿命都花在遮罩背后 */}
      <AgentToast />
      {/* 金色光晕排在 88：一次点击若既通关了一章又点亮了徽记，先让路给仪式
          （一生几次的事），徽记在它背后等着 —— 队列存在存档里，不会丢 */}
      <AchievementOvation />
      <ChapterCeremony />

      {/* ③ 开发期标尺：F12 切设备时用来确认"现在落在哪一端" */}
      <BreakpointBadge />
    </div>
  );
}
