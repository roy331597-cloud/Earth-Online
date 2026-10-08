import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelShell } from '@/components/panels/PanelShell';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { pingDeepSeek } from '@/ai/gateway';
import { cn } from '@/lib/cn';
import type { PanelKey } from '@/lib/panels';
import {
  discardBackup,
  looksLikeSaveFile,
  parseSaveFile,
  type RescueSnapshot,
} from '@/lib/saveFile';
import {
  clearApiKey,
  hasApiKey,
  isWellFormedApiKey,
  maskApiKey,
  readApiKey,
  redact,
  writeApiKey,
} from '@/lib/secretStore';
import { evolutionRevealed } from '@/lib/selectors';
import { resolveSyncEnv } from '@/lib/syncClient';
import { syncAllowed } from '@/lib/syncCrypto';
import { applyMockMode } from '@/store/agentRuntime';
import type { SyncPhase } from '@/store/useEarthOnlineStore';
import { useEarthOnlineStore, useSave } from '@/store/useEarthOnlineStore';
import type { EarthOnlineState } from '@/types';

interface SettingsPanelProps {
  panel: PanelKey;
  onClose: () => void;
}

/**
 * 控制室。
 *
 * 这个应用别的地方都在演 —— 场景、题记、判官的语气。**这一页不演。**
 * 它要回答四个玩家迟早会问的问题，而这四个问题在别处都会被含糊过去：
 *
 *   ① 「AI 到底接没接上？」→ 密钥在不在、走的是哪条轨道、按下去有没有人应。
 *   ② 「我的东西存在哪？」→ 导出、导入、以及一份坏掉时能救回来的备份。
 *   ③ 「换手机怎么办？」→ 云同步：口令加密的云存档、两边的读数、
 *      以及口令忘掉以后会发生什么（说死：谁也没法）。
 *   ④ 「怎么从头再来？」→ 两个带二次确认的按钮，别的什么都不给。
 *
 * 它**不回答**"花了多少钱"。账在记（`ai.usage`），但这一页不出账单 ——
 * 一盏灯告诉你的应该是"房间里有没有人"，不是"电费多少"。
 * 云同步那一节同样不报"传了多少流量"—— 它只报"两边现在各是哪一版"。
 *
 * 标题没有叫「系统设置」：这个应用里没有"系统"。它是一间控制室 ——
 * 门口那盏灯亮着，说明后台真的有人在跑。
 *
 * ⚠️ 密钥与口令的纪律（PO 明令，也是本文件最要紧的一条）：
 *     - 明文**只存在于输入框的受控值里**，一旦落库立刻清空该 state；
 *     - 界面上回显的一律是 `maskApiKey()` 的产物，没有任何一处读明文；
 *     - 任何进存档 / 进日志的字符串先过 `redact()`；
 *     - 云同步的口令更进一步：它**从不落盘、永不上路** —— 上路的只有
 *       派生物（AES 密钥 + 访问令牌），输入框用完即清，界面上没有任何回显。
 */
