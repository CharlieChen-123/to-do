import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { addDays } from 'date-fns'
import { useUi } from './store/ui'
import { useSyncEngine } from './store/sync'
import { fontZoom, useSettings } from './store/settings'
import { applyThemeVars } from './themes'
import { Sidebar } from './components/Sidebar'
import { QuickAdd } from './components/QuickAdd'
import { ContextMenu } from './components/ContextMenu'
import { SearchDialog } from './components/SearchDialog'
import { Toasts } from './components/Toasts'
import { TodayView } from './components/views/TodayView'
import { WeekView } from './components/views/WeekView'
import { MonthView } from './components/views/MonthView'
import { TrashView } from './components/views/TrashView'
import { DatePopover } from './components/DatePopover'
import { SettingsPanel } from './components/SettingsPanel'
import { HistoryModal } from './components/HistoryModal'
import { AuthGate } from './components/AuthGate'
import { useTags } from './store/tags'
import { fromDateKey, toDateKey, TODAY, weekdayShort } from './lib/date'
import { redoLast, undoLast } from './lib/undo'
import { runCategoryMigration } from './lib/migrate'
import { autoPurgeTrash } from './lib/trash'
import { useL } from './i18n'

/** 历史浏览模态的类型。目前只剩「最近删除」（「已完成」入口已按需求移除）。 */
export type HistoryViewId = 'trash'

