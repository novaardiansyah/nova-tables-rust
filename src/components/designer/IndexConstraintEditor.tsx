import Icon from '@/components/common/Icon'
import Select from '@/components/common/Select'
import { Editor, Section } from '@/components/designer/DesignerControls'
import { DesignUniqueKey, DesignForeignKey, DesignIndex, DesignForeignKeyColumn } from '@/designSql'

export interface ColumnOption {
  value: string
  label: string
}

export interface TableOption {
  value: string
  label: string
}

export interface IndexConstraintDraft {
  uniqueKeys?: DesignUniqueKey[] | null
  foreignKeys?: DesignForeignKey[] | null
  indexes?: DesignIndex[] | null
}

export interface IndexConstraintEditorProps {
  draft: IndexConstraintDraft
  columnOptions: ColumnOption[]
  tableOptions: TableOption[]
  getReferencedColumnOptions: (schema?: string | null, table?: string | null) => ColumnOption[]
  handleReferencedTableChange: (index: number, fullTableName: string) => void
  updateUnique: (index: number, patch: Partial<DesignUniqueKey>) => void
  removeUnique: (index: number) => void
  addUnique: () => void
  updateForeign: (index: number, patch: Partial<DesignForeignKey>) => void
  removeForeign: (index: number) => void
  addForeign: () => void
  updateForeignColumn: (fkIndex: number, colIndex: number, patch: Partial<DesignForeignKeyColumn>) => void
  updateIndex: (index: number, patch: Partial<DesignIndex>) => void
  removeIndex: (index: number) => void
  addIndex: () => void
  toggleIndexColumn: (indexPosition: number, columnName: string) => void
}

