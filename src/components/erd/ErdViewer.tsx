import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import Icon, { Spinner } from '@/components/common/Icon'
import { ErdTable, ErdRelation, computeInitialPositions } from './erdTypes'
import ErdTableNode from './ErdTableNode'
import ErdRelationLine from './ErdRelationLine'

export interface ErdViewerProps {
  connectionId: string
  database: string
  initialTables?: string[]
  depth?: number
  includeRelated?: boolean
  sourceSql?: string
  driverType?: string | null
  onOpenTable?: (schema: string, name: string) => void
  onOpenStructure?: (table: { schema: string; name: string }) => void
}

export default function ErdViewer({
  connectionId,
  database,
  initialTables = [],
  depth: initialDepth = 1,
  includeRelated = true,
  driverType,
  onOpenTable,
  onOpenStructure,
}: ErdViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<ErdTable[]>([])
  const [relations, setRelations] = useState<ErdRelation[]>([])
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [depth, setDepth] = useState<number>(initialDepth)

  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [search, setSearch] = useState('')
  const [hoveredRelation, setHoveredRelation] = useState<ErdRelation | null>(null)
  const [hoveredTableKey, setHoveredTableKey] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const isDraggingCanvasRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const draggingTableRef = useRef<string | null>(null)
  const tableDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialTablePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const loadData = useCallback(async () => {
    if (!connectionId || !database) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getErdData(
        connectionId,
        database,
        initialTables.length > 0 ? initialTables : [],
        includeRelated,
      )
      if (res && res.ok) {
        setTables(res.tables || [])
        setRelations(res.relations || [])
        const initialPos = computeInitialPositions(res.tables || [], res.relations || [])
        setPositions(initialPos)
      } else {
        setError('Failed to load ERD metadata.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, database, initialTables, includeRelated])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handlePointerDownCanvas = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.erd-node') || (e.target as HTMLElement).closest('button')) {
      return
    }
    isDraggingCanvasRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    panStartRef.current = { ...pan }
  }

  const handleTableDragStart = (e: React.MouseEvent, tableKey: string) => {
    e.stopPropagation()
    draggingTableRef.current = tableKey
    tableDragStartRef.current = { x: e.clientX, y: e.clientY }
    initialTablePosRef.current = positions[tableKey] || { x: 0, y: 0 }
  }

  const handlePointerMove = (e: React.MouseEvent) => {
    if (draggingTableRef.current) {
      const dx = (e.clientX - tableDragStartRef.current.x) / zoom
      const dy = (e.clientY - tableDragStartRef.current.y) / zoom
      const key = draggingTableRef.current
      setPositions((prev) => ({
        ...prev,
        [key]: {
          x: Math.round(initialTablePosRef.current.x + dx),
          y: Math.round(initialTablePosRef.current.y + dy),
        },
      }))
      return
    }

    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      })
    }
  }

  const handlePointerUp = () => {
    isDraggingCanvasRef.current = false
    draggingTableRef.current = null
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.1 : -0.1
      setZoom((z) => Math.min(2.0, Math.max(0.25, Number((z + delta).toFixed(2)))))
    } else {
      setPan((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      }))
    }
  }

  const handleResetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const handleAutoArrange = () => {
    const fresh = computeInitialPositions(tables, relations)
    setPositions(fresh)
    handleResetView()
  }

  const handleFitScreen = () => {
    if (tables.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const table of tables) {
      const key = `${table.schema}.${table.name}`
      const pos = positions[key] || { x: 0, y: 0 }
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + 260)
      maxY = Math.max(maxY, pos.y + 240)
    }

    const canvasWidth = canvasRef.current?.clientWidth || 1000
    const canvasHeight = canvasRef.current?.clientHeight || 700

    const contentWidth = Math.max(100, maxX - minX + 120)
    const contentHeight = Math.max(100, maxY - minY + 120)

    const nextZoom = Math.min(1.2, Math.max(0.3, Math.min(canvasWidth / contentWidth, canvasHeight / contentHeight)))
    setZoom(Number(nextZoom.toFixed(2)))
    setPan({
      x: (canvasWidth - contentWidth * nextZoom) / 2 - minX * nextZoom + 60 * nextZoom,
      y: (canvasHeight - contentHeight * nextZoom) / 2 - minY * nextZoom + 60 * nextZoom,
    })
  }

  const handleExportSvg = () => {
    if (!canvasRef.current) return
    const svgElem = canvasRef.current.querySelector('svg.erd-canvas-svg')
    if (!svgElem) return
    const svgContent = new XMLSerializer().serializeToString(svgElem)
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erd-${database}-${Date.now()}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-base">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-panel px-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[length:var(--app-text-12)] font-semibold text-text-strong">
            <Icon name="er-diagram" size={15} className="text-accent" />
            <span>Entity Relationship Diagram</span>
            <span className="rounded bg-tint/[0.08] px-1.5 py-0.5 text-[length:var(--app-text-10)] font-normal text-text-muted">
              {database}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[length:var(--app-text-11)] text-text-faint">
            <span>{tables.length} tables</span>
            <span>·</span>
            <span>{relations.length} relationships</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Icon name="search" size={12} className="pointer-events-none absolute left-2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table or column…"
              className="h-7 w-44 rounded-md border border-line bg-surface pl-7 pr-2 text-[length:var(--app-text-11)] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 text-text-faint hover:text-text"
              >
                <Icon name="x" size={10} />
              </button>
            ) : null}
          </div>

          <div className="h-4 w-px bg-line" />

          <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 text-[length:var(--app-text-11)]">
            <span className="px-1.5 text-text-faint">Depth:</span>
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepth(d)}
                className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                  depth === d ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
                }`}
                title={`Level ${d} relations`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-line" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.1).toFixed(2))))}
              className="icon-btn h-7 w-7 text-text-muted hover:text-text"
              title="Zoom out"
            >
              -
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="h-7 px-2 text-[length:var(--app-text-11)] font-mono text-text-muted hover:text-text"
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
              className="icon-btn h-7 w-7 text-text-muted hover:text-text"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleFitScreen}
              className="icon-btn h-7 w-7 text-text-muted hover:text-text"
              title="Fit to screen"
            >
              <Icon name="grid" size={12} />
            </button>
            <button
              type="button"
              onClick={handleAutoArrange}
              className="icon-btn h-7 w-7 text-text-muted hover:text-text"
              title="Auto arrange tables"
            >
              <Icon name="refresh" size={12} />
            </button>
          </div>

          <div className="h-4 w-px bg-line" />

          <button
            type="button"
            onClick={handleExportSvg}
            className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[length:var(--app-text-11)] text-text-muted hover:border-line-strong hover:text-text"
            title="Export diagram as SVG"
          >
            <Icon name="download" size={12} />
            <span>Export</span>
          </button>
        </div>
      </div>

      <div
        ref={canvasRef}
        onMouseDown={handlePointerDownCanvas}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onWheel={handleWheel}
        className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[length:var(--app-text-12)] text-text-muted">
            <Spinner size={16} className="text-accent" />
            <span>Generating Entity Relationship Diagram…</span>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-[length:var(--app-text-12)] text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-2 rounded bg-accent px-3 py-1.5 text-[length:var(--app-text-12)] font-medium text-on-accent"
            >
              Retry
            </button>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-[length:var(--app-text-12)] text-text-muted">
            No tables found for ERD.
          </div>
        ) : (
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            className="absolute inset-0 pointer-events-none"
          >
            <svg
              className="erd-canvas-svg pointer-events-none absolute inset-0 overflow-visible"
              style={{ width: '100%', height: '100%' }}
            >
              <defs>
                <pattern id="erd-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1" fill="rgb(var(--color-line))" fillOpacity="0.5" />
                </pattern>
              </defs>
              <rect width="20000" height="20000" x="-10000" y="-10000" fill="url(#erd-grid)" />

              <g className="pointer-events-auto">
                {relations.map((rel) => {
                  const sKey = `${rel.sourceSchema}.${rel.sourceTable}`
                  const tKey = `${rel.targetSchema}.${rel.targetTable}`
                  const sPos = positions[sKey] || { x: 0, y: 0 }
                  const tPos = positions[tKey] || { x: 0, y: 0 }

                  const isRelHovered = hoveredRelation?.name === rel.name
                  const isTableHovered = hoveredTableKey === sKey || hoveredTableKey === tKey
                  const isHighlighted = isRelHovered || isTableHovered
                  const isDimmed = Boolean((hoveredRelation && !isRelHovered) || (hoveredTableKey && !isTableHovered))

                  return (
                    <ErdRelationLine
                      key={`${rel.name}-${rel.sourceTable}-${rel.targetTable}-${rel.sourceColumn}`}
                      relation={rel}
                      sourcePos={sPos}
                      targetPos={tPos}
                      isHighlighted={isHighlighted}
                      isDimmed={isDimmed}
                      onMouseEnter={() => setHoveredRelation(rel)}
                      onMouseLeave={() => setHoveredRelation(null)}
                    />
                  )
                })}
              </g>
            </svg>

            <div className="pointer-events-auto">
              {tables.map((table) => {
                const key = `${table.schema}.${table.name}`
                const pos = positions[key] || { x: 0, y: 0 }

                const isConnectedToHoveredRel =
                  hoveredRelation &&
                  (`${hoveredRelation.sourceSchema}.${hoveredRelation.sourceTable}` === key ||
                    `${hoveredRelation.targetSchema}.${hoveredRelation.targetTable}` === key)

                const isHovered = hoveredTableKey === key
                const isHighlighted = Boolean(isConnectedToHoveredRel || isHovered)
                const isDimmed = Boolean(
                  (hoveredRelation && !isConnectedToHoveredRel) ||
                    (hoveredTableKey && !isHovered && !isConnectedToHoveredRel),
                )

                return (
                  <div
                    key={key}
                    onMouseEnter={() => setHoveredTableKey(key)}
                    onMouseLeave={() => setHoveredTableKey(null)}
                  >
                    <ErdTableNode
                      table={table}
                      position={pos}
                      isHighlighted={isHighlighted}
                      isDimmed={isDimmed}
                      searchQuery={search}
                      onDragStart={handleTableDragStart}
                      onBrowse={onOpenTable}
                      onOpenStructure={onOpenStructure}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
