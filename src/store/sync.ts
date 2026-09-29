import { useEffect } from 'react'
import { create } from 'zustand'
import { getMeta } from '../lib/db'
import { autoPurgeTrash } from '../lib/trash'
import { syncEnabled } from '../lib/supabase'
import { currentUserId } from '../lib/auth'
import { syncOnce } from '../lib/sync'
import { useEntries, useRecurringDone } from '../lib/useEntries'

type Status = 'idle' | 'syncing' | 'error' | 'ok'

interface SyncState {
  status: Status
  last: string | null
  error: string | null
  run: () => Promise<void>
}

export const useSync = create<SyncState>((set) => ({
  status: 'idle',
  last: null,
  error: null,
  run: async () => {
    if (!syncEnabled) return
    // 未登录：不发请求，状态回到 idle（不要报 error，否则登录页底下一直弹错误）
    if (!currentUserId()) {
      set({ status: 'idle', error: null })
      return
    }
    set({ status: 'syncing' })
    try {
      await syncOnce()
      // 同步可能刚拉下来一批「很久以前在别的设备上删掉」的条目 ——
      // 顺手清掉已过 30 天保留期的，不用等用户打开回收站。
      // autoPurgeTrash 在无可清内容时是纯读操作，不会反过来触发同步。
      await autoPurgeTrash()
      set({ status: 'ok', error: null, last: await getMeta('lastSyncedAt') })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
}))

/** 同步引擎：整个应用只调用一次 */
export function useSyncEngine() {
  const entries = useEntries()
  // 多日重复的「已完成」记录是独立表，改动不会体现在 entries 上；
  // 订阅它，勾选/取消完成也能触发一次去抖同步（把状态推上云 / 拉下来）。
  const recurringDone = useRecurringDone()
  const run = useSync((s) => s.run)

  useEffect(() => {
    if (!syncEnabled) return
    void run()
  }, [run])

  useEffect(() => {
    if (!syncEnabled) return
    const t = window.setTimeout(() => void run(), 2500)
    return () => window.clearTimeout(t)
  }, [entries, recurringDone, run])

  useEffect(() => {
    if (!syncEnabled) return
    const t = window.setInterval(() => void run(), 60000)
    return () => window.clearInterval(t)
  }, [run])
}
