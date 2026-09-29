import type { CategoryId, Entry, EntryKind } from '../types'
import { classifyText } from './ai'
import { useSettings } from '../store/settings'
import {
  blankEntry,
  db,
  deleteRecurringDone,
  patchEntry,
  putEntry,
  putRecurringDone,
  restoreEntry,
  softDeleteEntry,
  touchEntry,
} from './db'
import { combineDateTime, parseNaturalDate, TODAY } from './date'
import { textToHtml } from './text'
import type { Draft } from './organize'
import {
  pushUndoCreate,
  pushUndoDelete,
  pushUndoPatch,
  pushUndoRestore,
} from './undo'

/**
 * 把 time + dateKey 合成 start/end。
 * 传了 endTime 就用它（「6点到7点半」）；否则结束时间默认往后一小时。
 */
function buildRange(
  dateKey: string | null,
  time: { hour: number; minute: number } | null,
  endTime?: { hour: number; minute: number } | null,
): { startAt?: string; endAt?: string } {
  if (!dateKey || !time) return {}
  return {
    startAt: combineDateTime(dateKey, time),
    endAt: combineDateTime(
      dateKey,
      endTime ?? { hour: Math.min(time.hour + 1, 23), minute: time.minute },
    ),
  }
}

/**
 * 快速输入 → 条目。类型由规则自动判断（除非 forcedKind 指定）：
 *   说「几点」→ 日程；其余 → 任务。
 * defaultDateKey：当前视图的日期，让「在今天写」落到今天。
 */
export async function createFromInput(
  raw: string,
  defaultDateKey?: string,
  forcedKind?: EntryKind,
): Promise<Entry> {
  const parsed = parseNaturalDate(raw)
  const body = parsed.rest || raw.trim()
  if (!body) throw new Error('内容为空')

  const kind: EntryKind =
    forcedKind ?? (parsed.time ? 'event' : 'task')

  // 优先用解析出的日期，否则落到当前视图这天；日程没有日期时默认今天
  const dateKey =
    parsed.dateKey ?? defaultDateKey ?? (kind === 'event' ? TODAY() : null)

  const { startAt, endAt } = buildRange(dateKey, parsed.time, parsed.endTime)

  const entry = blankEntry({
    kind,
    content: textToHtml(body),
    plainText: body,
    dateKey,
    startAt,
    endAt,
    allDay: kind === 'event' && !parsed.time,
  })
  await putEntry(entry)
  pushUndoCreate(entry)
  // 后台异步分类：卡片瞬间保存，类别 1–3 秒后自动补上，不阻塞输入体验。
  // 未开启 AI / 无 key / 调用失败都静默回退，不影响正常使用。
  void autoClassify(entry)
  return entry
}

/**
 * 新卡片保存后异步补一个类别：读设置里的百炼 key，调 classifyText，
 * 成功就把 category 写回（显示色由 category 推导）。失败忽略。
 */
async function autoClassify(entry: Entry): Promise<void> {
  const { aiEnabled, aiApiKey, aiModel } = useSettings.getState()
  if (!aiEnabled || !aiApiKey.trim()) return
  try {
    const cat = await classifyText(entry.plainText, aiApiKey.trim(), aiModel)
    if (cat && cat !== 'other') {
      await patchEntry(entry.id, { category: cat })
    }
  } catch {
    /* 离线 / 额度耗尽 / 网络抖动点：保持未分类，不报错 */
  }
}

/** 语音整理后的草稿 → 批量落库 */
export async function createFromDrafts(
  drafts: Draft[],
  defaultDateKey?: string,
): Promise<number> {
  let n = 0
  for (const d of drafts) {
    const text = d.text.trim()
    if (!text) continue

    const dateKey =
      d.kind === 'event' && d.time
        ? (d.dateKey ?? defaultDateKey ?? TODAY())
        : (d.dateKey ?? defaultDateKey ?? null)
    const { startAt, endAt } = buildRange(dateKey, d.time, d.endTime)

  const entry = blankEntry({
    kind: d.kind,
    content: textToHtml(text),
    plainText: text,
    dateKey,
    startAt,
    endAt,
    tentative: d.tentative,
    // color 字段已废弃，UI 不再提供手动改色；落库恒 null 即可
    color: null,
    category: d.category ?? null,
    allDay: d.kind === 'event' && !d.time,
    // 跨多天任务：「今天到周三」→ recurring=daily + recurringUntil=周三
    recurring: d.recurring,
    recurringUntil: d.recurringUntil,
  })
    await putEntry(entry)
    pushUndoCreate(entry)
    n++
  }
  return n
}

export async function toggleDone(entry: Entry): Promise<void> {
  const nextDone = !entry.done
  await patchEntry(entry.id, {
    done: nextDone,
    doneAt: nextDone ? new Date().toISOString() : undefined,
  })
  // 多日任务语义：划掉开始日这条普通 entry，等于「这一天完成了」，
  // 因此同步写 recurringDone[开始日]；后续天数在 buildDayList 里据此判定
  // 「firstDone 之后的天数不再出现」（完成即终止）。取消则删 row，恢复 active。
  if (entry.recurring === 'daily' && entry.dateKey) {
    if (nextDone) {
      await putRecurringDone({
        id: `${entry.id}|${entry.dateKey}`,
        taskId: entry.id,
        dateKey: entry.dateKey,
        doneAt: new Date().toISOString(),
      })
    } else {
      await deleteRecurringDone(entry.id, entry.dateKey)
    }
  }
  pushUndoPatch(entry, { done: nextDone })
}

