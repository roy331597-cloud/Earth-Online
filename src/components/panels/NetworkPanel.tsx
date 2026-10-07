import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PanelShell } from '@/components/panels/PanelShell';
import { useNow } from '@/hooks/useNow';
import {
  CHANNEL_LABELS,
  RELATION_STAGES,
  RELATION_STAGE_LABELS,
  RELATION_TYPES,
  RELATION_TYPE_LABELS,
  contactSubtitle,
} from '@/data/catalog/network';
import { cn } from '@/lib/cn';
import { formatDateKeyCN } from '@/lib/format';
import { suggestContactQuestTitle } from '@/lib/mockAdvisor';
import type { PanelKey } from '@/lib/panels';
import { daysSinceContact, isUnrecorded, networkSummary } from '@/lib/selectors';
import { useAgentAction } from '@/hooks/useAgentAction';
import { InlineError } from '@/components/ui/InlineError';
import { thunks } from '@/store/agentRuntime';
import { createContact, createContactQuest, setContactStage } from '@/store/operations';
import { useMutate, useSave } from '@/store/useEarthOnlineStore';
import type {
  Contact,
  ContactId,
  Interaction,
  NetworkAdviceRecord,
  RelationStage,
  RelationType,
  SolverConsultation,
} from '@/types';

interface NetworkPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 关系图谱 (Network CRM)。
 *
 * 这一页最需要克制的，是**别把它做成一个管理人脉的工具**。
 * 所以：不排序成"最有价值的人在前"，不出现"人脉价值"这类词，
 * 评级徽标用同一个灰蓝、不做好坏配色。
 *
 * PO 裁定（Phase 4 收官后）：把**替玩家排关系**的两样都撤了 ——
 * 「该联系了」（超期提醒）和「核心圈」（grade S/A 排座次）。
 * 腾出来的位置交给玩家自己：每张卡片上有一条**关系等级**，
 * 由他定、由他改。系统这边的口径只剩一句"多久没联系过"——
 * 那是事实，不是催促。
 *
 * 它是一面镜子，不是一张 KPI 表。
 */
