import { useMemo, useState, type CSSProperties } from 'react'
import { useUi } from '../../store/ui'
import { useSettings } from '../../store/settings'
import {
  buildDayList,
  type DayEntryItem,
  itemEntry,
  useEntries,
  useRecurringDone,
} from '../../lib/useEntries'
import { createFromInput, moveToDate } from '../../lib/actions'
import { displayColor } from '../../lib/categories'
import {
  friendlyDate,
  isSameDay,
  monthGrid,
  monthLabel,
  format,
  toDateKey,
  TODAY,
  weekdayShort,
} from '../../lib/date'
import { EntryCard } from '../EntryCard'
import { MonthPopover } from '../DatePopover'
import { useL } from '../../i18n'

const MAX_PER_CELL = 3

export function MonthView() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const entries = useEntries()
  const recurringDone = useRecurringDone()
  const anchor = useUi((s) => s.anchor)
  const setAnchor = useUi((s) => s.setAnchor)
  const selected = useUi((s) => s.selectedDate)
  const setSelected = useUi((s) => s.setSelectedDate)
  const activeDateKey = useUi((s) => s.activeDateKey)
  /** 「顶上日期」高亮：selected 优先，否则跟随活动日期；
   *  任意一个在格子里都会显示选中框 —— 跟周视图保持一致 */
  const highlightKey = selected ?? activeDateKey
  const openCtxMenu = useUi((s) => s.openCtxMenu)
  const weekStart = useSettings((s) => s.weekStart)
  /** 1=周一, 0=周日 */
  const wso: 0 | 1 = weekStart === 'sun' ? 0 : 1
  const [dragKey, setDragKey] = useState<string | null>(null)
  /** 非空 = 年月 popover 打开，值是标题按钮的屏幕坐标（锚点） */
  const [monthPopRect, setMonthPopRect] = useState<DOMRect | null>(null)
  /** 翻月方向：1=下一月(从右滑入) / -1=上一月(从左滑入)，驱动月格入场动画 */
  const [slideDir, setSlideDir] = useState(1)

  const days = useMemo(() => monthGrid(anchor, wso), [anchor, wso])
  /** 月格随月份变化而整体 remount，从而重放入场动画 */
  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntryItem[]>()
    for (const d of days) {
      const key = toDateKey(d)
      // 月历：只显示日程，不显示任务（任务在密集的 6×7 网格里太挤）
      // —— 周历两种都保留
      const list = buildDayList(entries, recurringDone, key, { isCalendarView: true }).filter(
        (it) => {
          const e = it.kind === 'entry' ? it.entry : it.template
          return e.kind === 'event'
        },
      )
      map.set(key, list)
    }
    return map
  }, [entries, recurringDone, days])

  const shiftMonth = (delta: number) => {
    setSlideDir(delta >= 0 ? 1 : -1)
    const d = new Date(anchor)
    d.setDate(1)
    d.setMonth(d.getMonth() + delta)
    setAnchor(d)
  }

  /** popover 里选了某年某月 → 跳过去 */
  const pickMonth = (year: number, month: number) => {
    const d = new Date(anchor)
    d.setFullYear(year)
    d.setMonth(month)
    d.setDate(1)
    setAnchor(d)
  }

  const dayList = highlightKey ? (byDay.get(highlightKey) ?? []) : []

  return (
    <div className="jot-view is-wide">
      <div className="jot-cal-head">
        <div className="jot-cal-nav">
          <button type="button" className="jot-icon-btn" onClick={() => shiftMonth(-1)} aria-label={l('上一月', 'Previous month')}>
            ‹
          </button>
          <button
            type="button"
            className="jot-cal-title jot-cal-title-btn"
            title={l('点击选年/月', 'Choose year and month')}
            onClick={(e) => {
              // 必须在 handler 内同步取 rect —— 不能放进 setState 的 updater 闭包，
              // 否则 React 在渲染调度执行 updater 时 e.currentTarget 已被置空，
              // 触发 null.getBoundingClientRect() 崩溃
              const rect = e.currentTarget.getBoundingClientRect()
              setMonthPopRect((r) => (r ? null : rect))
            }}
            aria-label={l('选择年月', 'Choose year and month')}
            aria-expanded={!!monthPopRect}
          >
            {lang === 'en' ? format(anchor, 'MMMM yyyy') : monthLabel(anchor)}
            <span className="jot-cal-title-caret">▾</span>
          </button>
          <button type="button" className="jot-icon-btn" onClick={() => shiftMonth(1)} aria-label={l('下一月', 'Next month')}>
            ›
          </button>
        </div>
        <button
          type="button"
          className="jot-text-btn"
          onClick={() => {
            setAnchor(new Date())
            setSelected(TODAY())
          }}
        >
          {l('回到今天', 'Back to today')}
        </button>
      </div>

      {monthPopRect && (
        <MonthPopover
          anchorRect={monthPopRect}
          anchor={anchor}
          onPick={(y, m) => pickMonth(y, m)}
          onClose={() => setMonthPopRect(null)}
        />
      )}

      <div className="jot-month-layout">
        <div className="jot-month-col">
          {/* 星期表头必须放在日历列里、跟 .jot-month 同宽，
              否则展开「日程详情」面板后，右边的 六/日 会被面板挡掉看不见 */}
          <div className="jot-cal-weekdays">
            {(lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : weekdayShort)
              // 按用户设置的一周起始日旋转显示顺序
              .slice(wso)
              .concat((lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : weekdayShort).slice(0, wso))
              .map((w) => (
                <span key={w}>{w}</span>
              ))}
          </div>
          <div
            className="jot-month"
            key={monthKey}
            style={{ '--jot-enter-x': slideDir > 0 ? '36px' : '-36px' } as CSSProperties}
          >
          {days.map((d) => {
            const key = toDateKey(d)
            const list = byDay.get(key) ?? []
            const inMonth = d.getMonth() === anchor.getMonth()
            const isToday = isSameDay(d, new Date())
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            // 「顶上日期」高亮：selected 优先，否则跟随活动日期
            const isHighlight = highlightKey === key
            return (
              <div
                key={key}
                className={[
                  'jot-mcell',
                  inMonth ? '' : 'is-outside',
                  isToday ? 'is-today' : '',
                  isWeekend && inMonth ? 'is-weekend' : '',
                  isHighlight ? 'is-selected' : '',
                  dragKey === key ? 'is-dragover' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(isHighlight ? null : key)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragKey(key)
                }}
                onDragLeave={() => setDragKey((k) => (k === key ? null : k))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragKey(null)
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) void moveToDate(id, key)
                }}
              >
                <span className="jot-mcell-num">{d.getDate()}</span>
                {isHighlight && (
                  <span className="jot-mcell-pin" title={l('顶栏选中这一天', 'Selected in the header')}>
                    ●
                  </span>
                )}
                <div className="jot-mcell-items">
                  {list.slice(0, MAX_PER_CELL).map((it) => {
                    const e = itemEntry(it)
                    const done = it.kind === 'entry' ? it.entry.done : it.done
                    return (
                      <div
                        key={
                          it.kind === 'entry'
                            ? `e:${e.id}`
                            : `r:${e.id}:${it.occurrenceDateKey}`
                        }
                        className={`jot-mini k-${e.kind} ${done ? 'is-done' : ''} ${
                          e.tentative ? 'is-tentative' : ''
                        }`}
                        data-cat={e.category ?? undefined}
                        style={{
                          ['--mk' as string]:
                            (e.category && displayColor(e)) || 'var(--ink-3)',
                        }}
                        draggable={it.kind === 'entry'}
                        onDragStart={(ev) => {
                          if (it.kind !== 'entry') return
                          ev.dataTransfer.setData('text/plain', e.id)
                          ev.stopPropagation()
                        }}
                        onContextMenu={(ev) => {
                          ev.preventDefault()
                          // 重复任务虚拟实例用模板 id，让右键菜单作用在模板上
                          const id = it.kind === 'entry' ? it.entry.id : it.template.id
                          openCtxMenu({ entryId: id, x: ev.clientX, y: ev.clientY })
                        }}
                        title={e.plainText}
                      >
                        <span className="jot-mini-dot" />
                        <span className="jot-mini-t">{e.plainText || l('（空）', '(empty)')}</span>
                      </div>
                    )
                  })}
                  {list.length > MAX_PER_CELL && (
                    <span className="jot-mcell-more">+{list.length - MAX_PER_CELL}</span>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>

        {highlightKey && (
          <aside className="jot-day-detail">
            <h2 className="jot-group-title t-amber">
              {friendlyDate(highlightKey, lang)}
              <span className="jot-group-count">{dayList.length}</span>
              <button
                type="button"
                className="jot-day-detail-close"
                onClick={() => setSelected(null)}
                title={l('收起', 'Close')}
                aria-label={l('收起日程面板', 'Close event details')}
              >
                ×
              </button>
            </h2>
            <div className="jot-list">
              {dayList.length ? (
                dayList.map((it) => (
                  <EntryCard
                    key={
                      it.kind === 'entry'
                        ? `e:${it.entry.id}`
                        : `r:${it.template.id}:${it.occurrenceDateKey}`
                    }
                    item={it}
                  />
                ))
              ) : (
                <p className="jot-empty">{l('这天没有安排。点顶上输入框或下面的「＋」写一条会自动落到这里。', 'Nothing scheduled. Add an event above or with the + button below.')}</p>
              )}
            </div>
            <DayDetailInlineAdd dayKey={highlightKey} />
          </aside>
        )}
      </div>
    </div>
  )
}

/** 月历右侧面板的「就地添加日程」按钮 → 输入框 */
function DayDetailInlineAdd({ dayKey }: { dayKey: string }) {
  const l = useL()
  const [active, setActive] = useState(false)
  const [text, setText] = useState('')

  if (!active) {
    return (
      <button
        type="button"
        className="jot-col-add k-event"
        onClick={() => setActive(true)}
      >
        <span className="jot-col-add-plus">＋</span>
        {l('加一条日程', 'Add an event')}
      </button>
    )
  }

  const commit = async () => {
    const raw = text.trim()
    if (!raw) return
    await createFromInput(raw, dayKey, 'event')
    setText('')
  }

  return (
    <input
      className="jot-col-input"
      autoFocus
      value={text}
      placeholder={l('加一条日程，说「几点」自动带时间', 'Add an event and time')}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (!text.trim()) setActive(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          void commit()
        }
        if (e.key === 'Escape') {
          setText('')
          setActive(false)
        }
      }}
    />
  )
}