export async function updateContent(
  id: string,
  html: string,
  plain: string,
): Promise<void> {
  const before = await db.entries.get(id)
  if (!before) return
  await patchEntry(id, { content: html, plainText: plain })
  pushUndoPatch(before, { content: html, plainText: plain })
}

export async function changeKind(entry: Entry, kind: EntryKind): Promise<void> {
  const patch: Partial<Entry> = { kind }
  if (kind === 'event' && !entry.dateKey) {
    patch.dateKey = TODAY()
    patch.allDay = true
  }
  if (kind !== 'event') {
    patch.tentative = false
    patch.startAt = undefined
    patch.endAt = undefined
  }
  await patchEntry(entry.id, patch)
  pushUndoPatch(entry, patch)
}

/**
 * 手动打标签（= 设置自动分类 category）。传 null 清除标签。
 * 颜色已废弃：标签本身就决定显示色，所以不再单独维护 color。
 */
export async function setCategory(
  entry: Entry,
  cat: CategoryId | null,
): Promise<void> {
  const patch: Partial<Entry> = { category: cat, color: null }
  await patchEntry(entry.id, patch)
  pushUndoPatch(entry, patch)
}

/** 星标：置顶到列表最前 */
export async function toggleStarred(entry: Entry): Promise<void> {
  await patchEntry(entry.id, { starred: !entry.starred })
  pushUndoPatch(entry, { starred: !entry.starred })
}

/** 切换日程的「待定」状态：待定条目以虚线 + 斜纹显示 */
export async function toggleTentative(entry: Entry): Promise<void> {
  await patchEntry(entry.id, { tentative: !entry.tentative })
  pushUndoPatch(entry, { tentative: !entry.tentative })
}

/** 设置日期；可选同时设置开始与结束时间 */
export async function setSchedule(
  entry: Entry,
  dateKey: string | null,
  start?: string,
  end?: string,
): Promise<void> {
  const patch: Partial<Entry> = {
    dateKey,
    startAt: start,
    endAt: end,
    allDay: !start && !end,
  }
  await patchEntry(entry.id, patch)
  pushUndoPatch(entry, patch)
}

/** 软删：标记 deleted=1，不再展示，下次 Ctrl+Z 撤销 */
export async function removeEntry(entry: Entry): Promise<void> {
  await softDeleteEntry(entry.id)
  pushUndoDelete(entry)
}

/** 软恢复：标记 deleted=0（同时清掉 deletedAt，见 db.markDeleted） */
export async function softRestoreEntry(entry: Entry): Promise<void> {
  await restoreEntry(entry.id)
  pushUndoRestore(entry)
}

/* ---------- 批量操作（多选/框选触发的批处理） ----------
 * 策略：每条独立 patchEntry + pushUndoPatch；连续 Ctrl+Z 逐步撤销整批。
 * 这样如果某条同步失败也不会带歪其它条目。
 */

/** 批量软删（多选 + SelectionBar 删除按钮）。跳过已删的，避免重复入栈。 */
export async function batchRemove(entries: Entry[]): Promise<number> {
  let n = 0
  for (const e of entries) {
    if (e.deleted) continue
    await softDeleteEntry(e.id)
    pushUndoDelete(e)
    n++
  }
  return n
}

/** 批量改标签：所有条目改成同一 cat；传 null 清空标签；不可恢复的重复实例会被忽略。 */
export async function batchSetCategory(
  entries: Entry[],
  cat: CategoryId | null,
): Promise<number> {
  let n = 0
  for (const e of entries) {
    // 重复实例（kind=recurring）只是 DayEntryItem 里的虚拟实例，没有真实 Entry
    if (e.kind === ('recurring' as unknown as EntryKind)) continue
    const patch: Partial<Entry> = { category: cat, color: null }
    await patchEntry(e.id, patch)
    pushUndoPatch(e, patch)
    n++
  }
  return n
}

/**
 * 批量「设为多日重复」：把每条 entry 都开 recurring='daily' 并设置 recurringUntil。
 * - 若 entry 已是 daily，只改日期；不是 daily 的同时开 daily。
 * - undo 按"先前的 recurring" + "先前的 recurringUntil" 整体恢复，所以这里
 *   一次性写入 patch（recurring + recurringUntil 两个字段），让 Ctrl+Z 能一笔撤销。
 * - 过期任务的起点不在今天之前的也帮挪到今天，避免从过去刷历史实例。
 */
