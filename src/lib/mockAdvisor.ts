// ============================================================================
// EarthOnline · 社交智囊替身 (Network Advisor)
//
// 🔻 Phase 4：接入真实 DeepSeek 后，**整个文件删除**。
//    调用点集中在 `store/operations.ts`：askNetworkAdvisor（关于某个人）、
//    consultNetworkSolver（关于某件事，全局检索）、
//    suggestContactQuestTitle（派生任务的标题预填，纯文案）。
//
// ---------------------------------------------------------------------------
// 它替代的是什么
// ---------------------------------------------------------------------------
// Phase 1 为这个 Agent 只留了一个契约（types/network.ts 的 NetworkAdviceRecord）：
// 一段建议 + 一个结构化动作 + 一组"不该做的事" + 一行心法。
// 本文件负责在没有模型的情况下把这四样填出来。
//
// ---------------------------------------------------------------------------
// 语气约束（比内容更重要）
// ---------------------------------------------------------------------------
// 这个人设是「沉稳、peaceful、克制、高情商」。落到文字上就是四条禁令：
//
//   ① **不评判玩家。** 不出现"你应该早点联系""你太功利了"。
//      所有的话都陈述处境，不指控人。
//   ② **不评判对方。** 对方已读不回、热情下降，只描述为状态，
//      不猜测动机 —— 猜动机是最常见的"低情商伪装成洞察"。
//   ③ **不给话术模板而不说明为什么。** 每一句建议都要能回答"凭什么"。
//   ④ **允许不做。** "这周先不动"是一个合法建议。一个只会催你联系人的 AI
//      很快就会变成又一个待办清单。
//
// 结构上，输出由 **读法（reading）+ 动作（move）+ 心法（principle）** 三段组成：
// 读法回答"现在是什么情况"，动作回答"那做什么"，心法是一句能带走的。
// 三段都是**整句**，不是模板拼词 —— 拼接出来的中文一定读得出接缝。
// ============================================================================

import { CHANNEL_LABELS, RELATION_STAGE_LABELS, RELATION_TYPE_LABELS } from '@/data/catalog/network';
import { LOPSIDED_GAP, isUnrecorded } from '@/lib/selectors';
import { daysBetween } from '@/lib/format';
import type { Contact, ContactId, Interaction, RelationType } from '@/types';

/** 替身产出的草稿。id / askedAt / helpful / executed 由操作层补齐。 */
export interface AdvisorDraft {
  advice: string;
  suggestedAction: {
    timing: string;
    channel: string;
    openingLine: string;
    intent: string;
  } | null;
  avoid: string[];
  principle: string;
}

export interface AdvisorInput {
  contact: Contact;
  /** 玩家写的处境。可以为空 —— 空的时候智囊只看这份档案说话。 */
  situation: string;
  /** 时间由调用方注入：这个文件里不许出现 new Date()（与 operations 同一条自律） */
  now: Date;
}

export const mockNetworkAdvisor = (input: AdvisorInput): AdvisorDraft => {
  const { contact, now } = input;
  const situation = input.situation.trim();
  const ctx = readContext(contact, situation, now);
  const move = pickMove(ctx);

  return {
    advice: composeAdvice(contact, situation, ctx, move),
    suggestedAction: move.action,
    // 去重：联系人自带的边界与规则给的禁忌常常是同一件事的两种说法
    avoid: [...new Set([...ctx.avoid, ...move.avoid])],
    principle: ctx.principle,
  };
};

// ---------------------------------------------------------------------------
// 先读一遍档案：这里出来的每一个布尔值都必须来自存档里真实存在的字段
// ---------------------------------------------------------------------------