export function SettingsPanel({ panel, onClose }: SettingsPanelProps) {
  return (
    <PanelShell panel={panel} onClose={onClose}>
      <AiBusSection />
      <div className="my-5 h-px bg-white/10" />
      <SaveSafetySection />
      <div className="my-5 h-px bg-white/10" />
      <SyncSection />
      <div className="my-5 h-px bg-white/10" />
      <PeekSection />
      <div className="my-5 h-px bg-white/10" />
      <DangerSection />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// 二之一 · 窥视（只给"我还没走到那一步，但我想看看它长什么样"）
//
// 档案馆里那棵进化树平时蒙在雾里，得靠游戏里真攒够里程碑才散。
// 要评审一屏看不到的东西，从前只有一条路：在控制台敲 `__earthonline.reveal()`，
// 而那条路**会写进存档**（`revealed` 是单向的，写进去就回不来了）。
// 为了看一眼，代价是这个档以后再也看不到雾散那一刻 —— 太贵了。
//
// 所以这里开一扇窗：会话内、不落盘、不改存档。关掉开关，雾原样回来。
// 它与「AI 总线」那一节同属一件事 —— 让玩家知道**现在到底是什么状态**，
// 而不是把一件其实没发生的事演给他看。
// ---------------------------------------------------------------------------

function PeekSection() {
  const revealed = useEarthOnlineStore((s) => evolutionRevealed(s.save));
  const fogOverride = useEarthOnlineStore((s) => s.fogOverride);
  const setFogOverride = useEarthOnlineStore((s) => s.setFogOverride);
  // 雾已经散了的话，这个开关什么也不做 —— 那时它就是"开着的"，
  // 不该摆成一个可以拨的样子（能拨而没反应的控件比没有更让人困惑）
  const on = revealed || fogOverride;

  return (
    <section className="pb-2">
      <SectionLabel>窥视</SectionLabel>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={revealed}
        onClick={() => setFogOverride(!fogOverride)}
        className={cn(
          'mt-2.5 flex w-full items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-3 text-left',
          revealed ? 'cursor-default opacity-60' : 'glass-hover',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] text-white/75">进化树迷雾</span>
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-white/35">
            {revealed
              ? '它已经显形了 —— 这一格现在没有用处。'
              : '隔着玻璃看一眼那棵树。不写进存档，关掉开关雾就回来。'}
          </span>
        </span>
        <span
          className={cn(
            'relative h-[1.35rem] w-[2.5rem] shrink-0 rounded-full transition-colors duration-300 ease-cinematic',
            on ? 'bg-abyss-500/80' : 'bg-white/15',
          )}
        >
          <span
            className={cn(
              'absolute top-[2px] h-[1.1rem] w-[1.1rem] rounded-full bg-white shadow-sm transition-all duration-300 ease-cinematic',
              on ? 'left-[1.32rem]' : 'left-[2px]',
            )}
          />
        </span>
      </button>

      {fogOverride && !revealed && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-abyss-300/70">
          现在去档案馆，能看到那六条分支与 22 个节点此刻的样子。
          那上面会挂一条带子写着「窥视中」—— 那条带子是给你自己看的，
          免得改天忘了这回事，把"我明明看过"当成一个说不通的记忆。
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 一 · AI 服务总线
// ---------------------------------------------------------------------------

function AiBusSection() {
  const save = useSave();
  const mutate = useEarthOnlineStore((s) => s.mutate);
  const beginAgentCall = useEarthOnlineStore((s) => s.beginAgentCall);
  const endAgentCall = useEarthOnlineStore((s) => s.endAgentCall);

  const ai = save.ai;
  /** 明文只活在这个 state 里，且只在"正在填入"的那一小段时间 */
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  const stored = hasApiKey();

  const saveKey = () => {
    const key = draft.trim();
    if (key.length === 0) {
      setHint('输入框是空的。要走 Mock 轨道的话，直接把下面的开关打开就行。');
      return;
    }
    if (!isWellFormedApiKey(key)) {
      setHint('这个形状不像 DeepSeek 的密钥 —— 它应该以 sk- 开头，长度在 20 以上。');
      return;
    }
    writeApiKey(key);
    setDraft(''); // 明文到此为止，界面上不再有任何地方留着它
    setReveal(false);
    setHint('已保存到独立的密钥存储区。它不在存档里，导出存档时也不会被带出去。');
    mutate((s) => ({ ...s, ai: { ...s.ai, configured: true, provider: 'deepseek' } }));
  };

  const forgetKey = () => {
    clearApiKey();
    setDraft('');
    setHint('已清除。真实请求不会再发出去了。');
    mutate((s) => ({ ...s, ai: { ...s.ai, configured: false, provider: 'mock', mockModeEnabled: true } }));
  };

  const testConnection = useCallback(async () => {
    const key = draft.trim().length > 0 ? draft.trim() : readApiKey();
    if (key === null || key.length === 0) {
      setHint('还没有可用的密钥。先把它填进去，再点测试。');
      return;
    }

    // 遮罩上要显示"这一刻谁在工作" —— 连通探针不是一个 Agent，所以不假借任何名字
    const activityId = beginAgentCall({
      agentId: 'agent_gateway_probe',
      name: '网关 · 连通探针',
      label: '正在与 DeepSeek 握手…',
    });
    setPinging(true);
    setHint(null);

    try {
      const result = await pingDeepSeek({ baseUrl: ai.baseUrl, apiKey: key });
      const message = redact(result.message);
      // 名单里有没有我们**实际要用的那个**模型，比"有几个可用"更要紧：
      // 名字写错时，一次真调用会在战斗中才失败，而握手这里就能先看见。
      setHint(
        result.ok
          ? `DeepSeek 响应正常 · ${result.latencyMs}ms${
              result.models.length > 0
                ? result.models.includes(ai.model)
                  ? `　含 ${ai.model}`
                  : `　⚠ 可用列表里没有 ${ai.model}`
                : ''
            }`
          : `测试失败：${message}`,
      );
      mutate((s) => ({
        ...s,
        ai: {
          ...s.ai,
          lastHealthCheck: { ok: result.ok, at: new Date().toISOString(), message },
        },
      }));
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err));
      setHint(`测试失败：${message}`);
      mutate((s) => ({
        ...s,
        ai: { ...s.ai, lastHealthCheck: { ok: false, at: new Date().toISOString(), message } },
      }));
    } finally {
      endAgentCall(activityId);
      setPinging(false);
    }
  }, [draft, ai.baseUrl, ai.model, beginAgentCall, endAgentCall, mutate]);

  // ⚠️ 与提示条上那个「先切到本地轨道」按钮共用一份定义（store/agentRuntime.ts）。
  //    各写一份的话，两个"离线模式"迟早会在 `provider` 这个字段上分岔 ——
  //    而只改 mockModeEnabled 会留下 provider:'mock' 的组合，那时界面显示"已接上真身"，
  //    实际上每一次调用仍然被闸门 ② 拦下（见 bus.ts）。
  const setMockMode = (on: boolean) => {
    mutate((s) => applyMockMode(s, on));
  };

  const usingReal = !ai.mockModeEnabled && ai.provider !== 'mock';

  return (
    <section className="pt-3.5">
      <SectionLabel>AI 服务总线</SectionLabel>

      {/* 状态条：一句话说清"现在按下生成按钮，会发生什么" */}
      <div
        className={cn(
          'mt-2.5 flex items-center gap-2.5 rounded-xl border px-3.5 py-3',
          usingReal
            ? 'border-amber-400/30 bg-amber-400/[0.07]'
            : 'border-abyss-500/30 bg-abyss-500/[0.08]',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            usingReal ? 'animate-dot-pulse bg-amber-400' : 'bg-abyss-300/70',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] tracking-wide text-white/85">
            {usingReal ? '真实轨道' : '本地轨道'}
          </span>
          <span className="prose-cinematic mt-0.5 block text-[11px] text-white/45">
            {usingReal
              ? `任务由 DeepSeek 生成 · ${ai.model}`
              : '任务与文案由本地模板生成。不联网、不花钱，随时可用。'}
          </span>
        </span>
        {ai.circuitBreaker.open && (
          <span className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-white/55">
            已熔断
          </span>
        )}
      </div>

      {/* Mock / Real 开关 */}
      <button
        type="button"
        role="switch"
        aria-checked={usingReal}
        onClick={() => setMockMode(usingReal)}
        className="glass-hover mt-2 flex w-full items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] text-white/75">使用真实 API</span>
          <span className="mt-0.5 block text-[10.5px] text-white/35">
            关掉它 = 走本地轨道。没有密钥时它会自动关着，这是设计，不是故障。
          </span>
        </span>
        <span
          className={cn(
            'relative h-[1.35rem] w-[2.5rem] shrink-0 rounded-full transition-colors duration-300 ease-cinematic',
            usingReal ? 'bg-amber-400/80' : 'bg-white/15',
          )}
        >
          <span
            className={cn(
              'absolute top-[2px] h-[1.1rem] w-[1.1rem] rounded-full bg-white shadow-sm transition-all duration-300 ease-cinematic',
              usingReal ? 'left-[1.32rem]' : 'left-[2px]',
            )}
          />
        </span>
      </button>

      {/* —— 密钥 —— */}
      <div className="mt-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] tracking-wide text-white/55">DeepSeek API Key</span>
          <span className="numeric ml-auto text-[10.5px] text-white/35">
            {stored ? maskApiKey(readApiKey()) : '未配置'}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={stored ? 'sk-••••（要换一把就填新的）' : 'sk-...'}
            className="numeric min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? '隐藏密钥' : '显示密钥'}
            className="glass-pill shrink-0 px-2.5 py-2 text-[10.5px] text-white/50 transition hover:text-white"
          >
            {reveal ? '藏起' : '看一眼'}
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={saveKey}
            className="flex-1 rounded-lg border border-amber-400/45 bg-amber-400/[0.12] py-2 text-[11.5px] text-amber-100 transition-all duration-300 ease-cinematic hover:bg-amber-400/20 active:scale-[0.99]"
          >
            保存
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={pinging}
            className={cn(
              'flex-1 rounded-lg border py-2 text-[11.5px] transition-all duration-300 ease-cinematic',
              pinging
                ? 'cursor-wait border-white/15 text-white/35'
                : 'border-white/20 bg-white/[0.05] text-white/75 hover:border-abyss-400/45 hover:text-white',
            )}
          >
            {pinging ? '正在握手…' : '测试连接'}
          </button>
          {stored && (
            <button
              type="button"
              onClick={forgetKey}
              className="shrink-0 rounded-lg border border-white/[0.12] px-3 py-2 text-[11.5px] text-white/45 transition hover:border-white/25 hover:text-white/75"
            >
              清除
            </button>
          )}
        </div>

        {hint && (
          <p className="prose-cinematic mt-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-white/60">
            {hint}
          </p>
        )}

        {ai.lastHealthCheck && !hint && (
          <p className="mt-2 text-[10.5px] text-white/35">
            上次测试 {ai.lastHealthCheck.at.slice(0, 16).replace('T', ' ')} ·{' '}
            <span className={ai.lastHealthCheck.ok ? 'text-abyss-300/80' : 'text-white/45'}>
              {ai.lastHealthCheck.ok ? '正常' : '失败'}
            </span>
          </p>
        )}

        <p className="mt-2 text-[10.5px] leading-relaxed text-white/30">
          密钥存在一个独立的存储槽里，<span className="text-white/50">不进存档</span>。
          导出存档时不会被带走，调用日志里的任何痕迹在落盘前都会被打码。
        </p>
      </div>

      {/*
        ⚠️ 这里**曾经有一块「本月用量」**：花了多少钱、烧了多少 token、上限进度条、
        三档刹车。PO 裁定撤下 —— 控制室是玩家的房间，不是账单页。

        撤得有道理，而且不只是审美：一块计费面板会把这一页读成「账户后台」，
        而这一页的立场恰恰相反 —— 它只回答"门锁好没有"。
        钱的账照记（`ai.usage` 一字未动，熔断仍按 `budgetUsdCents` 走），
        只是不摆在这里。**记账与露账是两件事。**

        档位 [500, 2000, 5000] 美分保留在 state 里作内部刹车（PO 已批准该设定）。
        Phase 4 若要在别处开一扇窗，读的是同一份 `ai.usage`，不必重新接线。
      */}

      {/* 花名册留下：它报的是"后台有几个人、谁一直在被叫"，
          不是"花了多少钱"—— 那是编制表，不是账单。 */}
      <AgentRoster />
    </section>
  );
}

/**
 * 花名册。
 *
 * 它是这个面板"说实话"最直接的一处：你能看见后台一共雇了几个人、
 * 谁一直在被叫、谁从来没被叫过。不是装饰 —— 它是 Phase 4 调 prompt 时
 * 唯一的观测面（谁的成功率在掉，一眼就能看出来）。
 */
function AgentRoster() {
  const save = useSave();
  const records = save.agents.records;

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[10.5px] tracking-[0.16em] text-white/45">后台花名册</span>
        <span className="numeric ml-auto text-[10px] text-white/30">
          {records.length} 人 · 累计调用 {records.reduce((n, r) => n + r.stats.invocations, 0)} 次
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {records.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                r.status === 'active' ? 'bg-abyss-300/70' : 'bg-white/20',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/70">
              {r.profile.displayName}
            </span>
            <span className="shrink-0 text-[9.5px] text-white/30">{KIND_LABELS[r.kind]}</span>
            <span className="numeric w-8 shrink-0 text-right text-[10px] text-white/40">
              {r.stats.invocations}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  dispatcher: '调度',
  class: '职业',
  blueprints: '铸造',
  network_advisor: '智囊',
  arbiter: '判官',
  chain_reviewer: '审核',
};

// ---------------------------------------------------------------------------
// 二 · 存档安全
// ---------------------------------------------------------------------------

function SaveSafetySection() {
  const save = useSave();
  const exportSave = useEarthOnlineStore((s) => s.exportSave);
  const snapshotToBackup = useEarthOnlineStore((s) => s.snapshotToBackup);
  const replaceSave = useEarthOnlineStore((s) => s.replaceSave);
  const rescue = useEarthOnlineStore((s) => s.rescue);
  const loadNote = useEarthOnlineStore((s) => s.loadNote);

  const [bump, setBump] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** 已经校验通过、等着玩家点头的那一份。它是 ImportOutcome 的成功分支 */
  const [pending, setPending] = useState<{ state: EarthOnlineState; notes: string[]; name: string } | null>(
    null,
  );

  // 每次 bump 重读一次磁盘状态。它只有一个来源（backup 键），所以不必轮询
  const [snapshot, setSnapshot] = useState<RescueSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(useEarthOnlineStore.getState().rescueState());
  }, [bump]);

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!looksLikeSaveFile(file.name)) {
      setMessage(`「${file.name}」看起来不是存档文件 —— 存档的扩展名是 .json。`);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage('这个文件读不出来。它可能已经不在了，或者没有读取权限。');
      return;
    }

    const outcome = parseSaveFile(text, new Date());
    if (!outcome.ok) {
      setMessage(outcome.reason);
      return;
    }

    setMessage(null);
    setPending({ state: outcome.state, notes: outcome.notes, name: file.name });
  }, []);

  const commitImport = () => {
    if (!pending) return;
    // 导入前拍一张快照当保险。**但只在没有备份的时候拍** ——
    // 覆盖掉一份还能救的残损存档，比不拍快照糟得多。
    const current = useEarthOnlineStore.getState().rescueState();
    if (!current.hasBackup) snapshotToBackup();

    replaceSave(pending.state);
    setBump((n) => n + 1);
    setMessage(
      [`已导入「${pending.name}」。`, ...pending.notes].join(' ') +
        (current.hasBackup ? '' : '（导入前的存档已留了一份快照）'),
    );
    setPending(null);
  };

  const doExport = () => {
    const ok = exportSave(new Date());
    setMessage(
      ok
        ? '已导出。文件里带一份可读的成功日记，即使没有这个应用也能打开。'
        : '当前环境不支持直接下载 —— 试着换一个浏览器，或者从应用内复制。',
    );
  };

  return (
    <section>
      <SectionLabel>存档安全</SectionLabel>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={doExport}
          className="flex-1 rounded-lg border border-white/20 bg-white/[0.05] py-2.5 text-[11.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-amber-400/45 hover:text-white active:scale-[0.99]"
        >
          导出存档
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-lg border border-white/20 bg-white/[0.05] py-2.5 text-[11.5px] text-white/80 transition-all duration-300 ease-cinematic hover:border-abyss-400/45 hover:text-white active:scale-[0.99]"
        >
          导入存档
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.eosave,application/json"
          className="hidden"
          onChange={(e) => {
            void takeFile(e.target.files?.[0]);
            e.target.value = ''; // 同一个文件连选两次也要能触发
          }}
        />
      </div>

      {/* 拖拽区。手机上没有拖拽，所以它同时也是一个说明 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void takeFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'mt-2 rounded-xl border border-dashed p-3.5 text-center transition-colors duration-300',
          dragging
            ? 'border-amber-400/55 bg-amber-400/[0.08]'
            : 'border-white/[0.12] bg-white/[0.02]',
        )}
      >
        <p className="prose-cinematic text-[11.5px] leading-relaxed text-white/45">
          {dragging ? '松手就导入' : '把存档文件拖到这里，或者点上面的「导入存档」'}
        </p>
        <p className="mt-1 text-[10px] text-white/25">
          导入会整体覆盖当前进度，所以会先问你一次。
        </p>
      </div>

      {message && (
        <p className="prose-cinematic mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-white/60">
          {message}
        </p>
      )}

      <ImportConfirm
        pending={pending}
        onCancel={() => setPending(null)}
        onConfirm={commitImport}
      />

      {/* —— 天灾急救箱 —— */}
      <div className="mt-3.5 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] tracking-[0.16em] text-white/45">天灾急救箱</span>
          <span
            className={cn(
              'ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px]',
              snapshot?.hasBackup
                ? 'border-amber-400/40 bg-amber-400/[0.12] text-amber-100'
                : 'border-white/[0.12] text-white/35',
            )}
          >
            {snapshot?.hasBackup ? '有一份备份' : '空'}
          </span>
        </div>

        {snapshot?.hasBackup ? (
          <>
            <p className="prose-cinematic mt-2 text-[11.5px] leading-relaxed text-white/60">
              这里躺着一份 {Math.max(1, Math.round(snapshot.bytes / 1024))} KB 的记录
              {snapshot.hint ? `（${snapshot.hint.slice(0, 16).replace('T', ' ')} 写下）` : ''}。
              {loadNote ? ` 本次开机时的说明：${loadNote}` : ' 它可能来自一次损坏、一次版本不兼容，或一次导入前的自动留底。'}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessage(rescue(new Date()));
                  setBump((n) => n + 1);
                }}
                className="flex-1 rounded-lg border border-amber-400/45 bg-amber-400/[0.12] py-2 text-[11.5px] text-amber-100 transition-all duration-300 ease-cinematic hover:bg-amber-400/20 active:scale-[0.99]"
              >
                试着恢复
              </button>
              <button
                type="button"
                onClick={() => {
                  discardBackup();
                  setBump((n) => n + 1);
                  setMessage('已放弃那份备份。');
                }}
                className="shrink-0 rounded-lg border border-white/[0.12] px-3 py-2 text-[11.5px] text-white/45 transition hover:border-white/25 hover:text-white/75"
              >
                放弃它
              </button>
            </div>
          </>
        ) : (
          <p className="prose-cinematic mt-2 text-[11.5px] leading-relaxed text-white/40">
            空着是好事。存档损坏、版本不兼容、被手工改坏的时候，
            残损的数据会自动转存到这里，而应用照常启动 —— 永远不会只给你一片白屏。
          </p>
        )}
      </div>

      {/* —— 存档本身 —— */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-white/30">
        <span className="numeric">v{save.meta.schemaVersion} · 修订 {save.meta.revision}</span>
        <span>槽位 {save.meta.slot}</span>
        <span className="numeric">更新于 {save.meta.updatedAt.slice(0, 16).replace('T', ' ')}</span>
        <span className="numeric">迁移 {save.meta.migrationHistory.length} 次</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 二之二 · 云同步（Phase 6）
// ---------------------------------------------------------------------------

/**
 * 云同步。它站在两个问题中间：
 *
 *   ① 「存档能不能不只有一台设备有？」—— 可以。口令在这台设备上把整份
 *      存档加密，然后送上云；换手机输一次口令，就接着过。
 *   ② 「那服务器看得见吗？」—— 看不见。上去的只有密文；口令从没离开过
 *      这台设备，服务器里存的是一段无法反推口令的验证值。
 *
 * 所以这一节的主视觉不是「同步中…」那个转圈，而是一块**读数**：
 * 上次同步是什么时候、云端是本机第几份。以及一句说死的话 ——
 * 口令丢了，云端那份就永远打不开；底牌始终是「导出存档」那个文件。
 *
 * 口令的纪律与上面 AI 总线那一节同款：明文只活在受控输入里，用过立刻清空；
 * 界面上没有任何地方回显它 —— 服务器上也没有可回显的东西。
 *
 * 这一节不出账单、不出调用记录 —— 控制室是玩家的房间，不是运维台。
 */

const PHASE_LABEL: Record<SyncPhase, string> = {
  off: '未启用',
  idle: '已接入',
  syncing: '正在同步…',
  offline: '离线 —— 等网络或下次开机再试',
  error: '需要看一眼',
};

const PHASE_DOT: Record<SyncPhase, string> = {
  off: 'bg-white/20',
  idle: 'bg-abyss-300/70',
  syncing: 'animate-dot-pulse bg-abyss-300/70',
  offline: 'bg-white/25',
  error: 'bg-amber-400',
};

function SyncSection() {
  const save = useSave();
  const sync = useEarthOnlineStore((s) => s.sync);
  const syncEnable = useEarthOnlineStore((s) => s.syncEnable);
  const syncPush = useEarthOnlineStore((s) => s.syncPush);
  const syncPull = useEarthOnlineStore((s) => s.syncPull);
  const syncChangePassphrase = useEarthOnlineStore((s) => s.syncChangePassphrase);
  const syncClearCloud = useEarthOnlineStore((s) => s.syncClearCloud);
  const syncDisable = useEarthOnlineStore((s) => s.syncDisable);
  const syncProbeServer = useEarthOnlineStore((s) => s.syncProbeServer);

  /** 口令草稿只活在这两个 state 里，用后即清（启用 / 接入用） */
  const [draft, setDraft] = useState('');
  const [repeat, setRepeat] = useState('');
  /** 更换口令的子表单 */
  const [changing, setChanging] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newRepeat, setNewRepeat] = useState('');

  /** 服务器上有没有存档 —— 决定按钮写「启用」还是「接入」 */
  const [probe, setProbe] = useState<
    'probing' | 'free' | 'claimed' | 'unreachable' | 'unsupported' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ask, setAsk] = useState<'pull' | 'clear' | 'disable' | null>(null);

  const allowed = syncAllowed(resolveSyncEnv());
  const working = busy || sync.phase === 'syncing';

  const at = (iso: string | null): string =>
    iso === null ? '—' : iso.slice(0, 16).replace('T', ' ');

  const runProbe = useCallback(async () => {
    setProbe('probing');
    setProbe(await syncProbeServer());
  }, [syncProbeServer]);

  // 没启用时先问一句服务器：上面有没有存档。环境不允许时连问都不问 ——
  // 那个地址下这台服务器现在跟这个页面无关（下面会解释为什么）。
  useEffect(() => {
    if (sync.enabled || !allowed) return;
    let alive = true;
    setProbe('probing');
    void syncProbeServer().then((p) => {
      if (alive) setProbe(p);
    });
    return () => {
      alive = false;
    };
  }, [sync.enabled, allowed, syncProbeServer]);

  const runEnable = async () => {
    const pass = draft.trim();
    if (pass.length < 8) {
      setHint('口令至少 8 位 —— 它要顶住的是别人拿着密文慢慢猜。');
      return;
    }
    if (probe === 'free' && pass !== repeat.trim()) {
      setHint('两遍输入的口令不一样。');
      return;
    }
    setBusy(true);
    setHint(null);
    const result = await syncEnable(pass);
    setBusy(false);
    if (result.ok) {
      setDraft(''); // 口令到此为止 —— 界面上不再留着它
      setRepeat('');
    }
    setHint(result.message);
  };

  const runPush = async () => {
    setBusy(true);
    setHint(null);
    const result = await syncPush({ explicit: true });
    setBusy(false);
    setHint(result.message);
  };

  const runPull = async () => {
    setAsk(null);
    setBusy(true);
    setHint(null);
    const result = await syncPull();
    setBusy(false);
    setHint(result.message);
  };

  const runChange = async () => {
    const pass = newPass.trim();
    if (pass.length < 8) {
      setHint('新口令至少 8 位。');
      return;
    }
    if (pass !== newRepeat.trim()) {
      setHint('两遍输入的新口令不一样。');
      return;
    }
    setBusy(true);
    setHint(null);
    const result = await syncChangePassphrase(pass);
    setBusy(false);
    if (result.ok) {
      setNewPass('');
      setNewRepeat('');
      setChanging(false);
    }
    setHint(result.message);
  };

  const runClear = async () => {
    setAsk(null);
    setBusy(true);
    setHint(null);
    const result = await syncClearCloud();
    setBusy(false);
    setHint(result.message);
  };

  const runDisable = () => {
    setAsk(null);
    setChanging(false);
    syncDisable();
    setHint('已停用。云端那份原样留着 —— 用当时的口令还能再接回来。');
  };

  const fieldClass =
    'min-w-0 w-full rounded-xl border border-white/[0.12] bg-ink-950/50 px-3 py-2 text-[11.5px] text-white placeholder:text-white/25 focus:border-amber-400/45 focus:outline-none focus:ring-1 focus:ring-amber-400/30';
  const amberBtn =
    'rounded-lg border border-amber-400/45 bg-amber-400/[0.12] py-2 text-[11.5px] text-amber-100 transition-all duration-300 ease-cinematic hover:bg-amber-400/20 active:scale-[0.99] disabled:cursor-wait disabled:opacity-50';
  const quietBtn =
    'shrink-0 rounded-lg border border-white/[0.12] px-3 py-2 text-[11.5px] text-white/45 transition hover:border-white/25 hover:text-white/75 disabled:cursor-wait disabled:opacity-50';
  const plainBtn =
    'flex-1 rounded-lg border border-white/20 bg-white/[0.05] py-2 text-[11.5px] text-white/75 transition-all duration-300 ease-cinematic hover:border-abyss-400/45 hover:text-white active:scale-[0.99] disabled:cursor-wait disabled:opacity-50';

  return (
    <section>
      <SectionLabel>云同步</SectionLabel>

      {!allowed ? (
        /* —— 环境不允许：整段是停的，把原因说清楚（它和手机安装是同一道门槛） —— */
        <div className="mt-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-3">
          <p className="text-[11.5px] text-white/75">这个地址下它整段是停的</p>
          <p className="prose-cinematic mt-1 text-[10.5px] leading-relaxed text-white/45">
            当前页不是 HTTPS（也不是本机 localhost）—— 浏览器只在安全地址下把加密能力交给网页，
            这是浏览器的规矩，不是这个应用挑食。手机要把它装到桌面上，同样只认 HTTPS ——
            两件事正好挡在同一道门槛上。换上 https 域名再回来，这一节就亮了。
          </p>
        </div>
      ) : sync.enabled ? (
        /* —— 已启用：读数 + 手动按钮 + 危险一点的按钮 —— */
        <>
          <div className="mt-2.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PHASE_DOT[sync.phase])} />
              <span className="min-w-0 flex-1 truncate text-[12px] tracking-wide text-white/85">
                {PHASE_LABEL[sync.phase]}
              </span>
              <span className="numeric shrink-0 text-[10.5px] text-white/35">
                {sync.lastSyncAt === null ? '还没同步过' : `上次同步 ${at(sync.lastSyncAt)}`}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-white/30">
              <span className="numeric">云端修订 {sync.cloudRevision ?? '—'}</span>
              <span className="numeric">本机修订 {save.meta.revision}</span>
              <span className="numeric">云端更新于 {at(sync.cloudUpdatedAt)}</span>
            </div>
          </div>

          {sync.lastError !== null && (
            <p className="prose-cinematic mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
              {sync.lastError}
            </p>
          )}

          {sync.offer !== null && (
            <p className="prose-cinematic mt-2 text-[10.5px] leading-relaxed text-amber-100/70">
              云端有一份与本机对不上的（下面那条横幅在等你）。「立即推送」= 以本机为准把它盖掉；
              想让云端赢，用横幅上的「拉取到本机」。
            </p>
          )}

          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={() => void runPush()} disabled={working} className={plainBtn}>
              立即推送
            </button>
            <button type="button" onClick={() => setAsk('pull')} disabled={working} className={plainBtn}>
              从云端拉取
            </button>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setChanging((v) => !v);
                setHint(null);
              }}
              className={cn(quietBtn, 'flex-1')}
            >
              更换口令
            </button>
            <button type="button" onClick={() => setAsk('disable')} className={cn(quietBtn, 'flex-1')}>
              停用同步
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAsk('clear')}
            className="mt-2 w-full rounded-lg border border-white/[0.14] bg-white/[0.03] py-2 text-[11.5px] text-white/45 transition-all duration-300 ease-cinematic hover:border-red-400/40 hover:text-white/80 active:scale-[0.99]"
          >
            清除云端存档
          </button>

          {changing && (
            <div className="mt-2.5 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5">
              <p className="text-[11px] tracking-wide text-white/60">换一把新口令</p>
              <p className="prose-cinematic mt-1 text-[10.5px] leading-relaxed text-white/35">
                不用输旧口令 —— 这台设备手上的旧钥匙还能用最后一次，正是它去把云上那把锁换掉。
                换完之后，别的设备要用新口令重新接入一次（它们手上那把旧的会被服务器拒掉）。
                中途失败了再点一次就好：整个过程拿本机存档做底子，重试不会把任何一边弄丢。
              </p>
              <input
                type="password"
                value={newPass}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="新口令（至少 8 位）"
                className={cn(fieldClass, 'mt-2')}
              />
              <input
                type="password"
                value={newRepeat}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setNewRepeat(e.target.value)}
                placeholder="再输一遍"
                className={cn(fieldClass, 'mt-2')}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void runChange()}
                  disabled={working}
                  className={cn(amberBtn, 'flex-1')}
                >
                  {working ? '正在换…' : '换'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChanging(false);
                    setNewPass('');
                    setNewRepeat('');
                  }}
                  className={quietBtn}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* —— 未启用：先问服务器一句，再决定按钮写「启用」还是「接入」 —— */
        <div className="mt-2.5 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5">
          {probe === null || probe === 'probing' ? (
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 shrink-0 animate-dot-pulse rounded-full bg-abyss-300/70" />
              <span className="text-[11.5px] text-white/60">正在问服务器：上面有没有存档……</span>
            </div>
          ) : probe === 'unreachable' || probe === 'unsupported' ? (
            <>
              <p className="text-[11.5px] text-white/70">同步服务这会儿没有应答</p>
              <p className="prose-cinematic mt-1 text-[10.5px] leading-relaxed text-white/40">
                可能是服务器那边还没起，也可能是这台设备现在连不上网。
                它不会替你反复敲门 —— 想再问一次，点下面。
              </p>
              <button type="button" onClick={() => void runProbe()} className={cn(quietBtn, 'mt-2')}>
                再问一次
              </button>
            </>
          ) : probe === 'free' ? (
            <>
              <p className="text-[11.5px] text-white/70">给云上那份设一个口令</p>
              <p className="prose-cinematic mt-1 text-[10.5px] leading-relaxed text-white/40">
                服务器上还没有存档 —— 你就是它的第一位玩家。口令在这台设备上把整份存档加密，
                然后在云上换回一段谁也读不了的东西。口令不会存进任何地方，丢了没法找回。
              </p>
              <input
                type="password"
                value={draft}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="口令（至少 8 位）"
                className={cn(fieldClass, 'mt-2')}
              />
              <input
                type="password"
                value={repeat}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setRepeat(e.target.value)}
                placeholder="再输一遍"
                className={cn(fieldClass, 'mt-2')}
              />
              <button
                type="button"
                onClick={() => void runEnable()}
                disabled={working}
                className={cn(amberBtn, 'mt-2 w-full')}
              >
                {working ? '正在启用…' : '启用云同步'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[11.5px] text-white/70">接入服务器上已有的存档</p>
              <p className="prose-cinematic mt-1 text-[10.5px] leading-relaxed text-white/40">
                云上已经有一份了（多半是你自己在别的设备上推的）。用当时设的那个口令接上它 ——
                接上之后如果云端与本机对不上，它不会擅自盖任何一边，会先问你。
              </p>
              <input
                type="password"
                value={draft}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="当时设的口令"
                className={cn(fieldClass, 'mt-2')}
              />
              <button
                type="button"
                onClick={() => void runEnable()}
                disabled={working}
                className={cn(amberBtn, 'mt-2 w-full')}
              >
                {working ? '正在接入…' : '接入云同步'}
              </button>
            </>
          )}
        </div>
      )}

      {hint !== null && (
        <p className="prose-cinematic mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-white/60">
          {hint}
        </p>
      )}

      {/* 诚实文案块：这一节存在的理由，以及它全部的代价 */}
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
        上云的只有密文：整份存档在这里加密之后才出门，服务器读不了里面的任何东西
        （连你有几篇日记都不知道）。API Key 也锁在密文里，所以换手机不必重填。
        代价是 —— <span className="text-white/50">口令丢了，云端那份就谁也打不开了</span>：
        没有找回、没有客服、没有后门，这正是加密的意义。所以底牌始终是「导出存档」
        那个文件，换手机之前值得先导一份。手机浏览器偶尔会回收久不打开的本地数据
        （iOS 上尤其）—— 云上有一份之后，这件事就不再致命了。
      </p>

      <ConfirmDialog
        open={ask === 'pull'}
        question="用云端那份覆盖本机？"
        subject="本机当前进度会被换掉"
        detail={
          <>
            云端那份：修订 {sync.cloudRevision ?? '—'} · {at(sync.cloudUpdatedAt)}。
            换之前会自动给本机留一份快照（在急救箱里，随时能捡回来）。
            如果解不开（口令不对或密文损坏），本机一个字都不会动。
          </>
        }
        confirmLabel="拉取"
        onCancel={() => setAsk(null)}
        onConfirm={() => void runPull()}
      />

      <ConfirmDialog
        open={ask === 'clear'}
        question="把云端那份删掉？"
        subject="服务器上只会留一份上一版（界面上没有恢复的路）"
        detail="删的是云，不是这里 —— 本机存档原样不动，同步也还开着。想留住它，先在上面拉取一份，或者导出。"
        confirmLabel="清除"
        onCancel={() => setAsk(null)}
        onConfirm={() => void runClear()}
      />

      <ConfirmDialog
        open={ask === 'disable'}
        question="停用这台设备的云同步？"
        subject="派生钥匙从本机清掉，自动推送随之停下"
        detail="云端那份原样留着 —— 想再接入，用当时的口令走一次「接入」就好（口令我们从没存过，只有你手上有）。"
        confirmLabel="停用"
        onCancel={() => setAsk(null)}
        onConfirm={runDisable}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 三 · 危险区
