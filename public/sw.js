// 地球OL · 最小化的 Service Worker。
//
// 它只做一件事：注册一个**空的** fetch 监听 —— 不缓存、不拦截、不改写任何请求
// （不调用 event.respondWith，浏览器就按平常的网络路径走，行为与没有它完全一致）。
//
// 为什么必须有它：Android Chrome 判定"这个站可以安装成独立应用"（WebAPK ——
// 隐藏地址栏、进应用抽屉、真正的全屏窗口）的条件里，除了 manifest，
// 还要求页面注册了带 fetch 事件的 Service Worker。没有它，安卓上
// "添加到主屏幕"只会得到一个套着 Chrome 外壳的快捷方式。
//
// 为什么**不**做离线缓存：这个应用的存档在浏览器本地（localStorage），
// 服务器上只有一包静态文件。一旦让 SW 缓存 index.html，发新版之后旧壳
// 会继续挡住新版本 —— "为什么更新了服务器还是旧界面"比离线能力值钱得多。
// （站点配置里 index.html 与这个文件本身都是 no-cache，见 nginx.conf。）
self.addEventListener('fetch', () => {});
