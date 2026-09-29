import { create } from 'zustand'
import type { ViewId } from '../types'

export interface CtxMenuState {
  entryId: string
  x: number
  y: number
}

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface Toast {
  id: number
  text: string
  /** 留空就是普通提示；非空则右侧出 [label] 按钮，点击调用 onClick */
  action?: ToastAction
  /** 自动消失毫秒数（默认 4000；带 action 的默认 8000） */
  ttl?: number
}

const readBool = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === null) return fallback
  return v !== '0'
}

const writeBool = (key: string, v: boolean): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, v ? '1' : '0')
  }
}

interface UiState {
  view: ViewId
  /** 月视图 / 周视图的锚点日期 */
  anchor: Date
  /** 月视图里点选的某一天 */
  selectedDate: string | null
  /** 当前展开编辑的条目 */
  editingId: string | null
  search: string
  /** 右键 / 长按菜单 */
  ctxMenu: CtxMenuState | null
  /** 搜索面板是否打开 */
  searchOpen: boolean
  /** 「活跃日期」：顶栏大日期 + 快速新建默认落到的日期（YYYY-MM-DD） */
  activeDateKey: string
  /** 顶栏日期是否处于编辑态（true = 显示成 date input） */
  dateEditing: boolean
  /** 今天视图的日程列是否隐藏 */
  showSchedule: boolean
  /** 今天视图的日程列表是否折叠（仅显示标题） */
  scheduleCollapsed: boolean
  /** 管理模式：开启后每条显示红色删除圈 + 三杠拖把手，可批量删 / 拖动改顺序 */
  manageMode: boolean
  /**
   * 多选状态：左键拖拽框选 / Shift+点选 / 右键 - 待定。
   * value 是 itemKey 集合（"e:abc" 普通 / "r:abc:2026-09-05" 重复实例）。
   * manageMode 开启时不与多选共存，关闭 manageMode 时 selection 仍可保留。
   */
  selection: Set<string>
  /** 轻量提示，自动消失 */
  toasts: Toast[]

  setView: (v: ViewId) => void
  setAnchor: (d: Date) => void
  shiftAnchor: (days: number) => void
  setSelectedDate: (d: string | null) => void
  setEditing: (id: string | null) => void
  setSearch: (s: string) => void
  openCtxMenu: (m: CtxMenuState) => void
  closeCtxMenu: () => void
  setSearchOpen: (v: boolean) => void
  setActiveDateKey: (k: string) => void
  setDateEditing: (v: boolean) => void
  setShowSchedule: (v: boolean) => void
  setScheduleCollapsed: (v: boolean) => void
  setManageMode: (v: boolean) => void
  toggleSelection: (key: string) => void
  addSelection: (keys: string[]) => void
  replaceSelection: (keys: string[]) => void
  clearSelection: () => void
  pushToast: (text: string, opts?: { action?: ToastAction; ttl?: number }) => void
  removeToast: (id: number) => void
}

const todayKey = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const useUi = create<UiState>((set) => ({
  view: 'today',
  anchor: new Date(),
  selectedDate: null,
  editingId: null,
  search: '',
  ctxMenu: null,
  searchOpen: false,
  activeDateKey: todayKey(),
  dateEditing: false,
  showSchedule: readBool('jot:showSchedule', true),
  scheduleCollapsed: readBool('jot:scheduleCollapsed', false),
  manageMode: false,
  selection: new Set<string>(),
  toasts: [],

  // 切换视图时收起正在编辑的条目，避免编辑态跨视图残留
  setView: (view) =>
    set({
      view,
      // 周/月视图每次进入都跳回「当前这一周 / 这一月」。
      // 桌面端窗口可能一开就是好几天，anchor 会一直停在上次翻到的那一页，
      // 用户切回周视图时看到的还是好几周前的界面 —— 这里直接归位到 now。
      // （视图内的 ‹ › 翻页不受影响，因为翻页走的是 setAnchor。）
      ...(view === 'week' || view === 'month' ? { anchor: new Date() } : {}),
      selectedDate: null,
      editingId: null,
      ctxMenu: null,
      dateEditing: false,
      // 跨视图清空多选：不同视图的 itemKey 含义不同
      selection: new Set<string>(),
    }),
  setAnchor: (anchor) => set({ anchor }),
  shiftAnchor: (days) =>
    set((s) => {
      const d = new Date(s.anchor)
      d.setDate(d.getDate() + days)
      return { anchor: d }
    }),
  setSelectedDate: (selectedDate) =>
    set((s) => ({
      selectedDate,
      // 选中某一天时，把它同步成「活跃日期」，顶栏和快速输入都跟过去
      activeDateKey: selectedDate ?? s.activeDateKey,
    })),
  setEditing: (editingId) => set({ editingId }),
  setSearch: (search) => set({ search }),
  openCtxMenu: (ctxMenu) => set({ ctxMenu }),
  closeCtxMenu: () => set({ ctxMenu: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setActiveDateKey: (activeDateKey) => set({ activeDateKey }),
  setDateEditing: (dateEditing) => set({ dateEditing }),
  setShowSchedule: (showSchedule) => {
    writeBool('jot:showSchedule', showSchedule)
    set({ showSchedule })
  },
  setScheduleCollapsed: (scheduleCollapsed) => {
    writeBool('jot:scheduleCollapsed', scheduleCollapsed)
    set({ scheduleCollapsed })
  },
  setManageMode: (manageMode) =>
    set(() => ({
      // 进入 manageMode 时清掉多选，避免两套交互同时生效
      manageMode,
      ...(manageMode ? { selection: new Set<string>() } : {}),
    })),
  toggleSelection: (key) =>
    set((s) => {
      const next = new Set(s.selection)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { selection: next }
    }),
  addSelection: (keys) =>
    set((s) => {
      if (keys.length === 0) return {}
      const next = new Set(s.selection)
      for (const k of keys) next.add(k)
      return { selection: next }
    }),
  replaceSelection: (keys) =>
    set(() => ({ selection: new Set(keys) })),
  clearSelection: () => set(() => ({ selection: new Set<string>() })),
  pushToast: (text, opts) => {
    const id = Date.now() + Math.random()
    const ttl = opts?.ttl ?? (opts?.action ? 8000 : 4000)
    set((s) => ({
      toasts: [...s.toasts, { id, text, action: opts?.action, ttl }],
    }))
    // 自动消失
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, ttl)
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))