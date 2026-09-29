/**
 * 回收站保留期 + 自定义颜色校验 回归测试
 * ============================================================
 * 保留期算错的两个方向都很恶心：
 *   - 偏长 → 说好的 30 天却一直躺着，用户以为删除没用；
 *   - 偏短 → 用户刚丢进回收站的东西被立刻清掉，**直接丢数据**。
 * 这里把边界（29/30/31 天）、"不拿 updatedAt 当计时起点"这条关键决定、
 * 以及老数据没有 deletedAt 时的兜底都钉住。
 *
 * 跑法：node tests/run.mjs
 */
import type { Entry } from '../src/types'
import {
  TRASH_RETENTION_DAYS,
  trashDaysLeft,
  trashExpiresAt,
} from '../src/lib/trash'
import {
  TAG_PALETTE,
  isValidHexColor,
  normalizeHexColor,
} from '../src/lib/tags'

let pass = 0
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       got=${a}\n      want=${b}`) }
}

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()

/** 回收站里的一条软删记录 */
const trashed = (o: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'task',
  content: 'x',
  plainText: 'x',
  done: false,
  starred: false,
  allDay: false,
  tentative: false,
  dateKey: '2026-08-01',
  color: null,
  category: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: daysAgo(1),
  order: 1,
  deleted: 1,
  deletedAt: daysAgo(1),
  ...o,
})

console.log('1) 保留期常量')
eq('保留 30 天', TRASH_RETENTION_DAYS, 30)

console.log('2) 剩余天数边界')
eq('刚删 → 30 天', trashDaysLeft(trashed({ deletedAt: daysAgo(0) })), 30)
eq('删了半天 → 30 天（向上取整）', trashDaysLeft(trashed({ deletedAt: daysAgo(0.5) })), 30)
eq('29 天前 → 还剩 1 天', trashDaysLeft(trashed({ deletedAt: daysAgo(29) })), 1)
eq('29.9 天前 → 还剩 1 天', trashDaysLeft(trashed({ deletedAt: daysAgo(29.9) })), 1)
eq('刚满 30 天 → 0（到期）', trashDaysLeft(trashed({ deletedAt: daysAgo(30) })), 0)
eq('31 天前 → 0（不出现负数）', trashDaysLeft(trashed({ deletedAt: daysAgo(31) })), 0)
eq('365 天前 → 0（不出现负数）', trashDaysLeft(trashed({ deletedAt: daysAgo(365) })), 0)

console.log('3) 计时起点必须是 deletedAt，不能是 updatedAt')
// 场景：删完之后又被改动过（例如删标签时把回收站条目的标签改写成了「其它」，
// updatedAt 被刷新成"刚刚"）。如果拿 updatedAt 当起点，保留期就会被无限续命。
eq(
  'deletedAt 20 天前 + updatedAt 刚刚 → 剩 10 天（不被 updatedAt 续命）',
  trashDaysLeft(trashed({ deletedAt: daysAgo(20), updatedAt: daysAgo(0) })),
  10,
)
eq(
  'deletedAt 40 天前 + updatedAt 刚刚 → 0（该清就清）',
  trashDaysLeft(trashed({ deletedAt: daysAgo(40), updatedAt: daysAgo(0) })),
  0,
)

console.log('4) 老数据没有 deletedAt → 退回 updatedAt 估算')
eq(
  '只有 updatedAt（10 天前）→ 剩 20 天',
  trashDaysLeft(trashed({ deletedAt: undefined, updatedAt: daysAgo(10) })),
  20,
)
eq(
  'updatedAt 也是坏的 → 按"刚删"处理（不误清）',
  trashDaysLeft(trashed({ deletedAt: undefined, updatedAt: 'not-a-date' })),
  30,
)

console.log('5) 到期时刻')
const t0 = trashed({ deletedAt: '2026-09-01T00:00:00.000Z' })
eq(
  'deletedAt + 30 天',
  trashExpiresAt(t0).toISOString(),
  new Date(Date.parse('2026-09-01T00:00:00.000Z') + 30 * DAY).toISOString(),
)

console.log('6) 颜色校验')
eq('#abc 展开成 6 位', normalizeHexColor('#abc'), '#aabbcc')
eq('大写归一小写', normalizeHexColor('#AABBCC'), '#aabbcc')
eq('去首尾空格', normalizeHexColor('  #5b21b6 '), '#5b21b6')
eq('缺 # 不合法', normalizeHexColor('5b21b6'), null)
eq('5 位不合法', normalizeHexColor('#12345'), null)
eq('8 位（带 alpha）不收 — 应用里只用 6 位', normalizeHexColor('#aabbccdd'), null)
eq('英文色名不合法', normalizeHexColor('red'), null)
eq('空串不合法', normalizeHexColor(''), null)
eq('isValidHexColor(#fff)', isValidHexColor('#fff'), true)
eq('isValidHexColor(#ffff)', isValidHexColor('#ffff'), false)

console.log('7) 预设色板本身必须都是合法色值')
const allColors = [...TAG_PALETTE]
eq('预设 12 色', TAG_PALETTE.length, 12)
eq('全部合法', allColors.every((c) => isValidHexColor(c)), true)
eq('全部已归一（不会有 3 位写法）', allColors.every((c) => c === normalizeHexColor(c)), true)
eq('无重复色', new Set(allColors).size, allColors.length)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
