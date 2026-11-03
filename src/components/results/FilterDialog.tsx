import React, { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/common/Icon'
import Select from '@/components/common/Select'
import {
  FILTER_LOGICS,
  FILTER_OPERATORS,
  FilterCondition,
  FilterLogic,
  FilterOperatorId,
  buildFilterWhere,
  filterOperatorById,
} from '@/filters'

const LOGIC_OPTIONS = FILTER_LOGICS.map((item) => ({ value: item.id, label: item.label }))
const OPERATOR_OPTIONS = FILTER_OPERATORS.map((item) => ({ value: item.id, label: item.label }))

function createCondition(column: string, operator: FilterOperatorId = 'contains'): FilterCondition {
  return { logic: 'AND', column, operator, value: '' }
}

export interface FilterColumnItem {
  name: string
  [key: string]: unknown
}

export interface FilterDialogProps {
  open: boolean
  columns?: FilterColumnItem[]
  initialColumn?: string
  onCancel: () => void
  onApply: (conditions: FilterCondition[]) => void
  driverType?: string | null
}

export default function FilterDialog({
  open,
  columns = [],
  initialColumn = '',
  onCancel,
  onApply,
  driverType = null,
}: FilterDialogProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(() => [
    createCondition(initialColumn || columns[0]?.name || ''),
  ])

  useEffect(() => {
    if (open) {
      const defaultCol = initialColumn || columns[0]?.name || ''
      setConditions([createCondition(defaultCol)])
    }
  }, [open, initialColumn, columns])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  const columnOptions = useMemo(
    () => columns.map((column) => ({ value: column.name, label: column.name })),
    [columns],
  )

  const where = useMemo(() => buildFilterWhere(conditions, driverType), [conditions, driverType])

  if (!open) return null

  const update = (index: number, patch: Partial<FilterCondition>) => {
    setConditions((prev) =>
      prev.map((condition, position) => (position === index ? { ...condition, ...patch } : condition)),
    )
  }

  const addCondition = () => {
    const defaultCol = initialColumn || columns[0]?.name || ''
    setConditions((prev) => [...prev, createCondition(defaultCol)])
  }

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, position) => position !== index))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-2xl animate-fade-in overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70 flex flex-col max-h-[85vh]">
        <div className="flex items-start gap-3 px-5 py-4 shrink-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="filter" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">Filter Data</h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              Build conditions to filter the query results.
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={onCancel} title="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="space-y-2.5 border-t border-line px-5 py-4 max-h-[60vh] overflow-y-auto overflow-x-hidden min-h-0 flex-1">
          {conditions.map((condition, index) => {
            const operator = filterOperatorById(condition.operator)
            return (
              <div key={index} className="flex items-center gap-2">
                <div className="w-[72px] shrink-0 flex items-center justify-center">
                  {index > 0 ? (
                    <div className="flex w-full items-center justify-center rounded-md border border-line-strong bg-base p-0.5">
                      {LOGIC_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => update(index, { logic: option.value as FilterLogic })}
                          className={`flex-1 rounded py-0.5 text-center text-[length:var(--app-text-10)] font-semibold transition-colors ${
                            condition.logic === option.value
                              ? 'bg-accent-soft text-accent'
                              : 'text-text-muted hover:text-text'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[length:var(--app-text-11)] font-medium text-text-muted">Where</span>
                  )}
                </div>

                <div className="w-48 shrink-0 min-w-0">
                  <Select
                    value={condition.column}
                    options={columnOptions}
                    onChange={(value) => update(index, { column: value })}
                    className="w-full"
                    icon="table"
                    placeholder="Select column"
                    emptyLabel="No columns"
                    searchable
                    searchPlaceholder="Search column…"
                    panelClassName="w-48"
                  />
                </div>

                <div className="w-44 shrink-0 min-w-0">
                  <Select
                    value={condition.operator}
                    options={OPERATOR_OPTIONS}
                    onChange={(value) => update(index, { operator: value as FilterOperatorId })}
                    className="w-full"
                    icon="code"
                    placeholder="Select operator"
                    emptyLabel="No operators"
                    panelClassName="w-44"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  {operator?.needsValue ? (
                    <input
                      className="field min-w-0 w-full"
                      value={String(condition.value ?? '')}
                      onChange={(event) => update(index, { value: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && where) onApply(conditions)
                      }}
                      placeholder="Value"
                      spellCheck={false}
                    />
                  ) : (
                    <div className="flex h-8 w-full items-center rounded-md border border-dashed border-line bg-tint/[0.02] px-2.5 text-[length:var(--app-text-11)] text-text-faint">
                      No value needed
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="icon-btn h-6 w-6 shrink-0 hover:text-danger disabled:opacity-40"
                  title="Remove condition"
                  disabled={conditions.length === 1}
                  onClick={() => removeCondition(index)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={addCondition}>
              <Icon name="plus" size={12} />
              Add condition
            </button>
          </div>

          <div className="pt-2">
            <span className="field-label">Where clause</span>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-base px-2.5 py-2 font-mono text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+6px)] text-text-muted">
              {where || 'Add a condition to build the filter.'}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!where}
            onClick={() => onApply(conditions)}
          >
            Apply filter
          </button>
        </div>
      </div>
    </div>
  )
}
