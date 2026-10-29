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
  children: React.ReactNode
}

export function Section({ title, count, onAdd, addLabel, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--app-text-11)] font-semibold uppercase tracking-wider text-text-muted">{title}</span>
          <span className="text-[length:var(--app-text-11)] text-text-faint">{count}</span>
        </div>
        <button type="button" className="btn-ghost h-6 px-2 text-[length:var(--app-text-11)]" onClick={onAdd}>
          <Icon name="plus" size={12} />
          {addLabel}
        </button>
      </div>
      {children}
    </section>
  )
}
