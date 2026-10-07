// ============================================================================
// EarthOnline · Phase 1 · 社交关系图谱类型 (network.ts)
// 职责：联系人客观数据库 + 互动记录 + AI 社交策略建议
//
// 设计立场（重要）：
//   这是一个"客观记录 + 复盘"工具，不是"攻略工具"。
//   关系评级(grade)是冷冰冰的观测值，用于提醒"你多久没联系了"，
//   而不是用来给一个人打分。UI 呈现必须弱化分数的攻击性。
// ============================================================================

import type {
  AgentId,
  ClassIdLiteral,
  ContactId,
  DateKey,
  Id,
  ISODateTime,
  QuestId,
} from './core';

/** 关系类型 */
export type RelationType =
  | 'mentor'        // 导师 / 前辈
  | 'peer'          // 同学 / 同侪
  | 'collaborator'  // 合作者 / 同事
  | 'investor'      // 投资人 / 甲方
  | 'romantic'      // 恋爱 / 暧昧对象
  | 'friend'        // 挚友
  | 'family'        // 家人
  | 'acquaintance'  // 弱连接
  | 'other';

/**
 * 关系等级 —— **由玩家自己定**的一把尺子（落在 `Contact.stage`，卡片上随时可改）。
 *
 * 前六档是一条由浅到深的梯子；后两档不是深度，是状态（有裂痕 / 沉寂中）——
 * 它们同样是玩家的判断，而不是系统的判定：一个人是不是"沉寂中"，
 * 你比任何超期天数都清楚。
 *
 * 它同时是喂给 AI 的上下文（"该说什么不该说什么"），所以八档都要能被读成人话。
 */
export type RelationStage =
  | 'stranger'      // 陌生
  | 'known'         // 认识，点头之交
  | 'connected'     // 有实质交流
  | 'trusted'       // 信任，可求教/可托付小事
  | 'close'         // 亲近，互相主动
  | 'deep'          // 深度绑定（挚友/伴侣/长期伙伴）
  | 'strained'      // 有裂痕，需修复
  | 'dormant';      // 沉寂，需重启

/**
 * 四维客观评分 (0-100)。
 * 之所以用四维而非单一"好感度"：
 *   单维好感度会诱导玩家把关系当成刷数值的游戏，四维能表达"我尊敬他但不喜欢他"。
 */
export interface RelationDimensions {
  /** 亲近度：情感距离，聊天的自然程度 */
  warmth: number;
  /** 信任度：对方愿意把重要的事告诉你 / 交给你的程度 */
  trust: number;
  /** 影响力：对方在其领域的分量（用于判断这段关系对你的杠杆） */
  influence: number;
  /** 双向度：对方是否也会主动找你（单向投入的关系会持续消耗你） */
  reciprocity: number;
}

/** 由四维加权 + 时间衰减计算出的观测评级 */
export type RelationGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface GradeSnapshot {
  grade: RelationGrade;
  /** 计算时使用的总分（0-100） */
  score: number;
  computedAt: ISODateTime;
}

/** 一次互动记录 */
export interface Interaction {
  id: Id<'Interaction'>;
  contactId: ContactId;
  ts: ISODateTime;
  localDate: DateKey;
  channel: 'wechat' | 'message' | 'call' | 'meeting' | 'meal' | 'email' | 'gift' | 'collab' | 'other';
  summary: string;
  /** 主观感受，用于复盘 */
  sentiment: 'positive' | 'neutral' | 'strained' | 'unclear';
  /** 本次互动带来的四维变化（可正可负） */
  delta: Partial<RelationDimensions>;
  /** 是否是我主动发起 */
  initiatedByMe: boolean;
  /** 后续待办：如"下周三把资料发给他" */
  followUpAt: ISODateTime | null;
  followUpNote: string | null;
  /** 若该互动由某个任务驱动 */
  questId: QuestId | null;
}

