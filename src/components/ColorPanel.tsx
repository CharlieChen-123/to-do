import { useEffect, useRef, useState } from 'react'
import { clamp01, hexToHsv, hsvToHex, hueToHex, normalizeHue, type HSV } from '../lib/color'
import { normalizeHexColor } from '../lib/tags'
import { useL } from '../i18n'

/**
 * 取色面板（自绘）
 * ============================================================
 * 点「更多」之后弹出来的就是它。为什么不用 <input type="color">：
 *   - 它弹的是**操作系统的**取色对话框，样子跟我们这套 UI 完全不搭，
 *     而且在 Windows 上是个小方框、在 macOS 上是系统色轮，各平台不一致；
 *   - 它的 onChange 拖动时连续触发，直接写库会每秒几十次 update；
 *   - 拿不到中间态，没法做「实时预览 + 应用」这一步。
 *
 * 所以自己画：一个「饱和度 × 明度」方块 + 一根色相条 + hex 输入，
 * 想选哪个色就选哪个色，不限于任何预设。
 *
 * 三种交互都能改色：
 *   1) 拖方块 / 拖色相条（pointer capture，拖出元素外面也不会断）
 *   2) 焦点在方块/色相条上时按方向键微调（按住 Shift 步长 ×5）
 *   3) 直接手输 hex
 *
 * 提交策略（live 决定）：
 *   - live = false（改已有标签）：改动只落在面板内部的草稿上，
 *     必须点「应用」才提交。避免手一抖把已有标签的颜色改了。
 *   - live = true（新建标签）：父组件里那个颜色本来就只是草稿、
 *     写库要等点「添加」，所以每次都直接同步过去，色块实时跟着变，
 *     也就没有「应用」按钮存在的必要了。
 */
interface Props {
  /** 当前颜色（#rrggbb）。外部改动（换标签、点了预设色）会同步进面板 */
  value: string
  /** 提交颜色。live=false 时由「应用」触发 */
  onChange: (hex: string) => void
  /** 每次调整都直接提交（新建标签场景） */
  live?: boolean
}

/** 手柄/圆点在方块里的活动区域内边距，必须和 index.css 里的 inset 一致 */
const SV_INSET = 7

/**
 * 拖拽中：'sv' | 'hue' | null。
 * 为什么用显式状态而不是 hasPointerCapture 当闸门：捕获只是「手指移出元素
 * 也继续收事件」的优化，一旦 setPointerCapture 因为任何原因失败，
 * 拿它当闸门会让整个拖拽直接失灵。捕获失败时的降级行为（手指移出元素即
 * 停止跟随）可以接受，但绝不能因此完全拖不动。
 */
type DragMode = 'sv' | 'hue'

function capture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId)
  } catch {
    /* 合成事件、或指针已失效时会抛，忽略即可 */
  }
}

function release(el: Element, pointerId: number) {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
  } catch {
    /* 同上 */
  }
}

