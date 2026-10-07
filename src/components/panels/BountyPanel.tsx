import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PanelShell } from '@/components/panels/PanelShell';
import { TurnInSheet } from '@/components/panels/TurnInSheet';
import { PanelTabs } from '@/components/ui/PanelTabs';
import { classLabelOf } from '@/data/catalog/classes';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';
import { previewRoute } from '@/lib/mockForge';
import type { PanelKey } from '@/lib/panels';
import { REROUTE_CHAIN_LIMIT, REROUTE_REQUEST_MAX_LEN } from '@/data/catalog/policy';
import { draftQuests, inHandQuests, questsByStatus } from '@/lib/selectors';
import { useAgentAction } from '@/hooks/useAgentAction';
import { InlineError } from '@/components/ui/InlineError';
import { thunks } from '@/store/agentRuntime';
import {
  chainsAwaitingRegeneration,
  claimQuest,
  openTurnIn,
  reviewQuestDraft,
  startQuest,
  type RegenerationCandidate,
} from '@/store/operations';
import { useMutate, useSave } from '@/store/useEarthOnlineStore';
import type { Quest } from '@/types';

type BountyTab = 'board' | 'active' | 'review' | 'spark';

interface BountyPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 悬赏中枢（The Tavern）。
 *
 * Phase 2 收官时它从"任务流的前半段"长成了**四联中枢**：
 *
 *   「悬赏板」  offered                        —— 要不要接
 *   「进行中」  claimed / active / turn_in_pending —— 做没做完（自日常面板彻底迁入）
 *   「待议」    draft                          —— AI 给的草稿，通过或打回
 *   「灵感」    spark                          —— 把一句想法铸成任务链
 *
 * ---------------------------------------------------------------------------
 * 「进行中」为什么搬到这里，而不是留在日常面板
 * ---------------------------------------------------------------------------
 * 两块面板的时间感不一样：日常与周常是**周期性**的，刻度是"今天 / 这一周"，
 * 无始无终、反复发生；而一条执行中的任务没有周期，它只有一个状态，
 * 有始有终。把"做没做完"和"今天做没做"关在同一屏里，两种时间感会互相打架。
 * 分开之后各归其位：
 *   悬赏中枢 = 你选择并推进的事；日常面板 = 你反复发生的事。
 *
 * ---------------------------------------------------------------------------
 * 为什么「待议」独立成一栏，而不是留在悬赏板上
 * ---------------------------------------------------------------------------
 * 悬赏板上剩下的事有一个共同点：**它们已经是事实了**，你只是在决定什么时候动手。
 * 而「通过 / 打回」是**在修改世界的清单** —— 判错了，你要么背上一件不该做的事，
 * 要么少一个台阶。两种动作的心理成本完全不同，混在一屏里的后果是玩家会开始
 * 批量点「通过」。分开之后，"裁决"重新变得是个决定。
 *
 * 铸造完仍然直接切回「待议」—— 让玩家立刻面对自己刚生成的东西。
 */
