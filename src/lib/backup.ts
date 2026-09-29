import { db, type MetaRow, type RecurringDoneRow } from './db'
import type { Entry } from '../types'

/**
 * 本地备份：把整个 jot 数据库导出成一个 JSON 文件（含附件），
 * 或从一个 JSON 文件恢复。所有数据都在浏览器 IndexedDB 里，
 * 没有云同步时，这是防止数据丢失的唯一手段。
 */

interface BackupFileRow {
  id: string
  entryId: string | null
  name: string
  mime: string
  size: number
  /** 附件二进制以 base64 data URL 内嵌进 JSON，导入时再还原成 Blob */
  dataUrl: string
}

export interface JotBackup {
  app: 'jot'
  version: 1
  exportedAt: string
  entries: Entry[]
  recurringDone: RecurringDoneRow[]
  meta: MetaRow[]
  files: BackupFileRow[]
}

export interface ImportResult {
  entries: number
  recurringDone: number
  meta: number
  files: number
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob())
}

/** 收集当前数据库全部内容，组装成可序列化的备份对象 */
export async function buildBackup(): Promise<JotBackup> {
  const [entries, recurringDone, meta, files] = await Promise.all([
    db.entries.toArray(),
    db.recurringDone.toArray(),
    db.meta.toArray(),
    db.files.toArray(),
  ])

  const fileRows: BackupFileRow[] = await Promise.all(
    files.map(async (f) => ({
      id: f.id,
      entryId: f.entryId,
      name: f.name,
      mime: f.mime,
      size: f.size,
      dataUrl: await blobToDataUrl(f.blob),
    })),
  )

  return {
    app: 'jot',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    recurringDone,
    meta,
    files: fileRows,
  }
}

/** 导出并触发浏览器下载 */
export async function exportBackup(filename?: string): Promise<void> {
  const data = await buildBackup()
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `jot-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 从备份文件恢复：按 id 合并，后写覆盖先写（last-write-wins）。
 * 不会删除本地已有的、备份里没有的记录，也不会用旧版本覆盖更新的本地记录。
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text()
  const data = JSON.parse(text) as Partial<JotBackup>

  if (data.app !== 'jot') {
    throw new Error('不是 jot 的备份文件')
  }

  // ---- entries：合并去重，更新时间新的覆盖旧的 ----
  const incoming = (data.entries ?? []) as Entry[]
  let entriesMerged = 0
  if (incoming.length) {
    const existing = await db.entries.toArray()
    const map = new Map(existing.map((e) => [e.id, e]))
    const merged: Entry[] = []
    for (const e of incoming) {
      const cur = map.get(e.id)
      if (!cur || e.updatedAt > cur.updatedAt) {
        merged.push(e)
        entriesMerged++
      } else {
        merged.push(cur)
      }
    }
    await db.entries.bulkPut(merged)
  }

  // ---- recurringDone / meta：直接 bulkPut（相同主键覆盖） ----
  let recurringDoneN = 0
  const rd = (data.recurringDone ?? []) as RecurringDoneRow[]
  if (rd.length) {
    await db.recurringDone.bulkPut(rd)
    recurringDoneN = rd.length
  }

  let metaN = 0
  const meta = (data.meta ?? []) as MetaRow[]
  if (meta.length) {
    await db.meta.bulkPut(meta)
    metaN = meta.length
  }

  // ---- files：base64 → Blob 还原 ----
  let filesN = 0
  const files = data.files ?? []
  if (files.length) {
    const rows = await Promise.all(
      files.map(async (f) => ({
        id: f.id,
        entryId: f.entryId,
        name: f.name,
        mime: f.mime,
        size: f.size,
        blob: await dataUrlToBlob(f.dataUrl),
        createdAt: new Date().toISOString(),
      })),
    )
    await db.files.bulkPut(rows)
    filesN = rows.length
  }

  return { entries: entriesMerged, recurringDone: recurringDoneN, meta: metaN, files: filesN }
}
