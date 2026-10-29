import Icon from './Icon'

export type BannerType = 'info' | 'success' | 'warn' | 'error'

const STYLES: Record<BannerType, { icon: string; iconClass: string }> = {
  info: {
    icon: 'info',
    iconClass: 'text-accent',
  },
  success: {
    icon: 'check-circle',
    iconClass: 'text-success',
  },
  warn: {
    icon: 'alert-triangle',
    iconClass: 'text-warning',
  },
  error: {
    icon: 'alert-triangle',
    iconClass: 'text-danger',
  },
}

export interface BannerProps {
  type?: BannerType
  message?: string | null
  onDismiss?: () => void
}

export default function Banner({ type = 'info', message, onDismiss }: BannerProps) {
  if (!message) return null
  const style = STYLES[type] || STYLES.info

  return (
    <div
      className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))] animate-fade-in rounded-lg border border-line-strong bg-elevated px-3.5 py-2.5 text-text shadow-lg shadow-black/20"
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <Icon name={style.icon} size={14} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
        <p className="flex-1 leading-[calc(var(--app-text-12)+8px)] text-[length:var(--app-text-12)]">{message}</p>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="icon-btn h-5 w-5 shrink-0" title="Dismiss">
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
