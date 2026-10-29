import { useEffect, useState } from 'react'
import Icon from '../common/Icon.jsx'

export default function ImportConnectionsDialog({
  open,
  fileName = '',
  busy = false,
  error = null,
  onClose,
  onCancel,
  onImport,
  onConfirm,
}) {
  const handleClose = onClose || onCancel || (() => {})
  const handleImport = onImport || onConfirm || (() => {})
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setShowPassword(false)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!password) return
    handleImport(password)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) handleClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in w-full max-w-sm overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="upload" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Import connections
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              Enter the password used to encrypt this file. Folders are recreated and duplicate
              connection names get a “(new)” prefix.
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={handleClose} disabled={busy}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="border-t border-line px-5 py-4 space-y-3">
          {fileName ? (
            <div className="flex items-center gap-2 rounded-md border border-line bg-panel/40 px-3 py-2 text-[length:var(--app-text-11)] text-text-muted">
              <Icon name="code" size={13} className="shrink-0 text-text-faint" />
              <span className="truncate font-mono">{fileName}</span>
            </div>
          ) : null}

          <div>
            <label className="field-label block" htmlFor="import-password">
              Decryption password
            </label>
            <div className="relative">
              <input
                id="import-password"
                className="field pr-9"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                className="icon-btn absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-[length:var(--app-text-11)] text-danger">{error}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!password || busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  )
}
