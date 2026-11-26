import { useEffect, useState } from 'react'
import { api } from '@/api'
import Icon, { Spinner } from '@/components/common/Icon'

const AUTO_RETRY_INTERVAL_SECONDS = 60

export interface MaintenanceDialogProps {
  open: boolean
  checking: boolean
  lastFailedAt: string | null
  onRetry: () => void | Promise<void>
}

export default function MaintenanceDialog({
  open,
  checking,
  lastFailedAt,
  onRetry,
}: MaintenanceDialogProps) {
  const [countdown, setCountdown] = useState(AUTO_RETRY_INTERVAL_SECONDS)

  useEffect(() => {
    if (!open || checking) return undefined
    setCountdown(AUTO_RETRY_INTERVAL_SECONDS)
    const intervalId = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void onRetry()
          return AUTO_RETRY_INTERVAL_SECONDS
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [open, checking, onRetry])

  if (!open) return null

  const defaultMessage =
    'Hello, I would like to ask for more information regarding the server connection issue on Nova Tables.'
  const emailUrl = `mailto:admin@novaardiansyah.id?subject=${encodeURIComponent(
    'Nova Tables - Server Maintenance Inquiry',
  )}&body=${encodeURIComponent(defaultMessage)}`
  const whatsappUrl = `https://wa.me/6289506668480?text=${encodeURIComponent(defaultMessage)}`

  const handleOpenExternal = (url: string) => {
    void api.openExternal(url)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-6 backdrop-blur-[3px]">
      <div className="w-full max-w-md animate-fade-in rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-start gap-3.5 p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Icon name="server" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-15)] font-semibold text-text-strong">
              Server Maintenance
            </h2>
            <p className="mt-1.5 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+7px)] text-text-soft">
              Unable to connect to the Nova Tables API server. The service may be temporarily unavailable or undergoing maintenance.
            </p>

            <div className="mt-4 rounded-lg border border-line bg-panel p-3">
              <div className="text-[length:var(--app-text-11)] font-medium text-text-muted">
                Need more information? Contact the developer:
              </div>
              <div className="mt-2 flex flex-col gap-1.5 text-[length:var(--app-text-12)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-soft">Email</span>
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(emailUrl)}
                    className="font-medium text-accent hover:underline"
                  >
                    admin@novaardiansyah.id
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-soft">WhatsApp</span>
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(whatsappUrl)}
                    className="font-medium text-accent hover:underline"
                  >
                    +62 8950 666 8480
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[length:var(--app-text-11)] text-text-muted">
              <span>
                {checking
                  ? 'Checking server connection...'
                  : `Auto-rechecking in ${countdown}s`}
              </span>
              {lastFailedAt ? <span>Last check: {lastFailedAt}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-line px-5 py-3">
          <button
            type="button"
            disabled={checking}
            onClick={() => void onRetry()}
            className="btn-primary flex items-center gap-1.5"
          >
            {checking ? <Spinner size={13} /> : <Icon name="refresh" size={13} />}
            <span>{checking ? 'Checking...' : 'Check Again'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