interface ContactContext {
  daysSince: number | null;
  /**
   * 一段记录都没有的人（手动加进名单的人从这里起步）。
   * 它必须先于其它判据被处理：没有记录时，"承诺""超期""裂痕"全都是无从谈起，
   * 落到"你们处在一个稳定的位置"更是一句假话 —— 位置都还没形成。
   */
  unrecorded: boolean;
  /** 超期未联系 */
  overdue: boolean;
  /** 亲近度显著高于双向度：我在单方面维持 */
  lopsided: boolean;
  /** 说出口还没兑现的承诺（取最早的一条） */
  pendingPromise: { text: string; dueAt: string | null } | null;
  /** 上一次互动留下的待办 */
  openFollowUp: Interaction | null;
  /** 越是亲近的人，越怕开口谈事 —— 用于开头那句话的分寸 */
  relationalRisk: 'none' | 'afraid_to_ask' | 'strained';
  avoid: string[];
  principle: string;
}

/**
 * 把玩家那句话归到一类顾虑上。命中不了就返回 none —— **不硬猜**。
 * （与 mockArbiter 的 TAG_RULES 同一套做法：关键词表刻意短，宁可漏判。）
 */
const RELUCTANCE_RULES: Array<{ tag: NonNullable<ContactContext['relationalRisk']>; hit: string[] }> = [
  { tag: 'afraid_to_ask', hit: ['不好意思', '功利', '很久没', '开口', '麻烦', '欠', '尴尬'] },
  { tag: 'strained', hit: ['生气', '闹', '吵', '冷淡', '疏远', '裂痕', '误会'] },
];

const readContext = (contact: Contact, situation: string, now: Date): ContactContext => {
  const daysSince = contact.lastContactAt === null ? null : daysBetween(contact.lastContactAt, now);
  const pending = contact.openCommitments.find((c) => !c.done);
  const openFollowUp = [...contact.interactions].reverse().find((i) => i.followUpAt !== null) ?? null;
  const risk = RELUCTANCE_RULES.find((r) => r.hit.some((k) => situation.includes(k)))?.tag ?? 'none';

  return {
    daysSince,
    // 与卡片共用同一个判据（见 selectors.isUnrecorded 的注释）
    unrecorded: isUnrecorded(contact),
    overdue: daysSince !== null && daysSince > contact.contactCadenceDays,
    lopsided: contact.dimensions.warmth - contact.dimensions.reciprocity >= LOPSIDED_GAP,
    pendingPromise: pending ? { text: pending.text, dueAt: pending.dueAt } : null,
    openFollowUp,
    relationalRisk: risk,
    avoid: contact.boundaries,
    principle: PRINCIPLES[contact.relationType] ?? PRINCIPLES.other,
  };
};

/**
 * 心法：一类关系一句。它要能脱离这次对话单独成立 ——
 * 「带得走的一句话」和「这次该怎么做」是两件事，后者会过期，前者不会。
 */
const PRINCIPLES: Record<string, string> = {
  mentor: '关系里的信任，靠的是「你问的问题像不像真的在做」，不靠寒暄的频率。',
  peer: '同侪之间最贵的东西是坦率。客气话在这里是消耗品。',
  collaborator: '合作关系的温度来自交付，不来自热络。',
  investor: '先让对方知道他上次给的东西去了哪 —— 这比任何新请求都有说服力。',
  romantic: '在意的意思是你注意到细节，不是你说得多。',
  friend: '老朋友的沉默通常不是疏远，是两个人都在等对方先开口。谁先都不掉价。',
  family: '家人之间的账最忌讳算清，也最怕一直不算。',
  acquaintance: '弱连接不需要经营成强连接，偶尔让对方看见你在做什么就够了。',
  other: '不用给每段关系一个目的。有的关系只是让你记得自己是谁。',
};

// ---------------------------------------------------------------------------
// 动作：按优先级取第一个成立的
// ---------------------------------------------------------------------------

interface Move {
  /** 一句话说清这一步要干什么 */
  line: string;
  action: AdvisorDraft['suggestedAction'];
  avoid: string[];
}

