import { db, putEntry } from './db'
import type { Entry } from '../types'
import {
  BUILTIN_TAGS,
  FALLBACK_TAG_ID,
  TAG_PALETTE,
  TAG_ROW_PREFIX,
  buildTagRow,
  findTag,
  isTagRow,
  mergeTags,
  newTagId,
  normalizeHexColor,
  tagIdFromRow,
  type TagDef,
} from './tags'

/**
 * 标签的读写动作层
 * ============================================================
 * 标签定义以「哨兵行」存在 entries 表里（见 lib/tags.ts 顶部说明），
 * 所以这里所有写操作都是往 db.entries 里写一行，走 putEntry 刷新 updatedAt，
 * 下次同步自然带上云。
 */

/** 读出所有标签哨兵行 */
async function tagRows(): Promise<Entry[]> {
  return db.entries.filter((e) => e.id.startsWith(TAG_ROW_PREFIX)).toArray()
}

/** 当前完整标签表 */
export async function listTags(): Promise<TagDef[]> {
  return mergeTags(await tagRows())
}

/** 某个标签被多少条内容用着（不含哨兵行 / 已彻底删除的行）*/
export async function countTagUsage(id: string): Promise<number> {
  const rows = await db.entries.toArray()
  return rows.filter(
    (e) => !isTagRow(e) && !e.purged && e.category === id,
  ).length
}

/** 每个标签的使用次数，一次性算好给设置页用（避免 N 次全表扫描） */
export async function countAllTagUsage(): Promise<Record<string, number>> {
  const rows = await db.entries.toArray()
  const out: Record<string, number> = {}
  for (const e of rows) {
    if (isTagRow(e) || e.purged || !e.category) continue
    out[e.category] = (out[e.category] ?? 0) + 1
  }
  return out
}

export interface CreateTagResult {
  ok: boolean
  tag?: TagDef
  error?: string
}

/**
 * 新建标签。名字去空白、去重（同名直接返回已有标签，避免用户困惑）。
 * 颜色可以是预设色、扩展色板色，或用户用取色器/手输 hex 定的任意色 ——
 * 一律先 normalizeHexColor 归一（3 位简写展开成 6 位），非法值退回预设色，
 * 保证库里只有格式统一的合法色值。
 */
export async function createTag(label: string, color: string): Promise<CreateTagResult> {
  const name = label.trim()
  if (!name) return { ok: false, error: '标签名不能为空' }
  if (name.length > 12) return { ok: false, error: '标签名建议不超过 12 个字' }

  const existing = await listTags()
  const dup = existing.find((t) => t.label === name)
  if (dup) return { ok: true, tag: dup }

  const id = newTagId(existing)
  const order = existing.reduce((m, t) => Math.max(m, t.order), 0) + 1
  const safeColor = normalizeHexColor(color) ?? TAG_PALETTE[0]
  const tag: TagDef = { id, label: name, color: safeColor, order }

  await putEntry(buildTagRow(tag))
  return { ok: true, tag }
}

/** 改名 / 改色 / 调整顺序。内置标签会写一条覆盖行（不破坏内置定义） */
export async function updateTag(
  id: string,
  patch: Partial<Pick<TagDef, 'label' | 'color' | 'order'>>,
): Promise<void> {
  // 以数据库现读的标签表为准（注册表是渲染加速用的缓存，可能还没加载）
  const all = await listTags()
  const current = all.find((t) => t.id === id) ?? findTag(id)
  if (!current) return
  // 颜色非法（比如手输 hex 还没输完就失焦）就当作没改色，不要把脏值写进去
  const nextColor =
    patch.color !== undefined ? normalizeHexColor(patch.color) : undefined
  const next: TagDef = {
    ...current,
    ...(patch.label !== undefined ? { label: patch.label.trim() || current.label } : {}),
    ...(nextColor ? { color: nextColor } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
  }
  await putEntry(buildTagRow(next))
}

export interface DeleteTagResult {
  ok: boolean
  reassigned: number
  error?: string
}

/**
 * 删除标签。
 *  - 「其它」是兜底标签，不许删（AI 分类失败全靠它）。
 *  - 用该标签的条目会被改回「其它」，所以不会出现「指向不存在标签」的脏数据。
 *  - 写入的哨兵行 deleted=1（软删），这样删除动作能同步到手机端。
 */
export async function deleteTag(id: string): Promise<DeleteTagResult> {
  if (id === FALLBACK_TAG_ID) {
    return { ok: false, reassigned: 0, error: '「其它」是兜底标签，不能删除' }
  }

  // 1) 把用到该标签的条目改成兜底标签（含回收站里的，保证恢复后也一致）
  const rows = await db.entries.toArray()
  const affected = rows.filter((e) => !isTagRow(e) && e.category === id)
  const now = new Date().toISOString()
  await Promise.all(
    affected.map((e) =>
      db.entries.update(e.id, {
        category: FALLBACK_TAG_ID,
        updatedAt: now,
      }),
    ),
  )

  // 2) 隐藏该标签（内置标签写覆盖行；自建标签本来就是一行）。
  //    这里从数据库现读标签表，而不是信模块级注册表 —— 万一注册表还没加载完，
  //    用兜底值写行会把用户原本的标签名/颜色冲掉。
  const all = await listTags()
  const def: TagDef = all.find((t) => t.id === id) ?? findTag(id) ?? {
    id,
    label: id,
    color: '#78716c',
    order: 999,
  }
  await putEntry(buildTagRow(def, 1))

  return { ok: true, reassigned: affected.length }
}

/**
 * 恢复被删掉的内置标签（自建标签删了就是删了，不进这里——
 * 它们的 id 只活在那一行里，恢复不出来）。
 */
export async function restoreBuiltinTags(): Promise<number> {
  const rows = await tagRows()
  const builtinIds = new Set(BUILTIN_TAGS.map((t) => t.id))
  const hiddenBuiltins = rows.filter(
    (r) => r.deleted === 1 && builtinIds.has(tagIdFromRow(r)),
  )
  const now = new Date().toISOString()
  await Promise.all(
    hiddenBuiltins.map((r) =>
      db.entries.update(r.id, { deleted: 0, updatedAt: now }),
    ),
  )
  return hiddenBuiltins.length
}
