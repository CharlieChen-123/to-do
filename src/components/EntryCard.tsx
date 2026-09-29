import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { EntryKind } from '../types'
import { useUi } from '../store/ui'
import {
  changeKind,
  checkRecurring,
  removeEntry,
  setSchedule,
  toggleDone,
  toggleStarred,
  toggleTentative,
  uncheckRecurring,
  updateContent,
} from '../lib/actions'
import { undoLast } from '../lib/undo'
import { combineDateTime, format, formatTime, friendlyDate, fromDateKey, isOverdue, safeFormatTime, TODAY } from '../lib/date'
import type { DayEntryItem } from '../lib/useEntries'
import { itemEntry } from '../lib/useEntries'
import { displayColor } from '../lib/categories'
import { tagLabel } from '../lib/tags'
import { useSettings } from '../store/settings'
import { useL } from '../i18n'
import { Toolbar } from './Toolbar'
import { IconStar } from './Icons'
import { ErrorBoundary } from './ErrorBoundary'

// 富文本编辑器体积较大，只有展开卡片时才加载。
const RichEditor = lazy(async () => ({ default: (await import('./Editor')).Editor }))

/**
 * 安全地把 entry.content 转成可注入 dangerouslySetInnerHTML 的 HTML 字符串。
 * 早期版本 / AI 整理 / 导入残留可能把 content 存成 tiptap JSON 对象、数组或数字，
 * 直接喂给 __html 会让 React 抛错 → 整页白屏。这里统一降级为纯文本。
 */
function toSafeHtml(content: unknown, plainText?: string, empty = '(empty)'): string {
  if (typeof content === 'string') return content.length ? content : `<p class="is-empty">${empty}</p>`
  if (content == null) return `<p class="is-empty">${empty}</p>`
  const escaped = (plainText ?? '').replace(
    /[&<>]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string),
  )
  return escaped ? `<p>${escaped}</p>` : `<p class="is-empty">${empty}</p>`
}

const KIND_LABEL: Record<EntryKind, string> = {
  task: '任务',
  event: '日程',
}

/** 重复任务实例：用于右键 / 编辑时定位到模板 */
function itemId(it: DayEntryItem): string {
  return it.kind === 'entry' ? it.entry.id : it.template.id
}

function itemDone(it: DayEntryItem): boolean {
  return it.kind === 'entry' ? it.entry.done : it.done
}

export function EntryCard({ item }: { item: DayEntryItem }) {
  const l = useL()
  const targetId = itemId(item)
  const editing = useUi((s) => s.editingId === targetId)
  const setEditing = useUi((s) => s.setEditing)

  return (
    <ErrorBoundary label={l(`条目 ${targetId}`, `Entry ${targetId}`)}>
      {editing ? (
        <ExpandedCard item={item} onClose={() => setEditing(null)} />
      ) : (
        <CollapsedCard
          item={item}
          onOpen={() => setEditing(targetId)}
        />
      )}
    </ErrorBoundary>
  )
}

/* ---------- 收起态 ---------- */