const pickMove = (ctx: ContactContext): Move => {
  const c = ctx;

  // 一段记录都没有的人：这里能给的只有"第一次开口"这一件事。
  // 落到最后那条"位置是稳的"会是假话 —— 位置还没形成。
  if (c.unrecorded) {
    return {
      line: '第一步不用寒暄，带一件具体的事过去 —— 空手打招呼，对方反而不知道该怎么接。',
      action: {
        timing: '等你手上真的有一件和他的领域有关的事',
        channel: '按你们认识的方式',
        openingLine: '有个具体的问题想请教你 —— 我手上正在做一件事，卡在一个点上。你方便的时候回我就行。',
        intent: '把"第一次开口"变成一次具体的请教，而不是一次社交。',
      },
      avoid: ['不要写"以后多交流"这类没有内容的话', '不要在第一条消息里同时带两个请求'],
    };
  }

  if (c.pendingPromise) {
    return {
      line: '先把你已经说出口的那件事交付掉，别的都往后放。',
      action: {
        timing: c.pendingPromise.dueAt ? '在你自己说过的时间之前' : '这周内',
        channel: '按平时的渠道',
        openingLine: `上次说的「${c.pendingPromise.text}」，我弄好了 —— 发你一份。`,
        intent: '兑现承诺本身就在说话，不需要任何铺垫句。',
      },
      avoid: ['不要在交付里夹带一个新的请求', '不要为"晚了几"解释原因，除非对方问'],
    };
  }

  if (c.overdue && c.daysSince !== null) {
    return {
      line: `${c.daysSince} 天没联系了。这次不带诉求，只带一件你最近真的在做的事。`,
      action: {
        timing: '这周内的上午',
        channel: '对方最习惯的那一种',
        openingLine: '最近在弄一件小事，卡了一下又通了。想起来你之前说过类似的东西 —— 跟你说一声。',
        intent: '让对方用最小的力气接上话，而且不需要为你负责。',
      },
      avoid: ['不要在开头解释为什么这么久没联系', '不要一上来就问对方近况如何（那是把话题成本推给他）'],
    };
  }

  if (c.lopsided) {
    return {
      line: '这段关系现在是你推一下它动一下。这周先别推。',
      action: {
        timing: '这周先不动',
        channel: '——',
        openingLine: '',
        intent: '把主动权留出一次空隙，看对方会不会自己走一步。',
      },
      avoid: ['不要用"最近怎么不找我"这类话把不平衡摊到台面上（那是讨债）'],
    };
  }

  if (c.openFollowUp !== null) {
    return {
      line: '上一次你留了个尾巴没收。先把它收掉。',
      action: {
        timing: '现在',
        channel: CHANNEL_LABELS[c.openFollowUp.channel],
        openingLine: '上次说的那件事我跟进了一下，结论是这个 —— 你看对不对。',
        intent: '有回音的人，下次开口才有人应。',
      },
      avoid: [],
    };
  }

  return {
    line: '现在的位置是稳的。不用为了"维持"而联系 —— 有具体的事再找他，反而是尊重。',
    action: null,
    avoid: ['不要发只有寒暄、没有信息量的消息'],
  };
};

// ---------------------------------------------------------------------------
// 读法：把"现在是什么情况"说清楚，是整段建议里最见功力的一段
// ---------------------------------------------------------------------------

const composeAdvice = (
  contact: Contact,
  situation: string,
  ctx: ContactContext,
  move: Move,
): string => {
  const paras: string[] = [];

  // 玩家写了处境 → 先接住它。接不住就直接开始分析，是很典型的"AI 在自说自话"。
  if (situation) {
    paras.push(
      `你把「${situation}」说出来了，这件事本身就有用 —— 含在心里的顾虑会因为不被说出来而变形。` +
        `先说结论：${READINGS(ctx, contact)}`,
    );
  } else {
    paras.push(READINGS(ctx, contact));
  }

  paras.push(move.line);

  // 只有确实有东西可给的时候才给破冰句，避免"给了一句用不上的台词"
  if (move.action && move.action.openingLine) {
    paras.push(`如果要开口，可以这么起头 —— 不一定要照抄，但保持这个分寸：\n「${move.action.openingLine}」`);
  }

  return paras.join('\n\n');
};