export default function IndexConstraintEditor({
  draft,
  columnOptions,
  tableOptions,
  getReferencedColumnOptions,
  handleReferencedTableChange,
  updateUnique,
  removeUnique,
  addUnique,
  updateForeign,
  removeForeign,
  addForeign,
  updateForeignColumn,
  updateIndex,
  removeIndex,
  addIndex,
  toggleIndexColumn,
}: IndexConstraintEditorProps) {
  const uniqueKeys = draft.uniqueKeys || []
  const foreignKeys = draft.foreignKeys || []
  const indexes = draft.indexes || []

  return (
    <>
      <Section title="Unique keys" count={uniqueKeys.length} onAdd={addUnique} addLabel="Add unique key">
        {uniqueKeys.length === 0 ? (
          <p className="text-[length:var(--app-text-11)] text-text-faint">No unique keys.</p>
        ) : (
          <div className="space-y-2">
            {uniqueKeys.map((key, index) => (
              <div key={index} className="flex items-end gap-2">
                <Editor label="Name" value={key.name} onChange={(value) => updateUnique(index, { name: value })} className="w-64" />
                <div className="flex-1">
                  <span className="field-label">Columns</span>
                  <div className="flex flex-wrap gap-1.5">
                    {columnOptions.length === 0 ? (
                      <span className="text-[length:var(--app-text-11)] text-text-faint">No columns.</span>
                    ) : (
                      columnOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-[length:var(--app-text-11)] text-text">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-accent"
                            checked={key.columns.includes(option.value)}
                            onChange={() =>
                              updateUnique(index, {
                                columns: key.columns.includes(option.value)
                                  ? key.columns.filter((column) => column !== option.value)
                                  : [...key.columns, option.value],
                              })
                            }
                          />
                          {option.label}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <button type="button" className="icon-btn h-8 w-8 hover:text-danger" onClick={() => removeUnique(index)} title="Remove unique key">
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Foreign keys" count={foreignKeys.length} onAdd={addForeign} addLabel="Add foreign key">
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[length:var(--app-text-12)]">
              <thead>
                <tr className="text-left text-[length:var(--app-text-10)] uppercase tracking-wider text-text-faint">
                  <th className="w-[34%] px-2 py-2 font-medium">Name</th>
                  <th className="w-[22%] px-2 py-2 font-medium">Column</th>
                  <th className="w-[22%] px-2 py-2 font-medium">Referenced table</th>
                  <th className="w-[14%] px-2 py-2 font-medium">Referenced column</th>
                  <th className="w-[8%] px-2 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {foreignKeys.length === 0 ? (
                  <tr className="border-t border-line">
                    <td colSpan={5} className="px-2 py-3 text-center text-[length:var(--app-text-11)] text-text-faint">
                      No foreign keys.
                    </td>
                  </tr>
                ) : (
                  foreignKeys.map((key, index) => {
                    const currentTableValue = key.referencedTable
                      ? `${key.referencedSchema || 'dbo'}.${key.referencedTable}`
                      : ''
                    const currentTableLabel = key.referencedTable
                      ? (!key.referencedSchema || key.referencedSchema.toLowerCase() === 'dbo'
                          ? key.referencedTable
                          : `${key.referencedSchema}.${key.referencedTable}`)
                      : ''
                    const fkTableOptions =
                      currentTableValue && !tableOptions.some((o) => o.value === currentTableValue)
                        ? [{ value: currentTableValue, label: currentTableLabel }, ...tableOptions]
                        : tableOptions
                    const refColOptions = getReferencedColumnOptions(key.referencedSchema, key.referencedTable)
                    const firstColumn = key.columns[0] || { column: '', referencedColumn: '' }
                    const fkColOptions =
                      firstColumn.referencedColumn && !refColOptions.some((o) => o.value === firstColumn.referencedColumn)
                        ? [{ value: firstColumn.referencedColumn, label: firstColumn.referencedColumn }, ...refColOptions]
                        : refColOptions

                    return (
                      <tr key={index} className="border-t border-line align-top">
                        <td className="px-2 py-1.5">
                          <input
                            className="field"
                            value={key.name}
                            onChange={(event) => updateForeign(index, { name: event.target.value })}
                            placeholder="FK_name"
                            spellCheck={false}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={firstColumn.column}
                            options={columnOptions}
                            onChange={(value) => updateForeignColumn(index, 0, { column: value })}
                            icon="key"
                            placeholder="Column…"
                            searchable
                            searchPlaceholder="Search column…"
                            className="w-full"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={currentTableValue}
                            options={fkTableOptions}
                            onChange={(value) => handleReferencedTableChange(index, value)}
                            icon="table"
                            placeholder="Select table…"
                            emptyLabel="No tables"
                            searchable
                            searchPlaceholder="Search table…"
                            className="w-full"
                            panelClassName="w-64"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {refColOptions.length > 0 ? (
                            <Select
                              value={firstColumn.referencedColumn}
                              options={fkColOptions}
                              onChange={(value) => updateForeignColumn(index, 0, { referencedColumn: value })}
                              icon="key"
                              placeholder="Column…"
                              emptyLabel="No columns"
                              searchable
                              searchPlaceholder="Search column…"
                              className="w-full"
                            />
                          ) : (
                            <input
                              className="field h-8 w-full py-0 text-[length:var(--app-text-12)]"
                              value={firstColumn.referencedColumn}
                              onChange={(event) => updateForeignColumn(index, 0, { referencedColumn: event.target.value })}
                              placeholder={key.referencedTable ? 'Column' : 'Select table'}
                              disabled={!key.referencedTable}
                              spellCheck={false}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" className="icon-btn h-8 w-8 hover:text-danger" onClick={() => removeForeign(index)} title="Remove foreign key">
                            <Icon name="trash" size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              className="btn-soft h-7 px-2.5 text-[length:var(--app-text-11)]"
              onClick={addForeign}
            >
              <Icon name="plus" size={12} />
              Add foreign key
            </button>
            <span className="text-[length:var(--app-text-11)] text-text-muted">
              {foreignKeys.length} foreign key{foreignKeys.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </Section>

      <Section title="Indexes" count={indexes.length} onAdd={addIndex} addLabel="Add index">
        {indexes.length === 0 ? (
          <p className="text-[length:var(--app-text-11)] text-text-faint">No indexes.</p>
        ) : (
          <div className="space-y-2">
            {indexes.map((index, position) => (
              <div key={position} className="flex items-end gap-2">
                <Editor label="Name" value={index.name} onChange={(value) => updateIndex(position, { name: value })} className="w-64" />
                <div className="flex-1">
                  <span className="field-label">Columns</span>
                  <div className="flex flex-wrap gap-1.5">
                    {columnOptions.length === 0 ? (
                      <span className="text-[length:var(--app-text-11)] text-text-faint">No columns.</span>
                    ) : (
                      columnOptions.map((option) => (
                        <label key={option.value} className="flex items-center gap-1 rounded border border-line-strong px-2 py-1 text-[length:var(--app-text-11)] text-text">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-accent"
                            checked={index.columns.includes(option.value)}
                            onChange={() => toggleIndexColumn(position, option.value)}
                          />
                          {option.label}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[length:var(--app-text-11)] text-text-soft">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={Boolean(index.unique)} onChange={(event) => updateIndex(position, { unique: event.target.checked })} />
                  Unique
                </label>
                <button type="button" className="icon-btn h-8 w-8 hover:text-danger" onClick={() => removeIndex(position)} title="Remove index">
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
