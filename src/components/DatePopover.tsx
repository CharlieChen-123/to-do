import { useMemo, useState, type CSSProperties } from 'react'
import { PickerPopover } from './PickerPopover'
import { fromDateKey, toDateKey, TODAY, weekdayShort } from '../lib/date'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'

const MONTH_SHORT = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]
const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ============================================================
 * 三个 picker 共用 PickerPopover 外壳，所以外观完全一致：
 *   顶栏日期（选天） / 周历（选周） / 月历（选月）
 * ============================================================ */

/* ---------------- 选「天」---------------- */

interface DatePopoverProps {
  anchorRect: DOMRect
  value: string
  onSelect: (key: string) => void
  onClose: () => void
  weekStartsOn?: 0 | 1
}

export function DatePopover({
  anchorRect,
  value,
  onSelect,
  onClose,
  weekStartsOn = 1,
}: DatePopoverProps) {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const months = lang === 'en' ? MONTH_SHORT_EN : MONTH_SHORT
  const weekdays = lang === 'en' ? WEEKDAY_EN : weekdayShort
  const initial = useMemo(() => fromDateKey(value || TODAY()), [value])
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  /** 翻月方向：驱动日历网格入场动画（下一月从右、上一月从左） */
  const [dir, setDir] = useState(1)

  const days = useMemo(() => {
    const first = new Date(year, month, 1)
    const start = new Date(first)
    const offset = (first.getDay() + 6) % 7 // 周一为周首
    start.setDate(first.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [year, month])

  const shift = (delta: number) => {
    setDir(delta >= 0 ? 1 : -1)
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const todayKey = TODAY()
  const valueDate = fromDateKey(value)
  const inValueMonth =
    valueDate.getFullYear() === year && valueDate.getMonth() === month

  return (
    <PickerPopover
      anchorRect={anchorRect}
      onClose={onClose}
      ariaLabel={l('选择日期', 'Choose date')}
      header={
        <>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => shift(-1)}
            aria-label={l('上一月', 'Previous month')}
          >
            ‹
          </button>
          <div className="jot-datepop-title">
            {year} · {months[month]}
          </div>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => shift(1)}
            aria-label={l('下一月', 'Next month')}
          >
            ›
          </button>
          <button
            type="button"
            className="jot-text-btn"
            onClick={() => {
              const d = new Date()
              setYear(d.getFullYear())
              setMonth(d.getMonth())
            }}
          >
            {l('今天', 'Today')}
          </button>
        </>
      }
    >
      <div className="jot-datepop-weekdays">
        {weekdays
          .slice(weekStartsOn)
          .concat(weekdays.slice(0, weekStartsOn))
          .map((w, i) => {
            // 周末高亮：在原始 weekdayShort 里的索引
            const realIdx = (i + weekStartsOn) % 7
            return (
              <span key={i} className={realIdx === 0 || realIdx === 6 ? 'is-weekend' : ''}>
                {w}
              </span>
            )
          })}
      </div>

      <div
        className="jot-datepop-grid"
        key={`${year}-${month}`}
        style={{ '--jot-enter-x': dir > 0 ? '24px' : '-24px' } as CSSProperties}
      >
        {days.map((d) => {
          const inMonth = d.getMonth() === month
          const k = toDateKey(d)
          return (
            <button
              key={k}
              type="button"
              className={[
                'jot-datepop-day',
                inMonth ? '' : 'is-outside',
                k === todayKey ? 'is-today' : '',
                inMonth && inValueMonth && k === value ? 'is-selected' : '',
                d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelect(k)
                onClose()
              }}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </PickerPopover>
  )
}

/* ---------------- 选「月」 ---------------- */

interface MonthPopoverProps {
  anchorRect: DOMRect
  /** 当前锚点日期 */
  anchor: Date
  onPick: (year: number, month: number) => void
  onClose: () => void
  weekStartsOn?: 0 | 1
}

export function MonthPopover({
  anchorRect,
  anchor,
  onPick,
  onClose,
  weekStartsOn: _wso, // 暂未在月份选择器里用，但保留 prop 方便将来扩展
}: MonthPopoverProps) {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const months = lang === 'en' ? MONTH_SHORT_EN : MONTH_SHORT
  const [year, setYear] = useState(anchor.getFullYear())
  /** 翻年方向：驱动月份网格入场动画 */
  const [dir, setDir] = useState<1 | -1>(1)
  const now = new Date()

  return (
    <PickerPopover
      anchorRect={anchorRect}
      onClose={onClose}
      ariaLabel={l('选择年月', 'Choose month')}
      header={
        <>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => {
              setDir(-1)
              setYear((y) => y - 1)
            }}
            aria-label={l('上一年', 'Previous year')}
          >
            ‹
          </button>
          <div className="jot-datepop-title">{year}</div>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => {
              setDir(1)
              setYear((y) => y + 1)
            }}
            aria-label={l('下一年', 'Next year')}
          >
            ›
          </button>
          <button
            type="button"
            className="jot-text-btn"
            onClick={() => {
              setDir(1)
              setYear(now.getFullYear())
            }}
          >
            {l('今年', 'This year')}
          </button>
        </>
      }
    >
      <div
        className="jot-datepop-months"
        key={year}
        style={{ '--jot-enter-x': dir > 0 ? '24px' : '-24px' } as CSSProperties}
      >
        {months.map((label, i) => {
          const isCurrent =
            i === anchor.getMonth() && year === anchor.getFullYear()
          const isThisMonth =
            i === now.getMonth() && year === now.getFullYear()
          return (
            <button
              key={label}
              type="button"
              className={`jot-datepop-month ${isCurrent ? 'is-selected' : ''} ${
                isThisMonth ? 'is-today' : ''
              }`}
              onClick={() => {
                onPick(year, i)
                onClose()
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </PickerPopover>
  )
}

/* ---------------- 选「周」 ---------------- */

interface WeekPopoverProps {
  anchorRect: DOMRect
  anchor: Date
  onPick: (monday: Date) => void
  onClose: () => void
  weekStartsOn?: 0 | 1
}

export function WeekPopover({
  anchorRect,
  anchor,
  onPick,
  onClose,
  weekStartsOn = 1,
}: WeekPopoverProps) {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const months = lang === 'en' ? MONTH_SHORT_EN : MONTH_SHORT
  const weekdays = lang === 'en' ? WEEKDAY_EN : weekdayShort
  const initial = useMemo(
    () => fromDateKey(toDateKey(anchor)),
    [anchor],
  )
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  /** 翻月方向：驱动日历网格入场动画 */
  const [dir, setDir] = useState<1 | -1>(1)

  const days = useMemo(() => {
    const first = new Date(year, month, 1)
    const start = new Date(first)
    const offset = (first.getDay() - weekStartsOn + 7) % 7
    start.setDate(first.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [year, month, weekStartsOn])

  const startOfWeekAny = (d: Date): Date => {
    const x = new Date(d)
    const offset = (x.getDay() - weekStartsOn + 7) % 7
    x.setDate(x.getDate() - offset)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const anchorMonday = startOfWeekAny(anchor)
  const todayKey = TODAY()

  /** 鼠标悬停的那一周（周首 dateKey）：悬停时整周高亮并框出来。
   *  悬停优先于选中 —— 悬停别的周时，之前那周的选中特效自动取消，
   *  保证同一时刻只有一周被高亮。 */
  const [hoverWeekKey, setHoverWeekKey] = useState<string | null>(null)
  /** 当前周视图所在周（锚点）的周首 dateKey */
  const selWeekKey = toDateKey(anchorMonday)

  const shiftMonth = (delta: number) => {
    setDir(delta >= 0 ? 1 : -1)
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  return (
    <PickerPopover
      anchorRect={anchorRect}
      onClose={onClose}
      ariaLabel={l('选择周', 'Choose week')}
      width={320}
      header={
        <>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => shiftMonth(-1)}
            aria-label={l('上一月', 'Previous month')}
          >
            ‹
          </button>
          <div className="jot-datepop-title">
            {year} · {months[month]}
          </div>
          <button
            type="button"
            className="jot-icon-btn"
            onClick={() => shiftMonth(1)}
            aria-label={l('下一月', 'Next month')}
          >
            ›
          </button>
          <button
            type="button"
            className="jot-text-btn"
            onClick={() => {
              const d = new Date()
              setYear(d.getFullYear())
              setMonth(d.getMonth())
              setDir(1)
            }}
          >
            {l('今天', 'Today')}
          </button>
        </>
      }
    >
      <div className="jot-datepop-weekdays">
        {weekdays
          .slice(weekStartsOn)
          .concat(weekdays.slice(0, weekStartsOn))
          .map((w, i) => {
            const realIdx = (i + weekStartsOn) % 7
            return (
              <span key={i} className={realIdx === 0 || realIdx === 6 ? 'is-weekend' : ''}>
                {w}
              </span>
            )
          })}
      </div>

      <div
        className="jot-datepop-grid"
        key={`${year}-${month}`}
        style={{ '--jot-enter-x': dir > 0 ? '24px' : '-24px' } as CSSProperties}
        onMouseLeave={() => setHoverWeekKey(null)}
      >
        {days.map((d) => {
          const inMonth = d.getMonth() === month
          const k = toDateKey(d)
          const cellWeekKey = toDateKey(startOfWeekAny(d))
          // 悬停优先于选中：悬停时只高亮悬停周；不悬停时高亮当前选中周
          const effectiveKey = hoverWeekKey ?? selWeekKey
          const isWeekHi = cellWeekKey === effectiveKey
          return (
            <button
              key={k}
              type="button"
              className={[
                'jot-datepop-day',
                inMonth ? '' : 'is-outside',
                k === todayKey ? 'is-today' : '',
                isWeekHi ? 'is-week-hi' : '',
                d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setHoverWeekKey(cellWeekKey)}
              onClick={() => {
                // 点任意一天 = 进入它所在的整周
                onPick(startOfWeekAny(d))
                onClose()
              }}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </PickerPopover>
  )
}

/** 列出某年所有的周（按用户设置的起始日），从第 1 周排到 12/31 所在周 */
export function buildYearWeeks(
  year: number,
  weekStartsOn: 0 | 1 = 1,
): { n: number; monday: Date; sunday: Date }[] {
  // 找 1/1 所在周的第一天（周日=0 或 周一=1）
  const jan1 = new Date(year, 0, 1)
  const offset = (jan1.getDay() - weekStartsOn + 7) % 7
  const firstWeekStart = new Date(jan1)
  firstWeekStart.setDate(jan1.getDate() - offset)
  // 找 12/31 所在周的最后一天
  const dec31 = new Date(year, 11, 31)
  const off2 = (dec31.getDay() - weekStartsOn + 7) % 7
  const lastWeekEnd = new Date(dec31)
  lastWeekEnd.setDate(dec31.getDate() + (6 - off2))

  const out: { n: number; monday: Date; sunday: Date }[] = []
  let cur = firstWeekStart
  let n = 1
  while (cur <= lastWeekEnd) {
    const end = new Date(cur)
    end.setDate(cur.getDate() + 6)
    out.push({ n, monday: new Date(cur), sunday: end })
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
    n++
  }
  return out
}