/** 联系人的客观档案 */
export interface Contact {
  id: ContactId;
  name: string;
  /** 备注名/昵称 */
  alias: string | null;
  avatarUrl: string | null;
  relationType: RelationType;
  /**
   * 关系等级 —— **名单上唯一由你亲手定的一栏**（卡片上点一下就改）。
   *
   * 它和 `dimensions` / `currentGrade` 的分工是这套数据结构里最要紧的一条：
   * 那两样是**观测值**（从你们的互动里算出来的），这一条是**你自己的判断** ——
   * "我把这段关系放在哪一档"。所以它不受"有没有记录"的限制：
   * 昨天刚认识的人，你今天就能把他定成「有来往」，那是你说了算。
   *
   * （PO 裁定：原先由系统算出来的「核心圈」（grade S/A）与「该联系了」（超期）
   *   都已撤下 —— 关系的位置由玩家自己说，不由系统替他排。那条裁定落在了这里。）
   *
   * `null` = **还没定过**。空着是一种合法状态，不许为了填满它而替玩家选一个：
   * 它会进 AI 的上下文（"该说什么不该说什么"），编出来的值会一路长成一句具体的话。
   * 起点空着，比起点猜错便宜得多。
   */
  stage: RelationStage | null;
  /** 对方的客观信息：机构、职位、领域 —— 只记事实，不记评价 */
  profile: {
    org: string | null;
    role: string | null;
    field: string | null;
    /** 如何认识的 */
    metContext: string | null;
    metAt: ISODateTime | null;
    location: string | null;
    /** 与你的共同点/共同兴趣，AI 破冰时会用 */
    commonGround: string[];
  };
  dimensions: RelationDimensions;
  gradeHistory: GradeSnapshot[];
  /**
   * 当前评级（冗余缓存，等于 `gradeHistory` 最后一项）。
   *
   * `null` = **还没有过任何一次观测**（history 为空时，"最后一项"本就是没有）。
   * 手动加进名单的人从这里起步；等他身上真的发生了一件事、
   * 有了第一个快照，这里才会有字母。**不许**为了"先填一个"而编一个字母出来：
   * 卡片会把它原样印在脸上（`D · 几近失联` 对一个刚认识的人是一句假话）。
   */
  currentGrade: RelationGrade | null;

  /**
   * 关于这个人的一段话 —— **玩家亲手写的**（添加这个人时可选填）。
   *
   * 与 `profile` 的分工：那边只记事实（机构/角色/领域），这一段是叙述；
   * 与 `whyItMatters` 的分工：那边回答"我为什么在意"，这一段回答"他是谁"。
   * 三者都可能很长，谁也不许并进谁 —— 合成一格的那天，
   * "复旦生命科学学院 · 副教授"和"他是我本科最想成为的那种人"就会排在同一行。
   *
   * 它进 AI 的上下文（见 `ContactContextForAI.note` 与 `lib/mockAdvisor.corpusOf`）：
   * 名字之外一个字都没有的人，在"该找谁"的检索里是找不到的。
   */
  note: string | null;

  /** 我为什么在意这段关系（写给自己的，不能说给对方听） */
  whyItMatters: string[];
  /** 边界：什么话不该说、什么事不该做 —— 高情商的最低保障 */
  boundaries: string[];
  /** 对方的偏好/雷区（客观记录） */
  preferences: string[];
  /** 待我回应的承诺（我说过要做的事） */
  openCommitments: Array<{ text: string; dueAt: ISODateTime | null; done: boolean }>;

  interactions: Interaction[];
  /** 期望联系频率（天）。**记账用**：智囊判断"你们多久没说话了"读的就是它 */
  contactCadenceDays: number;
  lastContactAt: ISODateTime | null;
  /**
   * 下次该联系的时间（写入方算好的 `lastContactAt + cadence`）。
   *
   * PO 裁定撤下「该联系了」之后，这个字段**只记账、不露账** —— 界面上不再有任何
   * 一处读它（没有角标、没有超期红字）。保留它的理由和 vault 那一侧是同一条：
   * 客观节律是这段关系的事实，撤下的只是"把事实念给你听"的那张嘴；
   * 而删字段要动历史档案，重算的日子迟早会来。
   */
  nextTouchAt: ISODateTime | null;
  /** 累计互动次数 */
  interactionCount: number;

