import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="App">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// 生产环境注册 Service Worker，并接收 SW 推送：
//   - JOT_SW_ACTIVATED（旧 controller 被新 SW 顶替了）→ 强制刷新一次，让桌面壳
//     不再跑旧 hash 的 JS/CSS。这是修复"完全没做出来"的兜底：你不再需要手动退出 jot.exe。
//   - JOT_GET_VERSION → 读取当前 SW cache 名（用于右下角版本徽章判断是否同步成功）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let activatedOnce = false
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)

    if ('MessageChannel' in window) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data
        if (!data || typeof data !== 'object') return
        if (data.type === 'JOT_SW_ACTIVATED') {
          if (activatedOnce) return
          // 仅在新 cache 名跟当前已记录的不同时刷新（避免初次加载就触发 reload）
          const last = window.localStorage.getItem('jot:swCache')
          if (last && last !== data.cache) {
            activatedOnce = true
            window.localStorage.setItem('jot:swCache', data.cache)
            // 给 SW 一点点时间缓存新资源，然后再 reload，避免刚刷完又走 SW 旧 fallback
            setTimeout(() => window.location.reload(), 120)
          } else {
            window.localStorage.setItem('jot:swCache', data.cache)
          }
        }
        if (data.type === 'JOT_SW_VERSION') {
          window.dispatchEvent(
            new CustomEvent('jot-sw-version', { detail: data.cache }),
          )
        }
      })
    }
  })
}
