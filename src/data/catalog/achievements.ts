// ============================================================================
// EarthOnline · Phase 5 · 史诗成就目录（静态设定，不入存档）
//
// 23 枚徽记，六个维度，四档。
//
// 写这个目录时的三条自我约束（比数据本身重要）：
//
//   ① **题记不许复述条件。** 条件是机器读的，题记是给人读的 ——
//      「在早上 8 点前完成一次打卡」是前者，「八点之前的那条路上，
//      人少得像另一个学校」是后者。两句话说的是同一件事，但只有后一句
//      值得被印在那枚徽记下面一辈子。
//
//   ② **不许有努力奖。** 没有"连续登录 100 天"这一类。每一条都对应
//      现实里一件**已经发生过**的事：钱到账了、签证批了、有人愿意跟你合作了。
//      成就之所以值得挂起来，是因为它描述的是事实，不是坚持。
//
//   ③ **不许有攀比。** 题记里不出现"更"、不出现名次。这一栏是给玩家自己看的，
//      不是排行榜 —— 本项目没有别人的数据，也不该假装有。
//
// 触发条件的机器判定见 `src/lib/achievementEngine.ts`。
// ============================================================================

import type {
  Achievement,
  AchievementDimension,
  AchievementTier,
} from '../../types/achievements';

// ---------------------------------------------------------------------------
// 维度
// ---------------------------------------------------------------------------

export interface AchievementDimensionMeta {
  id: AchievementDimension;
  /** 排面字母，显示在栏目标题左侧 */
  letter: string;
  label: string;
  /** 这一栏的一句总述。它不是题记，是"这一栏在讲什么" */
  epigraph: string;
}

export const ACHIEVEMENT_DIMENSIONS: AchievementDimensionMeta[] = [
  {
    id: 'FUDAN',
    letter: 'A',
    label: '复旦往事',
    epigraph: '那几年不是铺垫。它就是你人生的一段正片。',
  },
  {
    id: 'CARBON',
    letter: 'B',
    label: '碳硅之变',
    epigraph: '你从湿的那一侧，走到了干的这一侧。',
  },
  {
    id: 'GRAVITY',
    letter: 'C',
    label: '重力摆脱',
    epigraph: '钱不是目的。它是你第一次可以不解释的那部分自由。',
  },
  {
    id: 'ANCHORLESS',
    letter: 'D',
    label: '无锚之鸟',
    epigraph: '把根拔起来过的人，才知道风是从哪边吹来的。',
  },
  {
    id: 'ECHO',
    letter: 'E',
    label: '同频的回响',
    epigraph: '你不需要很多人。你需要几个不用解释的人。',
  },
  {
    id: 'ABYSS',
    letter: 'F',
    label: '至高隐藏',
    epigraph: '还有一些事，现在还不能说。',
  },
];

// ---------------------------------------------------------------------------
// 档位
// ---------------------------------------------------------------------------

/**
 * 四档的对外称呼。`order` 只用于排序与"越往上越沉"的视觉梯度，
 * 不参与任何判定 —— 档位是**稀有度**，不是分数。
 */
export const ACHIEVEMENT_TIER_META: Record<AchievementTier, { label: string; order: number }> = {
  BRONZE: { label: '青铜', order: 1 },
  SILVER: { label: '白银', order: 2 },
  GOLD: { label: '黄金', order: 3 },
  ASCENDANT: { label: '至高白金', order: 4 },
};

