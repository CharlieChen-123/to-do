import { Node, mergeAttributes } from '@tiptap/core'

/**
 * 最小可用的图片节点（自己写，不额外装 @tiptap/extension-image）。
 * 块级、可拖拽，支持 base64 内嵌 —— 微信笔记那种「截图直接贴在正文里」。
 */
export interface ImageOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    jotImage: {
      setJotImage: (options: { src: string; alt?: string }) => ReturnType
    }
  }
}

export const JotImage = Node.create<ImageOptions>({
  name: 'jotImage',
  group: 'block',
  draggable: true,
  atom: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addCommands() {
    return {
      setJotImage:
        (options) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: options }),
    }
  },
})
