import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon, { Spinner } from '@/components/common/Icon'
import ContextMenu, { ContextMenuItem } from '@/components/common/ContextMenu'
import FilterDialog from '@/components/results/FilterDialog'
import ResultGrid, { GridSelection, ResultColumn, ResultRelation } from '@/components/results/ResultGrid'
import ValueInspectorDialog, { InspectorTarget } from '@/components/results/ValueInspectorDialog'
import ExecutionPlanView from '@/components/results/ExecutionPlanView'
import { cleanText, formatDuration, formatNumber, jsonRecords, sqlInsertRows } from '@/resultFormats'
import { editEditableColumns, editHasKeys, EditSource } from '@/edits'
import { FilterCondition } from '@/filters'
import { ParsedPlan } from '@/planParser'

const SPECIAL_OPTIONS = [
  { id: 'null', label: 'NULL', value: null },
  { id: 'default', label: 'Default', value: { special: 'DEFAULT' } },
  { id: 'getdate', label: 'GETDATE()', value: { special: 'GETDATE()' } },
]

export interface ResultSetItem {
  columns: ResultColumn[]
  rows: unknown[][]
  rowCount: number
}

export interface QueryResultMessage {
  type?: 'rows' | 'text' | string
  count?: number
  text?: string
}

export interface QueryResultData {
  resultSets: ResultSetItem[]
  messages: QueryResultMessage[]
  rowsAffected: number[]
  elapsedMs: number
  truncated?: boolean
  maxRows?: number
  [key: string]: unknown
}

export interface QueryErrorData {
  message?: string
  code?: string
  number?: number | string
  severity?: number | string
  lineNumber?: number | string
  state?: number | string
}

export interface ResultsPanelState {
  status: 'idle' | 'running' | 'success' | 'error'
  result?: QueryResultData | null
  error?: QueryErrorData | null
  [key: string]: unknown
}

export interface ExportDataPayload {
  format: 'csv' | 'json'
  filename: string
  columnNames: string[]
  rows: unknown[][]
}

export interface ActiveDataPayload {
  columnNames: string[]
  rows: unknown[][]
  label: string
}

export interface ResultsPanelProps {
  state: ResultsPanelState
  activeSet?: number
  onSelectSet: (index: number) => void
  relations?: ResultRelation[] | null
  onRelationClick?: (relation: ResultRelation, value: unknown) => void
  onCopyText?: (payload: string, message?: string) => void
  timezone?: string
  editSource?: EditSource | null
  edits?: Record<string, { value: unknown; original?: unknown }>
  deletingRows?: number[]
  onCellChange?: (row: number, columnName: string, nextValue: unknown, prevValue: unknown) => void
  onSetCellValue?: (row: number, columnName: string, value: unknown) => void
  onDeleteRows?: (rowsOrStart: number[] | number, maybeEnd?: number) => void
  onConfirmOpen?: () => void
  onDeleteConfirmOpen?: () => void
  onApplyFilter?: (conditions: FilterCondition[]) => void
  onActiveDataChange?: (data: ActiveDataPayload | null) => void
  onExport?: (data: ExportDataPayload) => void
  tabTitle?: string
  executionPlan?: ParsedPlan | null
  onCopyPlan?: ((raw: string) => void) | null
  onOpenStructure?: (table: { schema: string; name: string }) => void
}

