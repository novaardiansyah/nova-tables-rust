import Icon from '../common/Icon.jsx'
import Select from '../common/Select.jsx'
import { Editor, Section } from './DesignerControls.jsx'

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
  addForeignColumn,
  removeForeignColumn,
  updateIndex,
  removeIndex,
  addIndex,
  toggleIndexColumn,
}) {
  return (
    <>
      <Section title="Unique keys" count={draft.uniqueKeys.length} onAdd={addUnique} addLabel="Add unique key">
        {draft.uniqueKeys.length === 0 ? (
          <p className="text-[length:var(--app-text-11)] text-text-faint">No unique keys.</p>
        ) : (
          <div className="space-y-2">
            {draft.uniqueKeys.map((key, index) => (
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

      <Section title="Foreign keys" count={draft.foreignKeys.length} onAdd={addForeign} addLabel="Add foreign key">
        {draft.foreignKeys.length === 0 ? (
          <p className="text-[length:var(--app-text-11)] text-text-faint">No foreign keys.</p>
        ) : (
          <div className="space-y-3">
            {draft.foreignKeys.map((key, index) => {
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

              return (
                <div key={index} className="rounded-md border border-line bg-base p-2.5">
                  <div className="flex items-end gap-2">
                    <Editor label="Name" value={key.name} onChange={(value) => updateForeign(index, { name: value })} className="w-56" />
                    <div className="w-56">
                      <span className="field-label">Referenced table</span>
                      <Select
                        value={currentTableValue}
                        options={fkTableOptions}
                        onChange={(value) => handleReferencedTableChange(index, value)}
                        icon="table"
                        placeholder="Select table…"
                        emptyLabel="No tables"
                        searchable
                        searchPlaceholder="Search table…"
                        panelClassName="w-64"
                      />
                    </div>
                    <button type="button" className="icon-btn h-8 w-8 hover:text-danger" onClick={() => removeForeign(index)} title="Remove foreign key">
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {key.columns.map((item, columnIndex) => {
                      const fkColOptions =
                        item.referencedColumn && !refColOptions.some((o) => o.value === item.referencedColumn)
                          ? [{ value: item.referencedColumn, label: item.referencedColumn }, ...refColOptions]
                          : refColOptions

                      return (
                        <div key={columnIndex} className="flex items-center gap-2">
                          <Select
                            value={item.column}
                            options={columnOptions}
                            onChange={(value) => updateForeignColumn(index, columnIndex, { column: value })}
                            icon="key"
                            placeholder="Select column…"
                            searchable
                            searchPlaceholder="Search column…"
                            className="w-44"
                          />
                          <Icon name="chevron-right" size={12} className="shrink-0 text-text-faint" />
                          {refColOptions.length > 0 ? (
                            <Select
                              value={item.referencedColumn}
                              options={fkColOptions}
                              onChange={(value) => updateForeignColumn(index, columnIndex, { referencedColumn: value })}
                              icon="key"
                              placeholder="Referenced column…"
                              emptyLabel="No columns"
                              searchable
                              searchPlaceholder="Search column…"
                              className="w-48"
                            />
                          ) : (
                            <input
                              className="field h-8 w-48 py-0 text-[length:var(--app-text-12)]"
                              value={item.referencedColumn}
                              onChange={(event) => updateForeignColumn(index, columnIndex, { referencedColumn: event.target.value })}
                              placeholder={key.referencedTable ? 'referenced column' : 'select table first'}
                              disabled={!key.referencedTable}
                              spellCheck={false}
                            />
                          )}
                          <button
                            type="button"
                            className="icon-btn h-6 w-6 hover:text-danger"
                            onClick={() => removeForeignColumn(index, columnIndex)}
                            disabled={key.columns.length === 1}
                            title="Remove column pair"
                          >
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      )
                    })}
                    <button type="button" className="btn-ghost h-6 px-2 text-[length:var(--app-text-11)]" onClick={() => addForeignColumn(index)}>
                      <Icon name="plus" size={11} />
                      Add column pair
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Indexes" count={draft.indexes.length} onAdd={addIndex} addLabel="Add index">
        {draft.indexes.length === 0 ? (
          <p className="text-[length:var(--app-text-11)] text-text-faint">No indexes.</p>
        ) : (
          <div className="space-y-2">
            {draft.indexes.map((index, position) => (
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
                  <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={index.unique} onChange={(event) => updateIndex(position, { unique: event.target.checked })} />
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
