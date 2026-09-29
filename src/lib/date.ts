import {
  addDays,
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isToday,
} from 'date-fns'

export const toDateKey = (d: Date): string => format(d, 'yyyy-MM-dd')

export const fromDateKey = (key: string): Date => {
  // 用本地组件构造，避免 parseISO('2026-08-31') 在某些时区下落到前一天导致
  // 「8/31 应该是周一却显示周二」的 off-by-one。
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const TODAY = (): string => toDateKey(new Date())

export const weekdayShort = ['日', '一', '二', '三', '四', '五', '六']

/** 友好日期：今天 / 明天 / 昨天 / 周三 / 8月30日 */
export function friendlyDate(key: string | null, lang: 'zh' | 'en' = 'zh'): string {
  if (!key) return ''
  const d = fromDateKey(key)
  const today = new Date()
  if (lang === 'en') {
    if (isSameDay(d, today)) return 'Today'
    if (isSameDay(d, addDays(today, 1))) return 'Tomorrow'
    if (isSameDay(d, addDays(today, -1))) return 'Yesterday'
    return format(d, d.getFullYear() === today.getFullYear() ? 'MMM d' : 'MMM d, yyyy')
  }
  if (isSameDay(d, today)) return '今天'
  if (isSameDay(d, addDays(today, 1))) return '明天'
  if (isSameDay(d, addDays(today, -1))) return '昨天'
  const diff = Math.round(
    (fromDateKey(key).getTime() - fromDateKey(TODAY()).getTime()) / 86400000,
  )
  if (diff > 1 && diff < 7) return `周${weekdayShort[d.getDay()]}`
  if (diff < -1 && diff > -7) return `上周${weekdayShort[d.getDay()]}`
  if (d.getFullYear() !== today.getFullYear()) return format(d, 'yyyy年M月d日')
  return format(d, 'M月d日')
}

/** 逾期：有截止日、未完成、且早于今天（YYYY-MM-DD 字典序即可比较） */
export function isOverdue(e: { dateKey: string | null; done: boolean }): boolean {
  return !!e.dateKey && !e.done && e.dateKey < TODAY()
}

export const formatTime = (iso: string | null | undefined): string => {
  if (!iso || typeof iso !== 'string') return ''
  const d = parseISO(iso)
  // 防御：非法时间字符串（如 'broken'、''）会让 format() 抛 RangeError → 整页白屏
  return Number.isNaN(d.getTime()) ? '' : format(d, 'HH:mm')
}

/** 兼容现有调用点；formatTime 已经会安全处理无效输入。 */
export const safeFormatTime = formatTime

export const formatTimeRange = (start?: string, end?: string): string => {
  if (start && end) return `${formatTime(start)}–${formatTime(end)}`
  if (start) return formatTime(start)
  return ''
}

/** 月视图网格：按用户设置的一周起始日补齐整月。weekStartsOn: 0=周日, 1=周一 */
export function monthGrid(anchor: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn })
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn })
  const days: Date[] = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = addDays(cur, 1)
  }
  return days
}

/** 周视图：周一到周日 */
/** 周视图：一周 7 天，起始日由设置决定（0=周日, 1=周一） */
export function weekDays(anchor: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const monthLabel = (d: Date): string => format(d, 'yyyy年M月')

export interface ParsedDate {
  dateKey: string | null
  time: { hour: number; minute: number } | null
  /** 时间范围的结束时间：「6点到7点半」→ 18:30 */
  endTime: { hour: number; minute: number } | null
  /** 剥离日期词之后的正文 */
  rest: string
}

const WEEKDAY_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 0, '0': 0,
}

/** 从字符串中移除首个匹配，返回 match 数组（找不到返回 null） */
function cut(src: string, re: RegExp): { m: RegExpMatchArray; rest: string } | null {
  const m = src.match(re)
  if (!m) return null
  return { m, rest: src.replace(m[0], ' ') }
}

/**
 * 自然语言日期解析：「明天下午3点开会」→ 日期 + 时间 + 剩余正文
 * 支持 今天/明天/后天/大后天、X天后、周X/下周三、8月30日/8-30、HH:mm、下午3点/3点半
 */
