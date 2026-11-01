import React, { useEffect, useRef, useState } from 'react'
import { formatDateTime, isDateTimeString } from '@/resultFormats'

export interface FormViewerProps {
  columns: string[]
  rows: unknown[][]
  columnTypes?: (string | null)[]
  rowIndexes?: number[]
  onCellChange?: (rowIndex: number, columnName: string, nextValue: unknown, prevValue: unknown) => void
  timezone?: string
}

function toText(value: unknown, timezone: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  const text = String(value)
  return isDateTimeString(text) ? formatDateTime(text, timezone) : text
}

function parseValue(raw: string, original: unknown): unknown {
  if (raw === '') return null
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
  timezone,
}: {
  id: string
  label: string
  type: string
  value: unknown
  onChange: (next: unknown) => void
  timezone: string
}) {
  const [draft, setDraft] = useState(() => toText(value, timezone))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(toText(value, timezone))
  }, [value, timezone])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="select-text min-w-0 text-[length:var(--app-text-11)] font-medium text-text-soft" title={label}>
          {label}
        </label>
        <span className="shrink-0 text-[length:var(--app-text-10)] font-mono text-text-faint">{type}</span>
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