export async function batchSetRecurringUntil(
  entries: Entry[],
  dateKey: string | null,
): Promise<number> {
  const v = dateKey || null
  const today = TODAY()
  let n = 0
  for (const e of entries) {
    if (e.kind === ('recurring' as unknown as EntryKind)) continue
    const patch: Partial<Entry> = {}
    if (!v) {
      // 传 null = 关闭多日重复；同时清掉截止日
      if (e.recurring === 'daily') patch.recurring = undefined
      if (e.recurringUntil) patch.recurringUntil = null
    } else {
      if (e.recurring !== 'daily') patch.recurring = 'daily'
      patch.recurringUntil = v
      // 起点 < 今天 → 挪到今天；起点是 null 也补今天
      if (!e.dateKey || e.dateKey < today) patch.dateKey = today
    }
    if (Object.keys(patch).length === 0) continue
    await patchEntry(e.id, patch)
    pushUndoPatch(e, patch)
    n++
  }
  return n
}

/* ---------- 每日重复任务 ---------- */

/** 设为每日重复（true）或取消（false）。取消会保留已生成的完成记录。 */
export async function setRecurring(entry: Entry, on: boolean): Promise<void> {
  await patchEntry(entry.id, { recurring: on ? 'daily' : undefined })
  pushUndoPatch(entry, { recurring: on ? 'daily' : undefined })
}

/** 设置「重复到哪天」（YYYY-MM-DD）。传 null 或空串清除截止日。 */
export async function setRecurringUntil(
  entry: Entry,
  dateKey: string | null,
): Promise<void> {
  const until = dateKey || null
  await patchEntry(entry.id, { recurringUntil: until })
  pushUndoPatch(entry, { recurringUntil: until })
}

/** 重复任务是否在周/月视图也显示 */
export async function setRecurringShowInWeekMonth(
  entry: Entry,
  on: boolean,
): Promise<void> {
  await patchEntry(entry.id, { recurringShowInWeekMonth: on })
  pushUndoPatch(entry, { recurringShowInWeekMonth: on })
}

/** 把重复任务在某一天标记为完成（写入 recurringDone 表） */
export async function checkRecurring(taskId: string, dateKey: string): Promise<void> {
  await putRecurringDone({
    id: `${taskId}|${dateKey}`,
    taskId,
    dateKey,
    doneAt: new Date().toISOString(),
  })
  // 完成记录是附属数据，不会自然改变条目的 updatedAt；这里手动 touch，
  // 让下次同步把它重新编码进 color 列推上云（否则手机端看不到勾选状态）。
  await touchEntry(taskId)
}

/** 取消重复任务的「已完成」状态：
 *  完成语义是「勾掉任意一天 → 从那天起到结束日都已完成」，后面的天是派生状态、
 *  没有自己的 recurringDone row。所以在任意已完成的天上取消勾选，应该把
 *  该天（含）之后的所有完成记录一起删掉 —— 即整体恢复未完成。
 *  （取消勾选最早那天 = 完全恢复；取消勾选中间天也等价，因为 firstDone 会重新计算） */
export async function uncheckRecurring(taskId: string, dateKey: string): Promise<void> {
  const rows = await db.recurringDone.where('taskId').equals(taskId).toArray()
  const toDelete = rows.filter((r) => r.dateKey >= dateKey).map((r) => r.id)
  if (toDelete.length) await db.recurringDone.bulkDelete(toDelete)
  // 同上：完成记录变了要 touch 条目，才能同步给其它设备
  await touchEntry(taskId)
}

/** 把 day 里的日期搬到 targetKey（月视图拖拽用） */
export async function moveToDate(id: string, targetKey: string): Promise<void> {
  const e = await db.entries.get(id)
  if (!e) return
  const shift = (iso?: string) => {
    if (!iso) return undefined
    const d = new Date(iso)
    const base = new Date(targetKey + 'T00:00:00')
    d.setFullYear(base.getFullYear(), base.getMonth(), base.getDate())
    return d.toISOString()
  }
  const patch: Partial<Entry> = {
    dateKey: targetKey,
    startAt: shift(e.startAt),
    endAt: shift(e.endAt),
  }
  await patchEntry(id, patch)
  pushUndoPatch(e, patch)
}

/**
 * 重新排列指定日期+类型的条目顺序（管理模式拖拽用）。
 * orderedIds 是期望的完整顺序；不在列表里的条目会被追加到末尾。
 * 重新分配 order 用 base + i*1000 的稀疏序列，方便后续插入。
 */
export async function reorderEntries(
  dateKey: string,
  kind: EntryKind,
  orderedIds: string[],
): Promise<void> {
  const all = await db.entries.where('dateKey').equals(dateKey).toArray()
  const inGroup = all.filter((e) => !e.deleted && e.kind === kind)
  const idSet = new Set(orderedIds)
  // 不在 orderedIds 里的、按当前 order 追加到末尾
  const rest = inGroup
    .filter((e) => !idSet.has(e.id))
    .sort((a, b) => a.order - b.order)
  const map = new Map<string, Entry>()
  for (const e of inGroup) map.set(e.id, e)
  const finalIds = [
    ...orderedIds.filter((id) => map.has(id)),
    ...rest.map((e) => e.id),
  ]
  const base = Date.now()
  await Promise.all(
    finalIds.map((id, i) =>
      db.entries.update(id, { order: base + i * 1000 }),
    ),
  )
}
