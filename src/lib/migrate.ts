import type { CategoryId, Entry } from '../types'
import { db, getMeta, setMeta } from './db'
import { isTagRow } from './tags'

/**
 * 分类重组织一次性迁移（catReorgV1）。
 *
 * 背景：用户把旧的「财务 / 日常」两个标签删掉，换成「作品集 / 备考 / 升学」三类，
 * 并要求把现有任务按内容重归类：
 *   - 坐垫 / 折纸 / 显微镜 / 折纸网站 等动手项目           → 作品集 (portfolio)
 *   - 文书 / UIUC / 美本申请 / 本科申请 / 推荐信 / 个人陈述 → 升学   (admission)
 *   - 托福 / TOEFL / SAT / ACT / AP / 标化 / 备考 / 模考 / 刷题 / 考试 → 备考 (exam)
 *   - 旧「财务 / 日常」标签的任务（上面没命中）            → 其它   (other)
 *
 * 规则按优先级从上往下匹配，命中即停止；都不命中则保持原类别不动。
 * 用 meta 表里的 catReorgV1 标记保证只跑一次。
 */
const MIGRATION_KEY = 'catReorgV1'

function stripHtml(html?: string): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ')
}

function decideCategory(e: Entry): CategoryId | null {
  const text = `${e.plainText || ''} ${stripHtml(e.content)}`.toLowerCase()

  // 1) 作品集：坐垫 / 折纸 / 显微镜 / 折纸网站 等动手项目
  if (
    /(坐垫|智能坐垫|smart\s*cushion|cushion|ctb|防久坐|久坐|折纸|origami|显微镜|作品集)/.test(
      text,
    )
  ) {
    return 'portfolio'
  }
  // 2) 升学：文书 / 申请 / UIUC / 美本申请
  if (
    /(文书|uc\s*prompt|申请文书|推荐信|个人陈述|uiuc|升学|美本申请|本科申请|申请)/.test(
      text,
    )
  ) {
    return 'admission'
  }
  // 3) 备考：标化 / 托福 / SAT / 各种考试
  if (/(托福|toefl|sat|act|ap\b|标化|备考|模考|刷题|考试)/.test(text)) {
    return 'exam'
  }
  // 4) 旧的财务 / 日常 → 其它（前面没命中任何新类别时）
  //    注意：这两个 id 已从 CategoryId 联合类型中移除，但历史数据里仍可能存在，
  //    所以先按字符串比较，避免 TS 报「无重叠」。
  const legacy = String(e.category)
  if (legacy === 'finance' || legacy === 'daily') {
    return 'other'
  }
  return e.category
}

export interface MigrationReport {
  ran: boolean
  changed: number
  at: string | null
}

/** 在 App 挂载时调用一次；已跑过则直接跳过。返回报告便于调试。 */
export async function runCategoryMigration(): Promise<MigrationReport> {
  const flag = await getMeta(MIGRATION_KEY)
  if (flag) {
    try {
      const parsed = JSON.parse(flag) as { changed?: number; at?: string }
      return { ran: false, changed: parsed.changed ?? 0, at: parsed.at ?? null }
    } catch {
      return { ran: false, changed: 0, at: null }
    }
  }

  const all = await db.entries.toArray()
  let changed = 0
  for (const e of all) {
    if (e.deleted) continue
    // 标签哨兵行不是用户内容，别去改它的 category / updatedAt
    if (isTagRow(e)) continue
    const next = decideCategory(e)
    if (next && next !== e.category) {
      await db.entries.update(e.id, {
        category: next,
        updatedAt: new Date().toISOString(),
      })
      changed++
    }
  }

  const at = new Date().toISOString()
  await setMeta(MIGRATION_KEY, JSON.stringify({ changed, at }))
  // 开发期可见；生产环境无副作用
  console.info(`[jot] 分类迁移完成：重新归类 ${changed} 条任务`)
  return { ran: true, changed, at }
}
