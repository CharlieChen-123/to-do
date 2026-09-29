const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const IconToday = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2.5" {...base} />
    <path d="M3 10h18M8 3v4M16 3v4" {...base} />
    <circle cx="12" cy="15.5" r="2.2" fill="currentColor" stroke="none" />
  </svg>
)

export const IconWeek = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" {...base} />
    <path d="M3 9.5h18M7.5 13h2M7.5 17h2M11.5 13h2M11.5 17h2M15.5 13h2M15.5 17h2" {...base} />
  </svg>
)

export const IconMonth = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" {...base} />
    <path d="M3 9.5h18M8 3v3.5M16 3v3.5" {...base} />
    <path
      d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17.5h.01M12 17.5h.01M16.5 17.5h.01"
      {...base}
      strokeWidth={2.4}
    />
  </svg>
)

export const IconInbox = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M3 13h4.5l1.8 2.6h5.4L16.5 13H21" {...base} />
    <path d="M5.2 5h13.6l2.2 8v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13z" {...base} />
  </svg>
)

export const IconDone = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" {...base} />
    <path d="M8 12.4l2.8 2.8L16 9.4" {...base} />
  </svg>
)

export const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" {...base} />
    <path d="M15.8 15.8L20 20" {...base} />
  </svg>
)

/** 经典 8 齿齿轮 —— 一眼能认是设置 */
export const IconSettings = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="3" {...base} />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
      {...base}
    />
  </svg>
)

export const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path
      d="M12 3.8l2.45 5.1 5.6.78-4.06 3.98.97 5.6L12 16.83l-4.96 2.63.97-5.6L3.95 9.68l5.6-.78z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
