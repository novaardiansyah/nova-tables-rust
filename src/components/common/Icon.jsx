const ICONS = {
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7.5 18.5 3 20l1.5-4.5z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M18.5 6l-1 14h-11l-1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 01-14.6 5.9L3.5 15.5" />
      <path d="M3.5 12a8.5 8.5 0 0114.6-5.9L20.5 8.5" />
      <path d="M20.5 3.5v5h-5" />
      <path d="M3.5 20.5v-5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.6 6.6a8 8 0 1010.8 0" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
      <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M9.5 9.5V20" />
    </>
  ),
  procedure: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M9 8h4.5a2.25 2.25 0 010 4.5H9z" />
      <path d="M9 8v8" />
    </>
  ),
  function: (
    <>
      <path d="M15.5 4.5c-2.6 0-3.8 1.6-4.2 4.1L10 16c-.3 1.9-1.2 3-2.9 3" />
      <path d="M9.5 11.5h6" />
    </>
  ),
  play: (
    <>
      <path d="M7.5 4.5l11 7.5-11 7.5z" />
    </>
  ),
  x: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  'more-horizontal': (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M10.3 3.9L1.9 18a2 2 0 001.7 3h16.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  'check-circle': (
    <>
      <path d="M21.5 11.1V12a9.5 9.5 0 11-5.6-8.7" />
      <path d="M21.5 4.5l-9.5 9.4-3-3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5v-5" />
      <path d="M12 8h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M17.9 17.9A10.2 10.2 0 0112 19.5C5.5 19.5 1.5 12.5 1.5 12.5a18.6 18.6 0 014.6-5.4" />
      <path d="M9.6 4.6A10 10 0 0112 4.5c6.5 0 10.5 7 10.5 7a18.4 18.4 0 01-2.6 3.6" />
      <path d="M9.9 9.9a3.2 3.2 0 004.3 4.3" />
      <path d="M2 2l20 20" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14.5 4v16" />
      <path d="M17.8 8h.01M17.8 12h.01M17.8 16h.01" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
      <path d="M6.2 8h.01M6.2 12h.01M6.2 16h.01" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10.5 13.5L19 5" />
      <path d="M16 8l2.5 2.5" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M3 13h18" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3.5 3.5V15h-11v-2.5L10 9z" />
    </>
  ),
  'sort-asc': (
    <>
      <path d="M12 5v11" />
      <path d="M7 13l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  'sort-desc': (
    <>
      <path d="M12 19V8" />
      <path d="M7 11l5-5 5 5" />
      <path d="M5 3h14" />
    </>
  ),
  'sort-idle': (
    <>
      <path d="M8 10l4-4 4 4" />
      <path d="M8 14l4 4 4-4" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 015.2 1c0 1.8-2.6 2.3-2.6 4" />
      <path d="M12 17.3h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09A1.7 1.7 0 009 19.3a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.7 15a1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09A1.7 1.7 0 004.7 9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 4.7a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.09A1.7 1.7 0 0015 4.7a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.3 9v.01a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51.96z" />
    </>
  ),
  code: (
    <>
      <path d="M8.5 8.5L4 12l4.5 3.5" />
      <path d="M15.5 8.5L20 12l-4.5 3.5" />
      <path d="M13.5 5l-3 14" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  bookmark: (
    <>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 018 0v3.5" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </>
  ),
  plan: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M9 6h4a4 4 0 014 4v5" />
      <path d="M6 9v6" />
    </>
  ),
}

export default function Icon({ name, size = 15, className = '', strokeWidth = 1.7 }) {
  const shape = ICONS[name]
  if (!shape) return null

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shape}
    </svg>
  )
}

export function Spinner({ size = 14, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`animate-spin ${className}`}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandMark({ size = 26, className = '' }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nova-brand" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="52" height="48" rx="9" fill="none" stroke="url(#nova-brand)" strokeWidth="4" />
      <path d="M6 24h52" stroke="url(#nova-brand)" strokeWidth="4" />
      <path d="M25 24v32M41 24v32" stroke="url(#nova-brand)" strokeWidth="4" />
    </svg>
  )
}
