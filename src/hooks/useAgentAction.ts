import { useCallback, useState } from 'react';
import type { ThunkResult } from '@/ai/thunks';

/**
 * 给按钮用的"叫一次 Agent"包装。
 *
 * 它只管三件事：跑的时候把按钮按住、回来之后把失败的话留在原地、
 * 卸载之后不再 setState。
 *
 * ---------------------------------------------------------------------------
 * 为什么失败要留在**原地**，而不是弹一个全局提示
 * ---------------------------------------------------------------------------
 * 全局提示条（`AgentToast`）说的是"系统内部降级了，但你要的东西拿到了"。
 * 而这里说的是"你要的东西**没拿到**" —— 玩家写的那段话还在输入框里，
 * 重试的按钮就在他手边。把这句话弹到屏幕角落、然后让输入框保持沉默，
 * 是在把他丢下的东西从他眼前挪开。
 *
 * 所以：降级 → 提示条（结果有效，只是来源不同）；失败 → 就地一行字。
 */
export interface AgentAction {
  busy: boolean;
  error: string | null;
  /** 跑一次。返回是否成功，方便调用方决定要不要清空输入框 */
  run: (task: () => Promise<ThunkResult<unknown>>) => Promise<boolean>;
  clearError: () => void;
}

export function useAgentAction(): AgentAction {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (task: () => Promise<ThunkResult<unknown>>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      return true;
    } finally {
      // `finally` 而不是 `then`：thunk 自己把网络错误吞进了结果信封，
      // 但注入的 fetch 或某个适配器仍可能抛出来 —— 那时按钮**必须**松开，
      // 否则整个面板就锁死在一个永远转下去的按钮上。
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, clearError };
}
