import { Component, type ReactNode } from 'react'
import { useSettings } from '../store/settings'

interface Props {
  children: ReactNode
  /** 出错时显示的标题 */
  label?: string
}

interface State {
  error: Error | null
  stack: string
}

/**
 * 全局错误边界：任何子树渲染抛错都不会再导致整页白屏，
 * 而是显示可恢复的错误卡片（并保留「重试」按钮）。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: (error as Error & { stack?: string }).stack ?? '' }
  }

  componentDidCatch(error: Error, info: unknown) {
    // 打印到控制台，方便排查真实崩溃点（info.componentStack 含组件路径）
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info)
  }

  private reset = () => this.setState({ error: null, stack: '' })

  render() {
    if (this.state.error) {
      const en = useSettings.getState().lang === 'en'
      // 只取组件栈里最有用的几行（去掉 React 内部帧），便于截图定位
      const compStack =
        (this.state.stack || '')
          .split('\n')
          .filter((l) => /at\s+\w/.test(l) || l.includes('EntryCard') || l.includes('Editor') || l.includes('Meta') || l.includes('Toolbar'))
          .slice(0, 6)
          .join('\n') || ''
      return (
        <div className="jot-error-boundary" role="alert">
          <h3>{en ? 'Something went wrong here' : '这个区域出错了'}</h3>
          {this.props.label ? <p className="jot-error-label">{en ? 'Location: ' : '位置：'}{this.props.label}</p> : null}
          <p className="jot-error-msg">{this.state.error.message || String(this.state.error)}</p>
          {compStack ? <pre className="jot-error-stack">{compStack}</pre> : null}
          <button type="button" className="jot-text-btn" onClick={this.reset}>
            {en ? 'Retry' : '重试'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
