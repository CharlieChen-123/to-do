import type { CategoryId, EntryKind } from '../types'
import type { Draft } from './organize'
import { categoryRule, normalizeCategory } from './categories'
import { BUILTIN_HINT, getTagRegistry } from './tags'

/** 阿里云百炼（DashScope）OpenAI 兼容端点 */
const ENDPOINT =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/**
 * 提示词要点：
 *  1) 疯狂删口水话（语音识别结果里 "嗯/那个/就是/然后" 能占一半）；
 *  2) 明确「一天 = 一条」，不要为凑数拆太碎 —— 用户明确提过这点；
 *  3) 日期/时间由模型解析（今天/明天/后天/周X/下周X 都换算成绝对日期），
 *     因为中文口语的日期表达规则法很难覆盖全；
 *  4) 强约束只输出 JSON，省去解析 markdown 代码块的麻烦，也省 token。
 */
/**
 * 系统提示用函数而不是常量：标签表是用户可编辑的（能自建/改名），
 * 每次调用都要按「当前标签」重新拼 categoryRule()，模型才能用上新标签。
 */
const systemPrompt = (): string => `你是「To do」这个个人效率应用的任务提取助手。用户可能用中文或英文输入口语化内容，里面会有语气词、重复、自我纠正和跑题。你要把它整理成一份精简、可执行的清单，并保留用户原本使用的语言。

输出：严格 JSON，不要输出任何解释、markdown 代码块或额外文字。格式：
{"items":[{"kind":"task|event","text":"...","dateKey":"YYYY-MM-DD|null","time":"HH:mm|null","tentative":true|false,"recurring":false|true,"recurringUntil":"YYYY-MM-DD|null"}]}

规则：
1. 删除所有口水话：嗯 啊 那个 这个 就是 然后 还有就是 就是说是 我的意思是 对对对 之类的填充词，以及重复、自我纠正、跑题的部分。只保留真正要做的事。
2. 一个动作 = 一条。不要为凑数把一件事拆成多条，也不要把多件事揉成一条。一段话通常产出 2-6 条。
3. kind 判定：
   - event（日程）：有具体时间点（"下午三点"），或本身是会议/上课/考试/聚餐/面试/看医生/比赛这类"要在某个时段发生"的事。
   - task（任务）：待办事项，没有固定发生时间。
4. 日期解析：以给定的"今天"为基准，把 今天/明天/后天/大后天/周X/下周X/下下周X/X月X号/X天后，以及 today/tomorrow/next Monday/in 3 days 等英文表达，全部换算成 YYYY-MM-DD。没提到日期就 null。
5. 时间：解析成 24 小时制 HH:mm。没提到具体时间就 null。
6. tentative：只有用户明确表示不确定（可能/也许/大概/说不定/待定/看看情况）时才 true，否则 false。
7. text：精简后的正文。去掉日期词和时间词（已单独存到 dateKey/time），保留核心动词和宾语。保留输入语言，英文输入输出英文，中文输入输出中文，末尾不加标点。
  8. 跨多天的任务：当用户说「X之前完成」「这几天都要做」「每天…直到…」这类「同一件事跨多天」时，recurring=true、recurringUntil 设为最后一天（YYYY-MM-DD），dateKey 设为开始那天；否则 recurring=false、recurringUntil=null。
${categoryRule()}`

let seq = 0
const nextId = () => `ai${Date.now().toString(36)}${(seq++).toString(36)}`

const isDateKey = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

const parseHM = (
  s: unknown,
): { hour: number; minute: number } | null => {
  if (typeof s !== 'string') return null
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return { hour: h, minute: min }
}

export interface AiResult {
  drafts: Draft[]
  /** 本次消耗的 token（用于设置面板展示） */
  usage?: { prompt: number; completion: number; total: number }
}

/**
 * 调用大模型把一段口语化文本整理成任务/日程草稿。
 * 失败（网络 / key 失效 / 额度耗尽）会 throw，调用方负责退回本地规则。
 */
export async function organizeWithAI(
  text: string,
  baseDateKey: string,
  apiKey: string,
  model: string,
): Promise<AiResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `${systemPrompt()}\n\n今天是 ${baseDateKey}。` },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      (json as { message?: string })?.message ??
      (json as { error?: { message?: string } })?.error?.message ??
      `HTTP ${res.status}`
    throw new Error(msg)
  }

  const content: string =
    (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? ''

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('模型返回的不是合法 JSON')
  }

  const items = (parsed as { items?: unknown })?.items
  if (!Array.isArray(items)) throw new Error('模型返回缺少 items 数组')

  const drafts: Draft[] = []
  for (const raw of items) {
    const it = raw as Record<string, unknown>
    const body = typeof it.text === 'string' ? it.text.trim() : ''
    if (!body) continue
    const kind: EntryKind = it.kind === 'event' ? 'event' : 'task'
    const d: Draft = {
      id: nextId(),
      kind,
      text: body,
      dateKey: isDateKey(it.dateKey) ? it.dateKey : null,
      time: parseHM(it.time),
      endTime: null,
      tentative: it.tentative === true,
      category: normalizeCategory(it.category),
    }
    // 跨多天任务：recurring + recurringUntil
    if (it.recurring === true && isDateKey(it.recurringUntil)) {
      d.recurring = 'daily'
      d.recurringUntil = it.recurringUntil as string
      // dateKey 若没设，沿用 recurringUntil 的起始日（这里就是 until，由模型解析）
    }
    drafts.push(d)
  }

  const u = (json as { usage?: Record<string, number> })?.usage
  const usage = u
    ? {
        prompt: u.prompt_tokens ?? 0,
        completion: u.completion_tokens ?? 0,
        total: u.total_tokens ?? 0,
      }
    : undefined

  return { drafts, usage }
}

/**
 * 单条分类的系统提示。同样按「当前标签表」动态生成：
 * 用户自建的标签也要能被模型认出来（模型输出标签名，落库前由
 * normalizeCategory 转成 id）。
 */
const classifySystemPrompt = (): string => {
  const list = getTagRegistry()
  const names = list.map((t) => t.label).join('|')
  const lines = list.map(
    (t) => `- ${t.label}：${BUILTIN_HINT[t.id] ?? '用户自定义标签'}`,
  )
  return `你是「To do」的分类器。用户会给你一条待办或日程的纯文本，你要判断它属于哪个标签。
只能输出以下 JSON，不要解释、不要 markdown：
{"category":"${names}"}
判断依据：
${lines.join('\n')}
`
}

/**
 * 单条文本分类（给「快速输入 / 就地添加」用）。
 * 后台异步调用、不阻塞保存；失败直接回退 'other'，由调用方决定要不要落库。
 */
export async function classifyText(
  text: string,
  apiKey: string,
  model: string,
): Promise<CategoryId> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: classifySystemPrompt() },
        { role: 'user', content: text.slice(0, 500) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      (json as { message?: string })?.message ??
      (json as { error?: { message?: string } })?.error?.message ??
      `HTTP ${res.status}`
    throw new Error(msg)
  }
  const content: string =
    (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return 'other'
  }
  return normalizeCategory((parsed as { category?: unknown })?.category)
}
