import { Node, mergeAttributes } from '@tiptap/core'

/**
 * 正文里的文件引用节点：内联原子节点，渲染成「📎 文件名」可点击链接。
 * 真正的内容存在 IndexedDB（fileStore），这里只存 fileId。
 */
export interface FileNodeOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    jotFile: {
      setJotFile: (options: { fileId: string; name: string }) => ReturnType
    }
  }
}

export const JotFile = Node.create<FileNodeOptions>({
  name: 'jotFile',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-file-id'),
        renderHTML: (attrs) =>
          attrs.fileId ? { 'data-file-id': attrs.fileId as string } : {},
      },
      name: {
        default: '',
        parseHTML: (el) => el.textContent?.replace(/^📎\s*/, '') ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-file-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'jot-file',
        title: '点击打开 / 下载',
      }),
      `📎 ${node.attrs.name as string}`,
    ]
  },

  addCommands() {
    return {
      setJotFile:
        (options) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    }
  },
})
