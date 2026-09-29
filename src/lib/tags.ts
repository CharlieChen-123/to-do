import type { Entry } from '../types'
import { blankEntry } from './db'

/**
 * 标签（tag）模型
 * ============================================================
 * 「标签」就是原来 UI 上叫「类别 / 分类」的那个东西：卡片右下角的小胶囊、
 * 右键菜单里的标签列表、多选条上的标签按钮，都是它。
 *
 * 之前标签是写死的 8 个（CategoryId 联合类型 + CAT_COLOR 常量 + CSS 里
 * 一堆 [data-cat='xxx'] 规则）。现在改成「内置 8 个 + 用户自建任意个」，
 * 每个标签有 id / 名字 / 颜色。
 *
 * 云端同步的难题与解法
 * ------------------------------------------------------------
 * 远端 Supabase 的 entries 表没有「标签表」，而我们只有 anon key，无法 DDL。
 * 所以用户自建的标签（以及内置标签的改名/改色/删除）都以「哨兵行」形式
 * 存在 entries 表里：
 *
 *     id     = '__tag__<tagId>'
 *     kind   = 'task'
 *     content= JSON {label, color, order}
 *     dateKey= null（所以不会出现在任何一天的列表里）
 *     deleted= 0（删标签时置 1，用软删才能跨设备生效）
 *
 * 这些行会被 useEntries()/useDeletedEntries() 统一过滤掉，UI 永远看不到。
 * 这样标签定义就跟着整表同步走，不需要动远端表结构、也不需要新表。
 */

/** 哨兵行 id 前缀 */
export const TAG_ROW_PREFIX = '__tag__'

/** 兜底标签：永远存在、不可删除（分类失败时落到这里） */
export const FALLBACK_TAG_ID = 'other'

export interface TagDef {
  id: string
  label: string
  /** 十六进制色值，如 #dc2626 */
  color: string
  /** 排序权重，越小越靠前 */
  order: number
  /** 内置标签（可以改名/改色，但删除时只是隐藏，保留定义以便恢复） */
  builtin?: boolean
}

/**
 * 内置标签。id 与历史数据完全一致（老任务的 category 就是这些字符串），
 * 所以升级后不会丢标签。hint 只用于喂给大模型的判断依据。
 */
export const BUILTIN_TAGS: TagDef[] = [
  { id: 'school', label: '学校', color: '#dc2626', order: 0, builtin: true },
  { id: 'club', label: '社团', color: '#7c3aed', order: 1, builtin: true },
  { id: 'diy', label: 'DIY项目', color: '#d97706', order: 2, builtin: true },
  { id: 'health', label: '健康', color: '#16a34a', order: 3, builtin: true },
  { id: 'portfolio', label: '作品集', color: '#2563eb', order: 4, builtin: true },
  { id: 'exam', label: '备考', color: '#ca8a04', order: 5, builtin: true },
  { id: 'admission', label: '升学', color: '#0d9488', order: 6, builtin: true },
  { id: FALLBACK_TAG_ID, label: '其它', color: '#78716c', order: 7, builtin: true },
]

const BUILTIN_LABEL_EN: Record<string, string> = {
  school: 'School', club: 'Club', diy: 'DIY', health: 'Health',
  portfolio: 'Portfolio', exam: 'Exam prep', admission: 'Admissions', other: 'Other',
}

/** 内置标签的 AI 判断依据（用户自建标签没有 hint，就不进提示词） */
export const BUILTIN_HINT: Record<string, string> = {
  school: '课程/作业/提交/复习/论文/小测/校内考试',
  club: '社团活动/社团会议/志愿者活动',
  diy: '硬件制作/焊接/3D打印/组装/通用动手项目',
  health: '运动/就医/体检/睡眠/护眼/作息',
  portfolio: '作品集项目/作品展示/作品集排版与美化',
  exam: '托福/TOEFL/SAT/ACT/AP/标化考试/备考/模考/刷题等标化备考',
  admission: '申请文书/推荐信/个人陈述/本科申请等升学相关',
  other: '以上都不沾边的兜底，不硬塞',
}

