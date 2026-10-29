import { useEffect } from 'react'
import Icon from './Icon'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string | null
  detail?: string | null
  detailHtml?: string | null
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onCancel?: () => void
  onClose?: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  detailHtml = null,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onCancel,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const handleCancel = onCancel || onClose || (() => {})

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) handleCancel()
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${detail ? 'max-w-2xl' : 'max-w-sm'} animate-fade-in rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70`}
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-danger/15 text-danger' : 'bg-accent-soft text-accent'
            }`}
          >
            <Icon name={danger ? 'alert-triangle' : 'info'} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">{title}</h2>
            {message ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
                {message}
              </p>
            ) : null}
            {detail && detailHtml ? (
              <pre
                className="mt-3 max-h-[50vh] w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+6px)] text-text-soft"
                dangerouslySetInnerHTML={{ __html: detailHtml }}
              />
            ) : null}
            {detail && !detailHtml ? (
              <pre className="mt-3 max-h-[50vh] w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+6px)] text-text-soft">
                {detail}
              </pre>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
