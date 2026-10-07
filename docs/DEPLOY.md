# 部署 · 地球OL

面向：一台自己的 Linux 服务器（海外）+ 一个个人域名 + 一部手机。

架构：一条命令起一个容器（镜像里是 nginx，服务的是 `npm run build` 的产物）。
**数据在手机里** —— 存档存在浏览器的 localStorage，服务器上没有任何账户与数据；
换容器、换服务器、升级版本，都不影响手机上已经记下的东西。

---

## 一、服务器上：起服务

前提：服务器已装 Docker 与 Compose 插件（`docker compose version` 有输出即可）。

```bash
# 1. 把项目放到服务器（任选其一）
git clone https://github.com/roy331597-cloud/Earth-Online.git earthonline   # 或把整个目录 scp/rsync 上去
cd earthonline

# 2. 构建并启动（首次要装依赖 + 构建镜像，几分钟）
docker compose up -d --build

# 3. 看一眼
docker compose ps        # STATUS 应为 healthy（镜像内置健康检查）
curl -I http://127.0.0.1:8080
```

此刻 `http://服务器IP:8080` 已经能打开。**但先别在手机上开始用** —— 见第二节。

### 升级到新版本

```bash
cd earthonline
git pull                     # 或重新上传
docker compose up -d --build # 重新构建并换容器
```

服务器是无状态的：升级不涉及任何数据迁移，手机上的存档原样保留。
刷新页面即见新版本（外壳被配置为不缓存，理由写在 `nginx.conf` 的注释里）。

### 常用命令

```bash
docker compose logs -f            # 跟日志
docker stats earthonline          # 看内存占用（nginx 服务静态文件，常驻十 MB 量级）
docker compose restart            # 重启
docker compose down               # 停机（下次 up -d 回来）
```

---

## 二、域名与 HTTPS（PWA 的硬前提）

iOS 与 Android 都把"安装为应用"（独立窗口、隐藏地址栏、真正的桌面图标）
限定在**安全上下文**里 —— 也就是 HTTPS（只有 localhost 例外）。直接拿
`IP + http` 打开，手机上只会得到一个浏览器书签，不是应用。

最小做法（Caddy 自动签发/续期证书，两行）：

```caddyfile
# /etc/caddy/Caddyfile
earth.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

若你已有 Nginx / 宝塔 / Cloudflare 隧道之类，做法相同：**反代到 `127.0.0.1:8080`**，
证书用你熟悉的方式签。DNS 把域名解析到服务器 IP，先看到这一步再往下走：

```bash
curl -I https://earth.example.com
# 期望 HTTP/2 200，且响应头里有 x-frame-options: DENY（说明反代到了应用本身）
```

---

## 三、手机上：添加到主屏幕

**iPhone（Safari）**

1. Safari 打开 `https://earth.example.com`；
2. 底部「分享」按钮 → 「添加到主屏幕」→ 添加；
3. 从主屏图标打开：全屏运行，没有地址栏与底栏；状态栏透明，内容铺到
   灵动岛/刘海两侧的安全线内（iOS 只认 `index.html` 里的 apple-* meta，
   已经配好）。

**Android（Chrome）**

1. Chrome 打开同一地址；
2. 右上角 ⋮ →「安装应用」/「添加到主屏幕」；
3. 装好后进应用抽屉 —— 是独立窗口的应用，不是套着 Chrome 的快捷方式
   （页面注册了最小 Service Worker，Chrome 才给"安装"而不是"书签"）。

**桌面端**：Chrome / Edge 地址栏右侧的"安装"图标同样可用。

---

## 四、常见问题

| 症状 | 多半是 |
| --- | --- |
| 打开是白屏 | 反代没指向 8080，或资源 404 —— `curl -I https://域名/manifest.webmanifest` 应当返回 200 |
| 手机上找不到"添加到主屏幕" | 不是 https 打开（见第二节），或正在用 Safari 无痕模式 |
| 网页版好像还是旧界面 | 强刷一次；本配置里外壳不缓存，正常情况下刷新即新 |
| 8080 端口被占用 | 改 `docker-compose.yml` 里 `"8080:80"` 冒号左边的端口 |
| 装了以后图标是灰块 | 删掉重新添加（旧图标缓存）；`public/` 里的图标文件在仓库中随版本走 |
| 想换图标 | 改构图常量后跑 `node scripts/gen-icons.mjs`，四个尺寸 + SVG 一起重生成 |

---

## 五、这层配置里两处"故意不"（改配置之前先读这里）

1. **没有 Permissions-Policy 响应头**：应用要用定位（世界页的 GPS 锚点）
   与相机（里程碑记录里拍照）。顺手加一条 `geolocation=()` / `camera=()`
   会让这两个功能静默失效 —— 症状是"按钮点了没反应"，很难往反代上想。
2. **Service Worker 不做任何缓存**：`public/sw.js` 只是一个空的 fetch 监听，
   存在的意义是让 Android 认定"可安装"。应用的数据本来就在手机本地，
   离线缓存的收益很小，而"旧缓存挡住新版本"是实打实的麻烦。

> 安全备注：站点已带 `X-Frame-Options: DENY`（禁外部嵌入）、
> `X-Content-Type-Options: nosniff`、`Referrer-Policy`。**没有** CSP ——
> 应用会从浏览器直连外部 AI 服务，若将来要加 CSP，务必放行
> `connect-src` 到对应的 API 域名，否则会打断 AI 总线。
