import { useEffect, useState } from 'react'
import Icon, { Spinner } from '../common/Icon.jsx'
import Select from '../common/Select.jsx'
import {
  APP_FONT_SIZE_MAX,
  DEFAULT_SETTINGS,
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  THEMES,
  TIMEZONES,
  applySettings,
  getResponsiveDefaultFontSize,
  normalizeSettings,
} from '../../settings.js'

const THEME_OPTIONS = THEMES.map((theme) => ({ value: theme.id, label: theme.label }))

const FONT_OPTIONS = FONT_FAMILIES.map((family) => ({ value: family.id, label: family.label }))

const TIMEZONE_OPTIONS = TIMEZONES.map((tz) => ({ value: tz.id, label: tz.label }))

function Row({ label, hint, children }) {
  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] items-center gap-4 py-2.5">
      <div className="min-w-0 pr-2">
        <p className="text-[length:var(--app-text-12)] font-medium text-text">{label}</p>
        {hint ? <p className="text-[length:var(--app-text-11)] text-text-muted leading-relaxed">{hint}</p> : null}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  )
}

function SizeInput({ label, value, min, max, onChange }) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const size = Math.round(Number(trimmed))
    if (!Number.isFinite(size) || size < min || size > max) return
    onChange(size)
  }

  const handleBlur = () => {
    const trimmed = text.trim()
    const size = Math.round(Number(trimmed))
    const next = trimmed && Number.isFinite(size) ? Math.min(Math.max(size, min), max) : value
    setText(String(next))
    onChange(next)
  }

  return (
    <div className="relative w-24 shrink-0">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        autoComplete="off"
        aria-label={label}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          commit(event.target.value)
        }}
        onBlur={handleBlur}
        className="field appearance-none pr-7 text-right"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[length:var(--app-text-10)] text-text-faint">
        px
      </span>
    </div>
  )
}

function Switch({ checked, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-elevated'
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform duration-150 ${
          checked ? 'translate-x-4 bg-on-accent' : 'bg-text-muted'
        }`}
      />
    </button>
  )
}

export default function SettingsDialog({ open, settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(settings)
    setSaving(false)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    applySettings(draft)
  }, [open, draft])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const update = (key) => (value) => setDraft((prev) => ({ ...prev, [key]: value }))

  const handleCancel = () => {
    applySettings(settings)
    onClose()
  }

  const handleReset = () => {
    const defaultSize = getResponsiveDefaultFontSize()
    setDraft({
      ...DEFAULT_SETTINGS,
      appFontSize: defaultSize,
      gridFontSize: defaultSize,
      jsonFontSize: defaultSize,
      queryFontSize: defaultSize,
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(normalizeSettings(draft))
    } catch {
      setSaving(false)
      return
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) handleCancel()
      }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl animate-fade-in overflow-y-auto overflow-x-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="settings" size={16} />
          </span>
          <div className="flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">Preferences</h2>
            <p className="text-[length:var(--app-text-11)] text-text-muted">Preferences for workspace appearance, query execution, and typography.</p>
          </div>
          <button type="button" className="icon-btn" onClick={handleCancel} title="Close" disabled={saving}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-4">
          <section>
            <p className="field-label">Appearance</p>
            <Row label="Color theme" hint="Workspace color palette">
              <Select
                value={draft.theme}
                options={THEME_OPTIONS}
                onChange={update('theme')}
                icon="settings"
                placeholder="Select theme"
                emptyLabel="No themes"
                panelAlign="right"
                className="w-56"
              />
            </Row>
          </section>

          <section className="border-t border-line pt-4">
            <p className="field-label">App</p>
            <Row label="Font" hint="Sidebar, tabs, headers, and dialogs">
              <div className="flex items-center gap-2">
                <Select
                  value={draft.appFontFamily}
                  options={FONT_OPTIONS}
                  onChange={update('appFontFamily')}
                  icon="settings"
                  placeholder="Select font"
                  emptyLabel="No fonts"
                  panelAlign="right"
                  className="w-44"
                />
                <SizeInput
                  label="App font size"
                  value={draft.appFontSize}
                  min={FONT_SIZE_MIN}
                  max={APP_FONT_SIZE_MAX}
                  onChange={update('appFontSize')}
                />
              </div>
            </Row>
          </section>

          <section className="border-t border-line pt-4">
            <p className="field-label">Result grid</p>
            <Row label="Font" hint="Grid cell typography in query results">
              <div className="flex items-center gap-2">
                <Select
                  value={draft.gridFontFamily}
                  options={FONT_OPTIONS}
                  onChange={update('gridFontFamily')}
                  icon="grid"
                  placeholder="Select font"
                  emptyLabel="No fonts"
                  panelAlign="right"
                  className="w-44"
                />
                <SizeInput
                  label="Result grid font size"
                  value={draft.gridFontSize}
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  onChange={update('gridFontSize')}
                />
              </div>
            </Row>
            <Row label="Timezone" hint="Display timezone for query datetime results">
              <Select
                value={draft.timezone}
                options={TIMEZONE_OPTIONS}
                onChange={update('timezone')}
                icon="clock"
                placeholder="Select timezone"
                emptyLabel="No timezones"
                panelAlign="right"
                className="w-60"
              />
            </Row>
          </section>

          <section className="border-t border-line pt-4">
            <p className="field-label">JSON viewer</p>
            <Row label="Font" hint="Side panel formatted JSON display">
              <div className="flex items-center gap-2">
                <Select
                  value={draft.jsonFontFamily}
                  options={FONT_OPTIONS}
                  onChange={update('jsonFontFamily')}
                  icon="folder"
                  placeholder="Select font"
                  emptyLabel="No fonts"
                  panelAlign="right"
                  className="w-44"
                />
                <SizeInput
                  label="JSON viewer font size"
                  value={draft.jsonFontSize}
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  onChange={update('jsonFontSize')}
                />
              </div>
            </Row>
          </section>

          <section className="border-t border-line pt-4">
            <p className="field-label">Query editor</p>
            <Row label="Font" hint="SQL editor and line numbers">
              <div className="flex items-center gap-2">
                <Select
                  value={draft.queryFontFamily}
                  options={FONT_OPTIONS}
                  onChange={update('queryFontFamily')}
                  icon="code"
                  placeholder="Select font"
                  emptyLabel="No fonts"
                  panelAlign="right"
                  className="w-44"
                />
                <SizeInput
                  label="Query editor font size"
                  value={draft.queryFontSize}
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  onChange={update('queryFontSize')}
                />
              </div>
            </Row>
            <Row label="Word wrap" hint="Wrap long SQL lines instead of scrolling horizontally">
              <span className="text-[length:var(--app-text-11)] text-text-muted">
                {draft.queryWordWrap ? 'On' : 'Off'}
              </span>
              <Switch
                checked={draft.queryWordWrap}
                label="Word wrap"
                onChange={update('queryWordWrap')}
              />
            </Row>
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <button type="button" className="btn-ghost" onClick={handleReset} disabled={saving}>
              <Icon name="refresh" size={13} />
              Reset to defaults
            </button>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-soft" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Spinner size={13} /> : <Icon name="check-circle" size={13} />}
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