/**
 * 一句话概括这段关系的当前状态。判断顺序有意如此：
 * 先说"你欠着的事"，再说"你有多久没出现"，最后才说关系的形状 ——
 * 因为前者是你能立刻处理的，后者是背景。
 */
const READINGS = (ctx: ContactContext, contact: Contact): string => {
  const who = contact.alias ?? contact.name;
  // stage 可以缺席（手动加进名单、还什么都没发生的人）。缺席时**如实说缺席**，
  // 不许退回到某一个词 —— 那是我们替他填的，而这个字段的全部意义就是"玩家知道什么"。
  const stage = contact.stage === null ? '还没有记录' : RELATION_STAGE_LABELS[contact.stage];
  const type = RELATION_TYPE_LABELS[contact.relationType];

  // 一段记录都没有的人：先处理它（见 ContactContext.unrecorded）。
  if (ctx.unrecorded) {
    return (
      `关于${who}，你手上还什么都没有 —— 没有一次来往，也没有一条偏好。` +
      `所以现在要决定的不是"怎么说"，是"要不要开口"：一旦开口，第一句话会替后面很多话定调。`
    );
  }

  if (ctx.pendingPromise) {
    return (
      `你和${who}之间现在压着一件你答应了但还没做的事。它会一直影响你开口时的底气 —— ` +
      `不是对方在计较，是你自己知道。这件事处理掉之前，别的新动作都会显得虚。`
    );
  }

  if (ctx.relationalRisk === 'afraid_to_ask') {
    return (
      `你担心的其实不是这次请求会不会被拒，是"我平时不出现，一出现就有事"这件事本身。` +
      `这个担心是对的，但它的解法不是多寒暄几次，是让这次开口里的东西对他也有用 —— ` +
      `一次能让对方也有收获的请求，不会消耗关系。`
    );
  }

  if (ctx.relationalRisk === 'strained') {
    return (
      `关系里有裂痕的时候，急着解释通常只会把裂缝撬大。你现在需要的不是把话说开，` +
      `是让一次平常的来往重新发生 —— 裂痕是被日常盖过去的，不是被谈话填平的。`
    );
  }

  if (contact.stage === 'dormant' && ctx.daysSince !== null) {
    return (
      `你们现在是${type}关系，但状态已经滑到「${stage}」。` +
      `值得注意的是：这不是感情变了，是见面这件事没有了载体 —— 而${who}大概也在等一个不用解释就能聊起来的理由。` +
      (ctx.lopsided
        ? `另外，这段关系的主动几乎全在你这边。这不说明他不在意，只说明你们的联系现在依赖你记得。`
        : '')
    );
  }

  if (ctx.overdue) {
    return (
      `你和${who}的节奏是大约每 ${contact.contactCadenceDays} 天联系一次，现在已经${ctx.daysSince} 天了。` +
      `超期本身不是问题 —— 问题是超过一定天数后，开口的成本会开始指数上升，而它其实只在你的想象里上升。`
    );
  }

  return (
    `你和${who}现在处在一个稳定的位置：${stage}，最近一次是${ctx.daysSince ?? '—'}天前。` +
    `这种关系不需要维护性联系，它需要的是你手里确实有东西的时候想起他 —— 那才是它该被用上的时刻。`
  );
};

// ============================================================================
// 全局检索 · 向智囊团求助 (Network Solver)
//
// 与上面单联系人 advisor 的分工：那条线回答「关于**这个人**，话该怎么说」；
// 这条线回答「有**这件事**，该找谁」。所以它横着走整个通讯录，且**允许给不出人**。
//
// 检索语料刻意把"历史备忘"也算进去（互动摘要、欠着的事、求助记录）——
// PO 的原话是"遍历通讯录（机构/领域/信任度/历史备忘）"，
// 只按头衔检索会把"上次他正好聊过这个话题"这种最真实的理由漏掉。
//
// 语气沿用本文件四条禁令。特别地：名单里没有对口的人时**诚实说没有**——
// 把问题硬塞给一个不对口的人，消耗的是两个人和一次机会，比"没答案"糟糕得多。
// ============================================================================