export function parseNaturalDate(input: string, base = new Date()): ParsedDate {
  let rest = input
  let dateKey: string | null = null
  let time: { hour: number; minute: number } | null = null
  let endTime: { hour: number; minute: number } | null = null

  // 0. 时间范围优先：「18:00-19:30」「6点到7点半」「6到7点」
  //    必须放在日期解析之前 —— 否则 step 4 会把「00-19」当成日期吃掉
  const range = tryParseRange(rest)
  if (range) {
    time = range.start
    endTime = range.end
    rest = range.rest
  }

  // Common English phrases used by the default English interface.
  const englishDay = cut(rest, /\b(day after tomorrow|tomorrow|today)\b/i)
  if (englishDay) {
    const days = englishDay.m[1].toLowerCase() === 'today' ? 0 : englishDay.m[1].toLowerCase() === 'tomorrow' ? 1 : 2
    dateKey = toDateKey(addDays(base, days))
    rest = englishDay.rest
  }
  if (!dateKey) {
    const englishOffset = cut(rest, /\bin\s+(\d{1,3})\s+days?\b/i)
    if (englishOffset) {
      dateKey = toDateKey(addDays(base, Number(englishOffset.m[1])))
      rest = englishOffset.rest
    }
  }
  if (!dateKey) {
    const englishWeekday = cut(rest, /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
    if (englishWeekday) {
      const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(englishWeekday.m[2].toLowerCase())
      const start = startOfWeek(base, { weekStartsOn: 1 })
      let day = addDays(start, (target + 6) % 7)
      if (englishWeekday.m[1] || (day < base && !isSameDay(day, base))) day = addDays(day, 7)
      dateKey = toDateKey(day)
      rest = englishWeekday.rest
    }
  }

  // 1. 相对天
  const rel = cut(rest, /(大后天|后天|明天|今天)/)
  if (rel) {
    const map: Record<string, number> = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }
    dateKey = toDateKey(addDays(base, map[rel.m[1]]))
    rest = rel.rest
  }

  // 2. X 天后
  if (!dateKey) {
    const r = cut(rest, /(\d{1,3})\s*天后/)
    if (r) {
      dateKey = toDateKey(addDays(base, Number(r.m[1])))
      rest = r.rest
    }
  }

  // 3. 下周X / 本周X / 周X / 星期X
  if (!dateKey) {
    const r = cut(rest, /(下下周|下周|本周|这周|星期|周)\s*([一二三四五六日天1-7])/)
    if (r) {
      const target = WEEKDAY_MAP[r.m[2]] ?? 1
      const start = startOfWeek(base, { weekStartsOn: 1 })
      const idx = (target + 6) % 7
      let d = addDays(start, idx)
      const ahead = r.m[1] === '下周' ? 1 : r.m[1] === '下下周' ? 2 : 0
      d = addDays(d, ahead * 7)
      if (ahead === 0 && d < base && !isSameDay(d, base)) d = addDays(d, 7)
      dateKey = toDateKey(d)
      rest = r.rest
    }
  }

  // 4. 具体日期：8月30日 / 8-30 / 8.30 / 8/30
  if (!dateKey) {
    const r = cut(rest, /(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*日?/)
    if (r) {
      const month = Number(r.m[1]) - 1
      const day = Number(r.m[2])
      let d = new Date(base.getFullYear(), month, day)
      if (d < base && !isSameDay(d, base)) d = new Date(base.getFullYear() + 1, month, day)
      dateKey = toDateKey(d)
      rest = r.rest
    }
  }

  // 6. 单个时间（仅当 step 0 没解析到「时间范围」时才补）· HH:mm
  //    注意：时间范围已在 step 0 优先解析并剥除，这里只处理「单独一个时间」
  if (!time) {
    const englishTime = cut(rest, /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    if (englishTime) {
      time = applyPeriod(Number(englishTime.m[1]), Number(englishTime.m[2] ?? 0), englishTime.m[3].toLowerCase())
      rest = englishTime.rest
    }
  }
  if (!time) {
    let t = cut(rest, /(上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/)
    if (t) {
      time = applyPeriod(Number(t.m[2]), Number(t.m[3]), t.m[1])
      rest = t.rest
    } else {
      // 单个时间 · 下午3点 / 3点半 / 10点15分
      t = cut(rest, /(上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*[点時时]\s*(半|\d{1,2}\s*分?)?/)
      if (t) {
        const minute = t.m[3] === '半' ? 30 : t.m[3] ? Number(t.m[3].replace(/[^\d]/g, '')) : 0
        time = applyPeriod(Number(t.m[2]), minute, t.m[1])
        rest = t.rest
      }
    }
  }

  return { dateKey, time, endTime, rest: rest.replace(/\s+/g, ' ').trim() }
}

function applyPeriod(
  hour: number,
  minute: number,
  period?: string,
): { hour: number; minute: number } {
  let h = hour
  if (period === '下午' || period === '晚上' || period === 'pm') h = h < 12 ? h + 12 : h
  else if (period === '中午') h = h < 12 ? 12 : h
  else if (period === '上午' || period === '凌晨' || period === 'am') h = h === 12 ? 0 : h
  return { hour: Math.min(Math.max(h, 0), 23), minute: Math.min(Math.max(minute, 0), 59) }
}

type HM = { hour: number; minute: number }

/** 「半」→30，「25分」→25，空 →0 */
function parseMinute(s?: string): number {
  if (!s) return 0
  if (s.includes('半')) return 30
  const n = Number(s.replace(/[^\d]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

const P = '(?:上午|中午|下午|晚上|凌晨)'
const SEP = '(?:—|–|-|~|～|到|至)'
const MIN = '(?:半|\\d{1,2}\\s*分?)'

/** 18:00-19:30 / 18:00 到 19:30 */
const RE_RANGE_HM = new RegExp(
  `(${P})?\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{2})\\s*${SEP}\\s*(${P})?\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{2})`,
)
/** 6点到7点半 / 下午3点到4点 */
const RE_RANGE_CN = new RegExp(
  `(${P})?\\s*(\\d{1,2})\\s*[点時时]\\s*(${MIN})?\\s*${SEP}\\s*(${P})?\\s*(\\d{1,2})\\s*[点時时]\\s*(${MIN})?`,
)
/** 6到7点 / 6-7点（开始省略「点」） */
const RE_RANGE_SHORT = new RegExp(
  `(${P})?\\s*(\\d{1,2})\\s*${SEP}\\s*(\\d{1,2})\\s*[点時时]\\s*(${MIN})?`,
)

/**
 * 解析时间范围。命中则同时返回 start/end，并把整段从正文里剥掉，
 * 避免「6点到7点半开会」被切成 start=6点 + 标题「到7点半开会」。
 */
function tryParseRange(src: string): { start: HM; end: HM; rest: string } | null {
  let r = cut(src, RE_RANGE_HM)
  if (r) {
    return {
      start: applyPeriod(Number(r.m[2]), Number(r.m[3]), r.m[1]),
      end: applyPeriod(Number(r.m[5]), Number(r.m[6]), r.m[4] || r.m[1]),
      rest: r.rest,
    }
  }
  r = cut(src, RE_RANGE_CN)
  if (r) {
    return {
      start: applyPeriod(Number(r.m[2]), parseMinute(r.m[3]), r.m[1]),
      end: applyPeriod(Number(r.m[5]), parseMinute(r.m[6]), r.m[4] || r.m[1]),
      rest: r.rest,
    }
  }
  r = cut(src, RE_RANGE_SHORT)
  if (r) {
    return {
      start: applyPeriod(Number(r.m[2]), 0, r.m[1]),
      end: applyPeriod(Number(r.m[3]), parseMinute(r.m[4]), r.m[1]),
      rest: r.rest,
    }
  }
  return null
}

/** dateKey + time → ISO */
export function combineDateTime(
  dateKey: string,
  time: { hour: number; minute: number },
): string {
  const d = fromDateKey(dateKey)
  d.setHours(time.hour, time.minute, 0, 0)
  // 防御：小时/分钟非法（NaN）→ Invalid Date，toISOString 会抛错误导致整页白屏
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

export { isSameDay, isToday, addDays, format, startOfWeek }
