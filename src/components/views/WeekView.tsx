import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  friendlyDate,
  safeFormatTime,
  isSameDay,
  monthLabel,
  format,
  toDateKey,
  TODAY,
  weekDays,
  weekdayShort,
  startOfWeek,
} from '../../lib/date'
import { EntryCard } from '../EntryCard'
import { displayColor } from '../../lib/categories'
import { WeekPopover } from '../DatePopover'
import { SelectionBar } from '../SelectionBar'
import { useL } from '../../i18n'

/** 周视图里每个条目的稳定 key（与 TodayView 的 itemKey 同构） */
function itemKeyOf(it: DayEntryItem): string {
  return it.kind === 'entry'
    ? `e:${it.entry.id}`
    : `r:${it.template.id}:${it.occurrenceDateKey}`
}

export function WeekView() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const entries = useEntries()
  const recurringDone = useRecurringDone()
  const anchor = useUi((s) => s.anchor)
  const setAnchor = useUi((s) => s.setAnchor)
  const editingId = useUi((s) => s.editingId)
  const setSelectedDate = useUi((s) => s.setSelectedDate)
  const selected = useUi((s) => s.selectedDate)
  const activeDateKey = useUi((s) => s.activeDateKey)
  const selection = useUi((s) => s.selection)
  const manageMode = useUi((s) => s.manageMode)
  /** 「顶上日期」高亮：selected 优先，否则跟随活动日期；任意一个在列里都会显示选中框 */
  const highlightKey = selected ?? activeDateKey
  const openCtxMenu = useUi((s) => s.openCtxMenu)
  const weekStart = useSettings((s) => s.weekStart)
  /** 1=周一, 0=周日 —— 跟着设置走 */
  const wso: 0 | 1 = weekStart === 'sun' ? 0 : 1
  /** 自写指针拖拽状态：dragRef 记起点，dragIds 记正在拖的条目 key（支持多选一起拖），
   *  dragGhost 记跟随光标的浮层，dragOverKey 记当前悬停的目标列 */
  const dragRef = useRef<{
    ids: string[]
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const justDraggedRef = useRef(false)
  const [dragIds, setDragIds] = useState<string[]>([])
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  /** 非空 = 周选择 popover 打开，值是触发按钮的屏幕坐标（锚点） */
  const [weekPopRect, setWeekPopRect] = useState<DOMRect | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  // 选中某天 / 展开编辑器时，把当天详情面板滚动进可视区域（点条目就能看到编辑框）
  useEffect(() => {
    if (highlightKey) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlightKey, editingId])

  /**
   * 框选 / Shift 选中（仅在 manageMode=false 时启用）：
   *  - 周网格 `.jot-week` 内的空白处按住左键拖拽 → 框选，命中判定只看 `.jot-witem`
   *  - Shift + 单击条目 → 切换选中（不开编辑器）
   *  - 普通单击条目 → 展开编辑器（原有行为）
   *  - Esc → 清空 selection
   * 复刻 TodayView 的 marquee 实现；命中行是 `.jot-witem`（带 data-item-key）。
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const marqueeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (manageMode) return
    const root = rootRef.current
    if (!root) return
    let active: null | { startX: number; startY: number } = null

    const findRow = (
      target: EventTarget | null,
    ): { row: HTMLElement; key: string } | null => {
      let el = target as HTMLElement | null
      while (el && el !== root) {
        if (el.classList?.contains('jot-witem')) {
          const key = el.dataset.itemKey
          if (key) return { row: el, key }
          return null
        }
        el = el.parentElement
      }
      return null
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const row = findRow(e.target)
      if (row) {
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          useUi.getState().toggleSelection(row.key)
        }
        return
      }
      // 起点不在条目内：排除交互元素，避免误吞按钮/输入
      const t = e.target as HTMLElement
      if (t.closest('button,input,textarea,select,a,label,[role="button"]')) return
      // 只在周网格内启动框选；详情面板 / 顶栏等外部面板不吞点击
      if (!t.closest('.jot-week')) return
      e.preventDefault()
      e.stopPropagation()
      active = { startX: e.clientX, startY: e.clientY }
      if (!e.shiftKey) useUi.getState().clearSelection()
      const m = marqueeRef.current
      if (m) {
        m.style.display = 'block'
        m.style.left = `${e.clientX}px`
        m.style.top = `${e.clientY}px`
        m.style.width = '0px'
        m.style.height = '0px'
      }
      document.body.style.userSelect = 'none'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!active) return
      const x1 = e.clientX
      const y1 = e.clientY
      const x0 = active.startX
      const y0 = active.startY
      const left = Math.min(x0, x1)
      const top = Math.min(y0, y1)
      const right = Math.max(x0, x1)
      const bottom = Math.max(y0, y1)
      const m = marqueeRef.current
      if (m) {
        m.style.left = `${left}px`
        m.style.top = `${top}px`
        m.style.width = `${right - left}px`
        m.style.height = `${bottom - top}px`
      }
      const rows = root.querySelectorAll<HTMLElement>('.jot-witem')
      rows.forEach((row) => {
        const r = row.getBoundingClientRect()
        const hit =
          r.left <= right && r.right >= left && r.top <= bottom && r.bottom >= top
        row.classList.toggle('is-marquee-hit', hit)
      })
    }

    const finish = (e: MouseEvent) => {
      if (!active) return
      const m = marqueeRef.current
      if (m) m.style.display = 'none'
      document.body.style.userSelect = ''
      const rows = root.querySelectorAll<HTMLElement>('.jot-witem')
      const hitKeys: string[] = []
      rows.forEach((row) => {
        const hit = row.classList.contains('is-marquee-hit')
        row.classList.remove('is-marquee-hit')
        if (hit) {
          const k = row.dataset.itemKey
          if (k) hitKeys.push(k)
        }
      })
      if (hitKeys.length) useUi.getState().addSelection(hitKeys)
      active = null
      e.preventDefault()
      e.stopPropagation()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUi.getState().clearSelection()
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('mouseup', finish, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mousemove', onMouseMove, true)
      document.removeEventListener('mouseup', finish, true)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.userSelect = ''
      const m = marqueeRef.current
      if (m) m.style.display = 'none'
    }
  }, [manageMode])

  /**
   * 自写指针拖拽（不依赖原生 HTML5 DnD，WebView2 里不可靠）：
   *  - witem 的 onMouseDown 记起点与待拖 id（若在多选集合内则整批拖）
   *  - 移动超过 5px 才进入拖拽态，避免和「点开编辑器」冲突
   *  - 拖拽时跟随光标显示浮层，悬停的列高亮 is-dragover
   *  - 在 .jot-wcol 上松开 → 对每条 moveToDate 到该列日期
   */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved) {
        const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
        if (dist < 5) return
        d.moved = true
        setDragIds(d.ids.map((id) => `e:${id}`))
        document.body.style.userSelect = 'none'
      }
      const label = d.ids.length > 1 ? l(`移动 ${d.ids.length} 个任务`, `Move ${d.ids.length} tasks`) : l('移动任务', 'Move task')
      setDragGhost({ x: e.clientX, y: e.clientY, label })
      const col = (e.target as HTMLElement)?.closest('.jot-wcol')
      setDragOverKey(col?.getAttribute('data-day-key') ?? null)
    }
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.moved) {
        e.preventDefault()
        e.stopPropagation()
        const col = (e.target as HTMLElement)?.closest('.jot-wcol')
        const targetKey = col?.getAttribute('data-day-key') ?? null
        if (targetKey) {
          for (const id of d.ids) void moveToDate(id, targetKey)
        }
        justDraggedRef.current = true
        // click 会在 mouseup 之后同步触发，用 0ms 延迟把 justDragged 复位，
        // 这样 onClick 里能识别「刚拖完」并跳过打开编辑器
        setTimeout(() => {
          justDraggedRef.current = false
        }, 0)
      }
      dragRef.current = null
      setDragIds([])
      setDragGhost(null)
      setDragOverKey(null)
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      document.body.style.userSelect = ''
    }
  }, [l])

  const days = useMemo(() => weekDays(anchor, wso), [anchor, wso])

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntryItem[]>()
    for (const d of days) {
      const key = toDateKey(d)
      map.set(key, buildDayList(entries, recurringDone, key, { isCalendarView: true }))
    }
    return map
  }, [entries, recurringDone, days])

  /** 本周 7 天全部条目（传给 SelectionBar 解析选中的项） */
  const allWeekItems = useMemo(() => {
    const out: DayEntryItem[] = []
    for (const list of byDay.values()) out.push(...list)
    return out
  }, [byDay])

  const shiftWeek = (delta: number) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() + delta * 7)
    setAnchor(d)
  }

  // 当前所在周的「周序号」（年内第几周）—— 按用户设置的一周起始日算
  const weekIndex = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: wso })
    const jan1 = new Date(anchor.getFullYear(), 0, 1)
    const firstMonday = startOfWeek(jan1, { weekStartsOn: wso })
    const diffDays = Math.round((start.getTime() - firstMonday.getTime()) / 86400000)
    return Math.floor(diffDays / 7) + 1
  }, [anchor, wso])

  return (
    <div ref={rootRef} className="jot-view is-wide">
      <div
        ref={marqueeRef}
        className="jot-marquee-box"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
      {dragGhost && (
        <div
          className="jot-drag-ghost"
          aria-hidden="true"
          style={{ left: dragGhost.x + 12, top: dragGhost.y + 12 }}
        >
          {dragGhost.label}
        </div>
      )}
      <div className="jot-cal-head">
        <div className="jot-cal-nav">
          <button type="button" className="jot-icon-btn" onClick={() => shiftWeek(-1)} aria-label={l('上一周', 'Previous week')}>
            ‹
          </button>
          <button
            type="button"
            className="jot-cal-title jot-cal-title-btn"
            title={l('点击选周', 'Choose week')}
            onClick={(e) => {
              // 必须在 handler 内同步取 rect —— 不能放进 setState 的 updater 闭包，
              // 因为 React 会在渲染调度时才执行 updater，届时合成事件 e.currentTarget
              // 已被置空（事件回收），导致 null.getBoundingClientRect() 崩溃
              const rect = e.currentTarget.getBoundingClientRect()
              setWeekPopRect((r) => (r ? null : rect))
            }}
            aria-label={l('选择周', 'Choose week')}
            aria-expanded={!!weekPopRect}
          >
            {lang === 'en' ? `${format(days[0], 'MMMM yyyy')} · Week ${weekIndex}` : `${monthLabel(days[0])} · 第 ${weekIndex} 周`}
            <span className="jot-cal-title-caret">▾</span>
          </button>
          <button type="button" className="jot-icon-btn" onClick={() => shiftWeek(1)} aria-label={l('下一周', 'Next week')}>
            ›
          </button>
        </div>
        <button
          type="button"
          className="jot-text-btn"
          onClick={() => {
            setAnchor(new Date())
            // 同时让顶栏选中跳回今天，与「顶上日期高亮」一致
            useUi.getState().setActiveDateKey(TODAY())
          }}
        >
          {l('回到本周', 'Back to this week')}
        </button>
      </div>

      {weekPopRect && (
        <WeekPopover
          anchorRect={weekPopRect}
          anchor={anchor}
          onPick={(d) => setAnchor(d)}
          onClose={() => setWeekPopRect(null)}
          weekStartsOn={wso}
        />
      )}

      <div className="jot-week">
        {days.map((d) => {
          const key = toDateKey(d)
          const list = byDay.get(key) ?? []
          const isToday = isSameDay(d, new Date())
          // 周日 getDay()=0、周六=6，统一标 is-weekend 给米色底
          const dow = d.getDay()
          const isWeekend = dow === 0 || dow === 6
          // 「顶上日期」高亮：selected 优先，否则跟随活动日期
          // —— 让顶栏 ‹ › 切日期后那一列也亮起来
          const isHighlight = highlightKey === key
          return (
            <div
              key={key}
              data-day-key={key}
              className={[
                'jot-wcol',
                isToday ? 'is-today' : '',
                isWeekend ? 'is-weekend' : '',
                isHighlight ? 'is-selected' : '',
                dragOverKey === key && dragGhost ? 'is-dragover' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedDate(isHighlight ? null : key)}
            >
              <button
                type="button"
                className="jot-wcol-head"
                title={isHighlight ? l('取消选中', 'Deselect') : l('选中查看详情', 'Select to view details')}
                onClick={(e) => {
                  // 阻止冒泡到列 onClick，避免重复切换
                  e.stopPropagation()
                  setSelectedDate(isHighlight ? null : key)
                }}
              >
                <span className="jot-wcol-wd">{lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] : `周${weekdayShort[d.getDay()]}`}</span>
                <span className="jot-wcol-dnum">{d.getDate()}</span>
                {/* 顶上日期选中标记：与 is-today 同色但带「●」pin，避免被忽略 */}
                {isHighlight && (
                  <span
                    className="jot-wcol-pin"
                    title={isToday ? l('今天（顶栏选中）', 'Today (selected)') : l('顶栏选中这一天', 'Selected in the header')}
                  >
                    ●
                  </span>
                )}
              </button>

              <div className="jot-wcol-items">
                {list.map((it) => {
                  const e = itemEntry(it)
                  const done = it.kind === 'entry' ? it.entry.done : it.done
                  const ikey = itemKeyOf(it)
                  const isSel = selection.has(ikey)
                  return (
                    <div
                      key={ikey}
                      data-item-key={ikey}
                      // 标签 id 喂给 CSS（marker 颜色走 .jot-witem[data-cat] 规则），
                      // 具体色值仍由下面的内联 --mk 决定，所以自建标签也生效。
                      data-cat={e.category ?? undefined}
                      className={[
                        'jot-witem',
                        `k-${e.kind}`,
                        done ? 'is-done' : '',
                        e.tentative ? 'is-tentative' : '',
                        editingId === e.id ? 'is-active' : '',
                        isSel ? 'is-selected' : '',
                        dragIds.includes(ikey) ? 'is-dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        ['--mk' as string]:
                          (e.category && displayColor(e)) || 'var(--ink-3)',
                      }}
                      onMouseDown={(ev) => {
                        // 仅左键、非 Shift、真实条目（非多日重复实例）才允许发起拖拽
                        if (ev.button !== 0 || ev.shiftKey) return
                        if (it.kind !== 'entry') return
                        // 若本条目已在多选集合内，则整批一起拖；否则只拖它自己
                        const ids = selection.has(ikey)
                          ? [...selection]
                              .filter((k) => k.startsWith('e:'))
                              .map((k) => k.slice(2))
                          : [e.id]
                        dragRef.current = {
                          ids,
                          startX: ev.clientX,
                          startY: ev.clientY,
                          moved: false,
                        }
                      }}
                      onContextMenu={(ev) => {
                        ev.preventDefault()
                        const id = it.kind === 'entry' ? it.entry.id : it.template.id
                        openCtxMenu({ entryId: id, x: ev.clientX, y: ev.clientY })
                      }}
                      onClick={(ev) => {
                        // 刚拖完：吞掉这次 click，不打开编辑器
                        if (justDraggedRef.current) {
                          ev.stopPropagation()
                          return
                        }
                        // Shift+点 = 切换选中（由 marquee 的 mousedown 处理），这里不再开编辑器
                        if (ev.shiftKey) {
                          ev.stopPropagation()
                          return
                        }
                        // 点条目 = 打开编辑：先让当天的详情面板展开，再展开编辑器（都在可见区域内）
                        ev.stopPropagation()
                        setSelectedDate(key)
                        setEditingById(e.id)
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') setEditingById(e.id)
                      }}
                    >
                      <span className="jot-witem-mark" />
                      <span className="jot-witem-t">
                        {e.kind === 'event' && e.startAt && !e.allDay && (
                          <span className="jot-witem-time">
                            {safeFormatTime(e.startAt)}
                          </span>
                        )}
                        {e.plainText || l('（空）', '(empty)')}
                      </span>
                    </div>
                  )
                })}
              </div>

              <InlineAdd dayKey={key} />
            </div>
          )
        })}
      </div>

      {highlightKey && (
        <section className="jot-week-detail" ref={detailRef}>
          <h2 className="jot-group-title t-amber">
            {friendlyDate(highlightKey, lang)}
            <span className="jot-group-count">{(byDay.get(highlightKey) ?? []).length}</span>
            <button
              type="button"
              className="jot-col-hide"
              onClick={() => setSelectedDate(null)}
              title={l('取消选中', 'Deselect')}
              aria-label={l('取消选中', 'Deselect')}
              style={{ marginLeft: 'auto' }}
            >
              ×
            </button>
          </h2>
          <div className="jot-list">
            {((byDay.get(highlightKey) ?? []).length ? (
              (byDay.get(highlightKey) ?? []).map((it) => (
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
              <p className="jot-empty">{l('这天没有安排。点上方输入框写一条会自动落到这里。', 'Nothing scheduled. Use the input above to add something for this day.')}</p>
            ))}
          </div>
        </section>
      )}

      <SelectionBar items={allWeekItems} />
    </div>
  )
}

  function setEditingById(id: string) {
    useUi.getState().setEditing(id)
  }

function InlineAdd({ dayKey }: { dayKey: string }) {
  const l = useL()
  const [active, setActive] = useState(false)
  const [text, setText] = useState('')

  if (!active) {
    return (
      <button
        type="button"
        className="jot-wcol-add"
        onClick={(e) => {
          // 点「＋」是就地添加，不要冒泡成「选中整列」
          e.stopPropagation()
          setActive(true)
        }}
        aria-label={l(`在 ${dayKey} 添加`, `Add on ${dayKey}`)}
      >
        ＋
      </button>
    )
  }

  return (
    <input
      className="jot-wcol-input"
      autoFocus
      value={text}
      placeholder={l('回车添加', 'Press Enter to add')}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (!text.trim()) setActive(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          const raw = text.trim()
          if (raw) void createFromInput(raw, dayKey, 'task')
          setText('')
        }
        if (e.key === 'Escape') {
          setText('')
          setActive(false)
        }
      }}
    />
  )
}
