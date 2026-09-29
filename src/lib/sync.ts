import type { Entry } from '../types'
import { canonicalTagId } from './tags'
import { db, getMeta, setMeta } from './db'
import { supabase, TABLE } from './supabase'
import { currentUserId } from './auth'

interface Row {
  /** 归属用户：RLS 策略按 auth.uid() = user_id 隔离，每次推送都要带上 */
  user_id: string
  id: string
  kind: string
  content: string
  plain_text: string
  done: boolean
  starred: boolean
  done_at: string | null
  start_at: string | null
  end_at: string | null
  all_day: boolean
  tentative: boolean
  date_key: string | null
  color: string | null
  /** 标签（自动分类），云端持久化，跨设备同步 */
  category: string | null
  created_at: string
  updated_at: string
  sort_order: number
  deleted: number
}

// 附属元数据（多日重复 / 墓碑 / 软删时刻）的编解码器独立成 lib/meta.ts，
// 它是纯序列化逻辑，不该跟 supabase 客户端绑在一起。这里只用它的结果。
import { decodeMeta, encodeMeta } from './meta'

const toRow = (e: Entry, uid: string, doneDates: string[]): Row => ({
  user_id: uid,
  id: e.id,
  kind: e.kind,
  content: e.content,
  plain_text: e.plainText,
  done: e.done,
  starred: e.starred,
  done_at: e.doneAt ?? null,
  start_at: e.startAt ?? null,
  end_at: e.endAt ?? null,
  all_day: e.allDay,
  tentative: e.tentative,
  date_key: e.dateKey,
  // color 列不再承载「颜色」，改作附属元数据的载体（见 encodeMeta 说明）
  color: encodeMeta(e, doneDates),
  // 标签 id 原样透传 —— 不做 normalizeCategory：
  // 自定义标签的 id 只存在于本地标签表里，如果这里"认不出就折成其它"，
  // 会把用户自建标签洗掉。历史脏值（日常/财务）由 canonicalTagId 归一。
  category: canonicalTagId(e.category),
  created_at: e.createdAt,
  updated_at: e.updatedAt,
  sort_order: e.order,
  deleted: e.deleted,
})

const fromRow = (r: Row): Entry => {
  const meta = decodeMeta(r.color)
  return {
    id: r.id,
    kind: r.kind as Entry['kind'],
    content: r.content ?? '',
    plainText: r.plain_text ?? '',
    done: !!r.done,
    starred: !!r.starred,
    doneAt: r.done_at ?? undefined,
    startAt: r.start_at ?? undefined,
    endAt: r.end_at ?? undefined,
    allDay: !!r.all_day,
    tentative: !!r.tentative,
    dateKey: r.date_key ?? null,
    // 本地不再保留 color（已被附属元数据占用），信息解码到下面的字段
    color: null,
    category: canonicalTagId(r.category),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    order: Number(r.sort_order ?? 0),
    deleted: (r.deleted === 1 ? 1 : 0) as 0 | 1,
    deletedAt: meta.deletedAt,
    purged: meta.purged || undefined,
    recurring: meta.recurring,
    recurringUntil: meta.recurringUntil,
    recurringShowInWeekMonth: meta.recurringShowInWeekMonth,
  }
}

export interface SyncResult {
  pulled: number
  pushed: number
}

const PAGE_SIZE = 500

/** 分页拉取；Supabase 默认会限制单次返回行数，直接 select('*') 可能漏数据。 */
async function fetchRemoteRows(uid: string): Promise<Row[]> {
  if (!supabase) return []
  const rows: Row[] = []
  let offset = 0
  for (;;) {
    const { data, error, count } = await supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', uid)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`拉取失败：${error.message}`)
    const page = (data ?? []) as Row[]
    rows.push(...page)
    offset += page.length
    if (page.length === 0 || (count !== null && offset >= count)) return rows
  }
}

/**
 * 全量双向 diff 同步：以 updated_at 为准，后写覆盖先写（last-write-wins）。
 * 个人单用户场景下数据量很小（数百条），全量比增量更不容易出洞。
 *
 * 顺带被一起带走的附属数据：
 *   - 多日重复（recurring / recurringUntil / 已完成日期）编码进 color 列，
 *     拉取时把远端携带的完成日期写回本地 recurringDone 表（见 encodeMeta）；
 *   - 「彻底删除」墓碑（purged）；
 *   - 自定义标签的定义（以 __tag__ 开头的哨兵行，就是普通的 entries 行）。
 */
