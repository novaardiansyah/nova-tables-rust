import React, { useEffect, useState } from 'react'
import { api } from '@/api'
import Icon from '@/components/common/Icon'
import { formatDuration, formatNumber } from '@/resultFormats'
import type { QueryErrorData, QueryResultMessage } from '@/components/results/ResultsPanel'

export function MessageList({ messages }: { messages: QueryResultMessage[] }) {
  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--app-text-12)] text-text-faint">
        No messages.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      <ul className="space-y-1 font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
        {messages.map((message, index) => (
          <li key={index} className="whitespace-pre-wrap break-words">
            {message.type === 'rows'
              ? `(${formatNumber(message.count ?? 0)} row${message.count === 1 ? '' : 's'} affected)`
              : message.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong bg-elevated text-text-faint">
        <Icon name="grid" size={19} />
      </span>
      <div>
        <p className="text-[length:var(--app-text-13)] text-text-soft">No query results yet</p>
        <p className="mt-1 text-[length:var(--app-text-11)] text-text-faint">
          Run a query with <span className="kbd">Ctrl</span> + <span className="kbd">↵</span> to see the
          output here.
        </p>
      </div>
    </div>
  )
}

export function ErrorState({ error }: { error?: QueryErrorData | null }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    try {
      const ok = await api.copyText(error?.message || 'Unknown error')
      setCopied(ok)
    } catch {
      // Keep the message visible even if the clipboard is unavailable.
    }
  }

  const details = [
    error?.number ? `Error ${error.number}` : null,
    error?.severity ? `Level ${error.severity}` : null,
    error?.lineNumber ? `Line ${error.lineNumber}` : null,
    error?.state ? `State ${error.state}` : null,
  ].filter(Boolean)

  return (
    <div className="h-full overflow-auto p-4">
      <div className="rounded-lg border border-danger/25 bg-danger/[0.06] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Icon name="alert-triangle" size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--app-text-10)] font-semibold uppercase tracking-wider text-danger/80">
              Query failed
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-danger">
              {error?.message || 'Unknown error'}
            </p>
            {details.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--app-text-10)] text-danger/60">
                {details.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="icon-btn h-5 w-5 shrink-0 text-danger/60 hover:text-danger"
                title={copied ? 'Copied' : 'Copy error'}
              >
                <Icon name={copied ? 'check' : 'copy'} size={13} />
              </button>
              {copied ? (
                <p className="text-[length:var(--app-text-10)] text-danger/60">Copied</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CompletedState({ rowsAffected, elapsedMs }: { rowsAffected: number; elapsedMs: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon name="check-circle" size={18} />
      </span>
      <p className="text-[length:var(--app-text-13)] text-text">Query completed successfully</p>
      <p className="text-[length:var(--app-text-11)] text-text-muted">
        {rowsAffected > 0 ? `${formatNumber(rowsAffected)} rows affected` : 'No rows returned'} ·{' '}
        {formatDuration(elapsedMs)}
      </p>
    </div>
  )
}