function CollapsedCard({ item, onOpen }: { item: DayEntryItem; onOpen: () => void }) {
  const l = useL()
  const entry = itemEntry(item)
  const openCtxMenu = useUi((s) => s.openCtxMenu)
  const manageMode = useUi((s) => s.manageMode)
  const pushToast = useUi((s) => s.pushToast)
  const touchTimer = useRef<number | null>(null)
  // 重复任务的左括号要「截止日（含）前的每天都画」。起始日走 entry 分支没有
  // item.kind==='recurring'，所以这里额外看 entry 自身的 recurring 字段——
  // 只要任务是 daily 重复，每一天都该挂 is-recurring 类。
  const isRecurring = item.kind === 'recurring' || entry.recurring === 'daily'
  const done = itemDone(item)
  const overdue =
    !isRecurring && entry.kind === 'task' && isOverdue(entry)

  useEffect(() => {
    return () => {
      if (touchTimer.current) window.clearTimeout(touchTimer.current)
    }
  }, [])

  const cancelTouch = () => {
    if (touchTimer.current) {
      window.clearTimeout(touchTimer.current)
      touchTimer.current = null
    }
  }

  const toggleCheck = (ev: React.MouseEvent) => {
    ev.stopPropagation()
    // 多日任务的完成语义：范围内任意一天勾掉 → 从那天起保持已完成到结束日。
    // - 虚拟实例（recurring 分支，中间天/结束天）：写 recurringDone[当天]
    // - 起始日走 entry 分支：item.template 是 undefined，绝不能走上面的路径，
    //   必须用 toggleDone —— 它内部会同步写/删 recurringDone[开始日]。
    //   （之前这里用 isRecurring 判断导致起始日点勾直接抛 TypeError）
    if (item.kind === 'recurring') {
      const t = item.template
      if (item.done) {
        void uncheckRecurring(t.id, item.occurrenceDateKey)
      } else {
        void checkRecurring(t.id, item.occurrenceDateKey)
      }
    } else {
      void toggleDone(entry)
    }
  }

  const onDeleteClick = (ev: React.MouseEvent) => {
    ev.stopPropagation()
    // 和 toggleCheck 同一个道理：必须按 item.kind 收窄，不能用 isRecurring。
    // 起始日（模板自身）item.kind === 'entry'，没有 item.template，
    // 它自己就是模板行，直接 removeEntry(entry) 即可删掉整条重复。
    if (item.kind === 'recurring') {
      // 重复任务实例"删"= 把模板软删（不再每日出现）
      void removeEntry(item.template)
    } else {
      void removeEntry(entry)
    }
    const title = (entry.plainText || l('（空）', '(empty)')).slice(0, 12)
    pushToast(l(`已删除「${title}」`, `Deleted “${title}”`), {
      action: { label: l('撤销', 'Undo'), onClick: () => void undoLast() },
      ttl: 8000,
    })
  }

  // 在 manage 模式下隐藏正文点击进入编辑（避免和拖动冲突）；
  // 星标已在 CSS 里隐藏。
  return (
    <div
      className={[
        'jot-card',
        `k-${entry.kind}`,
        done ? 'is-done' : '',
        entry.tentative ? 'is-tentative' : '',
        overdue ? 'is-overdue' : '',
        entry.starred ? 'is-starred' : '',
        isRecurring ? 'is-recurring' : '',
        manageMode ? 'is-manage' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      // 卡片显示色由 category 决定（color 字段已废弃）。
      // 用 data-cat 喂 CSS，--mk 被 CSS 里 .jot-card[data-cat='school'] 等规则设置。
      data-cat={entry.category ?? undefined}
      // 兜底：没有 category 时给个 ink-3（中性灰），保持视觉一致
      style={{
        ['--mk' as string]:
          (entry.category && displayColor(entry)) || 'var(--ink-3)',
      }}
      draggable={manageMode && !isRecurring}
      onDragStart={
        manageMode && !isRecurring
          ? (ev) => {
              ev.dataTransfer.effectAllowed = 'move'
              ev.dataTransfer.setData('text/plain', entry.id)
              // 不 stopPropagation —— 让外层 .jot-row-manage 的 onDragStart 也能触发，
              // 这样 React state 里的 dragId 才能被设置，源卡片淡出的视觉指示才能生效。
            }
          : undefined
      }
      onContextMenu={(e) => {
        if (manageMode) return
        e.preventDefault()
        openCtxMenu({ entryId: itemId(item), x: e.clientX, y: e.clientY })
      }}
      onTouchStart={(e) => {
        if (manageMode) return
        cancelTouch()
        const t = e.touches[0]
        if (!t) return
        touchTimer.current = window.setTimeout(() => {
          openCtxMenu({ entryId: itemId(item), x: t.clientX, y: t.clientY })
        }, 520)
      }}
      onTouchMove={cancelTouch}
      onTouchEnd={cancelTouch}
      onTouchCancel={cancelTouch}
    >
      {manageMode ? (
        <button
          type="button"
          className="jot-card-del"
          title={l('删除（Ctrl+Z 撤销）', 'Delete (Ctrl+Z to undo)')}
          aria-label={l(`删除「${entry.plainText || '（空）'}」`, `Delete “${entry.plainText || '(empty)'}”`)}
          onClick={onDeleteClick}
        >
          −
        </button>
      ) : entry.kind === 'task' ? (
        <span className="jot-mark">
          <button
            type="button"
            className={`jot-check ${done ? 'is-done' : ''}`}
            aria-label={done ? l('标记为未完成', 'Mark incomplete') : l('标记为完成', 'Mark complete')}
            onClick={toggleCheck}
          >
            <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
              <path
                d="M4.5 10.5 L8 14 L15.5 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      ) : (
        <span className="jot-mark is-bar">
          <span className="jot-bar" aria-hidden="true" />
        </span>
      )}
      <div
        className="jot-card-body"
        onClick={
          manageMode
            ? undefined
            : (e) => {
                // Shift+点击 是「切换选中」语义，绝不展开成 description。
                // mousedown 阶段已 toggleSelection；这里确保 click 不再展开。
                if (e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  return
                }
                onOpen()
              }
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (manageMode) return
          if (e.shiftKey) return
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <div
          className="jot-html"
          dangerouslySetInnerHTML={{ __html: toSafeHtml(entry.content, entry.plainText, l('（空）', '(empty)')) }}
        />
      </div>
      <Meta item={item} />
      {manageMode ? (
        <span
          className="jot-card-handle"
          aria-hidden="true"
          title={l('拖动改顺序', 'Drag to reorder')}
        >
          <span />
          <span />
          <span />
        </span>
      ) : (
        <button
          type="button"
          className={`jot-star ${entry.starred ? 'is-on' : ''}`}
          title={entry.starred ? l('取消星标', 'Remove star') : l('星标置顶', 'Star and pin')}
          aria-label={entry.starred ? l('取消星标', 'Remove star') : l('星标置顶', 'Star and pin')}
          onClick={(e) => {
            e.stopPropagation()
            void toggleStarred(entry)
          }}
        >
          <IconStar filled={entry.starred} />
        </button>
      )}
    </div>
  )
}

function Meta({ item }: { item: DayEntryItem }) {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const entry = itemEntry(item)
  const bits: ReactNode[] = []
  if (entry.kind === 'event' && entry.startAt && !entry.allDay) {
    // 重复任务的事件时间：按当天的日期 + 模板的小时分钟
    const startIso =
      item.kind === 'recurring'
        ? combineDateTime(item.occurrenceDateKey, (() => {
            const [h, m] = formatTime(entry.startAt).split(':').map(Number)
            return { hour: h, minute: m }
          })())
        : entry.startAt
    const startStr = safeFormatTime(startIso)
    // 时间非法（Invalid Date）时跳过时间徽标，不抛错
    if (startStr) {
      bits.push(
        <span key="t" className="jot-meta-time">
          {startStr}
          {entry.endAt ? `–${safeFormatTime(entry.endAt)}` : ''}
        </span>,
      )
    }
  }
  // 重复任务徽标：按模板字段判断（而非 item.kind），这样起始日（entry 路径）
  // 和中间/最后天（recurring 路径）都会带上 ↻ / → 截止日，让用户每天都能
  // 看出"这条是连续多日任务里的某一天"。
  if (entry.recurring === 'daily') {
    bits.push(
      <span
        key="r"
        className="jot-meta-recurring"
        title={l('多日重复：范围内任意一天勾掉，从那天起保持已完成到结束日', 'Repeats daily until the end date')}
      >
        ↻
      </span>,
    )
    // 截止日徽标：有 recurringUntil 时每天都加（不止最后一天）
    if (entry.recurringUntil) {
      bits.push(
        <span
          key="ru"
          className="jot-meta-until"
          title={l(`重复到 ${entry.recurringUntil}`, `Repeats until ${entry.recurringUntil}`)}
        >
          → {format(fromDateKey(entry.recurringUntil), 'M/d')}
        </span>,
      )
      // 「末」徽标只在这一天 = 截止日时出现
      //   - 起始日走 entry 路径，比 entry.dateKey
      //   - 其他天走 recurring 路径，比 occurrenceDateKey
      const isLastDay =
        entry.recurringUntil ===
        (item.kind === 'recurring' ? item.occurrenceDateKey : entry.dateKey)
      if (isLastDay) {
        bits.push(
          <span key="last" className="jot-meta-last" title={l('最后一天', 'Last day')}>
            {l('末', 'End')}
          </span>,
        )
      }
    }
  }
  if (entry.dateKey) {
    bits.push(
      <span
        key="d"
        className={`jot-meta-date ${
          !item.kind && isOverdue(entry) ? 'is-overdue' : ''
        }`}
      >
        {item.kind === 'recurring' && item.occurrenceDateKey === TODAY()
          ? l('今天', 'Today')
          : friendlyDate(item.kind === 'recurring' ? item.occurrenceDateKey : entry.dateKey, lang)}
      </span>,
    )
  }
  if (entry.tentative) {
    bits.push(
      <span key="ten" className="jot-meta-ten">
        {l('待定', 'Tentative')}
      </span>,
    )
  }
  if (entry.category) {
    // 标签胶囊：颜色由标签表推导。内置标签走 CSS 的 .cat-* 规则，
    // 自建标签没有对应 class，所以这里再补一层内联色，保证任意自定义色都生效。
    const catColor = displayColor(entry)
    bits.push(
      <span
        key="cat"
        className={`jot-meta-cat cat-${entry.category}`}
        style={catColor ? { color: catColor, borderColor: `${catColor}33` } : undefined}
        title={l(`标签：${tagLabel(entry.category)}`, `Tag: ${tagLabel(entry.category, lang)}`)}
      >
        {tagLabel(entry.category, lang)}
      </span>,
    )
  }
  if (!bits.length) return null
  return <div className="jot-card-meta">{bits}</div>
}

/* ---------- 展开态 ---------- */

function ExpandedCard({ item, onClose }: { item: DayEntryItem; onClose: () => void }) {
  const l = useL()
  const entry = itemEntry(item)
  const [editor, setEditor] = useState<Editor | null>(null)
  const timer = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const pushToast = useUi((s) => s.pushToast)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const saveLater = (html: string, text: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void updateContent(entry.id, html, text)
    }, 400)
  }

  const onDateChange = (value: string) => {
    const key = value || null
    void setSchedule(entry, key, entry.startAt, entry.endAt)
  }

  const onTimeChange = (value: string) => {
    if (!value) {
      void setSchedule(entry, entry.dateKey, undefined, undefined)
      return
    }
    const key = entry.dateKey ?? TODAY()
    const [h, m] = value.split(':').map(Number)
    const start = combineDateTime(key, { hour: h, minute: m })
    // 保留原有结束时间（若仍晚于新开始时间），否则默认 +1h
    let end = entry.endAt
    if (entry.endAt) {
      if (new Date(entry.endAt) <= new Date(start)) {
        end = combineDateTime(key, { hour: Math.min(h + 1, 23), minute: m })
      }
    } else {
      end = combineDateTime(key, { hour: Math.min(h + 1, 23), minute: m })
    }
    void setSchedule(entry, entry.dateKey, start, end)
  }

  const onEndTimeChange = (value: string) => {
    if (!value) {
      void setSchedule(entry, entry.dateKey, entry.startAt, undefined)
      return
    }
    const key = entry.dateKey ?? TODAY()
    const [h, m] = value.split(':').map(Number)
    const end = combineDateTime(key, { hour: h, minute: m })
    void setSchedule(entry, entry.dateKey, entry.startAt, end)
  }

  const startTime = entry.startAt ? formatTime(entry.startAt) : ''
  const endTime = entry.endAt ? formatTime(entry.endAt) : ''

  return (
    <div
      ref={cardRef}
      className={`jot-card is-editing k-${entry.kind} ${
        entry.tentative ? 'is-tentative' : ''
      }`}
    >
      <div className="jot-card-head">
        <div className="jot-kindpick">
          {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`jot-kindpill kp-${k} ${entry.kind === k ? 'is-active' : ''}`}
              onClick={() => void changeKind(entry, k)}
            >
              {l(KIND_LABEL[k], k === 'task' ? 'Task' : 'Event')}
            </button>
          ))}
        </div>

        <div className="jot-card-head-right">
          <input
            type="date"
            className="jot-date-input"
            value={entry.dateKey ?? ''}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label={l('日期', 'Date')}
          />
          {entry.kind === 'event' && (
            <>
              <span className="jot-time-range">
                <input
                  type="time"
                  className="jot-time-input"
                  value={startTime}
                  onChange={(e) => onTimeChange(e.target.value)}
                  aria-label={l('开始时间', 'Start time')}
                />
                <span className="jot-time-sep">–</span>
                <input
                  type="time"
                  className="jot-time-input"
                  value={endTime}
                  onChange={(e) => onEndTimeChange(e.target.value)}
                  aria-label={l('结束时间', 'End time')}
                />
              </span>
              <button
                type="button"
                className={`jot-ten-toggle ${entry.tentative ? 'is-on' : ''}`}
                title={l('标记为待定（虚线 + 斜纹显示）', 'Mark as tentative')}
                onClick={() => void toggleTentative(entry)}
              >
                {l('待定', 'Tentative')}
              </button>
            </>
          )}
          <button
            type="button"
            className="jot-icon-btn"
            title={l('删除（Ctrl+Z 撤销）', 'Delete (Ctrl+Z to undo)')}
            onClick={() => {
              const title = (entry.plainText || l('（空）', '(empty)')).slice(0, 12)
              void removeEntry(entry)
              onClose()
              pushToast(l(`已删除「${title}」`, `Deleted “${title}”`), {
                action: { label: l('撤销', 'Undo'), onClick: () => void undoLast() },
                ttl: 8000,
              })
            }}
          >
            ✕
          </button>
          <button
            type="button"
            className="jot-collapse-btn"
            title={l('收起 (Esc)', 'Collapse (Esc)')}
            aria-label={l('收起 (Esc)', 'Collapse (Esc)')}
            onClick={onClose}
          >
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path
                d="M2 5 L7 10 L12 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="jot-editor">{l('正在打开编辑器…', 'Opening editor…')}</div>}>
        <RichEditor
          initialContent={typeof entry.content === 'string' ? entry.content : (entry.plainText ?? '')}
          placeholder={l('写点什么…', 'Write something…')}
          autofocus
          onChange={saveLater}
          onReady={setEditor}
          onEscape={onClose}
        />
      </Suspense>

      {editor && <Toolbar editor={editor} />}
    </div>
  )
}
