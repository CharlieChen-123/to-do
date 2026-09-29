/**
 * 主题系统 —— 单一主题色驱动全部状态
 *
 * 设计依据（参考 2026 配色趋势 + 生产力工具特性）：
 *  - 日历/任务这类「每天长时间盯着」的工具，低饱和、柔和的配色比高饱和更耐看
 *  - 60-30-10：背景中性色占主体，主题色只用在「可交互 / 选中 / 强调」
 *  - 语义色（红=删除/错误）不与主题色混用，避免误读系统反馈
 *
 * 每个主题定义一组 CSS 变量，切主题时整体（背景、边框、文字、选中态、
 * hover、focus、按钮、气泡高亮……）全部跟着走，不需要改任何组件代码。
 */

export interface ThemeVars {
  bg: string
  bgSoft: string
  bgSunken: string
  line: string
  lineStrong: string
  ink: string
  ink2: string
  ink3: string
  /** 主强调色：任务列、选中态、可交互元素、focus ring */
  accent: string
  /** 主强调色的浅底：选中列/行的背景 */
  accentSoft: string
  /** 主强调色的深色：hover / active */
  accentStrong: string
  /** 次强调色：日程列、日程类条目 */
  amber: string
  amberSoft: string
  /** 周末列底色（周六/周日）—— 跟主题走，不写死 */
  weekendBg: string
  weekendBgHover: string
  weekendBgSelected: string
  /** 语义色：删除 / 错误（不随主题大改，保证「红=危险」的直觉） */
  red: string
  redSoft: string
  /** 高亮（搜索命中等） */
  hl: string
}

export interface Theme {
  id: string
  /** 中文名 */
  label: string
  /** 英文名 */
  labelEn: string
  /** 设置面板里的预览色（取主强调色） */
  swatch: string
  vars: ThemeVars
}

