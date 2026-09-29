/**
 * 取色面板的颜色换算回归测试
 * ============================================================
 * 这套算法肉眼验不了 —— 偏几个色阶根本看不出来，但拖一圈之后颜色会明显发脏。
 * 所以用测试钉住三件事：
 *   1) 已知颜色的换算结果跟标准值一致（红绿蓝/黑白灰/半明度红）；
 *   2) hex → hsv → hex 往返不丢色（这是拖手柄时每帧都在走的路）；
 *   3) 越界输入被夹住而不是产出非法颜色（拖出方块外面、色相绕圈）。
 *
 * 跑法：node tests/run.mjs
 */
import {
  clamp01,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  hueToHex,
  normalizeHue,
  readableInkOn,
  rgbToHex,
  rgbToHsv,
} from '../src/lib/color'
import { TAG_PALETTE } from '../src/lib/tags'
import { THEMES } from '../src/themes'

let pass = 0
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${a}\n       want ${b}`) }
}

console.log('1) hex → rgb')
eq('#000000', hexToRgb('#000000'), { r: 0, g: 0, b: 0 })
eq('#ffffff', hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 })
eq('#ff0000', hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 })
eq('#0891b2', hexToRgb('#0891b2'), { r: 8, g: 145, b: 178 })
eq('3 位简写展开 #abc', hexToRgb('#abc'), { r: 170, g: 187, b: 204 })
eq('大写也认', hexToRgb('#AABBCC'), { r: 170, g: 187, b: 204 })
eq('不带 # 也认（手输常忘）', hexToRgb('5b21b6'), { r: 91, g: 33, b: 182 })
eq('首尾空格容忍', hexToRgb('  #5b21b6 '), { r: 91, g: 33, b: 182 })
eq('5 位非法', hexToRgb('#12345'), null)
eq('8 位非法', hexToRgb('#aabbccdd'), null)
eq('非 hex 非法', hexToRgb('red'), null)
eq('空串非法', hexToRgb(''), null)

console.log('2) rgb → hex')
eq('基本', rgbToHex({ r: 8, g: 145, b: 178 }), '#0891b2')
eq('补零', rgbToHex({ r: 0, g: 5, b: 16 }), '#000510')
eq('超界夹住', rgbToHex({ r: 300, g: -20, b: 128 }), '#ff0080')
eq('四舍五入', rgbToHex({ r: 127.5, g: 127.4, b: 0 }), '#807f00')
eq('NaN 当 0（不能产出 #NaN）', rgbToHex({ r: NaN, g: 0, b: 0 }), '#000000')

console.log('3) rgb → hsv')
eq('红', rgbToHsv({ r: 255, g: 0, b: 0 }), { h: 0, s: 1, v: 1 })
eq('绿', rgbToHsv({ r: 0, g: 255, b: 0 }), { h: 120, s: 1, v: 1 })
eq('蓝', rgbToHsv({ r: 0, g: 0, b: 255 }), { h: 240, s: 1, v: 1 })
eq('白：饱和度为 0', rgbToHsv({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, v: 1 })
eq('黑：明度为 0', rgbToHsv({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, v: 0 })
eq('中灰：饱和度为 0', rgbToHsv({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, v: 128 / 255 })

console.log('4) hsv → rgb / hex')
eq('纯红', hsvToHex({ h: 0, s: 1, v: 1 }), '#ff0000')
eq('纯绿', hsvToHex({ h: 120, s: 1, v: 1 }), '#00ff00')
eq('纯蓝', hsvToHex({ h: 240, s: 1, v: 1 }), '#0000ff')
eq('白', hsvToHex({ h: 0, s: 0, v: 1 }), '#ffffff')
eq('黑', hsvToHex({ h: 210, s: 0, v: 0 }), '#000000')
eq('半明度红', hsvToHex({ h: 0, s: 1, v: 0.5 }), '#800000')
eq('青色段（h=180）', hsvToHex({ h: 180, s: 1, v: 1 }), '#00ffff')
eq('黄色段（h=60）', hsvToHex({ h: 60, s: 1, v: 1 }), '#ffff00')
eq('hsvToRgb 分量是整数', hsvToRgb({ h: 200, s: 0.5, v: 0.5 }).r % 1, 0)

console.log('5) 往返不丢色（拖手柄每帧都走这条路）')
const roundTrip = (c: string) => {
  const hsv = hexToHsv(c)
  if (!hsv) throw new Error(`测试数据本身不合法：${c}`)
  return hsvToHex(hsv)
}
for (const c of TAG_PALETTE) eq(`预设色往返 ${c}`, roundTrip(c), c)
for (const c of ['#000000', '#ffffff', '#808080', '#404040', '#123456', '#fedcba', '#010203']) {
  eq(`边界色往返 ${c}`, roundTrip(c), c)
}

console.log('6) 灰色不该被当成红色')
// s=0 时色相无意义：同一个明度下，任何色相都必须得到同一个灰
eq('灰不受色相影响', hsvToHex({ h: 300, s: 0, v: 0.5 }), hsvToHex({ h: 0, s: 0, v: 0.5 }))
eq('灰色 s 精确为 0（而不是 1e-16）', hexToHsv('#808080')?.s, 0)

console.log('7) 越界输入必须夹住')
eq('clamp01 下界', clamp01(-1), 0)
eq('clamp01 上界', clamp01(2), 1)
eq('clamp01 NaN', clamp01(NaN), 0)
eq('s 超界', hsvToHex({ h: 0, s: 5, v: 1 }), '#ff0000')
eq('v 超界', hsvToHex({ h: 0, s: 1, v: 5 }), '#ff0000')
eq('v 负值', hsvToHex({ h: 0, s: 1, v: -3 }), '#000000')
eq('归一负色相', normalizeHue(-30), 330)
eq('归一超圈色相', normalizeHue(400), 40)
eq('归一整圈', normalizeHue(360), 0)
eq('负色相照样出合法色', hsvToHex({ h: -120, s: 1, v: 1 }), '#0000ff')

console.log('8) 纯色相（方块底色）')
eq('hueToHex 0', hueToHex(0), '#ff0000')
eq('hueToHex 120', hueToHex(120), '#00ff00')
eq('hueToHex 240', hueToHex(240), '#0000ff')

console.log('9) 手柄描边对比色')
eq('白底用黑', readableInkOn('#ffffff'), '#000000')
eq('黑底用白', readableInkOn('#000000'), '#ffffff')
eq('非法色兜底黑', readableInkOn('nope'), '#000000')

console.log('10) 主题色必须是有效的 hex 值')
for (const theme of THEMES) {
  eq(`${theme.id} 的所有颜色有效`, Object.values(theme.vars).every((value) => /^#[0-9a-f]{6}$/i.test(value)), true)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
