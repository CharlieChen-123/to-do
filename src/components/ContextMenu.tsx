import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry, EntryKind } from '../types'
import { useTags } from '../store/tags'
import { useUi } from '../store/ui'
import { useEntries, itemEntry } from '../lib/useEntries'
import {
  batchRemove,
  batchSetCategory,
  changeKind,
  removeEntry,
  setCategory,
  setRecurring,
  setRecurringShowInWeekMonth,
  setRecurringUntil,
  setSchedule,
  toggleTentative,
} from '../lib/actions'
import { patchEntry } from '../lib/db'
import { DatePopover } from './DatePopover'
import { undoLast } from '../lib/undo'
import { addDays, toDateKey, TODAY } from '../lib/date'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'
import { tagLabel } from '../lib/tags'

const MENU_W = 196
const SAFE = 8

const KINDS: { id: EntryKind; label: string }[] = [
  { id: 'task', label: '任务' },
  { id: 'event', label: '日程' },
]

export function ContextMenu() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const ctx = useUi((s) => s.ctxMenu)
  const close = useUi((s) => s.closeCtxMenu)
  const setEditing = useUi((s) => s.setEditing)
  const pushToast = useUi((s) => s.pushToast)
  const selection = useUi((s) => s.selection)
  const entries = useEntries()
  /** 标签表（内置 + 用户自建）。hooks 必须放在早期 return 之前。 */
  const tags = useTags()
  const ref = useRef<HTMLDivElement>(null)
  const recurringBtnRef = useRef<HTMLButtonElement>(null)
  const untilDateRef = useRef<HTMLInputElement>(null)

  // hooks 必须在早期 return 之前声明（否则 ctx 在 null/有值之间切换时
  // hook 数量变化会触发 "Rendered fewer hooks than expected"）。
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  /** 多日重复的日历选择器锚点（点击「设为多日重复…」时弹） */
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)
  /** 日历选择器当前的预选结束日（默认今天+7） */
  const [pickerValue, setPickerValue] = useState<string>(() =>
    toDateKey(addDays(new Date(), 7)),
  )

  /**
   * 解析本次右键真正要操作的目标条目数组。
   * - 如果右键点中的条目已经在 selection 里 → 整批 selected entries；
   * - 否则只对右键点中的那一条生效（避免"我在 5 条里右键其中 1 条想取消星标，
   *   结果 5 条都被取消"这种误操作）。
   * 重复任务实例会被规约到模板条目（同一模板只保留一次）。
   */
  const targets: Entry[] = (() => {
    if (!ctx) return []
    const entry = entries.find((e) => e.id === ctx.entryId)
    if (!entry) return []
    const key = `e:${entry.id}`
    if (selection.has(key) && selection.size > 1) {
      const out: Entry[] = []
      const seen = new Set<string>()
      for (const k of selection) {
        if (!k.startsWith('e:')) continue
        const id = k.slice(2)
        const e = entries.find((x) => x.id === id)
        if (!e || seen.has(e.id)) continue
        seen.add(e.id)
        out.push(e)
      }
      return out
    }
    return [entry]
  })()

  useLayoutEffect(() => {
    if (!ctx) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const winW = window.innerWidth
    const winH = window.innerHeight
    // 桌面壳：innerHeight 已不含任务栏，但缩放/多屏边界偶发偏差，留 80px 兜底。
    const TASKBAR_GUARD = 80
    const usableH = Math.max(200, winH - TASKBAR_GUARD)
    const left = Math.max(SAFE, Math.min(ctx.x, winW - rect.width - SAFE))
    const cursorRatio = ctx.y / Math.max(1, winH)
    const preferUp = cursorRatio > 0.45 || ctx.y > usableH - 80
    let top: number
    if (preferUp) {
      top = ctx.y - rect.height
      if (top < SAFE) {
        if (ctx.y + rect.height + SAFE <= usableH) {
          top = Math.max(SAFE, ctx.y)
        } else {
          top = Math.max(SAFE, usableH - rect.height - SAFE)
        }
      }
    } else {
      top = Math.max(SAFE, ctx.y)
      if (ctx.y + rect.height + SAFE > usableH) {
        if (ctx.y - rect.height - SAFE >= SAFE) {
          top = ctx.y - rect.height
        } else {
          top = Math.max(SAFE, usableH - rect.height - SAFE)
        }
      }
    }
    setPos({ left, top })
  }, [ctx])

  /**
   * 全局空白点击关闭菜单。
   * - 必须在 capture 阶段注册，否则 TodayView 的 marquee 处理（同样在 capture
   *   阶段）会先 stopPropagation，把关闭路径吞掉——你反馈的"点空白取消没做出来"
   *   就是这个根因。
   * - 下一帧再挂监听，避免打开菜单的那次右键立刻冒泡触发关闭。
   */
  useEffect(() => {
    if (!ctx) return
    const onDown = (e: MouseEvent) => {
      // picker 打开时不算"菜单外点击"——pick 里有自己的关闭路径
      if (pickerAnchor) {
        const pickerEl = document.querySelector('.jot-datepop')
        if (pickerEl && pickerEl.contains(e.target as Node)) return
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onScroll = () => close()
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDown, true)
      document.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onScroll)
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [ctx, close, pickerAnchor])

  if (!ctx) return null
  const entry = entries.find((e) => e.id === ctx.entryId)
  if (!entry) return null
  const isBatch = targets.length > 1

  const applyRecurring = async (on: boolean) => {
    for (const e of targets) {
      await setRecurring(e, on)
    }
  }
  const applyRecurringUntil = async (dateKey: string | null) => {
    const v = dateKey || null
    for (const e of targets) {
      await setRecurringUntil(e, v)
    }
  }
  const applyRecurringShowInWeekMonth = async (on: boolean) => {
    for (const e of targets) {
      await setRecurringShowInWeekMonth(e, on)
    }
  }
  const applyChangeKind = async (k: EntryKind) => {
    for (const e of targets) await changeKind(e, k)
  }
  const applySchedule = async (
    dateKey: string | null,
    start?: string,
    end?: string,
  ) => {
    for (const e of targets) await setSchedule(e, dateKey, start, end)
  }
  const applyCategory = async (cat: import('../types').CategoryId | null) => {
    if (isBatch) {
      await batchSetCategory(targets, cat)
    } else {
      await setCategory(targets[0], cat)
    }
  }
  const applyTentative = async () => {
    // toggle：批量时按当前第一条的 tentative 决定方向；用户预期是"全部一致"
    const base = targets[0]?.tentative ?? false
    for (const e of targets) {
      if (e.tentative !== base) await toggleTentative(e)
    }
  }
  const applyRemove = async () => {
    const titles: string[] = []
    for (const e of targets) {
      titles.push((e.plainText || l('（空）', '(empty)')).slice(0, 12))
      if (isBatch) continue // batchRemove 内部循环
      await removeEntry(e)
    }
    if (isBatch) await batchRemove(targets)
    close()
    if (isBatch) {
      pushToast(l(`已删除 ${targets.length} 项`, `Deleted ${targets.length} items`), {
        action: { label: l('撤销', 'Undo'), onClick: () => void undoLast() },
        ttl: 8000,
      })
    } else {
      pushToast(l(`已删除「${titles[0]}」`, `Deleted “${titles[0]}”`), {
        action: { label: l('撤销', 'Undo'), onClick: () => void undoLast() },
        ttl: 8000,
      })
    }
  }

  return createPortal(
    <>
      <div
        ref={ref}
        className="jot-ctxmenu"
        style={{ left: pos.left, top: pos.top, width: MENU_W }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="jot-ctx-item"
          onClick={() => {
            // 多选时只打开第一条的编辑面板，避免多面板叠在一起
            setEditing(targets[0].id)
            close()
          }}
          disabled={isBatch}
          title={isBatch ? l('多选时不支持编辑，请单选后操作', 'Select one item to edit') : undefined}
        >
          {isBatch ? l(`编辑（已选 ${targets.length} 项）`, `Edit (${targets.length} selected)`) : l('编辑', 'Edit')}
        </button>

        <div className="jot-ctx-label">{l('标签', 'Tags')}</div>
        <div className="jot-ctx-tags">
          <button
            type="button"
            className={`jot-ctx-tag is-none ${entry.category === null ? 'is-on' : ''}`}
            title={l('清除标签', 'Clear tag')}
            onClick={() => {
              void applyCategory(null)
              close()
            }}
          >
            <span className="jot-ctx-tag-dot is-none" />
            {l('无标签', 'No tag')}
          </button>
          {tags.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`jot-ctx-tag cat-${c.id} ${entry.category === c.id ? 'is-on' : ''}`}
              title={tagLabel(c.id, lang)}
              onClick={() => {
                void applyCategory(c.id)
                close()
              }}
            >
              <span className="jot-ctx-tag-dot" style={{ background: c.color }} />
              {tagLabel(c.id, lang)}
            </button>
          ))}
        </div>

        <div className="jot-ctx-label">{l('类型', 'Type')}</div>
        <div className="jot-ctx-row">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`jot-ctx-chip ${entry.kind === k.id ? 'is-on' : ''}`}
              onClick={() => {
                void applyChangeKind(k.id)
                close()
              }}
            >
              {l(k.label, k.id === 'task' ? 'Task' : 'Event')}
            </button>
          ))}
        </div>

        <div className="jot-ctx-label">{l('改期', 'Reschedule')}</div>
        <div className="jot-ctx-row">
          <button
            type="button"
            className="jot-ctx-chip"
            onClick={() => {
              void applySchedule(TODAY(), entry.startAt, entry.endAt)
              close()
            }}
          >
            {l('今天', 'Today')}
          </button>
          <button
            type="button"
            className="jot-ctx-chip"
            onClick={() => {
              void applySchedule(
                toDateKey(addDays(new Date(), 1)),
                entry.startAt,
                entry.endAt,
              )
              close()
            }}
          >
            {l('明天', 'Tomorrow')}
          </button>
          <button
            type="button"
            className="jot-ctx-chip"
            onClick={() => {
              void applySchedule(
                toDateKey(addDays(new Date(), 7)),
                entry.startAt,
                entry.endAt,
              )
              close()
            }}
          >
            {l('下周', 'Next week')}
          </button>
          <button
            type="button"
            className="jot-ctx-chip"
            onClick={() => {
              void applySchedule(null, undefined, undefined)
              close()
            }}
          >
            {l('清除', 'Clear')}
          </button>
        </div>

        {entry.kind === 'event' && !isBatch && (
          <button
            type="button"
            className={`jot-ctx-item ${entry.tentative ? 'is-on' : ''}`}
            onClick={() => {
              void applyTentative()
              close()
            }}
          >
            {entry.tentative ? l('取消待定', 'Remove tentative') : l('标记为待定', 'Mark tentative')}
          </button>
        )}

        <div className="jot-ctx-label">{l('多日重复', 'Repeat across days')}</div>
        <button
          ref={recurringBtnRef}
          type="button"
          className={`jot-ctx-item ${entry.recurring === 'daily' ? 'is-on' : ''}`}
          onClick={() => {
            if (entry.recurring === 'daily') {
              // 已开启 → 这一行直接取消（不弹日历，避免误操作）
              void applyRecurring(false)
              close()
              return
            }
            // 第一次开：先把默认结束日写进去（避免日历 onSelect 之前没值），
            // 然后弹出日历让用户挑。
            const defaultUntil = toDateKey(addDays(new Date(), 7))
            setPickerValue(defaultUntil)
            // 过期任务把起点挪到今天，避免从过去开始刷历史实例
            const todayKey = TODAY()
            for (const e of targets) {
              if (!e.dateKey || e.dateKey < todayKey) {
                void patchEntry(e.id, { dateKey: todayKey })
              }
              void setRecurring(e, true)
              void setRecurringUntil(e, defaultUntil)
            }
            if (recurringBtnRef.current) {
              setPickerAnchor(
                recurringBtnRef.current.getBoundingClientRect(),
              )
            } else {
              setPickerAnchor(ctx && { left: ctx.x, top: ctx.y, right: ctx.x, bottom: ctx.y, width: 0, height: 0, x: ctx.x, y: ctx.y, toJSON: () => ({}) } as DOMRect)
            }
          }}
        >
          {entry.recurring === 'daily'
            ? isBatch
              ? l(`取消多日重复（${targets.length} 项）`, `Stop repeating (${targets.length} items)`)
              : l('取消多日重复', 'Stop repeating')
            : l('设为多日重复…', 'Repeat across days…')}
        </button>
        {entry.recurring === 'daily' && !isBatch && (
          <>
            <button
              type="button"
              className={`jot-ctx-item ${entry.recurringShowInWeekMonth !== false ? 'is-on' : ''}`}
              onClick={() => {
                void applyRecurringShowInWeekMonth(
                  entry.recurringShowInWeekMonth === false,
                )
                close()
              }}
            >
              {entry.recurringShowInWeekMonth === false
                ? l('在周/月视图显示', 'Show in week/month views')
                : l('不在周/月视图显示', 'Hide from week/month views')}
            </button>
            {/* 结束日（含）：直接改日期输入框，不开日历（避免反复嵌套弹层） */}
            <div className="jot-ctx-label" style={{ marginTop: 4 }}>
              {l('结束日（含当天）', 'End date (inclusive)')}
            </div>
            <div className="jot-ctx-row">
              <input
                ref={untilDateRef}
                type="date"
                className="jot-ctx-date"
                value={entry.recurringUntil ?? ''}
                min={TODAY()}
                onChange={(e) => {
                  void applyRecurringUntil(e.target.value || null)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="jot-ctx-row">
              <button
                type="button"
                className="jot-ctx-chip"
                onClick={() => {
                  void applyRecurringUntil(toDateKey(addDays(new Date(), 7)))
                }}
              >
                {l('+7天', '+7 days')}
              </button>
              <button
                type="button"
                className="jot-ctx-chip"
                onClick={() => {
                  void applyRecurringUntil(toDateKey(addDays(new Date(), 30)))
                }}
              >
                {l('+30天', '+30 days')}
              </button>
            </div>
          </>
        )}

        <div className="jot-ctx-sep" />
        <button
          type="button"
          className="jot-ctx-item is-danger"
          onClick={() => void applyRemove()}
        >
          {isBatch ? l(`删除 ${targets.length} 项`, `Delete ${targets.length} items`) : l('删除', 'Delete')}
        </button>
      </div>

      {pickerAnchor && (
        <DatePopover
          anchorRect={pickerAnchor}
          value={pickerValue}
          onSelect={(k) => {
            setPickerValue(k)
            void applyRecurringUntil(k)
            setPickerAnchor(null)
            // 选完日期直接关菜单，回到列表能看到新的多日重复徽标
            close()
          }}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </>,
    document.body,
  )
}

// keep tree-shake happy (旧版导出过 itemEntry 但外部可能没用到，留作 placeholder)
export const __unused = itemEntry
