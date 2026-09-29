import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { authRequired, initAuth, useAuth } from '../lib/auth'
import { useSync } from '../store/sync'
import { useL } from '../i18n'

/**
 * 登录门：只在配置了 Supabase（云同步）时才拦。
 * 未登录 → 只显示登录卡片，主界面完全不渲染（避免未授权读写云端）。
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const l = useL()
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)

  useEffect(() => {
    initAuth()
  }, [])

  // 登录成功后立刻拉一次云端数据
  const userId = user?.id ?? null
  useEffect(() => {
    if (userId) void useSync.getState().run()
  }, [userId])

  if (!authRequired) return <>{children}</>
  if (!ready) {
    return (
      <div className="jot-auth-mask">
        <div className="jot-auth-card">{l('正在检查登录状态…', 'Checking sign-in…')}</div>
      </div>
    )
  }
  if (!user) return <LoginScreen />
  return <>{children}</>
}

function LoginScreen() {
  const l = useL()
  const signIn = useAuth((s) => s.signIn)
  const signUp = useAuth((s) => s.signUp)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jot-auth-mask">
      <form className="jot-auth-card" onSubmit={onSubmit}>
        <div className="jot-auth-brand">To do</div>
        <p className="jot-auth-sub">{l('登录后才能与云端同步', 'Sign in to sync across devices')}</p>

        <label className="jot-auth-label" htmlFor="jot-auth-email">
          {l('邮箱', 'Email')}
        </label>
        <input
          id="jot-auth-email"
          className="jot-auth-input"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />

        <label className="jot-auth-label" htmlFor="jot-auth-pw">
          {l('密码', 'Password')}
        </label>
        <input
          id="jot-auth-pw"
          className="jot-auth-input"
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={l('至少 6 位', 'At least 6 characters')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && <p className="jot-auth-err">{err}</p>}

        <button
          type="submit"
          className="jot-auth-submit"
          disabled={busy || !email.trim() || password.length < 6}
        >
          {busy ? l('处理中…', 'Please wait…') : mode === 'in' ? l('登录', 'Sign in') : l('注册', 'Sign up')}
        </button>

        <button
          type="button"
          className="jot-auth-switch"
          onClick={() => {
            setMode((m) => (m === 'in' ? 'up' : 'in'))
            setErr(null)
          }}
        >
          {mode === 'in' ? l('还没有账号？注册一个', 'No account? Sign up') : l('已经有账号了？去登录', 'Already have an account? Sign in')}
        </button>
      </form>
    </div>
  )
}
