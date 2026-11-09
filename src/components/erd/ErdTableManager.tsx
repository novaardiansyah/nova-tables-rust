import React, { useMemo, useState } from 'react'
import Icon, { Spinner } from '@/components/common/Icon'
import { ErdTable } from './erdTypes'

export interface ErdTableManagerProps {
  isOpen: boolean
  onClose: () => void
  allTables: ErdTable[]
  visibleTableKeys: Set<string>
  onToggleVisibility: (tableKey: string) => void
  onShowAll: () => void
  onHideAll: () => void
  onRemoveTable: (tableKey: string) => void
  onAddTables: (tables: { schema: string; name: string }[]) => Promise<void>
  databaseTables: { schema: string; name: string }[]
  loadingDatabaseTables: boolean
  onFetchDatabaseTables: () => void
  viewOnly?: boolean
}

export default function ErdTableManager({
  isOpen,
  onClose,
  allTables,
  visibleTableKeys,
  onToggleVisibility,
  onShowAll,
  onHideAll,
  onRemoveTable,
  onAddTables,
  databaseTables,
  loadingDatabaseTables,
  onFetchDatabaseTables,
  viewOnly = false,
}: ErdTableManagerProps) {
  const [filterQuery, setFilterQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'diagram' | 'add'>('diagram')
  const [addSearchQuery, setAddSearchQuery] = useState('')
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)

  const diagramTableKeys = useMemo(() => {
    return new Set(allTables.map((t) => `${t.schema}.${t.name}`))
  }, [allTables])

  const filteredDiagramTables = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return allTables
    return allTables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.schema.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    )
  }, [allTables, filterQuery])

  const availableDbTables = useMemo(() => {
    return databaseTables.filter((t) => !diagramTableKeys.has(`${t.schema}.${t.name}`))
  }, [databaseTables, diagramTableKeys])

  const filteredAvailableDbTables = useMemo(() => {
    const q = addSearchQuery.trim().toLowerCase()
    if (!q) return availableDbTables
    return availableDbTables.filter(
      (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q),
    )
  }, [availableDbTables, addSearchQuery])

  const handleOpenAddTab = () => {
    setActiveTab('add')
    setSelectedToAdd(new Set())
    onFetchDatabaseTables()
  }

  const handleToggleSelectToAdd = (key: string) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleSelectAllToAdd = () => {
    if (selectedToAdd.size === filteredAvailableDbTables.length) {
      setSelectedToAdd(new Set())
    } else {
      setSelectedToAdd(new Set(filteredAvailableDbTables.map((t) => `${t.schema}.${t.name}`)))
    }
  }

  const handleConfirmAdd = async () => {
    if (selectedToAdd.size === 0 || isAdding) return
    setIsAdding(true)
    try {
      const toAdd = databaseTables.filter((t) => selectedToAdd.has(`${t.schema}.${t.name}`))
      await onAddTables(toAdd)
      setSelectedToAdd(new Set())
      setActiveTab('diagram')
    } finally {
      setIsAdding(false)
    }
  }

  if (!isOpen) return null

  const visibleCount = allTables.filter((t) => visibleTableKeys.has(`${t.schema}.${t.name}`)).length

  return (
    <div className="absolute right-0 top-10 bottom-0 z-30 flex w-80 flex-col border-l border-line bg-panel shadow-2xl transition-all">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2">
          <Icon name="table" size={13} className="text-accent" />
          <span className="text-[length:var(--app-text-12)] font-semibold text-text-strong">
            Table Management
          </span>
          <span className="rounded bg-surface px-1.5 py-0.5 text-[length:var(--app-text-10)] font-medium text-text-muted">
            {visibleCount}/{allTables.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="icon-btn h-6 w-6 text-text-faint hover:text-text"
          title="Close panel"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <div className="flex border-b border-line bg-surface/40 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('diagram')}
          className={`flex-1 rounded py-1 text-center text-[length:var(--app-text-11)] font-medium transition-colors ${
            activeTab === 'diagram'
              ? 'bg-elevated text-text shadow-sm'
              : 'text-text-muted hover:text-text'
          }`}
        >
          Diagram Tables ({allTables.length})
        </button>
        <button
          type="button"
          onClick={handleOpenAddTab}
          disabled={viewOnly}
          className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-center text-[length:var(--app-text-11)] font-medium transition-colors ${
            activeTab === 'add'
              ? 'bg-elevated text-text shadow-sm'
              : 'text-text-muted hover:text-text'
          } ${viewOnly ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          <Icon name="plus" size={11} />
          <span>Add Tables</span>
        </button>
      </div>

      {activeTab === 'diagram' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-2 border-b border-line p-2.5">
            <div className="relative flex items-center">
              <Icon
                name="search"
                size={11}
                className="pointer-events-none absolute left-2 text-text-faint"
              />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter diagram tables…"
                className="h-7 w-full rounded border border-line bg-surface pl-7 pr-6 text-[length:var(--app-text-11)] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              />
              {filterQuery ? (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-1.5 text-text-faint hover:text-text"
                >
                  <Icon name="x" size={10} />
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[length:var(--app-text-10)] text-text-faint">
                {visibleCount} visible · {allTables.length - visibleCount} hidden
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onShowAll}
                  className="rounded px-2 py-0.5 text-[length:var(--app-text-10)] font-medium text-text-muted hover:bg-surface hover:text-text"
                  title="Show all tables"
                >
                  Show All
                </button>
                <span className="text-line">|</span>
                <button
                  type="button"
                  onClick={onHideAll}
                  className="rounded px-2 py-0.5 text-[length:var(--app-text-10)] font-medium text-text-muted hover:bg-surface hover:text-text"
                  title="Hide all tables"
                >
                  Hide All
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line/40">
            {filteredDiagramTables.length === 0 ? (
              <div className="p-4 text-center text-[length:var(--app-text-11)] text-text-faint">
                {filterQuery ? 'No tables match your filter.' : 'No tables in diagram.'}
              </div>
            ) : (
              filteredDiagramTables.map((table) => {
                const key = `${table.schema}.${table.name}`
                const isVisible = visibleTableKeys.has(key)
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between px-2.5 py-1.5 transition-colors ${
                      isVisible ? 'hover:bg-surface/50' : 'bg-surface/20 opacity-60'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleVisibility(key)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                          isVisible
                            ? 'text-accent hover:bg-accent/15'
                            : 'text-text-faint hover:bg-surface hover:text-text-muted'
                        }`}
                        title={isVisible ? 'Hide table from diagram' : 'Show table on diagram'}
                      >
                        <Icon name={isVisible ? 'eye' : 'eye-off'} size={12} />
                      </button>

                      <div className="flex min-w-0 flex-col">
                        <span
                          className={`truncate text-[length:var(--app-text-11)] ${
                            isVisible
                              ? 'font-medium text-text-strong'
                              : 'text-text-muted line-through'
                          }`}
                          title={key}
                        >
                          {table.schema && table.schema !== 'dbo' ? (
                            <span className="text-text-faint font-normal">{table.schema}.</span>
                          ) : null}
                          {table.name}
                        </span>
                        <span className="text-[length:var(--app-text-9)] text-text-faint">
                          {table.columns.length} columns
                          {table.isJunction ? ' · Junction' : ''}
                        </span>
                      </div>
                    </div>

                    {!viewOnly ? (
                      <button
                        type="button"
                        onClick={() => onRemoveTable(key)}
                        className="icon-btn h-5 w-5 text-text-faint hover:text-danger"
                        title="Remove table from diagram"
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-2 border-b border-line p-2.5">
            <div className="relative flex items-center">
              <Icon
                name="search"
                size={11}
                className="pointer-events-none absolute left-2 text-text-faint"
              />
              <input
                type="text"
                value={addSearchQuery}
                onChange={(e) => setAddSearchQuery(e.target.value)}
                placeholder="Search database tables…"
                className="h-7 w-full rounded border border-line bg-surface pl-7 pr-6 text-[length:var(--app-text-11)] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              />
              {addSearchQuery ? (
                <button
                  type="button"
                  onClick={() => setAddSearchQuery('')}
                  className="absolute right-1.5 text-text-faint hover:text-text"
                >
                  <Icon name="x" size={10} />
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[length:var(--app-text-10)] text-text-faint">
                {availableDbTables.length} tables available
              </span>
              {filteredAvailableDbTables.length > 0 ? (
                <button
                  type="button"
                  onClick={handleSelectAllToAdd}
                  className="rounded px-2 py-0.5 text-[length:var(--app-text-10)] font-medium text-text-muted hover:bg-surface hover:text-text"
                >
                  {selectedToAdd.size === filteredAvailableDbTables.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line/40">
            {loadingDatabaseTables ? (
              <div className="flex h-32 items-center justify-center gap-2 text-[length:var(--app-text-11)] text-text-muted">
                <Spinner size={14} className="text-accent" />
                <span>Loading tables…</span>
              </div>
            ) : filteredAvailableDbTables.length === 0 ? (
              <div className="p-4 text-center text-[length:var(--app-text-11)] text-text-faint">
                {availableDbTables.length === 0
                  ? 'All database tables are already in the diagram.'
                  : 'No tables match your search.'}
              </div>
            ) : (
              filteredAvailableDbTables.map((table) => {
                const key = `${table.schema}.${table.name}`
                const isSelected = selectedToAdd.has(key)
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectToAdd(key)}
                      className="rounded border-line bg-surface text-accent focus:ring-accent"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[length:var(--app-text-11)] font-medium text-text">
                        {table.schema && table.schema !== 'dbo' ? (
                          <span className="text-text-faint font-normal">{table.schema}.</span>
                        ) : null}
                        {table.name}
                      </span>
                    </div>
                  </label>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line bg-surface/30 p-2.5">
            <span className="text-[length:var(--app-text-11)] text-text-faint">
              {selectedToAdd.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('diagram')}
                className="rounded border border-line bg-surface px-2.5 py-1 text-[length:var(--app-text-11)] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={selectedToAdd.size === 0 || isAdding}
                className={`flex items-center gap-1.5 rounded bg-accent px-3 py-1 text-[length:var(--app-text-11)] font-medium text-on-accent transition-opacity ${
                  selectedToAdd.size === 0 || isAdding
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:opacity-90'
                }`}
              >
                {isAdding ? <Spinner size={11} /> : <Icon name="plus" size={11} />}
                <span>Add Selected ({selectedToAdd.size})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
