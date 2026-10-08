# 部署 · 地球OL

面向：一台自己的 Linux 服务器 + 一个个人域名 + 一部手机。

推荐做法是**一条命令起整个栈**：Docker Compose 同时拉起应用、Caddy 与云同步服务 ——
域名填进 `.env` 就自动 HTTPS。服务器上只需要装 Docker 这一个东西。

**数据默认在手机里** —— 存档存在浏览器的 localStorage；换服务器、升级版本，
都不影响手机上已经记下的东西。第三节的**云同步**是可选的一层：打开之后，
服务器上会多一份**口令加密过的密文**（服务器读不懂内容），换手机输口令即恢复。

（服务器上装不了 Docker 的话，文末第七节有备选：Node + nginx 直接托管。）

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
docker compose ps                  # earthonline 与 sync 应为 healthy，caddy 为 running
curl -I http://127.0.0.1           # 期望 200，且响应头里有 x-frame-options: DENY
```

此刻 `http://服务器IP` 已经能打开（没有域名时默认纯 HTTP）。
**但先别在手机上开始用** —— 见第二节。

## 二、域名与 HTTPS（PWA 的硬前提）

iOS 与 Android 都把"安装为应用"（独立窗口、隐藏地址栏、真正的桌面图标）
限定在**安全上下文**里 —— 也就是 HTTPS（只有 localhost 例外）。直接拿
`IP + http` 打开，手机上只会得到一个浏览器书签，不是应用。

### 域名怎么买（还没有域名就从这里开始）

域名不必和服务器同一家买 —— 注册商只是"名字的登记处"。两家够用且不贵的：

| 注册商 | 特点 |
| --- | --- |
| **Porkbun** | 常有几美元首年的 .xyz / .top；界面干净，Whois 隐私默认送 |
| **Namecheap** | 老牌，.com 常年十美元上下；促销首年便宜，注意续费价 |

买完之后，在注册商的 DNS 控制台里加一条 **A 记录**，把名字指到服务器：

| 字段 | 填什么 |
| --- | --- |
| Type / 类型 | `A` |
| Host / 主机记录 | `@`（域名本身；想要 `www` 就再加一条 Host 填 `www`） |
| Value / 值 | **你的服务器 IP**（买服务器时控制台给的那一串，本文档不写死它） |
| TTL | 默认即可 |

