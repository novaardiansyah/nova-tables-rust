import { useEffect } from 'react'
import Icon from '@/components/common/Icon'

export interface DatabaseSwitchDialogProps {
  open: boolean
  fromDatabase: string | null
  toDatabase: string
  onCancel: () => void
  onCloseAllTabs: () => void
  onKeepOpenTabs: () => void
}

export default function DatabaseSwitchDialog({
  open,
  fromDatabase,
  toDatabase,
  onCancel,
  onCloseAllTabs,
  onKeepOpenTabs,
}: DatabaseSwitchDialogProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md animate-fade-in rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="database" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Switch database
            </h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              {fromDatabase
                ? `Switching from “${fromDatabase}” to “${toDatabase}”. Choose how to handle your open query tabs:`
                : `Switching to “${toDatabase}”. Choose how to handle your open query tabs:`}
            </p>
            <ul className="mt-2.5 space-y-1.5 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+6px)] text-text-soft">
              <li>
                <span className="font-medium text-text-strong">Close All Tabs:</span> Close all open tabs and load tabs saved for “{toDatabase}”.
              </li>
              <li>
                <span className="font-medium text-text-strong">Keep Open Tabs:</span> Keep your open tabs, save them to “{toDatabase}”, and load any tabs previously saved there.
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onCloseAllTabs}>
            Close All Tabs
          </button>
          <button type="button" className="btn-primary" onClick={onKeepOpenTabs}>
            Keep Open Tabs
          </button>
        </div>
      </div>
    </div>
  )
}
