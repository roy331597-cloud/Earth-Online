// ============================================================================
// EarthOnline · Phase 2 · 面板注册表
//
// 手机端的 Dock 与 PC 端的侧栏必须是**同一份定义**，
// 否则两端会长出两套入口，Phase 3 填充内容时必然分叉。
//
// 有三块面板在手机端不进 Dock：它们由场景里的锚点进入
// （「关系」走 NPC 锚点 anchor_someone，「属性」走玻璃幕墙 anchor_glass_wall，
//  「圣殿」走天边 anchor_horizon），这是 AVG 的走法 ——
// 界面上的东西应该长在场景里，而不是长在工具栏上。
// 圣殿为什么也不进 Dock：Dock 六项在 375px 宽下每项 ~58px 已是舒适下限，
// 七项会掉到 ~45px（320px 的机器上 ~37px，直接破了 44px 的拇指下限），
// 而"路线不清"的代价比"多点一步"大得多（见 DockNav 的注释）。
// 但 PC 侧栏仍然列出来：横屏下侧栏是常驻的，藏东西只会让人找不到。
//
// 「陈列馆」**没有**走上面那条路，这是 Phase 5 的一个取舍，理由有三条：
//   ① 它与档案馆确实是同一件事的两面（一个收证据，一个收名字），但它长了
//      23 枚徽记 + 6 栏题记，塞进档案馆会让那一页的长度翻一倍，
//      而"回头看"这件事本来就不该是一条越滚越长的流水账；
//   ② 场景锚点是给**画面里真有那个东西**的入口（NPC、幕墙）—— 墙上挂徽记
//      得先在场景美术里画出一面墙，而这是拿不存在的场景去圆一个导航决定；
//   ③ 它是这一期唯一一个内容**全部由玩家自己挣来**的页面，值得一个平级的门。
// 手机端 Dock 因此从五项变成六项：375px 宽下每项仍有 ~58px 的热区，
// 高于 44px 的拇指下限（见 DockNav 的注释）。
// ============================================================================

export type PanelKey =
  | 'bounty'
  | 'dailies'
  | 'journal'
  | 'archive'
  | 'vault'
  | 'hall'
  | 'sanctuary'
  | 'network'
  | 'attributes'
  | 'settings';

export interface PanelMeta {
  key: PanelKey;
  /** Dock 上的短标签 */
  label: string;
  /** 面板标题 */
  title: string;
  /** 一句话副标题，用场景里的语气，不用功能说明书的语气 */
  tagline: string;
  iconKey: IconKey;
  /** 是否出现在手机端底部 Dock */
  inMobileDock: boolean;
  /** 是否出现在 PC 端左侧竖栏 */
  inDesktopRail: boolean;
}

export type IconKey =
  | 'board'
  | 'lamp'
  | 'book'
  | 'archive'
  | 'vault'
  | 'medal'
  | 'star'
  | 'person'
  | 'hex'
  | 'gear';

export const PANELS: PanelMeta[] = [
  {
    key: 'bounty',
    label: '悬赏',
    title: '任务悬赏',
    tagline: '该做的事，都在这儿了。',
    iconKey: 'board',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'dailies',
    label: '日常',
    // 标题定为「日常任务」：面板里住着每日与每周两层，两条都在"日常"名下。
    // 中途试过更文气的「规程」，两栏分家之后又换回来了 —— 玩家一眼先看到的
    // 是两颗直白的标签（每日任务 / 每周任务），标题就不该再端着。
    // label 仍是「日常」—— Dock 上要的是最短的字，不是最准的字。
    title: '日常任务',
    tagline: '灯还亮着，说明今天还没做完。',
    iconKey: 'lamp',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'journal',
    label: '日记',
    title: '成功日记',
    tagline: '写完你会发现，今天其实没那么糟。',
    iconKey: 'book',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'archive',
    label: '档案',
    title: '档案馆',
    tagline: '你留下来的每一件证据，都按时间收在这里。',
    iconKey: 'archive',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'vault',
    label: '金库',
    title: '金库',
    tagline: '它不是为了买什么，是为了让你有权说不。',
    iconKey: 'vault',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'hall',
    label: '成就',
    // 标题用「陈列馆」而不是「成就」：这一页上挂的不是分数，是**东西**。
    // 叫「成就」的话，它会读起来像一个进度页面，而它其实是一面墙。
    title: '成就陈列馆',
    tagline: '有些事你早就做到了，只是还没人给它起过名字。',
    iconKey: 'medal',
    inMobileDock: true,
    inDesktopRail: true,
  },
  {
    key: 'sanctuary',
    label: '圣殿',
    // 标题用「愿景圣殿」：叫「终局」太像说明书，叫「目标」又太像待办。
    // 愿景是它唯一合适的名字 —— 还没发生，但已经算数。
    title: '愿景圣殿',
    tagline: '所有还很远的事，在这里都有一个坐标。',
    iconKey: 'star',
    inMobileDock: false, // 手机端由「天边」锚点进入
    inDesktopRail: true,
  },
  {
    key: 'network',
    label: '关系',
    title: '关系图谱',
    tagline: '你想起有个人，很久没联系了。',
    iconKey: 'person',
    inMobileDock: false, // 手机端由场景里的 NPC 锚点进入
    inDesktopRail: true,
  },
  {
    key: 'attributes',
    label: '属性',
    title: '人物属性',
    tagline: '你在长成什么样，这件事由你决定。',
    iconKey: 'hex',
    inMobileDock: false, // 手机端由玻璃幕墙锚点进入
    inDesktopRail: true,
  },
  {
    key: 'settings',
    label: '设置',
    // 称呼上刻意避开"系统设置"——这个应用里没有"系统"，只有一间**控制室**。
    // 一个 AVG 不该在某个角落突然变成一台路由器。
    title: '控制室',
    tagline: '后台在跑什么、东西存在哪儿，这里是唯一说实话的地方。',
    iconKey: 'gear',
    // 两端都不进常规导航：手机端在 HUD 右上角的齿轮，PC 端也在右上角。
    // 它是"后台"，不该和五个日常面板并排站在一起（入口见 StatusHud）。
    inMobileDock: false,
    inDesktopRail: false,
  },
];

export const mobileDockPanels = PANELS.filter((p) => p.inMobileDock);
export const desktopRailPanels = PANELS.filter((p) => p.inDesktopRail);

export const getPanel = (key: PanelKey): PanelMeta =>
  PANELS.find((p) => p.key === key) ?? PANELS[0];
