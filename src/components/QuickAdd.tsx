import { useEffect, useMemo, useRef, useState } from 'react'
import { createFromInput } from '../lib/actions'
import {
  getSpeechCtor,
  isSecureContextOk,
  speechErrorText,
  speechSupported,
  type SpeechRecognitionLike,
} from '../lib/speech'
import { useUi } from '../store/ui'
import { formatTime, friendlyDate, parseNaturalDate } from '../lib/date'
import { DraftPanel } from './DraftPanel'
import { useL } from '../i18n'
import { useSettings } from '../store/settings'

/** 一整段话（多分隔符 / 多个日期词 / 长度>30）→ 走整理而不是直接建一条 */
const DATE_HINT =
  /(今天|明天|后天|大后天|本周|这周|下周|下下周|周[一二三四五六日天1-7]|星期[一二三四五六日天1-7]|\d+\s*天后|\d+\s*[月\/\-.]\s*\d{1,2})/

const looksBulk = (s: string): boolean => {
  const t = s.trim()
  if (!t) return false
  if (/[。！？!?；;\n]/.test(t)) return true
  // 中文并列分隔符：包含 2 个或以上 → 多条目
  const commas = (t.match(/[，,、]/g) ?? []).length
  if (commas >= 2) return true
  if (t.length > 30) return true
  // 多个日期词（"明天下午3点周三下午5点..."）→ 多个独立条目
  const dates = (t.match(DATE_HINT) ?? []).length
  if (dates >= 2) return true
  return false
}

export function QuickAdd() {
  const l = useL()
  const lang = useSettings((s) => s.lang)
  const activeDateKey = useUi((s) => s.activeDateKey)
  const pushToast = useUi((s) => s.pushToast)

  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [speechErr, setSpeechErr] = useState<string | null>(null)
  /** 非空时表示「整理草稿面板」正在展示，值为待整理的原始文本 */
  const [draftText, setDraftText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')

  const canSpeech = speechSupported()
  const secureOk = isSecureContextOk()

  const parsed = useMemo(() => parseNaturalDate(text), [text])
  const effectiveDate = parsed.dateKey ?? activeDateKey

  useEffect(() => {
    return () => {
      recRef.current?.abort()
    }
  }, [])

  /* ---------- 语音 ---------- */

  const startListening = () => {
    if (!secureOk) {
      pushToast(l('语音需要 HTTPS。部署到公网后再用麦克风。', 'Voice input requires HTTPS.'))
      return
    }
    const Ctor = getSpeechCtor()
    if (!Ctor) return
    setSpeechErr(null)
    finalRef.current = ''
    setText('')

    const rec = new Ctor()
    rec.lang = lang === 'en' ? 'en-US' : 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalRef.current += r[0].transcript
        else interim += r[0].transcript
      }
      setText(finalRef.current + interim)
    }
    rec.onerror = (e) => {
      const msg = speechErrorText(e.error, lang)
      setSpeechErr(msg)
      pushToast(msg)
      setListening(false)
    }
    rec.onend = async () => {
      setListening(false)
      const t = finalRef.current.trim()
      if (!t) return
      // 语音停了 → 弹草稿面板让用户确认类型/日期/时间（方案 ②），不直接入库
      setDraftText(t)
      setText('')
      finalRef.current = ''
      inputRef.current?.focus()
    }

    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch {
      pushToast(l('启动麦克风失败', 'Could not start the microphone'))
    }
  }

  const stopListening = () => {
    recRef.current?.stop()
    setListening(false)
  }

  /* ---------- 提交 ---------- */

  const submit = async () => {
    const raw = text.trim()
    if (!raw) return

    // 一整段话（语音 / 长文本）→ 弹草稿面板确认，不直接落库（方案 ②）
    if (looksBulk(raw)) {
      setDraftText(raw)
      setText('')
      inputRef.current?.focus()
      return
    }

    await createFromInput(raw, effectiveDate)
    setText('')
    inputRef.current?.focus()
  }

  // 实时归类预览 chip（方案 ①）：写短文本时即时提示「将创建成什么」
  const preview = useMemo(() => {
    if (!text.trim() || looksBulk(text)) return null
    const kind = parsed.time ? 'event' : 'task'
    const datePart = parsed.dateKey ? friendlyDate(parsed.dateKey, lang) : ''
    const timePart = parsed.time ? formatTime(
      // 复用 buildRange 的 start 构造：直接拼 ISO 只是为了展示
      `${parsed.dateKey ?? activeDateKey}T${String(parsed.time.hour).padStart(2, '0')}:${String(parsed.time.minute).padStart(2, '0')}`,
    ) : ''
    return { kind, datePart, timePart }
  }, [text, parsed, activeDateKey, lang])

  return (
    <div className="jot-quickadd">
      <div className={`jot-qa-row ${listening ? 'is-listening' : ''}`}>
        <input
          ref={inputRef}
          className="jot-qa-input"
          value={text}
          placeholder={
            listening
              ? l('正在听…', 'Listening…')
              : l('写一条…（说"几点"自动变日程）', 'Add a task or event…')
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />

        <div className="jot-qa-right">
          {canSpeech && (
            <button
              type="button"
              className={`jot-mic ${listening ? 'is-on' : ''}`}
              title={
                secureOk
                  ? listening
                    ? l('点一下结束，自动整理', 'Stop recording and organize')
                    : l('语音说一段话，自动拆成任务/日程', 'Speak tasks or events')
                  : l('语音需要 HTTPS', 'Voice input requires HTTPS')
              }
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? l('结束录音', 'Stop recording') : l('语音输入', 'Voice input')}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <rect x="9.5" y="2.5" width="5" height="10" rx="2.5" fill="currentColor" />
                <path
                  d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}

          <button
            type="button"
            className="jot-qa-go"
            onClick={() => void submit()}
            disabled={!text.trim()}
            aria-label={l('添加', 'Add')}
          >
            ↵
          </button>
        </div>
      </div>

      {preview && (
        <div className="jot-qa-preview" aria-live="polite">
          <span className={`jot-qa-chip k-${preview.kind}`}>
            {preview.kind === 'event' ? l('日程', 'Event') : l('任务', 'Task')}
          </span>
          {preview.datePart && <span className="jot-qa-chip-sub">{preview.datePart}</span>}
          {preview.timePart && <span className="jot-qa-chip-sub">{preview.timePart}</span>}
          <span className="jot-qa-chip-hint">{l('回车直接添加 · 长文本/语音会先整理', 'Press Enter to add · Longer text and speech are organized first')}</span>
        </div>
      )}

      {draftText && (
        <DraftPanel
          text={draftText}
          defaultDateKey={activeDateKey}
          onClose={() => setDraftText(null)}
        />
      )}

      {speechErr && <p className="jot-qa-err">{speechErr}</p>}
    </div>
  )
}