export function BountyPanel({ panel, onClose }: BountyPanelProps) {
  const save = useSave();
  const [tab, setTab] = useState<BountyTab>('board');
  // 结算面板要能挺过"任务状态已变成 completed"这一刻 ——
  // 所以按 id 查，而不是把 Quest 对象本身存进 state
  const [turnInId, setTurnInId] = useState<string | null>(null);

  const drafts = draftQuests(save);
  const offered = questsByStatus(save, 'offered');
  const inHand = inHandQuests(save);

  const turnInQuest = turnInId ? save.quests.byId[turnInId] : undefined;

  const subheader = (
    <PanelTabs
      active={tab}
      onChange={(k) => setTab(k as BountyTab)}
      tabs={[
        { key: 'board', label: '悬赏板', badge: offered.length },
        { key: 'active', label: '进行中', badge: inHand.length },
        { key: 'review', label: '待议', badge: drafts.length },
        { key: 'spark', label: '灵感' },
      ]}
    />
  );

  return (
    <>
      <PanelShell panel={panel} onClose={onClose} subheader={subheader}>
        {tab === 'board' ? (
          <BoardTab
            offered={offered}
            draftCount={drafts.length}
            inHandCount={inHand.length}
            onGoToSpark={() => setTab('spark')}
            onGoToReview={() => setTab('review')}
            onGoToActive={() => setTab('active')}
          />
        ) : tab === 'active' ? (
          <ActiveTab onOpenTurnIn={setTurnInId} onGoToBoard={() => setTab('board')} />
        ) : tab === 'review' ? (
          <ReviewTab drafts={drafts} onGoToSpark={() => setTab('spark')} />
        ) : (
          <SparkTab onForged={() => setTab('review')} />
        )}
      </PanelShell>

      {turnInQuest && <TurnInSheet quest={turnInQuest} onClose={() => setTurnInId(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab · 悬赏板（能接的）
// ---------------------------------------------------------------------------

function BoardTab({
  offered,
  draftCount,
  inHandCount,
  onGoToSpark,
  onGoToReview,
  onGoToActive,
}: {
  offered: Quest[];
  draftCount: number;
  inHandCount: number;
  onGoToSpark: () => void;
  onGoToReview: () => void;
  onGoToActive: () => void;
}) {
  if (offered.length === 0) {
    // 三个去处各自有条路：待议 > 进行中 > 写想法，按"离你最近的一步"排
    if (draftCount > 0) {
      return (
        <EmptyNote
          text="板上没有能接的 —— 但待议栏里还有东西等你过目。"
          action={{ label: `去待议（${draftCount}）`, onClick: onGoToReview }}
        />
      );
    }
    if (inHandCount > 0) {
      return (
        <EmptyNote
          text={`板上暂时没有新的 —— 你手上还有 ${inHandCount} 件在推进。做完它们，板子自己会更新。`}
          action={{ label: '去看进行中', onClick: onGoToActive }}
        />
      );
    }
    return (
      <EmptyNote
        text="板上是空的。别人给的题做完了，剩下的就得自己想了。"
        action={{ label: '写下一个想法', onClick: onGoToSpark }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-3.5">
      <Group title="可接" hint="前置没完成的，接了也开不了工">
        {offered.map((q) => (
          <OfferCard key={q.id} quest={q} />
        ))}
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab · 进行中（接下的活儿：待结算 / 执行中 / 待开始）
// ---------------------------------------------------------------------------

function ActiveTab({
  onOpenTurnIn,
  onGoToBoard,
}: {
  onOpenTurnIn: (id: string) => void;
  onGoToBoard: () => void;
}) {
  const save = useSave();
  const mutate = useMutate();

  const turnIn = questsByStatus(save, 'turn_in_pending');
  const active = questsByStatus(save, 'active');
  const claimed = questsByStatus(save, 'claimed');

  if (turnIn.length + active.length + claimed.length === 0) {
    return (
      <EmptyNote
        text="手上没有正在推进的任务。去悬赏板上领一条 —— 或者先写下你想做的事。"
        action={{ label: '去悬赏板', onClick: onGoToBoard }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-3.5">
      {turnIn.length > 0 && (
        <Group title="待结算" tone="gold" hint="做完了，还差最后一步把它记下来">
          {turnIn.map((q) => (
            <QuestCard key={q.id} quest={q} action={{ label: '去结算', onClick: () => onOpenTurnIn(q.id) }} />
          ))}
        </Group>
      )}

      {active.length > 0 && (
        <Group title="执行中">
          {active.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              action={{
                label: '点击完成',
                onClick: () => {
                  mutate((s) => openTurnIn(s, q.id, new Date()));
                  onOpenTurnIn(q.id);
                },
              }}
            />
          ))}
        </Group>
      )}

      {claimed.length > 0 && (
        <Group title="待开始">
          {claimed.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              action={{ label: '开始执行', onClick: () => mutate((s) => startQuest(s, q.id, new Date())) }}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab · 待议（逐条裁决 AI 给的草稿）
// ---------------------------------------------------------------------------

function ReviewTab({ drafts, onGoToSpark }: { drafts: Quest[]; onGoToSpark: () => void }) {
  const save = useSave();
  // 整条链都被打回的那些 —— 它们是「整链重抽」唯一的入口。
  // 判据在 operations 里有一份对应的守卫，两边必须一致（见 chainsAwaitingRegeneration）
  const rebuildable = chainsAwaitingRegeneration(save);

  if (drafts.length === 0 && rebuildable.length === 0) {
    return (
      <EmptyNote
        text="没有待议的东西。AI 给你的草稿在通过之前都停在这里 —— 板子干净，说明该做的判断你都做完了。"
        action={{ label: '写下一个想法', onClick: onGoToSpark }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-3.5">
      {drafts.length > 0 && (
        <Group
          title="待你过目"
          tone="gold"
          hint="AI 生成的东西，你点头之前不算数。这是一次裁决，不是一次确认 —— 不合适的直接打回，或者让它换个做法。"
        >
          {drafts.map((q) => (
            <DraftCard key={q.id} quest={q} />
          ))}
        </Group>
      )}

      {rebuildable.length > 0 && (
        <Group
          title="推倒重来"
          hint="整条链都被你打回了。这是最后一次机会 —— 重抽一次，之后就按新的这版走。"
        >
          {rebuildable.map((c) => (
            <RegenerateCard key={c.chainId} candidate={c} />
          ))}
        </Group>
      )}
    </div>
  );
}

/**
 * 整链重抽。
 *
 * 为什么值得单独一张卡、而不是在被打回的链上挂一颗按钮：
 * 一条链的全部步骤被逐条否掉，是**一次真正的失败** ——
 * 它意味着 AI 对这个想法的理解整体跑偏了。这件事不该静悄悄地发生，
 * 也不该让玩家在一堆红叉里去找那颗按钮。
 *
 * 终身一次，所以卡上把这件事写死：**额度和理由都要摆在按钮前面**。
 * 一颗不知道代价的按钮，点下去是赌博；知道代价的按钮，点下去是决定。
 */
function RegenerateCard({ candidate }: { candidate: RegenerationCandidate }) {
  const mutate = useMutate();
  const { busy, error, run, clearError } = useAgentAction();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const go = () =>
    void run(() => thunks.regenerateChain({ chainId: candidate.chainId }));

  /** 玩家意见是要写进链的 —— 它决定了重抽往哪个方向偏 */
  const saveNote = () => {
    mutate((s) => {
      const chain = s.quests.chains[candidate.chainId];
      if (!chain) return s;
      return {
        ...s,
        quests: {
          ...s.quests,
          chains: {
            ...s.quests.chains,
            [candidate.chainId]: {
              ...chain,
              review: { ...chain.review, playerNote: note.trim().slice(0, 160) || null },
            },
          },
        },
      };
    });
  };

  return (
    <article className="glass-hover rounded-xl border border-abyss-500/30 bg-abyss-500/[0.07] p-3.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-wide text-white/90">
          {candidate.title}
        </span>
        <span className="numeric shrink-0 text-[10px] text-white/35">
          {candidate.rejectedCount} 步全否
        </span>
      </div>

      <p className="prose-cinematic mt-1.5 text-[11px] leading-relaxed text-white/45">
        重抽不会删掉旧的那些 —— 它们会退到档案里。但**这条链终身只重抽一次**，
        所以最好先说一句你觉得哪里不对。
      </p>

      <input
        type="text"
        value={note}
        maxLength={160}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        placeholder={candidate.playerNote ?? '换一批什么样的做法？（选填）'}
        className="mt-2.5 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:border-abyss-400/45 focus:outline-none focus:ring-1 focus:ring-abyss-400/30"
      />

      <div className="mt-2.5 flex items-center gap-2">
        <span className="numeric text-[10px] text-white/30">剩余 {candidate.remaining} / 1 次</span>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="glass-pill glass-hover ml-auto px-2.5 py-1.5 text-[11px] text-white/55"
            >
              再想想
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                saveNote();
                go();
              }}
              className="rounded-lg border border-amber-400/50 bg-amber-400/[0.15] px-3 py-1.5 text-[11.5px] text-amber-100 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? '正在重抽…' : '就是现在'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto rounded-lg border border-white/25 bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/45 hover:text-white"
          >
            整链重抽
          </button>
        )}
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}
    </article>
  );
}

function EmptyNote({
  text,
  action,
}: {
  text: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4">
      <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">{text}</p>
      <button
        type="button"
        onClick={action.onClick}
        className="mt-3 rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-3 py-1.5 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.03] hover:bg-amber-400/[0.22]"
      >
        {action.label}
      </button>
    </div>
  );
}

function Group({ title, tone, hint, children }: { title: string; tone?: 'gold'; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        {tone === 'gold' && <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />}
        <h3 className="text-[10.5px] tracking-[0.18em] text-white/45">{title}</h3>
      </div>
      {hint && <p className="mb-2 text-[10.5px] leading-relaxed text-white/30">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 卡片
// ---------------------------------------------------------------------------

const EFFORT_UNIT = { min: '分钟', hour: '小时', day: '天' } as const;

/** 职业小标签。取法与金库的职业卡共用同一个出口（classes.ts 的 classLabelOf） */
const classLabel = (classId: Quest['classId']): string | null =>
  classId ? classLabelOf(classId) : null;

/**
 * 卡片公共骨架。四种卡片共用它，避免"草稿卡片少一个星级"这种细节漂移。
 * `footer` 是各自的按钮区，`children` 是状态专属的中段。
 */
function CardShell({
  quest,
  children,
  footer,
  highlight,
}: {
  quest: Quest;
  children?: ReactNode;
  footer: ReactNode;
  highlight?: boolean;
}) {
  const label = classLabel(quest.classId);
  return (
    <article
      className={cn(
        'glass-hover rounded-xl border p-3.5',
        highlight ? 'border-amber-400/30 bg-amber-400/[0.06]' : 'border-white/10 bg-white/[0.04]',
      )}
    >
      <div className="flex items-center gap-2">
        {label && (
          <span className="rounded-md border border-abyss-500/30 bg-abyss-500/15 px-1.5 py-0.5 text-[10px] leading-[1.4] text-abyss-300">
            {label}
          </span>
        )}
        <span className="numeric text-[11px] leading-none tracking-wider text-amber-400/85">
          {'★'.repeat(quest.difficulty)}
          <span className="text-white/20">{'★'.repeat(5 - quest.difficulty)}</span>
        </span>
        {quest.chain && (
          <span className="ml-auto shrink-0 text-[10px] text-white/35">
            {quest.chain.chainTitle} · {quest.chain.index + 1}/{quest.chain.total}
          </span>
        )}
      </div>

      <h4 className="prose-cinematic mt-2 text-[14px] font-medium tracking-wide text-white">{quest.title}</h4>
      <p className="mt-1 text-[11.5px] leading-relaxed text-white/50">{quest.subtitle}</p>

      {children}

      <div className="mt-3 flex items-center gap-3 border-t border-white/[0.08] pt-2.5">
        <span className="numeric text-[12px] text-white/75">{quest.reward.exp} EXP</span>
        {quest.reward.vaultUsdCents !== undefined && (
          <span className="numeric-gold text-[12px]">{formatUsd(quest.reward.vaultUsdCents)}</span>
        )}
        <span className="text-[10.5px] text-white/35">
          约 {quest.effortEstimate.value} {EFFORT_UNIT[quest.effortEstimate.unit]}
        </span>
        <div className="ml-auto shrink-0">{footer}</div>
      </div>
    </article>
  );
}

/**
 * 一条待裁决的草稿。
 *
 * 三个出口，不是两个：
 *   通过   —— 这件事就这么做
 *   打回   —— 这件事不该出现在我的清单上（剔除出链，痕迹留作偏好信号）
 *   换个做法 —— **这件事是对的，但这一步的做法不对**
 *
 * 第三个是 Phase 3 补上的。缺了它，玩家只有"接受"和"全盘否掉"两种表达，
 * 而真实的想法往往卡在中间：路线没错，只是这一步走不通。
 * 逼着人在这种时候二选一，结果就是要么收下一条做不下去的任务，
 * 要么丢掉一个本来正确的方向。
 *
 * ⚠️ 只对**链上的**草稿出现。单任务没有"下一步"，重写成什么样都无从谈起 ——
 *     所以单任务卡片上不会长这颗按钮（`rerouteQuestDraft` 自己也会拦下）。
 */
function DraftCard({ quest }: { quest: Quest }) {
  const save = useSave();
  const mutate = useMutate();
  const { busy, error, run, clearError } = useAgentAction();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');

  const resolve = (decision: 'approve' | 'reject') =>
    mutate((s) => reviewQuestDraft(s, quest.id, decision, new Date()));

  const membership = quest.chain;
  const chain = membership ? save.quests.chains[membership.chainId] : undefined;
  const used = chain?.review.rerouteCount ?? 0;
  const remaining = REROUTE_CHAIN_LIMIT - used;
  const reroutable = Boolean(membership) && remaining > 0;

  const reroute = () => {
    void run(async () => {
      // 空诉求不再在这里替换成 DEFAULT_REROUTE_REQUEST ——
      // 那件事现在只有一个执行点（`rerouteQuestDraft` 与 thunk 共用同一条归一化），
      // 在这里也替一次会让两处对"玩家到底说了什么"产生两个答案。
      const result = await thunks.reroute({ questId: quest.id, request });
      if (result.ok) {
        setRequest('');
        setOpen(false);
      }
      return result;
    });
  };

  return (
    <CardShell
      quest={quest}
      highlight
      footer={
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => resolve('reject')}
            className="glass-pill glass-hover px-2.5 py-1.5 text-[11.5px] text-white/60"
          >
            打回
          </button>
          {/* 额度用尽时它不消失，只是变成一行字 —— 按钮消失会让人以为这个功能不存在 */}
          {reroutable ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cn(
                'glass-pill glass-hover px-2.5 py-1.5 text-[11.5px]',
                open ? 'text-abyss-300' : 'text-white/65',
              )}
            >
              换个做法
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => resolve('approve')}
            className="rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-2.5 py-1.5 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.04] hover:bg-amber-400/[0.22]"
          >
            通过
          </button>
        </div>
      }
    >
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">{quest.objective}</p>

      {quest.origin.reviewerNote && (
        <div className="mt-2.5 border-l-2 border-abyss-500/60 pl-2.5">
          <div className="text-[10px] tracking-wider text-abyss-300/80">参谋意见</div>
          <p className="prose-cinematic mt-0.5 text-[11.5px] leading-relaxed text-white/65">
            {quest.origin.reviewerNote}
          </p>
        </div>
      )}

      {/* 上一版是怎么被换掉的 —— 留在卡片上，玩家才知道这两步的差别在哪 */}
      {quest.origin.rerouteHistory.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-white/[0.07] bg-ink-950/40 px-2.5 py-2">
          <div className="text-[10px] tracking-wider text-white/30">
            换过 {quest.origin.rerouteHistory.length} 次做法
          </div>
          <p className="prose-cinematic mt-1 text-[11px] leading-relaxed text-white/45">
            原本是「{quest.origin.rerouteHistory[quest.origin.rerouteHistory.length - 1]!.before.title}」，难度{' '}
            {quest.origin.rerouteHistory[quest.origin.rerouteHistory.length - 1]!.before.difficulty} ★
          </p>
        </div>
      )}

      {/* 微型输入框：一行的位置，问一个问题 */}
      {open && reroutable && (
        <div className="mt-3 animate-fade-up rounded-xl border border-abyss-500/30 bg-abyss-500/[0.07] p-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] tracking-wider text-abyss-300/85">换个做法</span>
            <span className="numeric ml-auto text-[10px] text-white/30">
              {request.length} / {REROUTE_REQUEST_MAX_LEN}　本条链还剩 {remaining} 次
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-white/40">
            目的地不变，只换这一步怎么走。留空的话，它会假定"这一步排得太满了"。
          </p>
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={request}
              maxLength={REROUTE_REQUEST_MAX_LEN}
              autoFocus
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') reroute();
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="例：先只做最小的一版，别一次铺开"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-ink-950/55 px-2.5 py-1.5 text-[11.5px] text-white placeholder:text-white/25 focus:border-abyss-400/50 focus:outline-none focus:ring-1 focus:ring-abyss-400/30"
            />
            <button
              type="button"
              disabled={busy}
              onClick={reroute}
              className="shrink-0 rounded-lg border border-abyss-400/50 bg-abyss-500/20 px-3 py-1.5 text-[11.5px] text-abyss-300 transition-all duration-300 ease-cinematic hover:bg-abyss-500/[0.32] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? '…' : '换'}
            </button>
          </div>
          {error && <InlineError message={error} onDismiss={clearError} />}
        </div>
      )}
    </CardShell>
  );
}

function OfferCard({ quest }: { quest: Quest }) {
  const save = useSave();
  const mutate = useMutate();

  // 未完成的前置 —— 界面用它解释"为什么按钮是灰的"
  const blockers = quest.prerequisiteQuestIds
    .map((id) => save.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && q.status !== 'completed');
  const locked = blockers.length > 0;

  return (
    <CardShell
      quest={quest}
      footer={
        <button
          type="button"
          disabled={locked}
          onClick={() => mutate((s) => claimQuest(s, quest.id, new Date()))}
          className={cn(
            'rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-all duration-300 ease-cinematic',
            locked
              ? 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30'
              : 'border-amber-400/45 bg-amber-400/[0.12] text-amber-200 hover:scale-[1.04] hover:bg-amber-400/[0.22]',
          )}
        >
          领取
        </button>
      }
    >
      {locked && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] tracking-wider text-white/30">前置</span>
          {blockers.map((b) => (
            <span
              key={b.id}
              className="rounded-md border border-white/10 bg-ink-950/40 px-1.5 py-0.5 text-[10px] text-white/45"
            >
              {b.title}
              <span className="ml-1 text-white/25">
                {b.status === 'active' ? '进行中' : b.status === 'turn_in_pending' ? '待结算' : '未完成'}
              </span>
            </span>
          ))}
        </div>
      )}
    </CardShell>
  );
}

/**
 * 「进行中」三种状态共用的卡片。右侧按钮由状态决定：
 * 待结算 → 去结算；执行中 → 点击完成（先进 turn_in_pending，再开结算面板）；
 * 待开始 → 开始执行。
 */
function QuestCard({
  quest,
  action,
}: {
  quest: Quest;
  action: { label: string; onClick: () => void };
}) {
  return (
    <CardShell
      quest={quest}
      footer={
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-2.5 py-1.5 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.04] hover:bg-amber-400/[0.22] hover:shadow-glow-gold active:scale-[0.98]"
        >
          {action.label}
        </button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Tab · 灵感（Spark Box）
// ---------------------------------------------------------------------------

function SparkTab({ onForged }: { onForged: () => void }) {
  const [idea, setIdea] = useState('');
  const [deep, setDeep] = useState(false);
  const { busy, error, run, clearError } = useAgentAction();

  // 只是**预测**，不是承诺：真正决定归属的是调度员（见 thunks.forgeChain）。
  // 所以下面那行文案说的是"多半"，并且允许它猜错 —— 一句会被现实推翻的
  // 断言播出去两次，玩家就再也不看这行字了。
  const route = useMemo(() => (idea.trim() ? previewRoute(idea) : null), [idea]);
  const ready = idea.trim().length > 0 && !busy;

  const forge = () => {
    if (!ready) return;
    void run(async () => {
      const result = await thunks.forgeChain({
        idea: idea.trim(),
        deepDeliberation: deep,
        classId: null,
      });
      // 只有真的拿到链才清空输入框：失败时那段话必须还在，
      // 否则玩家得凭记忆把它再写一遍（那正是他想省掉的力气）。
      if (result.ok) {
        setIdea('');
        onForged();
      }
      return result;
    });
  };

  return (
    <div className="pt-3.5">
      <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">
        写一件你最近反复想起、但一直没动手的事。它会被拆成几步，摆在板上等你过目。
      </p>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={3}
        maxLength={200}
        placeholder="输入你想推进的领域或想法..."
        aria-label="灵感"
        className="mt-3 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/45 px-3.5 py-3 text-[12.5px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      {/* 实时路由提示：让"它到底会往哪个方向出题"变成可见的，而不是生成完才知道 */}
      <div className="mt-2 min-h-[1.1rem] text-[11px]">
        {route ? (
          <span className="text-white/40">
            多半会交给 <span className="text-abyss-300/90">{route.displayName}</span>{' '}
            这条线的 Agent（最终由调度员判定）
          </span>
        ) : (
          <span className="text-white/25">还没写任何东西。</span>
        )}
      </div>

      <button
        type="button"
        aria-pressed={deep}
        onClick={() => setDeep((v) => !v)}
        className="mt-3 flex w-full items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors duration-300 hover:border-white/20"
      >
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-300 ease-cinematic',
            deep ? 'border-abyss-400/70 bg-abyss-500/30 text-abyss-300' : 'border-white/25 text-transparent',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] text-white/85">深度推演</span>
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-white/40">
            多跑一遍审核：另一路 Agent 会检查难度是否递增、每一步的产出是不是下一步的原料，
            并把意见附在卡片上。慢一些，也贵一些。
          </span>
        </span>
      </button>

      <button
        type="button"
        disabled={!ready}
        onClick={forge}
        className={cn(
          'mt-4 w-full rounded-lg border py-2.5 text-[12.5px] transition-all duration-300 ease-cinematic',
          ready
            ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]'
            : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
        )}
      >
        {busy ? '正在推演…' : '生成任务链'}
      </button>

      {error && <InlineError message={error} onDismiss={clearError} />}

      <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
        生成的是草稿，还不算数 —— 你要逐条看过，通过了它才会出现在悬赏板上。
      </p>
    </div>
  );
}
