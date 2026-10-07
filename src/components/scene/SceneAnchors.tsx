import { cn } from '@/lib/cn';
import type { PanelKey } from '@/lib/panels';
import type { AnchorBinding, SpatialAnchor } from '@/types';

interface SceneAnchorsProps {
  /** 已经过 visibleAnchors 过滤的锚点（判定是 selectors 的责任，不是组件的） */
  anchors: SpatialAnchor[];
  /** 当前面板，用于把对应的锚点点亮 —— "你正站在这里" */
  activePanel: PanelKey | null;
  onOpen: (panel: PanelKey) => void;
}

/**
 * 场景空间锚点层。
 *
 * 这是整个产品里最"AVG"的一块：界面上的东西不挂在工具栏上，而是**长在场景里**。
 * 「今日公告栏」在草坪左边，「任务灯」在右边，「实验室的窗」在楼里 ——
 * 玩家记住的是位置，不是按钮。
 *
 * 它同时也是手机端进入「关系」的唯一入口（关系不进 Dock，见 lib/panels.ts）。
 *
 * 三件事刻意这么做：
 *
 * ① **锚点不是图标，是"那里有个东西"。**
 *    所以不画图标，只画一个小亮点 + 一行字。场景图本身就是图标；
 *    再叠一个 SVG 上去，画面立刻从"一个地方"退回成"一张贴了按钮的图"。
 *
 * ② **标签常显，提示词只在悬停时出现。**
 *    手机上没有 hover。如果标签也藏起来，触屏玩家就只剩几个不知道是什么的点。
 *    但 `hoverHint` 那句 AVG 旁白（"凌晨两点，那一层的灯通常只有你"）
 *    只该在你把注意力放上去时出现 —— 一直挂着就变成了标语。
 *
 * ③ **"能不能看见"与"点了去哪"是两个问题。**
 *    前者在 selectors.visibleAnchors（可被 verify-ops 钉住），
 *    后者在下面的 panelForBinding（纯路由）。组件本身不做判断。
 */
export function SceneAnchors({ anchors, activePanel, onOpen }: SceneAnchorsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {anchors.map((a) => (
        <AnchorItem
          key={a.id}
          anchor={a}
          active={panelForBinding(a.binding) === activePanel}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

/**
 * 锚点 → 面板。返回 null 表示"这个锚点不该是可点的"。
 *
 * `career` 落在金库面板：职业履历是它的下半部分（等级 / EXP / 头衔），
 * 给职业线单开一块面板会让"我现在有几条线"这件事失掉全局视图。
 * `quest` 落在日常面板：点某一条具体任务，要看到的是它现在处在哪一步。
 * `chapter_intro` 落在档案面板：篇章履历本来就是那里最该有的东西。
 * `attributes` 落在属性面板：玻璃幕墙是它唯一的手机端入口（第二块不入 Dock 的面板）。
 */
const panelForBinding = (b: AnchorBinding): PanelKey | null => {
  switch (b.type) {
    case 'quest_board':
      return 'bounty';
    case 'daily_board':
    case 'quest':
      return 'dailies';
    case 'attributes':
      return 'attributes';
    case 'journal':
      return 'journal';
    case 'vault':
    case 'career':
      return 'vault';
    case 'network':
    case 'contact':
      return 'network';
    case 'chapter_intro':
      return 'archive';
    /**
     * 某一扇窗不再是暗的 → 去档案馆看那棵树。
     *
     * Phase 2 这里返回的是 null（"隐藏目标不给出任何入口，它自己会亮"）。
     * 那句话的前半截仍然对 —— 雾里的时候它根本不出现（visibleAnchors 的铁律 ①）；
     * 但它一旦出现，就说明雾已经散了，而这时候**点不动才是怪的** ——
     * 玩家刚刚亲眼看见一扇窗亮起来，伸手去点，然后什么也没发生。
     *
     * 入口指向档案馆：进化树就在那一页的第三节。没有为它单开一块面板 ——
     * 它是一件"已经发生过的事"，该和篇章履历、里程碑躺在同一份档案里。
     */
    case 'evolution_tree':
      return 'archive';
    /**
     * 天边 —— 圣殿在手机端的唯一入口（第三块不入 Dock 的面板，与关系、属性同一种走法）。
     *
     * 它不禁雾也不必禁：圣殿本身对雾是免疫的 —— 五张目标卡是明牌，
     * 那棵树在殿内也只以"空槽"的形状出现。所以这个锚点从一开始就可以站人，
     * 与「实验室的窗」不同：那扇窗后面就是雾本身。
     */
    case 'sanctuary':
      return 'sanctuary';
    // 纯装饰：画出来，但点不动 —— 场景里有些东西就是不该有反馈
    case 'none':
      return null;
  }
};

function AnchorItem({
  anchor,
  active,
  onOpen,
}: {
  anchor: SpatialAnchor;
  active: boolean;
  onOpen: (panel: PanelKey) => void;
}) {
  const panel = panelForBinding(anchor.binding);

  const body = (
    <>
      {/* scale 只作用在视觉件上，不作用在点击热区 —— 远处的锚点必须一样好点 */}
      <span
        className="flex items-center gap-2"
        style={{ transform: `scale(${anchor.scale})`, transformOrigin: 'center' }}
      >
        <span
          className={cn(
            'relative flex h-2 w-2 shrink-0 items-center justify-center rounded-full transition-all duration-500 ease-cinematic',
            active ? 'bg-amber-400' : 'bg-white/45 group-hover:bg-amber-300',
          )}
        >
          <span
            className={cn(
              'absolute inset-0 rounded-full transition-opacity duration-500',
              active
                ? 'animate-dot-pulse bg-amber-400/60'
                : 'bg-white/25 opacity-0 group-hover:animate-dot-pulse group-hover:opacity-100',
            )}
          />
        </span>

        <span
          className={cn(
            'whitespace-nowrap text-[11px] tracking-wide transition-colors duration-300',
            panel === null ? 'text-white/35' : active ? 'text-amber-200' : 'text-white/55 group-hover:text-white/90',
          )}
          style={{ textShadow: '0 1px 6px rgba(0,0,0,0.75)' }}
        >
          {anchor.label}
        </span>
      </span>

      {/* AVG 旁白：只在指针停留时浮出来，且只给有指针的设备 */}
      {anchor.hoverHint && (
        <span className="prose-cinematic pointer-events-none absolute left-1/2 top-full mt-2 hidden w-[15rem] -translate-x-1/2 rounded-lg border border-white/10 bg-ink-950/80 px-2.5 py-2 text-left text-[11.5px] leading-relaxed text-white/70 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 md:block">
          {anchor.hoverHint}
        </span>
      )}
    </>
  );

  const position = { left: `${anchor.xPct * 100}%`, top: `${anchor.yPct * 100}%` } as const;

  // 装饰性锚点不套 button —— 一个点不动的按钮比一个不存在的按钮更让人恼火
  if (panel === null) {
    return (
      <span
        aria-hidden
        className="group absolute -translate-x-1/2 -translate-y-1/2 px-3 py-2"
        style={position}
      >
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={anchor.label}
      aria-current={active ? 'true' : undefined}
      onClick={() => onOpen(panel)}
      className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-2 focus:outline-none"
      style={position}
    >
      {body}
    </button>
  );
}
