import React, { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/common/Icon'
import JsonView from '@/components/results/JsonView'
import { cellText, formatDateTime, isDateTimeString } from '@/resultFormats'

function formatRaw(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'special' in value) return String((value as { special: unknown }).special)
  if (value instanceof Date) return formatDateTime(value, timeZone)
  if (typeof value === 'string' && isDateTimeString(value)) return formatDateTime(value, timeZone)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function detectFormat(str: string): 'text' | 'json' | 'xml' {
  if (!str || typeof str !== 'string') return 'text'
  const trimmed = str.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {}
  }
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return 'xml'
  }
  return 'text'
}

function formatXml(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml
  let formatted = ''
  let indent = 0
  const tab = '  '
  const clean = xml.replace(/>\s*</g, '><').trim()
  const regex = /(<[^>]+>)/g
  const tokens = clean.split(regex).filter(Boolean)

  for (const token of tokens) {
    if (token.startsWith('</')) {
      indent = Math.max(0, indent - 1)
      formatted += `${tab.repeat(indent)}${token}\n`
    } else if (
      token.startsWith('<') &&
      !token.startsWith('<?') &&
      !token.startsWith('<!') &&
      !token.endsWith('/>')
    ) {
      formatted += `${tab.repeat(indent)}${token}\n`
      indent += 1
    } else if (token.startsWith('<')) {
      formatted += `${tab.repeat(indent)}${token}\n`
    } else {
      const text = token.trim()
      if (text) {
        formatted += `${tab.repeat(indent)}${text}\n`
      }
    }
  }
  return formatted.trimEnd()
}

function tokenizeXml(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let key = 0
  const lines = text.split('\n')
  for (let l = 0; l < lines.length; l += 1) {
    const line = lines[l]
    const parts = line.split(/(<[^>]+>)/g)
    parts.forEach((part) => {
      if (!part) return
      if (part.startsWith('</')) {
        nodes.push(
          <span key={key++} className="text-accent/80">
            {part}
          </span>,
        )
      } else if (part.startsWith('<')) {
        nodes.push(
          <span key={key++} className="text-accent">
            {part}
          </span>,
        )
      } else {
        nodes.push(
          <span key={key++} className="text-text">
            {part}
          </span>,
        )
      }
    })
    if (l < lines.length - 1) nodes.push('\n')
  }
  return nodes
}

export interface InspectorTargetColumn {
  name: string
  type?: string
  [key: string]: unknown
}

export interface InspectorTarget {
  type: 'cell' | 'rows' | 'selection'
  rowIndex?: number
  column?: InspectorTargetColumn
  value?: unknown
  title?: string
  subtitle?: string
  columnNames?: string[]
  matrix?: unknown[][]
  [key: string]: unknown
}

export interface EditCellState {
  value: unknown
  [key: string]: unknown
}

export interface ValueInspectorDialogProps {
  open: boolean
  target?: InspectorTarget | null
  timezone?: string
  edits?: Record<string, EditCellState>
  editable?: boolean
  onSave?: (newValue: string) => void
  onClose?: () => void
  onCopy?: (text: string, message?: string) => void
}

