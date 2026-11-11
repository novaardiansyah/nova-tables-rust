import React from 'react'
import Icon from '@/components/common/Icon'

export interface EditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function Editor({ label, value, onChange, placeholder, className = '', disabled = false }: EditorProps) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      <input
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
      />
    </label>
  )
}

export interface SectionProps {
  title: string
  count: number | string
  onAdd: () => void
  addLabel: string
  search?: React.ReactNode
  children: React.ReactNode
}

export function Section({ title, count, onAdd, addLabel, search, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b border-line bg-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--app-text-11)] font-semibold uppercase tracking-wider text-text-muted">{title}</span>
          <span className="text-[length:var(--app-text-11)] text-text-faint">{count}</span>
        </div>
        <div className="flex items-center gap-2">
          {search}
          <button type="button" className="btn-ghost h-6 px-2 text-[length:var(--app-text-11)]" onClick={onAdd}>
            <Icon name="plus" size={12} />
            {addLabel}
          </button>
        </div>
      </div>
      <div className="p-3">
        {children}
      </div>
    </section>
  )
}
