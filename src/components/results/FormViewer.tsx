import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/common/Icon'
import ContextMenu from '@/components/common/ContextMenu'
import { formatDateTime, isDateTimeString } from '@/resultFormats'
import { specialValuesForDriver, SpecialValueOption } from '@/components/results/ResultGridCell'

export interface FormViewerProps {
  columns: string[]
  rows: unknown[][]
  columnTypes?: (string | null)[]
  rowIndexes?: number[]
  onCellChange?: (rowIndex: number, columnName: string, nextValue: unknown, prevValue: unknown) => void
  driverType?: string | null
  timezone?: string
  onCopyText?: (payload: string, message?: string) => void
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/

function isSpecial(value: unknown): value is { special: unknown } {
  return Boolean(value && typeof value === 'object' && 'special' in value)
}

function toText(value: unknown, timezone?: string): string {
  if (value === null || value === undefined) return ''
  if (isSpecial(value)) return String(value.special)
  if (value instanceof Date) return formatDateTime(value, timezone)
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  const rawText = String(value)
  const isDate = isDateTimeString(rawText) || DATE_RE.test(rawText)
  return isDate ? formatDateTime(rawText, timezone) : rawText
}

function parseValue(raw: string, original: unknown, specialValues: SpecialValueOption[], timezone?: string): unknown {
  if (raw === toText(original, timezone)) return original
  const text = raw.trim()
  if (text === '') return null
  const exact = specialValues.find((option) => option.label.toLowerCase() === text.toLowerCase())
  if (exact) return exact.value
  if (isSpecial(original)) return text === '' ? null : raw
  if (typeof original === 'boolean') {
    const lower = text.toLowerCase()
    if (lower === 'true' || lower === '1') return true
    if (lower === 'false' || lower === '0') return false
    return raw
  }
  if (typeof original !== 'number') return raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : raw
}

const LONG_TYPE_RE = /text|json|xml|blob|clob|max/i
const NON_TEXT_TYPE_RE = /int|float|decimal|numeric|real|money|double|date|time|bit|bool|guid|uniqueidentifier|binary|image/i
const LONG_FIELD_NAME_RE = /^(?:old_?value|new_?value|payload|exception|error(?:_message)?|stack(?:_trace)?|description|desc|detail(?:s)?|comment(?:s)?|note(?:s)?|remark(?:s)?|message(?:s)?|content(?:s)?|body|query|sql|address|bio|summary|log(?:s)?|data|config|json|xml)$/i

function isLongField(name: string, type: string, draft: string, original: unknown): boolean {
  if (draft.includes('\n') || draft.includes('\r')) return true
  if (LONG_TYPE_RE.test(type)) return true
  if (NON_TEXT_TYPE_RE.test(type)) return false
  if (typeof original === 'number' || typeof original === 'boolean' || original instanceof Date) return false
  if (draft.length > 30) return true
  if (LONG_FIELD_NAME_RE.test(name.trim())) return true
  return false
}

function isNumericType(type: string): boolean {
  const t = type.toLowerCase()
  return (
    t.includes('int') ||
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('float') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('money')
  )
}

function FormField({
  id,
  label,
  type,
  value,
  onChange,
  onSpecial,
  specialValues,
  timezone,
  onLabelContextMenu,
}: {
  id: string
  label: string
  type: string
  value: unknown
  onChange: (next: unknown) => void
  onSpecial?: (special: unknown) => void
  specialValues: SpecialValueOption[]
  timezone?: string
  onLabelContextMenu?: (event: React.MouseEvent, label: string) => void
}) {
  const [draft, setDraft] = useState(() => toText(value, timezone))
  const [menuOpen, setMenuOpen] = useState(false)
  const focused = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const selectionRef = useRef<{ start: number; end: number } | null>(null)
  const userResizedRef = useRef(false)
  const prevHeightRef = useRef<number | null>(null)

  const useTextarea = isLongField(label, type, draft, value)
  const isNumeric = isNumericType(type) || typeof value === 'number'

  useEffect(() => {
    userResizedRef.current = false
    if (!focused.current) setDraft(toText(value, timezone))
  }, [value, timezone])

  const adjustTextareaHeight = useCallback(() => {
    const el = fieldRef.current as HTMLTextAreaElement | null
    if (!el || el.tagName !== 'TEXTAREA') return
    if (userResizedRef.current) return
    const prevScrollTop = el.scrollTop
    el.style.height = 'auto'
    const borderOffset = el.offsetHeight - el.clientHeight
    const nextHeight = Math.max(el.scrollHeight + borderOffset, 32)
    el.style.height = `${nextHeight}px`
    el.scrollTop = prevScrollTop
  }, [])

  useEffect(() => {
    if (useTextarea) {
      adjustTextareaHeight()
    }
  }, [draft, useTextarea, adjustTextareaHeight])

  useEffect(() => {
    if (focused.current && fieldRef.current && document.activeElement !== fieldRef.current) {
      fieldRef.current.focus()
      if (selectionRef.current) {
        fieldRef.current.setSelectionRange(selectionRef.current.start, selectionRef.current.end)
      }
    }
  })

  useEffect(() => {
    if (!menuOpen) return undefined
    const handleDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const isActiveSpecial = (optionValue: unknown) => {
    if (optionValue === null) return value === null || value === undefined
    if (isSpecial(optionValue) && isSpecial(value)) return optionValue.special === value.special
    return false
  }

  const commonProps = {
    id,
    value: draft,
    placeholder: value === null || value === undefined ? 'NULL' : '',
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextVal = event.target.value
      selectionRef.current = {
        start: event.target.selectionStart ?? nextVal.length,
        end: event.target.selectionEnd ?? nextVal.length,
      }
      setDraft(nextVal)
      onChange(parseValue(nextVal, value, specialValues, timezone))
    },
    style: { fontSize: 'var(--json-font-size)' },
    spellCheck: false,
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="select-text min-w-0 text-[length:var(--app-text-11)] font-medium text-text-soft truncate cursor-context-menu"
          title={label}
          onContextMenu={(event) => onLabelContextMenu?.(event, label)}
        >
          {label}
        </label>
        <div className="relative flex shrink-0 items-center gap-1.5" ref={menuRef}>
          <span className="text-[length:var(--app-text-10)] font-mono text-text-faint">{type}</span>
          {onSpecial ? (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className={`flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-tint/[0.08] hover:text-text ${
                  menuOpen ? 'bg-tint/[0.08] text-text-strong' : ''
                }`}
                title="Special values"
              >
                <Icon name="more-horizontal" size={12} />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1 flex w-44 flex-col rounded-md border border-line-strong bg-elevated p-1 shadow-2xl shadow-black/60">
                  {specialValues.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setDraft(toText(option.value, timezone))
                        onSpecial(option.value)
                        setMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[length:var(--app-text-11)] transition-colors hover:bg-tint/[0.05] ${
                        isActiveSpecial(option.value) ? 'bg-tint/[0.08] text-accent font-medium' : 'text-text'
                      }`}
                    >
                      <span className="font-mono">{option.label}</span>
                      <span className="text-[length:var(--app-text-10)] text-text-faint">{option.hint}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {useTextarea ? (
        <textarea
          {...commonProps}
          ref={(el) => {
            fieldRef.current = el
            if (el && !userResizedRef.current) {
              const prevScrollTop = el.scrollTop
              el.style.height = 'auto'
              const borderOffset = el.offsetHeight - el.clientHeight
              const nextHeight = Math.max(el.scrollHeight + borderOffset, 32)
              el.style.height = `${nextHeight}px`
              el.scrollTop = prevScrollTop
            }
          }}
          onMouseDown={() => {
            const el = fieldRef.current
            if (el) prevHeightRef.current = el.offsetHeight
          }}
          onMouseUp={() => {
            const el = fieldRef.current
            if (el && prevHeightRef.current !== null && Math.abs(el.offsetHeight - prevHeightRef.current) > 2) {
              userResizedRef.current = true
            }
          }}
          onDoubleClick={() => {
            userResizedRef.current = false
            adjustTextareaHeight()
          }}
          className="w-full min-h-[32px] resize-y overflow-y-auto rounded border border-line-strong bg-base px-2 py-1 font-mono text-[length:var(--app-text-12)] leading-relaxed text-text outline-none transition-colors select-text focus:border-accent/70"
        />
      ) : (
        <input
          {...commonProps}
          type="text"
          inputMode={isNumeric ? 'decimal' : 'text'}
          ref={(el) => {
            fieldRef.current = el
          }}
          className="w-full rounded border border-line-strong bg-base px-2 py-1 font-mono text-[length:var(--app-text-12)] text-text outline-none transition-colors select-text focus:border-accent/70"
        />
      )}
    </div>
  )
}

export default function FormViewer({
  columns,
  rows,
  columnTypes = [],
  rowIndexes,
  onCellChange,
  driverType,
  timezone,
  onCopyText,
}: FormViewerProps) {
  const [filter, setFilter] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fieldName: string } | null>(null)

  const handleLabelContextMenu = useCallback((event: React.MouseEvent, fieldName: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      fieldName,
    })
  }, [])

  if (!columns.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-[length:var(--app-text-11)] text-text-faint">
        Select rows or cells to view form.
      </div>
    )
  }

  const specialValues = specialValuesForDriver(driverType)
  const displayedRows = rows.length ? rows : [[]]
  const normalizedFilter = filter.trim().toLowerCase()

  const visibleColumnEntries = columns
    .map((name, index) => ({ name, index }))
    .filter((entry) => !normalizedFilter || entry.name.toLowerCase().includes(normalizedFilter))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-base px-2 py-[5px] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
          <Icon name="search" size={12} className="shrink-0 text-text-faint" />
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search fields.."
            aria-label="Search fields"
            className="w-full min-w-0 bg-transparent text-[length:var(--app-text-12)] text-text placeholder:text-text-muted outline-none"
          />
          {filter ? (
            <button
              type="button"
              className="icon-btn h-4 w-4 text-text-faint hover:text-text"
              title="Clear Filter"
              aria-label="Clear Filter"
              onClick={() => setFilter('')}
            >
              <Icon name="x" size={11} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {visibleColumnEntries.length === 0 ? (
          <p className="py-4 text-center text-[length:var(--app-text-11)] text-text-faint">
            No fields match &quot;{filter}&quot;
          </p>
        ) : (
          displayedRows.map((row, rowIdx) => {
            const rowIndex = rowIndexes?.[rowIdx] ?? rowIdx

            return (
              <div key={`${rowIdx}-${rowIndex}`} className="flex flex-col gap-2.5">
                {displayedRows.length > 1 ? (
                  <p className="border-b border-line pb-1 text-[length:var(--app-text-10)] font-mono uppercase tracking-wide text-text-faint">
                    Row {rowIndex + 1}
                  </p>
                ) : null}
                {visibleColumnEntries.map(({ name: columnName, index: colIdx }) => {
                  const original = row[colIdx]
                  return (
                    <FormField
                      key={columnName}
                      id={`form-field-${rowIndex}-${columnName}`}
                      label={columnName}
                      type={columnTypes[colIdx] ?? (original === null ? 'null' : typeof original)}
                      value={original}
                      onChange={(next) => onCellChange?.(rowIndex, columnName, next, original)}
                      onSpecial={onCellChange ? (special) => onCellChange(rowIndex, columnName, special, original) : undefined}
                      specialValues={specialValues}
                      timezone={timezone}
                      onLabelContextMenu={handleLabelContextMenu}
                    />
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: 'copy-object-name',
              label: 'Copy Object Name',
              onSelect: () =>
                onCopyText?.(contextMenu.fieldName, `Copied column name ${contextMenu.fieldName}.`),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  )
}