export default function ValueInspectorDialog({
  open,
  target = null,
  timezone,
  edits = {},
  editable = false,
  onSave,
  onClose,
  onCopy,
}: ValueInspectorDialogProps) {
  const isMulti = Boolean(target && (target.type === 'rows' || target.type === 'selection'))

  const initialText = useMemo(() => {
    if (!open || !target) return ''
    if (target.type === 'cell') {
      const edit = edits[`${target.rowIndex}:${target.column?.name}`]
      const val = edit ? edit.value : target.value
      return formatRaw(val, timezone)
    }
    if (target.type === 'rows' || target.type === 'selection') {
      const cols = target.columnNames || []
      const records = (target.matrix || []).map((row) => {
        const item: Record<string, unknown> = {}
        cols.forEach((colName, idx) => {
          const cellVal = row[idx]
          if (cellVal !== null && cellVal !== undefined && isDateTimeString(cellVal)) {
            item[colName] = formatDateTime(cellVal, timezone)
          } else {
            item[colName] = cellVal ?? null
          }
        })
        return item
      })
      try {
        return JSON.stringify(records.length === 1 ? records[0] : records, null, 2)
      } catch {
        return (target.matrix || []).map((row) => row.map((c) => cellText(c, timezone)).join('\t')).join('\n')
      }
    }
    return ''
  }, [edits, open, target, timezone])

  const initialFormat = useMemo(() => {
    if (isMulti) return 'json'
    return detectFormat(initialText)
  }, [initialText, isMulti])

  const [format, setFormat] = useState<'text' | 'json' | 'xml'>('text')
  const [wrap, setWrap] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setFormat(initialFormat)
      setIsEditing(false)
      setDraft(initialText)
      setCopied(false)
    }
  }, [initialFormat, initialText, open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isEditing) onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, onClose, open])

  const displayText = useMemo(() => {
    if (isEditing) return draft
    if (format === 'json') {
      try {
        const parsed = JSON.parse(initialText)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return initialText
      }
    }
    if (format === 'xml') {
      return formatXml(initialText)
    }
    return initialText
  }, [draft, format, initialText, isEditing])

  const isNull = !isMulti && (target?.value === null || target?.value === undefined)
  const charCount = (isEditing ? draft : initialText).length
  const byteCount = new Blob([isEditing ? draft : initialText]).size

  const handleCopy = () => {
    onCopy?.(displayText, 'Copied value to clipboard.')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleApplySave = () => {
    onSave?.(draft)
    setIsEditing(false)
    onClose?.()
  }

  if (!open || !target) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name="code" size={14} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[length:var(--app-text-13)] font-semibold text-text-strong">
                  {target.type === 'cell' ? target.column?.name || 'Cell Value' : target.title || 'Selected Data'}
                </h2>
                {isNull ? (
                  <span className="rounded bg-line px-1.5 py-0.5 text-[length:var(--app-text-9)] font-medium uppercase text-text-faint">
                    NULL
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-[length:var(--app-text-11)] text-text-muted">
                {target.type === 'cell' ? (
                  <>
                    <span>Row {(target.rowIndex ?? 0) + 1}</span>
                    <span className="text-text-faint">·</span>
                    <span>{target.column?.type || (isNull ? 'null' : typeof target.value)}</span>
                  </>
                ) : (
                  <span>{target.subtitle}</span>
                )}
                <span className="text-text-faint">·</span>
                <span>{charCount.toLocaleString()} chars</span>
                <span className="text-text-faint">({byteCount.toLocaleString()} bytes)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <div className="flex rounded-md border border-line bg-panel p-0.5 text-[length:var(--app-text-11)]">
                <button
                  type="button"
                  onClick={() => setFormat('text')}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    format === 'text'
                      ? 'bg-tint/[0.08] font-medium text-text-strong'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  Raw
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    format === 'json'
                      ? 'bg-tint/[0.08] font-medium text-text-strong'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('xml')}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    format === 'xml'
                      ? 'bg-tint/[0.08] font-medium text-text-strong'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  XML
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setWrap((w) => !w)}
              title={wrap ? 'Disable word wrap' : 'Enable word wrap'}
              className={`btn-soft flex h-7 items-center px-2.5 text-[length:var(--app-text-11)] ${
                wrap ? 'bg-tint/[0.08] font-medium text-text-strong' : ''
              }`}
            >
              Wrap
            </button>

            <button
              type="button"
              onClick={handleCopy}
              title="Copy formatted value"
              className="btn-soft flex h-7 items-center gap-1.5 px-2.5 text-[length:var(--app-text-11)]"
            >
              <Icon name={copied ? 'check-circle' : 'copy'} size={12} />
              {copied ? 'Copied' : 'Copy'}
            </button>

            {editable && !isEditing && target.type === 'cell' ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(initialText)
                  setIsEditing(true)
                }}
                className="btn-soft flex h-7 items-center gap-1.5 px-2.5 text-[length:var(--app-text-11)]"
              >
                <Icon name="pencil" size={12} />
                Edit
              </button>
            ) : null}

            <button type="button" className="icon-btn h-7 w-7" onClick={onClose} title="Close (Escape)">
              <Icon name="x" size={13} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-base p-4">
          {isNull ? (
            <div className="flex h-full items-center justify-center text-[length:var(--app-text-12)] italic text-text-faint">
              NULL (No value)
            </div>
          ) : isEditing ? (
            <textarea
              className="h-full w-full resize-none bg-transparent font-mono text-[length:var(--app-text-12)] leading-relaxed text-text-strong outline-none"
              style={{
                fontFamily: 'var(--grid-font-family)',
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
                wordBreak: wrap ? 'break-word' : 'normal',
              }}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
          ) : format === 'json' ? (
            <div
              style={{
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
                wordBreak: wrap ? 'break-word' : 'normal',
              }}
            >
              <JsonView text={displayText} />
            </div>
          ) : format === 'xml' ? (
            <pre
              className="font-mono text-[length:var(--app-text-12)] leading-relaxed text-text"
              style={{
                fontFamily: 'var(--grid-font-family)',
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
                wordBreak: wrap ? 'break-word' : 'normal',
              }}
            >
              {tokenizeXml(displayText)}
            </pre>
          ) : (
            <pre
              className="font-mono text-[length:var(--app-text-12)] leading-relaxed text-text"
              style={{
                fontFamily: 'var(--grid-font-family)',
                whiteSpace: wrap ? 'pre-wrap' : 'pre',
                wordBreak: wrap ? 'break-word' : 'normal',
              }}
            >
              {displayText}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <div className="text-[length:var(--app-text-11)] text-text-faint">
            {isEditing ? (
              <span className="text-warning">Editing mode · Press Save to update cell</span>
            ) : (
              <span>Format: {format.toUpperCase()} · Press Escape to close</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="btn-soft text-[length:var(--app-text-12)]"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary text-[length:var(--app-text-12)]"
                  onClick={handleApplySave}
                >
                  Save to cell
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-soft text-[length:var(--app-text-12)]"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
