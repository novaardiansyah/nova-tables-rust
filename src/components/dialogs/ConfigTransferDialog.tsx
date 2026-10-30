import React, { useEffect, useState, FormEvent } from 'react'
import Icon from '@/components/common/Icon'

export type ConfigTransferMode = 'export' | 'import'

export interface ConfigTransferDialogProps {
  open: boolean
  mode: ConfigTransferMode
  fileName?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onChooseFile?: () => void
  onSubmit: (password: string) => void
}

export default function ConfigTransferDialog({
  open,
  mode,
  fileName = '',
  busy = false,
  error = null,
  onClose,
  onChooseFile,
  onSubmit,
}: ConfigTransferDialogProps) {
  const exporting = mode === 'export'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setLocalError(null)
  }, [open, mode])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!exporting && !fileName) {
      setLocalError('Choose a configuration file to import.')
      return
    }
    if (!password) {
      setLocalError(exporting ? 'Password is required to encrypt the file.' : 'Password is required to decrypt the file.')
      return
    }
    if (exporting && password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }
    setLocalError(null)
    onSubmit(password)
  }

  const message = error || localError

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name={exporting ? 'download' : 'upload'} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              {exporting ? 'Export configuration' : 'Import configuration'}
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              {exporting
                ? 'Preferences, saved connections, and folders will be encrypted with your password.'
                : 'Preferences and saved connections from the file will be applied. Existing connections are kept.'}
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={onClose} disabled={busy}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {exporting ? null : fileName ? (
            <div className="flex items-center gap-2 rounded-md border border-line bg-panel/40 px-3 py-2 text-[length:var(--app-text-11)] text-text-muted">
              <Icon name="code" size={13} className="shrink-0 text-text-faint" />
              <span className="min-w-0 flex-1 truncate font-mono">{fileName}</span>
              <button
                type="button"
                className="btn-ghost h-6 shrink-0 px-2 text-[length:var(--app-text-11)]"
                onClick={onChooseFile}
                disabled={busy}
              >
                Change
              </button>
            </div>
          ) : (
            <button type="button" className="btn-soft w-full" onClick={onChooseFile} disabled={busy}>
              <Icon name="upload" size={13} />
              Choose file
            </button>
          )}

          <div>
            <label className="field-label block" htmlFor="config-password">
              {exporting ? 'Encryption password' : 'Decryption password'}
            </label>
            <div className="relative">
              <input
                id="config-password"
                className="field pr-9"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={exporting ? 'Password to encrypt file' : 'Password'}
                autoComplete={exporting ? 'new-password' : 'current-password'}
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

          {exporting ? (
            <div>
              <label className="field-label block" htmlFor="config-confirm-password">
                Confirm password
              </label>
              <input
                id="config-confirm-password"
                className="field"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          ) : null}

          {message ? <p className="text-[length:var(--app-text-11)] text-danger">{message}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !password || (!exporting && !fileName)}
          >
            {busy ? (exporting ? 'Exporting…' : 'Importing…') : exporting ? 'Export' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  )
}
