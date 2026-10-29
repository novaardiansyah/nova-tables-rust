import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../common/Icon.jsx'
import JsonView from './JsonView.jsx'

export const JSON_PANEL_DEFAULT_WIDTH = 360
const JSON_PANEL_MIN_WIDTH = 240
const JSON_PANEL_MAX_WIDTH = 800

export default function JsonPanel({
  collapsed = true,
  onToggleCollapsed,
  width = JSON_PANEL_DEFAULT_WIDTH,
  onWidthChange,
  jsonText = '',
  selectionLabel = 'Selection',
  onCopyJson,
  copied = false,
  onHoverVisibleChange,
}) {
  const [hoverOpen, setHoverOpen] = useState(false)
  const hoverOpenRef = useRef(false)
  const closeTimer = useRef(null)
  const railRef = useRef(null)

  const showOverlay = useCallback(() => {
    if (hoverOpenRef.current) return
    hoverOpenRef.current = true
    setHoverOpen(true)
    onHoverVisibleChange?.(true)
  }, [onHoverVisibleChange])

  const hideOverlay = useCallback(() => {
    if (!hoverOpenRef.current) return
    hoverOpenRef.current = false
    setHoverOpen(false)
    onHoverVisibleChange?.(false)
  }, [onHoverVisibleChange])

  useEffect(() => {
    if (!collapsed) return undefined

    const handlePointerMove = (event) => {
      const rect = railRef.current?.getBoundingClientRect()
      if (!rect) return
      const withinRow = event.clientY >= rect.top && event.clientY <= rect.bottom
      const overRail = withinRow && event.clientX >= rect.left && event.clientX <= rect.right
      const overPanel = withinRow && event.clientX >= rect.right - width && event.clientX <= rect.right

      window.clearTimeout(closeTimer.current)
      if (hoverOpenRef.current) {
        if (overPanel) return
        closeTimer.current = window.setTimeout(hideOverlay, 120)
        return
      }
      if (overRail) showOverlay()
    }

    window.addEventListener('mousemove', handlePointerMove)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.clearTimeout(closeTimer.current)
    }
  }, [collapsed, hideOverlay, showOverlay, width])

  useEffect(() => {
    if (!collapsed) hideOverlay()
  }, [collapsed, hideOverlay])

  const handleResizePointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return
      event.preventDefault()

      const startX = event.clientX
      const startWidth = width
      const move = (moveEvent) => {
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

  const renderPanel = (toggleAction) => (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="grid" size={12} className="shrink-0 text-text-muted" />
        <span className="text-[length:var(--app-text-11)] font-medium text-text-soft">{selectionLabel}</span>
        {onCopyJson ? (
          <button
            type="button"
            className="icon-btn ml-auto h-6 w-6"
            title="Copy JSON"
            onClick={onCopyJson}
          >
            <Icon name="copy" size={12} className={copied ? 'text-success' : undefined} />
          </button>
        ) : null}
        <button
          type="button"
          className={`icon-btn h-6 w-6 shrink-0 ${!onCopyJson ? 'ml-auto' : ''}`}
          title={toggleAction.title}
          aria-label={toggleAction.title}
          onClick={toggleAction.onClick}
        >
          <Icon name={toggleAction.icon} size={13} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {jsonText ? (
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
        <aside
          ref={railRef}
          className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-3"
        >
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

        <aside
          style={{ width }}
          className={`absolute inset-y-0 right-0 z-30 flex flex-col border-l border-line bg-panel shadow-2xl shadow-black/60 ${
            hoverOpen
              ? 'translate-x-0 opacity-100 transition-[opacity,transform] duration-200 ease-out'
              : 'translate-x-3 opacity-0 pointer-events-none transition-[opacity,transform] duration-150 ease-in'
          }`}
        >
          {renderPanel({
            icon: 'panel-right',
            title: 'Expand JSON review panel',
            onClick: () => onToggleCollapsed(false),
          })}
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