import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PanelShell } from '@/components/panels/PanelShell';
import { TurnInSheet } from '@/components/panels/TurnInSheet';
import { PanelTabs } from '@/components/ui/PanelTabs';
import { classLabelOf } from '@/data/catalog/classes';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';
import { previewRoute } from '@/lib/mockForge';
import { composeCommissionBrief } from '@/lib/questBriefs';
import type { PanelKey } from '@/lib/panels';
import {
  QUEST_REWARD_TIERS,
  REROUTE_CHAIN_LIMIT,
  REROUTE_REQUEST_MAX_LEN,
} from '@/data/catalog/policy';
import type { QuestRewardTierKey } from '@/data/catalog/policy';
import { chainsAwaitingReview, claimableQuests, inHandQuests, questsByStatus } from '@/lib/selectors';
import { useAgentAction } from '@/hooks/useAgentAction';
import { InlineError } from '@/components/ui/InlineError';
import { thunks } from '@/store/agentRuntime';
import {
  chainsAwaitingRegeneration,
  claimQuest,
  confirmQuestChain,
  createManualQuest,
  openTurnIn,
  rejectQuestChain,
  startQuest,
  successorOf,
  type RegenerationCandidate,
} from '@/store/operations';
import { useMutate, useSave } from '@/store/useEarthOnlineStore';
import type { ClassIdLiteral, Quest, QuestChain } from '@/types';

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
 *   「悬赏板」  offered 且前置完成               —— 要不要接（现在就能接的）
 *   「进行中」  claimed / active / turn_in_pending —— 做没做完（自日常面板彻底迁入）
 *   「待议」    链上有草稿                      —— 整条线一次裁决（轮 C）
 *   「灵感」    spark                           —— 把一句想法铸成任务链
 *
 * ---------------------------------------------------------------------------
 * 轮 C：线级裁决 + 渐进揭开（这一屏的两条新规矩）
 * ---------------------------------------------------------------------------
 *   ① 审核是**线级**的。玩家在「待议」看到的是整条线的样子 —— 主题、理由、
 *      每一步的标题 —— 然后一次「确认这条线」或「打回重来」。
 *      落成数据后只有第一步会出现在悬赏板上；每完成一步，下一步才被揭开
 *      （未解锁的步骤在板上**根本不出现**，不是灰卡）。
 *   ② 于是悬赏板上的每一条都满足同一句话：**它现在就能接**。
 *      板上数出来的数与"此刻能做的动作"一一对应 —— 那是这四联中枢
 *      所有角标的共同口径（见 selectors.navBadges）。
 *   修理单步（换个做法）发生在步骤被揭开之后：那时它在板上，是一张
 *   完整的 OfferCard —— 所以卡片上带着「换个做法」。
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
 * 而「确认 / 打回」是**在修改世界的清单** —— 判错了，你要么背上一件不该做的事，
 * 要么少一个台阶。两种动作的心理成本完全不同，混在一屏里的后果是玩家会开始
 * 批量点「确认」。分开之后，"裁决"重新变得是个决定。
 *
 * 铸造完仍然直接切回「待议」—— 让玩家立刻面对自己刚生成的东西。
 *
 * ---------------------------------------------------------------------------
 * 板子上的两条"来源"
 * ---------------------------------------------------------------------------
 * 板空着的时候，玩家不该只剩「自己编一个想法」这一条路。所以悬赏板常驻
 * 两个来源：「让调度员出题」——系统按你此刻的处境（最近的终极目标 +
 * 聚焦篇章）出一串，产出照旧落「待议」；以及一支手写笔 —— 写下的直接进
 * 「进行中」（审核闸门防的是"系统替玩家做决定"，防不住也不该防
 * "玩家自己做的决定"，见 createManualQuest）。
 */
