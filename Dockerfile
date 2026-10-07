# ============================================================================
# 地球OL · 生产镜像（多阶段：Node 构建 → nginx 运行）
#
#   docker build -t earthonline .
#   docker run -d -p 8080:80 --restart unless-stopped earthonline
#
# 或用仓库根目录的 docker-compose.yml（推荐）：
#   docker compose up -d --build
#
# 运行层是 nginx:alpine：没有 Node、没有 node_modules、没有源码 ——
# 镜像里只有一包 dist 与一份站点配置，空闲内存 ~10MB 量级。
# ============================================================================

# ---- 构建阶段 ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# 先只拷清单文件：依赖层单独立缓存，改业务代码不会触发重装依赖
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# build = tsc --noEmit && vite build —— 类型不过，镜像就出不来
RUN npm run build

# ---- 运行阶段 ---------------------------------------------------------------
FROM nginx:alpine
# 站点配置：SPA 回退 / gzip / 安全头 / 三档缓存（逐条理由见 nginx.conf）
COPY nginx.conf /etc/nginx/conf.d/default.conf
# 只把构建产物搬过来 —— 源码、依赖、构建工具都不进运行镜像
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
# nginx 官方镜像自带 ENTRYPOINT/CMD（nginx -g 'daemon off;'），不覆盖。

# 健康检查用 busybox 自带的 wget：`docker compose ps` 里的 healthy
# 是真问过这个容器"你答不答话"，而不是"进程还活着"。
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
