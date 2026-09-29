import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Entry } from '../types'
import { categoryRank } from './categories'
import { db, type RecurringDoneRow } from './db'
import { TODAY } from './date'
import { isTagRow } from './tags'

/**
 * 可见条目。过滤三类东西：
 *  1) 软删除（deleted=1）
 *  2) 「彻底删除」留下的墓碑（purged，内容已清空，只是为了让删除能同步）
 *  3) 标签哨兵行（id 以 __tag__ 开头，是标签定义的云端载体，不是用户数据）
 *  4) 早期版本残留的「清单」条目（kind 已废弃）
 */
export function useEntries(): Entry[] {
  const all = useLiveQuery(() => db.entries.toArray(), [], [] as Entry[])
  return useMemo(
    () =>
      all.filter(
        (e) =>
          !e.deleted &&
          !e.purged &&
          !isTagRow(e) &&
          (e.kind === 'task' || e.kind === 'event'),
      ),
    [all],
  )
}

/** 回收站：软删的条目。墓碑（purged）和标签哨兵行不进回收站。 */
export function useDeletedEntries(): Entry[] {
  const all = useLiveQuery(() => db.entries.toArray(), [], [] as Entry[])
  return useMemo(
    () =>
      all.filter(
        (e) =>
          e.deleted === 1 &&
          !e.purged &&
          !isTagRow(e) &&
          (e.kind === 'task' || e.kind === 'event'),
      ),
    [all],
  )
}

/** 原始行（含哨兵/墓碑），给同步、备份这类需要「全量」的场景用 */
export function useAllRows(): Entry[] {
  return useLiveQuery(() => db.entries.toArray(), [], [] as Entry[])
}

export function useRecurringDone(): RecurringDoneRow[] {
  return useLiveQuery(
    () => db.recurringDone.toArray(),
    [],
    [] as RecurringDoneRow[],
  )
}

export const onDay = (e: Entry, key: string): boolean => e.dateKey === key

export const isTodayKey = (key: string | null): boolean => !!key && key === TODAY()

/** 当天显示的条目（混合普通条目 + 重复任务的虚拟当天实例） */
export type DayEntryItem =
  | { kind: 'entry'; entry: Entry }
  | {
      kind: 'recurring'
      template: Entry
      occurrenceDateKey: string
      done: boolean
    }

/**
 * 当天列表的固定排序：同类排一块 → 未完成在前已完成沉底 → 星标置顶 → 手动顺序。
 * 不再有「手动/类别」模式切换 —— 类别聚合永远是默认行为。
 */
function compareItems(a: DayEntryItem, b: DayEntryItem): number {
  const ea = a.kind === 'entry' ? a.entry : a.template
  const eb = b.kind === 'entry' ? b.entry : b.template
  const ca = categoryRank(ea.category)
  const cb = categoryRank(eb.category)
  if (ca !== cb) return ca - cb
  const da = a.kind === 'entry' ? a.entry.done : a.done
  const db_ = b.kind === 'entry' ? b.entry.done : b.done
  if (da !== db_) return da ? 1 : -1
  if (ea.starred !== eb.starred) return ea.starred ? -1 : 1
  return ea.order - eb.order
}

interface BuildDayListOpts {
  /** 周/月视图调用时传 true，会过滤掉不在周/月显示的重复任务 */
  isCalendarView?: boolean
}

/**
 * 构造某一天要渲染的条目列表：普通条目 + 多日重复任务的虚拟当天实例。
 * 多日重复语义（从开始日到结束日每天出现）：
 *   - 范围内的任意一天被「完成」→ 从那天起直到结束日，每天都以已完成（划线）状态出现；
 *   - 完成日之前的日子照常显示（未完成）。
 */
export function buildDayList(
  entries: Entry[],
  recurringDone: RecurringDoneRow[],
  dayKey: string,
  opts: BuildDayListOpts = {},
): DayEntryItem[] {
  // taskId -> 该任务被划掉过的那些日期
  const doneMap = new Map<string, Set<string>>()
  for (const r of recurringDone) {
    let s = doneMap.get(r.taskId)
    if (!s) {
      s = new Set<string>()
      doneMap.set(r.taskId, s)
    }
    s.add(r.dateKey)
  }

  const items: DayEntryItem[] = []

  // 普通条目
  for (const e of entries) {
    if (e.dateKey === dayKey) items.push({ kind: 'entry', entry: e })
  }

  // 重复任务虚拟实例
  for (const e of entries) {
    if (e.recurring !== 'daily') continue
    if (!e.dateKey) continue
    // 还没到起始日：跳过
    if (dayKey < e.dateKey) continue
    // 起始日的任务实例（entry）由上面的 entry 分支渲染（dateKey 命中 dayKey），
    // 这里跳过避免同一任务在起始日被重复列出一条
    if (dayKey === e.dateKey) continue
    // 设了「重复到哪天」就只生成到那一天（含）
    if (e.recurringUntil && dayKey > e.recurringUntil) continue
    if (opts.isCalendarView && e.recurringShowInWeekMonth === false) continue
    const doneSet = doneMap.get(e.id)
    // 「第一次被勾选」的日子 = 已完成状态的起点
    let firstDone: string | null = null
    if (doneSet && doneSet.size > 0) {
      firstDone = [...doneSet].sort()[0]
    }
    // 语义：勾掉任意一天后，从那天（含）起到结束日都保持已完成（划线显示），
    // 天数不再消失。dayKey >= firstDone 即视为已完成。
    const isDoneToday = firstDone != null && dayKey >= firstDone
    items.push({
      kind: 'recurring',
      template: e,
      occurrenceDateKey: dayKey,
      done: isDoneToday,
    })
  }

  // 固定排序：同类聚一块 → 已完成沉底 → 星标置顶 → 手动顺序
  items.sort(compareItems)

  return items
}

/** DayEntryItem 取内部的 Entry（用于展示模板字段） */
export function itemEntry(it: DayEntryItem): Entry {
  return it.kind === 'entry' ? it.entry : it.template
}

/**
 * 侧栏「今天」徽章的数字 —— 必须和「今天」视图任务列上的计数完全一致。
 *
 * 早期实现是直接扫 entries：`!done && kind==='task' && dateKey === 今天`。
 * 那个口径有两个洞，所以跟视图总对不上：
 *   1) 多日重复任务的虚拟实例（起始日不在今天、但今天也该出现）没有被算进去；
 *   2) 已经在某天勾掉的重复任务，模板自身的 done 还是 false，被多算了一次。
 * 现在统一走 buildDayList 生成「今天这一天真实的列表」，再数未完成任务。
 */
export function useTodayTaskCount(): number {
  const entries = useEntries()
  const recurringDone = useRecurringDone()
  return useMemo(() => {
    const items = buildDayList(entries, recurringDone, TODAY())
    return items.filter((it) => {
      const e = itemEntry(it)
      if (e.kind !== 'task') return false
      const done = it.kind === 'entry' ? it.entry.done : it.done
      return !done
    }).length
  }, [entries, recurringDone])
}