/** 新建标签时的候选色（够用且互相区分度高，浅色主题下文字可读） */
export const TAG_PALETTE: string[] = [
  '#dc2626', // 红
  '#ea580c', // 橙
  '#d97706', // 琥珀
  '#ca8a04', // 黄
  '#16a34a', // 绿
  '#0d9488', // 青
  '#0891b2', // 天蓝
  '#2563eb', // 蓝
  '#7c3aed', // 紫
  '#c026d3', // 品红
  '#db2777', // 玫红
  '#78716c', // 灰
]

/**
 * 预设之外的颜色不再由我们提供清单 —— 「更多」弹的是自绘取色面板
 * （见 components/ColorPanel.tsx），任意色相/明度都能拖出来。
 *
 * 唯一要留意的是：标签色会被当作**文字颜色**用在胶囊上（.jot-meta-cat 的
 * color），所以选得太浅在浅色主题下会看不清字。预设的 12 色都是中深色，
 * 就是为这个留的安全区；面板里的颜色由用户自己把握。
 */

/** 合法颜色值：#rgb 或 #rrggbb（自定义取色器与手输 hex 都走这个判定） */
export function isValidHexColor(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())
}

/**
 * 把用户输入的颜色归一成 6 位小写 #rrggbb；不合法返回 null。
 * 3 位简写会展开（#abc → #aabbcc），保证存进标签表的值格式统一。
 */
export function normalizeHexColor(v: string): string | null {
  const s = v.trim()
  if (!isValidHexColor(s)) return null
  const h = s.slice(1).toLowerCase()
  return h.length === 3
    ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
    : `#${h}`
}

/**
 * 历史遗留的标签值：早年有过「日常 / 财务」，后来废弃。
 * 读到就把它们折到「其它」，避免升级后冒出一堆脏标签。
 */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  日常: FALLBACK_TAG_ID,
  daily: FALLBACK_TAG_ID,
  财务: FALLBACK_TAG_ID,
  finance: FALLBACK_TAG_ID,
  其他: FALLBACK_TAG_ID,
}

/* ------------------------------------------------------------------ *
 * 模块级注册表
 * ------------------------------------------------------------------ *
 * displayColor() / tagLabel() 这些是纯函数，被 EntryCard、周/月视图等
 * 大量组件在 render 里直接调用。为了不把「标签表」一路 prop / hook 传下去，
 * 这里放一个模块级注册表：store/tags.ts 在标签数据变化时同步刷新它，
 * 组件只要订阅了那个 store 就会重渲染并拿到新颜色。
 */
let registry: TagDef[] = [...BUILTIN_TAGS]

export function setTagRegistry(list: TagDef[]): void {
  registry = list.length ? list : [...BUILTIN_TAGS]
}

export function getTagRegistry(): TagDef[] {
  return registry
}

/** 按当前注册表里的顺序排序（内置顺序 + 自建追加） */
export function tagList(): TagDef[] {
  return [...registry].sort((a, b) => a.order - b.order)
}

export function findTag(id: string | null | undefined): TagDef | undefined {
  if (!id) return undefined
  return registry.find((t) => t.id === id)
}

/** 标签显示名；未知 id 直接把 id 显示出来（好过显示空白） */
export function tagLabel(id: string | null | undefined, lang: 'zh' | 'en' = 'zh'): string {
  if (!id) return ''
  const tag = findTag(id)
  if (!tag) return id
  const original = BUILTIN_TAGS.find((b) => b.id === id)
  return lang === 'en' && original?.label === tag.label
    ? (BUILTIN_LABEL_EN[id] ?? tag.label)
    : tag.label
}

/** 标签颜色；未知 id 返回 null，由调用方给中性灰兜底 */
export function tagColor(id: string | null | undefined): string | null {
  if (!id) return null
  return findTag(id)?.color ?? null
}

/** 排序权重（决定「同类排一块」的先后；未知排最后） */
export function tagRank(id: string | null | undefined): number {
  if (!id) return -1
  const t = findTag(id)
  return t ? t.order : registry.length + 1
}

