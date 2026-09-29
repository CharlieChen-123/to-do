import { useEffect, useMemo } from 'react'
import { purgeEntry } from '../../lib/db'
import { softRestoreEntry } from '../../lib/actions'
import { useDeletedEntries } from '../../lib/useEntries'
import { displayColor } from '../../lib/categories'
import { tagLabel } from '../../lib/tags'
import { format, friendlyDate } from '../../lib/date'
import {
  TRASH_RETENTION_DAYS,
  autoPurgeTrash,
  trashDaysLeft,
  trashExpiresAt,
} from '../../lib/trash'
import { useUi } from '../../store/ui'
import { useL } from '../../i18n'
import { useSettings } from '../../store/settings'

/**
 * 「最近删除」视图：仅展示软删条目 + 恢复 / 彻底删除 按钮。
 * 之前塞在 DoneView 末尾，现在拆出来——让 DoneView 只看「已完成 + 过去的日程」，
 * 回收站独立从设置面板进入，避开侧栏噪音。
 *
 * 保留期：软删保留 TRASH_RETENTION_DAYS 天，到期由 autoPurgeTrash 自动彻底清除
 * （见 lib/trash.ts）。每次打开这个视图先清一遍，保证看到的就是真实剩余内容。
 */
export function TrashView() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const deleted = useDeletedEntries()
  const pushToast = useUi((s) => s.pushToast)

  // 打开回收站即清算一次过期条目。没有过期的就是纯读操作，不会写库。
  useEffect(() => {
    void autoPurgeTrash()
  }, [])

  // 最近删的排最上。deletedAt 是权威的删除时刻；
  // 老数据可能没有，退回 updatedAt 估算（与 lib/trash.ts 同一套兜底口径）。
  const sorted = useMemo(
    () =>
      [...deleted].sort((a, b) =>
        (b.deletedAt ?? b.updatedAt ?? '').localeCompare(
          a.deletedAt ?? a.updatedAt ?? '',
        ),
      ),
    [deleted],
  )

  if (!sorted.length) {
    return (
      <p className="jot-empty">
        {l(`回收站里没有东西。删掉的任务会在这里保留 ${TRASH_RETENTION_DAYS} 天。`, `Trash is empty. Deleted items stay here for ${TRASH_RETENTION_DAYS} days.`)}
      </p>
    )
  }

  return (
    <div className="jot-view">
      <section className="jot-group">
        <h2 className="jot-group-title t-gray">
          {l('最近删除', 'Recently deleted')}
          <span className="jot-group-count">{sorted.length}</span>
        </h2>
        <p className="jot-set-hint" style={{ margin: '0 0 12px 0' }}>
          {l(`删除的内容保留 ${TRASH_RETENTION_DAYS} 天，到期无法找回。`, `Deleted items are kept for ${TRASH_RETENTION_DAYS} days, then removed permanently.`)}
        </p>
        <div className="jot-list">
          {sorted.map((e) => {
            // 标签 + 标签色一起带过来：数据行里存的是 category（标签 id），
            // 颜色由标签表推导。这里同时给 data-cat（喂 CSS 里的 --mk）和
            // 内联 --mk（保证自建标签的任意色也生效）。
            const color = e.category ? displayColor(e) : null
            const daysLeft = trashDaysLeft(e)
            // 用明确的"月日"而不是 friendlyDate —— 后者在 7 天内会返回「周三」，
            // 放在"自动清除"的提示里读起来莫名其妙。
            const expiresLabel = format(trashExpiresAt(e), lang === 'en' ? 'MMM d' : 'M月d日')
            return (
              <div
                key={e.id}
                className="jot-card k-task is-deleted"
                data-cat={e.category ?? undefined}
                style={{ ['--mk' as string]: color || 'var(--ink-3)' }}
              >
                <span className="jot-dot" />
                <div className="jot-card-body">
                  <div className="jot-html">{e.plainText || l('（空）', '(empty)')}</div>
                  <div className="jot-card-meta">
                    {e.kind === 'event' && (
                      <span className="jot-meta-kind">{l('日程', 'Event')}</span>
                    )}
                    {e.category && (
                      <span
                        className={`jot-meta-cat cat-${e.category}`}
                        style={
                          color
                            ? { color, borderColor: `${color}33` }
                            : undefined
                        }
                        title={l(`标签：${tagLabel(e.category)}`, `Tag: ${tagLabel(e.category, lang)}`)}
                      >
                        {tagLabel(e.category, lang)}
                      </span>
                    )}
                    <span className="jot-meta-date">{friendlyDate(e.dateKey, lang)}</span>
                    <span
                      className="jot-meta-ten"
                      title={l(`${expiresLabel} 自动清除`, `Permanently deleted on ${expiresLabel}`)}
                    >
                      {daysLeft > 0 ? l(`还剩 ${daysLeft} 天`, `${daysLeft} days left`) : l('即将清除', 'Removing soon')}
                    </span>
                  </div>
                  <div className="jot-deleted-actions">
                    <button
                      type="button"
                      className="jot-text-btn"
                      onClick={() => {
                        void softRestoreEntry(e).then(() => {
                          pushToast(l(`已恢复「${(e.plainText || '（空）').slice(0, 12)}」`, `Restored “${(e.plainText || '(empty)').slice(0, 12)}”`))
                        })
                      }}
                    >
                      {l('恢复', 'Restore')}
                    </button>
                    <button
                      type="button"
                      className="jot-text-btn is-danger"
                      onClick={() => {
                        if (window.confirm(l('彻底删除？无法恢复。', 'Delete permanently? This cannot be undone.'))) {
                          void purgeEntry(e.id).then(() => {
                            pushToast(l(`已彻底删除「${(e.plainText || '（空）').slice(0, 12)}」`, `Deleted “${(e.plainText || '(empty)').slice(0, 12)}” permanently`))
                          })
                        }
                      }}
                    >
                      {l('彻底删除', 'Delete permanently')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
