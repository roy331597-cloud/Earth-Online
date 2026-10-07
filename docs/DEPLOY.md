# 部署 · 地球OL

面向：一台自己的 Linux 服务器 + 一个个人域名 + 一部手机。

产物是**纯静态文件**（`npm run build` 出来的 `dist/`），服务器只做静态托管。
**数据在手机里** —— 存档存在浏览器的 localStorage，服务器上没有任何账户与数据；
换服务器、升级版本，都不影响手机上已经记下的东西。

两条路，任选一条（服务的是同一包 `dist/`，只是"谁来服务它"不同）：

- **路径 A（不用 Docker，推荐）**：服务器装 Node 与 nginx，就地构建、就地托管。
- **路径 B（Docker）**：一条命令起一个容器，镜像里是 nginx 服务同一包产物。

---

## 一、把应用放到服务器

### 路径 A：不用 Docker（Node + nginx）

前提：Debian / Ubuntu 系的服务器、有 sudo。（其他发行版同理，换包管理器即可。）

```bash
# 1. Node 22 —— 只用它来构建；跑起来的是 nginx，不靠 Node 常驻
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v                              # 应为 v22.x

# 2. nginx
sudo apt-get install -y nginx

# 3. 把代码放到 /var/www（放这里是因为 nginx 的 www-data 用户读得到）
sudo mkdir -p /var/www && sudo chown "$USER" /var/www
git clone https://github.com/roy331597-cloud/Earth-Online.git /var/www/earthonline
# 私有仓库的话：克隆地址换成 https://<只读TOKEN>@github.com/roy331597-cloud/Earth-Online.git
cd /var/www/earthonline

# 4. 构建（首次要装依赖 + 打包，几分钟）
npm ci
npm run build                        # 产物在 dist/

# 5. 站点配置：仓库里带好了一份裸机版，复制过去，只改 server_name 一行
sudo cp deploy/nginx-bare.conf /etc/nginx/sites-available/earthonline
sudo ln -sf /etc/nginx/sites-available/earthonline /etc/nginx/sites-enabled/earthonline
sudo nano /etc/nginx/sites-available/earthonline   # 把 server_name 改成你的域名
sudo nginx -t && sudo systemctl reload nginx

# 6. 看一眼
curl -I http://127.0.0.1             # 期望 200，响应头里有 x-frame-options: DENY
```

此刻 `http://服务器IP` 已经能打开。**但先别在手机上开始用** —— 见第二节。

### 路径 B：Docker

前提：服务器已装 Docker 与 Compose 插件（`docker compose version` 有输出即可）。

```bash
# 1. 把项目放到服务器
git clone https://github.com/roy331597-cloud/Earth-Online.git earthonline
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
# 路径 A
cd /var/www/earthonline
git pull
npm ci && npm run build              # 依赖没变动时可跳过 npm ci，只跑 build
# nginx 服务的就是 dist/ 目录，无需重启

# 路径 B
cd earthonline
git pull
docker compose up -d --build         # 重新构建并换容器
```

服务器是无状态的：升级不涉及任何数据迁移，手机上的存档原样保留。
刷新页面即见新版本（外壳被配置为不缓存，理由写在两份站点配置的注释里）。

### 常用命令

```bash
# 路径 A
sudo nginx -t                     # 改完配置先语法检查，再看下一行
sudo systemctl reload nginx       # 让配置生效
tail -f /var/log/nginx/error.log  # 出问题先看这里

# 路径 B
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

先把 DNS 把域名解析到服务器 IP，然后按路径二选一：

### 路径 A：certbot 就地在 nginx 上签（两三条命令）

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d earth.example.com    # 按提示选"重定向"；证书自动续期
```

### 路径 B：Caddy 反代到 8080（两行）

```caddyfile
# /etc/caddy/Caddyfile
earth.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

若你已有 Nginx / 宝塔 / Cloudflare 隧道之类，做法同理（证书用你熟悉的方式签）：
路径 A 本就是 nginx 直接服务，不需要再套反代；路径 B 反代到 `127.0.0.1:8080`。

两条路共同的一步 —— 验证：

```bash
curl -I https://earth.example.com
# 期望 HTTP/2 200，且响应头里有 x-frame-options: DENY（说明服务到了应用本身）
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
| 打开是白屏 | `curl -I https://域名/manifest.webmanifest` 应当 200。路径 A：看 nginx 的 root 是否指向 `dist/`（`/var/log/nginx/error.log` 会说话）；路径 B：反代是否指向 8080 |
| nginx -t 报错 / 80 被占用 | `sudo ss -lptn 'sport = :80'` 看谁在听（宝塔 / Apache / 旧站点）。多个站点共存没问题，server_name 配对到这一条即可 |
| 手机上找不到"添加到主屏幕" | 不是 https 打开（见第二节），或正在用 Safari 无痕模式 |
| 网页版好像还是旧界面 | 强刷一次；本配置里外壳不缓存，正常情况下刷新即新 |
| 8080 端口被占用（路径 B） | 改 `docker-compose.yml` 里 `"8080:80"` 冒号左边的端口 |
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
