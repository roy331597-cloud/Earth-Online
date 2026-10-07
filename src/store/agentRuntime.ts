// ============================================================================
// EarthOnline · Phase 4 · 生产环境的 thunk 单例
//
// `ai/thunks.ts` 是工厂：六个依赖全是注入的，所以它**不知道** store 与
// secretStore 的存在（那是设计，不是疏漏）。这个文件是唯一同时看得见
// 两边的地方，于是它负责把那六个口子接上，交出那一个要用的单例。
//
// 这一层薄到几乎没有逻辑 —— 这是好事。任何一个需要"想一下"的判断
// 都应该落在 `thunks.ts`（纯测试可覆盖的部分）而不是这里，
// 因为**这里没有测试**：它碰的是真正的 LocalStorage 与真正的全局 fetch。
// ============================================================================

import { createThunks } from '@/ai/thunks';
import { applyAgentEffect } from '@/store/agentEffect';
import { useEarthOnlineStore } from '@/store/useEarthOnlineStore';
import { useToastStore } from '@/store/useToastStore';
import { readApiKey } from '@/lib/secretStore';
import type { EarthOnlineState } from '@/types';

/**
 * 切换离线轨道。**纯函数**，所以两处调用（控制室的开关、提示条上的按钮）
 * 走的是同一份定义 —— 提示条上的那个按钮如果自己拼一份字段出来，
 * 它和开关迟早会漂移成两个不同的"离线模式"。
 *
 * `provider` 必须跟着一起动：闸门 ① 与 ② 是两条独立的判定
 * （见 bus.ts），只改 `mockModeEnabled` 会在关闭时留下 `provider: 'mock'`
 * 这个组合 —— 那时界面显示"已接上真身"，实际每一次调用仍然被闸门 ② 拦下。
 */
export const applyMockMode = (state: EarthOnlineState, on: boolean): EarthOnlineState => ({
  ...state,
  ai: { ...state.ai, mockModeEnabled: on, provider: on ? 'mock' : 'deepseek' },
});

/** 提示条上那个「先切到本地轨道」按下去之后发生的事 */
export const enableLocalTrack = (): void => {
  useEarthOnlineStore.getState().mutate((s) => applyMockMode(s, true));
};

export const thunks = createThunks({
  getState: () => useEarthOnlineStore.getState().save,

  mutate: (pure) => useEarthOnlineStore.getState().mutate(pure),

  beginAgentCall: (activity) => useEarthOnlineStore.getState().beginAgentCall(activity),
  endAgentCall: (id) => useEarthOnlineStore.getState().endAgentCall(id),

  notify: (notice) => {
    useToastStore.getState().push(notice);
  },

  // 一次调用对存档的三笔影响（用量 / 调用日志 / 花名册履历）都在这个函数里，
  // 而它同时是 verify-ops 里被断言的那一份 —— 测的就是跑的。
  applyAgentEffect: (effect, month) => {
    useEarthOnlineStore.getState().mutate((s) => applyAgentEffect(s, effect, month));
  },

  // 明文密钥只在这一处被读到，且立刻交给 `bus` 的调用上下文；
  // 它不会经过任何字符串拼接、不进日志、不进存档（见 secretStore 的纪律）。
  readApiKey,
});