  /** AI 建议的历史记录 */
  adviceHistory: NetworkAdviceRecord[];
  tags: string[];
  starred: boolean;
  archivedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

/** 被采纳的一次 AI 社交建议 */
export interface NetworkAdviceRecord {
  id: Id<'Advice'>;
  contactId: ContactId;
  askedAt: ISODateTime;
  /** 玩家描述的当前处境 */
  situation: string;
  agentId: AgentId | null;
  /** Arbiter 之外唯一会给"建议"的 Agent，输出契约见 agents.ts */
  advice: string;
  /** 结构性建议动作 */
  suggestedAction: {
    timing: string;
    channel: string;
    /** 可直接使用的开场白（去掉了表演感的那种） */
    openingLine: string;
    intent: string;
  } | null;
  /** 不该做的事 */
  avoid: string[];
  /** 底层心法，一行 */
  principle: string;
  /** 玩家是否标记"有帮助" */
  helpful: boolean | null;
  /** 是否已执行 */
  executed: boolean;
}

/** 关系地图的聚合视图（由 selector 计算，不入库） */
export interface NetworkGraphSummary {
  totalContacts: number;
  byType: Record<RelationType, number>;
  /**
   * 等级分布：玩家亲手定过的那几档各有多少人。
   * **`null`（还没定过）不进这里** —— 它不是第九档，它是"还没说"。
   */
  byLevel: Record<RelationStage, number>;
  /**
   * 单向投入告警：reciprocity 低但 warmth 高。
   * 与「该联系了」「核心圈」不同，它从未上过界面 —— 留着是因为它描述的是
   * 你和对方之间的**落差**（一条事实），不是"系统在催你/给你排座次"。
   */
  lopsidedContactIds: ContactId[];
}

export interface NetworkState {
  contacts: Contact[];
  /** 关系图谱的可视化布局（Phase 5 用，先留空） */
  graphLayout: Record<ContactId, { x: number; y: number }>;
  /** 上次提醒检查时间，避免每次渲染都重算 */
  lastReminderCheckAt: ISODateTime | null;
  /** 维度权重配置：影响 grade 计算，玩家可在设置里调（默认见下） */
  gradeWeights: {
    warmth: number;
    trust: number;
    influence: number;
    reciprocity: number;
    /** 距离上次互动的天数衰减系数（每天扣多少分） */
    recencyDecayPerDay: number;
  };
  /**
   * 「向智囊团求助」的历史。环形保留最近 50 次。
   * 与 Contact.adviceHistory 的分工：那条线回答"关于**某个人**，话该怎么说"；
   * 这条线回答"有**这件事**，该找谁" —— 检索的入口不同，记录也就分开落。
   */
  solverLog: SolverConsultation[];
}

/**
 * 一次全局社交检索的结论（跨联系人，而非关于某个人）。
 * 检索语料 = 通讯录里"可以对得上话"的全部事实：机构/角色/领域/共同点/
 * 备忘摘要/边界/历史互动/求助记录（见 mockAdvisor 的检索实现）。
 */
export interface SolverConsultation {
  id: Id<'Consultation'>;
  askedAt: ISODateTime;
  /** 玩家写的现实困境，原样留存 */
  question: string;
  agentId: AgentId | null;
  /** 沉稳的分析报告（整段文字，空行分段） */
  report: string;
  /**
   * 推荐的人（0~2 位）。名单里确实没有对口的人时为空数组 ——
   * 系统宁可诚实地说"名单上没有"，也不硬配一个（红线：不表演、不凑数）。
   */
  recommendations: Array<{
    contactId: ContactId;
    /** 为什么是他/她 */
    reason: string;
    /** 怎么开口（极其克制、高情商） */
    approach: string;
  }>;
  /** 提醒与注意（多来自被推荐者的边界记录） */
  cautions: string[];
  /** 一行心法 */
  principle: string;
}

/**
 * 默认权重（写死于 catalog，玩家可改）：
 *   warmth 0.35 / trust 0.30 / influence 0.20 / reciprocity 0.15
 *   recencyDecayPerDay = 0.15（即 30 天不联系扣 4.5 分）
 *
 * 注意：influence 权重不设为最高，避免产品滑向"只结交有用的人"的功利主义。
 */
export const DEFAULT_GRADE_WEIGHTS = {
  warmth: 0.35,
  trust: 0.3,
  influence: 0.2,
  reciprocity: 0.15,
  recencyDecayPerDay: 0.15,
} as const;

/** 用于向 AI 传递的精简联系人上下文（脱敏 + 控 token） */
export interface ContactContextForAI {
  contactId: ContactId;
  name: string;
  relationType: RelationType;
  /** 同上：`null` = 还没定过。模型拿到 null 时不许自己补一个阶段出来 */
  stage: RelationStage | null;
  dimensions: RelationDimensions;
  /** 玩家写的那段话（可能为 null）。见 Contact.note —— 它是"这个人是谁"的唯一叙述 */
  note: string | null;
  whyItMatters: string[];
  boundaries: string[];
  preferences: string[];
  openCommitments: string[];
  /** 最近 N 次互动的摘要 */
  recentInteractions: Array<{ localDate: DateKey; channel: string; summary: string; sentiment: string }>;
  daysSinceLastContact: number;
  relatedClassIds: ClassIdLiteral[];
}
