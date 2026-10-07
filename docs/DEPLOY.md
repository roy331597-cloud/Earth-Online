# 部署 · 地球OL

面向：一台自己的 Linux 服务器 + 一个个人域名 + 一部手机。

推荐做法是**一条命令起整个栈**：Docker Compose 同时拉起应用与 Caddy ——
域名填进 `.env` 就自动 HTTPS。服务器上只需要装 Docker 这一个东西。

**数据在手机里** —— 存档存在浏览器的 localStorage，服务器上没有任何账户与数据；
换服务器、升级版本，都不影响手机上已经记下的东西。

（服务器上装不了 Docker 的话，文末第六节有备选：Node + nginx 直接托管。）

---

## 一、服务器上：一条命令起栈

前提：Linux 服务器、有 sudo。域名暂时没有也没关系 —— 先用 IP 验证。

```bash
# 1. 装 Docker（官方一键脚本，compose 插件一并装好）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"      # 让普通用户可用 docker
# 然后重新登录 SSH 让用户组生效（或先执行 newgrp docker）

# 2. 拿代码
git clone https://github.com/roy331597-cloud/Earth-Online.git earthonline
cd earthonline
# 私有仓库的话：克隆地址换成 https://<只读TOKEN>@github.com/roy331597-cloud/Earth-Online.git

# 3. 起栈（首次要构建镜像，几分钟；caddy 会等应用体检通过再起来）
docker compose up -d --build

# 4. 看一眼
docker compose ps                  # earthonline 应为 healthy，caddy 为 running
curl -I http://127.0.0.1           # 期望 200，且响应头里有 x-frame-options: DENY
```

此刻 `http://服务器IP` 已经能打开（没有域名时默认纯 HTTP）。
**但先别在手机上开始用** —— 见第二节。

## 二、域名与 HTTPS（PWA 的硬前提）

iOS 与 Android 都把"安装为应用"（独立窗口、隐藏地址栏、真正的桌面图标）
限定在**安全上下文**里 —— 也就是 HTTPS（只有 localhost 例外）。直接拿
`IP + http` 打开，手机上只会得到一个浏览器书签，不是应用。

DNS 把域名解析到服务器 IP 之后，只差一行：

```bash
echo 'SITE_ADDRESS=earth.example.com' > .env    # 改成你的域名
docker compose up -d                            # 让 caddy 带着域名重起
```

Caddy 会自动申请证书、自动续期，并把 80 重定向到 443。证书数据存在 compose
卷（`caddy_data`）里 —— 升级、重建容器都无需重签。`.env` 已被 `.gitignore`
排除，不会进仓库。

```bash
curl -I https://earth.example.com
# 期望 HTTP/2 200，且响应头里有 x-frame-options: DENY（说明服务到了应用本身）
```

云服务器注意：安全组里要放行 **80 与 443**（很多人只放行了 22，
证书签不下来十有八九卡在这）。

### 升级到新版本

```bash
cd earthonline
git pull
docker compose up -d --build
```

服务器是无状态的：升级不涉及任何数据迁移，手机上的存档原样保留。
刷新页面即见新版本（外壳被配置为不缓存，理由写在站点配置的注释里）。

### 常用命令

```bash
docker compose ps                      # 两个容器的现状
docker compose logs -f                 # 跟日志；`logs -f caddy` 只看一个
docker stats earthonline               # 应用容器内存（nginx 服务静态文件，十 MB 量级）
docker compose restart                 # 重启
docker compose down                    # 停机（下次 up -d 回来）
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
| 打开是白屏 | `curl -I https://域名/manifest.webmanifest` 应当返回 200；`docker compose logs earthonline` 看应用 |
| 证书一直签不下来 | DNS 没解析对，或 80/443 不可达：云服务商**安全组**与服务器防火墙两道都要查；`docker compose logs caddy` 里写着它在等什么 |
| 手机上找不到"添加到主屏幕" | 不是 https 打开（见第二节），或正在用 Safari 无痕模式 |
| 网页版好像还是旧界面 | 强刷一次；本配置里外壳不缓存，正常情况下刷新即新 |
| 80 / 443 已被占用 | `sudo ss -lptn 'sport = :80'` 看谁在听（宝塔 / Apache / 旧站点）；先让它让位 —— 证书与 PWA 都吃标准端口 |
| 装了以后图标是灰块 | 删掉重新添加（旧图标缓存）；`public/` 里的图标文件在仓库中随版本走 |
| 想换图标 | 改构图常量后跑 `node scripts/gen-icons.mjs`，四个尺寸 + SVG 一起重生成 |

---

## 五、这层配置里两处"故意不"（改配置之前先读这里）

1. **没有 Permissions-Policy 响应头**：应用要用定位（世界页的 GPS 锚点）
   与相机（里程碑记录里拍照）。顺手加一条 `geolocation=()` / `camera=()`
   会让这两个功能静默失效 —— 症状是"按钮点了没反应"，很难往配置上想。
2. **Service Worker 不做任何缓存**：`public/sw.js` 只是一个空的 fetch 监听，
   存在的意义是让 Android 认定"可安装"。应用的数据本来就在手机本地，
   离线缓存的收益很小，而"旧缓存挡住新版本"是实打实的麻烦。

> 安全备注：站点已带 `X-Frame-Options: DENY`（禁外部嵌入）、
> `X-Content-Type-Options: nosniff`、`Referrer-Policy`。**没有** CSP ——
> 应用会从浏览器直连外部 AI 服务，若将来要加 CSP，务必放行
> `connect-src` 到对应的 API 域名，否则会打断 AI 总线。

---

## 六、备选：服务器上装不了 Docker（Node + nginx）

不用 Docker 也完全可行：服务器装 Node 22 与 nginx，就地构建、
nginx 直接托管 `dist/` —— 仓库里带了现成的站点配置 `deploy/nginx-bare.conf`。

```bash
# 1. Node 22 + nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# 2. 构建（首次几分钟）
sudo mkdir -p /var/www && sudo chown "$USER" /var/www
git clone https://github.com/roy331597-cloud/Earth-Online.git /var/www/earthonline
cd /var/www/earthonline && npm ci && npm run build

# 3. 站点配置（只改 server_name 一行）
sudo cp deploy/nginx-bare.conf /etc/nginx/sites-available/earthonline
sudo ln -sf /etc/nginx/sites-available/earthonline /etc/nginx/sites-enabled/earthonline
sudo nano /etc/nginx/sites-available/earthonline
sudo nginx -t && sudo systemctl reload nginx

# 4. HTTPS（DNS 解析好之后）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d earth.example.com
```

升级：`cd /var/www/earthonline && git pull && npm ci && npm run build`
（nginx 服务的就是 `dist/`，无需重启）。
