import { createPortal } from 'react-dom';
import { classLabelOf } from '@/data/catalog/classes';
import { useSave } from '@/store/useEarthOnlineStore';
import type { EarthOnlineState, Quest, QuestChain } from '@/types';

/**
 * 收官 —— 一条线走完之后（或收束之后）的那张总结。
 *
 * Phase 7 · up 迁移的一条来自《人生进阶指南》的裁定：**链尾留一套总结，
 * 不做回访**。总结回答的是"这条线我们完成了哪些任务"，一场链的复盘，
 * 而不是又一张任务卡。所以这里没有输入框、没有动作、没有"下一步" ——
 * 只有清单、理由、和一个总数。看完点「收下」，它就回到档案里。
 *
 * 两个状态（与 types/quest.ts 的 closedAt 注释同源，按 completed / closedAt 判）：
 *   · 走完了     —— chain.completed 为真：最后一步的结算面板里**当场**展示
 *                    （ChainSummaryBlock），这里只是它可被再次打开的那副样子；
 *   · 在这里收束 —— closedAt 非空：半途叫停，从「待议」的「已收束」组里点开。
 *
 * 为什么清单里也列「换过做法 / 打回 / 搁下」的那些步骤：收官是**档案**，
 * 档案要诚实。换过几次做法、在哪一步停下的，都是这条线真实的样子 ——
 * 只列成功的那几行，总结就退化成了奖状。
 */

/** 收官清单里每一步的状态词。中间态（draft/offered/claimed/active）不该出现在收官的链上 */
const FINALE_STEP_LABEL: Partial<Record<Quest['status'], string>> = {
  completed: '完成',
  abandoned: '搁下',
  rerouted: '换过做法',
  rejected: '打回',
};

/**
 * 证据阶梯（Phase 7 · up 迁移）。与 `23-class-entrepreneur.md` 的
 * 「证据阶梯」一节逐级同源 —— 那边是给生成用的判据，这边是给收官回看用的对照表。
 *
 * 只在创业线的收官里出现。这条线的每一步验证任务都被要求"指名台阶"
 * （见提示词第 7 条），收官的这一刻正是回头看"到底爬到了哪一级"的时刻。
 *
 * 它不读任何数据：阶梯是**对照表**，不是记分板 —— 我们数不出玩家停在哪一级，
 * 也不该假装数得出。玩家自己知道。
 */
const LADDER_RUNGS: ReadonlyArray<{ rung: string; text: string }> = [
  { rung: '第一级', text: '说「不错」—— 最弱的信号，客气不算证据。' },
  { rung: '第二级', text: '给出样例 —— 愿意动手试一次，可能只是帮忙。' },
  { rung: '第三级', text: '约试做 —— 拿它对付原流程；赢过原流程才算数。' },
  { rung: '第四级', text: '付款验收 —— 这一次被接受；钱是行为的承认。' },
  { rung: '第五级', text: '复购 —— 第二次被选择；重复需求，信号才立得住。' },
];

/**
 * 阶梯对照块。独立导出有两个理由（同 DiagnosisBaselineCard 的先例）：
 * ① 冒烟脚本能拿它直接渲一遍（ChainFinale 本体带 portal 守卫，SSR 进不去）；
 * ② 将来若要在别处回看这条线，复用的是同一份对照表。
 */
