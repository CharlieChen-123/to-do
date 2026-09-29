/**
 * Web Speech API 的最小类型声明 + 封装。
 * 这是浏览器原生能力，不调用任何外部 API，不消耗 token。
 * 注意：需要安全上下文（HTTPS 或 localhost），局域网 http 下麦克风不可用。
 */

export interface SpeechAlt {
  transcript: string
  confidence: number
}
export interface SpeechResult {
  isFinal: boolean
  length: number
  item(i: number): SpeechAlt
  [i: number]: SpeechAlt
}
export interface SpeechResultList {
  length: number
  item(i: number): SpeechResult
  [i: number]: SpeechResult
}
export interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechResultList
}
export interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}
export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechCtor
    webkitSpeechRecognition?: SpeechCtor
  }
}

export function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export const speechSupported = (): boolean => getSpeechCtor() !== null

/** 是否需要安全上下文（麦克风在 http 局域网地址下会被浏览器拒绝） */
export const isSecureContextOk = (): boolean =>
  typeof window !== 'undefined' &&
  (window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')

const ERR_TEXT: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝，去浏览器设置里允许一下',
  'service-not-allowed': '浏览器不允许使用语音服务',
  network: '语音识别服务连不上（这个功能是浏览器自带的，不走网络请求）',
  'no-speech': '没听到声音',
  aborted: '已取消',
  'audio-capture': '找不到麦克风设备',
}

const ERR_TEXT_EN: Record<string, string> = {
  'not-allowed': 'Microphone permission denied. Allow it in your browser settings.',
  'service-not-allowed': 'Voice recognition is blocked by the browser.',
  network: 'Could not connect to the voice recognition service.',
  'no-speech': 'No speech detected.',
  aborted: 'Voice input cancelled.',
  'audio-capture': 'No microphone found.',
}

export const speechErrorText = (code: string, lang: 'zh' | 'en' = 'zh'): string =>
  lang === 'en' ? (ERR_TEXT_EN[code] ?? `Voice recognition error: ${code}`) : (ERR_TEXT[code] ?? `语音识别出错：${code}`)
