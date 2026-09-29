import assert from 'node:assert/strict'
import { parseNaturalDate } from '../src/lib/date'
import { organize } from '../src/lib/organize'

const base = new Date(2026, 8, 28, 9, 0)

assert.deepEqual(parseNaturalDate('Meeting tomorrow at 3 pm', base), {
  dateKey: '2026-09-29', time: { hour: 15, minute: 0 }, endTime: null, rest: 'Meeting',
})
assert.equal(parseNaturalDate('Call next Monday at 10:30 am', base).dateKey, '2026-10-05')
assert.equal(parseNaturalDate('Pay bill in 3 days', base).dateKey, '2026-10-01')
assert.equal(parseNaturalDate('Lunch today at 12 pm', base).time?.hour, 12)
assert.equal(parseNaturalDate('Wake at 12 am', base).time?.hour, 0)

const drafts = organize('Meeting tomorrow at 3 pm, buy groceries today', base)
assert.equal(drafts.length, 2)
assert.equal(drafts[0].text, 'Meeting')
assert.equal(drafts[0].dateKey, '2026-09-29')
assert.equal(drafts[0].kind, 'event')
assert.equal(drafts[1].text, 'buy groceries')
assert.equal(drafts[1].dateKey, '2026-09-28')
console.log('  ok   English dates, times, and multi-item input')
