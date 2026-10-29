import { useEffect } from 'react'
import Icon from '@/components/common/Icon'

export interface ShortcutGroupItem {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutGroupItem[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Workspace',
    items: [
      { keys: ['Ctrl', 'W'], label: 'Close the active tab' },
      { keys: ['Ctrl', 'T'], label: 'Open a new query tab' },
      { keys: ['Ctrl', 'Tab'], label: 'Next tab' },
      { keys: ['Ctrl', 'Shift', 'Tab'], label: 'Previous tab' },
      { keys: ['Ctrl', '1…9'], label: 'Jump to tab by position' },
    ],
  },
  {
    title: 'Query',
    items: [
      { keys: ['Ctrl', '↵'], label: 'Run the selected SQL, or the whole tab' },
      { keys: ['F5'], label: 'Run the selected SQL, or the whole tab' },
      { keys: ['Ctrl', 'S'], label: 'Save the active tab, or update it when already saved' },
      { keys: ['Ctrl', 'R'], label: 'Re-run the last executed query on the active tab' },
    ],
  },
  {
    title: 'Connections',
    items: [
      { keys: ['Ctrl', 'O'], label: 'Open the connections list' },
      { keys: ['Ctrl', 'N'], label: 'Open the new connection dialog' },
    ],
  },
  {
    title: 'Help',
    items: [
      { keys: ['Ctrl', ','], label: 'Open preferences' },
      { keys: ['F1'], label: 'Toggle this panel' },
    ],
  },
]

export interface ShortcutPanelSession {
  serverName?: string
  serverVersion?: string
  edition?: string
  [key: string]: unknown
}

export interface ShortcutPanelProps {
  open: boolean
  onClose: () => void
  session?: ShortcutPanelSession | null
}

export default function ShortcutPanel({ open, onClose, session }: ShortcutPanelProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg animate-fade-in rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <Icon name="question" size={15} className="text-accent" />
          <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">Keyboard shortcuts</h2>
          <button type="button" className="icon-btn ml-auto h-6 w-6" title="Close" onClick={onClose}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              <p className="mb-2 text-[length:var(--app-text-10)] font-semibold uppercase tracking-wider text-text-faint">
                {group.title}
              </p>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.label + item.keys.join()} className="flex items-center gap-3">
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key) => (
                        <span key={key} className="kbd">
                          {key}
                        </span>
                      ))}
                    </span>
                    <span className="text-[length:var(--app-text-12)] text-text-soft">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-1 space-y-2 border-t border-line pt-3">
            {session ? (
              <p className="flex items-start gap-1.5 text-[length:var(--app-text-11)] text-text-faint">
                <Icon name="server" size={10} className="mt-0.5 shrink-0" />
                <span className="truncate">
                  {[
                    session.serverName,
                    session.serverVersion ? `SQL Server ${session.serverVersion}` : null,
                    session.edition,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </p>
            ) : null}
            <p className="text-[length:var(--app-text-11)] text-text-faint">
              In the editor, Monaco keeps its own keys, so Ctrl+F, Ctrl+D and friends still work there.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