// ---------------------------------------------------------------------------
// 23 枚
//
// 顺序即陈列顺序：维度内按档位从低到高（青铜 → 至高白金），
// 也就是"这条线是怎么一步步走到终局的"。
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS: Achievement[] = [
  // ===================== A · 复旦往事 =====================
  {
    id: 'ac_fudan_gravity',
    dimension: 'FUDAN',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '光华楼的引力常数',
    epithet: null,
    epigraph: '你在那栋楼里坐了第一次。从那天起，它开始有重量。',
    criterion: '完成第一次日常打卡',
    clue: '有一栋楼，你几乎每天都要回去一次。',
    condition: { kind: 'daily_checks', count: 1 },
  },
  {
    id: 'ac_fudan_shuttle',
    dimension: 'FUDAN',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '江湾的穿梭列车',
    epithet: null,
    epigraph: '同一条路走到第二十一次，你已经不用看时间表了。',
    criterion: '累计完成 21 次日常打卡',
    clue: '两处之间那条路，走够次数就不再叫通勤。',
    condition: { kind: 'daily_checks', count: 21 },
  },
  {
    id: 'ac_fudan_dawn',
    dimension: 'FUDAN',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '早八的逆行者',
    epithet: null,
    epigraph: '八点之前的那条路上，人少得像另一个学校。',
    criterion: '在早上 8 点前完成一次打卡',
    clue: '有一种早起，只有很少的人见过它长什么样。',
    condition: { kind: 'daily_check_before_hour', hour: 8 },
  },
  {
    id: 'ac_fudan_closing',
    dimension: 'FUDAN',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '闭馆音乐的聆听者',
    epithet: null,
    epigraph: '闭馆音乐不是给你听的，是催你收东西的。你每次都听完最后一句。',
    criterion: '在 23 点之后完成一次打卡或一条任务',
    clue: '有些曲子只在一天的最后十分钟响。',
    condition: {
      kind: 'any_of',
      of: [
        { kind: 'daily_check_after_hour', hour: 23 },
        { kind: 'quest_completed_after_hour', hour: 23 },
      ],
    },
  },

  // ===================== B · 碳硅之变 =====================
  {
    id: 'ac_carbon_pipette',
    dimension: 'CARBON',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '告别移液枪',
    epithet: null,
    epigraph: '最后一次把它放下的时候，你并不知道那是最后一次。',
    criterion: '完成第一条「计算生物学」线上的任务',
    clue: '有一样工具，你的手还记得它的重量。',
    condition: { kind: 'career_quests_completed', classId: 'computational_biology', count: 1 },
  },
  {
    id: 'ac_carbon_protein',
    dimension: 'CARBON',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '蛋白质的低语',
    epithet: null,
    epigraph: '二十个字母写成的句子，你开始能听出语气。',
    criterion: '让一条研究里程碑落在「蛋白质」上',
    clue: '有一种语言只有二十个字母，却写了几十亿年。',
    condition: { kind: 'tech_tags', tags: ['protein'], count: 1 },
  },
  {
    id: 'ac_carbon_citation',
    dimension: 'CARBON',
    tier: 'GOLD',
    hidden: false,
    mark: null,
    title: '把名字写进引文',
    epithet: null,
    epigraph: '从这一天起，你不再只是引用别人的人。',
    criterion: '研究成果第一次被他人引用或采用',
    clue: '有一份名单你读了很多年，还从没在上面见过自己。',
    condition: { kind: 'tech_tags', tags: ['citation', 'adoption'], count: 1 },
  },
  {
    id: 'ac_carbon_paradigm',
    dimension: 'CARBON',
    tier: 'ASCENDANT',
    hidden: false,
    mark: null,
    title: '范式转移',
    epithet: null,
    epigraph: '人们不再做原先那件事了 —— 因为你的方法做得更好、更快、更便宜。',
    criterion: '你的方法改变了所在领域的工作方式',
    clue: '有一件事，整个领域都在用同一种做法。你觉得可以不是这样。',
    condition: { kind: 'tech_tags', tags: ['paradigm'], count: 1 },
  },

  // ===================== C · 重力摆脱 =====================
  {
    id: 'ac_gravity_coin',
    dimension: 'GRAVITY',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '第一枚硬币的落地声',
    epithet: null,
    epigraph: '它落地的声音很小。但你听见了，而且你记得。',
    criterion: '第一笔自己赚来的钱：记一件里程碑，或在金库里落下第一笔主动收入',
    clue: '有一枚硬币，掉下来的时候旁边没有别人。',
    condition: {
      kind: 'any_of',
      of: [
        { kind: 'reality_milestones', definitionIds: ['rm_first_income'], count: 1 },
        { kind: 'vault_income_count', count: 1 },
      ],
    },
  },
  {
    id: 'ac_gravity_fortress',
    dimension: 'GRAVITY',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '第一座防御工事',
    epithet: null,
    epigraph: '它挡不住什么真正的坏事。它只是让你在坏消息面前能多站一会儿。',
    criterion: '净资产覆盖 3 个月的支出',
    clue: '有人给这个数字取名叫跑道。它其实更像一堵墙。',
    condition: { kind: 'net_worth_coverage_months', months: 3 },
  },
  {
    id: 'ac_gravity_seven',
    dimension: 'GRAVITY',
    tier: 'GOLD',
    hidden: false,
    mark: null,
    title: '七位数的门槛',
    epithet: null,
    epigraph: '七位数不会改变你的一天。它改变的是你说「不」时的音量。',
    criterion: '个人净资产达到 1,000,000 USD',
    clue: '有一个数字，多一位就换一种活法。',
    condition: { kind: 'net_worth_usd_cents', amount: 100_000_000 },
  },
  {
    id: 'ac_gravity_a9',
    dimension: 'GRAVITY',
    tier: 'ASCENDANT',
    hidden: false,
    mark: null,
    title: '九位数金库',
    epithet: 'The A9 Sovereign',
    epigraph: '它不是为了买什么。它是让你在任何一张桌子上，都有权说不。',
    criterion: '个人净资产达到 100,000,000 USD',
    clue: '整条资本线走到尽头时，你会在那里站一会儿。',
    condition: { kind: 'net_worth_usd_cents', amount: 10_000_000_000 },
  },

  // ===================== D · 无锚之鸟 =====================
  {
    id: 'ac_anchor_customs',
    dimension: 'ANCHORLESS',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '第一次独自过海关',
    epithet: null,
    epigraph: '盖章的声音很轻。世界从那一刻起变大了一圈。',
    criterion: '记录「第一次独自过海关」',
    clue: '有一条线，走过去之后你的坐标就换了一套。',
    condition: { kind: 'reality_milestones', definitionIds: ['rm_first_border'], count: 1 },
  },
  {
    id: 'ac_anchor_language',
    dimension: 'ANCHORLESS',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '语言的密钥',
    epithet: null,
    epigraph: '不是你学会了那门语言。是那门语言开始替你开门。',
    criterion: '记录「语言的钥匙」',
    clue: '有一把钥匙是有语法的。',
    condition: { kind: 'reality_milestones', definitionIds: ['rm_language_key'], count: 1 },
  },
  {
    id: 'ac_anchor_passport',
    dimension: 'ANCHORLESS',
    tier: 'GOLD',
    hidden: false,
    mark: null,
    title: '申根与大洋的通行权',
    epithet: null,
    epigraph: '从此你的护照不再是需要解释的东西。',
    criterion: '记录「获批」—— 身份申请的批复',
    clue: '有一枚章，它要等的不是几天，是几年。',
    condition: { kind: 'reality_milestones', definitionIds: ['rm_visa_approved'], count: 1 },
  },
  {
    id: 'ac_anchor_sanctuary',
    dimension: 'ANCHORLESS',
    tier: 'ASCENDANT',
    hidden: false,
    mark: null,
    title: '私人独立实验室',
    epithet: 'The Sanctuary',
    epigraph: '一间白墙的房子，一台属于你的机器，和一个只属于你的问题。',
    criterion: '达成终极目标「私人独立 Lab」',
    clue: '有一间房，门牌上会写你的名字，而不是别人的。',
    condition: { kind: 'goal_achieved', goalId: 'PRIVATE_LAB' },
  },

  // ===================== E · 同频的回响 =====================
  {
    id: 'ac_echo_glance',
    dimension: 'ECHO',
    tier: 'BRONZE',
    hidden: false,
    mark: null,
    title: '微秒级的目光',
    epithet: null,
    epigraph: '那一下只有几微秒。但你后来想起过很多次。',
    criterion: '记下第一次与某人的互动',
    clue: '有件事发生在你决定把它记下来之前。',
    condition: { kind: 'network_interactions', count: 1 },
  },
  {
    id: 'ac_echo_listener',
    dimension: 'ECHO',
    tier: 'SILVER',
    hidden: false,
    mark: null,
    title: '长桌上的倾听者',
    epithet: null,
    epigraph: '你不是那顿饭上说话最多的人。散场时有人专门过来找你。',
    criterion: '累计三次面对面的见面或饭局',
    clue: '饭桌上最容易听清一个人，也最容易被听清。',
    condition: { kind: 'network_face_to_face', count: 3 },
  },
  {
    id: 'ac_echo_mentor',
    dimension: 'ECHO',
    tier: 'GOLD',
    hidden: false,
    mark: null,
    title: '良师的信任券',
    epithet: null,
    epigraph: '他把自己的一部分判断，押在了你身上。',
    criterion: '把一位导师或前辈定到「信任」或更近的等级',
    clue: '有一种信任，是先给你钥匙，再告诉你锁在哪儿。',
    condition: { kind: 'contact_stage', stages: ['trusted', 'close', 'deep'], relationType: 'mentor' },
  },
  {
    id: 'ac_echo_soulmate',
    dimension: 'ECHO',
    tier: 'ASCENDANT',
    hidden: false,
    mark: null,
    title: '不需要解释的同频者',
    epithet: 'The Soulmate',
    epigraph: '不是一个完美的人，是一个你不需要解释的人。',
    criterion: '达成终极目标「灵魂伴侣」，或把一段关系定到「深度绑定」',
    clue: '有一段关系的标志是：你开口之前不用先讲背景。',
    condition: {
      kind: 'any_of',
      of: [
        { kind: 'goal_achieved', goalId: 'SOULMATE' },
        { kind: 'contact_stage', stages: ['deep'] },
      ],
    },
  },

  // ===================== F · 至高隐藏 =====================
  {
    id: 'ac_abyss_mars',
    dimension: 'ABYSS',
    tier: 'ASCENDANT',
    hidden: true,
    mark: 'veil',
    title: '隐匿的火星',
    epithet: null,
    epigraph: '你以为自己在做一件很窄的事。它其实连着一张很大的图。',
    criterion: '让那棵树显形',
    clue: '雾后面立着什么东西。现在还不是看的时候。',
    condition: { kind: 'evolution_revealed' },
  },
  {
    id: 'ac_abyss_slowtime',
    dimension: 'ABYSS',
    tier: 'ASCENDANT',
    hidden: true,
    mark: 'veil',
    title: '让时间慢下来一点点',
    epithet: null,
    epigraph: '你没有让谁活得更久。你只是让「更久」这件事第一次可以被计算。',
    criterion: '在「衰老」那一条支线上点亮第一个节点',
    clue: '有一条支线，它的尽头是所有人都想去的地方。',
    condition: { kind: 'evolution_lit_nodes', branch: 'MEDICINE', count: 1 },
  },
  {
    id: 'ac_abyss_lightbearer',
    dimension: 'ABYSS',
    tier: 'ASCENDANT',
    hidden: true,
    mark: 'halo',
    title: '成为光源本身',
    epithet: 'Lightbearer',
    epigraph: '曾经你读别人的答案。现在别人的起点，是你的答案。',
    criterion: '点亮任意一个「点亮」层级的节点',
    clue: '有些灯不是被别人点亮的。它们自己就亮着，只是还没轮到你看见。',
    condition: { kind: 'evolution_lit_nodes', tier: 5, count: 1 },
  },
];

export const getAchievement = (id: string): Achievement | undefined =>
  ACHIEVEMENTS.find((a) => a.id === id);

/** 某一条达到指定档位时，用来判断"这一栏里最高那枚" */
export const achievementTierOrder = (tier: AchievementTier): number =>
  ACHIEVEMENT_TIER_META[tier].order;
