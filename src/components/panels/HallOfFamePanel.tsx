import { PanelShell } from '@/components/panels/PanelShell';
import { AchievementSigil, TIER_TEXT } from '@/components/ui/AchievementSigil';
import { hallOfFameView } from '@/lib/achievementEngine';
import type { AchievementProgressUnit, AchievementSlot } from '@/lib/achievementEngine';
import { cn } from '@/lib/cn';
import { formatDateKeyCN, formatUsdShort, localDateKey } from '@/lib/format';
import type { PanelKey } from '@/lib/panels';
import { useSave } from '@/store/useEarthOnlineStore';
import type { AchievementProgress, ISODateTime } from '@/types';

interface HallOfFamePanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 成就陈列馆。
 *
 * 与档案馆的分工，一句话：**档案馆收的是证据，这里收的是名字。**
 * 那边每一件都带日期，因为那些是"你在门外真的做成了什么"；
 * 这边每一件都不新增事实，它只是把同一批事重新讲一遍 ——
 * 用另一种语言，说给另一个时候的你听。
 *
 * 三态，一件东西的三种处境：
 *   ① **已解锁** —— 名字、题记、上墙的日子。题记是"原来那件事有个名字"，只在这儿读得到；
 *   ② **锁着的明条** —— 名字、线索、达成条件、进度条。看得见够得着，差多少一目了然；
 *   ③ **锁着的暗条**（维度 F）—— 只剩一枚剪影、一个记号、一句不点破的线索。
 *      名称/条件/进度全是 null，**闸门在引擎那边就关好了**：这一页就算
 *      忘了判 `title === null`，也拿不到那个名字（见 achievementEngine 的投影说明）。
 *
 * 关于颜色，有一条硬纪律：四档的差别必须是**材质**的差别，不是亮度的差别，
 * 而且只许用 ink / 白 / 琥珀 / 深渊蓝这四个色相。多一个色相，
 * 这面墙就会开始像别的东西的成就系统。
 */