export const THEMES: Theme[] = [
  {
    id: 'warm-stone',
    label: '暖石灰',
    labelEn: 'Warm stone',
    swatch: '#9A6B2F',
    vars: {
      bg: '#FDFCFA',
      bgSoft: '#F7F5F1',
      bgSunken: '#F0EDE7',
      line: '#EAE5DC',
      lineStrong: '#D8D1C4',
      ink: '#262320',
      ink2: '#6B645B',
      ink3: '#A29A8D',
      accent: '#4A3F36',
      accentSoft: '#FAF2E4',
      accentStrong: '#2E2620',
      amber: '#C2781A',
      amberSoft: '#FDF5E8',
      weekendBg: '#FDF9EC',
      weekendBgHover: '#FAF1DE',
      weekendBgSelected: '#FEF9EE',
      red: '#B0382F',
      redSoft: '#FCF0EE',
      hl: '#F7E3B0',
    },
  },
  {
    id: 'terracotta',
    label: '赤陶',
    labelEn: 'Terracotta',
    swatch: '#C1603F',
    vars: {
      bg: '#FDFAF7',
      bgSoft: '#F8F2EC',
      bgSunken: '#F1E9E1',
      line: '#EDE2D8',
      lineStrong: '#DBC9B8',
      ink: '#2B2320',
      ink2: '#6E5F56',
      ink3: '#A8917F',
      accent: '#6B4A3A',
      accentSoft: '#FAEEE7',
      accentStrong: '#4A3528',
      amber: '#C8881A',
      amberSoft: '#FBF0EA',
      weekendBg: '#FBEFE7',
      weekendBgHover: '#F7E3D6',
      weekendBgSelected: '#FEF5EF',
      red: '#A93A2E',
      redSoft: '#FCF0ED',
      hl: '#F5D9C0',
    },
  },
  {
    id: 'butter',
    label: '奶油',
    labelEn: 'Butter',
    swatch: '#B8860B',
    vars: {
      bg: '#FEFDF8',
      bgSoft: '#FAF7EC',
      bgSunken: '#F4F0DF',
      line: '#EFE9D5',
      lineStrong: '#DED5B8',
      ink: '#26241C',
      ink2: '#6A6553',
      ink3: '#A09A83',
      accent: '#5A5028',
      accentSoft: '#FBF5DF',
      accentStrong: '#3D361B',
      amber: '#B8541E',
      amberSoft: '#FAF4E6',
      weekendBg: '#FBF6E0',
      weekendBgHover: '#F6ECC8',
      weekendBgSelected: '#FEFAE8',
      red: '#A83A32',
      redSoft: '#FBF0EE',
      hl: '#F7E9A8',
    },
  },
  {
    id: 'sage',
    label: '鼠尾草',
    labelEn: 'Sage',
    swatch: '#5F7A4E',
    vars: {
      bg: '#FBFCFA',
      bgSoft: '#F4F6F1',
      bgSunken: '#ECF0E9',
      line: '#E4EAE0',
      lineStrong: '#D0D9C9',
      ink: '#222722',
      ink2: '#5F6B5F',
      ink3: '#96A195',
      accent: '#3F6B4E',
      accentSoft: '#F0F5EA',
      accentStrong: '#2A4F38',
      amber: '#B8541E',
      amberSoft: '#F8F5E6',
      weekendBg: '#EFF5E8',
      weekendBgHover: '#E3ECDA',
      weekendBgSelected: '#F5F9EF',
      red: '#A5382C',
      redSoft: '#FAF0ED',
      hl: '#DCE8C8',
    },
  },
  {
    id: 'glacier',
    label: '冰川',
    labelEn: 'Glacier',
    swatch: '#3A6E8C',
    vars: {
      bg: '#FBFCFD',
      bgSoft: '#F3F6F8',
      bgSunken: '#EAEFF3',
      line: '#E2E9EE',
      lineStrong: '#CDD8E0',
      ink: '#1F272D',
      ink2: '#5B6873',
      ink3: '#94A1AC',
      accent: '#2C5670',
      accentSoft: '#EDF4F8',
      accentStrong: '#1F3F52',
      amber: '#B8541E',
      amberSoft: '#F9F4E8',
      weekendBg: '#ECF3F7',
      weekendBgHover: '#DDE9F0',
      weekendBgSelected: '#F3F8FB',
      red: '#A83A32',
      redSoft: '#FAF0EE',
      hl: '#C9E0EC',
    },
  },
  {
    id: 'mocha',
    label: '摩卡',
    labelEn: 'Mocha',
    swatch: '#6B4A3A',
    vars: {
      bg: '#FCFAF8',
      bgSoft: '#F6F2EE',
      bgSunken: '#EFE9E3',
      line: '#E9E1D9',
      lineStrong: '#D6CABB',
      ink: '#2A231E',
      ink2: '#6B5B4F',
      ink3: '#A18D7C',
      accent: '#4A3D32',
      accentSoft: '#F5EEE8',
      accentStrong: '#2E2620',
      amber: '#C2781A',
      amberSoft: '#FAF3E9',
      weekendBg: '#F5EEE8',
      weekendBgHover: '#EBE1D8',
      weekendBgSelected: '#FAF4EF',
      red: '#A5382C',
      redSoft: '#FAF0ED',
      hl: '#E5D3C0',
    },
  },
  {
    id: 'indigo',
    label: '靛蓝',
    labelEn: 'Indigo',
    swatch: '#3A3F79',
    vars: {
      bg: '#FBFBFD',
      bgSoft: '#F4F4F8',
      bgSunken: '#ECECF3',
      line: '#E4E4EE',
      lineStrong: '#D0D0E0',
      ink: '#22222E',
      ink2: '#5C5C72',
      ink3: '#9595AB',
      accent: '#3A3F79',
      accentSoft: '#EEEEF6',
      accentStrong: '#2B2F5C',
      amber: '#B8541E',
      amberSoft: '#F9F4E8',
      weekendBg: '#EDEDF5',
      weekendBgHover: '#DCDCEA',
      weekendBgSelected: '#F3F3FA',
      red: '#A53832',
      redSoft: '#FAF0EE',
      hl: '#CDD0EE',
    },
  },
  {
    id: 'coral',
    label: '珊瑚',
    labelEn: 'Coral',
    swatch: '#C2674F',
    vars: {
      bg: '#FDFBF9',
      bgSoft: '#F8F4F1',
      bgSunken: '#F1EBE6',
      line: '#EDE4DE',
      lineStrong: '#DCCFC5',
      ink: '#2A2320',
      ink2: '#6E6058',
      ink3: '#A8968A',
      accent: '#8A4A3A',
      accentSoft: '#FAF0EB',
      accentStrong: '#5E3226',
      amber: '#C2781A',
      amberSoft: '#FAF3E7',
      weekendBg: '#FAF0EB',
      weekendBgHover: '#F3E1D9',
      weekendBgSelected: '#FDF5F1',
      red: '#A5382C',
      redSoft: '#FAF0ED',
      hl: '#F5DCCB',
    },
  },
]

export const DEFAULT_THEME = 'warm-stone'

export const getTheme = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0]

/** 把主题变量写到 <html> 的 style 上，整个界面立刻跟着变 */
export function applyThemeVars(id: string): void {
  if (typeof document === 'undefined') return
  const t = getTheme(id)
  const el = document.documentElement
  el.setAttribute('data-theme', t.id)
  const v = t.vars
  const map: Record<keyof ThemeVars, string> = {
    bg: '--bg',
    bgSoft: '--bg-soft',
    bgSunken: '--bg-sunken',
    line: '--line',
    lineStrong: '--line-strong',
    ink: '--ink',
    ink2: '--ink-2',
    ink3: '--ink-3',
    accent: '--accent',
    accentSoft: '--accent-soft',
    accentStrong: '--accent-strong',
    amber: '--amber',
    amberSoft: '--amber-soft',
    weekendBg: '--weekend-bg',
    weekendBgHover: '--weekend-bg-hover',
    weekendBgSelected: '--weekend-bg-selected',
    red: '--red',
    redSoft: '--red-soft',
    hl: '--hl',
  }
  for (const k of Object.keys(map) as (keyof ThemeVars)[]) {
    el.style.setProperty(map[k], v[k])
  }
}
