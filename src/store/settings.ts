import { create } from 'zustand'
import { DEFAULT_THEME } from '../themes'

export type FontSizeId = 'sm' | 'md' | 'lg' | 'xl'
export type LangId = 'zh' | 'en'
export type WeekStartId = 'mon' | 'sun'

export interface Settings {
  theme: string
  fontSize: FontSizeId
  lang: LangId
  /** 周视图从周几开始 */
  weekStart: WeekStartId
  /** 周末列是否上色 */
  weekendTint: boolean
  /** AI 整理：开启后长文本/语音走大模型，失败自动退回本地规则 */
  aiEnabled: boolean
  /** 阿里云百炼（DashScope）OpenAI 兼容接口的 key */
  aiApiKey: string
  aiModel: string
}

interface SettingsState extends Settings {
  settingsOpen: boolean
  patch: (p: Partial<Settings>) => void
  setSettingsOpen: (v: boolean) => void
}

const KEY = 'jot:settings'

const FONT_ZOOM: Record<FontSizeId, number> = {
  sm: 0.92,
  md: 1,
  lg: 1.08,
  xl: 1.16,
}

const defaults: Settings = {
  theme: DEFAULT_THEME,
  fontSize: 'md',
  lang: 'en',
  weekStart: 'mon',
  weekendTint: true,
  aiEnabled: false,
  aiApiKey: '',
  aiModel: 'qwen-plus',
}

function load(): Settings {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaults
    // 已有浏览器设置优先：保留用户的语言选择和自行填写的 AI 密钥。
    return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return defaults
  }
}

const save = (s: Settings) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  settingsOpen: false,
  patch: (p) => {
    const next = { ...get(), ...p } as Settings
    save(next)
    set(p)
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))

export const fontZoom = (id: FontSizeId): number => FONT_ZOOM[id] ?? 1
