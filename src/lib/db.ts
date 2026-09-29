import Dexie, { type Table } from 'dexie'
import type { Entry } from '../types'

export interface MetaRow {
  key: string
  value: string
}

export interface RecurringDoneRow {
  /** 复合主键 `${taskId}|${dateKey}` */
  id: string
  taskId: string
  dateKey: string
  doneAt: string
}

export interface FileRow {
  id: string
  entryId: string | null
  name: string
  mime: string
  size: number
  blob: Blob
  createdAt: string
}

export class JotDB extends Dexie {
  entries!: Table<Entry, string>
  meta!: Table<MetaRow, string>
  recurringDone!: Table<RecurringDoneRow, string>
  files!: Table<FileRow, string>

  constructor() {
    super('jot')
    this.version(1).stores({
      entries: 'id, kind, dateKey, done, updatedAt, deleted, order',
      meta: 'key',
    })
    this.version(2).stores({
      entries: 'id, kind, dateKey, done, updatedAt, deleted, order',
      meta: 'key',
      recurringDone: 'id, taskId, dateKey',
    })
    this.version(3).stores({
      entries: 'id, kind, dateKey, done, updatedAt, deleted, order',
      meta: 'key',
      recurringDone: 'id, taskId, dateKey',
      files: 'id, entryId, name',
    })
  }
}

export const db = new JotDB()

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const nowISO = () => new Date().toISOString()

export function blankEntry(overrides: Partial<Entry> = {}): Entry {
  const now = nowISO()
  return {
    id: newId(),
    kind: 'task',
    content: '',
    plainText: '',
    done: false,
    starred: false,
    allDay: false,
    tentative: false,
    dateKey: null,
    color: null,
    category: null,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
    deleted: 0,
    ...overrides,
  }
}

export async function putEntry(entry: Entry): Promise<Entry> {
  const next = { ...entry, updatedAt: nowISO() }
  await db.entries.put(next)
  return next
}

export async function patchEntry(id: string, patch: Partial<Entry>): Promise<void> {
  await db.entries.update(id, { ...patch, updatedAt: nowISO() })
}

/**
 * 只刷新 updatedAt。用于「附属数据」改动（如 recurringDone 完成记录）后，让该条目
 * 在下次同步时被判定为「本地更新」，从而把新的完成状态重新编码推上云。
 */
export async function touchEntry(id: string): Promise<void> {
  const cur = await db.entries.get(id)
  if (!cur) return
  await db.entries.update(id, { updatedAt: nowISO() })
}

/**
 * 「软删 / 恢复」的字段补丁。
 *
 * 维持一个不变式：**deletedAt 只在 deleted === 1 时有值**。
 * 回收站的保留期计算完全依赖这个不变式（见 lib/trash.ts）—— 如果恢复了一条
 * 却把 deletedAt 留着，它下次再被删就会带着一个陈旧的删除时间，可能立刻被
 * 当成过期内容清掉（用户刚删就没了）。所以凡是改 deleted 的地方都从这里取补丁，
 * 不要手写 `{ deleted: 1 }`。
 */
export function markDeleted(deleted: 0 | 1, at: string = nowISO()): Partial<Entry> {
  return deleted === 1
    ? { deleted: 1, deletedAt: at, updatedAt: at }
    : { deleted: 0, deletedAt: undefined, updatedAt: at }
}

export async function softDeleteEntry(id: string): Promise<void> {
  const cur = await db.entries.get(id)
  const now = nowISO()
  await db.entries.update(id, {
    deleted: 1,
    // 已经删过就不覆盖：重复软删不该把 30 天保留期重新计时。
    // ?? now 是给「升级前就已删掉、没有 deletedAt」的老数据就地补一个。
    deletedAt: cur?.deleted === 1 ? (cur.deletedAt ?? now) : now,
    updatedAt: now,
  })
}

export async function restoreEntry(id: string): Promise<void> {
  await db.entries.update(id, markDeleted(0))
}

/**
 * 彻底删除（不可恢复）。
 *
 * 为什么不是 db.entries.delete()：
 *   同步是「远端有、本地没有 → 拉回本地」的全量 diff。本地真删掉之后，
 *   下次同步会把它从云端重新拉回来 —— 现象就是「彻底删除的东西又活了」。
 *   所以这里写墓碑：清空内容 + deleted=1 + purged=1，UI 不再展示
 *   （回收站会过滤 purged）。内容真的没了，只留一个空壳让删除状态能同步。
 */
export async function purgeEntry(id: string): Promise<void> {
  const cur = await db.entries.get(id)
  if (!cur) return
  await db.entries.update(id, {
    deleted: 1,
    purged: true,
    // 墓碑不需要保留删除时间（已不在回收站里展示），清掉保持行干净
    deletedAt: undefined,
    content: '',
    plainText: '',
    starred: false,
    category: null,
    dateKey: null,
    startAt: undefined,
    endAt: undefined,
    recurring: undefined,
    recurringUntil: null,
    updatedAt: nowISO(),
  })
  // 多日重复的完成记录也一并清掉，不留孤儿行
  await db.recurringDone.where('taskId').equals(id).delete()
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key)
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** 重复任务某一天的完成记录 */
export async function putRecurringDone(row: RecurringDoneRow): Promise<void> {
  await db.recurringDone.put(row)
}

export async function deleteRecurringDone(taskId: string, dateKey: string): Promise<void> {
  await db.recurringDone.delete(`${taskId}|${dateKey}`)
}