export async function syncOnce(): Promise<SyncResult | null> {
  if (!supabase) return null

  // 未登录：不碰云端，静默退回纯本地（收紧 RLS 后没 uid 读写都会 401/空结果）
  const uid = currentUserId()
  if (!uid) return null

  // IndexedDB 在同一浏览器配置里跨登录账号共用。阻止把前一个账号的本地
  // 条目推给新账号；换账号前须先导出备份并清理这个站点的本地数据。
  const syncOwnerId = await getMeta('syncOwnerId')
  if (syncOwnerId && syncOwnerId !== uid) {
    throw new Error('本机数据属于另一个账号。请先导出备份并清理此站点数据，再登录新账号。')
  }

  const remote = await fetchRemoteRows(uid)

  const [local, localRecurringDone] = await Promise.all([
    db.entries.toArray(),
    db.recurringDone.toArray(),
  ])

  // taskId -> 已完成日期（随条目一起编码进 color，保证手机端也能拿到勾选状态）
  const doneByTask = new Map<string, string[]>()
  for (const r of localRecurringDone) {
    const arr = doneByTask.get(r.taskId)
    if (arr) arr.push(r.dateKey)
    else doneByTask.set(r.taskId, [r.dateKey])
  }

  const remoteRows = remote
  const remoteRaw = new Map(remoteRows.map((r) => [r.id, r]))
  const remoteMap = new Map(remoteRows.map((r) => [r.id, fromRow(r)]))
  const localMap = new Map(local.map((e) => [e.id, e]))

  const toLocal: Entry[] = []
  const toRemote: Row[] = []
  const queued = new Set<string>()

  for (const [id, r] of remoteMap) {
    const l = localMap.get(id)
    if (!l || l.updatedAt < r.updatedAt) toLocal.push(r)
    else if (l.updatedAt > r.updatedAt) {
      toRemote.push(toRow(l, uid, doneByTask.get(id) ?? []))
      queued.add(id)
    }
  }
  for (const [id, l] of localMap) {
    if (queued.has(id)) continue
    if (!remoteMap.has(id)) {
      toRemote.push(toRow(l, uid, doneByTask.get(id) ?? []))
      continue
    }
    // 迁移：本地是「多日重复」但远端那一行还没带重复信息（老数据，且时间戳常常相等，
    // 上面的 diff 判定不会触发推送）→ 强制推一次，把重复配置/完成状态送上云。
    if (l.recurring === 'daily') {
      const decoded = decodeMeta(remoteRaw.get(id)?.color)
      if (decoded.recurring !== 'daily') {
        toRemote.push(toRow(l, uid, doneByTask.get(id) ?? []))
        queued.add(id)
      }
    }
    // 迁移：本地已「彻底删除」（墓碑）但远端还没有标记 → 强制推一次，
    // 否则墓碑推不上去，下次同步又会把删掉的内容拉回来。
    if (l.purged) {
      const decoded = decodeMeta(remoteRaw.get(id)?.color)
      if (!decoded.purged) {
        toRemote.push(toRow(l, uid, doneByTask.get(id) ?? []))
        queued.add(id)
      }
    }
  }

  if (toLocal.length) {
    await db.entries.bulkPut(toLocal)
  }

  // 拉取下来的多日重复任务：把远端携带的完成日期写回本地 recurringDone（远端为准）
  for (const e of toLocal) {
    if (e.recurring !== 'daily') continue
    const decoded = decodeMeta(remoteRaw.get(e.id)?.color)
    await db.recurringDone.where('taskId').equals(e.id).delete()
    if (decoded.doneDates.length) {
      const now = new Date().toISOString()
      await db.recurringDone.bulkPut(
        decoded.doneDates.map((dateKey) => ({
          id: `${e.id}|${dateKey}`,
          taskId: e.id,
          dateKey,
          doneAt: now,
        })),
      )
    }
  }

  if (toRemote.length) {
    const { error: e2 } = await supabase.from(TABLE).upsert(toRemote)
    if (e2) throw new Error(`推送失败：${e2.message}`)
  }

  await setMeta('lastSyncedAt', new Date().toISOString())
  await setMeta('syncOwnerId', uid)
  return { pulled: toLocal.length, pushed: toRemote.length }
}
