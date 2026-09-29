import type { ChangeEvent, ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { fileToDataUrl } from '../lib/image'
import { saveFile } from '../lib/fileStore'
// 只需加载命令类型；运行时节点由按需加载的 Editor 注册。
import type {} from '../lib/tiptap-image'
import type {} from '../lib/tiptap-file'
import { useL } from '../i18n'

interface Btn {
  key: string
  label: ReactNode
  hint: string
  run: (e: Editor) => void
  active?: (e: Editor) => boolean
  cls?: string
}

// 无序列表的「圆点 + 横线」组合，flex 让横线与圆点垂直居中
const bulletLabel = (
  <span className="tb-bullet" aria-hidden="true">
    <span className="tb-bullet-dot" />
    <span className="tb-bullet-line" />
  </span>
)

const quoteLabel = <span className="tb-quote">❝</span>

const BTNS: Btn[] = [
  {
    key: 'bold', label: 'B', hint: '加粗', cls: 'f-bold',
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
  },
  {
    key: 'italic', label: 'I', hint: '斜体', cls: 'f-italic',
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    key: 'underline', label: 'U', hint: '下划线', cls: 'f-underline',
    run: (e) => e.chain().focus().toggleUnderline().run(),
    active: (e) => e.isActive('underline'),
  },
  {
    key: 'strike', label: 'S', hint: '删除线', cls: 'f-strike',
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive('strike'),
  },
  {
    key: 'highlight', label: 'H', hint: '高亮', cls: 'f-hl',
    run: (e) => e.chain().focus().toggleHighlight().run(),
    active: (e) => e.isActive('highlight'),
  },
  {
    key: 'code', label: '‹ ›', hint: '行内代码', cls: 'f-code',
    run: (e) => e.chain().focus().toggleCode().run(),
    active: (e) => e.isActive('code'),
  },
  { key: 'sep0', label: '', hint: '', run: () => {} },
  {
    key: 'bullet', label: bulletLabel, hint: '无序列表', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
  {
    key: 'ordered', label: '1.', hint: '有序列表', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive('orderedList'),
  },
  {
    key: 'task', label: '☑', hint: '任务列表', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleTaskList().run(),
    active: (e) => e.isActive('taskList'),
  },
  { key: 'sep1', label: '', hint: '', run: () => {} },
  {
    key: 'h1', label: 'H1', hint: '大标题', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    active: (e) => e.isActive('heading', { level: 1 }),
  },
  {
    key: 'h2', label: 'H2', hint: '小标题', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  { key: 'sep2', label: '', hint: '', run: () => {} },
  {
    key: 'hr', label: '—', hint: '分割线', cls: 'f-plain',
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    key: 'quote', label: quoteLabel, hint: '引用', cls: 'f-plain',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
  },
  {
    key: 'clear', label: '⌀', hint: '清除格式', cls: 'f-plain',
    run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
  },
]

const paperClipLabel = (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      d="M16.5 8.5l-6.2 6.2a2.1 2.1 0 0 0 3 3l7.4-7.4a3.7 3.7 0 0 0-5.2-5.2L8 12.6a1.6 1.6 0 0 0 2.3 2.3l5.5-5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const imageLabel = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <rect
      x="3.2"
      y="5"
      width="17.6"
      height="14"
      rx="2.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="8.6" cy="10" r="1.4" fill="currentColor" />
    <path
      d="M5 17.2l4.6-4.4 3 2.9L16.2 12l2.8 5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
)

export function Toolbar({ editor }: { editor: Editor }) {
  const l = useL()
  const englishHints: Record<string, string> = {
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough',
    highlight: 'Highlight', code: 'Inline code', bullet: 'Bulleted list',
    ordered: 'Numbered list', task: 'Task list', h1: 'Large heading',
    h2: 'Small heading', hr: 'Divider', quote: 'Quote', clear: 'Clear formatting',
  }
  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) {
      try {
        const url = await fileToDataUrl(f)
        editor.chain().focus().setJotImage({ src: url }).run()
      } catch {
        // 跳过读不了的
      }
    }
    e.target.value = ''
  }

  // 任意文件 → 存进 IndexedDB（Blob）→ 正文里只放「📎 文件名」引用节点，点它再取回
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) {
      try {
        const id = await saveFile(f, null)
        editor.chain().focus().setJotFile({ fileId: id, name: f.name }).run()
      } catch {
        // 跳过读不了的
      }
    }
    e.target.value = ''
  }

  return (
    <div
      className="jot-toolbar"
      onMouseDown={(e) => {
        // 保持编辑器焦点，且不要让点击冒泡到 document 导致卡片收起
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {BTNS.map((b) =>
        b.key.startsWith('sep') ? (
          <span key={b.key} className="jot-tb-sep" />
        ) : (
          <button
            key={b.key}
            type="button"
            title={l(b.hint, englishHints[b.key] ?? b.hint)}
            aria-label={l(b.hint, englishHints[b.key] ?? b.hint)}
            aria-pressed={b.active?.(editor) ?? false}
            className={`jot-tb-btn ${b.cls ?? ''} ${b.active?.(editor) ? 'is-active' : ''}`}
            onClick={() => b.run(editor)}
          >
            {b.label}
          </button>
        ),
      )}

      <span className="jot-tb-sep" />
      {/* 回形针：上传任意文件，作为可点击链接插入正文 */}
      <label
        className="jot-tb-btn f-plain"
        title={l('添加文件', 'Add file')}
        aria-label={l('添加文件', 'Add file')}
        onMouseDown={(e) => {
          // 只阻止冒泡，不能 preventDefault —— 否则系统文件选择器打不开
          e.stopPropagation()
        }}
      >
        <input
          type="file"
          multiple
          className="jot-tb-file"
          onChange={onPickFile}
        />
        {paperClipLabel}
      </label>
      <label
        className="jot-tb-btn f-plain"
        title={l('插入图片（也可以直接 Ctrl+V 粘贴截图）', 'Insert image (or paste a screenshot with Ctrl+V)')}
        aria-label={l('插入图片', 'Insert image')}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="jot-tb-file"
          onChange={onPickImage}
        />
        {imageLabel}
      </label>
    </div>
  )
}
