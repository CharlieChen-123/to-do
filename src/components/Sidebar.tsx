import type { ReactElement } from 'react'
import type { ViewId } from '../types'
import { useUi } from '../store/ui'
import { useSettings } from '../store/settings'
import { useTodayTaskCount } from '../lib/useEntries'
import { TODAY } from '../lib/date'
import { IconMonth, IconSearch, IconSettings, IconToday, IconWeek } from './Icons'
import { SyncStatus } from './SyncStatus'
import { useT } from '../i18n'

const NAV: { id: ViewId | 'settings'; labelKey: string; Icon: () => ReactElement }[] = [
  { id: 'today', labelKey: 'nav.today', Icon: IconToday },
  { id: 'week', labelKey: 'nav.week', Icon: IconWeek },
  { id: 'month', labelKey: 'nav.month', Icon: IconMonth },
  // 「已完成」从侧栏移除，挪到设置面板的「数据浏览」section（按按钮弹模态）；
  // 「最近删除」同理。侧栏现在只剩「今天 / 本周 / 月历 + 设置」4 个核心入口，
  // 不让历史数据/低频功能挤占主流入口。
  { id: 'settings', labelKey: 'nav.settings', Icon: IconSettings },
]

export function Sidebar() {
  const t = useT()
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const setActiveDateKey = useUi((s) => s.setActiveDateKey)
  const setSearchOpen = useUi((s) => s.setSearchOpen)

  /**
   * 「今天」徽章 = 今天还剩几条没完成的任务。
   * 口径必须和「今天」视图任务列上的数字完全一致 —— 所以直接用
   * useTodayTaskCount()（内部走 buildDayList，含多日重复任务的当天实例），
   * 不再自己扫 entries 判 dateKey，那样会跟视图对不上。
   */
  const todayCount = useTodayTaskCount()

  /** 跳到「今天」视图时顺手把顶上活跃日期拉回今天 —— 让顶栏选中状态立刻对得上 */
  const goToday = () => {
    setActiveDateKey(TODAY())
    setView('today')
  }

  return (
    <aside className="jot-side">
      <div className="jot-brand">
        <span className="jot-brand-mark" />
        <span className="jot-brand-text">To do</span>
      </div>

      <button
        type="button"
        className="jot-nav-search"
        onClick={() => setSearchOpen(true)}
      >
        <IconSearch />
        <span>{t('nav.search')}</span>
      </button>

      <nav className="jot-nav">
        {NAV.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={`jot-nav-item ${view === id ? 'is-active' : ''}`}
            onClick={() => {
              if (id === 'today') goToday()
              else if (id === 'settings') useSettings.getState().setSettingsOpen(true)
              else setView(id)
            }}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon />
            <span className="jot-nav-label">{t(labelKey)}</span>
            {id === 'today' && todayCount > 0 && (
              <span className="jot-nav-badge">{todayCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="jot-side-foot">
        <SyncStatus />
      </div>
    </aside>
  )
}
