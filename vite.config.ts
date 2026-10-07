import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 与 tsconfig.json 的 paths 保持一致：import { ... } from '@/types'
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 允许局域网访问：手机连同一个 Wi-Fi 后可直接打开，
    // 这是移动优先项目最省事的真机调试方式（npm run dev 后看终端里的 Network 地址）。
    host: true,
  },
});
