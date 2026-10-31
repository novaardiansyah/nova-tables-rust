import { useEffect, useState } from 'react'
import { api } from '@/api'
import Icon from '@/components/common/Icon'

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
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  if (!message) return null
  const style = STYLES[type] || STYLES.info

  const handleCopy = async () => {
    try {
      await api.copyText(message)
      setCopied(true)
    } catch {
      // Keep the message visible even if the clipboard is unavailable.
    }
  }

  return (
    <div
      className="fixed right-4 top-4 z-[60] w-[min(22rem,calc(100vw-2rem))] animate-fade-in rounded-lg border border-line-strong bg-elevated px-3.5 py-2.5 text-text shadow-lg shadow-black/20"
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <Icon name={style.icon} size={14} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
        <p className="flex-1 select-text leading-[calc(var(--app-text-12)+8px)] text-[length:var(--app-text-12)]">{message}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="icon-btn h-5 w-5 shrink-0"
          title={copied ? 'Copied' : 'Copy message'}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
        </button>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="icon-btn h-5 w-5 shrink-0" title="Dismiss">
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