export function NetworkPanel({ panel, onClose }: NetworkPanelProps) {
  const save = useSave();
  const [advisorFor, setAdvisorFor] = useState<ContactId | null>(null);
  const [solverOpen, setSolverOpen] = useState(false);
  const now = useNow();
  const summary = useMemo(() => networkSummary(save, now), [save, now]);

  const advisorContact = advisorFor ? save.network.contacts.find((c) => c.id === advisorFor) ?? null : null;
  const solverCount = save.network.solverLog.length;

  return (
    <>
      <PanelShell
        panel={panel}
        onClose={onClose}
        subheader={
          /* 原来这里是三格数字：联系人 / 该联系了 / 核心圈。
             中间那格在催人，右边那格在替人分主次 —— 两格都撤了。
             现在只报一件事实（名单上有几个人），外加一行**玩家自己写下的**
             等级分布：数的是他定过的那几档，没定过的人不进任何一档
             （那不是第九档，那是"还没说"）。 */
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2.5">
            <span className="text-[10px] tracking-wider text-white/35">名单</span>
            <span className="numeric text-[15px] font-semibold leading-none text-white/85">
              {summary.totalContacts}
            </span>
            <span className="text-[10px] text-white/35">人</span>
            {RELATION_STAGES.filter((s) => summary.byLevel[s] > 0).map((s) => (
              <span
                key={s}
                className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/45"
              >
                {RELATION_STAGE_LABELS[s]}
                <span className="numeric ml-1 text-white/65">{summary.byLevel[s]}</span>
              </span>
            ))}
          </div>
        }
      >
        <div className="space-y-3 pt-3.5">
          {/* 全局检索入口。与卡片上的「呼叫社交智囊」分工不同：
              那个是"关于这个人，话怎么说"；这个是"有这件事，该找谁" */}
          <button
            type="button"
            onClick={() => setSolverOpen(true)}
            className="w-full rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3.5 text-left transition-all duration-300 ease-cinematic hover:border-amber-400/50 hover:bg-amber-400/[0.12]"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium tracking-wide text-amber-200">向智囊团求助</span>
              {solverCount > 0 && (
                <span className="numeric text-[10.5px] text-white/35">问过 {solverCount} 次</span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              手上有一件不知道找谁的事？说清楚它，然后在整个名单里找接得住的人。
            </p>
          </button>

          {save.network.contacts.map((c) => (
            <ContactCard key={c.id} contact={c} now={now} onAsk={() => setAdvisorFor(c.id)} />
          ))}

          {/* 名单的尾巴。放这儿而不是顶上，有两个理由：
              ① 它长得像"下一个位置"，不像一个功能按钮 —— 名单本来就该能往下长；
              ② 加进来的人正好出现在它上面，玩家看得见"他进去了"。 */}
          <AddContactRow />
        </div>
      </PanelShell>

      {advisorContact && <AdvisorDrawer contact={advisorContact} onClose={() => setAdvisorFor(null)} />}
      {solverOpen && <SolverDrawer onClose={() => setSolverOpen(false)} />}
    </>
  );
}

/**
 * 关系等级 —— 这一页唯一由**玩家**说了算的一栏。
 *
 * 它与四维、评级的分工是这套数据结构里最要紧的一条：那两样是**观测值**，
 * 这一条是**判断**。所以它永远画得出来 —— 哪怕这个人刚被记进来、什么都没有，
 * 这一栏也在，写着"还没定"；也永远改得动，改主意不需要理由。
 *
 * 展开态把八档一次全摊开，不做两级菜单：这段关系走到哪一步，
 * 玩家一眼就认得出来，让他为此翻两层抽屉是没道理的。
 */
function LevelPicker({ contact }: { contact: Contact }) {
  const [open, setOpen] = useState(false);
  const mutate = useMutate();

  const set = (stage: RelationStage) => {
    mutate((s) => setContactStage(s, contact.id, stage));
    setOpen(false);
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-expanded={open}
        aria-label="关系等级"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'rounded border px-1.5 py-0.5 text-[10px] transition-all duration-300 ease-cinematic',
          contact.stage === null
            ? 'border-dashed border-white/20 text-white/40 hover:border-white/35 hover:text-white/65'
            : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white/75',
        )}
      >
        等级 · {contact.stage === null ? '还没定' : RELATION_STAGE_LABELS[contact.stage]}
        <span className="ml-1 opacity-45">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {RELATION_STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={contact.stage === s}
                onClick={() => set(s)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] transition-all duration-300 ease-cinematic',
                  contact.stage === s
                    ? 'border-amber-400/50 bg-amber-400/[0.12] text-amber-200'
                    : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
                )}
              >
                {RELATION_STAGE_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">
            这一条只有你说了算，随时能改；智囊会照它来跟你说话。
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 手动添加一个人（列表尾巴上的那一格）
// ---------------------------------------------------------------------------

/** 名字的长度上限。够写下一个全名加一个称呼，不够写成一句自我介绍 */
const NAME_MAX = 20;
/** 那段描述的长度上限。与智囊的「处境」同量级 —— 它是备忘，不是档案 */
const NOTE_MAX = 200;

/**
 * 全项目唯一由玩家亲手新增联系人的入口。
 *
 * 表单刻意只有三格：**名字（必填）、关系、一段话（可留空）**。
 * 要不到的别的东西（阶段、评级、四维）都是**观测值** —— 一个刚被记下来的人身上
 * 观测是零，所以它们一律从"没有"起步，卡片上也如实写着"还没有记录"。
 * 这不是没做完，是这个功能最要紧的一条：**系统不替玩家编一个他不认识的人。**
 */
function AddContactRow() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationType, setRelationType] = useState<RelationType>('acquaintance');
  const [note, setNote] = useState('');
  const mutate = useMutate();

  const ready = name.trim().length > 0;

  const submit = () => {
    if (!ready) return;
    // 时间在 UI 这一层注入（与派任务那条路径同款）：纯函数不读时钟
    mutate((s) => createContact(s, { name, relationType, note }, new Date()));
    setOpen(false);
    setName('');
    setNote('');
    setRelationType('acquaintance');
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3.5 text-left transition-all duration-300 ease-cinematic hover:border-white/30 hover:bg-white/[0.04]"
      >
        <span className="text-[12px] text-white/55">＋ 添加一个人</span>
        <span className="mt-1 block text-[10.5px] leading-relaxed text-white/30">
          有人该在这份名单上，只是还没记下来 —— 写下名字，和一段关于他的话。
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-abyss-400/25 bg-abyss-500/[0.06] p-3">
      <div className="text-[10px] tracking-wider text-abyss-300/80">添加一个人</div>

      <input
        type="text"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        maxLength={NAME_MAX}
        aria-label="名字"
        placeholder="名字，或你平时怎么称呼他"
        className="mt-1.5 w-full rounded-lg border border-white/[0.12] bg-ink-950/45 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      {/* 关系类型：九选一。它是这里唯一必选的分类项 ——
          分类是"我知道的"，阶段/评级才是"我观察到的"。 */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {RELATION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={relationType === t}
            onClick={() => setRelationType(t)}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] transition-all duration-300 ease-cinematic',
              relationType === t
                ? 'border-amber-400/50 bg-amber-400/[0.12] text-amber-200'
                : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
            )}
          >
            {RELATION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={NOTE_MAX}
        aria-label="关于这个人的一段话"
        placeholder="可以留空。比如：大学室友，现在在做医疗器械注册，人很直接。"
        className="mt-2.5 w-full resize-none rounded-lg border border-white/[0.12] bg-ink-950/45 px-2.5 py-2 text-[12px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="glass-pill glass-hover flex-1 py-1.5 text-[11.5px] text-white/60"
        >
          算了
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className={cn(
            'flex-[1.4] rounded-lg border py-1.5 text-[11.5px] transition-all duration-300 ease-cinematic',
            ready
              ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 hover:scale-[1.02] hover:bg-amber-400/25'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          加进名单
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-white/35">
        他进来时是空的 —— 没有记录，也没有评级。等级那一栏随时由你来定。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 联系人卡片
// ---------------------------------------------------------------------------

function ContactCard({ contact, now, onAsk }: { contact: Contact; now: Date; onAsk: () => void }) {
  const unrecorded = isUnrecorded(contact);
  const since = daysSinceContact(contact, now);
  const last = contact.interactions[contact.interactions.length - 1] ?? null;
  const undone = contact.openCommitments.filter((c) => !c.done);
  const [deriving, setDeriving] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const mutate = useMutate();

  // 预填优先取"你本来就欠他的"：未兑现的承诺 > 逾期未联系 > 记录里的待办。
  // 一处都不占时退回一句中性的 —— 预填是起手式，不是替玩家做决定。
  const openDerive = () => {
    setDraftTitle(suggestContactQuestTitle(contact, now));
    setDeriving(true);
  };

  const submitDerive = () => {
    const t = draftTitle.trim();
    if (t.length === 0) return;
    mutate((s) => createContactQuest(s, contact.id, { title: t }, new Date()));
    setDeriving(false);
    setDraftTitle('');
  };

  return (
    <article className="glass-hover rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      {/* 头：姓名 + 关系类型 + 评级 */}
      <div className="flex items-baseline gap-2">
        <h3 className="truncate text-[14px] font-medium tracking-wide text-white">{contact.name}</h3>
        {contact.alias && <span className="shrink-0 text-[10.5px] text-white/35">{contact.alias}</span>}
        <span className="ml-auto shrink-0 rounded-md border border-abyss-400/30 bg-abyss-500/10 px-1.5 py-0.5 text-[10px] leading-[1.4] text-abyss-300/90">
          {RELATION_TYPE_LABELS[contact.relationType]}
        </span>
      </div>

      <ContactIdentity contact={contact} />

      {/* 多久没联系了 —— 一句**事实**，不是一句催促。
          它曾经会变成琥珀色的"超期 N 天"（那是「该联系了」在卡片上的那一格），
          现在只剩灰字：你知道就行了，什么时候去联系是你的事。
          评级（S/A/B/C/D）也从这里撤了：它和下面的等级回答的是同一个问题，
          而两个词摆在一起必然打架（`S` 的语气正是「长期同行」）。 */}
      {since !== null && <div className="mt-2.5 text-[10px] text-white/35">{since} 天前联系过</div>}

      <LevelPicker contact={contact} />

      {/* 一段记录都没有的人：这里照实说。不画那两条空进度条 ——
         两根"温度 0 · 信任 0"的灰条读起来是打分，而这张卡片此刻
          唯一诚实的说法是"还没有记录"。 */}
      {unrecorded ? (
        <p className="prose-cinematic mt-2.5 text-[11px] leading-relaxed text-white/35">
          还没有记录。这里会长出什么，取决于你们之间真的发生了什么。
        </p>
      ) : (
        /* 双维：温度与信任。只画这两条 —— 影响力与双向度是给人看的指标，
           画进卡片会把这段关系变成一张评估表。 */
        <div className="mt-3 space-y-2">
          <DimBar label="温度" value={contact.dimensions.warmth} tone="warm" />
          <DimBar label="信任" value={contact.dimensions.trust} tone="cool" />
        </div>
      )}

      {/* 画像备忘录。四块**都**可以留空 —— 留空就不出现，不留一句"暂无"。
          这一栏是写给自己的，不是要填满的表格：与其逼出一句空话，
          不如让它空着，等到真有那句话的时候再写。 */}
      {(contact.note !== null ||
        contact.whyItMatters.length > 0 ||
        contact.preferences.length > 0 ||
        contact.boundaries.length > 0) && (
        <div className="mt-3 space-y-2">
          {contact.note !== null && <Memo title="关于这个人" lines={[contact.note]} />}
          {contact.whyItMatters.length > 0 && (
            <Memo title="为什么在意这段关系" lines={contact.whyItMatters} />
          )}
          {contact.preferences.length > 0 && (
            <Memo title="相处上的偏好" lines={contact.preferences} />
          )}
          {contact.boundaries.length > 0 && (
            <Memo title="不该做的事" lines={contact.boundaries} muted />
          )}
        </div>
      )}

      {undone.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-2">
          <div className="text-[10px] tracking-wider text-amber-300/85">你答应过但还没做</div>
          <ul className="mt-1 space-y-0.5">
            {undone.map((c) => (
              <li key={c.text} className="text-[11px] leading-relaxed text-white/65">
                {c.text}
                {c.dueAt && (
                  <span className="ml-1.5 text-[10px] text-white/35">· {formatDateKeyCN(c.dueAt.slice(0, 10))}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {last && (
        <p className="prose-cinematic mt-2.5 border-l-2 border-white/[0.12] pl-2.5 text-[11px] leading-relaxed text-white/45">
          上次 · {CHANNEL_LABELS[last.channel]} · {last.summary}
        </p>
      )}

      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={onAsk}
          className="flex-1 rounded-lg border border-white/15 bg-white/[0.05] py-2 text-[11.5px] text-white/70 transition-all duration-300 ease-cinematic hover:border-white/30 hover:text-white active:scale-[0.99]"
        >
          呼叫社交智囊
        </button>
        <button
          type="button"
          aria-expanded={deriving}
          onClick={deriving ? () => setDeriving(false) : openDerive}
          className="flex-1 rounded-lg border border-amber-400/40 bg-amber-400/[0.12] py-2 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/[0.22] active:scale-[0.99]"
        >
          {deriving ? '先不派了' : '派生行动任务'}
        </button>
      </div>

      {/* 派生表单。填好直接进「进行中」—— 不走审核门控：那道闸门防的是 AI，
          而这条任务出自玩家自己的选择（见 operations.createContactQuest 的注释） */}
      {deriving && (
        <div className="mt-2 rounded-xl border border-abyss-400/25 bg-abyss-500/[0.06] p-2.5">
          <div className="text-[10px] tracking-wider text-abyss-300/80">派生一条行动任务</div>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={40}
            aria-label="任务标题"
            placeholder="和这个人有关、你想做的一件事…"
            className="mt-1.5 w-full rounded-lg border border-white/[0.12] bg-ink-950/45 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setDeriving(false)}
              className="glass-pill glass-hover flex-1 py-1.5 text-[11.5px] text-white/60"
            >
              算了
            </button>
            <button
              type="button"
              disabled={draftTitle.trim().length === 0}
              onClick={submitDerive}
              className={cn(
                'flex-[1.4] rounded-lg border py-1.5 text-[11.5px] transition-all duration-300 ease-cinematic',
                draftTitle.trim().length > 0
                  ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 hover:scale-[1.02] hover:bg-amber-400/25'
                  : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
              )}
            >
              派下去（直接进「进行中」）
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-white/35">
            做完之后，这段关系上会多一条互动记录 —— 温度和信任各涨一点。
          </p>
        </div>
      )}
    </article>
  );
}

/**
 * 身份。
 *
 * 制作人裁定（Phase 2 闭幕）：关系卡片里最重要的一件事是
 * **「我能有个印象对方是谁、有什么身份」** —— 不是维度分、不是评级。
 * 所以身份从原来那一行灰色小字，升成了卡片里唯一一块有左边线的内容，
 * 机构与角色用正常字重，其余（领域 / 在哪 / 怎么认识的）退成一行附注。
 *
 * 这一块的写法有一条纪律：**只记事实，不写评价**（见 Contact.profile 的注释）。
 * "复旦大学生命科学学院 · 副教授"是事实；"很厉害的教授"不是，会污染 AI 的输入。
 */
function ContactIdentity({ contact }: { contact: Contact }) {
  const { field, location, metContext, metAt } = contact.profile;
  const headline = contactSubtitle(contact);
  const meta = [field, location, metContext].filter(Boolean) as string[];

  return (
    <div className="mt-2 border-l-2 border-abyss-400/35 pl-2.5">
      <div className="text-[11.5px] leading-snug text-white/75">{headline}</div>
      {(meta.length > 0 || metAt) && (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] text-white/35">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {metAt && <span className="numeric">{formatMetAt(metAt)}认识</span>}
        </div>
      )}
    </div>
  );
}

/** "2026 年 9 月认识" —— 只到月。认识的精确日期没有人记得住，也没有用 */
function formatMetAt(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-');
  return y && m ? `${Number(y)} 年 ${Number(m)} 月` : '';
}

/** 温度走暖色、信任走冷色 —— 两维共用一个色系就分不出谁在动 */
function DimBar({ label, value, tone }: { label: string; value: number; tone: 'warm' | 'cool' }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[10px] text-white/40">{label}</span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-cinematic',
            tone === 'warm' ? 'bg-gradient-to-r from-amber-600/80 to-amber-400' : 'bg-gradient-to-r from-abyss-500 to-abyss-300',
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="numeric w-6 shrink-0 text-right text-[10px] text-white/45">{value}</span>
    </div>
  );
}

function Memo({ title, lines, muted }: { title: string; lines: string[]; muted?: boolean }) {
  return (
    <div>
      <div className={cn('text-[10px] tracking-wider', muted ? 'text-white/30' : 'text-white/35')}>{title}</div>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((l) => (
          <li
            key={l}
            className={cn(
              'prose-cinematic text-[11px] leading-relaxed',
              muted ? 'text-white/40' : 'text-white/60',
            )}
          >
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 社交智囊抽屉
// ---------------------------------------------------------------------------

const SENTIMENT_DOT: Record<Interaction['sentiment'], string> = {
  positive: 'bg-amber-400/80',
  neutral: 'bg-white/30',
  strained: 'bg-abyss-300/70',
  unclear: 'bg-white/15',
};

/**
 * 毛玻璃抽屉。
 *
 * ⚠️ 必须 portal 到 body：面板用了 backdrop-blur，而 `backdrop-filter`
 *    会为 fixed 后代创建包含块 —— 就地渲染的话 `fixed inset-0` 只盖住面板本身。
 *    （同一个坑在 ConfirmDialog 里已经踩过一次，见那里的注释。）
 *
 * 内容顺序是刻意的：**先给他看这个人和你之间发生过什么，再给建议。**
 * 一上来就出主意的 AI，和人一上来就教你做人的样子是一样的。
 */
function AdvisorDrawer({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { busy, error, run, clearError } = useAgentAction();
  const [situation, setSituation] = useState('');

  const history = contact.adviceHistory;
  const latest: NetworkAdviceRecord | null = history.length > 0 ? history[history.length - 1]! : null;
  const interactions = [...contact.interactions].reverse();
  const undone = contact.openCommitments.filter((c) => !c.done);

  // 产出**入库存档**（追加进 adviceHistory），不是一次性的弹窗内容 ——
  // 建议的价值在于事后回看"我当时听了什么、后来做了没有"。
  const ask = () =>
    void run(() => thunks.askAdvisor({ contactId: contact.id, situation }));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/60 backdrop-blur-[2px]"
      />

      <div className="glass-deep relative flex max-h-[86vh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-2xl md:my-6 md:mr-6 md:max-h-[calc(100vh-3rem)] md:w-[24rem] md:animate-panel-in md:rounded-2xl">
        {/* 头 */}
        <div className="shrink-0 p-4 pb-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20 md:hidden" />
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.18em] text-abyss-300/80">SOCIAL CONSULTANT</div>
              <h2 className="mt-1 truncate text-[15px] font-medium tracking-wide text-white">
                关于 {contact.alias ?? contact.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="ml-auto shrink-0 px-2 py-1 text-white/40 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="prose-cinematic mt-1.5 text-[11.5px] leading-relaxed text-white/50">
            先把你们之间发生过的事摆出来，再说怎么做。
          </p>
        </div>
        <div className="h-px shrink-0 bg-white/10" />

        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {/* ① 历史互动备忘 */}
          <SectionTitle>互动备忘 · {contact.interactionCount} 次</SectionTitle>
          {interactions.length === 0 ? (
            <p className="mt-1.5 text-[11.5px] text-white/35">还没有记过互动。</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {interactions.map((it) => (
                <li key={it.id} className="flex gap-2.5">
                  <span className={cn('mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full', SENTIMENT_DOT[it.sentiment])} />
                  <div className="min-w-0">
                    <div className="text-[10px] text-white/35">
                      {formatDateKeyCN(it.localDate)} · {CHANNEL_LABELS[it.channel]}
                      {it.initiatedByMe ? ' · 你发起的' : ' · 对方发起'}
                    </div>
                    <p className="prose-cinematic mt-0.5 text-[11.5px] leading-relaxed text-white/70">
                      {it.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {undone.length > 0 && (
            <>
              <SectionTitle className="mt-4">还欠着的事</SectionTitle>
              <ul className="mt-1.5 space-y-1">
                {undone.map((c) => (
                  <li key={c.text} className="text-[11.5px] leading-relaxed text-amber-200/80">
                    · {c.text}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="my-4 h-px bg-white/10" />

          {/* ② 求助 */}
          <SectionTitle>你在想什么（可以留空）</SectionTitle>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            rows={2}
            maxLength={160}
            placeholder="比如：想请他帮个忙，但很久没联系了，不知道怎么开口"
            aria-label="处境"
            className="mt-2 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/45 px-3 py-2.5 text-[12px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
          />
          <button
            type="button"
            disabled={busy}
            onClick={ask}
            className="mt-2.5 w-full rounded-lg border border-amber-400/50 bg-amber-400/15 py-2.5 text-[12.5px] font-medium text-amber-200 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? '智囊正在读这份关系…' : latest ? '再问一次' : '请智囊看看'}
          </button>

          {error && <InlineError message={error} onDismiss={clearError} />}

          {/* ③ 建议 */}
          {latest ? (
            <AdviceCard record={latest} />
          ) : (
            <p className="prose-cinematic mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3.5 text-[11.5px] leading-relaxed text-white/45">
              还没有问过。留空也可以 —— 他会先看这份档案，再告诉你怎么走这一步。
            </p>
          )}

          {history.length > 1 && (
            <p className="mt-3 text-[10px] text-white/25">
              这段关系上你一共问过 {history.length} 次。前面的都留着，没有删。
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[10.5px] tracking-[0.18em] text-white/45', className)}>{children}</h3>;
}

function AdviceCard({ record }: { record: NetworkAdviceRecord }) {
  return (
    <article className="mt-4 rounded-xl border border-abyss-400/25 bg-abyss-500/[0.07] p-3.5">
      {/* 建议正文。自己的处境在前，建议在后 —— 与日记页同一条排版主张 */}
      <div className="space-y-2.5">
        {record.advice.split('\n\n').map((para, i) => (
          <p key={i} className="prose-cinematic whitespace-pre-wrap text-[12.5px] leading-[1.8] text-white/80">
            {para}
          </p>
        ))}
      </div>

      {record.suggestedAction && (
        <div className="mt-3 rounded-lg border border-white/10 bg-ink-950/40 p-2.5">
          <div className="text-[10px] tracking-wider text-abyss-300/80">可以这么做</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-white/45">
            <span>时机 · {record.suggestedAction.timing}</span>
            <span>渠道 · {record.suggestedAction.channel}</span>
          </div>
          {record.suggestedAction.openingLine && (
            <p className="prose-cinematic mt-1.5 text-[12px] leading-relaxed text-white/80">
              「{record.suggestedAction.openingLine}」
            </p>
          )}
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/40">{record.suggestedAction.intent}</p>
        </div>
      )}

      {record.avoid.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] tracking-wider text-white/35">这次别做</div>
          <ul className="mt-1 space-y-0.5">
            {record.avoid.map((a) => (
              <li key={a} className="text-[11px] leading-relaxed text-white/50">
                · {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="prose-cinematic mt-3 border-l-2 border-amber-400/30 pl-2.5 text-[11.5px] leading-relaxed text-amber-200/85">
        {record.principle}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 智囊团抽屉（全局检索 · Solver）
// ---------------------------------------------------------------------------

/**
 * 「向智囊团求助」。
 *
 * 与 AdvisorDrawer 的分工（两条记录各自成线，见 SolverConsultation 的注释）：
 *   AdvisorDrawer —— 关于**某个人**，话该怎么说（入口在卡片上）
 *   SolverDrawer  —— 有**这件事**，该找谁（入口在面板顶部）
 *
 * 输出顺序也是刻意的：先给分析（把处境放回你的名单里看），再给人（1~2 位），
 * 最后才给"怎么开口"。名单里确实没有对口的人时**诚实地说没有** ——
 * 不硬配一个。凑数推荐会教会玩家一件事："智囊团的建议可以不当真"，
 * 而一旦这句话成立，整个关系档案的价值也跟着塌了。
 *
 * ⚠️ 与 AdvisorDrawer 同：面板里有 backdrop-blur，必须 portal 到 body。
 */
function SolverDrawer({ onClose }: { onClose: () => void }) {
  const save = useSave();
  const { busy, error, run, clearError } = useAgentAction();
  const [question, setQuestion] = useState('');

  const log = save.network.solverLog;
  const latest: SolverConsultation | null = log.length > 0 ? log[log.length - 1]! : null;
  const ready = question.trim().length > 0 && !busy;

  const ask = () => {
    if (!ready) return;
    void run(async () => {
      const result = await thunks.solveNetwork({ question });
      // 与 Spark Box 同一条纪律：只有真的问成了才清空输入框
      if (result.ok) setQuestion('');
      return result;
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/60 backdrop-blur-[2px]"
      />

      <div className="glass-deep relative flex max-h-[86vh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-2xl md:my-6 md:mr-6 md:max-h-[calc(100vh-3rem)] md:w-[24rem] md:animate-panel-in md:rounded-2xl">
        {/* 头 */}
        <div className="shrink-0 p-4 pb-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20 md:hidden" />
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.18em] text-abyss-300/80">SOCIAL SOLVER</div>
              <h2 className="mt-1 text-[15px] font-medium tracking-wide text-white">向智囊团求助</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="ml-auto shrink-0 px-2 py-1 text-white/40 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="prose-cinematic mt-1.5 text-[11.5px] leading-relaxed text-white/50">
            把困境说清楚，它会在整个名单里找接得住的人。
          </p>
        </div>
        <div className="h-px shrink-0 bg-white/10" />

        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          <SectionTitle>你手上的这件事</SectionTitle>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={240}
            placeholder="比如：想找人看看我这份研究的思路，但不知道谁愿意花这个时间"
            aria-label="困境"
            className="mt-2 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/45 px-3 py-2.5 text-[12px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
          />
          <button
            type="button"
            disabled={!ready}
            onClick={ask}
            className={cn(
              'mt-2.5 w-full rounded-lg border py-2.5 text-[12.5px] transition-all duration-300 ease-cinematic',
              ready
                ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]'
                : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
            )}
          >
            {busy ? '正在翻整个通讯录…' : latest ? '再问一次' : '请智囊团看看'}
          </button>

          {error && <InlineError message={error} onDismiss={clearError} />}

          {latest ? (
            <ConsultationCard consultation={latest} contacts={save.network.contacts} />
          ) : (
            <p className="prose-cinematic mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3.5 text-[11.5px] leading-relaxed text-white/45">
              还没有问过。名单上到底有没有人接得住，说一句就知道了 ——
              如果确实没有，它会直接告诉你没有，不会硬凑一个人出来。
            </p>
          )}

          {log.length > 1 && (
            <p className="mt-3 text-[10px] text-white/25">
              你一共问过 {log.length} 次。前面的都留着，没有删。
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConsultationCard({
  consultation,
  contacts,
}: {
  consultation: SolverConsultation;
  contacts: Contact[];
}) {
  const byId = new Map(contacts.map((c) => [c.id, c] as const));

  return (
    <article className="mt-4">
      {/* 你问的原话留在这儿 —— 回看时先想起的是"当时我怎么说的" */}
      <p className="border-l-2 border-white/[0.12] pl-2.5 text-[11px] leading-relaxed text-white/45">
        {consultation.question}
      </p>

      {/* 分析正文 */}
      <div className="mt-3 space-y-2.5 rounded-xl border border-abyss-400/25 bg-abyss-500/[0.07] p-3.5">
        {consultation.report.split('\n\n').map((para, i) => (
          <p key={i} className="prose-cinematic whitespace-pre-wrap text-[12.5px] leading-[1.8] text-white/80">
            {para}
          </p>
        ))}
      </div>

      {consultation.recommendations.length > 0 && (
        <>
          <SectionTitle className="mt-4">可以找的人</SectionTitle>
          <ul className="mt-2 space-y-2">
            {consultation.recommendations.map((rec) => {
              const c = byId.get(rec.contactId);
              return (
                <li key={rec.contactId} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium tracking-wide text-white">
                      {c?.name ?? '一位联系人'}
                    </span>
                    {c && (
                      <span className="shrink-0 text-[10px] text-white/35">
                        {RELATION_TYPE_LABELS[c.relationType]}
                      </span>
                    )}
                  </div>
                  {c && <div className="mt-0.5 text-[10px] text-white/35">{contactSubtitle(c)}</div>}
                  <p className="prose-cinematic mt-1.5 text-[11.5px] leading-relaxed text-white/65">
                    {rec.reason}
                  </p>
                  <p className="prose-cinematic mt-2 border-l-2 border-amber-400/30 pl-2.5 text-[11.5px] leading-relaxed text-amber-100/85">
                    {rec.approach}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {consultation.cautions.length > 0 && (
        <>
          <SectionTitle className="mt-4">先说在前面的</SectionTitle>
          <ul className="mt-1.5 space-y-1">
            {consultation.cautions.map((c) => (
              <li key={c} className="text-[11px] leading-relaxed text-white/55">
                · {c}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="prose-cinematic mt-3.5 border-l-2 border-amber-400/30 pl-2.5 text-[11.5px] leading-relaxed text-amber-200/85">
        {consultation.principle}
      </p>
    </article>
  );
}
