import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon.jsx'
import CellEditor from './ResultGridCell.jsx'

const RENDER_LIMIT = 2000
const DATE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/


function compareValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

const FRAME_CURSORS = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

const FRAME_HANDLES = [
  { id: 'nw', className: '-left-[4px] -top-[4px] cursor-nwse-resize' },
  { id: 'n', className: '-top-[4px] left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { id: 'ne', className: '-right-[4px] -top-[4px] cursor-nesw-resize' },
  { id: 'e', className: '-right-[4px] top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { id: 'se', className: '-bottom-[4px] -right-[4px] cursor-nwse-resize' },
  { id: 's', className: '-bottom-[4px] left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { id: 'sw', className: '-bottom-[4px] -left-[4px] cursor-nesw-resize' },
  { id: 'w', className: '-left-[4px] top-1/2 -translate-y-1/2 cursor-ew-resize' },
]

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function frameResize(drag, rowDelta, colDelta, rowCount, colCount) {
  const { corner, base } = drag
  let { rowStart, rowEnd, colStart, colEnd } = base
  if (corner.includes('n')) rowStart = clamp(base.rowStart + rowDelta, 0, base.rowEnd)
  if (corner.includes('s')) rowEnd = clamp(base.rowEnd + rowDelta, base.rowStart, rowCount - 1)
  if (corner.includes('w')) colStart = clamp(base.colStart + colDelta, 0, base.colEnd)
  if (corner.includes('e')) colEnd = clamp(base.colEnd + colDelta, base.colStart, colCount - 1)
  return { anchor: { row: rowStart, col: colStart }, focus: { row: rowEnd, col: colEnd } }
}

function cellRect(table, row, col) {
  const node = table?.querySelector(`[data-cell="${row}:${col}"]`)
  return node ? node.getBoundingClientRect() : null
}

function frameRect(bounds, table) {
  if (!bounds || !table) return null
  const first = cellRect(table, bounds.rowStart, bounds.colStart)
  const last = cellRect(table, bounds.rowEnd, bounds.colEnd)
  if (!first || !last) return null
  const base = table.getBoundingClientRect()
  return {
    left: first.left - base.left,
    top: first.top - base.top,
    width: last.right - first.left,
    height: last.bottom - first.top,
  }
}

function editRange(active, bounds) {
  const within =
    bounds &&
    active.row >= bounds.rowStart &&
    active.row <= bounds.rowEnd &&
    active.col >= bounds.colStart &&
    active.col <= bounds.colEnd
  if (!within) {
    return { rowStart: active.row, rowEnd: active.row, colStart: active.col, colEnd: active.col }
  }
  return bounds
}

export default function ResultGrid({
  columns,
  rows,
  relations,
  onRelationClick,
  selection = null,
  onSelectionChange,
  onCellContextMenu,
  onHeaderContextMenu,
  editable = false,
  editableColumns = null,
  editing = false,
  edits = {},
  onCellChange,
  onStartEdit,
  onInspectCell,
  deleteMode = false,
  deletingRows = [],
  onDeleteRows,
}) {
  const [sort, setSort] = useState(null)
  const [active, setActive] = useState(null)
  const [frame, setFrame] = useState(null)
  const [frameDragging, setFrameDragging] = useState(false)
  const draggingRef = useRef(false)
  const draggedRef = useRef(false)
  const preClickBoundsRef = useRef(null)
  const frameDragRef = useRef(null)
  const tableRef = useRef(null)
  const editorRef = useRef(null)

  useEffect(() => {
    setSort(null)
  }, [rows])

  useEffect(() => {
    if (!active) return undefined
    const commitOutside = (event) => {
      const editor = editorRef.current
      if (!editor || editor.contains(event.target)) return
      editor.commit()
    }
    window.addEventListener('mousedown', commitOutside, true)
    return () => window.removeEventListener('mousedown', commitOutside, true)
  }, [active])

  useEffect(() => {
    setActive(null)
  }, [editable, rows])

  useEffect(() => {
    if (!editing) setActive(null)
  }, [editing])

  useEffect(() => {
    const stop = () => {
      draggingRef.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.setTimeout(() => {
        draggedRef.current = false
      }, 0)
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const orderedRows = useMemo(() => {
    const entries = rows.map((row, origIndex) => ({ row, origIndex }))
    if (!sort || sort.index >= columns.length) return entries

    const factor = sort.direction === 'asc' ? 1 : -1
    const columnIndex = sort.index

    return entries.sort((left, right) => {
      const leftValue = left.row[columnIndex]
      const rightValue = right.row[columnIndex]
      const leftEmpty = leftValue === null || leftValue === undefined
      const rightEmpty = rightValue === null || rightValue === undefined
      if (leftEmpty || rightEmpty) {
        if (leftEmpty && rightEmpty) return 0
        return leftEmpty ? 1 : -1
      }
      return factor * compareValues(leftValue, rightValue)
    })
  }, [columns.length, rows, sort])

  const visibleRows = useMemo(
    () => (orderedRows.length > RENDER_LIMIT ? orderedRows.slice(0, RENDER_LIMIT) : orderedRows),
    [orderedRows],
  )

  const handleSort = (index) => {
    setSort((prev) => {
      if (!prev || prev.index !== index) return { index, direction: 'asc' }
      if (prev.direction === 'asc') return { index, direction: 'desc' }
      return null
    })
  }

  const relationMap = useMemo(() => {
    const map = new Map()
    for (const relation of relations ?? []) {
      map.set(String(relation.column).toLowerCase(), relation)
    }
    return map
  }, [relations])

  const columnRelations = useMemo(
    () => columns.map((column) => relationMap.get(String(column.name).toLowerCase()) ?? null),
    [columns, relationMap],
  )

  const columnEditable = (columnIndex) => {
    if (!editable || columnRelations[columnIndex]) return false
    if (!editableColumns) return true
    const column = columns[columnIndex]
    return Boolean(column && editableColumns.has(column.name))
  }

  const numericColumns = useMemo(
    () =>
      columns.map((_, index) => {
        let hasNumber = false
        for (const entry of visibleRows) {
          const value = entry.row[index]
          if (value === null || value === undefined) continue
          if (typeof value !== 'number') return false
          hasNumber = true
        }
        return hasNumber
      }),
    [columns, visibleRows],
  )

  const cellValue = (origIndex, columnIndex) => rows[origIndex]?.[columnIndex]

  const bounds = useMemo(() => {
    if (!selection) return null
    return {
      rowStart: Math.min(selection.anchor.row, selection.focus.row),
      rowEnd: Math.max(selection.anchor.row, selection.focus.row),
      colStart: Math.min(selection.anchor.col, selection.focus.col),
      colEnd: Math.max(selection.anchor.col, selection.focus.col),
    }
  }, [selection])

  const inSelection = (origIndex, colIndex) =>
    Boolean(
      bounds &&
        origIndex >= bounds.rowStart &&
        origIndex <= bounds.rowEnd &&
        colIndex >= bounds.colStart &&
        colIndex <= bounds.colEnd,
    )

  const rowSelected = (origIndex) =>
    Boolean(bounds && origIndex >= bounds.rowStart && origIndex <= bounds.rowEnd)

  const handleCellDoubleClick = (event, origIndex, columnIndex) => {
    if (draggedRef.current || event.shiftKey) return
    if (!onCellChange || !columnEditable(columnIndex)) {
      onInspectCell?.(columnIndex, origIndex)
      return
    }
    const captured = preClickBoundsRef.current
    preClickBoundsRef.current = null
    const block =
      captured &&
      (captured.rowStart !== captured.rowEnd || captured.colStart !== captured.colEnd) &&
      origIndex >= captured.rowStart &&
      origIndex <= captured.rowEnd &&
      columnIndex >= captured.colStart &&
      columnIndex <= captured.colEnd
    if (block) {
      onSelectionChange?.({
        anchor: { row: captured.rowStart, col: captured.colStart },
        focus: { row: captured.rowEnd, col: captured.colEnd },
      })
    }
    onStartEdit?.()
    setActive({ row: origIndex, col: columnIndex })
  }

  const handleCellContextMenu = (event, origIndex, columnIndex) => {
    event.preventDefault()
    setActive(null)
    if (!inSelection(origIndex, columnIndex) && onSelectionChange) {
      onSelectionChange({ anchor: { row: origIndex, col: columnIndex }, focus: { row: origIndex, col: columnIndex } })
    }
    onCellContextMenu?.(event.clientX, event.clientY, columnIndex, origIndex)
  }

  const beginDrag = (event, anchor, focus) => {
    event.preventDefault()
    event.stopPropagation()
    draggingRef.current = true
    document.body.style.userSelect = 'none'
    onSelectionChange({ anchor, focus })
  }

  const handleCellMouseDown = (event, origIndex, columnIndex) => {
    if (event.button !== 0 || !onSelectionChange) return
    if (event.detail === 1) preClickBoundsRef.current = bounds
    const cell = { row: origIndex, col: columnIndex }
    beginDrag(event, event.shiftKey && selection ? selection.anchor : cell, cell)
  }

  const handleCellMouseEnter = (origIndex, columnIndex) => {
    if (!draggingRef.current || !onSelectionChange) return
    draggedRef.current = true
    onSelectionChange((current) =>
      current ? { anchor: current.anchor, focus: { row: origIndex, col: columnIndex } } : current,
    )
  }

  const handleRowHeaderMouseDown = (event, origIndex) => {
    if (event.button !== 0 || !onSelectionChange) return
    const last = Math.max(columns.length - 1, 0)
    const cell = { row: origIndex, col: last }
    beginDrag(event, event.shiftKey && selection ? selection.anchor : { row: origIndex, col: 0 }, cell)
  }

  const handleRowHeaderMouseEnter = (origIndex) => {
    if (!draggingRef.current || !onSelectionChange) return
    draggedRef.current = true
    const last = Math.max(columns.length - 1, 0)
    onSelectionChange((current) =>
      current ? { anchor: current.anchor, focus: { row: origIndex, col: last } } : current,
    )
  }

  const startFrameDrag = (event, corner) => {
    if (event.button !== 0 || !bounds) return
    const table = tableRef.current
    const top = cellRect(table, bounds.rowStart, bounds.colStart)
    const bottom = cellRect(table, bounds.rowEnd, bounds.colEnd)
    if (!top || !bottom) return
    event.preventDefault()
    event.stopPropagation()
    draggingRef.current = false
    document.body.style.userSelect = 'none'
    document.body.style.cursor = FRAME_CURSORS[corner]
    frameDragRef.current = {
      corner,
      base: bounds,
      startX: event.clientX,
      startY: event.clientY,
      rowSize: corner.includes('n') ? top.height : bottom.height,
      colSize: corner.includes('w') ? top.width : bottom.width,
    }
    setFrameDragging(true)
  }

  const handleFrameMove = useCallback(
    (event) => {
      const drag = frameDragRef.current
      if (!drag) return
      const rowDelta = drag.rowSize > 0 ? Math.round((event.clientY - drag.startY) / drag.rowSize) : 0
      const colDelta = drag.colSize > 0 ? Math.round((event.clientX - drag.startX) / drag.colSize) : 0
      onSelectionChange?.(frameResize(drag, rowDelta, colDelta, rows.length, columns.length))
    },
    [columns.length, onSelectionChange, rows.length],
  )

  const endFrameDrag = useCallback(() => {
    frameDragRef.current = null
    setFrameDragging(false)
    document.body.style.cursor = ''
    window.setTimeout(() => {
      draggedRef.current = false
    }, 0)
  }, [])

  useEffect(() => {
    if (!frameDragging) return
    window.addEventListener('mousemove', handleFrameMove)
    window.addEventListener('mouseup', endFrameDrag)
    return () => {
      window.removeEventListener('mousemove', handleFrameMove)
      window.removeEventListener('mouseup', endFrameDrag)
    }
  }, [endFrameDrag, frameDragging, handleFrameMove])

  useEffect(() => {
    if (!bounds || active || !onDeleteRows) return
    const handleKeyDown = (event) => {
      if (event.key !== 'Delete') return
      const target = event.target
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable ||
        target?.closest?.('.monaco-editor')
      ) {
        return
      }
      event.preventDefault()
      const rowIndexes = []
      for (let r = bounds.rowStart; r <= bounds.rowEnd; r += 1) {
        rowIndexes.push(r)
      }
      onDeleteRows(rowIndexes)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, bounds, onDeleteRows])

  const commitEdit = (value) => {
    if (!active || !onCellChange) return
    const range = editRange(active, bounds)
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        const column = columns[col]
        if (!column || !columnEditable(col)) continue
        onCellChange(row, column.name, value, cellValue(row, col))
      }
    }
    setActive(null)
  }

  const cancelEdit = () => setActive(null)

  useLayoutEffect(() => {
    const measure = () => {
      const next = frameRect(bounds, tableRef.current)
      setFrame((current) => {
        if (!next) return current === null ? current : null
        if (
          current &&
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.height === next.height
        ) {
          return current
        }
        return next
      })
    }

    measure()
    const table = tableRef.current
    if (!table) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(table)
    return () => observer.disconnect()
  }, [bounds, rows, sort, visibleRows])

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[var(--grid-font-size)] text-text-muted">
          Query returned no rows
          {columns.length > 0 ? ` (${columns.length} columns)` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full select-none overflow-auto">
      <div className="relative min-w-full">
        <table
          ref={tableRef}
          className="min-w-full border-separate border-spacing-0"
          style={{ fontFamily: 'var(--grid-font-family)', fontSize: 'var(--grid-font-size)' }}
        >
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-12 border-b border-r border-line bg-elevated px-2 py-1.5 text-right text-[length:calc(var(--grid-font-size)-2px)] font-medium text-text-faint">
                #
              </th>
              {columns.map((column, index) => (
                <th
                  key={`${column.name}-${index}`}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onHeaderContextMenu?.(event.clientX, event.clientY, index)
                  }}
                  className={`sticky top-0 z-20 whitespace-nowrap border-b border-line bg-elevated text-[length:calc(var(--grid-font-size)-1px)] font-semibold tracking-wide text-text-soft ${
                    numericColumns[index] ? 'text-right' : 'text-left'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(index)}
                    title={`Sort by ${column.name}`}
                    className={`group/sort flex w-full items-center gap-1.5 px-3 py-1.5 hover:text-text ${
                      numericColumns[index] ? 'justify-end' : ''
                    }`}
                  >
                    <span>{column.name}</span>
                    <Icon
                      name={
                        sort?.index === index
                          ? sort.direction === 'asc'
                            ? 'sort-asc'
                            : 'sort-desc'
                          : 'sort-idle'
                      }
                      size={11}
                      className={`shrink-0 ${
                        sort?.index === index
                          ? 'text-accent'
                          : 'text-text-faint opacity-0 group-hover/sort:opacity-100'
                      }`}
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, origIndex }, visibleIdx) => (
              <tr
                key={origIndex}
                className={`group ${rowSelected(origIndex) ? 'bg-tint/[0.04]' : ''} ${
                  deleteMode && deletingRows.includes(origIndex) ? 'bg-danger/[0.08]' : ''
                }`}
              >
                <td
                  onMouseDown={(event) => handleRowHeaderMouseDown(event, origIndex)}
                  onMouseEnter={() => handleRowHeaderMouseEnter(origIndex)}
                  className={`sticky left-0 z-10 cursor-pointer border-b border-r border-line px-2 py-[5px] text-right font-mono text-[length:calc(var(--grid-font-size)-2px)] text-text-faint group-hover:bg-row-hover ${
                    deleteMode && deletingRows.includes(origIndex)
                      ? 'bg-danger/[0.10]'
                      : rowSelected(origIndex)
                        ? 'bg-tint/[0.04]'
                        : 'bg-surface'
                  }`}
                >
                  {visibleIdx + 1}
                </td>
                {columns.map((column, colIndex) => {
                  const cellKey = `${origIndex}:${column.name}`
                  const dirty = cellKey in edits
                  const display = dirty ? edits[cellKey].value : row[colIndex]
                  return (
                    <td
                      key={column.name}
                      data-cell={`${origIndex}:${colIndex}`}
                      onDoubleClick={(event) => handleCellDoubleClick(event, origIndex, colIndex)}
                      onMouseDown={(event) => handleCellMouseDown(event, origIndex, colIndex)}
                      onMouseEnter={() => handleCellMouseEnter(origIndex, colIndex)}
                      onContextMenu={(event) => handleCellContextMenu(event, origIndex, colIndex)}
                      title={dirty ? 'Pending update' : undefined}
                      className={`relative whitespace-nowrap border-b border-line/70 px-3 py-[5px] group-hover:bg-row-hover ${
                        numericColumns[colIndex] ? 'text-right tabular-nums' : ''
                      } ${
                        deleteMode && deletingRows.includes(origIndex)
                          ? 'bg-danger/[0.06]'
                          : inSelection(origIndex, colIndex)
                            ? 'bg-accent/[0.12]'
                            : dirty
                              ? 'bg-warning/[0.08]'
                              : ''
                      } ${
                        editable && columnEditable(colIndex) ? 'cursor-text' : ''
                      }`}
                    >
                      {active?.row === origIndex && active?.col === colIndex ? (
                        <CellEditor
                          value={display}
                          onCommit={commitEdit}
                          onCancel={cancelEdit}
                          controllerRef={editorRef}
                        />
                      ) : columnRelations[colIndex] && display !== null && display !== undefined ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRelationClick(columnRelations[colIndex], display)
                          }}
                          title={`Navigate to ${columnRelations[colIndex].referencedTable} (${columnRelations[colIndex].referencedColumn} = ${String(display)})`}
                          className="cursor-pointer border-b border-dashed border-text-muted/50 hover:border-text-soft"
                        >
                          {String(display)}
                        </button>
                      ) : (
                        <Cell value={display} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {frame ? (
          <div
            className="pointer-events-none absolute z-[5] border-2 border-accent"
            style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          >
            {FRAME_HANDLES.map((handle) => (
              <span
                key={handle.id}
                onMouseDown={(event) => startFrameDrag(event, handle.id)}
                className={`absolute h-2 w-2 rounded-[2px] border border-accent bg-elevated ${handle.className} ${
                  frameDragging ? 'pointer-events-none' : 'pointer-events-auto'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {orderedRows.length > RENDER_LIMIT ? (
        <p className="px-3 py-2 text-[length:calc(var(--grid-font-size)-1px)] text-text-muted">
          Showing the first {RENDER_LIMIT.toLocaleString()} of {orderedRows.length.toLocaleString()} rows.
        </p>
      ) : null}
    </div>
  )
}

function Cell({ value }) {
  if (value && value.special) {
    return <span className="font-mono text-[length:calc(var(--grid-font-size)-1px)] text-warning">{value.special}</span>
  }

  if (value === null || value === undefined) {
    return <span className="font-mono text-[length:calc(var(--grid-font-size)-1px)] italic text-text-faint">NULL</span>
  }

  if (typeof value === 'number') {
    return <span className="text-text">{String(value)}</span>
  }

  const text = String(value)
  const isDate = DATE_RE.test(text)
  const isLong = text.length > 64

  return (
    <span
      className={`inline-block max-w-[420px] truncate align-bottom ${
        isDate ? 'text-info' : 'text-text'
      }`}
      title={isLong ? text : undefined}
    >
      {text}
    </span>
  )
}

