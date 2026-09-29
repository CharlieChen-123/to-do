import {
  BUILTIN_TAGS, FALLBACK_TAG_ID, buildTagRow, isTagRow,
  mergeTags, newTagId, parseTagRow, setTagRegistry,
  tagColor, tagIdFromRow, tagLabel, tagRank,
} from '../src/lib/tags'

let pass = 0
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       got=${a}\n      want=${b}`) }
}

console.log('1) 内置标签默认表')
eq('默认 8 个', BUILTIN_TAGS.length, 8)
eq('默认顺序', BUILTIN_TAGS.map(t => t.id),
  ['school','club','diy','health','portfolio','exam','admission','other'])

console.log('2) 哨兵行的构造 / 解析')
const custom = { id: 't1', label: '健身', color: '#c026d3', order: 8 }
const row = buildTagRow(custom)
eq('是哨兵行', isTagRow(row), true)
eq('id 前缀', row.id, '__tag__t1')
eq('不影响 dateKey（不会出现在任何一天）', row.dateKey, null)
eq('回读 id', tagIdFromRow(row), 't1')
eq("回读定义", parseTagRow(row), { ...custom, builtin: false })

console.log('3) 合并：内置 + 自建')
const merged = mergeTags([row])
eq('总数 8+1', merged.length, 9)
eq('自建排在最后', merged[merged.length - 1].id, 't1')
eq('自建名字', merged.find(t => t.id === 't1')!.label, '健身')

console.log('4) 覆盖内置：改名 / 改色')
const override = buildTagRow({ id: 'school', label: '功课', color: '#0891b2', order: 0, builtin: true })
const m2 = mergeTags([override])
eq('仍然 8 个', m2.length, 8)
eq('名字被覆盖', m2.find(t => t.id === 'school')!.label, '功课')
eq('颜色被覆盖', m2.find(t => t.id === 'school')!.color, '#0891b2')
eq('内置顺序保持', m2[0].id, 'school')

console.log('5) 删除标签（deleted=1）')
const m3 = mergeTags([buildTagRow(custom, 1)])
eq('自建标签删掉就没了', m3.length, 8)
eq('确实不含 t1', m3.some(t => t.id === 't1'), false)
const m4 = mergeTags([buildTagRow({ id: 'club', label: '社团', color: '#7c3aed', order: 1, builtin: true }, 1)])
eq('内置标签删掉是隐藏', m4.length, 7)
eq('club 被隐藏', m4.some(t => t.id === 'club'), false)
const m5 = mergeTags([buildTagRow({ id: FALLBACK_TAG_ID, label: '其它', color: '#78716c', order: 7, builtin: true }, 1)])
eq('「其它」删不掉（兜底必须常在）', m5.some(t => t.id === FALLBACK_TAG_ID), true)

console.log('6) 注册表驱动的取色 / 取名 / 排序')
setTagRegistry(merged)
eq('自建标签名', tagLabel('t1'), '健身')
eq('自建标签色', tagColor('t1'), '#c026d3')
eq('内置标签色', tagColor('school'), '#dc2626')
eq('未知标签取色为 null（交给 UI 兜底灰）', tagColor('nope'), null)
eq('未知标签名回显 id', tagLabel('nope'), 'nope')
eq('自建排在最后', tagRank('t1') > tagRank('other'), true)

console.log('7) 坏数据不崩')
const broken = { ...row, content: '{oops' }
eq('坏 JSON → null', parseTagRow(broken), null)
eq('坏行被跳过', mergeTags([broken]).length, 8)

console.log('8) 新 id 不冲突')
eq('跳过已用的 t1', newTagId(merged), 't2')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exit(1)
