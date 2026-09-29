import type { Entry } from '../types'

/**
 * 附属元数据的云端载体（复用 entries.color 列）
 * ============================================================
 * 为什么复用 color 列：
 *   - 远端 entries 表没有 recurring / recurring_until / purged / deleted_at
 *     这些列，而我们手上只有 anon key，没法在 Supabase 上跑 DDL 加列；
 *   - color 列在「颜色改由标签推导」之后就废弃了 —— 本地恒写 null，也没有
 *     任何 UI 读它（全项目只有同步层碰这一列）。于是把附属信息编码成字符串
 *     存进这一列，无需改远端表结构就能让手机端也拿到。
 *
 * 目前三种载荷：
 *   "rec:{json}"  多日重复配置 + 已完成日期 + 删除时刻（见 RecPayload）
 *   "del:{json}"  只带「软删时刻」，给非重复条目用（回收站 30 天保留期起点）
 *   "purged:1"    「彻底删除」墓碑（否则本地删了会被云端重新拉回来）
 *   null          普通条目
 *
 * 前后兼容（两头都要安全）：
 *   - 向老：老数据里的真实颜色值（如 "#DC2626"）不带前缀，解码时被安全忽略。
 *   - 向前：老版本客户端读到不认识的 "del:" 前缀会解码成空对象，只是不知道删除
 *     时刻而已 —— deleted 标志本身走独立的列，所以既删不掉也复活不了，
 *     最坏结果是它那边按自己的 updatedAt 兜底估算保留期。
 *
 * 独立成模块的原因：这是一段纯序列化逻辑，不该和 supabase 客户端绑在一起
 * （sync.ts 一 import 就会拉起 supabase 依赖，node 下没法单测）。放在这里，
 * tests/meta.test.ts 可以直接引它跑断言。
 */

const REC_PREFIX = 'rec:'
const DEL_PREFIX = 'del:'
const PURGED_MARK = 'purged:1'

interface RecPayload {
  /** recurring（目前只有 'daily'） */
  r: 'daily'
  /** recurringUntil，YYYY-MM-DD */
  u?: string
  /** recurringShowInWeekMonth === false 时记 0（默认 true 不写） */
  wm?: 0
  /** 已完成日期集合（recurringDone 的 dateKey） */
  d?: string[]
  /** deletedAt：软删时刻（重复条目被丢进回收站时才有） */
  da?: string
}

interface DelPayload {
  /** deletedAt，ISO 字符串 */
  t: string
}

export function encodeMeta(e: Entry, doneDates: string[]): string | null {
  if (e.purged) return PURGED_MARK
  if (e.recurring === 'daily') {
    const p: RecPayload = { r: 'daily' }
    if (e.recurringUntil) p.u = e.recurringUntil
    if (e.recurringShowInWeekMonth === false) p.wm = 0
    if (doneDates.length) p.d = [...doneDates].sort()
    if (e.deleted === 1 && e.deletedAt) p.da = e.deletedAt
    return REC_PREFIX + JSON.stringify(p)
  }
  // 非重复条目：只有「软删且带删除时刻」才需要占用这一列，
  // 否则保持 null（绝大多数正常条目都是这条路径，不写任何冗余数据）。
  if (e.deleted === 1 && e.deletedAt) {
    const p: DelPayload = { t: e.deletedAt }
    return DEL_PREFIX + JSON.stringify(p)
  }
  return null
}

export interface DecodedMeta {
  recurring?: 'daily'
  recurringUntil?: string | null
  recurringShowInWeekMonth?: boolean
  doneDates: string[]
  purged: boolean
  /** 软删时刻。老数据可能没有（那时回收站按 updatedAt 兜底估算） */
  deletedAt?: string
}

export function decodeMeta(raw: string | null | undefined): DecodedMeta {
  const empty: DecodedMeta = { doneDates: [], purged: false }
  if (!raw) return empty
  if (raw === PURGED_MARK) return { doneDates: [], purged: true }
  if (raw.startsWith(DEL_PREFIX)) {
    try {
      const p = JSON.parse(raw.slice(DEL_PREFIX.length)) as Partial<DelPayload>
      return {
        doneDates: [],
        purged: false,
        deletedAt: typeof p.t === 'string' && p.t ? p.t : undefined,
      }
    } catch {
      return empty
    }
  }
  if (!raw.startsWith(REC_PREFIX)) return empty
  try {
    const p = JSON.parse(raw.slice(REC_PREFIX.length)) as RecPayload
    if (!p || p.r !== 'daily') return empty
    return {
      recurring: 'daily',
      recurringUntil: p.u ?? null,
      recurringShowInWeekMonth: p.wm === 0 ? false : undefined,
      doneDates: Array.isArray(p.d) ? p.d.filter((x) => typeof x === 'string') : [],
      purged: false,
      deletedAt: typeof p.da === 'string' && p.da ? p.da : undefined,
    }
  } catch {
    return empty
  }
}
