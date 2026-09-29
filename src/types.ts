export type EntryKind = 'task' | 'event'

/**
 * 标签 id。内置 8 个（school/club/diy/health/portfolio/exam/admission/other）
 * 定义在 lib/tags.ts 的 BUILTIN_TAGS；用户还可以自建任意标签，
 * 所以这里是开放的 string，不再是固定联合类型。
 */
export type CategoryId = string

export interface Entry {
  id: string
  kind: EntryKind
  /** Tiptap HTML 富文本内容 */
  content: string
  /** 纯文本，用于搜索与列表预览 */
  plainText: string

  /** task: 是否完成 */
  done: boolean
  doneAt?: string

  /** 星标：置顶到列表最前 */
  starred: boolean

  /** event: 开始 / 结束时间 ISO 字符串 */
  startAt?: string
  endAt?: string
  allDay: boolean
  /** event: 是否待定 */
  tentative: boolean

  /** 归属日期 YYYY-MM-DD（task 为日期，event 为发生日） */
  dateKey: string | null

  /**
   * 字段仅作为 Supabase「color」列的本地占位：颜色早已改由标签推导（见 lib/tags.ts），
   * UI 不提供手动改色，本地恒为 null。云端那一列被复用为附属元数据的载体
   * （多日重复 / 软删时刻 / 墓碑，见 **lib/meta.ts** 的 encodeMeta / decodeMeta），
   * 本地不再读写它的颜色语义。老数据带 color 的会在下次 syncOnce() 被覆盖为 null。
   */
  color: string | null
  /** 自动分类得到的类别，null = 未分类（用类型默认色） */
  category: CategoryId | null

  createdAt: string
  updatedAt: string
  /** 排序权重，越小越靠前 */
  order: number
  /** 软删除标记，同步需要 */
  deleted: 0 | 1

  /**
   * 被丢进回收站的时刻（ISO）。回收站的 30 天保留期以它为准。
   *
   * 为什么不用 updatedAt 算：软删之后这条记录还可能被改动 —— 例如删除某个
   * 标签时，回收站里用到它的条目会被改写成「其它」，updatedAt 就被刷新了。
   * 那样会把保留期无限往后推，30 天永远等不到。所以单独记一个不可变的时间戳。
   *
   * 云端载体是 color 列的附属元数据（见 lib/meta.ts 的 `del:` 载荷），
   * 老版本客户端读到不认识的前缀会安全忽略，不会影响删除状态的同步。
   */
  deletedAt?: string

  /**
   * 「彻底删除」墓碑。本地行仍然保留（deleted=1），但内容已被清空，
   * UI（回收站）也不展示 —— 因为全量同步会把远端仍存在的行重新拉回本地，
   * 所以真正删行会让它"复活"。保留墓碑才能让删除跨设备、跨重启生效。
   * 云端载体是 color 列的 'purged:1' 标记（见 lib/meta.ts）。
   */
  purged?: boolean

  /** 标记为每日重复任务：每天都会出现，直到被划掉一次 */
  recurring?: 'daily'
  /** 重复任务是否在周/月视图也显示，默认 true */
  recurringShowInWeekMonth?: boolean
  /** 重复到某天为止（YYYY-MM-DD，含当天）。设了就只在这一天（含）之前每天出现 */
  recurringUntil?: string | null
}

export type ViewId = 'today' | 'week' | 'month'
