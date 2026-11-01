import React, { useEffect, useRef, useState } from 'react'
import Icon from '@/components/common/Icon'
import { formatDateTime, isDateTimeString } from '@/resultFormats'
import { SPECIAL_VALUES } from '@/components/results/ResultGridCell'

export interface FormViewerProps {
  columns: string[]
  rows: unknown[][]
  columnTypes?: (string | null)[]
  rowIndexes?: number[]
  onCellChange?: (rowIndex: number, columnName: string, nextValue: unknown, prevValue: unknown) => void
  timezone?: string
}

function isSpecial(value: unknown): value is { special: unknown } {
  return Boolean(value && typeof value === 'object' && 'special' in value)
}

function toText(value: unknown, timezone: string): string {
  if (value === null || value === undefined) return ''
  if (isSpecial(value)) return String(value.special)
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  const text = String(value)
  return isDateTimeString(text) ? formatDateTime(text, timezone) : text
}

function parseValue(raw: string, original: unknown): unknown {
  const text = raw.trim()
  if (text === '') return null
  const exact = SPECIAL_VALUES.find((option) => option.label.toLowerCase() === text.toLowerCase())
  if (exact) return exact.value
  if (isSpecial(original)) return text === '' ? null : raw
  if (typeof original !== 'number') return raw
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : raw
}

function FormField({
  id,
  label,
  type,
  value,
  onChange,
  onSpecial,
  timezone,
}: {
  id: string
  label: string
  type: string
  value: unknown
  onChange: (next: unknown) => void
  onSpecial?: (special: unknown) => void
  timezone: string
}) {
  const [draft, setDraft] = useState(() => toText(value, timezone))
  const [menuOpen, setMenuOpen] = useState(false)
  const focused = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focused.current) setDraft(toText(value, timezone))
  }, [value, timezone])

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

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="select-text min-w-0 text-[length:var(--app-text-11)] font-medium text-text-soft truncate" title={label}>
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
                  {SPECIAL_VALUES.map((option) => (
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
      <input
        id={id}
        type="text"
        value={draft}
        placeholder={value === null || value === undefined ? 'NULL' : ''}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseValue(event.target.value, value))
        }}
        className="w-full rounded border border-line-strong bg-base px-2 py-1 font-mono text-[length:var(--app-text-12)] text-text outline-none transition-colors select-text focus:border-accent/70"
        style={{ fontSize: 'var(--json-font-size)' }}
      />
    </div>
  )
}

export default function FormViewer({
  columns,
  rows,
  columnTypes = [],
  rowIndexes,
  onCellChange,
  timezone = 'UTC',
}: FormViewerProps) {
  if (!columns.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-[length:var(--app-text-11)] text-text-faint">
        Select rows or cells to view form.
      </div>
    )
  }

  const displayedRows = rows.length ? rows : [[]]

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
      {displayedRows.map((row, rowIdx) => {
        const rowIndex = rowIndexes?.[rowIdx] ?? rowIdx

        return (
          <section key={`${rowIdx}-${rowIndex}`} className="flex flex-col gap-2 rounded-md border border-line bg-base p-3">
            {displayedRows.length > 1 ? (
              <p className="text-[length:var(--app-text-10)] font-mono uppercase tracking-wide text-text-faint">Row {rowIndex + 1}</p>
            ) : null}
            {columns.map((columnName, colIdx) => {
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
                  timezone={timezone}
                />
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
