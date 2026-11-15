import React, { useEffect, useState, FormEvent } from 'react'
import Icon, { Spinner } from '@/components/common/Icon'
import Select from '@/components/common/Select'
import { TIMEZONES } from '@/settings'

const TIMEZONE_OPTIONS = TIMEZONES.map((tz) => ({ value: tz.id, label: tz.label }))

export interface ConnectionSettingsDialogProps {
  open: boolean
  connectionName: string
  timezone: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onSave: (timezone: string) => void | Promise<void>
}

export default function ConnectionSettingsDialog({
  open,
  connectionName,
  timezone,
  busy = false,
  error = null,
  onCancel,
  onSave,
}: ConnectionSettingsDialogProps) {
  const [draftTimezone, setDraftTimezone] = useState(timezone)

  useEffect(() => {
    if (open) setDraftTimezone(timezone)
  }, [open, timezone])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel, open])

  if (!open) return null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    void onSave(draftTimezone)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div className="w-full max-w-md animate-fade-in overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="settings" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Connection Settings
            </h2>
            <p className="truncate text-[length:var(--app-text-11)] text-text-muted">{connectionName}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} disabled={busy}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4 py-2.5">
              <p className="min-w-0 pr-2 text-[length:var(--app-text-12)] font-medium text-text">
                Timezone
              </p>
              <div className="flex min-w-0 items-center justify-end gap-2">
                <Select
                  value={draftTimezone}
                  options={TIMEZONE_OPTIONS}
                  onChange={setDraftTimezone}
                  icon="clock"
                  placeholder="Select timezone"
                  emptyLabel="No timezones"
                  panelAlign="right"
                  className="w-64"
                  searchable
                />
              </div>
            </div>
            {error ? (
              <p className="mt-2 text-[length:var(--app-text-11)] text-danger">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            <button type="button" className="btn-soft" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner size={13} /> : <Icon name="check-circle" size={13} />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
