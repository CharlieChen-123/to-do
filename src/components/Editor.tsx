import { useCallback, useEffect, useRef } from 'react'
import {
  EditorContent,
  useEditor,
  type Editor as TiptapEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { JotImage } from '../lib/tiptap-image'
import { JotFile } from '../lib/tiptap-file'
import { openFile } from '../lib/fileStore'
import { fileToDataUrl, pickImageFiles } from '../lib/image'

interface Props {
  initialContent: string
  placeholder?: string
  autofocus?: boolean
  onChange: (html: string, text: string) => void
  onReady?: (editor: TiptapEditor) => void
  onEscape?: () => void
  onSubmit?: () => void
}

export function Editor({
  initialContent,
  placeholder = '写点什么…',
  autofocus = false,
  onChange,
  onReady,
  onEscape,
  onSubmit,
}: Props) {
  const editorRef = useRef<TiptapEditor | null>(null)

  const insertFiles = useCallback(async (files: File[]) => {
    for (const f of files) {
      try {
        const url = await fileToDataUrl(f)
        editorRef.current?.chain().focus().setJotImage({ src: url }).run()
      } catch {
        // 单张失败不打断其余
      }
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      JotImage,
      JotFile,
    ],
    content: initialContent || '',
    autofocus,
    editorProps: {
      attributes: { class: 'jot-prose' },
      // 微信笔记那种「截图直接 Ctrl+V 贴进正文」
      handlePaste: (_view, event) => {
        const files = pickImageFiles(event.clipboardData ?? null)
        if (files.length) {
          event.preventDefault()
          void insertFiles(files)
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = pickImageFiles(event.dataTransfer ?? null)
        if (files.length) {
          event.preventDefault()
          void insertFiles(files)
          return true
        }
        return false
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' && onEscape) {
          onEscape()
          return true
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
          onSubmit()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML(), e.getText()),
    // React 18 StrictMode 下 useEditor 会双挂载，第二次挂载时 ProseMirror 的
    // view.dom 可能为 null，某个 plugin 在坐标计算时调用 getBoundingClientRect()
    // 会抛「Cannot read properties of null (reading 'getBoundingClientRect')」。
    // immediatelyRender:false 让首帧跳过渲染，规避该竞态（@tiptap/react 官方解法）。
    immediatelyRender: false,
  })

  useEffect(() => {
    editorRef.current = editor ?? null
    if (editor && onReady) onReady(editor)
  }, [editor, onReady])

  if (!editor) return <div className="jot-editor" />

  // 点正文里的 📎 文件引用 → 打开 / 下载（从 IndexedDB 取 Blob）
  const onProseClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a.jot-file')
    if (a) {
      e.preventDefault()
      const id = a.getAttribute('data-file-id')
      if (id) void openFile(id)
    }
  }

  return (
    <div className="jot-editor" onClick={onProseClick}>
      <EditorContent editor={editor} className="jot-editor" />
    </div>
  )
}
