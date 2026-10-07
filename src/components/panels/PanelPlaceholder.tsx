import { PanelShell } from '@/components/panels/PanelShell';
import { getPanel } from '@/lib/panels';
import type { PanelKey } from '@/lib/panels';

interface PanelPlaceholderProps {
  panel: PanelKey | null;
  onClose: () => void;
}

/**
 * 尚未填充内容的面板。
 *
 * Phase 2 收官，六块面板各有归属，Phase 5 又补上了第七块（成就陈列馆），
 * **这里已经没有任何一个面板会走进来** —— 它退化成 App.tsx 路由里那个
 * `else` 的兜底：只可能被一个非法的 panel key 命中，而那个 key 在 `PANELS`
 * 里并不存在。
 *
 * 保留它而不是删掉，是因为"全都接管了"这件事本身需要一份可核对的证据 ——
 * 下面那张表就是证据：每多一行"已由…接管"，就少一个能用"还没做"搪塞的角落。
 */

export function PanelPlaceholder({ panel, onClose }: PanelPlaceholderProps) {
  if (!panel) return null;

  return (
    <PanelShell panel={panel} onClose={onClose}>
      <StubBody panel={panel} />
    </PanelShell>
  );
}

const NEXT_UP: Record<PanelKey, string[]> = {
  bounty: ['已由悬赏中枢接管（四联：悬赏板 / 进行中 / 待议 / 灵感）'],
  dailies: ['已由日常面板接管（两栏：每日任务 / 每周任务）'],
  journal: ['已由成功日记查看器接管'],
  vault: ['已由金库与职业履历接管'],
  network: ['已由关系图谱接管（含智囊团全局检索）'],
  attributes: ['已由人物属性面板接管（玻璃幕墙入口）'],
  archive: ['已由档案馆接管'],
  hall: ['已由成就陈列馆接管（六栏徽记，未解锁的给线索，锁着的给剪影）'],
  sanctuary: ['已由愿景圣殿接管（五大终极目标 / 至高科技树 / 全通关综合进度）'],
  settings: ['已由控制室接管（AI 服务总线 / 存档安全 / 危险区）'],
  // ↑ 十块全绿。如果这里又出现一条"待填"，说明某个面板的接管回退了
};

function StubBody({ panel }: { panel: PanelKey }) {
  const meta = getPanel(panel);
  return (
    <div className="mt-4">
      <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-3.5">
        <div className="flex items-center gap-2 text-[11px] tracking-wider text-amber-400/80">
          <span className="h-1.5 w-1.5 animate-dot-pulse rounded-full bg-amber-400" />
          此壳已就位，内容待填
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {NEXT_UP[meta.key].map((line) => (
            <li key={line} className="flex gap-2 text-[12px] leading-relaxed text-white/60">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-white/25" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
