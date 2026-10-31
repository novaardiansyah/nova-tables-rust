import { useEffect, useState, FormEvent } from 'react'
import Icon from '@/components/common/Icon'

export interface CreateDatabaseDialogProps {
  open: boolean
  connectionName: string
  server: string
  driverType?: string | null
  error?: string | null
  busy?: boolean
  onCancel?: () => void
  onClose?: () => void
  onConfirm: (databaseName: string) => void
}

export default function CreateDatabaseDialog({
  open,
  connectionName,
  server,
  driverType,
  error = null,
  busy = false,
  onCancel,
  onClose,
  onConfirm,
}: CreateDatabaseDialogProps) {
  const handleCancel = onCancel || onClose || (() => {})
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) handleCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, handleCancel])

  if (!open) return null

  const trimmed = name.trim()
  const ready = Boolean(trimmed) && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (ready) onConfirm(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) handleCancel()
      }}
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="database" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              New database
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              Creates an empty {driverType === 'mysql' ? 'MySQL' : 'SQL Server'} database on this
              server.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={handleCancel}
            disabled={busy}
            title="Close"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="space-y-4 border-t border-line px-5 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[length:var(--app-text-11)] text-text-muted">
            <Icon name="database" size={12} className="shrink-0 text-accent" />
            <span className="truncate font-medium text-text-soft">{connectionName}</span>
            <span className="text-text-faint">/</span>
            <span className="truncate">{server}</span>
          </div>

          <div>
            <label className="field-label block" htmlFor="create-database-name">
              Database name
            </label>
            <input
              id="create-database-name"
              className="field font-mono"
              value={name}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              placeholder="nova_database"
              onChange={(event) => setName(event.target.value)}
            />
            <p className="mt-2 flex items-start gap-1.5 text-[length:var(--app-text-11)] text-text-faint">
              <Icon name="info" size={11} className="mt-px shrink-0" />
              <span>The database name must be unique on this server.</span>
            </p>
          </div>

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!ready}>
            {busy ? 'Creating…' : 'Create database'}
          </button>
        </div>
      </form>
    </div>
  )
}