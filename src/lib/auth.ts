import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Supabase 未配置（纯本地模式）时不需要登录，登录门自动跳过 */
export const authRequired = supabase !== null

interface AuthState {
  user: User | null
  /** 首次读取 session 中 */
  loading: boolean
  /** session 已确定（未配置 Supabase 时直接为 true） */
  ready: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  ready: false,

  signIn: async (email, password) => {
    if (!supabase) throw new Error('未配置 Supabase，无法登录')
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(friendlyAuthError(error.message))
    set({ user: data.user, ready: true, loading: false })
  },

  signUp: async (email, password) => {
    if (!supabase) throw new Error('未配置 Supabase，无法注册')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(friendlyAuthError(error.message))
    // 后台开了「邮箱确认」时注册后拿不到 session，登录门会一直卡住 —— 明确提示怎么处理
    if (!data.session) {
      throw new Error(
        '注册成功，但邮箱需要确认。请到 Supabase 控制台 → Authentication → Providers → Email 关掉「Confirm email」，或直接在 Authentication → Users 里手动建用户（勾选 Auto Confirm）。',
      )
    }
    set({ user: data.user, ready: true, loading: false })
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    set({ user: null })
  },
}))

let inited = false

/** 读取已有 session 并订阅后续变化；整个应用只调用一次 */
export function initAuth() {
  if (inited) return
  inited = true

  if (!supabase) {
    // 纯本地模式：没有登录这回事
    useAuth.setState({ user: null, loading: false, ready: true })
    return
  }

  void supabase.auth
    .getSession()
    .then(({ data }) => {
      useAuth.setState({
        user: data.session?.user ?? null,
        loading: false,
        ready: true,
      })
    })
    .catch(() => {
      useAuth.setState({ user: null, loading: false, ready: true })
    })

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({
      user: session?.user ?? null,
      loading: false,
      ready: true,
    })
  })
}

/** 当前登录用户 id；未登录返回 null（同步层据此跳过） */
export function currentUserId(): string | null {
  return useAuth.getState().user?.id ?? null
}

function friendlyAuthError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不对'
  if (/Email not confirmed/i.test(msg)) return '邮箱还没确认，请去邮箱点确认链接'
  if (/User already registered/i.test(msg))
    return '这个邮箱已经注册过了，直接登录就行'
  if (/Password should be at least/i.test(msg)) return '密码太短了（至少 6 位）'
  if (/unable to validate email/i.test(msg)) return '邮箱格式不对'
  if (/Signups not allowed/i.test(msg))
    return '该项目的注册功能已关闭（这正是白名单效果）——请用已创建的账号登录'
  return msg
}
