import Icon from '../common/Icon'
import Select from '../common/Select'
import { DesignerColumn, TYPE_BY_NAME, TYPE_OPTIONS } from './designerConstants'

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
                      <input
                        className="field w-20"
                        value={column.maxLength === -1 ? 'MAX' : column.maxLength ?? ''}
                        onChange={(event) => {
                          const raw = event.target.value.trim().toUpperCase()
                          if (raw === 'MAX') updateColumn(index, { maxLength: -1 })
                          else updateColumn(index, { maxLength: Number(event.target.value) || 0 })
                        }}
                        placeholder="50"
                        spellCheck={false}
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
