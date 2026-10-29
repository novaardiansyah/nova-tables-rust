import React, { useEffect, useState } from 'react'
import { monaco } from '../../monaco'
import Icon from '../common/Icon'

export interface UpdateConfirmDialogProps {
  open: boolean
  changeCount: number
  sql?: string | null
  onApply?: () => void
  onCopyQuery?: () => void
  onClose?: () => void
  onCancel?: () => void
  onDiscard?: () => void
}

export default function UpdateConfirmDialog({
  open,
  changeCount,
  sql = null,
  onApply,
  onCopyQuery,
  onClose,
  onCancel,
  onDiscard,
}: UpdateConfirmDialogProps) {
  const handleClose = onClose || onCancel || (() => {})

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  const [highlighted, setHighlighted] = useState<{ text: string; html: string | null }>({ text: '', html: null })

  useEffect(() => {
    if (!open || !sql) return undefined
    let active = true
    const text = String(sql).trim()
    monaco.editor
      .colorize(text, 'sql', { tabSize: 2 })
      .then((html) => {
        if (active) setHighlighted({ text, html })
      })
      .catch(() => {
        if (active) setHighlighted({ text, html: null })
      })
    return () => {
      active = false
    }
  }, [open, sql])

  if (!open) return null

  const showSql = Boolean(sql)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl animate-fade-in rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="pencil" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Apply pending changes?
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              You have {changeCount} pending change{changeCount === 1 ? '' : 's'}. Choose how to proceed.
            </p>
            {showSql ? (
              <pre
                className="mt-3 max-h-[60vh] w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+6px)] text-text-soft"
                dangerouslySetInnerHTML={
                  highlighted.text === sql && highlighted.html
                    ? { __html: highlighted.html }
                    : undefined
                }
              >
                {!highlighted.html ? sql : null}
              </pre>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            className="btn-soft"
            onClick={handleClose}
          >
            <Icon name="x" size={12} />
            Close
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={onDiscard}
          >
            <Icon name="trash" size={12} />
            Discard
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={onCopyQuery}
          >
            <Icon name="copy" size={12} />
            Copy
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onApply}
          >
            <Icon name="play" size={12} />
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