export function isKnownTag(id: string | null | undefined): boolean {
  return !!id && registry.some((t) => t.id === id)
}

/** 把历史遗留值折到「其它」，未知值原样返回（自定义标签要能存活） */
export function canonicalTagId(id: string | null | undefined): string | null {
  if (!id) return null
  return LEGACY_CATEGORY_MAP[id] ?? id
}

/* ------------------------------------------------------------------ *
 * 哨兵行的读写
 * ------------------------------------------------------------------ */

export function isTagRow(e: Pick<Entry, 'id'>): boolean {
  return typeof e.id === 'string' && e.id.startsWith(TAG_ROW_PREFIX)
}

export function tagIdFromRow(e: Pick<Entry, 'id'>): string {
  return e.id.slice(TAG_ROW_PREFIX.length)
}

/** 哨兵行 → TagDef；内容坏掉就返回 null（跳过该行，不崩） */
export function parseTagRow(e: Entry): TagDef | null {
  const id = tagIdFromRow(e)
  if (!id) return null
  try {
    const raw = JSON.parse(e.content || '{}') as Partial<TagDef>
    const builtin = BUILTIN_TAGS.some((t) => t.id === id)
    const base = BUILTIN_TAGS.find((t) => t.id === id)
    return {
      id,
      label:
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim()
          : (base?.label ?? id),
      color:
        typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color)
          ? raw.color
          : (base?.color ?? '#78716c'),
      order: typeof raw.order === 'number' ? raw.order : (base?.order ?? 999),
      builtin,
    }
  } catch {
    return null
  }
}

/** TagDef → 哨兵行（用于写入 db.entries 并随同步上云） */
export function buildTagRow(t: TagDef, deleted: 0 | 1 = 0): Entry {
  return blankEntry({
    id: TAG_ROW_PREFIX + t.id,
    kind: 'task',
    content: JSON.stringify({ label: t.label, color: t.color, order: t.order }),
    plainText: t.label,
    dateKey: null,
    category: null,
    deleted,
  })
}

/**
 * 把「内置标签 + 哨兵行覆盖」合并成最终标签表。
 * rows 里 deleted=1 的行 = 该标签被删除（内置标签则是隐藏）。
 */
export function mergeTags(rows: Entry[]): TagDef[] {
  const overrides = new Map<string, { tag: TagDef; deleted: boolean }>()
  for (const r of rows) {
    if (!isTagRow(r)) continue
    const parsed = parseTagRow(r)
    if (!parsed) continue
    overrides.set(parsed.id, { tag: parsed, deleted: r.deleted === 1 })
  }

  const out: TagDef[] = []

  // 内置：没被隐藏就保留（顺序/名字/颜色可被覆盖）
  for (const b of BUILTIN_TAGS) {
    const ov = overrides.get(b.id)
    // 「其它」是兜底标签：不管有没有被标记隐藏都必须在场。
    // （判断顺序很重要 —— 先 continue 掉 deleted 的话它就会被删没，
    //   分类失败的内容就会指向一个不存在的标签。单元测试抓到过这个坑。）
    if (b.id === FALLBACK_TAG_ID) {
      out.push({ ...b, ...(ov ? { label: ov.tag.label, color: ov.tag.color } : {}) })
      continue
    }
    if (ov?.deleted) continue
    out.push(ov ? { ...b, label: ov.tag.label, color: ov.tag.color } : { ...b })
  }

  // 自建：不在内置里、且没被删的
  for (const [id, ov] of overrides) {
    if (ov.deleted) continue
    if (BUILTIN_TAGS.some((b) => b.id === id)) continue
    out.push({ ...ov.tag, order: ov.tag.order ?? 999 })
  }

  out.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  return out
}

/** 生成一个不与现有标签冲突的新 id */
export function newTagId(existing: TagDef[]): string {
  const used = new Set(existing.map((t) => t.id))
  let i = 1
  // t1, t2, ... 简单可读，也不会撞上内置 id
  while (used.has(`t${i}`)) i++
  return `t${i}`
}