export function BountyPanel({ panel, onClose }: BountyPanelProps) {
  const save = useSave();
  const [tab, setTab] = useState<BountyTab>('board');
  // 结算面板要能挺过"任务状态已变成 completed"这一刻 ——
  // 所以按 id 查，而不是把 Quest 对象本身存进 state
  const [turnInId, setTurnInId] = useState<string | null>(null);

  // 板上只放"现在就能接的"。这是 claimableQuests 的全部含义（offered + 前置完成）
  const board = claimableQuests(save);
  // 「待议」数的是**线**，不是草稿 —— 一个数字背后是一次线级裁决（见 navBadges）
  const pendingLines = chainsAwaitingReview(save);
  const inHand = inHandQuests(save);

  const turnInQuest = turnInId ? save.quests.byId[turnInId] : undefined;

  const subheader = (
    <PanelTabs
      active={tab}
      onChange={(k) => setTab(k as BountyTab)}
      tabs={[
        { key: 'board', label: '悬赏板', badge: board.length },
        { key: 'active', label: '进行中', badge: inHand.length },
        { key: 'review', label: '待议', badge: pendingLines.length },
        { key: 'spark', label: '灵感' },
      ]}
    />
  );

  return (
    <>
      <PanelShell panel={panel} onClose={onClose} subheader={subheader}>
        {tab === 'board' ? (
          <BoardTab
            claimable={board}
            pendingLineCount={pendingLines.length}
            inHandCount={inHand.length}
            onGoToSpark={() => setTab('spark')}
            onGoToReview={() => setTab('review')}
            onGoToActive={() => setTab('active')}
          />
        ) : tab === 'active' ? (
          <ActiveTab onOpenTurnIn={setTurnInId} onGoToBoard={() => setTab('board')} />
        ) : tab === 'review' ? (
          <ReviewTab chains={pendingLines} onGoToSpark={() => setTab('spark')} />
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
  claimable,
  pendingLineCount,
  inHandCount,
  onGoToSpark,
  onGoToReview,
  onGoToActive,
}: {
  /** 现在就能接的（offered 且前置全完成）—— 见 selectors.claimableQuests */
  claimable: Quest[];
  /** 还有几条线等着裁决（数字用在线级入口上，不是草稿条数） */
  pendingLineCount: number;
  inHandCount: number;
  onGoToSpark: () => void;
  onGoToReview: () => void;
  onGoToActive: () => void;
}) {
  const save = useSave();
  const [writing, setWriting] = useState(false);
  const [justWrote, setJustWrote] = useState(false);
  const { busy, error, run, clearError } = useAgentAction();

  // 素材取不到（五个目标全达成了）时按钮就该是灰的 —— 不拿一句假的处境去出题
  const canCommission = composeCommissionBrief(save) !== null;

  const commission = () => {
    const brief = composeCommissionBrief(save);
    if (brief === null || busy) return;
    setJustWrote(false);
    void run(async () => {
      const result = await thunks.forgeChain({
        idea: brief,
        classId: null,
        deepDeliberation: false,
        from: 'commission',
      });
      // 与灵感框同款：只有真的拿到链才切过去 —— 失败时留在原地看那行字
      if (result.ok) onGoToReview();
      return result;
    });
  };

  return (
    <div className="space-y-3 pt-3.5">
      {/* 板子的两个常驻来源：系统按处境出题 / 自己写一条 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!canCommission || busy}
          onClick={commission}
          className={cn(
            'rounded-lg border px-3 py-2 text-[11.5px] transition-all duration-300 ease-cinematic',
            canCommission && !busy
              ? 'border-abyss-400/45 bg-abyss-500/[0.12] text-abyss-300 hover:scale-[1.03] hover:bg-abyss-500/[0.22]'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          {busy ? '调度员正在看你的近况…' : '让调度员出题'}
        </button>
        <button
          type="button"
          aria-expanded={writing}
          onClick={() => {
            setWriting((v) => !v);
            setJustWrote(false);
          }}
          className={cn(
            'glass-pill glass-hover px-3 py-2 text-[11.5px]',
            writing ? 'text-amber-200' : 'text-white/70',
          )}
        >
          ＋ 自己写一条
        </button>
      </div>
      <p className="text-[10.5px] leading-relaxed text-white/30">
        调度员出的题落在「待议」等你裁决；自己写的那条直接进「进行中」。
      </p>

      {error && <InlineError message={error} onDismiss={clearError} />}

      {writing && (
        <ManualQuestForm
          onDone={(wrote) => {
            setWriting(false);
            if (wrote) setJustWrote(true);
          }}
        />
      )}

      {justWrote && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-white/60">
            写好了 —— 它已经在「进行中」里，从现在起算数。
          </p>
          <button
            type="button"
            onClick={onGoToActive}
            className="glass-pill glass-hover shrink-0 px-2.5 py-1.5 text-[11px] text-white/70"
          >
            去看进行中
          </button>
        </div>
      )}

      {claimable.length === 0 ? (
        // 三个去处各自有条路：待议 > 进行中 > 写想法，按"离你最近的一步"排
        pendingLineCount > 0 ? (
          <EmptyNote
            text="板上没有能接的 —— 但待议栏里还有线等你裁决。"
            action={{ label: `去待议（${pendingLineCount}）`, onClick: onGoToReview }}
          />
        ) : inHandCount > 0 ? (
          <EmptyNote
            // 轮 C 之后这句话是字面为真的：下一步要等你完成手上这步才揭开
            text={`板上暂时没有新的 —— 你手上还有 ${inHandCount} 件在推进。每完成一步，下一步才会在板上揭开。`}
            action={{ label: '去看进行中', onClick: onGoToActive }}
          />
        ) : (
          <EmptyNote
            text="板上是空的。上面两条路都能让板子重新长出东西来 —— 或者，写下一个想法让它拆成一条链。"
            action={{ label: '写下一个想法', onClick: onGoToSpark }}
          />
        )
      ) : (
        <Group title="可接" hint="板上每一条都是现在就能接的 —— 每完成一步，下一步才揭开">
          {claimable.map((q) => (
            <OfferCard key={q.id} quest={q} />
          ))}
        </Group>
      )}
    </div>
  );
}

/**
 * 自己写一条任务。
 *
 * 三档是**预置刻度**而不是自由输入：让"这件事有多重"先成为一个要想清楚的
 * 选择（轻 / 中 / 重，各自的定位写在提示里），而不是一个可以随手写大的数字。
 *
 * 写完**直接进「进行中」** —— 它不经过「待议」，因为审核闸门防的是
 * "系统替玩家做决定"，而这一条是玩家自己做的决定（见 operations.createManualQuest）。
 */
function ManualQuestForm({ onDone }: { onDone: (wrote: boolean) => void }) {
  const save = useSave();
  const mutate = useMutate();
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState<ClassIdLiteral | null>(null);
  const [tier, setTier] = useState<QuestRewardTierKey>('medium');

  const ready = title.trim().length > 0;
  const selectedTier = QUEST_REWARD_TIERS.find((t) => t.key === tier) ?? QUEST_REWARD_TIERS[1];

  const submit = () => {
    if (!ready) return;
    mutate((s) =>
      createManualQuest(
        s,
        { title: title.trim(), classId, rewardExp: selectedTier.exp, difficulty: selectedTier.difficulty },
        new Date(),
      ),
    );
    onDone(true);
  };

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={40}
        placeholder="想做的事，直接写下来…"
        aria-label="自己写一条任务"
        className="w-full rounded-lg border border-white/[0.12] bg-ink-950/45 px-3 py-2.5 text-[12.5px] text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      {/* 归属职业线。通用永远排第一 —— "不给它挂任何线"必须是默认选项 */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip active={classId === null} onClick={() => setClassId(null)}>
          通用
        </Chip>
        {save.careers.tracks.map((t) => (
          <Chip key={t.classId} active={classId === t.classId} onClick={() => setClassId(t.classId)}>
            {classLabelOf(t.classId)}
          </Chip>
        ))}
      </div>

      {/* 三档重量。难度随档位定格 —— 卡片上的星级与工时都由它说了算 */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {QUEST_REWARD_TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tier === t.key}
            onClick={() => setTier(t.key)}
            className={cn(
              'rounded-lg border px-2 py-2 text-center transition-all duration-300 ease-cinematic',
              tier === t.key
                ? 'border-amber-400/50 bg-amber-400/[0.12]'
                : 'border-white/[0.12] bg-white/[0.03] hover:border-white/25',
            )}
          >
            <div className={cn('text-[12px]', tier === t.key ? 'text-amber-200' : 'text-white/70')}>
              {t.label} <span className="text-[10px] text-amber-400/70">{'★'.repeat(t.difficulty)}</span>
            </div>
            <div className="numeric mt-0.5 text-[10.5px] text-white/40">{t.exp} EXP</div>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">{selectedTier.hint}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDone(false)}
          className="glass-pill glass-hover flex-1 py-2 text-[12px] text-white/60"
        >
          算了
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className={cn(
            'flex-[1.4] rounded-lg border py-2 text-[12px] transition-all duration-300 ease-cinematic',
            ready
              ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 hover:scale-[1.02] hover:bg-amber-400/25'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          写下来
        </button>
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
        写下来就直接进「进行中」—— 它不需要谁批准，因为它出自你自己的手。
      </p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] transition-all duration-300 ease-cinematic',
        active
          ? 'border-abyss-400/60 bg-abyss-500/20 text-abyss-300'
          : 'border-white/[0.12] bg-white/[0.03] text-white/50 hover:border-white/25',
      )}
    >
      {children}
    </button>
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
// Tab · 待议（线级裁决：整条线一次确认或打回）
// ---------------------------------------------------------------------------

function ReviewTab({ chains, onGoToSpark }: { chains: QuestChain[]; onGoToSpark: () => void }) {
  const save = useSave();
  // 整条链都被打回的那些 —— 它们是「整链重抽」唯一的入口。
  // 判据在 operations 里有一份对应的守卫，两边必须一致（见 chainsAwaitingRegeneration）
  const rebuildable = chainsAwaitingRegeneration(save);

  if (chains.length === 0 && rebuildable.length === 0) {
    return (
      <EmptyNote
        text="没有待议的东西。AI 给的线在确认之前都停在这里 —— 板子干净，说明该做的判断你都做完了。"
        action={{ label: '写下一个想法', onClick: onGoToSpark }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-3.5">
      {chains.length > 0 && (
        <Group
          title="待你过目"
          tone="gold"
          hint="AI 生成的东西，你点头之前不算数。看到的是一条完整的线：主题、理由、每一步的标题 —— 看完一次裁决。"
        >
          {chains.map((chain) => (
            <LineReviewCard key={chain.id} chain={chain} />
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
 * 卡片公共骨架。三种卡片共用它，避免"某张卡片少一个星级"这种细节漂移。
 * `footer` 是各自的按钮区，`children` 是状态专属的中段。
 */
function CardShell({
  quest,
  children,
  footer,
}: {
  quest: Quest;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const label = classLabel(quest.classId);
  return (
    <article className="glass-hover rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
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

/** 链上每一步在审核卡上的状态词。没写的就是「待裁决」—— 不额外加一行噪音 */
const STEP_STATUS_LABEL: Partial<Record<Quest['status'], string>> = {
  offered: '已通过',
  claimed: '已领取',
  active: '进行中',
  turn_in_pending: '待结算',
  completed: '已完成',
};

/**
 * 一条待裁决的线（轮 C 的线级审核卡）。
 *
 * 两个出口，不是三个：
 *   确认这条线 —— 整条线就这么走。确认后只有第一步落在悬赏板上
 *   打回重来   —— 整条线都不对。全否之后它会出现在「推倒重来」里，
 *                 还留着终身一次的整链重抽
 *
 * 为什么把逐条裁决收成一次：
 *   玩家在确认时看到的是整条线的形状 —— 主题、理由、每一步的标题。
 *   逐条点「通过」把一次判断拆成了 N 次点击，而每一次点击都不比看清整条线
 *   更有信息量。真正的裁决对象本来就是**这条线值不值得走**。
 *
 * 为什么单步的「换个做法」不在这里：
 *   线还没被确认时，"这一步做不做得了"是个假设 —— 玩家要等它被揭开、
 *   真正轮到它，才知道哪里卡住。所以「换个做法」长在悬赏板的卡片上
 *   （那时它已经摆在面前），不在这张预览卡上。
 */
function LineReviewCard({ chain }: { chain: QuestChain }) {
  const save = useSave();
  const mutate = useMutate();
  const [confirming, setConfirming] = useState(false);

  // 链上还站着的步骤。被打回 / 被换掉的已经从线上退场（痕迹留在状态里），
  // 不再出现在这张卡上 —— 卡上列出的，是确认之后真正会走的那条路
  const steps = chain.questIds
    .map((id) => save.quests.byId[id])
    .filter((q): q is Quest => Boolean(q) && q.status !== 'rejected' && q.status !== 'rerouted');

  // 参谋意见逐条冗余在任务上，整条线取第一条非空的就是那份"审核官的话"
  const note = steps.find((q) => q.origin.reviewerNote)?.origin.reviewerNote ?? null;
  const label = classLabelOf(chain.classId);

  const confirm = () => mutate((s) => confirmQuestChain(s, chain.id, new Date()));
  const reject = () => mutate((s) => rejectQuestChain(s, chain.id, new Date()));

  return (
    <article className="glass-hover rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3.5">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-abyss-500/30 bg-abyss-500/15 px-1.5 py-0.5 text-[10px] leading-[1.4] text-abyss-300">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-wide text-white/90">
          {chain.title}
        </span>
        <span className="numeric shrink-0 text-[10px] text-white/35">{steps.length} 步</span>
      </div>

      <p className="prose-cinematic mt-1.5 text-[11px] leading-relaxed text-white/50">
        {chain.rationale}
      </p>

      {/* 长链（几十步）要在这张卡里滚得动 —— 不然一张 60 步的预览卡会把整页拉长 */}
      <ol className="mt-3 max-h-[40vh] space-y-1.5 overflow-y-auto pr-0.5">
        {steps.map((q) => (
          <li
            key={q.id}
            className="flex items-baseline gap-2 rounded-lg border border-white/[0.07] bg-ink-950/35 px-2.5 py-2"
          >
            <span className="numeric shrink-0 text-[10.5px] text-white/30">
              {q.chain ? q.chain.index + 1 : '·'}
            </span>
            <span className="min-w-0 flex-1 break-words text-[12px] leading-relaxed text-white/80">
              {q.title}
            </span>
            <span className="numeric shrink-0 text-[10.5px] leading-none tracking-wider text-amber-400/70">
              {'★'.repeat(q.difficulty)}
            </span>
            {/* 已经走过的步骤（半途生成的线、或者之前已确认过的成员）带上自己的状态 */}
            {STEP_STATUS_LABEL[q.status] && (
              <span className="shrink-0 text-[10px] text-white/35">{STEP_STATUS_LABEL[q.status]}</span>
            )}
          </li>
        ))}
      </ol>

      {note && (
        <div className="mt-3 border-l-2 border-abyss-500/60 pl-2.5">
          <div className="text-[10px] tracking-wider text-abyss-300/80">参谋意见</div>
          <p className="prose-cinematic mt-0.5 text-[11.5px] leading-relaxed text-white/65">{note}</p>
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-white/35">
        确认之后，只有第一步会出现在悬赏板上；每完成一步，下一步才揭开。
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="glass-pill glass-hover px-2.5 py-1.5 text-[11px] text-white/55"
            >
              再想想
            </button>
            <button
              type="button"
              onClick={reject}
              className="ml-auto rounded-lg border border-white/25 bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/45 hover:text-white"
            >
              全都打回
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="glass-pill glass-hover px-2.5 py-1.5 text-[11.5px] text-white/60"
            >
              打回重来
            </button>
            <button
              type="button"
              onClick={confirm}
              className="ml-auto rounded-lg border border-amber-400/50 bg-amber-400/[0.15] px-3 py-1.5 text-[11.5px] text-amber-100 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.03] hover:bg-amber-400/[0.25]"
            >
              确认这条线
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * 悬赏板上的一条：现在就能接。
 *
 * 轮 C 起它同时是"被揭开的那一步"的完整模样 —— 所以卡上带着两样东西：
 *   ① 这一步到底要做什么（objective）。确认那条线时只看到了标题，
 *      真正决定接不接的时刻是现在，不是那时。
 *   ② 「换个做法」。线确认过之后，单步的修理发生在这里（额度仍是
 *      链级 2 次）。草稿态的换法没有入口 —— 那时这一步还没轮到，
 *      "做不做得了"只是个假设（见 LineReviewCard 的说明）。
 *
 * 不再有"前置没完成"的灰卡：前置没完成的步骤在板上**不会出现**。
 */
function OfferCard({ quest }: { quest: Quest }) {
  const save = useSave();
  const mutate = useMutate();
  const { busy, error, run, clearError } = useAgentAction();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState('');

  const membership = quest.chain;
  const chain = membership ? save.quests.chains[membership.chainId] : undefined;
  const used = chain?.review.rerouteCount ?? 0;
  const remaining = REROUTE_CHAIN_LIMIT - used;
  const reroutable = Boolean(membership) && remaining > 0;

  // 下一步（末一步时为 null）—— 只用来把"揭开"这件事说清楚
  const successor = membership ? successorOf(save, membership.chainId, membership.index) : null;

  const reroute = () => {
    void run(async () => {
      // 空诉求在 `rerouteQuestDraft` 与 thunk 的同一条归一化里收口，这里不替一次
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
      footer={
        <div className="flex gap-1.5">
          {/* 额度用尽时它不消失，只是变成一行字 —— 按钮消失会让人以为这个功能不存在 */}
          {reroutable && (
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
          )}
          <button
            type="button"
            onClick={() => mutate((s) => claimQuest(s, quest.id, new Date()))}
            className="rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-2.5 py-1.5 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.04] hover:bg-amber-400/[0.22]"
          >
            领取
          </button>
        </div>
      }
    >
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">{quest.objective}</p>

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

      {membership && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-white/30">
          {successor
            ? `完成后，下一步「${successor.title}」才会在板上揭开。`
            : '这是这条线的最后一步 —— 做完它，这条线就走完了。'}
        </p>
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
        生成的是草稿，还不算数 —— 你会先看到整条线的样子，确认之后，
        只有第一步会出现在悬赏板上；每完成一步，下一步才揭开。
      </p>
    </div>
  );
}
