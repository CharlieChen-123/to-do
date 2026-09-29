import { syncEnabled } from '../lib/supabase'
import { useSync } from '../store/sync'
import { useL } from '../i18n'

export function SyncStatus() {
  const l = useL()
  const status = useSync((s) => s.status)
  const last = useSync((s) => s.last)
  const error = useSync((s) => s.error)
  const run = useSync((s) => s.run)

  if (!syncEnabled) {
    return (
      <div className="jot-sync is-local" title={l('未配置 Supabase，数据只存在这台设备', 'Supabase is not configured. Data stays on this device.')}>
        <span className="jot-sync-dot" />
        {l('本地模式', 'Local mode')}
      </div>
    )
  }

  const label =
    status === 'syncing'
      ? l('同步中…', 'Syncing…')
      : status === 'error'
        ? l('同步失败', 'Sync failed')
        : last
          ? l('已同步', 'Synced')
          : l('待同步', 'Not synced yet')

  return (
    <button
      type="button"
      className={`jot-sync s-${status}`}
      onClick={() => void run()}
      title={
        error ?? l(`上次同步：${last ? new Date(last).toLocaleString('zh-CN') : '从未'}`, `Last sync: ${last ? new Date(last).toLocaleString('en-US') : 'Never'}`)
      }
    >
      <span className="jot-sync-dot" />
      {label}
    </button>
  )
}
