import React from 'react'
import Icon from '@/components/common/Icon'
import { ErdTable } from './erdTypes'

export interface ErdTableNodeProps {
  table: ErdTable
  position: { x: number; y: number }
  isHighlighted?: boolean
  isDimmed?: boolean
  searchQuery?: string
  onDragStart: (e: React.MouseEvent, tableKey: string) => void
  onBrowse?: (schema: string, name: string) => void
  onOpenStructure?: (table: { schema: string; name: string }) => void
}

export default function ErdTableNode({
  table,
  position,
  isHighlighted = false,
  isDimmed = false,
  searchQuery = '',
  onDragStart,
  onBrowse,
  onOpenStructure,
}: ErdTableNodeProps) {
  const tableKey = `${table.schema}.${table.name}`
  const query = searchQuery.trim().toLowerCase()
  const tableMatches = query ? table.name.toLowerCase().includes(query) : false

  return (
    <div
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: 260,
      }}
      className={`absolute select-none rounded-lg border bg-panel transition-shadow erd-node ${
        isHighlighted
          ? 'border-accent shadow-md shadow-accent/20 ring-1 ring-accent z-20'
          : tableMatches
            ? 'border-warning/80 shadow-md ring-1 ring-warning z-10'
            : 'border-line hover:border-line-strong z-10'
      } ${isDimmed ? 'opacity-35' : 'opacity-100'}`}
    >
      <div
        onMouseDown={(e) => onDragStart(e, tableKey)}
        className="flex cursor-grab items-center justify-between border-b border-line bg-surface/60 px-2.5 py-1.5 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon name="table" size={13} className="shrink-0 text-accent" />
          <span className="truncate text-[length:var(--app-text-11)] font-semibold text-text-strong" title={tableKey}>
            {table.schema !== 'dbo' && table.schema ? (
              <span className="text-text-faint font-normal">{table.schema}.</span>
            ) : null}
            {table.name}
          </span>
          {table.isJunction ? (
            <span className="rounded bg-accent/15 px-1 py-0.5 text-[length:var(--app-text-9)] font-medium text-accent">
              Junction
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onBrowse ? (
            <button
              type="button"
              onClick={() => onBrowse(table.schema, table.name)}
              className="icon-btn h-5 w-5 text-text-muted hover:text-text"
              title="Browse table data"
            >
              <Icon name="play" size={10} />
            </button>
          ) : null}
          {onOpenStructure ? (
            <button
              type="button"
              onClick={() => onOpenStructure({ schema: table.schema, name: table.name })}
              className="icon-btn h-5 w-5 text-text-muted hover:text-text"
              title="Open table structure"
            >
              <Icon name="pencil" size={10} />
            </button>
          ) : null}
        </div>
      </div>

      <div
  className="max-h-[260px] overflow-y-auto overflow-x-hidden overscroll-contain divide-y divide-line/40 py-0.5"
  onWheel={(e) => e.stopPropagation()}
  onMouseDown={(e) => e.stopPropagation()}
>
        {table.columns.map((col) => {
          const colMatches = query ? col.name.toLowerCase().includes(query) : false
          return (
            <div
              key={col.name}
              className={`flex items-center justify-between px-2.5 py-1 text-[length:var(--app-text-11)] ${
                colMatches ? 'bg-warning/15 font-medium' : 'hover:bg-tint/[0.04]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {col.isPrimaryKey ? (
                  <span title="Primary Key" className="shrink-0 text-warning">
                    <Icon name="key" size={11} />
                  </span>
                ) : col.isForeignKey ? (
                  <span title="Foreign Key" className="shrink-0 text-accent">
                    <Icon name="key" size={11} />
                  </span>
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
                <span
                  className={`truncate ${
                    col.isPrimaryKey
                      ? 'font-medium text-text-strong'
                      : col.isForeignKey
                        ? 'font-medium text-accent'
                        : 'text-text'
                  }`}
                  title={col.name}
                >
                  {col.name}
                </span>
                {col.isUnique && !col.isPrimaryKey ? (
                  <span className="rounded bg-line/60 px-1 py-px text-[length:var(--app-text-9)] text-text-faint" title="Unique constraint">
                    UQ
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1.5 pl-2 text-right">
                <span className="font-mono text-[length:var(--app-text-10)] text-text-faint" title={col.dataType}>
                  {col.dataType}
                </span>
                <span className="text-[length:var(--app-text-9)] text-text-faint/80">
                  {col.isNullable ? 'NULL' : 'NN'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
