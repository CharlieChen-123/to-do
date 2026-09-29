import { buildDayList, itemEntry, type DayEntryItem } from '../src/lib/useEntries'
import { blankEntry } from '../src/lib/db'
import { TODAY, toDateKey } from '../src/lib/date'
import type { Entry } from '../src/types'

let pass = 0, fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       got=${a}\n      want=${b}`) }
}

const today = TODAY()
const d = (n: number) => {
  const x = new Date(today + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return toDateKey(x)
}

const entries: Entry[] = [
  blankEntry({ id: 'A', kind: 'task', plainText: '今天没做完', dateKey: today, done: false }),
  blankEntry({ id: 'B', kind: 'task', plainText: '今天做完了', dateKey: today, done: true }),
  blankEntry({ id: 'C', kind: 'event', plainText: '今天的会议', dateKey: today }),
  blankEntry({ id: 'D', kind: 'task', plainText: '多日任务(起点前天,没勾)', dateKey: d(-2), recurring: 'daily', recurringUntil: d(2) }),
  blankEntry({ id: 'E', kind: 'task', plainText: '多日任务(起点前天,今天已勾)', dateKey: d(-2), recurring: 'daily', recurringUntil: d(2) }),
  blankEntry({ id: 'F', kind: 'task', plainText: '明天的事', dateKey: d(1), done: false }),
  blankEntry({ id: 'G', kind: 'task', plainText: '没有日期的收集箱条目', dateKey: null, done: false }),
]

const recurringDone = [
  { id: `E|${today}`, taskId: 'E', dateKey: today, doneAt: new Date().toISOString() },
]

// 与 useTodayTaskCount() 内部完全相同的口径
const items = buildDayList(entries, recurringDone, today)
const count = items.filter((it: DayEntryItem) => {
  const e = itemEntry(it)
  if (e.kind !== 'task') return false
  const done = it.kind === 'entry' ? it.entry.done : it.done
  return !done
}).length

console.log('今天视图列表包含：', items.map(it => itemEntry(it).id).join(','))
eq('今天未完成任务数 = 2 (A 普通 + D 重复实例)', count, 2)

// 对照：修复前侧栏用的老口径
const oldCount = entries.filter(e => !e.done && e.kind === 'task' && e.dateKey === today).length
console.log(`  （修复前侧栏口径会算成 ${oldCount}，所以徽章和视图对不上）`)
eq('老口径确实是错的', oldCount, 1)
eq('新口径不等于老口径（证明修复有意义）', count !== oldCount, true)

// 起点就是今天、且今天已勾掉的重复任务，不应该被重复计入
const e2 = blankEntry({ id: 'H', kind: 'task', dateKey: today, recurring: 'daily', recurringUntil: d(3) })
const c2 = buildDayList([...entries, e2], recurringDone, today)
  .filter(it => { const e = itemEntry(it); if (e.kind !== 'task') return false
    return !(it.kind === 'entry' ? it.entry.done : it.done) }).length
eq('未勾选的多日任务（起点今天）也算 1', c2, 3)

// 起始日那条与其虚拟实例不会同一天出现两次
const hAppear = buildDayList([e2], [], today).filter(it => itemEntry(it).id === 'H').length
eq('起始日不重复出现', hAppear, 1)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
