import { useEffect, useState, FormEvent } from 'react'
import Icon from '../common/Icon'

export interface DropDatabaseDialogProps {
  open: boolean
  database: string
  connectionName: string
  server: string
  error?: string | null
  busy?: boolean
  onCancel?: () => void
  onClose?: () => void
  onConfirm: (databaseName: string) => void
}

export default function DropDatabaseDialog({
  open,
  database,
  connectionName,
  server,
  error = null,
  busy = false,
  onCancel,
  onClose,
  onConfirm,
}: DropDatabaseDialogProps) {
  const handleCancel = onCancel || onClose || (() => {})
  const [typed, setTyped] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (!open) return
    setTyped('')
    setAcknowledged(false)
  }, [open, database])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) handleCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, handleCancel])

  if (!open) return null

  const matches = typed.trim() === database
  const ready = matches && acknowledged && !busy

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (ready) onConfirm(typed.trim())
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
        className="animate-fade-in w-full max-w-lg overflow-hidden rounded-xl border border-danger/40 bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
            <Icon name="trash" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Drop database
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              This permanently deletes the database and everything inside it.
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
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-danger">
            <Icon name="alert-triangle" size={13} className="mt-px shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="mt-1">
                You are about to drop{' '}
                <span className="font-mono font-semibold">{database}</span>. All tables, data,
                functions, stored procedures, users and permissions in this database will be
                deleted.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[length:var(--app-text-11)] text-text-muted">
            <Icon name="database" size={12} className="shrink-0 text-danger" />
            <span className="truncate font-medium text-text-soft">{connectionName}</span>
            <span className="text-text-faint">/</span>
            <span className="truncate">{server}</span>
          </div>

          <label
            htmlFor="drop-database-acknowledged"
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-panel px-3 py-2.5 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+6px)] text-text-soft"
          >
            <input
              id="drop-database-acknowledged"
              type="checkbox"
              checked={acknowledged}
              disabled={busy}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--color-danger))]"
            />
            <span>I understand that this database and all of its data will be permanently deleted.</span>
          </label>

          <div>
            <label className="field-label block" htmlFor="drop-database-name">
              Type{' '}
              <span className="font-mono normal-case tracking-normal text-text-soft">{database}</span>{' '}
              to confirm
            </label>
            <input
              id="drop-database-name"
              className="field font-mono"
              value={typed}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              placeholder={database}
              onChange={(event) => setTyped(event.target.value)}
            />
            {typed && !matches ? (
              <p className="mt-2 flex items-start gap-1.5 text-[length:var(--app-text-11)] text-danger">
                <Icon name="alert-triangle" size={11} className="mt-px shrink-0" />
                <span>The name must match exactly, including letter case.</span>
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 text-[length:var(--app-text-11)] text-text-faint">
                <Icon name="lock" size={11} className="mt-px shrink-0" />
                <span>Open connections to this database can block the drop.</span>
              </p>
            )}
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
          <button type="submit" className="btn-danger" disabled={!ready}>
            {busy ? 'Dropping…' : 'Drop database'}
          </button>
        </div>
      </form>
    </div>
  )
}
