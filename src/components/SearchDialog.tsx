import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry } from '../types'
import { useUi } from '../store/ui'
import { useEntries } from '../lib/useEntries'
import { friendlyDate, TODAY } from '../lib/date'
import { htmlToText } from '../lib/text'
import { IconSearch } from './Icons'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'

export function SearchDialog() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const open = useUi((s) => s.searchOpen)
  const setOpen = useUi((s) => s.setSearchOpen)
  const setView = useUi((s) => s.setView)
  const setEditing = useUi((s) => s.setEditing)
  const setSelectedDate = useUi((s) => s.setSelectedDate)
  const setAnchor = useUi((s) => s.setAnchor)
  const entries = useEntries()

  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setIdx(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(t)
  }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const hit = (e: Entry) =>
      e.plainText.toLowerCase().includes(s) ||
      htmlToText(e.content).toLowerCase().includes(s)
    return entries.filter(hit).slice(0, 20)
  }, [entries, q])

  const openEntry = useCallback(
    (e: Entry) => {
      if (e.dateKey && e.dateKey !== TODAY()) {
        setAnchor(new Date(`${e.dateKey}T00:00:00`))
        setSelectedDate(e.dateKey)
        setView('month')
      } else {
        setView('today')
      }
      setEditing(e.id)
      setOpen(false)
    },
    [setAnchor, setSelectedDate, setView, setEditing, setOpen],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false)
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault()
        setIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault()
        setIdx((i) => Math.max(i - 1, 0))
      } else if (ev.key === 'Enter') {
        ev.preventDefault()
        const e = results[idx]
        if (e) openEntry(e)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, idx, openEntry, setOpen])

  useEffect(() => {
    setIdx(0)
  }, [q])

  if (!open) return null

  return createPortal(
    <div className="jot-search-mask" onMouseDown={() => setOpen(false)}>
      <div
        className="jot-search"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={l('搜索', 'Search')}
      >
        <div className="jot-search-head">
          <span className="jot-search-icon">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            className="jot-search-input"
            value={q}
            placeholder={l('搜任务、日程…', 'Search tasks and events…')}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="jot-search-close"
            onClick={() => setOpen(false)}
            aria-label={l('关闭搜索', 'Close search')}
            title={l('关闭（Esc）', 'Close (Esc)')}
          >
            ✕
          </button>
        </div>

        <div className="jot-search-list">
          {!q.trim() && (
            <p className="jot-search-hint">
              {l('输入关键词。↑↓ 选择，回车直接打开那条。', 'Type to search. Use ↑↓ to select and Enter to open.')}
            </p>
          )}
          {q.trim() && !results.length && (
            <p className="jot-search-hint">{l(`没有找到「${q.trim()}」`, `No results for “${q.trim()}”`)}</p>
          )}
          {results.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className={`jot-search-item ${i === idx ? 'is-active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => openEntry(e)}
            >
              <span className={`jot-search-kind k-${e.kind}`}>{e.kind === 'event' ? l('日程', 'Event') : l('任务', 'Task')}</span>
              <span className="jot-search-text">{e.plainText || l('（空）', '(empty)')}</span>
              {e.dateKey && (
                <span className="jot-search-date">{friendlyDate(e.dateKey, lang)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
