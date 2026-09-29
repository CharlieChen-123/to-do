import type { CategoryId, EntryKind } from '../types'
// 显式带 .ts，这样 node --experimental-strip-types 也能直接跑单测
import { parseNaturalDate } from './date.ts'

export interface Draft {
  id: string
  kind: EntryKind
  text: string
  dateKey: string | null
  time: { hour: number; minute: number } | null
  endTime: { hour: number; minute: number } | null
  tentative: boolean
  /** 自动分类类别（本地规则法不分类，留 null） */
  category?: CategoryId | null
  /** 跨多天任务：「从今天到周三」→ recurring='daily' + recurringUntil='周三' */
  recurring?: 'daily'
  recurringUntil?: string | null
}

/** 明显是日程（即便没说具体几点） */
const EVENT_RE =
  /(会议|开会|例会|周会|上课|课程|比赛|竞赛|大赛|答辩|面试|聚会|聚餐|约会|活动|讲座|考试|测验|quiz|exam|deadline|meeting|appointment|class|interview|flight|train|dinner|lunch|breakfast|concert|截止|汇报|演示|彩排|训练|航班|火车|看电影|吃饭|演出|展览|培训|研讨|沙龙|庆典|派对|集合|出发|开组|组会|讨论|看医生|复诊|体检)/i
/** 「可能要参加的比赛」→ 待定 */
const TENTATIVE_RE = /(可能|也许|大概|说不定|待定|看看|再说|暂时|打算|如果|考虑|或许)/i
/** 文本含日期词 */
const HAS_DATE_WORD =
  /(今天|明天|后天|大后天|下周|下下周|本周|这周|周[一二三四五六日天1-7]|星期[一二三四五六日天1-7]|\d+\s*天后|\d+\s*[月\/\-.]|\b(?:today|tomorrow|day after tomorrow|next\s+\w+day|in\s+\d+\s+days?)\b)/i

/**
 * 纯噪声 / 语气词 / 说话习惯用语 —— 用户讲话时夹杂的填充语，
 * 提取任务时应剔除，不然 "嗯"、"那个" 也会变成任务。
 *
 * 命中条件（任一）：
 *  1) 整段只包含这些词 + 标点；
 *  2) 句子在 tidy 后剩下来前 4 个 token 全是这些词。
 */
const FILLER_WORDS = new Set([
  // 纯填充词 → 整段只有这些才丢
  '嗯', '啊', '哦', '噢', '呃', '哎', '诶',
  '嗯嗯', '啊啊', '呃呃', '好吧', '行', '哦哦', '嗨', '噢噢',
  // 多字口语
  '那个', '这个', '就是', '然后', '还有', '还有就是',
  '对了', '其实', '反正', '可能', '也许', '大概',
  '再说', '再说吧', '不过', '而且', '或者', '好像', '大概是',
  '我想', '我要', '我得', '我需要', '我就', '我就要',
  '应该是', '应该', '估计', '假如', '如果',
])

let seq = 0
const nextId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`

const toKey = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 把段首段尾的语气词/填充语/标点全部剥掉
 *  注意：「可能/也许/大概」保留为内容词——这些是「待定」标记，去掉会丢失语义 */
const LEADING_FILLER =
  '^(?:[\\s,，。!！?？、]*(?:嗯+|啊+|那个|这个|就是|然后|还有|对了|反正|其实|再说|不过|哦|噢|呃|哎|我想|我要|我得|我需要|我就要|好像|应该是))*[\\s,，。!！?？、]*'

const stripFiller = (s: string): string => {
  let prev = ''
  let cur = s.trim()
  while (prev !== cur) {
    prev = cur
    cur = stripTrailingFiller(cur)
    cur = cur
      .replace(new RegExp(LEADING_FILLER, ''), '')
      .replace(/^[\s,，.。!！?？、]+/, '')
      .trim()
  }
  return cur
}

/** 段尾如果是"那个""嗯"这种填充语，剥掉（保留「妈呀」「糟糕」——这些是真感叹词） */
const stripTrailingFiller = (s: string): string =>
  s.replace(
    /(嗯+|啊+|那个|这个|就是|然后|还有|可能|也许|大概|对了|反正|其实|再说|不过|哦|噢|呃|哎)\s*[，,。.！!？?;；]*\s*$/g,
    '',
  ).trim()

/** 日期词被剥掉后会留下零碎标点和空档，收拾一下 */
const tidy = (s: string): string =>
  s
    .replace(/^[:：,，、.\s]+/, '')
    .replace(/([:：,，、])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** 判断整段是不是「纯填充语」 */
const isAllFiller = (s: string): boolean => {
  const tokens = s
    .replace(/[。！？!?；;，,、：:\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((t) => FILLER_WORDS.has(t))
}

/**
 * 把一整段话（语音识别结果或长文本）拆成简洁的任务/日程草稿。
 * 纯本地规则，不调用任何 AI 接口。
 *
 * 关键改进：
 *  1) 过滤掉纯填充语（"嗯"、"那个"、"还有"、"然后..."）；
 *  2) 剔除行尾/句首的语气词；
 *  3) 拆 segment 时同时按「句号/逗号/顿号/中点」+「中点符号 + 长空格」来分隔；
 *  4) 限制最短（≥ 2 字）和最长（≤ 80）字符，过短的碎片直接丢弃。
 */
export function organize(input: string, base = new Date()): Draft[] {
  // 1. 把整段按句末 + 中文并列 + 冒号 + 长空隙一起拆
  const raw = input
    .split(/[。！？!?；;\n\r]+/)
    .flatMap((s) => s.split(/[A-Za-z]/.test(s) ? /[，,、]|\s{2,}/g : /[，,、\s]+/g))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // 2. 进一步处理：去掉行尾的填充语；判断"整段纯填充"则丢弃
  const segments: string[] = []
  for (const s of raw) {
    const trimmed = stripFiller(s)
    if (!trimmed) continue
    if (isAllFiller(trimmed)) continue
    if (trimmed.length < 2) continue
    if (trimmed.length > 100) {
      // 超长折断
      for (const part of trimmed.split(/[A-Za-z]/.test(trimmed) ? /[，,、]|\s{2,}/ : /[，,、\s]+/)) {
        const pp = stripFiller(part)
        if (pp.length >= 2 && pp.length <= 100 && !isAllFiller(pp)) {
          segments.push(pp)
        }
      }
      continue
    }
    segments.push(trimmed)
  }

  const out: Draft[] = []
  // 连续列举同一天的几件事时，没写日期的继承上一句的日期
  let lastDate: string | null = null

  for (const seg of segments) {
    const p = parseNaturalDate(seg, base)
    const body = stripFiller(tidy(p.rest || seg))
    if (!body || isAllFiller(body) || body.length < 2) continue

    const carry = !HAS_DATE_WORD.test(seg) && !p.dateKey ? lastDate : null
    const dateKey = p.dateKey ?? carry
    if (p.dateKey) lastDate = p.dateKey

    const kind: EntryKind = p.time || EVENT_RE.test(body) ? 'event' : 'task'

    out.push({
      id: nextId(),
      kind,
      text: body,
      dateKey: kind === 'event' && !dateKey ? toKey(base) : dateKey,
      time: p.time,
      endTime: p.endTime,
      tentative: kind === 'event' && TENTATIVE_RE.test(seg),
    })
  }

  return out
}

export const KIND_LABEL: Record<EntryKind, string> = {
  task: '任务',
  event: '日程',
}
