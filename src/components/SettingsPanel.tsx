import { useEffect, useRef, useState, type ChangeEventHandler } from 'react'
import { createPortal } from 'react-dom'
import { THEMES } from '../themes'
import {
  fontZoom,
  useSettings,
  type FontSizeId,
  type LangId,
  type WeekStartId,
} from '../store/settings'
import { useL, useT } from '../i18n'
import { useUi } from '../store/ui'
import { organizeWithAI } from '../lib/ai'
import { exportBackup, importBackup } from '../lib/backup'
import { TODAY } from '../lib/date'
import { syncEnabled } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useSync } from '../store/sync'
import { useDeletedEntries } from '../lib/useEntries'
import { TRASH_RETENTION_DAYS } from '../lib/trash'
import { TagManager } from './TagManager'
import type { HistoryViewId } from '../App'

const FONTS: FontSizeId[] = ['sm', 'md', 'lg', 'xl']
const LANGS: LangId[] = ['zh', 'en']
const WEEK_STARTS: WeekStartId[] = ['mon', 'sun']

/** 常用模型，也可以直接手输任意模型名 */
const MODEL_SUGGEST = [
  'qwen-plus',
  'qwen-turbo',
  'qwen-max',
  'qwen-flash',
  'deepseek-v3.2',
  'glm-4.7',
  'MiniMax-M2.1',
]

