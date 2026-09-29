/* Jot · Service Worker
 * 手写而非用 workbox，避免额外依赖。
 * 策略：
 *   - /assets/*（文件名带 hash）→ cache first，一次命中永久复用
 *   - 导航请求 → network first，离线时回落到缓存的 index.html
 *   - 其他同源 GET → stale-while-revalidate
 *
 * v15 变更：
 *   多日任务完成语义重做：
 *   1) 修复起始日点「完成」直接抛错 —— toggleCheck 之前按 isRecurring 分流，
 *      起始日走 entry 分支时 item.template 是 undefined；改按 item.kind 分流，
 *      起始日用 toggleDone（内部会写 recurringDone[开始日]）。
 *   2) buildDayList：「完成即终止后续天」→「勾掉任意一天，从那天起保持
 *      已完成（划线）直到结束日」，天数不再消失。
 *   3) uncheckRecurring：在任意已完成的天上取消勾选 = 整体恢复未完成
 *      （删除该天及之后的所有 recurringDone 记录）。
 */
const CACHE = 'jot-v21'
const PRECACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // 立刻接管所有未受控 tab，避免「旧 controller 还在跑」导致新 SW 没生效
      .then(() => self.clients.claim())
      // 通知所有可见 client 重新拉取新版（强制刷新，旧 JS bundle 再也用不到了）
      .then(async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const c of clients) c.postMessage({ type: 'JOT_SW_ACTIVATED', cache: CACHE })
      }),
  )
})

// 收到页面询问版本号时的回复（供设置面板"刷新"按钮用）；
// 也支持 JOT_SKIP_WAITING（让正在 waiting 的新 SW 立即接管）。
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  if (data.type === 'JOT_GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ cache: CACHE })
    } else {
      event.source && event.source.postMessage({ type: 'JOT_SW_VERSION', cache: CACHE })
    }
    return
  }
  if (data.type === 'JOT_SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 带 hash 的构建产物：缓存优先
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
    return
  }

  // 页面导航：网络优先 + 强制 no-store，确保桌面壳不会复用旧 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match('/index.html')),
    )
    return
  }

  // 其余：先给缓存，后台更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => hit)
      return hit || network
    }),
  )
})
