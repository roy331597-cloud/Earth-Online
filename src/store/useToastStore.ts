// ============================================================================
// EarthOnline · Phase 4 · 提示条 (toast)
//
// 一条要告诉玩家、但不该打断他的事：这次走的是本地轨道、模型这次没接上、
// 熔断开了……它们都满足同一个形状 —— **玩家需要知道，但不需要为此做决定**。
// 需要他做决定的事走 ConfirmDialog，那是另一种东西。
//
// ---------------------------------------------------------------------------
// 为什么不进存档
// ---------------------------------------------------------------------------
// 与 `agentActivity` 同一阵营：它是"此刻"的事。刷新页面后还挂着一条
// 「刚才网络断了」的提示，是幽灵。存档里只留真正发生过的事
// （调用日志、用量、履历），不留"我提醒过他一次"。
//
// ⚠️ 这个 store 是**纯展示的**：它不知道 `enable_local_track` 是什么意思。
//    把那个动作解释成"把 ai.mockModeEnabled 打开"是 UI 层的事
//    （见 AgentToast）。让它直接去改存档，这一层就有了第二种写盘路径。
// ============================================================================

import { create } from 'zustand';
import type { Notice } from '@/ai/thunks';

export interface ToastItem extends Notice {
  id: string;
}

/** 同屏最多几条。超出时挤掉最旧的 —— 提示条不该长成一堵墙。 */
const MAX_VISIBLE = 3;

interface ToastStore {
  toasts: ToastItem[];
  /** 返回这条的 id，方便调用方（或测试）按 id 收掉它 */
  push: (notice: Notice) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],

  push: (notice) => {
    const id = `toast_${Date.now().toString(36)}_${(seq++).toString(36)}`;
    set({ toasts: [...get().toasts, { ...notice, id }].slice(-MAX_VISIBLE) });
    return id;
  },

  dismiss: (id) => {
    const rest = get().toasts.filter((t) => t.id !== id);
    // 引用相等：没有这条时不要凭空 set 一次，那会让订阅者白渲染一轮
    // （与 store 的 endAgentCall 同一条纪律）
    if (rest.length !== get().toasts.length) set({ toasts: rest });
  },

  clear: () => {
    if (get().toasts.length > 0) set({ toasts: [] });
  },
}));
