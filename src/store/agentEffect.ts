// ============================================================================
// EarthOnline · Phase 4 · 把一次 Agent 调用的影响落回存档
//
// `bus.ts` 跑完一次调用之后**不写存档**，它返回一个 `BusEffect`
// （用量、调用日志、熔断状态）。这个文件是那个 effect 的落点，且只有这一个落点。
//
// ---------------------------------------------------------------------------
// 为什么单独一个文件，而不是塞进 store 或 bus
// ---------------------------------------------------------------------------
// 因为它是**纯的**，而它的两个调用方都不是：
//   · `useEarthOnlineStore` 把它包进 `mutate()` —— store 管写盘与 revision；
//   · `ai/thunks.ts` 通过依赖注入拿到一个"应用 effect"的函数 ——
//     测试里注入的那份就是本文件本身，于是**测的和跑的是同一段代码**。
// 如果它长在 store 里，verify-ops 就得把整个 store（含 LocalStorage 通道）
// 拖进来才能断言"用量记对了没有"。
//
// ---------------------------------------------------------------------------
// 它记三本账
// ---------------------------------------------------------------------------
//   ① `ai.usage` —— 本月花了多少（熔断与预算闸门读它。⚠️ 界面上不出账单，见 PO 裁定）；
//   ② `agents.invocations` —— 环形调用日志（最近 200 条）；
//   ③ `agents.records[].stats` —— **花名册上那个人的履历**。
//
// 第 ③ 本最容易漏，但它恰恰是控制室里唯一露出来的那本：花名册要回答
// "后台有几个人、谁一直在被叫"。只记 ①② 的话，那个面板永远显示
// "所有 Agent 都没被调用过" —— 一个不会报错、只是慢慢变成谎话的 bug。
// ============================================================================

import { applyBusEffect } from '@/ai/bus';
import type { BusEffect } from '@/ai/bus';
import type { AgentRecord, EarthOnlineState } from '@/types';

/** 解析成功率的滑动窗口。与 bus 的日志上限（200）无关 —— 它只需要"最近这一段" */
const PARSE_WINDOW = 20;

/**
 * 更新一个 Agent 的履历。
 *
 * `parseSuccessRate` 用滑动平均而不是全历史：一个 Agent 前 100 次都很稳、
 * 最近 20 次全崩，全历史平均会把它显示成"健康" —— 而那正是最需要被看见的时候。
 */
const foldStats = (rec: AgentRecord, effect: BusEffect, ok: boolean, cost: number): AgentRecord => {
  const s = rec.stats;
  const n = Math.min(s.invocations, PARSE_WINDOW);
  const rate = (s.parseSuccessRate * n + (ok ? 1 : 0)) / (n + 1);

  return {
    ...rec,
    stats: {
      invocations: s.invocations + 1,
      failures: s.failures + (ok ? 0 : 1),
      tokensIn: s.tokensIn + effect.usage.tokensIn,
      tokensOut: s.tokensOut + effect.usage.tokensOut,
      costUsdCents: Math.round((s.costUsdCents + cost) * 10_000) / 10_000,
      lastInvokedAt: effect.invocation?.ts ?? s.lastInvokedAt,
      // 五位小数足够：它是个比率，不是一个数钱的账
      parseSuccessRate: Math.round(rate * 100_000) / 100_000,
    },
  };
};

/**
 * 应用一次调用的 effect。
 *
 * ⚠️ 与全项目所有纯函数同一条自律：不读时钟（`month` 从参数进来）、
 *    无事发生就返回同一个对象（`mutate` 靠引用相等短路，不写盘）。
 */
export const applyAgentEffect = (
  save: EarthOnlineState,
  effect: BusEffect,
  month: string,
): EarthOnlineState => {
  // 调用日志都没产生（理论上不会发生：bus 每次都造一条）—— 那就当没发生过
  if (effect.invocation === null) return save;

  const applied = applyBusEffect(save, effect, month);
  const ok = effect.invocation.parsedOk;
  const agentId = effect.invocation.agentId;

  return {
    ...save,
    ai: {
      ...applied.ai,
      // ⚠️ 这里覆写 `applyBusEffect` 的 `configured: true`。
      //    它的原意是"这次调用走通了，所以是配好的"—— 但 Mock 轨道也走它，
      //    而 Mock 恰恰意味着**没有**配好。今天没人读这个字段（它是惰性的），
      //    所以这是一处"现在不疼、将来会疼"的修正：等哪天控制室拿它点灯，
      //    一个没配密钥的人会看到自己的密钥是绿的。
      configured: effect.billed ? true : save.ai.configured,
    },
    agents: {
      ...save.agents,
      invocations: applied.invocations,
      records: save.agents.records.map((r) =>
        r.id === agentId ? foldStats(r, effect, ok, effect.usage.costUsdCents) : r,
      ),
    },
  };
};
