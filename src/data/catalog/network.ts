// ============================================================================
// EarthOnline · 关系图谱的展示词表（静态设定，不入存档）
//
// 这里只放"怎么念"，不放"怎么算"。算法的门槛在 selectors.ts，
// 关系本身的类型定义在 types/network.ts —— 三者分开，是为了以后改文案
// 不必碰判定逻辑（也为了让判定逻辑可以脱离文案被单独验）。
//
// 一条贯穿全表的语气约束（承 types/network.ts 的设计立场）：
//   **不许出现评判人的词。**「弱连接」是结构描述，「人脉价值低」是把人当资产。
//   评级同理：只描述状态，不描述优劣。
// ============================================================================

import type { Contact, Interaction, RelationGrade, RelationStage, RelationType } from '@/types';

/**
 * 全量关系类型清单。
 *
 * 它存在的唯一理由是 `byType: Record<RelationType, number>` 需要**全键**：
 * 只统计出现过的类型，会让"我一条投资人都没有"这件事在界面上变成空白 ——
 * 而空白恰好是这个产品最该让玩家看见的东西。
 */
export const RELATION_TYPES: readonly RelationType[] = [
  'mentor',
  'peer',
  'collaborator',
  'investor',
  'romantic',
  'friend',
  'family',
  'acquaintance',
  'other',
] as const;

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  mentor: '指导者',
  peer: '同侪',
  collaborator: '合作者',
  investor: '甲方 / 投资人',
  romantic: '在意的人',
  friend: '朋友',
  family: '家人',
  acquaintance: '认识的人',
  other: '其他',
};

/**
 * 关系等级的**呈现顺序** —— 前六档由浅到深，后两档是状态，排在最后。
 *
 * 顺序写在这里而不是每次 `Object.keys`：键的顺序是对象字面量的偶然产物，
 * 而这一行是要印在玩家眼前的一把尺子 —— 它得是从浅到深的那一把。
 */
export const RELATION_STAGES: readonly RelationStage[] = [
  'stranger',
  'known',
  'connected',
  'trusted',
  'close',
  'deep',
  'strained',
  'dormant',
] as const;

export const RELATION_STAGE_LABELS: Record<RelationStage, string> = {
  stranger: '刚认识',
  known: '点头之交',
  connected: '有来往',
  trusted: '可托付小事',
  close: '互相主动',
  deep: '长期同行',
  strained: '有裂痕',
  dormant: '沉寂中',
};

/** 互动渠道 —— 用动词，不用名词。关系是靠动作维持的。 */
export const CHANNEL_LABELS: Record<Interaction['channel'], string> = {
  wechat: '微信',
  message: '消息',
  call: '通话',
  meeting: '见面',
  meal: '一起吃饭',
  email: '邮件',
  gift: '送了个东西',
  collab: '一起做事',
  other: '其他',
};

/**
 * 评级的语气。刻意**不用颜色区分好坏**：
 * S 与 D 在这里是同样一种灰蓝，只有一个小圆点。理由是这张卡片
 * 记录的是"我和这个人现在处在什么状态"，不是"这个人值多少分"。
 * 红黄绿一旦出现，玩家就会开始优化它 —— 那就变成了另一种刷分游戏。
 *
 * ⚠️ 目前**没有界面印它**：`currentGrade` 是观测值（从四维算出来的），
 * 而卡片上现在写着的是玩家自己定的关系等级 —— 两个词回答同一个问题，
 * 摆在一起必然打架（`S` 的语气正是「长期同行」，与等级里的 `deep` 一字不差）。
 * 数据仍在、快照仍在，等重算那块做完再决定要不要让它回来。
 */
export const GRADE_NOTE: Record<RelationGrade, string> = {
  S: '长期同行',
  A: '稳定可信',
  B: '有来有往',
  C: '联络偏少',
  D: '几近失联',
};

/**
 * 手动添加一个人时，给他的"联系节奏"起步值（天）。
 *
 * 它不会立刻产生任何提醒 —— 新联系人的 `nextTouchAt` 是 null，
 * 超期判定读的正是那个字段。这个数字要等到**第一次互动之后**才第一次被用到
 * （那时才有 `lastContactAt + cadence` 可算）。取 30 而不是三位老联系人那样的
 * 14/21：那三个人的节奏是玩家自己处出来的，而一个刚被记下来的人，
 * 我们连他该多久联系一次都不知道 —— 起步值只该负责"别那么快开始催"。
 */
export const DEFAULT_CONTACT_CADENCE_DAYS = 30;

/** 卡片头部那一行"怎么认识的"：org + role 拼起来，缺哪个就退到哪个 */
export const contactSubtitle = (c: Contact): string =>
  [c.profile.org, c.profile.role].filter(Boolean).join(' · ') || c.profile.field || '（未记录出处）';