验证生效：`dig +short earth.example.com` 返回你服务器那一串 IP 就算好了
（通常几分钟，最长几小时）。然后再回到下面这一段填 `.env`。

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
docker compose ps                      # 三个容器的现状
docker compose logs -f                 # 跟日志；`logs -f caddy` / `logs -f sync` 只看一个
docker stats earthonline               # 应用容器内存（nginx 服务静态文件，十 MB 量级）
docker compose restart                 # 重启
docker compose down                    # 停机（下次 up -d 回来）
```

---

## 三、云同步（可选）：口令加密的云存档

默认一切都在手机本地。想换手机、或怕清了浏览器数据，就在控制室里打开「云同步」：

- 设一个口令（**只有你知道，丢了谁也找不回** —— 设计如此）；
- 应用在本地把存档（连同 API Key，如果有）加密成一份密文，推给服务器；
  服务器**只存密文** —— 修订号与时间走请求头，它读不懂里面的任何一个字节；
- 换手机 / 清了数据之后，在同一地址输同一个口令，云端那份就回来了。

线上的样子：同一个域名，`/sync/*` 由 Caddy 转给第三只容器 `sync`
（`server.Dockerfile`，node:22-alpine、零依赖，只有 `server/` 下两个 .mjs）；
其余路径照旧走应用容器 —— 对外仍然只有 80 / 443 一个面。

几条要记住的：

- **口令丢了**：云端那份永远打不开（这正是它安全的原因）。底牌是控制室里的
  「导出存档」——从导出文件随时能恢复本机。云端那份若想一起清掉：

  ```bash
  docker compose down
  docker volume rm earthonline_sync_data   # 项目目录名不是 earthonline 时：
                                           # 用 docker volume ls 找 *_sync_data 那个
  docker compose up -d                     # 起来是一台"没有主"的干净同步服务
  ```

  容器活着时也可以用控制室里的「清除云端存档」（只删密文，认领信息不动）。
- **服务器上的数据在哪**：全部在 `sync_data` 卷里（认领信息 + 当前密文 + 上一版
  密文）。重建容器、升级版本都不碰它；`docker compose down` 也不删卷。
- **无 Docker 路径**（第七节）：多起一个进程 `node server/index.mjs`
  —— 数据目录用 `SYNC_DATA_DIR` 指一个可写目录（容器里它是 `/data`，
  裸机上默认值一般不可写）；`deploy/nginx-bare.conf` 里已带上 `/sync/` 的转发。

---

## 四、手机上：添加到主屏幕

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

## 五、常见问题

| 症状 | 多半是 |
| --- | --- |
| 打开是白屏 | `curl -I https://域名/manifest.webmanifest` 应当返回 200；`docker compose logs earthonline` 看应用 |
| 证书一直签不下来 | DNS 没解析对，或 80/443 不可达：云服务商**安全组**与服务器防火墙两道都要查；`docker compose logs caddy` 里写着它在等什么 |
| 手机上找不到"添加到主屏幕" | 不是 https 打开（见第二节），或正在用 Safari 无痕模式 |
| 网页版好像还是旧界面 | 强刷一次；本配置里外壳不缓存，正常情况下刷新即新 |
| 80 / 443 已被占用 | `sudo ss -lptn 'sport = :80'` 看谁在听（宝塔 / Apache / 旧站点）；先让它让位 —— 证书与 PWA 都吃标准端口 |
| 装了以后图标是灰块 | 删掉重新添加（旧图标缓存）；`public/` 里的图标文件在仓库中随版本走 |
| 想换图标 | 改构图常量后跑 `node scripts/gen-icons.mjs`，四个尺寸 + SVG 一起重生成 |
| 控制室里「云同步」整段是灰的 | 不是 HTTPS 打开的（手机的加密能力只在安全上下文里存在），或服务器没起同步容器：`docker compose ps` 看 sync 是否 healthy |
| 忘了云同步口令 | 云端密文打不开（设计如此）——本地「导出存档」是底牌；云端那份清掉重来见第三节 |
| 换了手机 / 清了浏览器数据 | 装好应用、打开同一地址 → 控制室 →「云同步」→「接入」→ 输当时那个口令 |

---

## 六、这层配置里三处"故意不"（改配置之前先读这里）

1. **没有 Permissions-Policy 响应头**：应用要用定位（世界页的 GPS 锚点）
   与相机（里程碑记录里拍照）。顺手加一条 `geolocation=()` / `camera=()`
   会让这两个功能静默失效 —— 症状是"按钮点了没反应"，很难往配置上想。
2. **Service Worker 不做任何缓存**：`public/sw.js` 只是一个空的 fetch 监听，
   存在的意义是让 Android 认定"可安装"。应用的数据本来就在手机本地，
   离线缓存的收益很小，而"旧缓存挡住新版本"是实打实的麻烦。
3. **同步服务不解析密文**：它只搬字节 —— 修订号与时间走请求头（服务端从不
   打开信封），日志只记 method / path / status / size。往后若想让它"顺手做点
   什么"（搜索、统计、迁移），先过这一条：服务器读得懂的那天，
   "上面只有密文"就不再是一句承诺。

> 安全备注：站点已带 `X-Frame-Options: DENY`（禁外部嵌入）、
> `X-Content-Type-Options: nosniff`、`Referrer-Policy`。**没有** CSP ——
> 应用会从浏览器直连外部 AI 服务，若将来要加 CSP，务必放行
> `connect-src` 到对应的 API 域名，否则会打断 AI 总线。

---

## 七、备选：服务器上装不了 Docker（Node + nginx）

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

要用**云同步**（第三节）就多起一个进程 —— 它同样是零依赖的：

```bash
# 在克隆目录里；先用 SYNC_DATA_DIR 指一个放数据的地方（默认 ./data）
SYNC_DATA_DIR=/var/lib/earthonline-sync node server/index.mjs
# 想让它常驻：写一个 systemd 服务（ExecStart 同上），或交给 pm2 / supervisor
```

`deploy/nginx-bare.conf` 里已经带上 `/sync/` 的转发（指向本机 3000 端口），
不必再改 nginx 配置。