// ---------------------------------------------------------------------------

/**
 * 两个按钮，都带二次确认，文案不同 —— 它们的后果不一样：
 * 「重新开始」是回到建角那一刻（还能玩），「彻底删除」是把两个存储键一起清掉
 * （等于从来没有过这个存档）。把两者写得一样，等于在诱导误操作。
 */
function DangerSection() {
  const resetToNewGame = useEarthOnlineStore((s) => s.resetToNewGame);
  const wipe = useEarthOnlineStore((s) => s.wipe);
  const [ask, setAsk] = useState<'reset' | 'wipe' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <section className="pb-2">
      <SectionLabel>危险区</SectionLabel>
      <p className="mt-2.5 text-[11px] leading-relaxed text-white/35">
        这两件事都没有撤销。要做之前，先在上面导出一份存档。
      </p>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => setAsk('reset')}
          className="flex-1 rounded-lg border border-white/[0.14] bg-white/[0.03] py-2.5 text-[11.5px] text-white/60 transition-all duration-300 ease-cinematic hover:border-amber-400/40 hover:text-white active:scale-[0.99]"
        >
          重新开始
        </button>
        <button
          type="button"
          onClick={() => setAsk('wipe')}
          className="flex-1 rounded-lg border border-white/[0.14] bg-white/[0.03] py-2.5 text-[11.5px] text-white/45 transition-all duration-300 ease-cinematic hover:border-red-400/40 hover:text-white/80 active:scale-[0.99]"
        >
          彻底删除
        </button>
      </div>

      {done && <p className="mt-2.5 text-[11px] text-white/50">{done}</p>}

      <ConfirmDialog
        open={ask === 'reset'}
        question="回到建角那一刻？"
        subject="当前进度会被一份全新的初始存档替换"
        detail="已导出的存档不受影响。备份键不会被清掉 —— 那份东西还留在急救箱里。"
        confirmLabel="重新开始"
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          resetToNewGame();
          setAsk(null);
          setDone('已回到初始存档。');
        }}
      />

      <ConfirmDialog
        open={ask === 'wipe'}
        question="把这份存档整个删掉？"
        subject="存档与备份键都会被清除"
        detail="这等于从来没有过这个存档。如果还没有导出过，请先取消。"
        confirmLabel="彻底删除"
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          wipe();
          setAsk(null);
          setDone('已清空。刷新页面会得到一份刚建角的存档。');
        }}
      />
    </section>
  );
}

/**
 * 导入前的确认框。
 *
 * 刻意**不用 `window.confirm`**：一个原生对话框会瞬间把这个应用打回
 * "这是个网页"的观感，而覆盖存档正是最需要玩家保持沉浸、看清后果的一刻。
 * 它复用 ConfirmDialog —— 那个组件已经处理好了 backdrop-filter 包含块
 * 与 SSR 无 document 两件事，这里再写一遍只会写漏其中一件。
 */
function ImportConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: { name: string; notes: string[] } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={pending !== null}
      question="用这份文件覆盖当前进度？"
      subject={pending?.name}
      detail={
        <>
          导入之后当前进度就没有了（导入前会自动留一份快照，在急救箱里）。
          {pending && pending.notes.length > 0 && (
            <span className="mt-1.5 block text-white/65">{pending.notes.join('；')}</span>
          )}
        </>
      }
      confirmLabel="导入"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10.5px] tracking-[0.18em] text-white/45">{children}</h3>;
}
