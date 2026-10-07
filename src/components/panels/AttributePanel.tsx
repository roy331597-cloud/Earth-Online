import { PanelShell } from '@/components/panels/PanelShell';
import { attributeLabels, ATTRIBUTE_BAR_MAX, ATTRIBUTE_BAR_TICKS } from '@/data/catalog/attributes';
import { formatDateKeyCN } from '@/lib/format';
import type { PanelKey } from '@/lib/panels';
import { attributeRows, recentAttributeNotes } from '@/lib/selectors';
import type { AttributeNoteView, AttributeRowView } from '@/lib/selectors';
import { spendAttributePoint } from '@/store/operations';
import { useMutate, useSave } from '@/store/useEarthOnlineStore';
import type { DateKey } from '@/types';

interface AttributePanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 人物属性面板（玻璃幕墙）。
 *
 * PO 裁定的三件事，这一页就是它们的界面：
 *   ① **六维 + 任务只记账** —— 任务完成不预告也不赠送属性，
 *      只在留痕里写一行"这条练到了 智识 · 心力"，没有数字；
 *   ② **手动分配** —— 池里有点时，每一行右侧出现「＋」，点哪哪亮。
 *      兑现 core.ts 那句"保留『我在长成什么样』的主动权"；
 *   ③ **不设撤销** —— 所以"点出去不能撤回"必须写在按钮之前，
 *      而不是点完之后才用一个对话框补一句后悔。
 *
 * 它不进 Dock（手机端从场景里的玻璃幕墙进来），所以开场那句文案
 * 承担了整个面板的自我介绍 —— 写得像一句旁白，不像一段说明。
 */
export function AttributePanel({ panel, onClose }: AttributePanelProps) {
  const save = useSave();
  const rows = attributeRows(save);
  const notes = recentAttributeNotes(save, 8);
  const pool = save.player.freeAttributePoints;

  return (
    <PanelShell panel={panel} onClose={onClose}>
      <div className="space-y-5 pt-3.5">
        <PoolBlock pool={pool} />

        <ul className="space-y-2.5">
          {rows.map((row) => (
            <AttributeRowItem key={row.key} row={row} canSpend={pool > 0} />
          ))}
        </ul>

        {notes.length > 0 && <RecentNotes notes={notes} />}

        <p className="text-[10.5px] leading-relaxed text-white/30">
          任务只记账：做完一条任务，它会告诉你练到了哪儿，但点还是你自己去加。
          升级与新任务偶尔会往池子里发点 —— 涨点的出口只有你在这里的每一次点击。
        </p>
      </div>
    </PanelShell>
  );
}

/**
 * 池子。
 *
 * 空池只说一句"升级会发点"，不摆一个灰着的 "0 / 0" ——
 * 数字 0 会让人反复回来确认，而这里没有什么可确认的。
 */
function PoolBlock({ pool }: { pool: number }) {
  if (pool <= 0) {
    return (
      <p className="text-[11.5px] leading-relaxed text-white/40">
        没有待分配的点。升级会发一点；任务只负责记账，不送点。
      </p>
    );
  }

  return (
    <div className="flex items-baseline gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-3.5 py-3">
      <span className="numeric text-[18px] font-semibold leading-none text-amber-400">＋{pool}</span>
      <div className="min-w-0">
        <div className="text-[12px] text-amber-200/95">点在下面任一行右侧的「＋」上</div>
        <div className="mt-0.5 text-[10.5px] leading-relaxed text-white/40">
          点出去就定了，不能撤回 —— 想一秒钟再点。
        </div>
      </div>
    </div>
  );
}

function AttributeRowItem({ row, canSpend }: { row: AttributeRowView; canSpend: boolean }) {
  const mutate = useMutate();

  return (
    <li className="glass-hover rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] tracking-wide text-white/90">{row.label}</span>
        <span className="numeric ml-auto text-[15px] font-semibold leading-none text-white/85">
          {row.value}
        </span>
        {/* 「＋」只在池里有点时出现（PO 裁定）—— 它是"你现在能做一件事"的提示，
            池子空着还挂一个灰按钮，就变成了一句催办 */}
        {canSpend && (
          <button
            type="button"
            aria-label={`把一点分配到${row.label}`}
            onClick={() => mutate((s) => spendAttributePoint(s, row.key, new Date()))}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-400/45 bg-amber-400/[0.12] text-[13px] leading-none text-amber-200 transition-all duration-300 ease-cinematic hover:scale-110 hover:bg-amber-400/[0.24] hover:shadow-glow-gold active:scale-95"
          >
            ＋
          </button>
        )}
      </div>

      {/* 横条 + 刻度。60 不是天花板，只是尺子 —— 所以刻度线画在条上，
          而不是把条按比例截断；超了 60 的人不需要被"截断"这件事提醒 */}
      <div className="relative mt-2.5 h-[5px] rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-abyss-500 to-amber-400 transition-all duration-700 ease-cinematic"
          style={{ width: `${row.ratio * 100}%` }}
        />
        {ATTRIBUTE_BAR_TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/25"
            style={{ left: `${(tick / ATTRIBUTE_BAR_MAX) * 100}%` }}
          />
        ))}
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-white/35">{row.line}</p>

      {row.weights.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] tracking-wider text-white/25">关联职业线</span>
          {row.weights.map((w) => (
            <span
              key={w.classId}
              className="rounded border border-abyss-500/25 bg-abyss-500/10 px-1.5 py-px text-[10px] leading-[1.4] text-abyss-300/85"
            >
              {w.label} {Math.round(w.weight * 100)}%
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * 近期记录：一条时间线上，两种留痕混排 ——
 * 「手动分配」（涨了 1 点，金色）与「任务记账」（练到了哪几维，一句事实）。
 * 混排是刻意的：这一页要回答的问题是"我在长成什么样"，
 * 而它由"我做了什么"和"我决定了什么"共同构成，分开摆就把因果拆散了。
 */
function RecentNotes({ notes }: { notes: AttributeNoteView[] }) {
  return (
    <section>
      <h3 className="text-[10.5px] tracking-[0.18em] text-white/45">近期记录</h3>
      <ul className="mt-2 space-y-1.5">
        {notes.map((n) => (
          <li key={n.id} className="flex items-baseline gap-2">
            <span className="numeric shrink-0 text-[10px] text-white/30">
              {formatDateKeyCN(n.ts.slice(0, 10) as DateKey)}
            </span>
            <span className="prose-cinematic min-w-0 flex-1 truncate text-[11px] text-white/60">
              {n.label}
            </span>
            <span className="shrink-0 text-[10.5px] text-abyss-300/85">
              {attributeLabels(n.attributeKeys)}
            </span>
            {n.allocated > 0 ? (
              <span className="numeric shrink-0 text-[11px] text-amber-300/90">+{n.allocated}</span>
            ) : (
              <span className="shrink-0 text-[10px] text-white/25">记账</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