export function EntrepreneurLadderNote() {
  return (
    <div className="rounded-lg border border-white/[0.09] bg-ink-950/35 p-3">
      <div className="text-[10.5px] tracking-wider text-white/40">
        证据阶梯 · 你的验证爬到了哪一级
      </div>
      <ol className="mt-1.5 space-y-1">
        {LADDER_RUNGS.map((r) => (
          <li key={r.rung} className="flex gap-2 text-[11px] leading-relaxed text-white/60">
            <span className="shrink-0 text-abyss-400/70">{r.rung}</span>
            <span className="min-w-0">{r.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
        「不错」听着再好，也只是第一级 —— 这条线只认行为。
      </p>
    </div>
  );
}

/** 收官要列的人：这张链名下的全部成员，按链上位置排（含留档态 —— 见文件头注释） */
export const finaleMembers = (state: EarthOnlineState, chain: QuestChain): Quest[] =>
  Object.values(state.quests.byId)
    .filter((q) => q.chain?.chainId === chain.id)
    .sort((a, b) => (a.chain?.index ?? 0) - (b.chain?.index ?? 0));

/** 走的这几步一共带回多少 EXP（结算过的取 final，未结算的取基础值） */
export const finaleExpTotal = (members: Quest[]): number =>
  members.reduce(
    (sum, q) => (q.status === 'completed' ? sum + (q.grant?.final.exp ?? q.reward.exp) : sum),
    0,
  );

/**
 * 收官正文。独立抽屉的主体与结算面板末一步的追加块共用同一套口径 ——
 * 两处各写一遍的话，"总数"有一天会在两个地方对不上。
 */
function FinaleBody({ chain, members }: { chain: QuestChain; members: Quest[] }) {
  const doneCount = members.filter((q) => q.status === 'completed').length;
  const expTotal = finaleExpTotal(members);
  const walked = chain.completed;

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={[
            'h-1.5 w-1.5 rounded-full',
            walked ? 'bg-amber-400' : 'bg-abyss-400',
          ].join(' ')}
        />
        <span className="text-[11px] tracking-[0.18em] text-white/55">
          {walked ? '走完了' : '在这里收束'}
        </span>
      </div>
      <h3 className="prose-cinematic mt-2 text-[17px] font-medium tracking-wide text-white">
        {chain.title}
      </h3>
      <p className="mt-1 text-[11px] tracking-wider text-abyss-300/80">
        {classLabelOf(chain.classId)} · 走过{' '}
        <span className="numeric">
          {doneCount}/{members.length}
        </span>{' '}
        步
      </p>

      <p className="prose-cinematic mt-2.5 text-[12px] leading-relaxed text-white/55">
        {chain.rationale}
      </p>

      {/* 长链（几十步）要在这张卡里滚得动 —— 与 LineReviewCard 同一道护栏 */}
      <ol className="mt-3 max-h-[40vh] space-y-1.5 overflow-y-auto pr-0.5">
        {members.map((q) => (
          <li
            key={q.id}
            className="flex items-baseline gap-2 rounded-lg border border-white/[0.07] bg-ink-950/35 px-2.5 py-2"
          >
            <span className="numeric shrink-0 text-[10.5px] text-white/30">
              {q.chain ? q.chain.index + 1 : '·'}
            </span>
            <span
              className={[
                'min-w-0 flex-1 break-words text-[12px] leading-relaxed',
                q.status === 'completed' ? 'text-white/80' : 'text-white/45',
              ].join(' ')}
            >
              {q.title}
            </span>
            {q.status === 'completed' ? (
              <span className="numeric-gold shrink-0 text-[10.5px]">
                +{q.grant?.final.exp ?? q.reward.exp}
              </span>
            ) : (
              <span className="shrink-0 text-[10px] text-white/35">
                {FINALE_STEP_LABEL[q.status] ?? ''}
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-2.5">
        <span className="text-[10.5px] tracking-wider text-white/40">这条线一共</span>
        <span className="numeric-gold text-[15px] font-semibold">+{expTotal} EXP</span>
      </div>

      {/* 创业线的收官多一块读法：这条线的每一步都在爬证据阶梯，
          收官的这一刻正是回头看"爬到了哪一级"的时刻（见 EntrepreneurLadderNote） */}
      {chain.classId === 'startup_entrepreneur' && (
        <div className="mt-3">
          <EntrepreneurLadderNote />
        </div>
      )}

      <p className="prose-cinematic mt-3 text-[11.5px] leading-relaxed text-white/45">
        {walked
          ? '走过的每一步都留在档案里 —— 这是这条线的全部。'
          : '停止也是完成。走过的那几步，一步都没有白走。'}
      </p>
    </>
  );
}

/**
 * 收官抽屉。
 *
 * 与 TurnInSheet 同一套 portal 规矩（必须挂 body，否则被面板的
 * backdrop-filter 夺走包含块 —— 详见 ConfirmDialog 的注释）。
 * 零 store 改动：它只读，不写。
 */
export function ChainFinale({ chainId, onClose }: { chainId: string; onClose: () => void }) {
  const save = useSave();
  const chain = save.quests.chains[chainId];

  if (!chain) return null;
  if (typeof document === 'undefined') return null;
  const members = finaleMembers(save, chain);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="关闭收官"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink-950/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="glass-deep relative m-3 max-h-[82vh] w-full max-w-[26rem] animate-fade-up overflow-y-auto p-5 no-scrollbar"
        style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <FinaleBody chain={chain} members={members} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 px-1 text-white/40 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-white/20 bg-white/[0.06] py-2.5 text-[12.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/40 hover:text-white active:scale-[0.99]"
        >
          收下
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 结算面板末一步的追加块（走完语义）。
 *
 * 最后一步结算的那一刻，是唯一一次"当场"可以交代整条线得数的时刻 ——
 * 所以它不留到玩家哪天翻档案时才看见。标题写死「这条线，走完了」：
 * 这条块只在末一步出现，它出现时链刚刚翻成 completed（见 completeQuest）。
 */
export function ChainSummaryBlock({ chainId }: { chainId: string }) {
  const save = useSave();
  const chain = save.quests.chains[chainId];
  if (!chain) return null;

  const done = finaleMembers(save, chain).filter((q) => q.status === 'completed');
  const expTotal = finaleExpTotal(done);

  return (
    <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="text-[10.5px] tracking-[0.18em] text-amber-400/90">这条线，走完了</span>
      </div>
      <p className="prose-cinematic mt-1.5 text-[13px] font-medium tracking-wide text-white/90">
        {chain.title}
      </p>
      <p className="mt-1 text-[10.5px] text-white/45">
        <span className="numeric">{done.length}</span> 步，一步没落。
      </p>

      <ol className="mt-2.5 max-h-[28vh] space-y-1 overflow-y-auto pr-0.5">
        {done.map((q) => (
          <li key={q.id} className="flex items-baseline gap-2 text-[11.5px] leading-relaxed">
            <span className="shrink-0 text-amber-400/70">✓</span>
            <span className="min-w-0 flex-1 break-words text-white/75">{q.title}</span>
          </li>
        ))}
      </ol>

      <div className="mt-2.5 flex items-baseline justify-between border-t border-amber-400/20 pt-2">
        <span className="text-[10.5px] tracking-wider text-white/40">这条线一共</span>
        <span className="numeric-gold text-[14px] font-semibold">+{expTotal} EXP</span>
      </div>
    </div>
  );
}