export function SettingsPanel({
  onOpenHistory,
}: {
  /** 触发「已完成 / 最近删除」模态的回调（App.tsx 持有真实模态） */
  onOpenHistory?: (v: HistoryViewId) => void
} = {}) {
  const t = useT()
  const l = useL()
  const open = useSettings((s) => s.settingsOpen)
  const setOpen = useSettings((s) => s.setSettingsOpen)
  const s = useSettings()
  const pushToast = useUi((s2) => s2.pushToast)

  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** API Key 默认掩码显示（点「修改」才露出输入框），避免长串 key 直接呈在屏幕上 */
  const [editingKey, setEditingKey] = useState(false)
  /**
   * 当前生效的 Service Worker cache 名（即部署版本号）。
   * 监听 main.tsx 通过 CustomEvent 推送的 jot-sw-version；
   * 也可以通过 SW MessageChannel 主动查询（用于"刷新 SW"按钮）。
   */
  const [swCache, setSwCache] = useState<string>('—')
  useEffect(() => {
    const onVersion = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail) setSwCache(detail)
    }
    window.addEventListener('jot-sw-version', onVersion)
    return () => window.removeEventListener('jot-sw-version', onVersion)
  }, [])
  const askSwForVersion = () => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!reg.active) return
        const ch = new MessageChannel()
        ch.port1.onmessage = (e) => {
          const cache = (e.data as { cache?: string })?.cache
          if (cache) setSwCache(cache)
        }
        reg.active.postMessage({ type: 'JOT_GET_VERSION' }, [ch.port2])
      })
      .catch(() => undefined)
  }
  /** "重新加载"按钮：直接 reload，SW 会在新 controller 接管后再次推送版本 */
  const reloadApp = () => {
    window.location.reload()
  }
  /**
   * 「检查更新」：手动调用 SW 的 skipWaiting，让新 SW 立即接管，再 reload。
   * 用于：右下角 chip 已移除后，怀疑 SW 没接管时的兜底。
   */
  const checkUpdate = async () => {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return
      // 让新 SW（如果 waiting 状态）立即接管
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'JOT_SKIP_WAITING' })
        // 等它激活后 reload
        await new Promise<void>((resolve) => {
          const onChange = () => {
            reg.active?.addEventListener('statechange', () => resolve())
            window.setTimeout(resolve, 1000)
          }
          onChange()
        })
        reloadApp()
      } else {
        // 没有 waiting → 触发一次 update 检查
        await reg.update()
        askSwForVersion()
        pushToast(l('已是最新生效版本', 'Already up to date'), { ttl: 1800 })
      }
    } catch {
      pushToast(l('SW 更新检查失败', 'Update check failed'), { ttl: 1800 })
    }
  }
  /** 「清缓存」：注销当前 SW 并清掉所有 jot-* cache 后 reload */
  const clearAllCaches = async () => {
    if (!window.confirm(l('确认清掉所有 Service Worker 缓存？下次打开会重新拉资源。', 'Clear the offline cache? It will download again next time.'))) return
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.filter((k) => k.startsWith('jot-')).map((k) => caches.delete(k)))
      }
      pushToast(l('缓存已清，3 秒后自动重载…', 'Cache cleared. Reloading in 3 seconds…'), { ttl: 1800 })
      window.setTimeout(reloadApp, 3000)
    } catch {
      pushToast(l('清缓存失败', 'Could not clear cache'), { ttl: 1800 })
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const syncStatus = useSync((s) => s.status)
  const syncLast = useSync((s) => s.last)
  const runSync = useSync((s) => s.run)
  const authUser = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  // 用于显示按钮旁边的数量徽章
  const deleted = useDeletedEntries()
  const deletedCount = deleted.length

  if (!open) return null

  const testAI = async () => {
    setTesting(true)
    setTestMsg(null)
    try {
      const r = await organizeWithAI(
        l('嗯那个 我明天下午三点要开会 然后还有 后天得交作业', 'I have a meeting tomorrow at 3 pm and homework due the day after tomorrow'),
        TODAY(),
        s.aiApiKey,
        s.aiModel,
      )
      setTestMsg({
        ok: true,
        text: l(`正常：识别 ${r.drafts.length} 条，消耗 ${r.usage?.total ?? '?'} tokens`, `Working: ${r.drafts.length} items, ${r.usage?.total ?? '?'} tokens`),
      })
    } catch (e) {
      setTestMsg({ ok: false, text: l(`失败：${(e as Error).message.slice(0, 120)}`, `Failed: ${(e as Error).message.slice(0, 120)}`) })
    }
    setTesting(false)
  }

  const exportData = async () => {
    await exportBackup()
    pushToast(t('settings.exported'))
  }

  const onImportFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    if (!window.confirm(t('settings.importConfirm'))) return
    try {
      const res = await importBackup(file)
      pushToast(
        l(`已导入 ${res.entries} 条记录、${res.recurringDone} 条重复打勾、${res.files} 个附件`, `Imported ${res.entries} entries, ${res.recurringDone} recurring completions, and ${res.files} attachments`),
      )
    } catch (err) {
      pushToast(l(`导入失败：${(err as Error).message}`, `Import failed: ${(err as Error).message}`))
    }
  }

  return createPortal(
    <div
      className="jot-set-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="jot-set" onMouseDown={(e) => e.stopPropagation()}>
        <div className="jot-set-head">
          <h2 className="jot-set-title">{t('settings.title')}</h2>
          <button
            type="button"
            className="jot-set-x"
            onClick={() => setOpen(false)}
            aria-label={t('settings.close')}
          >
            ×
          </button>
        </div>

        <div className="jot-set-body">
          {/* ---------------- 数据浏览 ----------------
               「查看已完成」入口已按需求移除（纯占空间，没人看）。
               只保留「最近删除」——它是有实际作用的（恢复误删）。 */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{l('数据浏览', 'Browse data')}</h3>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {l('查看最近删除', 'Recently deleted')}
                <span className="jot-set-hint">
                  {l(`删除的条目可在这里恢复或永久删除。保留 ${TRASH_RETENTION_DAYS} 天，到期自动清除。`, `Restore or permanently delete items here. Items are kept for ${TRASH_RETENTION_DAYS} days.`)}
                </span>
              </div>
              <div className="jot-set-testrow">
                <span className="jot-set-sysver">{deletedCount}</span>
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => {
                    setOpen(false)
                    onOpenHistory?.('trash')
                  }}
                >
                  {l('打开', 'Open')}
                </button>
              </div>
            </div>
          </section>

          {/* ---------------- 标签 ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{l('标签', 'Tags')}</h3>
            <TagManager />
          </section>

          {/* ---------------- 外观 ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{t('settings.appearance')}</h3>

            <div
              className="jot-set-row jot-set-row-col"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                flexWrap: 'nowrap',
                textAlign: 'left',
              }}
            >
              <div
                className="jot-set-label"
                style={{
                  flex: '0 0 auto',
                  width: 'auto',
                  alignSelf: 'flex-start',
                  textAlign: 'left',
                  marginLeft: 0,
                }}
              >
                {t('settings.theme')}
                <span className="jot-set-hint">{t('settings.themeHint')}</span>
              </div>
              <div className="jot-set-themes">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`jot-set-swatch ${s.theme === th.id ? 'is-active' : ''}`}
                    title={t(`theme.${th.id}`)}
                    aria-label={t(`theme.${th.id}`)}
                    aria-pressed={s.theme === th.id}
                    onClick={() => s.patch({ theme: th.id })}
                  >
                    <span className="jot-set-dot" style={{ background: th.swatch }} />
                    <span className="jot-set-swatch-name">{t(`theme.${th.id}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">{t('settings.fontSize')}</div>
              <div className="jot-set-seg">
                {FONTS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`jot-set-segbtn ${s.fontSize === f ? 'is-active' : ''}`}
                    onClick={() => s.patch({ fontSize: f })}
                  >
                    {t(`font.${f}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">{t('settings.lang')}</div>
              <div className="jot-set-seg">
                {LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`jot-set-segbtn ${s.lang === l ? 'is-active' : ''}`}
                    onClick={() => s.patch({ lang: l })}
                  >
                    {t(`lang.${l}`)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ---------------- 通用 ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{t('settings.general')}</h3>

            <div className="jot-set-row">
              <div className="jot-set-label">{t('settings.weekStart')}</div>
              <div className="jot-set-seg">
                {WEEK_STARTS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`jot-set-segbtn ${s.weekStart === w ? 'is-active' : ''}`}
                    onClick={() => s.patch({ weekStart: w })}
                  >
                    {t(`week.${w}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {t('settings.weekendTint')}
                <span className="jot-set-hint">{t('settings.weekendTintHint')}</span>
              </div>
              <button
                type="button"
                className={`jot-set-toggle ${s.weekendTint ? 'is-on' : ''}`}
                onClick={() => s.patch({ weekendTint: !s.weekendTint })}
                aria-pressed={s.weekendTint}
              >
                <span className="jot-set-knob" />
              </button>
            </div>
          </section>

          {/* ---------------- AI ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{t('settings.ai')}</h3>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {t('settings.aiEnable')}
                <span className="jot-set-hint">{t('settings.aiHint')}</span>
              </div>
              <button
                type="button"
                className={`jot-set-toggle ${s.aiEnabled ? 'is-on' : ''}`}
                onClick={() => s.patch({ aiEnabled: !s.aiEnabled })}
                aria-pressed={s.aiEnabled}
              >
                <span className="jot-set-knob" />
              </button>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">{t('settings.aiModel')}</div>
              <input
                className="jot-set-input"
                list="jot-models"
                value={s.aiModel}
                onChange={(e) => s.patch({ aiModel: e.target.value })}
              />
              <datalist id="jot-models">
                {MODEL_SUGGEST.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {t('settings.aiKey')}
                <span className="jot-set-hint">{t('settings.aiKeyHint')}</span>
              </div>
              {editingKey ? (
                <div className="jot-set-key-edit">
                  <input
                    className="jot-set-input"
                    type="password"
                    autoFocus
                    value={s.aiApiKey}
                    onChange={(e) => s.patch({ aiApiKey: e.target.value })}
                    onBlur={() => setEditingKey(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="jot-set-key-view"
                  onClick={() => setEditingKey(true)}
                  title={t('common.change')}
                  aria-label={t('common.change')}
                >
                  <span className="jot-set-key-dots">
                    {'•'.repeat(Math.min(12, Math.max(6, s.aiApiKey.length)))}
                  </span>
                  <span className="jot-set-key-tail">
                    {s.aiApiKey ? `…${s.aiApiKey.slice(-4)}` : t('settings.aiKey')}
                  </span>
                  <span className="jot-set-key-edit-ico">
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                      <path
                        d="M11.5 2.5l2 2-7.5 7.5L3 13l1-3 7.5-7.5z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
              )}
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label" />
              <div className="jot-set-testrow">
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => void testAI()}
                  disabled={testing || !s.aiApiKey}
                >
                  {testing ? t('settings.aiTesting') : t('settings.aiTest')}
                </button>
                {testMsg && (
                  <span className={`jot-set-testmsg ${testMsg.ok ? 'is-ok' : 'is-bad'}`}>
                    {testMsg.text}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ---------------- 系统 ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{l('系统', 'System')}</h3>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {l('当前版本', 'Current version')}
                <span className="jot-set-hint">
                  {l('显示当前离线缓存版本。若一直是 —，请尝试重新加载。', 'Shows the current offline cache version. If it stays at —, try reloading.')}
                </span>
              </div>
              <div className="jot-set-testrow">
                <span
                  className={`jot-set-sysver ${
                    swCache === '—' ? 'is-stale' : ''
                  }`}
                >
                  {swCache}
                </span>
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={askSwForVersion}
                  title={l('主动向 Service Worker 询问当前版本', 'Check the current version')}
                >
                  {l('刷新', 'Refresh')}
                </button>
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={reloadApp}
                  title={l('重新加载整个页面', 'Reload the page')}
                >
                  {l('重新加载', 'Reload')}
                </button>
              </div>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {l('缓存管理', 'Cache')}
                <span className="jot-set-hint">
                  {l('如果页面未更新或显示异常，可检查更新或清除离线缓存。', 'If the page looks outdated or broken, check for updates or clear the offline cache.')}
                </span>
              </div>
              <div className="jot-set-testrow">
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => void checkUpdate()}
                >
                  {l('检查更新', 'Check for updates')}
                </button>
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => void clearAllCaches()}
                >
                  {l('清掉所有缓存', 'Clear cache')}
                </button>
              </div>
            </div>
          </section>

          {/* ---------------- 数据 ---------------- */}
          <section className="jot-set-sec">
            <h3 className="jot-set-h3">{t('settings.data')}</h3>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {t('settings.export')}
                <span className="jot-set-hint">{t('settings.exportHint')}</span>
              </div>
              <div className="jot-set-testrow">
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => void exportData()}
                >
                  {t('settings.export')}
                </button>
                <button
                  type="button"
                  className="jot-set-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  {t('settings.import')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={onImportFile}
                />
              </div>
            </div>

            <div className="jot-set-row">
              <div className="jot-set-label">
                {t('settings.sync')}
                <span className="jot-set-hint">
                  {syncEnabled ? t('settings.syncOn') : t('settings.syncOff')}
                </span>
              </div>
              <div className="jot-set-testrow">
                {syncEnabled ? (
                  <button
                    type="button"
                    className="jot-set-btn"
                    onClick={() => void runSync()}
                    disabled={syncStatus === 'syncing'}
                  >
                    {syncStatus === 'syncing' ? t('settings.syncing') : t('settings.syncNow')}
                  </button>
                ) : (
                  <span className="jot-set-testmsg">{t('settings.syncNeedEnv')}</span>
                )}
                {syncEnabled && syncLast && (
                  <span className="jot-set-testmsg is-ok">
                    {t('settings.lastSync')}: {new Date(syncLast).toLocaleString(s.lang === 'en' ? 'en-US' : 'zh-CN')}
                  </span>
                )}
                {syncEnabled && syncStatus === 'error' && (
                  <span className="jot-set-testmsg is-bad">{l('同步失败，点「立即同步」重试', 'Sync failed. Select Sync now to retry.')}</span>
                )}
              </div>
            </div>

            {syncEnabled && (
              <div className="jot-set-row">
                <div className="jot-set-label">
                  {l('账号', 'Account')}
                  <span className="jot-set-hint">
                    {authUser?.email ?? l('未登录', 'Not signed in')}
                  </span>
                </div>
                <div className="jot-set-testrow">
                  <button
                    type="button"
                    className="jot-set-btn"
                    onClick={() => void signOut()}
                  >
                    {l('退出登录', 'Sign out')}
                  </button>
                  <span className="jot-set-testmsg">
                    {l('数据已按账号隔离，别人拿到网址也读不到', 'Your data is private to this account')}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 左下角：设置按钮 + 本地模式指示 */
export function SettingsTrigger() {
  const t = useT()
  const setOpen = useSettings((s) => s.setSettingsOpen)
  return (
    <div className="jot-set-trigger">
      <button
        type="button"
        className="jot-set-gear"
        onClick={() => setOpen(true)}
        title={t('settings.title')}
        aria-label={t('settings.title')}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="jot-set-gear-txt">{t('settings.title')}</span>
      </button>
      <span className="jot-local-mode">
        <span className="jot-local-dot" />
        {t('local.mode')}
      </span>
    </div>
  )
}

export { fontZoom }