export default function ResultsPanel({
  state,
  activeSet = 0,
  onSelectSet,
  relations,
  onRelationClick,
  onCopyText,
  timezone = 'UTC',
  editSource,
  edits = {},
  deletingRows = [],
  onCellChange,
  onSetCellValue,
  onDeleteRows,
  onConfirmOpen,
  onDeleteConfirmOpen,
  onApplyFilter,
  onActiveDataChange,
  onExport,
  tabTitle,
  executionPlan = null,
  onCopyPlan = null,
  onOpenStructure,
}: ResultsPanelProps) {
  const { status, result, error } = state
  const resultSets = result?.resultSets ?? []
  const messages = result?.messages ?? []
  const activeIndex = Math.min(activeSet ?? 0, Math.max(resultSets.length - 1, 0))
  const activeResultSet = resultSets[activeIndex]
  const rowsAffected = (result?.rowsAffected ?? []).reduce((total, count) => total + count, 0)
  const [selection, setSelection] = useState<GridSelection | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [view, setView] = useState<'results' | 'messages' | 'plan'>('results')
  const [menu, setMenu] = useState<{ x: number; y: number; column: ResultColumn | null; columnIndex: number; row: number } | null>(null)
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; column: ResultColumn } | null>(null)
  const [filterColumn, setFilterColumn] = useState<string | null>(null)
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null)
  const [inspectTarget, setInspectTarget] = useState<InspectorTarget | null>(null)

  const columnNames = useMemo(
    () => (activeResultSet?.columns ?? []).map((column) => column.name),
    [activeResultSet],
  )

  const hasKey = editHasKeys(editSource)
  const editableColumns = useMemo(() => editEditableColumns(editSource), [editSource])
  const keyInResult =
    hasKey &&
    Boolean(
      editSource?.tables.some((source) =>
        (source.keyColumns ?? source.primaryKey).every((name) =>
          name && columnNames.some((column) => column.toLowerCase() === name.toLowerCase()),
        ),
      ),
    )
  const editable = keyInResult && Boolean(activeResultSet) && resultSets.length === 1
  const deletable = editable && editSource?.tables.length === 1
  const changeCount = Object.keys(edits).length
  const previousChangeCountRef = useRef(changeCount)

  useEffect(() => {
    const previous = previousChangeCountRef.current
    previousChangeCountRef.current = changeCount
    if (previous > 0 && changeCount === 0) setEditMode(false)
  }, [changeCount])

  useEffect(() => {
    setSelection(null)
  }, [result])

  useEffect(() => {
    const sets = result?.resultSets ?? []
    const lines = result?.messages ?? []
    setView(sets.length === 0 && lines.length > 0 ? 'messages' : 'results')
  }, [result])

  useEffect(() => {
    if (executionPlan) setView('plan')
  }, [executionPlan])

  useEffect(() => {
    setEditMode(false)
  }, [result, editSource])

  const selectionBounds = useMemo(() => {
    if (!selection || !activeResultSet) return null
    return {
      rowStart: Math.min(selection.anchor.row, selection.focus.row),
      rowEnd: Math.max(selection.anchor.row, selection.focus.row),
      colStart: Math.min(selection.anchor.col, selection.focus.col),
      colEnd: Math.max(selection.anchor.col, selection.focus.col),
    }
  }, [activeResultSet, selection])

  const selectionCells = useMemo(() => {
    if (!selectionBounds || !activeResultSet) return []
    const cells: unknown[][] = []
    for (let row = selectionBounds.rowStart; row <= selectionBounds.rowEnd; row += 1) {
      const values = activeResultSet.rows[row]
      if (!values) continue
      const cellsInRow: unknown[] = []
      for (let col = selectionBounds.colStart; col <= selectionBounds.colEnd; col += 1) {
        const column = activeResultSet.columns[col]
        if (!column) continue
        const edit = edits[`${row}:${column.name}`]
        cellsInRow.push(edit ? edit.value : values[col])
      }
      cells.push(cellsInRow)
    }
    return cells
  }, [activeResultSet, edits, selectionBounds])

  const selectionRows = useMemo(() => {
    if (!selectionBounds || !activeResultSet) return []
    const rows: unknown[][] = []
    for (let row = selectionBounds.rowStart; row <= selectionBounds.rowEnd; row += 1) {
      const values = activeResultSet.rows[row]
      if (!values) continue
      rows.push(
        activeResultSet.columns.map((column, col) => {
          const edit = edits[`${row}:${column.name}`]
          return edit ? edit.value : values[col]
        }),
      )
    }
    return rows
  }, [activeResultSet, edits, selectionBounds])

  const selectedColumns = useMemo(
    () =>
      !selectionBounds
        ? []
        : (activeResultSet?.columns ?? [])
            .slice(selectionBounds.colStart, selectionBounds.colEnd + 1)
            .map((column) => column.name),
    [activeResultSet, selectionBounds],
  )

  const allRows = useMemo(() => {
    if (!activeResultSet?.rows) return []
    return activeResultSet.rows.map((values, row) =>
      activeResultSet.columns.map((column, col) => {
        const edit = edits[`${row}:${column.name}`]
        return edit ? edit.value : values[col]
      }),
    )
  }, [activeResultSet, edits])

  const handleExportAll = useCallback(
    (format: 'csv' | 'json') => {
      if (!activeResultSet || !onExport) return
      setExportMenu(null)
      onExport({
        format,
        filename: tabTitle || 'query_results',
        columnNames,
        rows: allRows,
      })
    },
    [activeResultSet, allRows, columnNames, onExport, tabTitle],
  )

  useEffect(() => {
    if (!activeResultSet || !selectionBounds) {
      onActiveDataChange?.(null)
      return
    }
    const label =
      selectionBounds.rowStart === selectionBounds.rowEnd
        ? `Row ${selectionBounds.rowStart + 1}`
        : `Rows ${selectionBounds.rowStart + 1}–${selectionBounds.rowEnd + 1}`
    onActiveDataChange?.({
      columnNames,
      rows: selectionRows,
      label,
    })
  }, [activeResultSet, columnNames, onActiveDataChange, selectionBounds, selectionRows])

  const copy = useCallback(
    (payload: string, message?: string) => {
      onCopyText?.(payload, message)
    },
    [onCopyText],
  )

  const handleCellContextMenu = useCallback(
    (x: number, y: number, columnIndex: number, origIndex: number) => {
      const column = activeResultSet?.columns[columnIndex] ?? null
      setMenu({ x, y, column, columnIndex, row: origIndex })
    },
    [activeResultSet],
  )

  const handleHeaderContextMenu = useCallback(
    (x: number, y: number, columnIndex: number) => {
      const column = activeResultSet?.columns[columnIndex] ?? null
      if (!column) return
      setHeaderMenu({ x, y, column })
    },
    [activeResultSet],
  )

  const table = useMemo(() => {
    const source = editSource?.tables[0]
    return source ? { schema: source.schema, name: source.table } : null
  }, [editSource])

  const wholeRowSelection = Boolean(
    selectionBounds &&
      activeResultSet &&
      selectionBounds.colStart === 0 &&
      selectionBounds.colEnd === activeResultSet.columns.length - 1,
  )
  const selectionMatrix = wholeRowSelection ? selectionRows : selectionCells
  const selectionColumnNames = wholeRowSelection ? columnNames : selectedColumns
  const selectionLabel = wholeRowSelection ? 'rows' : 'cells'

  const openInspector = useCallback((columnIndex: number, row: number) => {
    const col = activeResultSet?.columns?.[columnIndex] ?? undefined
    const val = activeResultSet?.rows?.[row]?.[columnIndex] ?? null
    setInspectTarget({
      type: 'cell',
      columnIndex,
      rowIndex: row,
      column: col,
      value: val,
    })
  }, [activeResultSet])

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return []
    const isMultiSelection = Boolean(
      selectionBounds &&
        (selectionBounds.rowStart !== selectionBounds.rowEnd ||
          selectionBounds.colStart !== selectionBounds.colEnd),
    )

    const items: ContextMenuItem[] = [
      {
        id: 'inspect-value',
        label: isMultiSelection
          ? `Inspect ${wholeRowSelection ? 'Rows' : 'Selection'}`
          : 'Inspect Value',
        onSelect: () => {
          if (isMultiSelection) {
            setInspectTarget({
              type: wholeRowSelection ? 'rows' : 'selection',
              title: wholeRowSelection && selectionBounds
                ? `Rows ${selectionBounds.rowStart + 1}–${selectionBounds.rowEnd + 1}`
                : `Selection (${selectionRows.length} × ${selectionColumnNames.length})`,
              subtitle: `${selectionRows.length} row${selectionRows.length === 1 ? '' : 's'} · ${selectionColumnNames.length} column${selectionColumnNames.length === 1 ? '' : 's'}`,
              columnNames: selectionColumnNames,
              matrix: selectionMatrix,
            })
            return
          }
          const row = menu.row >= 0 ? menu.row : (selectionBounds?.rowStart ?? 0)
          const colIndex =
            menu.columnIndex !== null && menu.columnIndex !== undefined
              ? menu.columnIndex
              : (selectionBounds?.colStart ?? 0)
          openInspector(colIndex, row)
        },
      },
      {
        id: 'filter-by-value',
        label: 'Filter by this value',
        onSelect: () => {
          const colIndex =
            menu.columnIndex !== null && menu.columnIndex !== undefined
              ? menu.columnIndex
              : (selectionBounds?.colStart ?? 0)
          const row = menu.row >= 0 ? menu.row : (selectionBounds?.rowStart ?? 0)
          const column = activeResultSet?.columns[colIndex]
          if (!column) return
          const rawValue = activeResultSet?.rows[row]?.[colIndex]
          const isNull = rawValue === null || rawValue === undefined
          onApplyFilter?.([
            {
              column: column.name,
              operator: isNull ? 'is-null' : 'equals',
              value: isNull ? '' : String(rawValue),
            },
          ])
        },
      },
      {
        id: 'copy-text',
        label: 'Copy Text',
        onSelect: () =>
          copy(cleanText(selectionMatrix, timezone), `Copied selected ${selectionLabel} as clean text.`),
      },
      {
        id: 'copy-json',
        label: 'Copy JSON',
        onSelect: () =>
          copy(
            jsonRecords(selectionColumnNames, selectionMatrix, timezone),
            `Copied selected ${selectionLabel} as JSON.`,
          ),
      },
      {
        id: 'copy-sql-insert',
        label: 'Copy SQL Insert',
        onSelect: () => {
          if (!table) return
          copy(
            sqlInsertRows(table, selectionColumnNames, selectionMatrix),
            `Copied selected ${selectionLabel} as INSERT statements.`,
          )
        },
      },
      {
        id: 'export-selected',
        label: 'Export Selection',
        children: [
          {
            id: 'export-selected-csv',
            label: 'CSV File (.csv)',
            onSelect: () =>
              onExport?.({
                format: 'csv',
                filename: `${tabTitle || 'selection'}_selected`,
                columnNames: selectionColumnNames,
                rows: selectionMatrix,
              }),
          },
          {
            id: 'export-selected-json',
            label: 'JSON File (.json)',
            onSelect: () =>
              onExport?.({
                format: 'json',
                filename: `${tabTitle || 'selection'}_selected`,
                columnNames: selectionColumnNames,
                rows: selectionMatrix,
              }),
          },
        ],
      },
    ]

    if (editable && menu.column && (!editableColumns || editableColumns.has(menu.column.name))) {
      items.push({
        id: 'set-value',
        label: 'Set Value',
        children: SPECIAL_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
          onSelect: () => {
            if (!selectionBounds || !menu.column) return
            setEditMode(true)
            for (let row = selectionBounds.rowStart; row <= selectionBounds.rowEnd; row += 1) {
              onSetCellValue?.(row, menu.column.name, option.value)
            }
          },
        })),
      })
    }

    if (editable) {
      items.push({
        id: 'edit-result',
        label: editMode ? 'Stop Editing' : 'Edit Result',
        onSelect: () => {
          setSelection(null)
          setEditMode(!editMode)
        },
      })
    }

    if (deletable && onDeleteRows && selectionBounds) {
      items.push({
        id: 'delete-rows',
        label: 'Delete',
        onSelect: () => {
          const rowIndexes: number[] = []
          for (let r = selectionBounds.rowStart; r <= selectionBounds.rowEnd; r += 1) {
            rowIndexes.push(r)
          }
          onDeleteRows(rowIndexes)
        },
      })
    }

    return items
  }, [
    activeResultSet?.columns,
    activeResultSet?.rows,
    copy,
    deletable,
    editMode,
    editable,
    editableColumns,
    menu,
    onApplyFilter,
    onDeleteRows,
    onExport,
    onSetCellValue,
    openInspector,
    selectionBounds,
    selectionColumnNames,
    selectionLabel,
    selectionMatrix,
    selectionRows,
    tabTitle,
    table,
    wholeRowSelection,
  ])

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_minmax(0,1fr)] bg-surface">
      {status === 'running' ? (
        <div className="progress-track col-span-2 row-start-1 shrink-0" />
      ) : (
        <div className="col-span-2 row-start-1 h-px shrink-0 bg-line" />
      )}

      <div className="col-start-1 row-start-2 flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2">
        {status === 'error' ? (
          <span className="flex items-center gap-1.5 px-2 text-[length:var(--app-text-11)] font-medium text-danger">
            <Icon name="alert-triangle" size={12} />
            Error
          </span>
        ) : null}

        {status === 'running' ? (
          <span className="flex items-center gap-1.5 px-2 text-[length:var(--app-text-11)] text-text-soft">
            <Spinner size={12} />
            Running query…
          </span>
        ) : null}

        {status !== 'error' && status !== 'running' && resultSets.length === 0 && view !== 'messages' ? (
          <span className="px-2 text-[length:var(--app-text-11)] font-medium text-text-soft">Results</span>
        ) : null}

        {status !== 'error' && resultSets.length > 0
          ? resultSets.map((set, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  onSelectSet(index)
                  setSelection(null)
                  setView('results')
                }}
                className={`flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--app-text-11)] transition-colors ${
                  index === activeIndex
                    ? 'bg-tint/[0.06] text-text-strong'
                    : 'text-text-muted hover:bg-tint/[0.03] hover:text-text'
                }`}
              >
                Result {index + 1}
                <span className="rounded bg-tint/[0.06] px-1 text-[length:var(--app-text-10)] tabular-nums text-text-muted">
                  {formatNumber(set.rowCount)}
                </span>
              </button>
            ))
          : null}

        {status !== 'error' && status !== 'running' ? (
          <button
            type="button"
            onClick={() => setView(view === 'messages' ? 'results' : 'messages')}
            className={`flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--app-text-11)] transition-colors ${
              view === 'messages'
                ? 'bg-tint/[0.06] text-text-strong'
                : 'text-text-muted hover:bg-tint/[0.03] hover:text-text'
            }`}
          >
            Messages
            <span className="rounded bg-tint/[0.06] px-1 text-[length:var(--app-text-10)] tabular-nums text-text-muted">
              {formatNumber(messages.length)}
            </span>
          </button>
        ) : null}

        {status === 'success' && activeResultSet?.rows && activeResultSet.rows.length > 0 && resultSets.length === 1 && editSource?.tables?.length === 1 && onOpenStructure ? (
          <button
            type="button"
            onClick={() => {
              const source = editSource.tables[0]
              onOpenStructure({ schema: source.schema, name: source.table })
            }}
            title="Open table structure"
            className="flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--app-text-11)] text-text-muted transition-colors hover:bg-tint/[0.03] hover:text-text"
          >
            <Icon name="table" size={12} />
            Structure
          </button>
        ) : null}

        {executionPlan ? (
          <button
            type="button"
            onClick={() => setView('plan')}
            className={`flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--app-text-11)] transition-colors ${
              view === 'plan'
                ? 'bg-tint/[0.06] text-text-strong'
                : 'text-text-muted hover:bg-tint/[0.03] hover:text-text'
            }`}
          >
            <Icon name="plan" size={12} className="text-accent" />
            Execution Plan
          </button>
        ) : null}

        {status === 'success' && activeResultSet?.rows && activeResultSet.rows.length > 0 && view !== 'messages' ? (
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setExportMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
            title="Export query results to file"
            className="flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[length:var(--app-text-11)] text-text-muted transition-colors hover:bg-tint/[0.03] hover:text-text"
          >
            <Icon name="download" size={11} />
            Export
          </button>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-3 pl-3 text-[length:var(--app-text-11)] text-text-muted">
          {status === 'success' && editSource && !hasKey ? (
            <span
              title="Editing needs a primary key so each row can be identified in the UPDATE WHERE clause."
              className="flex items-center gap-1 rounded bg-tint/[0.05] px-1.5 text-[length:var(--app-text-10)] text-text-faint"
            >
              <Icon name="lock" size={10} />
              Read-only · no primary key
            </span>
          ) : null}
          {status === 'success' && editMode ? (
            changeCount === 0 ? (
              <button
                type="button"
                onClick={() => setEditMode(false)}
                title="Stop editing"
                className="flex h-6 items-center gap-1 rounded bg-accent/15 px-1.5 text-[length:var(--app-text-10)] font-medium text-accent transition-colors hover:bg-accent/25"
              >
                <Icon name="x" size={10} />
                Cancel
              </button>
            ) : (
              <span className="flex items-center gap-1 rounded bg-accent/15 px-1.5 text-[length:var(--app-text-10)] font-medium text-accent">
                <Icon name="pencil" size={10} />
                Editing
              </span>
            )
          ) : null}
          {status === 'success' && changeCount > 0 ? (
            <button
              type="button"
              onClick={() => onConfirmOpen?.()}
              title="Apply pending changes"
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[length:var(--app-text-11)] text-text-soft hover:bg-tint/[0.05] hover:text-text"
            >
              <Icon name="pencil" size={11} />
              {changeCount} change{changeCount === 1 ? '' : 's'}
            </button>
          ) : null}
          {status === 'success' && deletingRows.length > 0 ? (
            <button
              type="button"
              onClick={() => onDeleteConfirmOpen?.()}
              title="Apply pending deletes"
              className="flex h-6 items-center gap-1 rounded bg-danger/15 px-1.5 text-[length:var(--app-text-10)] font-medium text-danger transition-colors hover:bg-danger/25"
            >
              <Icon name="trash" size={10} />
              {deletingRows.length} deleting
            </button>
          ) : null}
          {status === 'error' && error?.code ? (
            <span className="font-mono text-[length:var(--app-text-10)] text-text-faint">{error.code}</span>
          ) : null}
        </div>
      </div>

      <div className="col-start-1 row-start-3 min-h-0 overflow-hidden">
        {view === 'plan' && executionPlan ? (
          <ExecutionPlanView plan={executionPlan} onCopyPlan={onCopyPlan ?? undefined} />
        ) : null}
        {view !== 'plan' && status === 'idle' ? <IdleState /> : null}
        {view !== 'plan' && status === 'running' ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-[length:var(--app-text-12)] text-text-muted">
              <Spinner size={14} />
              Executing against SQL Server…
            </div>
          </div>
        ) : null}
        {view !== 'plan' && status === 'error' ? <ErrorState error={error} /> : null}
        {view !== 'plan' && status === 'success' && result ? (
          view === 'messages' ? (
            <MessageList messages={messages} />
          ) : resultSets.length === 0 ? (
            <CompletedState rowsAffected={rowsAffected} elapsedMs={result.elapsedMs} />
          ) : (
            <div className="flex h-full flex-col">
              {result.truncated ? (
                <p className="border-b border-line bg-warning/[0.06] px-3 py-1.5 text-[length:var(--app-text-11)] text-warning/90">
                  Result set was larger than the transfer limit. Only the first{' '}
                  {formatNumber(result.maxRows ?? 0)} rows of each set were loaded.
                </p>
              ) : null}
              <div className="min-h-0 flex-1">
                <ResultGrid
                  key={activeIndex}
                  columns={activeResultSet.columns}
                  rows={activeResultSet.rows}
                  relations={relations}
                  timezone={timezone}
                  onRelationClick={onRelationClick}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onCellContextMenu={handleCellContextMenu}
                  onHeaderContextMenu={handleHeaderContextMenu}
                  editable={editable}
                  editableColumns={editableColumns}
                  editing={editMode}
                  edits={edits}
                  onCellChange={onCellChange}
                  onStartEdit={() => setEditMode(true)}
                  onInspectCell={openInspector}
                  deleteMode={deletingRows.length > 0}
                  deletingRows={deletingRows}
                  onDeleteRows={deletable ? onDeleteRows : undefined}
                />
              </div>
            </div>
          )
        ) : null}
      </div>

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}

      {exportMenu ? (
        <ContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          items={[
            {
              id: 'export-csv',
              label: 'Export CSV (.csv)',
              onSelect: () => handleExportAll('csv'),
            },
            {
              id: 'export-json',
              label: 'Export JSON (.json)',
              onSelect: () => handleExportAll('json'),
            },
          ]}
          onClose={() => setExportMenu(null)}
        />
      ) : null}

      {headerMenu ? (
        <ContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          items={[
            {
              id: 'copy-object-name',
              label: 'Copy object name',
              onSelect: () => copy(headerMenu.column.name, `Copied column name ${headerMenu.column.name}.`),
            },
            {
              id: 'filter-by-column',
              label: 'Filter by column',
              onSelect: () => setFilterColumn(headerMenu.column.name),
            },
          ]}
          onClose={() => setHeaderMenu(null)}
        />
      ) : null}

      <FilterDialog
        open={filterColumn !== null}
        columns={activeResultSet?.columns ?? []}
        initialColumn={filterColumn ?? ''}
        onCancel={() => setFilterColumn(null)}
        onApply={(conditions) => {
          setFilterColumn(null)
          onApplyFilter?.(conditions)
        }}
      />

      <ValueInspectorDialog
        open={Boolean(inspectTarget)}
        target={inspectTarget}
        timezone={timezone}
        edits={edits}
        editable={
          editable &&
          inspectTarget?.type === 'cell' &&
          typeof inspectTarget?.columnIndex === 'number' &&
          Boolean(activeResultSet?.columns?.[inspectTarget.columnIndex]) &&
          (!editableColumns ||
            editableColumns.has(activeResultSet.columns[inspectTarget.columnIndex].name))
        }
        onSave={(newValue) => {
          if (
            !inspectTarget ||
            inspectTarget.type !== 'cell' ||
            typeof inspectTarget.columnIndex !== 'number' ||
            typeof inspectTarget.rowIndex !== 'number' ||
            inspectTarget.rowIndex < 0 ||
            !activeResultSet?.columns?.[inspectTarget.columnIndex]
          ) {
            return
          }
          const colIndex = inspectTarget.columnIndex
          const rowIndex = inspectTarget.rowIndex
          const colName = activeResultSet.columns[colIndex].name
          const origValue = activeResultSet.rows?.[rowIndex]?.[colIndex]
          setEditMode(true)
          onCellChange?.(rowIndex, colName, newValue, origValue)
        }}
        onClose={() => setInspectTarget(null)}
        onCopy={onCopyText}
      />
    </section>
  )
}

