import React, { useCallback, useState } from 'react'
import Icon from '@/components/common/Icon'
import JsonView from '@/components/results/JsonView'
import FormViewer from '@/components/results/FormViewer'

export const JSON_PANEL_DEFAULT_WIDTH = 360
const JSON_PANEL_MIN_WIDTH = 240
const JSON_PANEL_MAX_WIDTH = 800

export interface JsonPanelProps {
  collapsed?: boolean
  onToggleCollapsed: (collapsed: boolean) => void
  width?: number
  onWidthChange: (width: number) => void
  jsonText?: string
  selectionLabel?: string
  onCopyJson?: () => void
  copied?: boolean
  columns?: string[]
  rows?: unknown[][]
  columnTypes?: (string | null)[]
  rowIndexes?: number[]
  onCellChange?: (row: number, columnName: string, nextValue: unknown, prevValue: unknown) => void
  driverType?: string | null
  timezone?: string
  onCopyText?: (payload: string, message?: string) => void
}

export default function JsonPanel({
  collapsed = true,
  onToggleCollapsed,
  width = JSON_PANEL_DEFAULT_WIDTH,
  onWidthChange,
  jsonText = '',
  selectionLabel = 'Selection',
  onCopyJson,
  copied = false,
  columns = [],
  rows = [],
  columnTypes = [],
  rowIndexes = [],
  onCellChange,
  driverType,
  timezone,
  onCopyText,
}: JsonPanelProps) {
  const [panelView, setPanelView] = useState<'json' | 'form'>('json')

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()

      const startX = event.clientX
      const startWidth = width
      const move = (moveEvent: PointerEvent) => {
        const next = Math.min(
          Math.max(startWidth + (startX - moveEvent.clientX), JSON_PANEL_MIN_WIDTH),
          JSON_PANEL_MAX_WIDTH,
        )
        onWidthChange(next)
      }
      const stop = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop)
    },
    [onWidthChange, width],
  )

  const renderPanel = (toggleAction: { icon: string; title: string; onClick: () => void }) => (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="grid" size={12} className="shrink-0 text-text-muted" />
        <span className="text-[length:var(--app-text-11)] font-medium text-text-soft truncate max-w-[120px]" title={selectionLabel}>
          {selectionLabel}
        </span>
        <div className="flex rounded-md border border-line bg-surface p-0.5 text-[length:var(--app-text-10)] ml-auto">
          <button
            type="button"
            onClick={() => setPanelView('json')}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              panelView === 'json'
                ? 'bg-tint/[0.08] text-text-strong'
                : 'text-text-muted hover:text-text'
            }`}
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => setPanelView('form')}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              panelView === 'form'
                ? 'bg-tint/[0.08] text-text-strong'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Form
          </button>
        </div>
        {onCopyJson ? (
          <button
            type="button"
            className="icon-btn h-6 w-6"
            title="Copy JSON"
            onClick={onCopyJson}
          >
            <Icon name="copy" size={12} className={copied ? 'text-success' : undefined} />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn h-6 w-6 shrink-0"
          title={toggleAction.title}
          aria-label={toggleAction.title}
          onClick={toggleAction.onClick}
        >
          <Icon name={toggleAction.icon} size={13} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panelView === 'form' ? (
          <FormViewer
            columns={columns}
            rows={rows}
            columnTypes={columnTypes}
            rowIndexes={rowIndexes}
            onCellChange={onCellChange}
            driverType={driverType}
            timezone={timezone}
            onCopyText={onCopyText}
          />
        ) : jsonText ? (
          <JsonView text={jsonText} />
        ) : (
          <p className="px-3 py-2 text-[length:var(--app-text-11)] text-text-faint">
            Select rows or cells to view JSON.
          </p>
        )}
      </div>
    </>
  )

  if (collapsed) {
    return (
      <>
        <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-3">
          <button
            type="button"
            className="icon-btn h-7 w-7"
            title="Show JSON review panel"
            aria-label="Show JSON review panel"
            onClick={() => onToggleCollapsed(false)}
          >
            <Icon name="panel-right" size={13} />
          </button>
        </aside>
      </>
    )
  }

  return (
    <aside style={{ width }} className="relative flex shrink-0 flex-col border-l border-line bg-panel">
      {renderPanel({
        icon: 'panel-right',
        title: 'Collapse JSON review panel',
        onClick: () => onToggleCollapsed(true),
      })}

      <div
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => onWidthChange(JSON_PANEL_DEFAULT_WIDTH)}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/40"
        title="Drag to resize"
      />
    </aside>
  )
}
