import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTags } from '../store/tags'
import {
  countAllTagUsage,
  createTag,
  deleteTag,
  restoreBuiltinTags,
  updateTag,
} from '../lib/tagActions'
import { FALLBACK_TAG_ID, TAG_PALETTE, tagLabel } from '../lib/tags'
import { useUi } from '../store/ui'
import { TagColorPicker } from './TagColorPicker'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'

/**
 * 标签管理（设置面板里的「标签」section）
 * ============================================================
 * 能干的事：
 *   - 新增自定义标签（名字 + 颜色）
 *   - 改任意标签的名字与颜色（内置的也能改）
 *   - 删除标签（用到它的条目会自动改回「其它」，不会留下指向空标签的脏数据）
 *   - 把误删的内置标签恢复回来
 *
 * 「其它」是兜底标签，永远不可删 —— 分类失败、清空标签都落到它上面。
 */
export function TagManager() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const tags = useTags()
  const usage = useLiveQuery(() => countAllTagUsage(), [], {} as Record<string, number>)
  const pushToast = useUi((s) => s.pushToast)

  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(TAG_PALETTE[6])
  /** 正在改色的标签 id（展开调色板） */
  const [paletteFor, setPaletteFor] = useState<string | null>(null)
  /** 正在改名的标签 id + 草稿 */
  const [renameFor, setRenameFor] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const hiddenBuiltins = tags.length < 8

  const onAdd = async () => {
    const r = await createTag(newLabel, newColor)
    if (!r.ok) {
      pushToast(r.error ?? l('添加失败', 'Could not add tag'))
      return
    }
    const existed = tags.some((t) => t.id === r.tag?.id)
    setNewLabel('')
    pushToast(existed ? l(`已经有「${r.tag?.label}」这个标签了`, `Tag “${r.tag?.label}” already exists`) : l(`已添加标签「${r.tag?.label}」`, `Added tag “${r.tag?.label}”`))
  }

  const commitRename = async (id: string) => {
    const v = renameDraft.trim()
    setRenameFor(null)
    if (!v) return
    await updateTag(id, { label: v })
    pushToast(l(`已重命名为「${v}」`, `Renamed to “${v}”`))
  }

  const onDelete = async (id: string, label: string) => {
    if (id === FALLBACK_TAG_ID) {
      pushToast(l('「其它」是兜底标签，不能删除', 'The Other tag cannot be deleted'))
      return
    }
    const n = usage?.[id] ?? 0
    const msg =
      n > 0
        ? l(`删除标签「${label}」？\n\n有 ${n} 条内容正在用它，会被改成「其它」。\n（回收站里的也会一起改，恢复后不会指向空标签）`, `Delete tag “${label}”?\n\n${n} items using it will be moved to Other, including items in Trash.`)
        : l(`删除标签「${label}」？`, `Delete tag “${label}”?`)
    if (!window.confirm(msg)) return
    const r = await deleteTag(id)
    if (!r.ok) {
      pushToast(r.error ?? l('删除失败', 'Could not delete tag'))
      return
    }
    pushToast(
      r.reassigned > 0
        ? l(`已删除「${label}」，${r.reassigned} 条内容改为「其它」`, `Deleted “${label}”; moved ${r.reassigned} items to Other`)
        : l(`已删除「${label}」`, `Deleted “${label}”`),
    )
  }

  const onRestoreBuiltins = async () => {
    const n = await restoreBuiltinTags()
    pushToast(n > 0 ? l(`已恢复 ${n} 个内置标签`, `Restored ${n} built-in tags`) : l('没有需要恢复的内置标签', 'No built-in tags to restore'))
  }

  return (
    <div className="jot-tagmgr">
      {/* ---------- 现有标签 ---------- */}
      <div className="jot-tagmgr-list">
        {tags.map((t) => {
          const isFallback = t.id === FALLBACK_TAG_ID
          return (
            <div key={t.id} className="jot-tagmgr-item">
              <button
                type="button"
                className={`jot-tagmgr-swatch ${paletteFor === t.id ? 'is-open' : ''}`}
                style={{ background: t.color }}
                title={l('改颜色', 'Change color')}
                aria-label={l(`改「${t.label}」的颜色`, `Change color of “${tagLabel(t.id, lang)}”`)}
                onClick={() => setPaletteFor((v) => (v === t.id ? null : t.id))}
              />

              {renameFor === t.id ? (
                <input
                  className="jot-tagmgr-rename"
                  autoFocus
                  value={renameDraft}
                  maxLength={12}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRename(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      void commitRename(t.id)
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setRenameFor(null)
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="jot-tagmgr-name"
                  title={l('点一下改名', 'Click to rename')}
                  onClick={() => {
                    setRenameFor(t.id)
                    setRenameDraft(tagLabel(t.id, lang))
                  }}
                >
                  {tagLabel(t.id, lang)}
                </button>
              )}

              {t.builtin && <span className="jot-tagmgr-badge">{l('内置', 'Built-in')}</span>}

              <button
                type="button"
                className="jot-tagmgr-del"
                disabled={isFallback}
                title={isFallback ? l('「其它」不能删除', 'Other cannot be deleted') : l(`删除「${t.label}」`, `Delete “${tagLabel(t.id, lang)}”`)}
                aria-label={l(`删除「${t.label}」`, `Delete “${tagLabel(t.id, lang)}”`)}
                onClick={() => void onDelete(t.id, tagLabel(t.id, lang))}
              >
                ✕
              </button>

              {paletteFor === t.id && (
                <TagColorPicker
                  value={t.color}
                  onChange={(c) => {
                    void updateTag(t.id, { color: c })
                    setPaletteFor(null)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ---------- 新增 ---------- */}
      <div className="jot-tagmgr-add">
        <input
          className="jot-set-input jot-tagmgr-add-input"
          placeholder={l('新标签名（≤12 字）', 'New tag name (max 12 characters)')}
          value={newLabel}
          maxLength={12}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void onAdd()
            }
          }}
        />
        <TagColorPicker value={newColor} onChange={setNewColor} compact />
        <button
          type="button"
          className="jot-set-btn"
          onClick={() => void onAdd()}
          disabled={!newLabel.trim()}
        >
          {l('添加', 'Add')}
        </button>
      </div>

      {hiddenBuiltins && (
        <div className="jot-set-row">
          <div className="jot-set-label">
            {l('恢复内置标签', 'Restore built-in tags')}
            <span className="jot-set-hint">
              {l('你删掉过内置标签。内置标签删掉只是隐藏，可以一键恢复。', 'Deleted built-in tags are hidden and can be restored.')}
            </span>
          </div>
          <div className="jot-set-testrow">
            <button type="button" className="jot-set-btn" onClick={() => void onRestoreBuiltins()}>
              {l('恢复', 'Restore')}
            </button>
          </div>
        </div>
      )}

      <p className="jot-set-hint jot-tagmgr-tip">
        {l('标签会跟着任务一起同步到云端和手机端。删除标签不会删除任务，只是把它们改成「其它」。', 'Tags sync with your tasks. Deleting a tag moves its tasks to Other.')}
      </p>
    </div>
  )
}
