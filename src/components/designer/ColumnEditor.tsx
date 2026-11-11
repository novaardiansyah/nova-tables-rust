import React, { useEffect, useState } from 'react'
import Icon from '@/components/common/Icon'
import Select from '@/components/common/Select'
import { DesignerColumn, TYPE_BY_NAME, TYPE_OPTIONS } from '@/components/designer/designerConstants'

interface LengthInputProps {
  value?: number | null
  onChange: (value: number) => void
  allowMax?: boolean
}

function LengthInput({ value, onChange, allowMax = false }: LengthInputProps) {
  const isMax = value === -1
  const [text, setText] = useState<string>(isMax ? 'MAX' : (value === null || value === undefined ? '' : String(value)))

  useEffect(() => {
    setText(value === -1 ? 'MAX' : (value === null || value === undefined ? '' : String(value)))
  }, [value])

  const commitValue = (inputStr: string) => {
    const trimmed = inputStr.trim().toUpperCase()
    if (allowMax && (trimmed === 'MAX' || trimmed === '-1' || trimmed === 'M' || trimmed === 'MA')) {
      onChange(-1)
      setText('MAX')
      return
    }
    const num = parseInt(trimmed, 10)
    if (!Number.isNaN(num) && num > 0) {
      onChange(num)
      setText(String(num))
    } else {
      const fallback = value === -1 ? 'MAX' : (value ? String(value) : '50')
      setText(fallback)
      if (value !== -1 && !value) {
        onChange(50)
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    const trimmed = raw.trim().toUpperCase()
    if (allowMax && (trimmed === 'MAX' || trimmed === '-1')) {
      onChange(-1)
    } else {
      const num = parseInt(trimmed, 10)
      if (!Number.isNaN(num) && num > 0 && String(num) === trimmed) {
        onChange(num)
      }
    }
  }

  const handleToggleMax = () => {
    if (isMax) {
      onChange(50)
      setText('50')
    } else {
      onChange(-1)
      setText('MAX')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        className="field w-16"
        value={text}
        onChange={handleChange}
        onBlur={() => commitValue(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitValue(text)
          }
        }}
        placeholder="50"
        spellCheck={false}
      />
      {allowMax ? (
        <button
          type="button"
          onClick={handleToggleMax}
          className={`h-9 shrink-0 rounded-md px-2 text-[length:var(--app-text-11)] font-semibold border transition-colors ${
            isMax
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line-strong bg-base text-text-muted hover:text-text hover:border-accent/70'
          }`}
          title={isMax ? 'Switch to fixed length' : 'Set length to MAX'}
        >
          MAX
        </button>
      ) : null}
    </div>
  )
}

const MAX_LENGTH_TYPES = new Set(['varchar', 'nvarchar', 'varbinary'])

export interface DragOverState {
  index: number
  position: 'before' | 'after'
}

export interface ColumnEditorProps {
  columns: DesignerColumn[]
  primaryNames: string[]
  updateColumn: (index: number, patch: Partial<DesignerColumn>) => void
  togglePrimaryColumn: (columnName: string) => void
  insertColumnAt: (index: number) => void
  duplicateColumn: (index: number) => void
  removeColumn: (index: number) => void
  addColumn: () => void
  handleDropColumn: (targetIndex: number, position: 'before' | 'after') => void
  dragIndex: number | null
  setDragIndex: (index: number | null) => void
  dragOverState: DragOverState | null
  setDragOverState: (state: DragOverState | null) => void
}

export default function ColumnEditor({
  columns,
  primaryNames,
  updateColumn,
  togglePrimaryColumn,
  insertColumnAt,
  duplicateColumn,
  removeColumn,
  addColumn,
  handleDropColumn,
  dragIndex,
  setDragIndex,
  dragOverState,
  setDragOverState,
}: ColumnEditorProps) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[length:var(--app-text-11)] font-semibold uppercase tracking-wider text-text-muted">Columns</span>
        <span className="text-[length:var(--app-text-11)] text-text-faint">{columns.length}</span>
        <button type="button" className="btn-ghost ml-auto h-6 px-2 text-[length:var(--app-text-11)]" onClick={addColumn}>
          <Icon name="plus" size={12} />
          Add column
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[length:var(--app-text-12)]">
          <thead>
            <tr className="text-left text-[length:var(--app-text-10)] uppercase tracking-wider text-text-faint">
              <th className="w-8 px-1 py-2 text-center font-medium"></th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Length</th>
              <th className="px-2 py-2 font-medium">Default</th>
              <th className="px-2 py-2 text-center font-medium">Null</th>
              <th className="px-2 py-2 text-center font-medium">Identity</th>
              <th className="px-2 py-2 text-center font-medium">PK</th>
              <th className="px-2 py-2 text-center font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => {
              const type = TYPE_BY_NAME.get(column.typeName)
              return (
                <tr
                  key={index}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dragIndex === null) return
                    const rect = event.currentTarget.getBoundingClientRect()
                    const isTop = event.clientY - rect.top < rect.height / 2
                    const position = isTop ? 'before' : 'after'
                    if (dragOverState?.index !== index || dragOverState?.position !== position) {
                      setDragOverState({ index, position })
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDragOverState(null)
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDropColumn(index, dragOverState?.position || 'after')
                    setDragIndex(null)
                    setDragOverState(null)
                  }}
                  className={`border-t border-line align-top transition-colors ${
                    dragOverState?.index === index
                      ? dragOverState.position === 'before'
                        ? 'border-t-2 !border-t-accent'
                        : 'border-b-2 !border-b-accent'
                      : ''
                  } ${dragIndex === index ? 'opacity-40' : ''}`}
                >
                  <td className="w-8 px-1 py-2 text-center">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', String(index))
                        event.dataTransfer.effectAllowed = 'move'
                        setDragIndex(index)
                      }}
                      onDragEnd={() => {
                        setDragIndex(null)
                        setDragOverState(null)
                      }}
                      className="inline-flex cursor-grab items-center justify-center p-1 text-text-faint hover:text-text active:cursor-grabbing"
                      title="Drag to reorder column"
                    >
                      <Icon name="grip" size={13} />
                    </button>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="field"
                      value={column.name}
                      onChange={(event) => updateColumn(index, { name: event.target.value })}
                      placeholder="column_name"
                      spellCheck={false}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={column.typeName}
                      options={TYPE_OPTIONS}
                      searchable
                      searchPlaceholder="Search type…"
                      panelClassName="w-48"
                      onChange={(value) => updateColumn(index, { typeName: value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {type?.precision ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="field w-16"
                          type="number"
                          value={column.precision ?? ''}
                          onChange={(event) => updateColumn(index, { precision: Number(event.target.value) })}
                          placeholder="18"
                        />
                        <span className="text-text-faint">,</span>
                        <input
                          className="field w-14"
                          type="number"
                          value={column.scale ?? ''}
                          onChange={(event) => updateColumn(index, { scale: Number(event.target.value) })}
                          placeholder="0"
                        />
                      </div>
                    ) : type?.scale ? (
                      <input
                        className="field w-16"
                        type="number"
                        value={column.scale ?? ''}
                        onChange={(event) => updateColumn(index, { scale: Number(event.target.value) })}
                        placeholder="7"
                      />
                    ) : type?.length ? (
                      <LengthInput
                        value={column.maxLength}
                        allowMax={MAX_LENGTH_TYPES.has(column.typeName)}
                        onChange={(value) => updateColumn(index, { maxLength: value })}
                      />
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="field"
                      value={column.defaultDefinition ?? ''}
                      onChange={(event) => updateColumn(index, { defaultDefinition: event.target.value || null })}
                      spellCheck={false}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(column.isNullable)}
                      onChange={(event) => updateColumn(index, { isNullable: event.target.checked })}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(column.isIdentity)}
                      onChange={(event) => updateColumn(index, { isIdentity: event.target.checked })}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={primaryNames.includes(column.name)}
                      onChange={() => togglePrimaryColumn(column.name)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        className="icon-btn h-6 w-6 hover:text-accent"
                        onClick={() => insertColumnAt(index)}
                        title="Insert column above"
                      >
                        <Icon name="plus" size={12} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-6 w-6 hover:text-accent"
                        onClick={() => duplicateColumn(index)}
                        title="Duplicate column"
                      >
                        <Icon name="replicate" size={12} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-6 w-6 hover:text-danger"
                        onClick={() => removeColumn(index)}
                        title="Remove column"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-line bg-panel/40 px-3 py-2">
        <button
          type="button"
          className="btn-soft h-7 px-2.5 text-[length:var(--app-text-11)]"
          onClick={addColumn}
        >
          <Icon name="plus" size={12} />
          Add column
        </button>
        <span className="text-[length:var(--app-text-11)] text-text-muted">
          {columns.length} column{columns.length === 1 ? '' : 's'} · Drag grip to reorder or insert anywhere
        </span>
      </div>
    </section>
  )
}