export default function App() {
  const l = useL()
  const view = useUi((s) => s.view)
  const activeDateKey = useUi((s) => s.activeDateKey)
  const setActiveDateKey = useUi((s) => s.setActiveDateKey)
  const pushToast = useUi((s) => s.pushToast)
  useSyncEngine()

  // 加载标签表（内置 + 用户自建），并把它灌进 lib/tags 的注册表，
  // 让 displayColor()/tagLabel() 这些纯函数在全局都能取到正确颜色和名字。
  useTags()

  // 一次性分类重组织迁移：下次打开应用时把旧「财务/日常」任务按内容重归类，
  // 并新增「作品集/备考/升学」三类。跑过一次即写 meta 标记跳过，不重复执行。
  useEffect(() => {
    void runCategoryMigration()
  }, [])

  /**
   * 回收站保留期（30 天）到期自动清除。
   * 登录状态下同步引擎每次同步后也会清一遍；这里额外兜一次，覆盖两种情况：
   *   - 未登录（纯本地，同步引擎不跑）
   *   - 装了应用之后一直没网，但本地早已过期的条目
   * 无过期条目时它是纯读操作，不会产生写入。
   */
  useEffect(() => {
    void autoPurgeTrash()
  }, [])

  /**
   * 跨天自动归位。
   * 桌面端窗口经常一开就是好几天不关，activeDateKey / 周月锚点会停在上次那天，
   * 第二天打开看到的是"昨天"的界面。这里每分钟检查一次真实日期有没有翻篇：
   * 翻了就把活跃日期、日历锚点、多选都拉回新的今天，并提示一下。
   * （用户手动翻到别的日期不会被这个影响 —— 只有跨天才会触发。）
   */
  useEffect(() => {
    let lastKnown = TODAY()
    const check = () => {
      const now = TODAY()
      if (now === lastKnown) return
      lastKnown = now
      const ui = useUi.getState()
      ui.setActiveDateKey(now)
      ui.setAnchor(new Date())
      ui.clearSelection()
      pushToast(l('已经是新的一天，已自动切到今天', 'A new day has started. Switched to today.'), { ttl: 2600 })
    }
    const timer = window.setInterval(check, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [pushToast, l])

  // 主题 + 字体大小：写 CSS 变量到 <html>，整套界面（含选中态/hover）跟着变
  const theme = useSettings((s) => s.theme)
  const lang = useSettings((s) => s.lang)
  const fontSize = useSettings((s) => s.fontSize)
  const weekStart = useSettings((s) => s.weekStart)
  const wso: 0 | 1 = weekStart === 'sun' ? 0 : 1
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])
  useEffect(() => {
    applyThemeVars(theme)
  }, [theme])
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ui-zoom',
      String(fontZoom(fontSize)),
    )
  }, [fontSize])

  // 顶栏日期按钮：点击后用自定义 DatePopover 锚到按钮下方，避免
  // <input type="date"> + showPicker() 永远弹在视口左上角的浏览器限制。
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [datePopoverRect, setDatePopoverRect] = useState<DOMRect | null>(null)

  const openDatePopover = () => {
    if (!dateBtnRef.current) return
    setDatePopoverRect(dateBtnRef.current.getBoundingClientRect())
    setDatePopoverOpen(true)
  }

  // Ctrl+Z / Ctrl+Y 全局撤销 / 重做
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      // 不和"输入框/可编辑区"打架：用户写文本时按 Ctrl+Z 应该是浏览器自带的文本撤销
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as HTMLElement).isContentEditable)
      ) {
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        const msg = await undoLast()
        if (msg) pushToast(l(`已撤销：${msg}`, `Undone: ${msg}`), { ttl: 2200 })
        else pushToast(l('没有可撤销的操作', 'Nothing to undo'), { ttl: 2200 })
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        const msg = await redoLast()
        if (msg) pushToast(l(`已重做：${msg}`, `Redone: ${msg}`), { ttl: 2200 })
        else pushToast(l('没有可重做的操作', 'Nothing to redo'), { ttl: 2200 })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pushToast, l])

  const activeDate = fromDateKey(activeDateKey)
  const wdName = lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][activeDate.getDay()] : `周${weekdayShort[activeDate.getDay()]}`
  const isToday = activeDateKey === TODAY()

  /** 顶栏 ‹/› 切换日期的方向：1=下一日(从右滑入) / -1=上一日(从左滑入) */
  const [dateDir, setDateDir] = useState<1 | -1>(1)

  /**
   * 历史浏览模态（目前只有 'trash' = 最近删除）。
   * 从设置面板触发；侧栏不再直接放这两个入口，避免主流导航噪音。
   */
  const [historyView, setHistoryView] = useState<HistoryViewId | null>(null)

  return (
    <AuthGate>
      <div className="jot-app">
        <Sidebar />

      <main className="jot-main">
        <header className="jot-top">
          <div className="jot-top-input">
            <QuickAdd />
          </div>

          <div className="jot-top-right">
            <button
              type="button"
              className="jot-top-date-nav"
              aria-label={l('上一天', 'Previous day')}
              title={l('上一天', 'Previous day')}
              onClick={() => {
                setDateDir(-1)
                setActiveDateKey(toDateKey(addDays(fromDateKey(activeDateKey), -1)))
              }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M10 3 L4.5 8 L10 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* 顶栏日期：纯文字（黑、粗、大），点击弹 DatePopover 锚到按钮下方；
                按 activeDateKey 作 key 让 ‹/› 切日期时整按钮 remount 重放滑入动画 */}
            <button
              key={activeDateKey}
              ref={dateBtnRef}
              type="button"
              className={`jot-top-date ${isToday ? 'is-today' : ''}`}
              aria-label={l('选择日期', 'Choose date')}
              title={isToday ? l('今天是活跃日期，点这里换', 'Today is selected. Choose another date.') : l('点这里换日期', 'Choose another date')}
              onClick={openDatePopover}
              style={{
                '--jot-day-enter-x': dateDir > 0 ? '20px' : '-20px',
              } as CSSProperties}
            >
              {activeDateKey.replace(/-/g, '/')}
              <span className="jot-top-wd">{wdName}</span>
            </button>
            <button
              type="button"
              className="jot-top-date-nav"
              aria-label={l('下一天', 'Next day')}
              title={l('下一天', 'Next day')}
              onClick={() => {
                setDateDir(1)
                setActiveDateKey(toDateKey(addDays(fromDateKey(activeDateKey), 1)))
              }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  d="M6 3 L11.5 8 L6 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className="jot-content">
          {view === 'today' && <TodayView />}
          {view === 'week' && <WeekView />}
          {view === 'month' && <MonthView />}
        </div>
      </main>

      {datePopoverOpen && datePopoverRect && (
        <DatePopover
          anchorRect={datePopoverRect}
          value={activeDateKey}
          onSelect={(k) => setActiveDateKey(k)}
          onClose={() => setDatePopoverOpen(false)}
          weekStartsOn={wso}
        />
      )}

      <SettingsPanel onOpenHistory={setHistoryView} />
      <ContextMenu />
      <SearchDialog />
      <Toasts />
      {historyView === 'trash' && (
        <HistoryModal title={l('最近删除', 'Recently deleted')} onClose={() => setHistoryView(null)}>
          <TrashView />
        </HistoryModal>
      )}
      </div>
    </AuthGate>
  )
}
