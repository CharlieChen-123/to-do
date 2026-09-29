import { useEffect, useState } from 'react'
import { TAG_PALETTE, normalizeHexColor } from '../lib/tags'
import { ColorPanel } from './ColorPanel'
import { useL } from '../i18n'

/**
 * 标签取色器
 * ============================================================
 * 两层：
 *   1) 12 个预设色 —— 点一下立即生效（覆盖绝大多数场景）
 *   2) 「更多」→ 展开自绘的 ColorPanel，任意颜色自己挑
 *
 * 为什么预设色保持「点一下立即生效」而面板里的色要按「应用」：
 * 预设色是一次性、离散、误触代价低的动作；面板是连续拖拽，路径中间会经过
 * 大量用户并不想要的颜色，如果边拖边写库，既会刷爆 updatedAt（连带触发
 * 同步），也会让「拖到一半手滑松手」直接改掉已有标签的颜色。
 */
interface Props {
  /** 当前颜色（#rrggbb 小写） */
  value: string
  /** 提交颜色。调用方负责写库 / 收起弹层 */
  onChange: (color: string) => void
  /** 紧凑模式：用在「新增标签」那一行（无外层弹层） */
  compact?: boolean
}

export function TagColorPicker({ value, onChange, compact = false }: Props) {
  const l = useL()
  const [more, setMore] = useState(false)

  // 拿到的不是预设色（说明是之前自定义的）→ 默认展开面板，
  // 让用户一眼看到这个色是从哪个面板来的，而不是以为色块丢了。
  useEffect(() => {
    if (!TAG_PALETTE.includes(normalizeHexColor(value) ?? value)) setMore(true)
  }, [value])

  return (
    <>
      <div className={`jot-tagmgr-palette ${compact ? 'is-inline' : ''}`}>
        {TAG_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`jot-tagmgr-color ${value === c ? 'is-on' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={l(`用颜色 ${c}`, `Use color ${c}`)}
            onClick={() => onChange(c)}
          />
        ))}
        <button
          type="button"
          className={`jot-tagmgr-more ${more ? 'is-open' : ''}`}
          title={more ? l('收起颜色面板', 'Close color panel') : l('更多颜色', 'More colors')}
          aria-label={more ? l('收起颜色面板', 'Close color panel') : l('更多颜色', 'More colors')}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {l('更多', 'More')}
        </button>
      </div>

      {more && <ColorPanel value={value} onChange={onChange} live={compact} />}
    </>
  )
}
