import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChainFinale, finaleMembers } from '@/components/panels/ChainFinale';
import { PanelShell } from '@/components/panels/PanelShell';
import { TurnInSheet } from '@/components/panels/TurnInSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PanelTabs } from '@/components/ui/PanelTabs';
import { classLabelOf } from '@/data/catalog/classes';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';
import { previewRoute } from '@/lib/mockForge';
import { composeCommissionBrief, composeReturnBrief } from '@/lib/questBriefs';
import type { PanelKey } from '@/lib/panels';
import {
  QUEST_REWARD_TIERS,
  REROUTE_CHAIN_LIMIT,
  REROUTE_REQUEST_MAX_LEN,
} from '@/data/catalog/policy';
import type { QuestRewardTierKey } from '@/data/catalog/policy';
import {
  activeTrack,
  chainsAwaitingReview,
  claimableQuests,
  inHandQuests,
  isStalled,
  questsByStatus,
} from '@/lib/selectors';
import { useAgentAction } from '@/hooks/useAgentAction';
import { useNow } from '@/hooks/useNow';
import { InlineError } from '@/components/ui/InlineError';
import { thunks } from '@/store/agentRuntime';
import {
  REROUTABLE_STATUSES,
  cancelDiagnosis,
  canCloseQuestChain,
  chainsAwaitingRegeneration,
  claimQuest,
  closeQuestChain,
  confirmQuestChain,
  createManualQuest,
  openTurnIn,
  rejectQuestChain,
  startQuest,
  submitDiagnosisAnswers,
  successorOf,
  type RegenerationCandidate,
} from '@/store/operations';
import { useMutate, useSave } from '@/store/useEarthOnlineStore';
import type { ClassIdLiteral, DiagnosticRecord, ForgeCapacity, Quest, QuestChain } from '@/types';

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
  const now = useNow();
  const [writing, setWriting] = useState(false);
  const [justWrote, setJustWrote] = useState(false);
  const { busy, error, run, clearError } = useAgentAction();
  // 回航单开一份动作状态：两个按钮各自按各自的忙碌说话 ——
  // 借一份 busy 共用，会让"正在铺回归路"和"调度员在看近况"互相冒充。
  const sail = useAgentAction();
  const anyBusy = busy || sail.busy;

  // 素材取不到（五个目标全达成了）时按钮就该是灰的 —— 不拿一句假的处境去出题
  const canCommission = composeCommissionBrief(save) !== null;

  // 回航只在真的停过之后出现：完成过、且 ≥3 天没完成任何一步（selectors.isStalled）。
  // 第一天的新玩家看不到它 —— 那不是停滞，是还没起航。
  const stalled = isStalled(save, now);

  const commission = () => {
    const brief = composeCommissionBrief(save);
    if (brief === null || anyBusy) return;
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

  // 回航：照最近搁下的那条线铺一条最小的恢复链（capacity='relapse'，
  // 链长与每步时长的口径在 dispatcher / class 两条 payload 通道上，
  // 不拼进这句素材 —— 见 questBriefs.composeReturnBrief 的注释）。
  // 线取当前高亮的那条：回来走的路应当是自己原本在走的那条；
  // 一条职业线都没有时交给调度员路由。
  const returnSail = () => {
    if (anyBusy) return;
    setJustWrote(false);
    void sail.run(async () => {
      const result = await thunks.forgeChain({
        idea: composeReturnBrief(save),
        classId: activeTrack(save)?.classId ?? null,
        capacity: 'relapse',
        deepDeliberation: false,
        from: 'return',
      });
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
          disabled={!canCommission || anyBusy}
          onClick={commission}
          className={cn(
            'rounded-lg border px-3 py-2 text-[11.5px] transition-all duration-300 ease-cinematic',
            canCommission && !anyBusy
              ? 'border-abyss-400/45 bg-abyss-500/[0.12] text-abyss-300 hover:scale-[1.03] hover:bg-abyss-500/[0.22]'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          {busy ? '调度员正在看你的近况…' : '让调度员出题'}
        </button>
        {stalled && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={returnSail}
            className={cn(
              'glass-pill px-3 py-2 text-[11.5px] text-amber-200/85',
              anyBusy ? 'cursor-not-allowed opacity-60' : 'glass-hover',
            )}
          >
            {sail.busy ? '正在铺一条最短的回归路…' : '回航'}
          </button>
        )}
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
      {stalled && (
        <p className="text-[10.5px] leading-relaxed text-white/30">
          「回航」不问你为什么停：照上次搁下的地方，铺一条最短的路，先动起来。
        </p>
      )}

      {error && <InlineError message={error} onDismiss={clearError} />}
      {sail.error && <InlineError message={sail.error} onDismiss={sail.clearError} />}

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
  // 已收束的线（Phase 7）：closedAt 非空。最新收束的排前面 ——
  // 刚停下的那条，多半就是想再看一眼的那条。
  const closed = Object.values(save.quests.chains)
    .filter((c) => c.closedAt !== null)
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  // 收官抽屉打开的是哪条链（按 id 存，不存对象 —— 与结算面板同一个理由）
  const [finaleId, setFinaleId] = useState<string | null>(null);

  if (chains.length === 0 && rebuildable.length === 0 && closed.length === 0) {
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

      {closed.length > 0 && (
        <Group
          title="已收束"
          hint="你亲手停下过的线。停止也是完成 —— 想回顾它们走完了什么，点开收官。"
        >
          {closed.map((c) => (
            <ClosedChainCard key={c.id} chain={c} onOpenFinale={() => setFinaleId(c.id)} />
          ))}
        </Group>
      )}

      {finaleId && <ChainFinale chainId={finaleId} onClose={() => setFinaleId(null)} />}
    </div>
  );
}

/**
 * 一条已收束的线。
 *
 * 它是「已收束」组里的一行：链名、走过多少步、一颗「看收官」。
 * 之所以值得存在：收束是玩家亲手做的决定，而**决定需要能回看** ——
 * 没有这行字，"停止也是完成"这句话就只是一句安慰，没有落点。
 */
function ClosedChainCard({ chain, onOpenFinale }: { chain: QuestChain; onOpenFinale: () => void }) {
  const save = useSave();
  const members = finaleMembers(save, chain);
  const done = members.filter((q) => q.status === 'completed').length;

  return (
    <article className="glass-hover rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-abyss-500/30 bg-abyss-500/15 px-1.5 py-0.5 text-[10px] leading-[1.4] text-abyss-300">
          {classLabelOf(chain.classId)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-wide text-white/85">
          {chain.title}
        </span>
        <span className="numeric shrink-0 text-[10px] text-white/35">
          走过 {done}/{members.length} 步
        </span>
      </div>
      <div className="mt-2 flex">
        <button
          type="button"
          onClick={onOpenFinale}
          className="glass-pill glass-hover ml-auto px-2.5 py-1.5 text-[11px] text-white/60"
        >
          看收官
        </button>
      </div>
    </article>
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

/**
 * 「换个做法」的四选一原因（Phase 7 · 执行中也能打回）。
 *
 * `label` 是按钮上的两个字，`request` 是真正写进诉求的展开句 ——
 * 模型看得懂"这一步摊得太大"，但看不懂"太大"。落进 RerouteRecord.request
 * 的永远是展开句，玩家翻留档时读到的也是完整的一句话。
 */
const REROUTE_REASONS: ReadonlyArray<{ key: string; label: string; request: string }> = [
  { key: 'too_big', label: '太大', request: '这一步摊得太大' },
  { key: 'too_vague', label: '太糊', request: '这一步说得太糊' },
  { key: 'blocked', label: '条件不足', request: '现在条件不足' },
  { key: 'refuse', label: '不想做', request: '就是不想做这一版' },
];

/**
 * 「换个做法」的共享输入匣：悬赏板（offered）与「进行中」（claimed / active）
 * 两张卡片共用 —— 同一件事在两种处境里发生，就该长同一副样子。
 *
 * 原因**必填**：旧版的空诉求一律按"排得太满"处理，而"太糊"和"不想做"要的
 * 是两种不同的改法（具体化 vs 换一条路）—— 不问清楚，改出来就有一半概率
 * 答非所问。补充框的余量随所选原因收窄：诉求总长守 REROUTE_REQUEST_MAX_LEN，
 * 末尾不被静默截掉。
 */
function RerouteBox({ quest, remaining, onClose }: { quest: Quest; remaining: number; onClose: () => void }) {
  const { busy, error, run, clearError } = useAgentAction();
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [extra, setExtra] = useState('');

  const reason = REROUTE_REASONS.find((r) => r.key === reasonKey) ?? null;
  const extraCap = reason
    ? Math.max(0, REROUTE_REQUEST_MAX_LEN - reason.request.length - 1)
    : REROUTE_REQUEST_MAX_LEN;

  const submit = () => {
    if (!reason || busy) return;
    const trimmed = extra.trim().slice(0, extraCap);
    const request = trimmed.length > 0 ? `${reason.request}：${trimmed}` : reason.request;
    void run(async () => {
      const result = await thunks.reroute({ questId: quest.id, request });
      if (result.ok) onClose();
      return result;
    });
  };

  return (
    <div
      className="mt-3 animate-fade-up rounded-xl border border-abyss-500/30 bg-abyss-500/[0.07] p-2.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10.5px] tracking-wider text-abyss-300/85">换个做法</span>
        <span className="numeric ml-auto text-[10px] text-white/30">本条链还剩 {remaining} 次</span>
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-white/40">
        目的地不变，只换这一步怎么走。先说它卡在哪儿。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REROUTE_REASONS.map((r) => (
          <Chip key={r.key} active={reasonKey === r.key} onClick={() => setReasonKey(r.key)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          type="text"
          value={extra}
          maxLength={extraCap}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="再补一句（选填）"
          className="min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-ink-950/55 px-2.5 py-1.5 text-[11.5px] text-white placeholder:text-white/25 focus:border-abyss-400/50 focus:outline-none focus:ring-1 focus:ring-abyss-400/30"
        />
        <button
          type="button"
          disabled={!reason || busy}
          onClick={submit}
          className="shrink-0 rounded-lg border border-abyss-400/50 bg-abyss-500/20 px-3 py-1.5 text-[11.5px] text-abyss-300 transition-all duration-300 ease-cinematic hover:bg-abyss-500/[0.32] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? '…' : '换'}
        </button>
      </div>
      {error && <InlineError message={error} onDismiss={clearError} />}
    </div>
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
 * 三个出口，各有各的处境（Phase 7 起第三个）：
 *   确认这条线 —— 整条线就这么走。确认后只有第一步落在悬赏板上
 *   打回重来   —— 整条线都不对。全否之后它会出现在「推倒重来」里，
 *                 还留着终身一次的整链重抽
 *   收束这条线 —— 我不想走这条线，也不想重抽它。（Phase 7）
 *                 它是"打回"的对岸：打回说"这批不行、换一批试试"，
 *                 收束说"这件事到此为止"。停止也是完成 ——
 *                 一条从没被确认过的线，也配得上一个体面的落点，
 *                 而不是永远挂在「待议」里等我裁决。
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
  const [closeAsk, setCloseAsk] = useState(false);

  // 收束入口只在真的收得了的时候亮（守卫与 closeQuestChain 逐条对应）——
  // 一颗点了没反应的按钮，比没有按钮更伤信任
  const closeGate = canCloseQuestChain(save, chain.id);

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
            {closeGate.ok && (
              <button
                type="button"
                onClick={() => setCloseAsk(true)}
                className="glass-pill glass-hover px-2.5 py-1.5 text-[11.5px] text-white/60"
              >
                收束这条线
              </button>
            )}
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

      <ConfirmDialog
        open={closeAsk}
        question="这条线就走到这里？"
        subject={chain.title}
        detail="收束不是失败 —— 停止也是完成。还没走的步骤会转成「搁下」归档，走过的部分一步都不会白走。想回顾时，它躺在「已收束」里，点开就是收官。"
        confirmLabel="收束"
        onConfirm={() => {
          setCloseAsk(false);
          mutate((s) => closeQuestChain(s, chain.id, new Date()));
        }}
        onCancel={() => setCloseAsk(false)}
      />
    </article>
  );
}

/**
 * 悬赏板上的一条：现在就能接。
 *
 * 轮 C 起它同时是"被揭开的那一步"的完整模样 —— 所以卡上带着两样东西：
 *   ① 这一步到底要做什么（objective）。确认那条线时只看到了标题，
 *      真正决定接不接的时刻是现在，不是那时。
 *   ② 「换个做法」。单步的修理发生在这步真的摆到面前之后：offered 的在这里，
 *      claimed / active 的在「进行中」那张卡上（Phase 7），共享同一只输入匣。
 *      额度仍是链级 2 次。草稿态的换法没有入口 —— 那时这一步还没轮到，
 *      "做不做得了"只是个假设（见 LineReviewCard 的说明）。
 *
 * 不再有"前置没完成"的灰卡：前置没完成的步骤在板上**不会出现**。
 */
function OfferCard({ quest }: { quest: Quest }) {
  const save = useSave();
  const mutate = useMutate();
  const [open, setOpen] = useState(false);

  const membership = quest.chain;
  const chain = membership ? save.quests.chains[membership.chainId] : undefined;
  const used = chain?.review.rerouteCount ?? 0;
  const remaining = REROUTE_CHAIN_LIMIT - used;
  const reroutable = Boolean(membership) && remaining > 0;

  // 下一步（末一步时为 null）—— 只用来把"揭开"这件事说清楚
  const successor = membership ? successorOf(save, membership.chainId, membership.index) : null;

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

      {/* 共享输入匣：与「进行中」的卡片同一只（先选原因，再决定补不补一句） */}
      {open && reroutable && (
        <RerouteBox quest={quest} remaining={remaining} onClose={() => setOpen(false)} />
      )}
    </CardShell>
  );
}

/**
 * 「进行中」三种状态共用的卡片。右侧按钮由状态决定：
 * 待结算 → 去结算；执行中 → 点击完成（先进 turn_in_pending，再开结算面板）；
 * 待开始 → 开始执行。
 *
 * Phase 7 起卡上还长着「换个做法」：领了、甚至做了一半才发现这一版不对，
 * 是真实会发生的事（事故③的尾巴）。替换件**继承手里的进度** —— 状态还是
 * claimed / active，claimedAt 与 startedAt 原样接回（见 operations 的
 * REROUTABLE_STATUSES 与继承注释）。待结算（turn_in_pending）的那一步
 * 不渲染它：先把这次结算结掉，才有"做法"可谈。
 */
function QuestCard({
  quest,
  action,
}: {
  quest: Quest;
  action: { label: string; onClick: () => void };
}) {
  const save = useSave();
  const mutate = useMutate();
  const [open, setOpen] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);

  const membership = quest.chain;
  const chain = membership ? save.quests.chains[membership.chainId] : undefined;
  const remaining = REROUTE_CHAIN_LIMIT - (chain?.review.rerouteCount ?? 0);
  const reroutable = quest.status !== 'turn_in_pending' && Boolean(membership) && remaining > 0;

  // 收束入口只长在**这条链此刻正在走的那一步**上（在手成员里 index 最小的那张卡）：
  // "这条线要不要停"是整条线的决定，每张卡都挂一遍只会把它变成噪音。
  // head 恰好落在「进行中」的某一张卡上 —— 待结算的那一步不接（先结掉，
  // 与 closeQuestChain 的守卫同一句话）。
  const standing = membership
    ? Object.values(save.quests.byId).filter(
        (q) => q.chain?.chainId === membership.chainId && REROUTABLE_STATUSES.includes(q.status),
      )
    : [];
  const headIndex = standing.reduce<number | null>((min, q) => {
    const idx = q.chain?.index ?? null;
    if (idx === null) return min;
    return min === null || idx < min ? idx : min;
  }, null);
  const showClose =
    Boolean(membership) &&
    quest.status !== 'turn_in_pending' &&
    membership?.index === headIndex &&
    canCloseQuestChain(save, membership.chainId).ok;

  return (
    <>
      <CardShell
        quest={quest}
        footer={
          <div className="flex flex-wrap items-center gap-1.5">
            {showClose && (
              <button
                type="button"
                onClick={() => setCloseAsk(true)}
                className="mr-auto px-0.5 text-[11px] text-white/40 transition hover:text-white/70"
              >
                收束这条线
              </button>
            )}
            {reroutable && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
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
              onClick={action.onClick}
              className="rounded-lg border border-amber-400/45 bg-amber-400/[0.12] px-2.5 py-1.5 text-[11.5px] text-amber-200 transition-all duration-300 ease-cinematic hover:scale-[1.04] hover:bg-amber-400/[0.22] hover:shadow-glow-gold active:scale-[0.98]"
            >
              {action.label}
            </button>
          </div>
        }
      >
        {open && reroutable && (
          <RerouteBox quest={quest} remaining={remaining} onClose={() => setOpen(false)} />
        )}
      </CardShell>

      <ConfirmDialog
        open={closeAsk}
        question="这条线就走到这里？"
        subject={chain?.title ?? quest.title}
        detail="收束不是失败 —— 停止也是完成。还没走完的步骤会转成「搁下」归档，走过的部分一步都不会白走。想回顾时，它躺在「已收束」里，点开就是收官。"
        confirmLabel="收束"
        onConfirm={() => {
          setCloseAsk(false);
          if (membership) mutate((s) => closeQuestChain(s, membership.chainId, new Date()));
        }}
        onCancel={() => setCloseAsk(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab · 灵感（Spark Box）
// ---------------------------------------------------------------------------

/**
 * 三档容量（满档 / 轻档 / 回档）。口径与 `00-shared-context.md` 的
 * 「容量三档」一节同源：这里写的每句话，提示词那边都已经对 Agent 说过一遍。
 *
 * 选择**只影响这一次生成**，不落存档 —— 它是"这次的力气"，不是身份。
 * 默认满档：不选就是照常，老玩家的手感不因这个功能改变。
 */
const CAPACITY_CHOICES: ReadonlyArray<{ key: ForgeCapacity; label: string; hint: string }> = [
  { key: 'full', label: '满档', hint: '照常给：每步 15 分钟 ~ 2 小时，一条链正常展开。' },
  { key: 'light', label: '轻档', hint: '这阵子力气小：每步 15 ~ 30 分钟，当天轻松能完。' },
  {
    key: 'relapse',
    label: '回档',
    hint: '停了很久：先给一条三到五步的最小恢复链，第一步不需要任何前置。',
  },
];

function SparkTab({ onForged }: { onForged: () => void }) {
  const save = useSave();
  // ⚠️ 这一句的初始值字面量被冒烟脚本的转译插件改写（panel-smoke:
  //    smoke:bounty-initial-tab 那条）—— 改这行时同步它，否则定标入口
  //    在 SSR 里渲染不到。
  const [mode, setMode] = useState<SparkMode>('forge');
  /** 刚判完的那一次定标：基线卡要留在屏幕上，直到玩家点「收下」 */
  const [baselineId, setBaselineId] = useState<string | null>(null);

  // 有卷子在走 → 作答屏优先接管。卷子活在存档里（diagnostics.active），
  // 离开这一栏再回来必须能接着答 —— "答到一半刷新不丢卷"就是靠这一条成立的。
  const active = save.diagnostics.active;
  if (active !== null) {
    return (
      <div className="pt-3.5">
        <DiagnosisAnswers record={active} onSettled={setBaselineId} />
      </div>
    );
  }

  const settled =
    baselineId === null ? undefined : save.diagnostics.history.find((r) => r.id === baselineId);

  // 基线卡只在"刚判完"的这一趟旅程里留在屏幕上（记录本身已归入档案）——
  // 刷新之后回到入口：链已经在「待议」里等着，基线不是一条会被错过的路。
  if (settled?.baseline) {
    return (
      <div className="pt-3.5">
        <DiagnosisBaselineCard
          record={settled}
          onGoToReview={onForged}
          onDone={() => setBaselineId(null)}
        />
      </div>
    );
  }

  return (
    <div className="pt-3.5">
      {/* 双入口（PO 裁定：自由选）。默认仍是「直接开链」——那是这块面板
          原本的手感；定标在旁边一步可达，而不是把每个人先拦下来答一张卷子。 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={mode === 'forge'} onClick={() => setMode('forge')}>
          直接开链
        </Chip>
        <Chip active={mode === 'diagnosis'} onClick={() => setMode('diagnosis')}>
          开局定标
        </Chip>
      </div>
      {mode === 'forge' ? <ForgeIntake onForged={onForged} /> : <DiagnosisIntake />}
    </div>
  );
}

/**
 * 灵感栏的两个入口。
 *
 *   'forge'     —— 写下想法直接铸链（Phase 2 就有的一屏，默认入口）；
 *   'diagnosis' —— 开局定标：先量起点，再排第一条链（Phase 7 · up 迁移）。
 *
 * 顺序上「直接开链」在前：它是这块面板原本的手感，定标不抢它的位置 ——
 * 两个入口自由选是 PO 的裁定，不是给每个人安排的必经之路。
 */
type SparkMode = 'forge' | 'diagnosis';

/**
 * 定标第一屏：写下目标。
 *
 * 只收一句话 —— 定标师要的是**原话**（改写是它的活，诚实是玩家的活）。
 * 出题这一步失败时目标留在框里：那段话是玩家自己写的，重试不该要第二遍。
 * 成功之后不用在这里切屏：卷子落进存档，外层按存档状态渲染，作答屏自己接管。
 */
function DiagnosisIntake() {
  const [goal, setGoal] = useState('');
  const { busy, error, run, clearError } = useAgentAction();
  const ready = goal.trim().length > 0 && !busy;

  const start = () => {
    if (!ready) return;
    void run(() => thunks.designDiagnosis({ goalRaw: goal.trim() }));
  };

  return (
    <div className="mt-3.5">
      <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">
        先量起点，再谈走多远。写下你想去哪 —— 一句话就够，改写是定标师的活。
      </p>

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={3}
        maxLength={200}
        placeholder="例如：我想把英语捡起来，以后能看懂英文资料、跟人开会不慌。"
        aria-label="定标目标"
        className="mt-3 w-full resize-none rounded-xl border border-white/[0.12] bg-ink-950/45 px-3.5 py-3 text-[12.5px] leading-relaxed text-white placeholder:text-white/30 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
      />

      <p className="mt-2 text-[10.5px] leading-relaxed text-white/35">
        接下来是一张几分钟能答完的卷子：三四道题，开放与选择混合。它不判对错，只量位置；
        答完之前，你随时可以放弃。
      </p>

      <button
        type="button"
        disabled={!ready}
        onClick={start}
        className={cn(
          'mt-4 w-full rounded-lg border py-2.5 text-[12.5px] transition-all duration-300 ease-cinematic',
          ready
            ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]'
            : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
        )}
      >
        {busy ? '定标师正在出题…' : '让定标师出题'}
      </button>

      {error && <InlineError message={error} onDismiss={clearError} />}
    </div>
  );
}

/**
 * 定标第二屏：作答。
 *
 * 读的是**存档里的卷子**（diagnostics.active），不是组件 state ——
 * 答到一半离开或刷新，回来还是这张卷（先例：结算面板的 turn_in_pending）。
 *
 * 交卷是两步、有先后：先 `submitDiagnosisAnswers` 把答案落盘，再叫判分。
 * 顺序反过来的话，判分那段等待里刷新页面，答案就没了 —— 而那段等待
 * （思考 + 铸链）偏偏是这条流程里最长的一次。
 */
function DiagnosisAnswers({
  record,
  onSettled,
}: {
  record: DiagnosticRecord;
  onSettled: (recordId: string) => void;
}) {
  const mutate = useMutate();
  const { busy, error, run, clearError } = useAgentAction();
  const [confirming, setConfirming] = useState(false);
  /** 逐题的草稿答案。初值取记录里已有的 —— 判分失败重试时不必重写 */
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(record.answers.map((a) => [a.questionId, a.text])),
  );

  const answered = record.questions.filter((q) => (draft[q.id] ?? '').trim().length > 0).length;
  const ready = answered > 0 && !busy;

  const submit = () => {
    if (!ready) return;
    void run(async () => {
      mutate((s) =>
        submitDiagnosisAnswers(
          s,
          record.questions.map((q) => ({ questionId: q.id, text: draft[q.id] ?? '' })),
          new Date(),
        ),
      );
      const result = await thunks.runDiagnosis();
      // 判分成功后记录归档、链进「待议」；基线卡由外层按 id 接管
      if (result.ok) onSettled(result.data.recordId);
      return result;
    });
  };

  const giveUp = () => {
    mutate((s) => cancelDiagnosis(s, new Date()));
    setConfirming(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-abyss-400" />
        <span className="text-[10.5px] tracking-[0.18em] text-white/45">开局定标 · 作答</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
        定标师把目标定成：{record.goalReframed}
      </p>

      <div className="mt-3 space-y-2.5">
        {record.questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-white/[0.09] bg-white/[0.035] p-3">
            <div className="flex items-baseline gap-2">
              <span className="numeric shrink-0 text-[10.5px] text-white/30">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-white/85">
                {q.prompt}
              </span>
            </div>
            {q.kind === 'open' ? (
              <textarea
                value={draft[q.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                rows={3}
                maxLength={1200}
                aria-label={`第 ${i + 1} 题`}
                placeholder="写下真实情况就好 —— 这道题量的是位置，不是表现。"
                className="mt-2 w-full resize-none rounded-lg border border-white/[0.1] bg-ink-950/45 px-3 py-2.5 text-[12px] leading-relaxed text-white placeholder:text-white/25 focus:border-abyss-400/40 focus:outline-none focus:ring-1 focus:ring-abyss-400/30"
              />
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <Chip
                    key={opt}
                    active={(draft[q.id] ?? '') === opt}
                    onClick={() => setDraft((d) => ({ ...d, [q.id]: opt }))}
                  >
                    {opt}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10.5px] text-white/35">
        <span>
          已答 <span className="numeric">{answered}</span>/{record.questions.length} 题
        </span>
        <span>卷面先落存档 · 判分没接上也不丢</span>
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className="glass-pill glass-hover flex-1 py-2.5 text-[12.5px] text-white/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          放弃定标
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className={cn(
            'flex-[1.4] rounded-lg border py-2.5 text-[12.5px] transition-all duration-300 ease-cinematic',
            ready
              ? 'border-amber-400/50 bg-amber-400/15 font-medium text-amber-200 shadow-glow-gold hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]'
              : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-white/30',
          )}
        >
          {busy ? '定标师正在判分…' : '交卷 · 量出基线'}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        question="这次定标就不往下走了？"
        detail={
          <p className="text-[11.5px] leading-relaxed text-white/55">
            放弃会把这张卷子归档 —— 它不再往下走，也不会铸链。想清楚了随时可以重新起一张。
          </p>
        }
        confirmLabel="放弃"
        cancelLabel="继续答"
        onConfirm={giveUp}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/**
 * 定标第三屏：基线卡。
 *
 * 也是整个定标流程唯一一次"成绩单"式的展示 —— 但它没有总分、没有及格线：
 * 一句话的位置标签 + 几个可比较的维度 + 已经有的 / 现在还缺的。
 * 它回答的是"起点长什么样"，好让后面每一步都有资格说"这比起点高了"。
 *
 * 独立导出（而不是内嵌在流程里）有两个理由：① 冒烟脚本能拿一份真夹具直接
 * 渲染它（portal 之外的纯展示组件才验得动）；② "刚判完"那一趟旅程之外，
 * 将来若要有定标档案浏览器，也是复用它。
 */
export function DiagnosisBaselineCard({
  record,
  onGoToReview,
  onDone,
}: {
  record: DiagnosticRecord;
  onGoToReview: () => void;
  onDone: () => void;
}) {
  const save = useSave();
  const baseline = record.baseline;
  if (baseline === null) return null;
  const chain = record.chainId === null ? undefined : save.quests.chains[record.chainId];

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="text-[10.5px] tracking-[0.18em] text-amber-400/90">基线 · 已记录</span>
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-white/40">
        你写下的是：「{record.goalRaw}」
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">
        定标师把它改成：{record.goalReframed}
      </p>

      <div className="mt-3 rounded-lg border border-white/10 bg-ink-950/40 p-3">
        <p className="prose-cinematic text-[13px] font-medium tracking-wide text-white/90">
          {baseline.levelLabel}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">{baseline.summary}</p>

        <div className="mt-2.5 space-y-1.5">
          {baseline.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-[10.5px] text-white/45">{d.label}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className="block h-full rounded-full bg-abyss-400/70"
                  style={{ width: `${d.score}%` }}
                />
              </span>
              <span className="numeric w-7 shrink-0 text-right text-[10.5px] text-white/45">
                {d.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {baseline.strengths.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[10.5px] tracking-wider text-white/40">已经有的</div>
          <ul className="mt-1 space-y-1">
            {baseline.strengths.map((s) => (
              <li key={s} className="flex gap-1.5 text-[11.5px] leading-relaxed text-white/70">
                <span className="shrink-0 text-amber-400/70">·</span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {baseline.gaps.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[10.5px] tracking-wider text-white/40">现在还缺的</div>
          <ul className="mt-1 space-y-1">
            {baseline.gaps.map((g) => (
              <li key={g} className="flex gap-1.5 text-[11.5px] leading-relaxed text-white/70">
                <span className="shrink-0 text-abyss-400/70">·</span>
                <span className="min-w-0">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {record.suggestedClassIds.length > 0 && (
        <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/40">
          定标师倾向：
          {record.suggestedClassIds.map((id) => classLabelOf(id as ClassIdLiteral)).join('、')}
          {' '}—— 只是建议，归哪条线由调度员和你一起在「待议」里定。
        </p>
      )}

      {chain && (
        <p className="mt-2 text-[11px] leading-relaxed text-white/55">
          已按这个起点排出「{chain.title}」——{' '}
          <span className="numeric">{chain.questIds.length}</span> 步，正在「待议」里等你过目。
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="glass-pill glass-hover flex-1 py-2.5 text-[12.5px] text-white/70"
        >
          收下
        </button>
        <button
          type="button"
          onClick={onGoToReview}
          className="flex-[1.4] rounded-lg border border-amber-400/50 bg-amber-400/15 py-2.5 text-[12.5px] font-medium text-amber-200 shadow-glow-gold transition-all duration-300 ease-cinematic hover:scale-[1.02] hover:bg-amber-400/25 active:scale-[0.99]"
        >
          去看待议
        </button>
      </div>
    </div>
  );
}

/**
 * 直接开链那一屏（Phase 2 原有的灵感栏，Phase 7 之后成为「直接开链」入口的正文）。
 */
function ForgeIntake({ onForged }: { onForged: () => void }) {
  const [idea, setIdea] = useState('');
  const [deep, setDeep] = useState(false);
  const [capacity, setCapacity] = useState<ForgeCapacity>('full');
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
        capacity,
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

  // 外层 SparkTab 已有 pt-3.5；这里只留与「开局定标」同一档的 mt-3.5
  // （间距归外层管，入口屏自己只负责与那排 chips 的距离）。
  return (
    <div className="mt-3.5">
      <p className="prose-cinematic text-[12.5px] leading-relaxed text-white/55">
        写一件你最近反复想起、但一直没动手的事。它会被拆成几步，摆在板上等你过目。
      </p>

      {/* 三档容量：告诉 Agent"这次给多厚"。选完照常写想法、照常生成 ——
          区别只在出来的链是长的、短的、还是只有几步用来重新起步的。 */}
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] text-white/35">这次的档位</span>
          {CAPACITY_CHOICES.map((c) => (
            <Chip key={c.key} active={capacity === c.key} onClick={() => setCapacity(c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
          {CAPACITY_CHOICES.find((c) => c.key === capacity)?.hint}
        </p>
      </div>

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
