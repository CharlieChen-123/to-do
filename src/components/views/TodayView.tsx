import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Entry, EntryKind } from '../../types'
import { EntryCard } from '../EntryCard'
import { createFromInput, reorderEntries } from '../../lib/actions'
import { TODAY } from '../../lib/date'
import {
  buildDayList,
  type DayEntryItem,
  useEntries,
  useRecurringDone,
} from '../../lib/useEntries'
import { useUi } from '../../store/ui'
import { SelectionBar } from '../SelectionBar'
import { useL } from '../../i18n'

export function TodayView() {
  const l = useL()
  const entries = useEntries()
  const recurringDone = useRecurringDone()
  const showSchedule = useUi((s) => s.showSchedule)
  const setShowSchedule = useUi((s) => s.setShowSchedule)
  const scheduleCollapsed = useUi((s) => s.scheduleCollapsed)
  const setScheduleCollapsed = useUi((s) => s.setScheduleCollapsed)
  const manageMode = useUi((s) => s.manageMode)
  const setManageMode = useUi((s) => s.setManageMode)
  /** 顶部「活跃日期」—— 跟着顶栏 ‹ › 切换；不是真实今天时只显示那天自己的任务/日程，不显示逾期组 */
  const activeDateKey = useUi((s) => s.activeDateKey)
  const today = activeDateKey
  const isRealToday = today === TODAY()

  const allItems = buildDayList(entries, recurringDone, today)

  /**
   * 框选/Shift 选中交互（仅 manageMode=false 时启用）：
   *  - 空白处按住左键拖拽 → 框选（marquee 矩形）。**空白范围不再局限于 .jot-list 内**——
   *    任何落在 rootRef 范围内、且不在交互元素（按钮/输入框/卡片本身/链接等）里的
   *    mousedown 都会启动 marquee；命中判定会自动筛选 root 范围内所有 .jot-row-manage。
   *  - Shift + 单击卡片 → 切换选中
   *  - 单击卡片（非 shift）→ 展开编辑（原有行为不变）
   *  - Esc → 清空 selection
   * 性能策略：拖拽过程中用 ref 直接改 DOM（不动 React state），仅 mouseup 时
   * 把命中 key 写入 store；marquee 矩形也是 fixed 定位 + ref 操作 style。
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
        if (el.classList?.contains('jot-row-manage')) {
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
      // 任何 mousedown 必须先判断：起点是不是已经落在某条任务上？
      //   - 命中任务 + shift → 切换选中（不展开）
      //   - 命中任务（无 shift）→ 走卡片自己的 onClick（onOpen / 选中），不启动 marquee
      //   - 起点是空白（不在交互元素里、不在卡片上） → 启动 marquee
      const row = findRow(e.target)
      if (row) {
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          useUi.getState().toggleSelection(row.key)
        }
        return
      }
      // 起点不在任务 row 内：排除所有交互元素（按钮 / 输入 / 链接 / 自定义把手等）
      const t = e.target as HTMLElement
      if (
        t.closest(
          'button,input,textarea,select,a,label,[role="button"]',
        )
      )
        return
      if (t.closest('.jot-card-handle,.jot-card-del,.jot-star,.jot-check'))
        return
      // 起点必须在 .jot-content 内（任务/日程视图所在的可滚动区域），允许在
      // 列与列之间 / 列头上下方的 padding 里启动 marquee，但不允许侧栏 / 顶栏
      // / DatePopover / SearchDialog / ContextMenu 等外部面板吞掉点击。
      if (!t.closest('.jot-content')) return
      e.preventDefault()
      e.stopPropagation()
      active = { startX: e.clientX, startY: e.clientY }
      // shift 追加；否则先清掉旧选区
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
      const rows = root.querySelectorAll<HTMLElement>('.jot-row-manage')
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
      const rows = root.querySelectorAll<HTMLElement>('.jot-row-manage')
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
      // 阻止 mouseup 接着触发 card body 的 onClick（避免点空白时点到卡片）
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

  // 列表固定按类别聚合排序（buildDayList 内置），逾期任务不拆组、留在原类别里，
  // 靠卡片自身的 is-overdue 样式（红字+红线）区分
  //
  // 已完成任务保留在列表里（不再 filter 掉）—— 用户需求：每天的任务栏里能看到
  // 当天划掉的事情，"keep track of 我每天完成的任务"。需求是「整列底部」而不是
  // 每个类别块底部：所有类别未完成排完后，done 项统一沉到尾部，方便一眼扫。
  const allTasks = allItems.filter((it) => {
    const k = it.kind === 'entry' ? it.entry.kind : it.template.kind
    if (k !== 'task') return false
    if (it.kind === 'entry' && it.entry.dateKey !== today) return false
    return true
  })
  const tasks = allTasks.filter((it) => {
    const done = it.kind === 'entry' ? it.entry.done : it.done
    return !done
  })
  const doneTasks = allTasks.filter((it) => {
    const done = it.kind === 'entry' ? it.entry.done : it.done
    return done
  })
  const events = allItems.filter((it) => {
    const k = it.kind === 'entry' ? it.entry.kind : it.template.kind
    if (k !== 'event') return false
    if (it.kind === 'entry' && it.entry.dateKey !== today) return false
    return true
  })

  // 徽章只算未完成（侧栏口径也一致）
  const taskCount = tasks.length

  // 管理模式下的拖拽状态：当前正在拖哪个 id、目标行 id + 插入位置
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    pos: 'before' | 'after'
  } | null>(null)

  const handleReorder = async (kind: EntryKind, orderedIds: string[]) => {
    // 拖拽只重写同类内的手动顺序（order），类别聚合排序不变
    await reorderEntries(today, kind, orderedIds)
    setDragId(null)
    setDropTarget(null)
  }

  /**
   * 给定完整可见列表、源 id、目标 (id, pos)，返回新的完整 id 顺序。
   * 重复任务虚拟实例不能重排——只搬动普通条目。
   */
  const computeNewOrder = (
    list: DayEntryItem[],
    sourceId: string,
    targetId: string,
    pos: 'before' | 'after',
  ): string[] | null => {
    const ids = list
      .filter((it) => it.kind === 'entry' && it.entry.kind)
      .map((it) => (it as { entry: { id: string } }).entry.id)
    if (!ids.includes(sourceId) || !ids.includes(targetId)) return null
    if (sourceId === targetId) return null
    const without = ids.filter((id) => id !== sourceId)
    const targetIdx = without.indexOf(targetId)
    if (targetIdx < 0) return null
    const insertAt = pos === 'before' ? targetIdx : targetIdx + 1
    without.splice(insertAt, 0, sourceId)
    return without
  }

  return (
    <div ref={rootRef} className="jot-view is-wide">
      <div
        ref={marqueeRef}
        className="jot-marquee-box"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
      <div className={`jot-today ${showSchedule ? '' : 'is-schedule-hidden'}`}>
        <section className="jot-col">
          <header className="jot-col-head-row">
            <ColHead title={l('任务', 'Tasks')} tone="blue" count={taskCount} />
            <div className="jot-col-head-actions">
              <button
                type="button"
                className={`jot-col-manage ${manageMode ? 'is-on' : ''}`}
                onClick={() => setManageMode(!manageMode)}
                title={manageMode ? l('退出管理模式', 'Leave manage mode') : l('进入管理模式（批量删 + 拖动改顺序）', 'Manage tasks: delete or reorder')}
                aria-pressed={manageMode}
              >
                {manageMode ? l('完成', 'Done') : l('管理', 'Manage')}
              </button>
              {!showSchedule && (
                <button
                  type="button"
                  className="jot-col-restore"
                  onClick={() => setShowSchedule(true)}
                  title={l('显示日程列', 'Show events')}
                >
                  <span className="jot-col-restore-plus">＋</span>
                  {l('显示日程', 'Show events')}
                </button>
              )}
            </div>
          </header>
          <div className="jot-list">
            {tasks.map((it) => (
              <ManageRow
                key={itemKey(it)}
                item={it}
                manageMode={manageMode}
                onDragStart={() => {
                  if (it.kind === 'entry') setDragId(it.entry.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropTarget(null)
                }}
                isDragging={it.kind === 'entry' && dragId === it.entry.id}
                dropPos={
                  it.kind === 'entry' && dropTarget?.id === it.entry.id
                    ? dropTarget.pos
                    : null
                }
                onDropPos={(pos) => {
                  if (it.kind !== 'entry') return
                  if (pos === null) {
                    setDropTarget((t) => (t && t.id === it.entry.id ? null : t))
                  } else {
                    setDropTarget({ id: it.entry.id, pos })
                  }
                }}
                onDropCommit={(sourceId, targetId, pos) => {
                  if (it.kind !== 'entry') return
                  const newOrder = computeNewOrder(tasks, sourceId, targetId, pos)
                  if (newOrder) void handleReorder('task', newOrder)
                }}
              />
            ))}
            {!taskCount && (
              <p className="jot-empty">
                {isRealToday
                  ? l('这里还空着。下面直接加一条。', 'No tasks yet. Add one below.')
                  : l('这天没有任务。下面直接加一条，会自动落到现在选中的日期。', 'No tasks for this day. Add one below.')}
              </p>
            )}
            {/* 已完成任务（当天划掉）整列沉到底部 + 划掉 —— 用户需求 */}
            {doneTasks.length > 0 && (
              <>
                <div className="jot-list-divider" aria-hidden="true">
                  <span className="jot-list-divider-txt">
                    {l(`今天已完成 ${doneTasks.length}`, `Completed today: ${doneTasks.length}`)}
                  </span>
                </div>
                {doneTasks.map((it) => (
                  <ManageRow
                    key={itemKey(it)}
                    item={it}
                    manageMode={manageMode}
                    onDragStart={() => {
                      if (it.kind === 'entry') setDragId(it.entry.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setDropTarget(null)
                    }}
                    isDragging={it.kind === 'entry' && dragId === it.entry.id}
                    dropPos={
                      it.kind === 'entry' && dropTarget?.id === it.entry.id
                        ? dropTarget.pos
                        : null
                    }
                    onDropPos={(pos) => {
                      if (it.kind !== 'entry') return
                      if (pos === null) {
                        setDropTarget((t) => (t && t.id === it.entry.id ? null : t))
                      } else {
                        setDropTarget({ id: it.entry.id, pos })
                      }
                    }}
                    onDropCommit={(sourceId, targetId, pos) => {
                      if (it.kind !== 'entry') return
                      // 已完成是独立分段，只在它自己内部重排。
                      // reorderEntries 会把没传进来的同组条目按旧 order 追加到末尾，
                      // 所以未完成任务那批的相对顺序不会被这次重排打乱。
                      const newOrder = computeNewOrder(
                        doneTasks,
                        sourceId,
                        targetId,
                        pos,
                      )
                      if (newOrder) void handleReorder('task', newOrder)
                    }}
                  />
                ))}
              </>
            )}
          </div>
          <InlineAdd kind="task" defaultDateKey={today} placeholder={l('加一条任务，回车继续写下一条', 'Add a task; press Enter to add another')} />
        </section>

        {showSchedule && (
          <>
            <div className="jot-col-div" />
            <section className="jot-col">
              <header className="jot-col-head-row">
                <ColHead title={l('日程', 'Events')} tone="amber" count={events.length} />
                <div className="jot-col-head-actions">
                  <button
                    type="button"
                    className={`jot-col-manage ${manageMode ? 'is-on' : ''}`}
                    onClick={() => setManageMode(!manageMode)}
                    title={manageMode ? l('退出管理模式', 'Leave manage mode') : l('进入管理模式（批量删 + 拖动改顺序）', 'Manage events: delete or reorder')}
                    aria-pressed={manageMode}
                  >
                    {manageMode ? l('完成', 'Done') : l('管理', 'Manage')}
                  </button>
                  <button
                    type="button"
                    className={`jot-col-chev ${scheduleCollapsed ? 'is-collapsed' : ''}`}
                    onClick={() => setScheduleCollapsed(!scheduleCollapsed)}
                    title={scheduleCollapsed ? l('展开日程', 'Expand events') : l('收起日程', 'Collapse events')}
                    aria-label={scheduleCollapsed ? l('展开日程', 'Expand events') : l('收起日程', 'Collapse events')}
                    disabled={manageMode}
                  >
                    ▾
                  </button>
                  <button
                    type="button"
                    className="jot-col-hide"
                    onClick={() => setShowSchedule(false)}
                    title={l('隐藏日程列', 'Hide events')}
                    aria-label={l('隐藏日程列', 'Hide events')}
                    disabled={manageMode}
                  >
                    ×
                  </button>
                </div>
              </header>
              {!scheduleCollapsed && (
                <>
                  <div className="jot-list">
                    {events.map((it) => (
                      <ManageRow
                        key={itemKey(it)}
                        item={it}
                        manageMode={manageMode}
                        onDragStart={() => {
                          if (it.kind === 'entry') setDragId(it.entry.id)
                        }}
                        onDragEnd={() => {
                          setDragId(null)
                          setDropTarget(null)
                        }}
                        isDragging={it.kind === 'entry' && dragId === it.entry.id}
                        dropPos={
                          it.kind === 'entry' && dropTarget?.id === it.entry.id
                            ? dropTarget.pos
                            : null
                        }
                        onDropPos={(pos) => {
                          if (it.kind !== 'entry') return
                          if (pos === null) {
                            setDropTarget((t) => (t && t.id === it.entry.id ? null : t))
                          } else {
                            setDropTarget({ id: it.entry.id, pos })
                          }
                        }}
                        onDropCommit={(sourceId, targetId, pos) => {
                          if (it.kind !== 'entry') return
                          const newOrder = computeNewOrder(events, sourceId, targetId, pos)
                          if (newOrder) void handleReorder('event', newOrder)
                        }}
                      />
                    ))}
                    {!events.length && (
                      <p className="jot-empty">
                        {isRealToday ? l('今天没有安排。', 'Nothing scheduled today.') : l('这天没有安排。', 'Nothing scheduled for this day.')}
                      </p>
                    )}
                  </div>
                  <InlineAdd
                    kind="event"
                    defaultDateKey={today}
                    placeholder={l('加一条日程，说「几点」自动带时间', 'Add an event and time')}
                  />
                </>
              )}
            </section>
          </>
        )}
      </div>

      {manageMode && (
        <div className="jot-manage-badge" role="status">
          {l('管理模式 · 点红圈删除、拖三杠改顺序', 'Manage mode · Delete or drag to reorder')}
          <button type="button" onClick={() => setManageMode(false)}>
            {l('退出', 'Exit')}
          </button>
        </div>
      )}

      <SelectionBar items={allItems} />
    </div>
  )
}

function itemKey(it: DayEntryItem): string {
  return it.kind === 'entry' ? `e:${it.entry.id}` : `r:${it.template.id}:${it.occurrenceDateKey}`
}

/**
 * 把 EntryCard 包一层，用来做：
 *  1) 拖拽视觉：当前正在拖的卡片淡出、目标行根据鼠标位置显示「插在前面/后面」的指示线
 *  2) 非管理模式下完全透传，不影响原有交互
 */
function ManageRow({
  item,
  manageMode,
  onDragStart,
  onDragEnd,
  isDragging,
  dropPos,
  onDropPos,
  onDropCommit,
}: {
  item: DayEntryItem
  manageMode: boolean
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
  dropPos: 'before' | 'after' | null
  onDropPos: (pos: 'before' | 'after' | null) => void
  onDropCommit: (sourceId: string, targetId: string, pos: 'before' | 'after') => void
}) {
  const id = item.kind === 'entry' ? item.entry.id : null
  const key = itemKey(item)
  const isSelected = useUi((s) => s.selection.has(key))

  return (
    <div
      className={[
        'jot-row-manage',
        manageMode ? 'is-manage' : '',
        isDragging ? 'is-dragging' : '',
        dropPos === 'before' ? 'is-drop-before' : '',
        dropPos === 'after' ? 'is-drop-after' : '',
        isSelected ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-item-key={key}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={
        manageMode && id
          ? (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const rect = e.currentTarget.getBoundingClientRect()
              const pos: 'before' | 'after' =
                e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
              onDropPos(pos)
            }
          : undefined
      }
      onDrop={
        manageMode && id
          ? (e) => {
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              const pos: 'before' | 'after' =
                e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
              // 源 id 从 dataTransfer 读（更可靠，不依赖 React state）
              const sourceId = e.dataTransfer.getData('text/plain') || id
              onDropCommit(sourceId, id, pos)
            }
          : undefined
      }
    >
      <EntryCard item={item} />
    </div>
  )
}

function ColHead({
  title,
  tone,
  count,
}: {
  title: string
  tone: 'blue' | 'amber'
  count: number
}) {
  return (
    <h2 className={`jot-col-title t-${tone}`}>
      {title}
      <span className="jot-group-count">{count}</span>
    </h2>
  )
}

/** 列底部就地添加：点一下变输入框，回车连续加。 */
function InlineAdd({
  kind,
  defaultDateKey,
  placeholder,
}: {
  kind: EntryKind
  defaultDateKey: string
  placeholder: string
}) {
  const l = useL()
  const [active, setActive] = useState(false)
  const [text, setText] = useState('')

  if (!active) {
    return (
      <button
        type="button"
        className={`jot-col-add k-${kind}`}
        onClick={() => setActive(true)}
      >
        <span className="jot-col-add-plus">＋</span>
        {kind === 'task' ? l('加一条任务', 'Add a task') : l('加一条日程', 'Add an event')}
      </button>
    )
  }

  const commit = async () => {
    const raw = text.trim()
    if (!raw) return
    await createFromInput(raw, defaultDateKey, kind)
    setText('')
  }

  return (
    <input
      className="jot-col-input"
      autoFocus
      value={text}
      placeholder={placeholder}
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

/** 已完成 / 过去日程等复用 */
export function Group({
  title,
  tone,
  count,
  items,
  children,
}: {
  title: string
  tone: 'red' | 'amber' | 'blue' | 'gray'
  count: number
  items: Entry[]
  children?: ReactNode
}) {
  if (!count && !children) return null
  return (
    <section className="jot-group">
      <h2 className={`jot-group-title t-${tone}`}>
        {title}
        <span className="jot-group-count">{count}</span>
      </h2>
      <div className="jot-list">
        {items.map((e) => (
          <EntryCard key={e.id} item={{ kind: 'entry', entry: e }} />
        ))}
        {children}
      </div>
    </section>
  )
}