export function HallOfFamePanel({ panel, onClose }: HallOfFamePanelProps) {
  const save = useSave();
  const view = hallOfFameView(save);
  const pct = view.totalCount === 0 ? 0 : (view.unlockedCount / view.totalCount) * 100;

  return (
    <PanelShell panel={panel} onClose={onClose}>
      {/* ================= 墙头：一句总账 ================= */}
      <section className="pt-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10.5px] tracking-[0.16em] text-white/45">已命名</span>
          <span className="numeric ml-auto text-[10px] text-white/30">
            {view.unlockedCount} / {view.totalCount}
          </span>
        </div>
        <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-amber-400/50 transition-all duration-700 ease-cinematic"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="prose-cinematic mt-2.5 text-[11.5px] leading-relaxed text-white/35">
          徽记不会过期，也摘不下来。你做那件事的时候它就归你了 ——
          哪怕系统是很多年之后才知道的。
        </p>
      </section>

      {/* ================= 六栏 ================= */}
      {view.dimensions.map((dim) => (
        <section key={dim.id} className="mt-6">
          <div className="flex items-baseline gap-2">
            <span className="numeric text-[10.5px] tracking-[0.22em] text-amber-400/70">{dim.letter}</span>
            <span className="text-[12.5px] tracking-[0.14em] text-white/75">{dim.label}</span>
            <span className="numeric ml-auto text-[10px] text-white/30">
              {dim.unlockedCount} / {dim.slots.length}
            </span>
          </div>
          <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/40">{dim.epigraph}</p>

          <ul className="mt-2.5 space-y-1.5">
            {dim.slots.map((slot) => (
              <Badge key={slot.id} slot={slot} />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25">
        这一页不排名次，也没有别人的数据。
      </p>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 一枚
// ---------------------------------------------------------------------------

function Badge({ slot }: { slot: AchievementSlot }) {
  const silhouette = slot.title === null; // 锁着的暗条：连名字都还没给
  const mounted = slot.unlocked ? mountedOn(slot.unlockedAt) : null;

  return (
    <li
      className={cn(
        'rounded-xl border px-3 py-2.5 transition-colors duration-300',
        slot.unlocked
          ? 'border-white/[0.10] bg-white/[0.035]'
          : 'border-white/[0.055] bg-white/[0.012]',
      )}
    >
      <div className="flex gap-3">
        <AchievementSigil
          tier={slot.tier}
          unlocked={slot.unlocked}
          hidden={silhouette}
          mark={slot.mark}
          className="mt-0.5 h-7 w-7"
        />

        <div className="min-w-0 flex-1">
          {/* —— 名字那一行 —— */}
          <div className="flex items-baseline gap-2">
            {silhouette ? (
              // 剪影：给一个"这里有字，但还不是现在"的形状，而不是一行"？？？"
              <span className="mt-0.5 block h-2.5 w-24 rounded-full bg-white/[0.07]" aria-label="尚未命名" />
            ) : (
              <span
                className={cn(
                  'prose-cinematic truncate text-[13.5px] leading-snug',
                  slot.unlocked ? 'text-white/90' : 'text-white/55',
                )}
              >
                {slot.title}
              </span>
            )}
            {!silhouette && slot.epithet !== null && (
              <span className="numeric shrink-0 text-[10px] tracking-[0.14em] text-amber-300/55">
                {slot.epithet}
              </span>
            )}
            <span
              className={cn(
                'ml-auto shrink-0 text-[9.5px] tracking-wider',
                slot.unlocked ? TIER_TEXT[slot.tier] : 'text-white/20',
              )}
            >
              {slot.tierLabel}
            </span>
          </div>

          {/* —— 下面那一段：三种处境说三种话 —— */}
          {slot.unlocked ? (
            <>
              {slot.epigraph !== null && (
                <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-white/45">
                  {slot.epigraph}
                </p>
              )}
              {mounted !== null && (
                <p className="numeric mt-1.5 text-[10px] tracking-wider text-white/25">上墙 {mounted}</p>
              )}
            </>
          ) : silhouette ? (
            <p className="mt-1 text-[11.5px] leading-relaxed text-abyss-300/60">{slot.clue}</p>
          ) : (
            <>
              {/* 线索在前、条件在后 —— 这两句是同一件事的两种语言，次序就是它们的口气：
                  先说谜面（"有一种早起，只有很少的人见过它长什么样"），
                  再说事实（"在早上 8 点前完成一次打卡"）。
                  反过来写，这一页就会变成第二块悬赏板。 */}
              {slot.clue !== null && (
                <p className="prose-cinematic mt-1 text-[11.5px] leading-relaxed text-amber-200/35">{slot.clue}</p>
              )}
              {slot.criterion !== null && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">{slot.criterion}</p>
              )}
              {slot.progress !== null && <Bar progress={slot.progress} unit={slot.unit} />}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * 进度条。
 *
 * 数字只有在这一格才出现，而且**必须**按 unit 念 —— 「1250000 / 100000000」
 * 是同一件事，但它读起来像乱码。单位由引擎随进度一起给出（见 unitOf），
 * 组件不回头去读条件。已经达成的那种（1/1）不画条：一条满格躺在锁着的条目下面，
 * 会让人以为它坏了。
 */
function Bar({ progress, unit }: { progress: AchievementProgress; unit: AchievementProgressUnit }) {
  const pct = progress.target <= 0 ? 0 : Math.max(0, Math.min(1, progress.current / progress.target)) * 100;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-amber-400/35 transition-all duration-700 ease-cinematic"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="numeric shrink-0 text-[10px] text-white/30">{progressText(progress, unit)}</span>
    </div>
  );
}

const progressText = (p: AchievementProgress, unit: AchievementProgressUnit): string => {
  if (unit === 'usd') return `${formatUsdShort(p.current)} / ${formatUsdShort(p.target)}`;
  if (unit === 'months') return `${p.current} / ${p.target} 个月`;
  // 问的是"有没有过"的那几条（目标恒为 1），报 0/1 次比报"还没有过"更难读
  if (p.target === 1) return p.met ? '已经有过' : '还没有过';
  return `${p.current} / ${p.target} 次`;
};

// ---------------------------------------------------------------------------
// 上墙的日子
// ---------------------------------------------------------------------------

/**
 * 上墙的日子。
 *
 * ⚠️ 措辞是「上墙」不是「达成于」，这两个在补发时**不是同一天**：
 *    老档第一次加载时，那些早就做到的事是同一天一起挂上来的。
 *    （时刻的语义见 types/achievements.ts 的 achievementUnlockedAt。）
 * 解析不出日期时返回 null —— 宁可这一行不出现，也不要印出 NaN。
 */
const mountedOn = (iso: ISODateTime | null): string | null => {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateKeyCN(localDateKey(d));
};
