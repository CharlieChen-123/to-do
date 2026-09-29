import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useL } from '../i18n'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * 通用「数据浏览」模态：套住 DoneView / TrashView / 未来要加的浏览视图。
 * z-index：低于 SelectionBar (9500) / marquee (9990)，高于 ContextMenu (1000) /
 * DatePopover (1100) 之外的常规面板（顶栏 / 草稿面板 200+ 量级）。
 *
 * 设计：左侧 200px 宽抽屉 + 右侧滚动主体，让长列表可滚动、关闭按钮永远可达。
 */
export function HistoryModal({ title, onClose, children }: Props) {
  const l = useL()
  // Esc 关闭 + scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="jot-history-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="jot-history" onMouseDown={(e) => e.stopPropagation()}>
        <div className="jot-history-head">
          <h2 className="jot-history-title">{title}</h2>
          <button
            type="button"
            className="jot-history-x"
            onClick={onClose}
            aria-label={l('关闭', 'Close')}
          >
            ×
          </button>
        </div>
        <div className="jot-history-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
