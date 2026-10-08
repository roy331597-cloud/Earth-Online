# ============================================================================
# 地球OL · 云同步服务镜像（第三只容器）
#
#   docker build -f server.Dockerfile -t earthonline-sync .
#
# 零依赖 Node 22 —— 没有 npm install、没有 node_modules：
# 镜像内容 = 官方 node:22-alpine + server/ 下那两个 .mjs 文件。
# 它读不懂密文，也不会写任何日志里的密文（纪律见 server/index.mjs 文件头）。
#
# 数据结构在 /data 上（compose 里挂 sync_data 卷）：
# 认领信息 state.json 与密文 save.bin / save.prev.bin —— 重建容器不会碰它，
# 这就是"存档在服务器上"的全部物质形态（见 server/store.mjs）。
# ============================================================================
FROM node:22-alpine
WORKDIR /app

COPY server/ ./server/

ENV SYNC_DATA_DIR=/data SYNC_PORT=3000
VOLUME /data
EXPOSE 3000

# 健康检查用 busybox 自带的 wget：compose ps 里的 healthy 是真问过它答不答话
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1:3000/sync/v1/health || exit 1

CMD ["node", "server/index.mjs"]
