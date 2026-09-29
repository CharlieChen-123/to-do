import { createPortal } from 'react-dom'
import { useUi } from '../store/ui'
import { useL } from '../i18n'

export function Toasts() {
  const l = useL()
  const toasts = useUi((s) => s.toasts)
  const remove = useUi((s) => s.removeToast)

  if (!toasts.length) return null

  return createPortal(
    <div className="jot-toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const a = t.action
        return (
          <div key={t.id} className="jot-toast">
            {a ? (
              <>
                <span className="jot-toast-text">{t.text}</span>
                <button
                  type="button"
                  className="jot-toast-btn"
                  onClick={async () => {
                    await a.onClick()
                    remove(t.id)
                  }}
                >
                  {a.label}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="jot-toast-text"
                onClick={() => remove(t.id)}
                aria-label={l('关闭提示', 'Dismiss notification')}
              >
                {t.text}
              </button>
            )}
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
