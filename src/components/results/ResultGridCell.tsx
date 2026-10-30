import React, { useEffect, useRef, useState } from 'react'

export interface SpecialValueOption {
  label: string
  hint: string
  value: unknown
}

const SPECIAL_VALUES: SpecialValueOption[] = [
  { label: 'NULL', hint: 'null', value: null },
  { label: 'DEFAULT', hint: 'column default', value: { special: 'DEFAULT' } },
  { label: 'GETDATE()', hint: 'now', value: { special: 'GETDATE()' } },
]

export interface CellEditorController {
  commit: () => void
  contains: (node: Node | null) => boolean
}

export interface CellEditorProps {
  value: unknown
  onCommit: (next: unknown) => void
  onCancel: () => void
  controllerRef?: React.MutableRefObject<CellEditorController | null>
}

export default function CellEditor({ value, onCommit, onCancel, controllerRef }: CellEditorProps) {
  const isSpecial = Boolean(value && typeof value === 'object' && 'special' in value)
  const isNull = !isSpecial && (value === null || value === undefined)
  const initial = isSpecial ? String((value as { special: unknown }).special) : isNull ? '' : String(value)
  const [draft, setDraft] = useState(initial)
  const [highlight, setHighlight] = useState(-1)
  const draftRef = useRef(initial)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const settledRef = useRef(false)

  const query = draft.trim().toLowerCase()
  const matches = SPECIAL_VALUES.filter((option) => option.label.toLowerCase().includes(query))

  const commitValue = (next: unknown) => {
    if (settledRef.current) return
    settledRef.current = true
    onCommit(next)
  }

  const finish = (next: string) => {
    if (settledRef.current) return
    if (next === initial) {
      commitValue(value)
      return
    }
    const text = next.trim()
    const exact = SPECIAL_VALUES.find((option) => option.label.toLowerCase() === text.toLowerCase())
    if (exact) {
      commitValue(exact.value)
      return
    }
    if (isSpecial) {
      commitValue(text === '' ? null : next)
      return
    }
    if (isNull) {
      commitValue(text === '' ? null : next)
      return
    }
    if (typeof value === 'number') {
      if (text === '') {
        commitValue(null)
        return
      }
      const parsed = Number(text)
      if (Number.isFinite(parsed)) {
        commitValue(parsed)
        return
      }
    }
    commitValue(next)
  }

  const cancel = () => {
    if (settledRef.current) return
    settledRef.current = true
    onCancel()
  }

  useEffect(() => {
    if (!controllerRef) return undefined
    controllerRef.current = {
      commit: () => finish(draftRef.current),
      contains: (node) => Boolean(rootRef.current && node && rootRef.current.contains(node)),
    }
    return () => {
      controllerRef.current = null
    }
  })

  return (
    <span
      ref={rootRef}
      className="absolute inset-0 z-[15] flex items-center bg-base px-0.5"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        type="text"
        value={draft}
        onChange={(event) => {
          draftRef.current = event.target.value
          setDraft(event.target.value)
          setHighlight(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!matches.length) return
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setHighlight((prev) => (prev + step + matches.length) % matches.length)
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (highlight >= 0) {
              commitValue(matches[highlight]?.value)
              return
            }
            finish(draft)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        onBlur={() => finish(draft)}
        autoFocus
        className="h-full w-full min-w-0 select-text rounded border border-accent/60 bg-base px-1 text-[length:inherit] text-text outline-none"
        style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
      />

      {matches.length ? (
        <span className="absolute left-0 top-[calc(100%+2px)] z-40 flex w-52 flex-col rounded-md border border-line-strong bg-elevated p-1 shadow-2xl shadow-black/60">
          {matches.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => commitValue(option.value)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[length:var(--app-text-11)] transition-colors hover:bg-tint/[0.05] ${
                index === highlight ? 'bg-tint/[0.05] text-accent' : 'text-text'
              }`}
            >
              <span className="font-mono">{option.label}</span>
              <span className="text-[length:var(--app-text-10)] text-text-faint">{option.hint}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