export interface SolverDraft {
  report: string;
  recommendations: Array<{ contactId: ContactId; reason: string; approach: string }>;
  cautions: string[];
  principle: string;
}

export interface SolverInput {
  contacts: Contact[];
  /** 玩家写的现实困境 */
  question: string;
  now: Date;
}

export const mockSocialSolver = ({ contacts, question, now }: SolverInput): SolverDraft => {
  const q = question.trim();
  const grams = bigramsOf(q);

  const ranked = contacts
    .map((contact) => ({ contact, ...scoreContact(contact, q, grams) }))
    .filter((r) => r.termHits >= 1 || r.gramHits >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const recommendations = ranked.map((r) => ({
    contactId: r.contact.id,
    reason: composeReason(r.contact, r.hitTerms),
    approach: composeApproach(r.contact, now),
  }));

  const cautions = [...new Set(ranked.flatMap((r) => r.contact.boundaries))].slice(0, 3);
  if (cautions.length === 0 && ranked.length > 0) {
    cautions.push('先问人，再问事 —— 先把上下文给足，对方才接得轻。');
  }
  for (const r of ranked) {
    if ((r.contact.stage === 'dormant' || r.contact.stage === 'strained') && cautions.length < 4) {
      cautions.push(`你和${r.contact.alias ?? r.contact.name}之间已经淡了一阵 —— 这次先把"重新说上话"当成目标，别一次问太满。`);
    }
  }

  return {
    report: composeSolverReport(q, contacts.length, ranked.length > 0, ranked[0]?.contact ?? null),
    recommendations,
    cautions,
    principle:
      ranked.length > 0
        ? '找对人比说对话重要 —— 但把问题问小，比两者都稀有。'
        : '名单装不下你要问的问题，这不是坏事 —— 该去把它撑大了。',
  };
};

// ---------------------------------------------------------------------------
// 检索：先给每个联系人打一个确定性分数（同一份存档 + 同一个问题 → 同一个结果）
// ---------------------------------------------------------------------------

/**
 * 检索语料：把"可以对得上话"的事实全并成一段文本。
 * name/alias 也算进去 —— 「想找陈立」这种问题本来就该命中本人。
 */
const corpusOf = (c: Contact): string =>
  [
    c.name,
    c.alias ?? '',
    c.profile.org ?? '',
    c.profile.role ?? '',
    c.profile.field ?? '',
    c.profile.metContext ?? '',
    c.profile.location ?? '',
    // 玩家写的那段话也在语料里 —— 它是"这个人是谁"的唯一叙述。
    // 手动加进来的人往往**只有**这一段（没有机构、没有互动、没有边界），
    // 漏掉它，那个人在"该找谁"里就等同于一个名字。
    c.note ?? '',
    ...c.profile.commonGround,
    ...c.whyItMatters,
    ...c.boundaries,
    ...c.preferences,
    ...c.tags,
    ...c.openCommitments.map((x) => x.text),
    ...c.interactions.map((i) => i.summary),
    ...c.interactions.map((i) => i.followUpNote ?? ''),
    ...c.adviceHistory.map((a) => a.situation),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

/** 强信号：语料切出的词，整词出现在问题里（或反过来）才算命中 */
const termsOf = (c: Contact): string[] =>
  corpusOf(c)
    .split(/[\s\n·/、，,。.：:（）()「」【】—\-]+/)
    .filter((t) => t.length >= 2);

/** 弱信号：问题与语料的二元字重合。中文没有分词器，这是不打结的近似 */
const bigramsOf = (s: string): string[] => {
  const clean = s.toLowerCase().replace(/[\s，。！？、,.:;!?()（）「」【】—…\-]+/g, '');
  const grams = new Set<string>();
  for (let i = 0; i + 1 < clean.length; i++) grams.add(clean.slice(i, i + 2));
  return [...grams];
};

interface SolverScore {
  termHits: number;
  gramHits: number;
  hitTerms: string[];
  score: number;
}

const scoreContact = (c: Contact, question: string, grams: string[]): SolverScore => {
  const corpus = corpusOf(c);
  const q = question.toLowerCase();
  const hitTerms = termsOf(c).filter((t) => q.includes(t));
  const gramHits = grams.filter((g) => corpus.includes(g)).length;
  return {
    termHits: hitTerms.length,
    gramHits,
    hitTerms,
    // 强信号压倒性加权；影响力/信任只做同分时的天平（不喧宾夺主）
    score: hitTerms.length * 8 + gramHits * 2 + c.dimensions.influence * 0.02 + c.dimensions.trust * 0.02,
  };
};

// ---------------------------------------------------------------------------
// 推荐理由：一类关系一句"为什么接得住"，再接一句"你们之间的桥"
// ---------------------------------------------------------------------------

const REASON_COMPOSERS: Record<RelationType, (who: string, field: string) => string> = {
  mentor: (who, field) =>
    `${who}的方向是${field} —— 你要问的这件事，正好落在他的射程里；问他不算打扰，那正是这段关系存在的意义。`,
  peer: (who, field) =>
    `${who}和你站在差不多的地方，${field}是你们共同的语境 —— 同侪最贵的地方，是可以问"蠢问题"而不被记进账本。`,
  collaborator: (who, field) =>
    `${who}在${field}上和你有过真实的协作，他知道你的做事方式 —— 这类事找他，比找更权威的人省一半沟通成本。`,
  investor: (who, field) =>
    `${who}的视角在${field}，更靠近资源和判断那一侧 —— 如果你的问题里有"值不值得、怎么权衡"，他能补上你缺的半张桌子。`,
  romantic: (who) =>
    `${who}比通讯录里任何人都了解你的处境 —— 有些问题不需要专业对口，需要的是一个站在你这边的人。`,
  friend: (who) =>
    `${who}不认识你所有的头衔，但认识你 —— 有些话绕过所有专业视角直接说，反而更清楚。`,
  family: (who) =>
    `${who}关心的是你这个人，不是你这件事的成色 —— 找他说话，先不用把形状整理好。`,
  acquaintance: (who, field) =>
    `${who}在${field}这一带。你们联系不多，但正因为不多，一次具体的请教反而干净：没有历史负担，也没有人情欠账。`,
  other: (who, field) => `${who}和${field}有关，值得先聊一次看看。`,
};

const composeReason = (c: Contact, hitTerms: string[]): string => {
  const who = c.alias ?? c.name;
  const field = c.profile.field ?? c.profile.role ?? '他的领域';
  const composer = REASON_COMPOSERS[c.relationType] ?? REASON_COMPOSERS.other;
  const parts = [composer(who, field)];

  if (hitTerms.length > 0) {
    parts.push(`你提到的「${hitTerms[0]}」，正是他记录在案的关键词。`);
  }
  const last = c.interactions[c.interactions.length - 1];
  parts.push(
    last
      ? `而且你们之间有过具体的来往（最近一次：${last.summary}），开口不是冷启动。`
      : '你们之间还没有具体的往来记录 —— 这次开口会是第一件，所以问题要一次问清楚。',
  );
  return parts.join('');
};

// ---------------------------------------------------------------------------
// 开口建议：先处理"多久没联系"这层现实，再给问法
// ---------------------------------------------------------------------------

const APPROACH_COMPOSERS: Record<RelationType, string> = {
  mentor: '把问题收紧成一个：先说你在哪一步、试过什么、卡在哪里，然后只问那个最堵的点 —— 他回答真问题的意愿，远高于回答"我该怎么办"。',
  peer: '直接说结论和卡点，不用铺垫。开头一句"问个可能有点蠢的问题"就够了。',
  collaborator: '以一件具体的事开口：把你手上正在进行的东西发过去，让问题附着在它上面。',
  investor: '先给一个你自己的判断，再请他挑毛病。请人指点之前，先证明你想过了。',
  romantic: '先把"我想说说这件事"说出来，再说是哪件事。顺序反了，对方会以为你在找方案，其实你要的是听众。',
  friend: '约一次见面，或者打个电话 —— 这类话说在文字里会显得重，说出口反而轻。',
  family: '不用等想清楚了再开口。家人接住的是你，不是你的表达。',
  acquaintance: '消息里带三样东西：你是谁（一句）、为什么找他（一句）、要问的那一个问题（一句）。然后等，别追。',
  other: '一次只带一个问题出去，问完就先停下来听。',
};

const composeApproach = (c: Contact, now: Date): string => {
  const daysSince = c.lastContactAt === null ? null : daysBetween(c.lastContactAt, now);
  const parts: string[] = [];

  if (daysSince !== null && daysSince > c.contactCadenceDays) {
    parts.push(
      `你们有 ${daysSince} 天没联系了 —— 别直接开始提问，先说一句你最近在做什么，把这个问题自然带出来。`,
    );
  }
  parts.push(APPROACH_COMPOSERS[c.relationType] ?? APPROACH_COMPOSERS.other);
  if (c.stage === 'strained') {
    parts.push('另外：别在这次的消息里翻旧账。裂痕是被日常盖过去的，不是被谈话填平的。');
  }
  return parts.join('');
};

// ---------------------------------------------------------------------------
// 报告正文：两条路径都必须是"人话"，不许打太极
// ---------------------------------------------------------------------------

const composeSolverReport = (
  question: string,
  contactCount: number,
  hasMatch: boolean,
  top: Contact | null,
): string => {
  const paras: string[] = [
    `你说的是：「${question}」。我把通讯录里 ${contactCount} 个人从头到尾过了一遍。`,
  ];

  if (hasMatch && top) {
    const field = top.profile.field ?? top.profile.role ?? '你要去的地方';
    paras.push(
      `这件事落在「${field}」这一带，而你的名单里正好有人站在那儿 —— 判断的依据不只有头衔，` +
        `还有你留下的记录：他在做什么、你们之间发生过什么、以及他明确说过不接什么。` +
        `最匹配的人不一定是分量最重的那个，是最接得住的。`,
    );
    paras.push(
      '动作上只有一个建议：一次只带一个问题出去。请求越具体，对方答应得越轻松 —— 这一条对越厉害的人越成立。',
    );
  } else {
    paras.push(
      '说实话：这份名单里没有直接站在这个问题上的人。我不打算硬凑一个 —— ' +
        '把问题交给不对口的人，消耗的是两个人和一次机会。',
    );
    paras.push(
      '这未必是坏消息。它说明你遇到了第一个需要向外长的问题 —— ' +
        '解决它的方式不是在这份名单里凑，是去问题的现场认识一个人：一次活动、一个社区、一门课。' +
        '等你把他记进通讯录，下次就可以问他了。',
    );
  }

  return paras.join('\n\n');
};

// ============================================================================
// 派生行动任务的标题预填
//
// 优先级与 mockNetworkAdvisor.pickMove 完全一致：
// 已说出口的承诺 > 超期未联系 > 上次留下的尾巴 > 稳定（发一件正在做的事）。
// 它只是**预填**：落在输入框里，玩家改完才生效 —— 系统不替玩家定任务。
// ============================================================================

export const suggestContactQuestTitle = (contact: Contact, now: Date): string => {
  const who = contact.alias ?? contact.name;
  const pending = contact.openCommitments.find((c) => !c.done);
  if (pending) return `把答应${who}的事做掉 —— ${pending.text}`;

  const daysSince = contact.lastContactAt === null ? null : daysBetween(contact.lastContactAt, now);
  if (daysSince !== null && daysSince > contact.contactCadenceDays) {
    return `主动联系${who}一次（不带诉求）`;
  }

  const followUp = [...contact.interactions].reverse().find((i) => i.followUpAt !== null);
  if (followUp?.followUpNote) return `收掉上次的尾巴 —— ${followUp.followUpNote}`;

  return `给${who}发一件我最近在做的事`;
};
