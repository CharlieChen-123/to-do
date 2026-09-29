import { db, newId, type FileRow } from './db'

const nowISO = () => new Date().toISOString()

/** 把文件原样存进 IndexedDB（方案 1：Blob 入 Dexie，纯本地、离线可用） */
export async function saveFile(file: File, entryId: string | null): Promise<string> {
  const id = newId()
  await db.files.put({
    id,
    entryId,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: nowISO(),
  })
  return id
}

export async function getFile(id: string): Promise<FileRow | undefined> {
  return db.files.get(id)
}

/** 点击正文里的 📎 时：图片在新标签打开，其余触发下载 */
export async function openFile(id: string): Promise<void> {
  const f = await getFile(id)
  if (!f) return
  const url = URL.createObjectURL(f.blob)
  try {
    if (f.mime.startsWith('image/')) {
      window.open(url, '_blank', 'noopener')
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  } finally {
    // 60 秒后回收 object URL
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
