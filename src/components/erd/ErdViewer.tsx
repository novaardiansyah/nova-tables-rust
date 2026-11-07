import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import ContextMenu, { ContextMenuItem } from '@/components/common/ContextMenu'
import Icon, { Spinner } from '@/components/common/Icon'
import { ErdTable, ErdRelation, computeInitialPositions, erdRelationKey } from './erdTypes'
import ErdTableNode from './ErdTableNode'
import ErdRelationLine from './ErdRelationLine'
import { exportDiagramToPng } from './erdExport'

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
  const [actionsMenu, setActionsMenu] = useState<{ x: number; y: number } | null>(null)

  const [cardDimensions, setCardDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const [relationOffsets, setRelationOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const [viewOnly, setViewOnly] = useState(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const isDraggingCanvasRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const draggingTableRef = useRef<string | null>(null)
  const tableDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialTablePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const resizingTableRef = useRef<{ tableKey: string; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null)
  const draggingRelationRef = useRef<{ relKey: string; startX: number; startY: number; initialOffset: { x: number; y: number } } | null>(null)

  const loadData = useCallback(async (currentDepth: number = depth) => {
    if (!connectionId || !database) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getErdData(
        connectionId,
        database,
        initialTables.length > 0 ? initialTables : [],
        includeRelated,
        currentDepth,
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
  }, [connectionId, database, initialTables, includeRelated, depth])

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
    if (viewOnly) return
    e.stopPropagation()
    draggingTableRef.current = tableKey
    tableDragStartRef.current = { x: e.clientX, y: e.clientY }
    initialTablePosRef.current = positions[tableKey] || { x: 0, y: 0 }
  }

  const handleTableResizeStart = (
    e: React.MouseEvent,
    tableKey: string,
    currentWidth: number,
    currentHeight: number,
  ) => {
    if (viewOnly) return
    e.stopPropagation()
    resizingTableRef.current = {
      tableKey,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
    }
  }

  const handleRelationDragStart = (e: React.MouseEvent, relKey: string) => {
    if (viewOnly) return
    e.stopPropagation()
    const currentOffset = relationOffsets[relKey] || { x: 0, y: 0 }
    draggingRelationRef.current = {
      relKey,
      startX: e.clientX,
      startY: e.clientY,
      initialOffset: currentOffset,
    }
  }

  const handlePointerMove = (e: React.MouseEvent) => {
    if (resizingTableRef.current) {
      const { tableKey, startX, startY, startWidth, startHeight } = resizingTableRef.current
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      const newWidth = Math.min(500, Math.max(220, Math.round(startWidth + dx)))
      const newHeight = Math.min(600, Math.max(100, Math.round(startHeight + dy)))
      setCardDimensions((prev) => ({
        ...prev,
        [tableKey]: { width: newWidth, height: newHeight },
      }))
      return
    }

    if (draggingRelationRef.current) {
      const { relKey, startX, startY, initialOffset } = draggingRelationRef.current
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      setRelationOffsets((prev) => ({
        ...prev,
        [relKey]: {
          x: Math.round(initialOffset.x + dx),
          y: Math.round(initialOffset.y + dy),
        },
      }))
      return
    }

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
    resizingTableRef.current = null
    draggingRelationRef.current = null
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
    if (viewOnly) return
    const fresh = computeInitialPositions(tables, relations)
    setPositions(fresh)
    setRelationOffsets({})
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
      const dim = cardDimensions[key] || { width: 260, height: 240 }
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + dim.width)
      maxY = Math.max(maxY, pos.y + dim.height)
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

  const handleSavePng = () => {
    void exportDiagramToPng(
      database,
      tables,
      relations,
      positions,
      cardDimensions,
      relationOffsets,
    )
  }

  const handleViewOnlyToggle = () => {
    setViewOnly((prev) => !prev)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-base">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-panel px-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Icon name="search" size={12} className="pointer-events-none absolute left-2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table or column…"
              className="h-7 w-64 rounded-md border border-line bg-surface pl-7 pr-2 text-[length:var(--app-text-11)] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
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
        </div>

        <div className="flex items-center gap-2">
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
          </div>

          <div className="h-4 w-px bg-line" />

          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setActionsMenu({ x: rect.right - 188, y: rect.bottom + 4 })
            }}
            className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[length:var(--app-text-11)] text-text-muted hover:border-line-strong hover:text-text"
            title="More diagram actions"
          >
            <Icon name="more-horizontal" size={13} />
            <span>Actions</span>
          </button>

          {viewOnly ? (
            <button
              type="button"
              onClick={handleViewOnlyToggle}
              className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[length:var(--app-text-11)] font-medium text-warning hover:bg-warning/20 transition-colors"
              title="Toggle view-only mode"
            >
              <Icon name="eye" size={12} />
              <span>View-Only</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleViewOnlyToggle}
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-[length:var(--app-text-11)] text-text-muted hover:border-line-strong hover:text-text transition-colors"
              title="Toggle view-only mode"
            >
              <Icon name="eye" size={12} />
              <span>View-Only</span>
            </button>
          )}

          {actionsMenu ? (
            <ContextMenu
              x={actionsMenu.x}
              y={actionsMenu.y}
              items={
                [
                  { id: 'auto-arrange', label: 'Auto-Arrange Tables', onSelect: handleAutoArrange, disabled: viewOnly },
                  {
                    id: 'depth',
                    label: `Relation Depth: Level ${depth}`,
                    children: [
                      {
                        id: 'depth-1',
                        label: depth === 1 ? '✓ Level 1 (Direct)' : 'Level 1 (Direct)',
                        onSelect: () => {
                          setDepth(1)
                          void loadData(1)
                        },
                      },
                      {
                        id: 'depth-2',
                        label: depth === 2 ? '✓ Level 2 (2 Levels)' : 'Level 2 (2 Levels)',
                        onSelect: () => {
                          setDepth(2)
                          void loadData(2)
                        },
                      },
                      {
                        id: 'depth-3',
                        label: depth === 3 ? '✓ Level 3 (3 Levels)' : 'Level 3 (3 Levels)',
                        onSelect: () => {
                          setDepth(3)
                          void loadData(3)
                        },
                      },
                    ],
                  },
                  { id: 'reset-view', label: 'Reset View (100%)', onSelect: handleResetView },
                  { id: 'export-png', label: 'Save as PNG', onSelect: handleSavePng },
                  {
                    id: 'toggle-view-only',
                    label: viewOnly ? 'View-Only Mode (Enabled)' : 'View-Only Mode (Disabled)',
                    onSelect: handleViewOnlyToggle,
                  },
                ] as ContextMenuItem[]
              }
              onClose={() => setActionsMenu(null)}
            />
          ) : null}
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
                  const sWidth = cardDimensions[sKey]?.width ?? 260
                  const tWidth = cardDimensions[tKey]?.width ?? 260
                  const relKey = erdRelationKey(rel)
                  const offset = relationOffsets[relKey]

                  const isRelHovered = hoveredRelation?.name === rel.name
                  const isTableHovered = hoveredTableKey === sKey || hoveredTableKey === tKey
                  const isHighlighted = isRelHovered || isTableHovered
                  const isDimmed = Boolean((hoveredRelation && !isRelHovered) || (hoveredTableKey && !isTableHovered))

                  return (
                    <ErdRelationLine
                      key={relKey}
                      relation={rel}
                      sourcePos={sPos}
                      targetPos={tPos}
                      sourceWidth={sWidth}
                      targetWidth={tWidth}
                      offset={offset}
                      isHighlighted={isHighlighted}
                      isDimmed={isDimmed}
                      onMouseEnter={() => setHoveredRelation(rel)}
                      onMouseLeave={() => setHoveredRelation(null)}
                      onDragStart={handleRelationDragStart}
                      viewOnly={viewOnly}
                    />
                  )
                })}
              </g>
            </svg>

            <div className="pointer-events-auto">
              {tables.map((table) => {
                const key = `${table.schema}.${table.name}`
                const pos = positions[key] || { x: 0, y: 0 }
                const dim = cardDimensions[key]

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
                      dimension={dim}
                      isHighlighted={isHighlighted}
                      isDimmed={isDimmed}
                      searchQuery={search}
                      onDragStart={handleTableDragStart}
                      onResizeStart={handleTableResizeStart}
                      onBrowse={onOpenTable}
                      onOpenStructure={onOpenStructure}
                      viewOnly={viewOnly}
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
