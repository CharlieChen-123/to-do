import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useL } from '../i18n'

interface Props {
  /** 触发按钮的屏幕坐标，popover 锚到它正下方 */
  anchorRect: DOMRect
  onClose: () => void
  /** 头部内容（年月导航 / 标题） */
  header: ReactNode
  children: ReactNode
  /** 卡片宽度，默认 320 */
  width?: number
  ariaLabel?: string
}

export const POP_W_DEFAULT = 320
const POP_H = 380
const GAP = 6

/**
 * 统一的 picker 外壳 —— 顶栏日期、周历、月历三个选择器共用同一套外观：
 * 锚在触发按钮正下方的小卡片 + 毛边阴影 + 头部导航 + × 关闭。
 * 点外部 / 滚动 / resize 都会自动收起或跟随。
 */
export function PickerPopover({
  anchorRect,
  onClose,
  header,
  children,
  width = POP_W_DEFAULT,
  ariaLabel,
}: Props) {
  const l = useL()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() => computePos(anchorRect, width))

  // 点外面关掉（下一帧再挂监听，避免打开的那次点击立刻冒泡关闭）
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocDown)
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDocDown)
    }
  }, [onClose])

  useEffect(() => {
    const update = () => setPos(computePos(anchorRect, width))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [anchorRect, width])

  return createPortal(
    <div
      ref={ref}
      className="jot-datepop"
      style={{ top: pos.top, left: pos.left, width }}
      role="dialog"
      aria-label={ariaLabel}
    >
      <div className="jot-datepop-head">
        {header}
        <button
          type="button"
          className="jot-datepop-x"
          onClick={onClose}
          aria-label={l('关闭', 'Close')}
        >
          ×
        </button>
      </div>
      {children}
    </div>,
    document.body,
  )
}

/** 锚到按钮正下方；下面放不下就翻到上方；右对齐按钮右边缘并夹在视口内 */
function computePos(
  rect: DOMRect,
  width: number,
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = rect.bottom + GAP
  let left = rect.right - width
  if (left < 8) left = 8
  if (left + width > vw - 8) left = vw - 8 - width
  if (top + POP_H > vh - 8) {
    top = Math.max(8, rect.top - POP_H - GAP)
  }
  return { top, left }
}
