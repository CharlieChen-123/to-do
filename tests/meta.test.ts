/**
 * 云端元数据编解码（lib/meta.ts）回归测试
 * ============================================================
 * 这一层的问题都不会在编译期暴露，但一旦错了很难查：
 *   - 编码漏字段 → 手机端收不到重复配置 / 删除时刻；
 *   - 解码太严 → 老数据（颜色值、没有新字段的 rec 载荷）整条被丢弃；
 *   - 解码太松 → 把 '#DC2626' 这种老颜色值当成配置读进来。
 * 所以这里把「三种载荷 + 老数据 + 坏数据 + 前后兼容」全钉住。
 *
 * 跑法：node tests/run.mjs
 */
import type { Entry } from '../src/types'
import { decodeMeta, encodeMeta } from '../src/lib/meta'

let pass = 0
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       got=${a}\n      want=${b}`) }
}

/** 造一条最小可用的 Entry，只覆盖编解码关心的字段 */
const entry = (o: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'task',
  content: 'x',
  plainText: 'x',
  done: false,
  starred: false,
  allDay: false,
  tentative: false,
  dateKey: '2026-09-22',
  color: null,
  category: null,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
  order: 1,
  deleted: 0,
  ...o,
})

const DA = '2026-09-01T10:00:00.000Z'

console.log('1) 墓碑最优先')
eq('purged → purged:1', encodeMeta(entry({ purged: true }), []), 'purged:1')
eq(
  'purged 压过 repeating/deleted',
  encodeMeta(
    entry({ purged: true, recurring: 'daily', deleted: 1, deletedAt: DA }),
    ['2026-09-02'],
  ),
  'purged:1',
)
eq('解出 purged', decodeMeta('purged:1').purged, true)
eq('墓碑不带 deletedAt', decodeMeta('purged:1').deletedAt, undefined)

console.log('2) 普通条目不占这一列')
eq('未删未重复 → null', encodeMeta(entry(), []), null)
eq('null 解码为空', decodeMeta(null), { doneDates: [], purged: false })
eq('undefined 解码为空', decodeMeta(undefined), { doneDates: [], purged: false })
eq('空串解码为空', decodeMeta(''), { doneDates: [], purged: false })

console.log('3) 多日重复：原字段 + 软删时刻')
const recEnc = encodeMeta(
  entry({ recurring: 'daily', recurringUntil: '2026-10-01', deleted: 1, deletedAt: DA }),
  ['2026-09-03', '2026-09-02'],
)
eq('走 rec: 前缀', recEnc!.startsWith('rec:'), true)
const rec1 = decodeMeta(recEnc)
eq('recurring', rec1.recurring, 'daily')
eq('recurringUntil', rec1.recurringUntil, '2026-10-01')
eq('doneDates 排序稳定', rec1.doneDates, ['2026-09-02', '2026-09-03'])
eq('deletedAt 带回来了', rec1.deletedAt, DA)
eq('不是墓碑', rec1.purged, false)

console.log('4) 多日重复但没被删 → 不写 da')
const recNoDel = encodeMeta(entry({ recurring: 'daily' }), [])
eq('没有 da 字段', recNoDel!.includes('"da"'), false)
eq('deletedAt 为 undefined', decodeMeta(recNoDel).deletedAt, undefined)
eq('recurringShowInWeekMonth=false 记 wm:0',
  decodeMeta(encodeMeta(entry({ recurring: 'daily', recurringShowInWeekMonth: false }), []))
    .recurringShowInWeekMonth,
  false)

console.log('5) 非重复条目的软删时刻走 del:')
const delEnc = encodeMeta(entry({ deleted: 1, deletedAt: DA }), [])
eq('走 del: 前缀', delEnc!.startsWith('del:'), true)
const del1 = decodeMeta(delEnc)
eq('deletedAt', del1.deletedAt, DA)
eq('不是重复任务', del1.recurring, undefined)
eq('没有完成日期', del1.doneDates, [])

console.log('6) 不变式：非删状态不携带 deletedAt')
eq(
  'deleted=0 但有 deletedAt → 不编码（否则会带着陈旧删除时间）',
  encodeMeta(entry({ deleted: 0, deletedAt: DA }), []),
  null,
)
eq(
  'deleted=1 但没有 deletedAt → 不编码（靠 updatedAt 兜底）',
  encodeMeta(entry({ deleted: 1 }), []),
  null,
)

console.log('7) 老数据兼容')
eq('老颜色值被忽略', decodeMeta('#DC2626'), { doneDates: [], purged: false })
eq('老颜色值（小写）被忽略', decodeMeta('#dc2626').recurring, undefined)
const legacyRec = 'rec:' + JSON.stringify({
  r: 'daily',
  u: '2026-12-31',
  d: ['2026-09-05'],
})
const legacyDec = decodeMeta(legacyRec)
eq('老 rec 载荷仍能读', legacyDec.recurring, 'daily')
eq('老 rec 的 until', legacyDec.recurringUntil, '2026-12-31')
eq('老 rec 的完成日期', legacyDec.doneDates, ['2026-09-05'])
eq('老 rec 没有 deletedAt', legacyDec.deletedAt, undefined)

console.log('8) 坏数据不崩')
eq('坏 JSON 的 rec → 空', decodeMeta('rec:{oops'), { doneDates: [], purged: false })
eq('坏 JSON 的 del → 空', decodeMeta('del:{oops'), { doneDates: [], purged: false })
eq('r 不是 daily → 空', decodeMeta('rec:{"r":"weekly"}'), { doneDates: [], purged: false })
eq('del 载荷缺 t → 空 deletedAt', decodeMeta('del:{}').deletedAt, undefined)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
