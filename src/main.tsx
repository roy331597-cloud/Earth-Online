import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到 #root —— index.html 被改过了？');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA：注册 Service Worker（见 public/sw.js —— 它只是一个空的 fetch 监听，
// 不做任何缓存；存在的意义是让 Android Chrome 认定"可安装"，装出来才是
// 独立窗口而不是浏览器快捷方式）。
//
// 只在生产注册：开发环境里 SW 会让 Vite 的 HMR 与模块请求多绕一层，
// 也容易把上一轮 preview 留下的旧 SW 带进调试。注册失败静默 ——
// 那是"少了一个安装入口"，应用本身照常运行，不值得打扰任何人。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
