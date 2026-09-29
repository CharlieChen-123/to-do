// 极轻量的全局撤销/重做栈。
//
// 用法：
//   - 写操作前快照：snapshotForUndo('remove', entry)
//   - 写操作后入栈：recordUndo({ kind:'remove', entry: prevEntry })  ← prevEntry 必须是从快照恢复用的原始对象
//   - 用户按 Ctrl+Z：调用 undoLast()
//   - 用户按 Ctrl+Y：调用 redoLast()
//
// 我们只支持「软删」「创建」「改内容/类型/颜色/时间」这种可逆操作；
// 拖拽改日期、cancel keep-state 这种「关掉日期弹窗」之类不做 undo。

import { db, markDeleted } from './db'
import type { Entry } from '../types'

export type UndoOp =
  | { kind: 'softDelete'; entry: Entry }
  | { kind: 'restore'; entry: Entry }
  | { kind: 'create'; entry: Entry }
  | { kind: 'patch'; before: Entry; patch: Partial<Entry> }

const STACK_MAX = 30

interface State {
  past: UndoOp[]
  future: UndoOp[]
}

const state: State = { past: [], future: [] }

const push = (op: UndoOp) => {
  state.past.push(op)
  if (state.past.length > STACK_MAX) state.past.shift()
  // 任何新操作清空 redo 栈（标准撤销语义）
  state.future = []
}

const performUndo = async (op: UndoOp): Promise<void> => {
  if (op.kind === 'softDelete') {
    // 撤销删除 → 标记回未删
    await db.entries.update(op.entry.id, markDeleted(0))
  } else if (op.kind === 'restore') {
    // 撤销恢复 → 标记回已删。走 markDeleted 会写入**新的**删除时刻，
    // 保留期从这一刻重新算 —— 不能沿用旧 deletedAt，否则可能已经过期被立刻清掉。
    await db.entries.update(op.entry.id, markDeleted(1))
  } else if (op.kind === 'create') {
    // 撤销创建 → 改成已删（不彻底删，方便 redo）
    await db.entries.update(op.entry.id, markDeleted(1))
  } else {
    // patch：用快照恢复
    const { id, ...rest } = op.before
    const updatedAt = new Date().toISOString()
    await db.entries.update(id, { ...rest, updatedAt })
  }
}

const performRedo = async (op: UndoOp): Promise<void> => {
  if (op.kind === 'softDelete') {
    await db.entries.update(op.entry.id, markDeleted(1))
  } else if (op.kind === 'restore') {
    await db.entries.update(op.entry.id, markDeleted(0))
  } else if (op.kind === 'create') {
    await db.entries.update(op.entry.id, markDeleted(0))
  } else {
    const updatedAt = new Date().toISOString()
    // 仅应用 patch（其他字段保持不变）
    const { id, ...rest } = op.patch as { id?: string } & Record<string, unknown>
    void id
    await db.entries.update(op.before.id, { ...rest, updatedAt })
  }
}

/** 撤销最近一次，返回被撤销操作的「用户可读描述」（或 null 表示栈空） */
export const undoLast = async (): Promise<string | null> => {
  const op = state.past.pop()
  if (!op) return null
  state.future.push(op)
  await performUndo(op)
  return describe(op)
}

/** 重做最近一次被撤销的 */
export const redoLast = async (): Promise<string | null> => {
  const op = state.future.pop()
  if (!op) return null
  state.past.push(op)
  await performRedo(op)
  return describe(op)
}

export const canUndo = (): boolean => state.past.length > 0
export const canRedo = (): boolean => state.future.length > 0

/* ---------- 给上层写操作用的"包装器" ---------- */

/** 记录一次「软删」 */
export const pushUndoDelete = (entry: Entry): void => {
  push({ kind: 'softDelete', entry })
}

/** 记录一次「恢复删除」 */
export const pushUndoRestore = (entry: Entry): void => {
  push({ kind: 'restore', entry })
}

/** 记录一次「创建条目」（entry 是 created state） */
export const pushUndoCreate = (entry: Entry): void => {
  push({ kind: 'create', entry })
}

/** 记录一次「改字段」（before 是改动前；patch 是改了什么） */
export const pushUndoPatch = (before: Entry, patch: Partial<Entry>): void => {
  push({ kind: 'patch', before, patch })
}

/** 清空两栈（提交大量改动时用，避免 UI 上又冒出一堆「撤销」误导） */
export const clearUndoStacks = (): void => {
  state.past = []
  state.future = []
}

const describe = (op: UndoOp): string => {
  const text = (e: Entry): string => (e.plainText || '（空）').slice(0, 16)
  if (op.kind === 'softDelete') return `删除「${text(op.entry)}」`
  if (op.kind === 'restore') return `恢复「${text(op.entry)}」`
  if (op.kind === 'create') return `创建「${text(op.entry)}」`
  return `改「${text(op.before)}」`
}
