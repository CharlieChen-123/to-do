import { useCallback } from 'react'
import { useSettings, type LangId } from './store/settings'

/**
 * 轻量 i18n：只覆盖"框架级"文案（侧栏导航、视图标题、设置面板、常用按钮）。
 * 正文 / 条目内容由用户自己写，不做翻译。
 */
const dict = {
  zh: {
    'nav.today': '今天',
    'nav.week': '本周',
    'nav.month': '月历',
    'nav.done': '已完成',
    'nav.settings': '设置',
    'nav.search': '搜索',
    'local.mode': '本地模式',
    'settings.title': '设置',
    'settings.appearance': '外观',
    'settings.theme': '主题色',
    'settings.themeHint': '主题色会同时驱动选中态、hover、按钮和日历高亮',
    'settings.fontSize': '字体大小',
    'settings.fontSizeHint': '整体缩放界面（类似浏览器缩放）',
    'settings.lang': '语言',
    'settings.general': '通用',
    'settings.weekStart': '一周从哪天开始',
    'settings.weekendTint': '周末列上色',
    'settings.weekendTintHint': '关闭后周六周日不再有底色',
    'settings.ai': 'AI 整理',
    'settings.aiEnable': '用大模型整理长文本 / 语音',
    'settings.aiHint':
      '开启后，语音或长文本会交给大模型精简并拆分；关闭则只用本地规则（免费、离线）',
    'settings.aiModel': '模型',
    'settings.aiKey': 'API Key',
    'settings.aiKeyHint': '密钥保存在本机浏览器；启用后，输入内容会发送给模型服务商。请勿在共享设备填写密钥。',
    'settings.aiTest': '测试连接',
    'settings.aiTesting': '测试中…',
    'settings.data': '数据',
    'settings.export': '导出全部数据（JSON）',
    'settings.exportHint': '把所有任务、日程和附件导出成一个文件备份',
    'settings.exported': '已导出',
    'settings.import': '导入备份（恢复）',
    'settings.importHint': '从之前导出的 JSON 恢复数据；按 id 合并，不会覆盖更新的本地记录',
    'settings.importConfirm': '导入备份会与当前数据合并，确定继续吗？',
    'settings.sync': '云同步',
    'settings.syncOn': '已连接 Supabase，每 60 秒自动双向同步',
    'settings.syncOff': '未配置 Supabase，数据仅在本机；在 .env 填入 URL 和 key 即可开启',
    'settings.syncNow': '立即同步',
    'settings.syncing': '同步中…',
    'settings.syncNeedEnv': '需在 .env 配置',
    'settings.lastSync': '上次同步',
    'settings.close': '关闭',
    'font.sm': '小',
    'font.md': '标准',
    'font.lg': '大',
    'font.xl': '特大',
    'week.mon': '周一',
    'week.sun': '周日',
    'lang.zh': '中文',
    'lang.en': 'English',
    'common.on': '开',
    'common.off': '关',
    'common.change': '修改',
    // 主题名（设置面板用）—— 跟 themes.ts 的 id 一一对应
    'theme.warm-stone': '暖石灰',
    'theme.terracotta': '赤陶',
    'theme.butter': '奶油',
    'theme.sage': '鼠尾草',
    'theme.glacier': '冰川',
    'theme.mocha': '摩卡',
    'theme.indigo': '靛蓝',
    'theme.coral': '珊瑚',
  },
  en: {
    'nav.today': 'Today',
    'nav.week': 'Week',
    'nav.month': 'Month',
    'nav.done': 'Done',
    'nav.settings': 'Settings',
    'nav.search': 'Search',
    'local.mode': 'Local mode',
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.themeHint':
      'The theme drives selection, hover, buttons and calendar highlights',
    'settings.fontSize': 'Text size',
    'settings.fontSizeHint': 'Scales the whole interface (like browser zoom)',
    'settings.lang': 'Language',
    'settings.general': 'General',
    'settings.weekStart': 'Week starts on',
    'settings.weekendTint': 'Tint weekend columns',
    'settings.weekendTintHint': 'Turn off to remove the weekend background',
    'settings.ai': 'AI organize',
    'settings.aiEnable': 'Use a model to tidy long text / speech',
    'settings.aiHint':
      'When on, speech or long text is cleaned up by a model; off means local rules only (free, offline)',
    'settings.aiModel': 'Model',
    'settings.aiKey': 'API Key',
    'settings.aiKeyHint':
      'Stored in this browser. When enabled, text is sent to the model provider. Avoid entering a key on a shared device.',
    'settings.aiTest': 'Test',
    'settings.aiTesting': 'Testing…',
    'settings.data': 'Data',
    'settings.export': 'Export all data (JSON)',
    'settings.exportHint': 'Back up every task, event and attachment to a file',
    'settings.exported': 'Exported',
    'settings.import': 'Import backup',
    'settings.importHint': 'Restore from a previously exported JSON; merged by id, never overwrites newer local records',
    'settings.importConfirm': 'Importing will merge with your current data. Continue?',
    'settings.sync': 'Cloud sync',
    'settings.syncOn': 'Connected to Supabase, auto syncs both ways every 60s',
    'settings.syncOff': 'Supabase not configured; data stays on this device. Add URL + key to .env to enable',
    'settings.syncNow': 'Sync now',
    'settings.syncing': 'Syncing…',
    'settings.syncNeedEnv': 'Needs .env',
    'settings.lastSync': 'Last sync',
    'settings.close': 'Close',
    'font.sm': 'Small',
    'font.md': 'Default',
    'font.lg': 'Large',
    'font.xl': 'Extra large',
    'week.mon': 'Monday',
    'week.sun': 'Sunday',
    'lang.zh': '中文',
    'lang.en': 'English',
    'common.on': 'On',
    'common.off': 'Off',
    'common.change': 'Change',
    // Theme names
    'theme.warm-stone': 'Warm stone',
    'theme.terracotta': 'Terracotta',
    'theme.butter': 'Butter',
    'theme.sage': 'Sage',
    'theme.glacier': 'Glacier',
    'theme.mocha': 'Mocha',
    'theme.indigo': 'Indigo',
    'theme.coral': 'Coral',
  },
} as const

export type TKey = keyof (typeof dict)['zh']

export function translate(lang: LangId, key: TKey | string): string {
  const table = dict[lang] ?? dict.zh
  return (table as Record<string, string>)[key] ?? (dict.zh as Record<string, string>)[key] ?? key
}

/** 组件里用：const t = useT(); t('nav.today') */
export function useT(): (key: TKey | string) => string {
  const lang = useSettings((s) => s.lang)
  return (key) => translate(lang, key)
}

/** 少量界面专用文案直接给中英文，避免为每个短提示维护独立 key。 */
export function useL(): (zh: string, en: string) => string {
  const lang = useSettings((s) => s.lang)
  return useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang])
}
