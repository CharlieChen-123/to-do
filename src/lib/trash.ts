import type { Entry } from '../types'
import { db, purgeEntry } from './db'
import { isTagRow } from './tags'

/**
 * 回收站保留期
 * ============================================================
 * 「最近删除」里的条目保留 30 天，过期自动彻底清除。设置面板与回收站
 * 的文案一直这么写着，但在此之前**并没有真的执行** —— 删了的东西会一直躺着。
 * 这里把承诺兑现。
 *
 * 三个关键设计决定：
 *
 * 1) 计时起点用 `deletedAt`，不用 `updatedAt`。
 *    软删之后这一行还可能被改写（典型：删除某个标签时，回收站里用到它的
 *    条目会被改成「其它」并刷新 updatedAt）。用 updatedAt 会让保留期
 *    被无限续命，30 天永远等不到。
 *
 * 2) 清除走 `purgeEntry`（写墓碑），**不是真删行**。
 *    同步是全量 diff：「远端有、本地没有」就会重新拉回来。真删行会让
 *    清掉的东西在下次同步时复活。墓碑才能让「过期清除」这个动作跨设备成立。
 *
 * 3) 没有东西可清时**绝不写库**。
 *    autoPurgeTrash 会在每次同步后被调用；只要它每次写一下 entries，
 *    就会触发下一轮去抖同步 → 再 purge → 再同步。所以必须提前 return。
 *
 * 标签哨兵行（id 以 __tag__ 开头）在隐藏标签时会变成 deleted=1，但它们不是
 * 回收站内容 —— 它们是标签定义的同步载体，不能清掉。
 * 清掉的话别的设备一同步就会把标签又当成存在，而且「恢复内置标签」也失效。
 */

/** 保留天数。改这里就能整体调整回收站策略 */
export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS

/**
 * 保留期起点。
 * 老数据（本功能上线前删掉的）没有 deletedAt，退回 updatedAt 估算 ——
 * 会有偏差，但只影响历史遗留的那批，且偏差方向只是"更早被清掉"。
 */
function anchorMs(e: Entry): number {
  const t = e.deletedAt ?? e.updatedAt
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? Date.now() : ms
}

/** 该条目会被自动清除的时刻 */
export function trashExpiresAt(e: Entry): Date {
  return new Date(anchorMs(e) + RETENTION_MS)
}

/** 还剩几天（向上取整，最小 0） */
export function trashDaysLeft(e: Entry): number {
  const left = Math.ceil((anchorMs(e) + RETENTION_MS - Date.now()) / DAY_MS)
  return Math.max(0, left)
}

/** 回收站里已过保留期、该被清掉的行 */
async function expiredTrashIds(): Promise<string[]> {
  const cutoff = Date.now() - RETENTION_MS
  const rows = await db.entries.toArray()
  return rows
    .filter(
      (e) =>
        e.deleted === 1 &&
        !e.purged &&
        !isTagRow(e) &&
        (e.kind === 'task' || e.kind === 'event') &&
        anchorMs(e) <= cutoff,
    )
    .map((e) => e.id)
}

/**
 * 清掉回收站里超过保留期的条目，返回清掉的条数。
 * 幂等：没有过期条目时是纯读操作，可以直接在同步后反复调用。
 */
export async function autoPurgeTrash(): Promise<number> {
  const ids = await expiredTrashIds()
  // 关键：没东西可清就到此为止，不产生任何写入（否则会触发同步循环）
  if (!ids.length) return 0
  await Promise.all(ids.map((id) => purgeEntry(id)))
  return ids.length
}
