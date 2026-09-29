import { useMemo, useRef, useState } from 'react'
import { useUi } from '../store/ui'
import { itemEntry } from '../lib/useEntries'
import type { DayEntryItem } from '../lib/useEntries'
import { useTags } from '../store/tags'
import { tagLabel } from '../lib/tags'
import type { CategoryId } from '../types'
import {
  batchRemove,
  batchSetCategory,
  batchSetRecurringUntil,
} from '../lib/actions'
import { undoLast } from '../lib/undo'
import { createPortal } from 'react-dom'
import { DatePopover } from './DatePopover'
import { addDays, toDateKey } from '../lib/date'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'

/**
 * 多选操作条：底部浮层（portal 到 body，fixed 定位）。
 * 只在 selection.size > 0 时显示。
 *
 * 数据模型：selection 是 itemKey 集合（"e:abc" / "r:abc:2026-09-05"）。
 * 但当前视图渲染哪些条目是 useEntries + buildDayList 的事；
 * 这里我们从 useEntries() 拿到全部 Entry，再用「当前视图的 key」过滤
 * —— 避免误操作别的日期/视图里的项。
 */
export function SelectionBar({ items }: { items: DayEntryItem[] }) {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const selection = useUi((s) => s.selection)
  const clearSelection = useUi((s) => s.clearSelection)
  const manageMode = useUi((s) => s.manageMode)
  const ctxOpen = useUi((s) => s.ctxMenu !== null)
  const pushToast = useUi((s) => s.pushToast)
  /** 标签表（内置 + 用户自建），改标签按钮按它渲染 */
  const tags = useTags()

  /** 「截止日」按钮锚点（点击后 DatePopover 弹在按钮下方） */
  const untilBtnRef = useRef<HTMLButtonElement>(null)
  const [untilAnchor, setUntilAnchor] = useState<DOMRect | null>(null)
  const [untilValue, setUntilValue] = useState<string>(() =>
    toDateKey(addDays(new Date(), 7)),
  )

  const selectedEntries = useMemo(() => {
    if (selection.size === 0) return []
    const out: ReturnType<typeof itemEntry>[] = []
    const seen = new Set<string>()
    for (const it of items) {
      const key =
        it.kind === 'entry'
          ? `e:${it.entry.id}`
          : `r:${it.template.id}:${it.occurrenceDateKey}`
      if (!selection.has(key)) continue
      const e = itemEntry(it)
      if (seen.has(e.id)) continue // 重复实例指向同一模板，去重
      seen.add(e.id)
      out.push(e)
    }
    return out
  }, [items, selection])

  if (manageMode) return null
  if (ctxOpen) return null // 右键菜单打开时不抢焦点
  if (selection.size === 0 || selectedEntries.length === 0) return null

  const onBatchCategory = async (cat: CategoryId | null) => {
    const n = await batchSetCategory(selectedEntries, cat)
    clearSelection()
    pushToast(
      cat === null
        ? l(`已清除 ${n} 项标签`, `Cleared tags from ${n} items`)
        : l(`已为 ${n} 项打上「${tagLabel(cat)}」标签`, `Tagged ${n} items as “${tagLabel(cat, lang)}”`),
    )
  }
  const onBatchDelete = async () => {
    const n = await batchRemove(selectedEntries)
    clearSelection()
    pushToast(l(`已删除 ${n} 项`, `Deleted ${n} items`), {
      action: { label: l('撤销', 'Undo'), onClick: () => void undoLast() },
      ttl: 8000,
    })
  }
  const onPickUntil = async (dateKey: string) => {
    setUntilAnchor(null)
    const n = await batchSetRecurringUntil(selectedEntries, dateKey)
    clearSelection()
    pushToast(l(`已将 ${n} 项设为多日重复到 ${dateKey.slice(5)}`, `Set ${n} items to repeat until ${dateKey}`))
  }
  const onCloseUntil = () => setUntilAnchor(null)
  const onClearUntil = async () => {
    setUntilAnchor(null)
    const n = await batchSetRecurringUntil(selectedEntries, null)
    clearSelection()
    pushToast(l(`已取消 ${n} 项多日重复`, `Stopped repeating ${n} items`))
  }

  return createPortal(
    <>
      <div className="jot-selection-bar" role="toolbar" aria-label={l('批量操作', 'Bulk actions')}>
        <button
          type="button"
          className="jot-sel-cancel"
          onClick={clearSelection}
          title={l('取消选择 (Esc)', 'Clear selection (Esc)')}
          aria-label={l('取消选择', 'Clear selection')}
        >
          ✕
        </button>
        <div className="jot-sel-count">{l(`已选 ${selectedEntries.length}`, `${selectedEntries.length} selected`)}</div>

        <div className="jot-sel-group">
          <span className="jot-sel-label">{l('标签', 'Tags')}</span>
          <button
            type="button"
            className="jot-sel-chip is-none"
            title={l('清除标签', 'Clear tags')}
            onClick={() => void onBatchCategory(null)}
          >
            {l('无', 'None')}
          </button>
          {tags.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`jot-sel-chip cat-${c.id}`}
              // 颜色内联：圆点用 currentColor，跟着标签色走（自建标签也支持）
              style={{ color: c.color }}
              title={tagLabel(c.id, lang)}
              onClick={() => void onBatchCategory(c.id)}
            >
              <span className="jot-sel-dot" />
              {tagLabel(c.id, lang)}
            </button>
          ))}
        </div>

        {/* 截止日期按钮：批量改多日重复结束日。
            点一下弹 DatePopover 锚到按钮下方，选完日期即应用到全部 selected 条目。
            注意：宽度严格单排下文本"截止日期"必须完整显示，不能再带省略号。 */}
        <button
          ref={untilBtnRef}
          type="button"
          className={`jot-sel-until ${untilAnchor ? 'is-on' : ''}`}
          title={l('批量设置/修改多日重复的截止日（含当天）', 'Set repeat end date for selected items')}
          onClick={() => {
            if (untilBtnRef.current) {
              setUntilValue(toDateKey(addDays(new Date(), 7)))
              setUntilAnchor(untilBtnRef.current.getBoundingClientRect())
            }
          }}
        >
          {l('截止日期', 'End date')}
        </button>
        <button
          type="button"
          className="jot-sel-until-clear"
          title={l('取消多日重复（清除所有选中条目的 recurring / recurringUntil）', 'Stop repeating selected items')}
          onClick={() => void onClearUntil()}
        >
          {l('取消重复', 'Stop repeating')}
        </button>

        {/* 删除按钮：通过 margin-left:auto 自动靠到最右（用户反馈）。 */}
        <button
          type="button"
          className="jot-sel-delete"
          onClick={() => void onBatchDelete()}
        >
          {l(`删除 ${selectedEntries.length} 项`, `Delete ${selectedEntries.length} items`)}
        </button>
      </div>

      {untilAnchor && (
        <DatePopover
          anchorRect={untilAnchor}
          value={untilValue}
          onSelect={onPickUntil}
          onClose={onCloseUntil}
        />
      )}
    </>,
    document.body,
  )
}
