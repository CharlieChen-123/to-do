import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import {
  BUILTIN_TAGS,
  TAG_ROW_PREFIX,
  isTagRow,
  mergeTags,
  setTagRegistry,
  type TagDef,
} from '../lib/tags'

/**
 * 读取当前标签表（内置 + 用户自建 + 覆盖），并把结果同步进 lib/tags 的
 * 模块级注册表 —— 这样 displayColor() / tagLabel() / tagRank() 这些
 * 纯函数也能拿到最新数据（它们被大量组件在 render 里直接调用）。
 *
 * 放在 App 顶层调用一次即可；标签变更后 Dexie 的 liveQuery 会自动重算。
 */
export function useTags(): TagDef[] {
  return useLiveQuery(
    async () => {
      const rows = await db.entries.filter((e) => isTagRow(e)).toArray()
      const list = mergeTags(rows)
      setTagRegistry(list)
      return list
    },
    [],
    BUILTIN_TAGS,
  )
}

/** 非 hook 版本：给同步 / 动作层在需要时主动刷新注册表用 */
export async function refreshTagRegistry(): Promise<TagDef[]> {
  const rows = await db.entries
    .filter((e) => e.id.startsWith(TAG_ROW_PREFIX))
    .toArray()
  const list = mergeTags(rows)
  setTagRegistry(list)
  return list
}
