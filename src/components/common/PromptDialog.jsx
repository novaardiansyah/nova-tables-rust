import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'

export default function PromptDialog({
  open,
  title,
  description,
  label,
  hint,
  confirmLabel = 'Confirm',
  initialValue,
  placeholder,
  type = 'text',
  error = null,
  busy,
  onCancel,
  onClose,
  onConfirm,
}) {
  const handleCancel = onCancel || onClose || (() => {})
  const [value, setValue] = useState(initialValue ?? '')

  useEffect(() => {
    if (open) setValue(initialValue ?? '')
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleCancel()
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        const next = value.trim()
        if (next) { event.preventDefault(); onConfirm(next) }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, value, handleCancel, onConfirm])

  if (!open) return null

  const submit = (event) => {
    event.preventDefault()
    const next = value.trim()
    if (next) onConfirm(next)
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
        className="animate-fade-in w-full max-w-sm overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="pencil" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">{title}</h2>
            {description ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">{description}</p>
            ) : null}
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={handleCancel} disabled={busy}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="border-t border-line px-5 py-4">
          <label className="field-label block" htmlFor="prompt-dialog-input">
            {label}
          </label>
          <input
            id="prompt-dialog-input"
            className="field"
            value={value}
            type={type}
            autoFocus
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
          {error ? (
            <p className="mt-2 text-[length:var(--app-text-11)] text-danger">{error}</p>
          ) : null}
          {hint ? (
            <p className="mt-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+4px)] text-text-muted">
              {hint}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!value || busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