export function ColorPanel({ value, onChange, live = false }: Props) {
  const l = useL()
  const [hsv, setHsv] = useState<HSV>(
    () => hexToHsv(value) ?? { h: 217, s: 0.72, v: 0.86 },
  )
  /** hex 输入框的文本。允许中间态（比如刚敲到 "#3b8"），所以和 hsv 分开存 */
  const [hexText, setHexText] = useState(value)
  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 当前正在拖哪一根（见 DragMode 的说明） */
  const dragRef = useRef<DragMode | null>(null)
  /**
   * hsv 的镜像。拖拽时一帧内可能连着来好几个 pointermove，
   * 靠闭包里的 state 会拿到上一帧的旧值（导致拖拽发飘），所以读写都走 ref。
   */
  const hsvRef = useRef(hsv)
  /** 最近一次「由本面板发出」的颜色，用来判断 value 变化该不该回灌 */
  const emitted = useRef<string | null>(null)

  // 外部改色（切到另一个标签 / 点了预设色）→ 同步进来。
  // 但如果是我们自己发出去又转回来的，就跳过 —— 否则用户把明度拖到底
  // （变纯黑，色相此时无定义）后，色相会被重新解释成 0，手柄跳回红色。
  useEffect(() => {
    const norm = normalizeHexColor(value)
    if (!norm || norm === emitted.current) return
    const next = hexToHsv(norm)
    if (next) {
      hsvRef.current = next
      setHsv(next)
    }
    setHexText(value)
  }, [value])

  /** 统一入口：落草稿 + （live 时）提交 */
  const push = (next: HSV) => {
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(next)
    emitted.current = hex
    setHexText(hex)
    if (live) onChange(hex)
  }

  /** hex 输入：合法就顺手把方块和色条也挪过去 */
  const onHexInput = (t: string) => {
    setHexText(t)
    const norm = normalizeHexColor(t)
    if (!norm) return
    const next = hexToHsv(norm)
    if (!next) return
    hsvRef.current = next
    setHsv(next)
    emitted.current = norm
    if (live) onChange(norm)
  }

  /**
   * 面板比一行标签高不少。设置面板本身是可滚动的，展开后如果落在可视区
   * 之外，用户会以为「点了没反应」。所以挂载时轻轻带一下（block:'nearest'
   * 只滚最少的那点距离，已完整可见时不做任何事）。
   */
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  /* ---------------- 拖拽 ---------------- */

  const trackSv = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    push({
      h: hsvRef.current.h,
      // 横轴 = 饱和度，纵轴 = 明度（上亮下暗）
      s: clamp01((clientX - r.left) / r.width),
      v: 1 - clamp01((clientY - r.top) / r.height),
    })
  }

  const trackHue = (clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width) return
    push({ ...hsvRef.current, h: clamp01((clientX - r.left) / r.width) * 360 })
  }

  const onSvDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    // preventScroll 是必须的：preventDefault 挡掉了默认聚焦，所以要手动 focus；
    // 而 focus() 默认会把元素滚进视野 —— 用户点手柄时面板会自己跳一下，
    // 而且滚动发生在取坐标之后，会让这一次拖拽的纵坐标算错。
    e.currentTarget.focus({ preventScroll: true })
    capture(e.currentTarget, e.pointerId)
    dragRef.current = 'sv'
    trackSv(e.clientX, e.clientY)
  }
  const onSvMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== 'sv') return
    trackSv(e.clientX, e.clientY)
  }
  const onHueDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    capture(e.currentTarget, e.pointerId)
    dragRef.current = 'hue'
    trackHue(e.clientX)
  }
  const onHueMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== 'hue') return
    trackHue(e.clientX)
  }
  /** 松手/取消：结束拖拽并释放捕获（不释放的话元素会一直被当作按下状态） */
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    release(e.currentTarget, e.pointerId)
  }

  /* ---------------- 键盘 ---------------- */

  const onSvKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02
    const cur = hsvRef.current
    let next: HSV | null = null
    if (e.key === 'ArrowLeft') next = { ...cur, s: clamp01(cur.s - step) }
    else if (e.key === 'ArrowRight') next = { ...cur, s: clamp01(cur.s + step) }
    else if (e.key === 'ArrowUp') next = { ...cur, v: clamp01(cur.v + step) }
    else if (e.key === 'ArrowDown') next = { ...cur, v: clamp01(cur.v - step) }
    if (!next) return
    e.preventDefault()
    push(next)
  }

  const onHueKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const delta = e.key === 'ArrowLeft' ? -step : step
    push({ ...hsvRef.current, h: normalizeHue(hsvRef.current.h + delta) })
  }

  /* ---------------- 渲染 ---------------- */

  const hex = hsvToHex(hsv)
  const pure = hueToHex(hsv.h)
  const saved = normalizeHexColor(value) ?? value
  const dirty = hex !== saved
  const hexOk = normalizeHexColor(hexText) !== null

  const apply = () => {
    if (!dirty) return
    emitted.current = hex
    onChange(hex)
  }

  return (
    <div className="jot-cpanel" ref={rootRef}>
      {/* 饱和度 × 明度方块：底色是纯色相，再叠「→ 白」和「→ 黑」两层渐变 */}
      <div className="jot-cpanel-sv" style={{ background: pure }}>
        <div className="jot-cpanel-sv-white" />
        <div className="jot-cpanel-sv-black" />
        <div
          ref={svRef}
          className="jot-cpanel-sv-in"
          style={{ inset: SV_INSET }}
          tabIndex={0}
          role="slider"
          aria-label={l('饱和度与明度', 'Saturation and brightness')}
          aria-valuetext={l(`饱和度 ${Math.round(hsv.s * 100)}%，明度 ${Math.round(hsv.v * 100)}%`, `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`)}
          onPointerDown={onSvDown}
          onPointerMove={onSvMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onSvKey}
        >
          <span
            className="jot-cpanel-dot"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
          />
        </div>
      </div>

      {/* 色相条 */}
      <div className="jot-cpanel-hue">
        <div
          ref={hueRef}
          className="jot-cpanel-hue-in"
          tabIndex={0}
          role="slider"
          aria-label={l('色相', 'Hue')}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={onHueDown}
          onPointerMove={onHueMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onHueKey}
        >
          <span
            className="jot-cpanel-dot"
            style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%', background: pure }}
          />
        </div>
      </div>

      <div className="jot-cpanel-foot">
        <span className="jot-cpanel-preview" style={{ background: hex }} title={l(`当前 ${hex}`, `Current ${hex}`)} />
        <input
          className="jot-set-input jot-cpanel-hex"
          value={hexText}
          maxLength={7}
          spellCheck={false}
          placeholder="#5b21b6"
          aria-label={l('颜色值（十六进制）', 'Hex color value')}
          onChange={(e) => onHexInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              apply()
            }
            if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              setHexText(saved)
              const back = hexToHsv(saved)
              if (back) {
                hsvRef.current = back
                setHsv(back)
              }
            }
          }}
        />
        {live ? (
          <span className="jot-cpanel-hint">{l('拖动方块选颜色', 'Drag to choose a color')}</span>
        ) : (
          <button
            type="button"
            className="jot-set-btn jot-cpanel-apply"
            disabled={!dirty}
            onClick={apply}
          >
            {l('应用', 'Apply')}
          </button>
        )}
      </div>

      {!hexOk && (
        <p className="jot-cpanel-hint is-bad">
          {l('颜色要写成', 'Use a color like')} <code>#5b21b6</code> {l('或', 'or')} <code>#abc</code>
        </p>
      )}
    </div>
  )
}
