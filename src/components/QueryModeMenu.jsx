import { useEffect, useRef, useState } from 'react'
import Icon from './common/Icon.jsx'
import { EXECUTION_MODES, getModeById } from '../queryModes.js'

const TONE_CLASS = {
  success: 'bg-success',
  'warning-outline': 'border border-warning',
  danger: 'bg-danger',
}

export default function QueryModeMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const current = getModeById(value)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Query execution mode"
        className="flex h-8 w-[200px] items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[length:var(--app-text-11)] text-text-soft transition-colors hover:border-line-strong hover:text-text"
      >
        <Icon name="lock" size={14} />
        <span className="truncate">{current.label}</span>
        <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[current.tone]}`} />
        <Icon name="chevron-down" size={12} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[420px] origin-top-right animate-fade-in overflow-hidden rounded-lg border border-line-strong bg-elevated p-1 shadow-2xl shadow-black/60">
          {EXECUTION_MODES.map((mode) => {
            const selected = mode.id === current.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  onChange(mode.id)
                  setOpen(false)
                }}
                className={`flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                  selected ? 'bg-tint/[0.06]' : 'hover:bg-tint/[0.03]'
                }`}
              >
                {selected ? (
                  <Icon name="check-circle" size={14} className="mt-0.5 shrink-0 text-success" />
                ) : (
                  <span className="mt-0.5 w-[14px] shrink-0" />
                )}
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[mode.tone]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:var(--app-text-11)] font-medium text-text">
                    {mode.label}
                  </span>
                  <span className="block text-[length:var(--app-text-10)] leading-snug text-text-muted">
                    {mode.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
