import type { CategoryId } from '../types'
import {
  BUILTIN_HINT,
  BUILTIN_TAGS,
  FALLBACK_TAG_ID,
  canonicalTagId,
  getTagRegistry,
  tagColor,
  tagLabel,
  tagRank,
} from './tags'

/**
 * 标签的兼容层
 * ============================================================
 * 历史包袱说明：这个文件以前叫「分类（category）」，标签是写死的 8 个。
 * 现在标签可以用户自建了，真正的模型在 lib/tags.ts。
 *
 * 这里保留旧名字的导出，一是为了让 EntryCard / 视图等一堆调用点不用大改，
 * 二是为了保证老数据（category = 'school' 等）语义不变。
 * 想改标签逻辑请去 lib/tags.ts；这个文件只做「读注册表 + 给旧名字」。
 */

/** 兼容旧类型名 */
export interface CategoryDef {
  id: CategoryId
  label: string
  hint: string
}

/** 内置标签（含 AI 提示用的 hint）。UI 里的完整标签表请用 store/tags 的 useTags()。 */
export const CATEGORIES: CategoryDef[] = BUILTIN_TAGS.map((t) => ({
  id: t.id,
  label: t.label,
  hint: BUILTIN_HINT[t.id] ?? '',
}))

/** 旧的固定顺序（保留导出，实际排序走 tagRank） */
export const CATEGORY_ORDER: CategoryId[] = BUILTIN_TAGS.map((t) => t.id)

/** 内置标签的默认色（保留导出；实际取色走 displayColor / tagColor） */
export const CAT_COLOR: Record<CategoryId, string> = BUILTIN_TAGS.reduce(
  (m, t) => {
    m[t.id] = t.color
    return m
  },
  {} as Record<CategoryId, string>,
)

/**
 * 标签 id → 显示名。
 * 用 Proxy 而不是普通对象，这样它跟着标签注册表动态变化：
 * 用户改名 / 自建标签后，老调用点 `CATEGORY_LABEL[x]` 立刻拿到新名字。
 */
export const CATEGORY_LABEL: Record<CategoryId, string> = new Proxy(
  {} as Record<CategoryId, string>,
  {
    get: (_t, key) => (typeof key === 'string' ? tagLabel(key) : ''),
    has: () => true,
    ownKeys: () => getTagRegistry().map((t) => t.id),
    getOwnPropertyDescriptor: () => ({
      enumerable: true,
      configurable: true,
      value: '',
    }),
  },
)

/** 标签在列表里的排序权重（未分类排最前，避免插进「学校」组里打乱） */
export function categoryRank(c: CategoryId | null | undefined): number {
  return tagRank(c)
}

/**
 * 显示色：始终返回标签自身的颜色（手动 color 字段已废弃）。
 * 未知标签返回 null，由调用方兜底到中性灰。
 */
export function displayColor(e: {
  category?: CategoryId | null
}): string | null {
  return tagColor(e.category)
}

/**
 * 把模型返回的自由文本归一化成合法标签 id（含中英、别名、用户自建标签名）。
 * 认不出来就落到「其它」——不要硬塞。
 */
export function normalizeCategory(s: unknown): CategoryId {
  if (typeof s !== 'string') return FALLBACK_TAG_ID
  const t = s.trim()
  if (!t) return FALLBACK_TAG_ID

  // 1) 已经是合法 id（内置或自建）→ 直接用
  const exact = getTagRegistry().find((x) => x.id === t)
  if (exact) return exact.id

  // 2) 命中标签的显示名 → 转成 id（自建标签也能被模型认出来）
  const byLabel = getTagRegistry().find((x) => x.label === t)
  if (byLabel) return byLabel.id

  // 3) 历史别名 / 中英对照
  const lower = t.toLowerCase()
  const alias: Record<string, CategoryId> = {
    school: 'school',
    学校: 'school',
    club: 'club',
    社团: 'club',
    diy: 'diy',
    diy项目: 'diy',
    健康: 'health',
    health: 'health',
    portfolio: 'portfolio',
    作品集: 'portfolio',
    exam: 'exam',
    备考: 'exam',
    admission: 'admission',
    升学: 'admission',
    other: 'other',
    其它: 'other',
    其他: 'other',
  }
  const hit = alias[lower] ?? alias[t]
  if (hit && getTagRegistry().some((x) => x.id === hit)) return hit

  // 4) 历史脏值（日常/财务等）
  const legacy = canonicalTagId(t)
  if (legacy && getTagRegistry().some((x) => x.id === legacy)) return legacy

  return FALLBACK_TAG_ID
}

/**
 * 拼进 organize 系统提示的标签规则。
 * 是个函数（不是常量）—— 因为用户可能随时自建/改名标签，
 * 每次调用都要按当前标签表生成，模型才能用上新标签。
 */
export function categoryRule(): string {
  const list = getTagRegistry()
  const parts = list.map((t) => {
    const hint = BUILTIN_HINT[t.id]
    return hint ? `「${t.label}」(${hint})` : `「${t.label}」`
  })
  return `9. category：为每条判断一个标签，只能是以下之一：${parts.join('、')}。拿不准或都不沾边就填「${
    list.find((t) => t.id === FALLBACK_TAG_ID)?.label ?? '其它'
  }」，不要硬塞进其它类。`
}
