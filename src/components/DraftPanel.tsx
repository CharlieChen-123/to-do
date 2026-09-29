import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EntryKind } from '../types'
import { createFromDrafts } from '../lib/actions'
import { organize, type Draft } from '../lib/organize'
import { organizeWithAI } from '../lib/ai'
import { TODAY } from '../lib/date'
import { useUi } from '../store/ui'
import { useSettings } from '../store/settings'
import { useL } from '../i18n'

interface Props {
  text: string
  defaultDateKey: string
  onClose: () => void
}

const fmtTime = (t: { hour: number; minute: number } | null): string =>
  t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : ''

const parseTime = (v: string): { hour: number; minute: number } | null => {
  if (!v) return null
  const [h, m] = v.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return { hour: h, minute: m || 0 }
}

/**
 * 自动归类草稿面板（方案 ②）—— 浮层版本
 * 之前 inline 渲染在 QuickAdd 容器里，会把右侧的"2026/08/31 周一"顶栏挤下去。
 * 现在包一层全屏 mask（点遮罩关闭），面板本身 position:relative 居中浮起，
 * 不再影响页面其他元素的布局。
 */
export function DraftPanel({ text, defaultDateKey, onClose }: Props) {
  const l = useL()
  const pushToast = useUi((s) => s.pushToast)
  const aiEnabled = useSettings((s) => s.aiEnabled)
  const aiApiKey = useSettings((s) => s.aiApiKey)
  const aiModel = useSettings((s) => s.aiModel)

  /** null = 还没出结果（首次 / AI 计算中） */
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [busy, setBusy] = useState(false)

  // 优先走大模型；失败/未开启则退回本地规则法（免费、离线）
  useEffect(() => {
    let alive = true
    const run = async () => {
      if (aiEnabled && aiApiKey.trim()) {
        try {
          const r = await organizeWithAI(
            text,
            defaultDateKey,
            aiApiKey.trim(),
            aiModel,
          )
          if (!alive) return
          setRows(r.drafts)
          return
        } catch (e) {
          if (!alive) return
          pushToast(
            l(`AI 整理失败，改用本地规则：${(e as Error).message.slice(0, 60)}`, `AI organization failed; using local rules: ${(e as Error).message.slice(0, 60)}`),
            { ttl: 5200 },
          )
        }
      }
      if (!alive) return
      setRows(organize(text))
    }
    void run()
    return () => {
      alive = false
    }
  }, [text, defaultDateKey, aiEnabled, aiApiKey, aiModel, pushToast, l])

  const list = rows ?? []

  const setRow = (id: string, patch: Partial<Draft>) =>
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const toggleKind = (d: Draft) => {
    const kind: EntryKind = d.kind === 'event' ? 'task' : 'event'
    setRow(d.id, {
      kind,
      dateKey:
        kind === 'event' && !d.dateKey ? defaultDateKey || TODAY() : d.dateKey,
      time: kind === 'event' ? d.time : null,
      endTime: kind === 'event' ? d.endTime : null,
    })
  }

  const commit = async () => {
    setBusy(true)
    const n = await createFromDrafts(list, defaultDateKey)
    setBusy(false)
    if (n > 0) pushToast(l(`已添加 ${n} 条`, `Added ${n} item${n === 1 ? '' : 's'}`))
    onClose()
  }

  const remaining = list.filter((r) => r.text.trim().length > 0).length
  const loading = rows === null

  return createPortal(
    <div
      className="jot-draft-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="jot-draft-panel is-floating"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="jot-draft-head">
          <span className="jot-draft-title">
            {loading ? l('正在整理…', 'Organizing…') : l(`整理出 ${remaining} 条，确认后添加`, `${remaining} items found. Review and add.`)}
          </span>
          <button type="button" className="jot-draft-x" onClick={onClose} aria-label={l('取消', 'Cancel')}>
            ×
          </button>
        </div>

        <div className="jot-draft-list">
          {loading && <p className="jot-empty">{l('正在让模型精简你的这段话…', 'Organizing your text…')}</p>}
          {!loading && list.length === 0 && (
            <p className="jot-empty">{l('没识别出任何条目。', 'No items found.')}</p>
          )}
          {list.map((d) => (
            <div key={d.id} className={`jot-draft-row k-${d.kind}`}>
              <div className="jot-draft-row-top">
                <div className="jot-kindpick">
                  <button
                    type="button"
                    className={`jot-kindpill kp-task ${d.kind === 'task' ? 'is-active' : ''}`}
                    onClick={() => d.kind !== 'task' && toggleKind(d)}
                  >
                    {l('任务', 'Task')}
                  </button>
                  <button
                    type="button"
                    className={`jot-kindpill kp-event ${d.kind === 'event' ? 'is-active' : ''}`}
                    onClick={() => d.kind !== 'event' && toggleKind(d)}
                  >
                    {l('日程', 'Event')}
                  </button>
                </div>
                {d.recurring === 'daily' && d.recurringUntil && (
                  <span
                    className="jot-draft-recurring"
                    title={l(`多日重复直到 ${d.recurringUntil}`, `Repeats daily until ${d.recurringUntil}`)}
                  >
                    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                      <path
                        d="M2 4h9a3 3 0 0 1 0 6H5M14 12H5a3 3 0 0 1 0-6h6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    → {formatShort(d.recurringUntil)}
                  </span>
                )}
                <button
                  type="button"
                  className="jot-draft-del"
                  title={l('删除这条', 'Remove item')}
                  aria-label={l('删除这条', 'Remove item')}
                  onClick={() => setRows((rs) => (rs ?? []).filter((r) => r.id !== d.id))}
                >
                  ×
                </button>
              </div>

              <input
                className="jot-draft-text"
                value={d.text}
                placeholder={l('内容', 'Content')}
                onChange={(e) => setRow(d.id, { text: e.target.value })}
              />

              <div className="jot-draft-row-meta">
                <input
                  type="date"
                  className="jot-draft-date"
                  value={d.dateKey ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null
                    setRow(d.id, {
                      dateKey: v,
                      // 起始日挪到截止日之后：把截止日清掉，避免反向
                      recurringUntil:
                        d.recurringUntil && v && d.recurringUntil < v
                          ? null
                          : d.recurringUntil,
                    })
                  }}
                  aria-label={l('日期', 'Date')}
                />
                {d.kind === 'task' && (
                  <input
                    type="date"
                    className={`jot-draft-until ${d.recurringUntil ? 'is-on' : ''}`}
                    value={d.recurringUntil ?? ''}
                    min={d.dateKey ?? undefined}
                    placeholder={l('+ 多日', '+ More days')}
                    title={l('多日任务：选一个截止日（含），任务会每天出现', 'Choose an end date to repeat this task daily')}
                    onChange={(e) => {
                      const v = e.target.value || null
                      setRow(d.id, {
                        recurringUntil: v,
                        recurring: v ? 'daily' : undefined,
                      })
                    }}
                    aria-label={l('多日截止', 'Repeat until')}
                  />
                )}
                {d.kind === 'event' && (
                  <input
                    type="time"
                    className="jot-draft-time"
                    value={fmtTime(d.time)}
                    onChange={(e) => setRow(d.id, { time: parseTime(e.target.value) })}
                    aria-label={l('时间', 'Time')}
                  />
                )}
                {d.tentative && <span className="jot-draft-ten">{l('待定', 'Tentative')}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="jot-draft-foot">
          <button type="button" className="jot-text-btn" onClick={onClose} disabled={busy}>
            {l('取消', 'Cancel')}
          </button>
          <button
            type="button"
            className="jot-draft-add"
            onClick={() => void commit()}
            disabled={busy || remaining === 0}
          >
            {l(`全部添加（${remaining}）`, `Add all (${remaining})`)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 把 YYYY-MM-DD 显示成「M/D」（跨多天任务角标用） */
function formatShort(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${m}/${d}`
}
