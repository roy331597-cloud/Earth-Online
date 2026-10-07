// ============================================================================
// Vite `?raw` 导入的环境声明
//
// Agent 的角色提示词以 .md 原文加载（见 src/ai/prompts/index.ts）。
// 这里显式声明该模块形态，使类型层不依赖 `vite/client` 也能通过检查
// —— Phase 1 尚未引入 Vite 依赖。
//
// Phase 2 若生成了自己的 src/vite-env.d.ts（含 vite/client 引用），
// 本文件可以删除，两者功能重叠。
// ============================================================================

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*.json?raw' {
  const content: string;
  export default content;
}
