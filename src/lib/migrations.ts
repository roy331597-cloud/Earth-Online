// ============================================================================
// EarthOnline · 存档迁移 (Schema Migrations)
//
// 迁移的唯一职责：把旧版本的存档**水合**成当前版本能直接读的形状。
// 三条纪律：
//
//   ① **只向前。** 老档升新档，不提供降级路径 —— 降级要靠导出文件里的
//      老副本，不靠 migrations 表。
//   ② **只补数据，不搬立场。** 迁移可以补空字段、可以重命名，但绝不
//      借迁移之名改写玩家已有的记录（那会让"迁移"变成"篡改"）。
//   ③ **纯数据变换。** 不读 Date.now()、不碰 localStorage、不 import store ——
//      now 由调用方注入，function 的产物只取决于 (prev, now)。
//
// 每新增一条迁移，先把上一条的状态在 `verify-ops` 里钉死（v1 → v2 的用例），
// 再写新的那条 —— 否则迁移链会在几轮迭代里悄悄退化成"只能升最新版"。
// ============================================================================

import { activeDayKey, weekStartKey } from '@/lib/format';
import type { MigrationRegistry } from '@/types';

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};

export const MIGRATIONS: MigrationRegistry = {
  /**
   * v1 → v2（Phase 2 收官批）：全部是**补空字段**，不搬动任何已有数据。
   *
   *   · weeklies            —— 新增容器。先给空数组/空表；`lastSettledWeekStart`
   *                            定在"迁移这一周"，免得老档刚迁完就弹一张空的上周结算。
   *   · player.attributeHistory —— 属性留痕容器，老档没有历史，就是空数组。
   *   · network.solverLog   —— 全局检索记录，空数组。
   *   · quest.linkedContactIds  —— 老任务没绑过联系人，一律补 []。
   */
  2: (prev, now) => {
    const settings = asRecord(prev.settings);
    const rolloverHour = typeof settings.dayRolloverHour === 'number' ? settings.dayRolloverHour : 1;
    const weekStart = weekStartKey(activeDayKey(now, rolloverHour));

    const player = asRecord(prev.player);
    if (!Array.isArray(player.attributeHistory)) player.attributeHistory = [];

    const network = asRecord(prev.network);
    if (!Array.isArray(network.solverLog)) network.solverLog = [];

    const quests = asRecord(prev.quests);
    const byIdPrev = asRecord(quests.byId);
    const byId: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(byIdPrev)) {
      const quest = asRecord(q);
      if (!Array.isArray(quest.linkedContactIds)) quest.linkedContactIds = [];
      byId[id] = quest;
    }

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 2;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 1,
        to: 2,
        at: now.toISOString(),
        notes: '补 weeklies / player.attributeHistory / network.solverLog / quest.linkedContactIds（不搬动已有数据）',
      },
    ];

    return {
      ...prev,
      meta,
      player,
      network,
      quests: { ...quests, byId },
      weeklies: {
        definitions: [],
        logs: {},
        lastSettledWeekStart: weekStart,
        pendingWeeklyNotice: null,
      },
    };
  },

  /**
   * v2 → v3（Phase 3 开工批）：同样**只补空字段**，不搬动任何已有数据。
   *
   *   · Quest.origin.reroutedFrom  —— 老任务没被换过做法，一律 null。
   *   · Quest.origin.rerouteHistory —— 空数组。
   *   · ChainReview.rerouteCount   —— 0。
   *   · ChapterProgress.entryNetWorthUsdCents —— 老档没记过基准，
   *       补 null（引擎在下一轮 SyncChapters 里对**已解锁且未完成**的章补写，
   *       已完成的章保持 null —— 它们不需要再判一次离章条件）。
   *   · ChapterProgressState.pendingCeremony —— null（没有待看的仪式）。
   *
   * ⚠️ 刻意**不**去重算 conditionProgress：那是派生缓存，由引擎在运行期覆盖，
   *    迁移只负责让形状可读。让迁移跑业务逻辑会让"迁移"变成第二个引擎。
   */
  3: (prev, now) => {
    const quests = asRecord(prev.quests);

    const byIdPrev = asRecord(quests.byId);
    const byId: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(byIdPrev)) {
      const quest = asRecord(q);
      const origin = asRecord(quest.origin);
      if (origin.reroutedFrom === undefined) origin.reroutedFrom = null;
      if (!Array.isArray(origin.rerouteHistory)) origin.rerouteHistory = [];
      byId[id] = { ...quest, origin };
    }

    const chainsPrev = asRecord(quests.chains);
    const chains: Record<string, unknown> = {};
    for (const [id, c] of Object.entries(chainsPrev)) {
      const chain = asRecord(c);
      const review = asRecord(chain.review);
      if (typeof review.rerouteCount !== 'number') review.rerouteCount = 0;
      chains[id] = { ...chain, review };
    }

    const chapters = asRecord(prev.chapters);
    const progressPrev = Array.isArray(chapters.chapters) ? chapters.chapters : [];
    const progress = progressPrev.map((c) => {
      const cp = asRecord(c);
      if (typeof cp.playerChosenCodename !== 'string') cp.playerChosenCodename = null;
      if (cp.codenameSource !== 'candidate' && cp.codenameSource !== 'custom') cp.codenameSource = null;
      if (typeof cp.entryNetWorthUsdCents !== 'number') cp.entryNetWorthUsdCents = null;
      if (!Array.isArray(cp.conditionProgress)) cp.conditionProgress = [];
      return cp;
    });

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 3;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 2,
        to: 3,
        at: now.toISOString(),
        notes:
          '补 Quest.origin.reroutedFrom / rerouteHistory、ChainReview.rerouteCount、ChapterProgress.codenameSource / entryNetWorthUsdCents、ChapterProgressState.pendingCeremony（不搬动已有数据）',
      },
    ];

    return {
      ...prev,
      meta,
      quests: { ...quests, byId, chains },
      chapters: { ...chapters, chapters: progress, pendingCeremony: null },
    };
  },

  /**
   * v3 → v4（手动添加联系人）：`Contact.note` —— 只补 null，不补内容。
   *
   * 这条迁移的"空"是有信息量的：老档里那三个人**确实**没有过这段记录，
   * 补 null 是如实交代。反过来说，若在这里顺手填一句"（手动添加）"之类，
   * 卡片上就会多出一句玩家从没写过的话 —— 迁移不许替玩家说话。
   *
   * 同时注意：`stage` / `currentGrade` 在这条迁移里**一律不动**。
   * 它们在新契约里可以是 null，但老档里的那些值都是真的观测，
   * 把有观测的人改成"没观测"才是篡改。
   */
  4: (prev, now) => {
    const network = asRecord(prev.network);
    const contactsPrev = Array.isArray(network.contacts) ? network.contacts : [];
    const contacts = contactsPrev.map((c) => {
      const contact = asRecord(c);
      if (typeof contact.note !== 'string' && contact.note !== null) contact.note = null;
      return contact;
    });

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 4;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 3,
        to: 4,
        at: now.toISOString(),
        notes: '补 Contact.note: null（老档里那三个人确实没有这段记录，不补内容）',
      },
    ];

    return { ...prev, meta, network: { ...network, contacts } };
  },

  // v4 → v5：现实里程碑多了一条"自己写的"形态，照片也从纸面变成了真的通路。
  //
  // 老档里的每一条记录都是**从目录里挑的**：它本来就有 definitionId，
  // 所以那条一个字都不动（只补两个只有自己写的那条才会用到的字段为 null）。
  // 「只补数据不搬立场」在这里的具体读法是：**不替老记录判断它算不算自定义**。
  5: (prev, now) => {
    const milestones = asRecord(prev.milestones);
    const recordsPrev = Array.isArray(milestones.records) ? milestones.records : [];
    const records = recordsPrev.map((r) => {
      const record = asRecord(r);
      if (typeof record.customTitle !== 'string' && record.customTitle !== null) {
        record.customTitle = null;
      }
      if (record.customCategory !== 'mobility' && record.customCategory !== 'academic'
        && record.customCategory !== 'capital' && record.customCategory !== 'life') {
        record.customCategory = null;
      }
      return record;
    });

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 5;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 4,
        to: 5,
        at: now.toISOString(),
        notes: '补 RealityMilestoneRecord.customTitle/customCategory: null（老记录都有定义的，不搬动 definitionId）',
      },
    ];

    return { ...prev, meta, milestones: { ...milestones, records } };
  },

  // v5 → v6：成就开始真的落地了，unlockables 从三格长到五格。
  //
  // 补的两格都是**空**：`achievementUnlockedAt` 为 {}、`pendingAchievementIds` 为 []。
  //
  // 为什么不在这里"补发"：补发是**引擎的活**。`syncAchievements` 每次从头重算
  // 全部判据，老档里已经做到的事第一次跑就会自己算出来 —— 而且算得对。
  // 迁移只负责补字段形状、不替引擎做判断；两边都做一遍的那天，就会有两份答案。
  //
  // 同理，`achievementUnlockedAt` 不补造任何时间：那些事发生在哪一天，
  // 老档里根本没有记过。编一个出来，就是在玩家的档案里写下一个假的日子 ——
  // 而陈列馆会把那行日期原样印在徽记下面。
  6: (prev, now) => {
    const unlockables = asRecord(prev.unlockables);
    if (!Array.isArray(unlockables.achievementIds)) unlockables.achievementIds = [];
    if (!Array.isArray(unlockables.easterEggIds)) unlockables.easterEggIds = [];
    unlockables.tourCompleted = asRecord(unlockables.tourCompleted);
    unlockables.achievementUnlockedAt = asRecord(unlockables.achievementUnlockedAt);
    if (!Array.isArray(unlockables.pendingAchievementIds)) unlockables.pendingAchievementIds = [];

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 6;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 5,
        to: 6,
        at: now.toISOString(),
        notes: '补 unlockables.achievementUnlockedAt={} 与 pendingAchievementIds=[]（不补造日期，补发交给成就引擎）',
      },
    ];

    return { ...prev, meta, unlockables };
  },

  // v6 → v7：AI 的默认模型从 `deepseek-chat` 换成 `deepseek-flash`。
  //
  // 这条迁移只碰一个字段，且**只在它精确等于旧默认值**时才碰。为什么这不算
  // "搬立场"：`ai.model` 从来没有过让玩家选它的入口 —— 存档里的
  // 'deepseek-chat' 不是谁的选择，只是出厂那一版的默认值本身。默认值换代，
  // 老档跟着换代，属于"补数据"。
  //
  // 反过来说，等于别的值（或缺失）时一个字不动：将来若真有了模型选择器，
  // 那一刻起 `ai.model` 就是玩家的立场，默认值换代不许把它顶掉。
  //
  // agent 花名册里的 `runtime.model` 不在此列：它不上线 —— 每次调用真正发出的
  // 模型名取自 `ai.model`（见 bus.ts 的 runtimeFor 调用），花名册那份是元数据，
  // 老档里原样留着，不借迁移之名搬运。
  7: (prev, now) => {
    const ai = asRecord(prev.ai);
    if (ai.model === 'deepseek-chat') ai.model = 'deepseek-flash';

    const meta = asRecord(prev.meta);
    meta.schemaVersion = 7;
    const history = Array.isArray(meta.migrationHistory) ? meta.migrationHistory : [];
    meta.migrationHistory = [
      ...history,
      {
        from: 6,
        to: 7,
        at: now.toISOString(),
        notes: 'AI 默认模型 deepseek-chat → deepseek-flash（只换精确等于旧默认值的那一份，其余模型名不动）',
      },
    ];

    return { ...prev, meta, ai };
  },
};
