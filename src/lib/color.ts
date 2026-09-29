/**
 * 颜色数学（纯函数，零依赖）
 * ============================================================
 * 自绘取色面板（ColorPanel）需要三件事，浏览器原生 input[type=color] 都不给：
 *   1. 把颜色拆成「色相 h / 饱和度 s / 明度 v」，才能画方块和色条；
 *   2. 反过来把手柄的 (s, v) 位置、色条的 h 合成回一个 hex；
 *   3. 在两个表示之间来回换算还不能明显丢色（否则拖一下就偏色）。
 *
 * 所以换算全部收在这里，组件只管画。放在 lib/ 而不是组件里，是因为
 * 这套算法能用 tests/color.test.ts 在 node 下直接钉住 —— 颜色偏一点肉眼
 * 很难发现，但测试能。
 *
 * 约定：
 *   - RGB 三个分量 0~255 的整数
 *   - HSV 的 h 用 0~360（度），s / v 用 0~1
 *   - hex 一律 #rrggbb 小写
 */

export interface RGB {
  /** 0-255 */
  r: number
  /** 0-255 */
  g: number
  /** 0-255 */
  b: number
}

export interface HSV {
  /** 色相 0-360（度）。s=0（灰）时色相无定义，这里保留原值不归零，
   *  否则用户从黑色往上拖明度时会突然跳到红色。 */
  h: number
  /** 饱和度 0-1 */
  s: number
  /** 明度 0-1 */
  v: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** 夹到 0~1。拖拽时指针可能跑到元素外面，算出越界的比例要夹回来 */
export const clamp01 = (n: number) => (Number.isFinite(n) ? clamp(n, 0, 1) : 0)

/** 把色相夹回 [0, 360) */
export const normalizeHue = (h: number) => (Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0)

/**
 * hex → RGB。容忍 #abc / #aabbcc / 带不带 # 都行，非法返回 null。
 * （不依赖 tags.ts 的 normalizeHexColor，保持本模块零依赖、可单独测）
 */
export function hexToRgb(hex: string): RGB | null {
  if (typeof hex !== 'string') return null
  let s = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

/** RGB → #rrggbb 小写。分量会先取整并夹到 0~255 */
export function rgbToHex(rgb: RGB): string {
  const part = (n: number) =>
    Math.round(clamp(Number.isFinite(n) ? n : 0, 0, 255)).toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

/** RGB → HSV */
export function rgbToHsv(rgb: RGB): HSV {
  const r = clamp(rgb.r, 0, 255) / 255
  const g = clamp(rgb.g, 0, 255) / 255
  const b = clamp(rgb.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** HSV → RGB */
export function hsvToRgb(hsv: HSV): RGB {
  const h = normalizeHue(hsv.h)
  const s = clamp01(hsv.s)
  const v = clamp01(hsv.v)

  // 标准分段做法：先算色度 c 和次分量 x，再统一加 m 抬明度
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r = 0
  let g = 0
  let b = 0
  switch (Math.floor(h / 60) % 6) {
    case 0: r = c; g = x; break
    case 1: r = x; g = c; break
    case 2: g = c; b = x; break
    case 3: g = x; b = c; break
    case 4: r = x; b = c; break
    default: r = c; b = x; break
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/** hex → HSV，非法返回 null */
export function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsv(rgb) : null
}

/** HSV → #rrggbb 小写 */
export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv))
}

/**
 * 纯色相的 hex（s=1、v=1）。用来给「饱和度/明度方块」铺底色 ——
 * 方块本身是「这道纯色 → 白」和「透明 → 黑」两层渐变叠出来的。
 */
export function hueToHex(h: number): string {
  return hsvToHex({ h, s: 1, v: 1 })
}

/** 取反色（给手柄/预览圆点做对比色描边用，目前没用上，留着方便调） */
export function readableInkOn(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#000000'
  // 感知亮度（ITU-R BT.601），阈值取中
  const y = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return y > 140 ? '#000000' : '#ffffff'
}
