import { useEffect, useState } from 'react'
import Icon from '../common/Icon.jsx'

export default function SaveQueryDialog({
  open,
  initialName,
  connectionName,
  database,
  existingNames = [],
  error = null,
  busy = false,
  onCancel,
  onClose,
  onSave,
}) {
  const handleCancel = onCancel || onClose || (() => {})
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName(initialName ?? '')
  }, [open, initialName])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) handleCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, handleCancel])

  if (!open) return null

  const trimmed = name.trim()
  const conflict = trimmed
    ? existingNames.find((item) => item.toLowerCase() === trimmed.toLowerCase())
    : null

  const submit = (event) => {
    event.preventDefault()
    if (trimmed) onSave(trimmed)
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
        className="animate-fade-in w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="bookmark" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">Save query</h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              Keep the active tab as a reusable query.
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={handleCancel} disabled={busy} title="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="space-y-4 border-t border-line px-5 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[length:var(--app-text-11)] text-text-muted">
            <Icon name="database" size={12} className="shrink-0 text-accent" />
            <span className="truncate font-medium text-text-soft">{connectionName}</span>
            <span className="text-text-faint">/</span>
            <span className="truncate">{database}</span>
          </div>

          <div>
            <label className="field-label block" htmlFor="save-query-name">
              Query name
            </label>
            <input
              id="save-query-name"
              className="field"
              value={name}
              autoFocus
              maxLength={120}
              placeholder="e.g. Monthly revenue by region"
              onChange={(event) => setName(event.target.value)}
            />
            {conflict ? (
              <p className="mt-2 flex items-start gap-1.5 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-warning">
                <Icon name="alert-triangle" size={11} className="mt-px shrink-0" />
                <span>
                  A saved query named “{conflict}” already exists here. Saving replaces its SQL.
                </span>
              </p>
            ) : null}
            {error ? (
              <p className="mt-2 text-[length:var(--app-text-11)] text-danger">{error}</p>
            ) : null}
          </div>

          <p className="flex items-start gap-1.5 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-text-faint">
            <Icon name="lock" size={11} className="mt-px shrink-0" />
            <span>Only available while this connection and database are open.</span>
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!trimmed || busy}>
            {busy ? 'Saving…' : conflict ? 'Replace' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