function MessageList({ messages }: { messages: QueryResultMessage[] }) {
  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--app-text-12)] text-text-faint">
        No messages.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      <ul className="space-y-1 font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
        {messages.map((message, index) => (
          <li key={index} className="whitespace-pre-wrap break-words">
            {message.type === 'rows'
              ? `(${formatNumber(message.count ?? 0)} row${message.count === 1 ? '' : 's'} affected)`
              : message.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong bg-elevated text-text-faint">
        <Icon name="grid" size={19} />
      </span>
      <div>
        <p className="text-[length:var(--app-text-13)] text-text-soft">No query results yet</p>
        <p className="mt-1 text-[length:var(--app-text-11)] text-text-faint">
          Run a query with <span className="kbd">Ctrl</span> + <span className="kbd">↵</span> to see the
          output here.
        </p>
      </div>
    </div>
  )
}

function ErrorState({ error }: { error?: QueryErrorData | null }) {
  const details = [
    error?.number ? `Error ${error.number}` : null,
    error?.severity ? `Level ${error.severity}` : null,
    error?.lineNumber ? `Line ${error.lineNumber}` : null,
    error?.state ? `State ${error.state}` : null,
  ].filter(Boolean)

  return (
    <div className="h-full overflow-auto p-4">
      <div className="rounded-lg border border-danger/25 bg-danger/[0.06] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Icon name="alert-triangle" size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--app-text-10)] font-semibold uppercase tracking-wider text-danger/80">
              Query failed
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-danger">
              {error?.message || 'Unknown error'}
            </p>
            {details.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--app-text-10)] text-danger/60">
                {details.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletedState({ rowsAffected, elapsedMs }: { rowsAffected: number; elapsedMs: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon name="check-circle" size={18} />
      </span>
      <p className="text-[length:var(--app-text-13)] text-text">Query completed successfully</p>
      <p className="text-[length:var(--app-text-11)] text-text-muted">
        {rowsAffected > 0 ? `${formatNumber(rowsAffected)} rows affected` : 'No rows returned'} ·{' '}
        {formatDuration(elapsedMs)}
      </p>
    </div>
  )
}
