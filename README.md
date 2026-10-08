<p align="center"><img src="public/icon-512.png" alt="应用图标：黑底、地平线、一点悬浮的金" width="112"></p>

# 地球OL · Earth Online

把现实当作游戏来经营的生活模拟应用 —— 给当下的自己建立目标、接受任务、记录
进展、兑现奖励。九章篇章结构，中文界面，为手机而生（可"添加到主屏幕"，全屏
运行，像一个原生应用）。

**数据默认只存在你的设备里。** 存档在浏览器本地（localStorage），服务器只做
静态托管：没有账户、没有遥测；不打开云同步时也没有后端。换服务器、升级版本，
记下的东西原样都在。云同步是可选的一层 —— 打开后服务器上多存一份**口令加密的
密文**（服务器读不懂内容，换手机输口令即恢复），细节见
[docs/DEPLOY.md](docs/DEPLOY.md) 第三节。

## 快速开始

```bash
npm install
npm run dev         # 本机开发（Vite 开发服）
npm run build       # 产出 dist/ —— 纯静态文件，托管到任何地方都能跑
npm run verify:ops  # 不变量断言全集（改引擎 / 内容目录后必跑）
```

## 部署

一页式说明见 [docs/DEPLOY.md](docs/DEPLOY.md)。推荐做法是**一条命令起整个栈**：
`docker compose up -d --build` 同时拉起应用、云同步与 Caddy 三个容器，域名填进
`.env` 就自动 HTTPS。服务器上装不了 Docker 时可用备选路径（Node + nginx，
配置见 [`deploy/nginx-bare.conf`](deploy/nginx-bare.conf)）。

带 HTTPS 的域名是"装进手机"的硬前提 —— iOS 与 Android 都把安装限定在安全上下文里。

## 目录一览

- `src/lib/` — 四道写入漏斗引擎（终局 → 篇章 → 进化树 → 成就）与选择器
- `src/data/catalog/` — 内容目录：职业线、章节、成就、进化树、终局目标
- `src/components/` — 场景、HUD 与十余块面板（悬赏 / 金库 / 圣殿 / 陈列馆…）
- `src/store/` — 存档模型与操作；`newGameState.ts` 是玩家的初始档
- `server/` — 云同步服务（零依赖 Node，只在你自己的服务器上跑；见 `server.Dockerfile`）
- `scripts/verify-ops.mjs` — 不变量断言全集
- `docs/DEPLOY.md`、`deploy/` — 部署说明与站点配置

## 关于 AI（可选）

AI 派单与顾问是可选的挂件：接入你自己的 Key 后，加密存储于本机独立存储区，
不随日志与导出泄露；不接 Key 时走本地轨道，应用完整可用。

## 开发约定

改动后至少过三道闸门：

```bash
npx tsc --noEmit && npm run verify:ops && npm run build
```

新增子系统必须补 `verify-ops` 断言：这里钉的不是"能编译"，而是"算得对" ——
尤其是那些**错了不会崩、只会安静地错**的约定。
