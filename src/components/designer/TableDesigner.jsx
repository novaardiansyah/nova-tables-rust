import { useEffect, useMemo, useRef, useState } from 'react'
import Icon, { Spinner } from '../common/Icon.jsx'
import ColumnEditor from './ColumnEditor.jsx'
import IndexConstraintEditor from './IndexConstraintEditor.jsx'
import { Editor } from './DesignerControls.jsx'
import { NEW_TABLE_TEMPLATE } from './designerConstants.js'
import {
  checkRequiresRecreation,
  generateAlterTable,
  generateCreateTable,
  generateRecreateTable,
} from '../../designSql.js'

function RecreateConfirmDialog({ open, onCancel, onConfirmRecreate, onConfirmAlter }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]">
      <div className="animate-fade-in w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Icon name="alert-triangle" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Table Re-creation Required
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              Column positions were changed or inserted in the middle. SQL Server does not support column reordering via standard ALTER TABLE.
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={onCancel} title="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-muted">
          <p>
            To preserve the exact column order, the table must be recreated in a transaction (data is copied into a temporary table and restored).
          </p>
          <p>
            Alternatively, you can choose <span className="font-medium text-text">Append at end</span> to use standard ALTER TABLE (new columns will be placed at the end without table recreation).
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel/50 px-5 py-3">
          <button type="button" className="btn-ghost h-7 px-3 text-[length:var(--app-text-11)]" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-soft h-7 px-3 text-[length:var(--app-text-11)]"
            onClick={onConfirmAlter}
            title="Append new columns at the end without table recreation"
          >
            Append at end (ALTER)
          </button>
          <button
            type="button"
            className="btn-primary h-7 px-3 text-[length:var(--app-text-11)]"
            onClick={onConfirmRecreate}
            title="Recreate table to preserve exact column order"
          >
            Re-create table
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TableDesigner({
  design,
  mode,
  loading,
  error,
  busy,
  availableTables = [],
  availableColumns = [],
  onRenameTable,
  onGenerate,
  onApply,
}) {
  const [draft, setDraft] = useState(design ?? NEW_TABLE_TEMPLATE)
  const [notice, setNotice] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverState, setDragOverState] = useState(null)
  const [recreateDialog, setRecreateDialog] = useState({ open: false, action: null })
  const originalRef = useRef(design)

  useEffect(() => {
    originalRef.current = design
    setDraft(design ?? NEW_TABLE_TEMPLATE)
    setNotice(null)
  }, [design])

  const allTables = useMemo(() => {
    const list = [...availableTables]
    if (draft.table && !list.some((t) => t.schema === draft.schema && t.name === draft.table)) {
      list.push({ schema: draft.schema || 'dbo', name: draft.table, primaryKey: draft.primaryKey })
    }
    return list
  }, [availableTables, draft.schema, draft.table, draft.primaryKey])

  const tableOptions = useMemo(
    () => allTables.map((t) => {
      const isDbo = !t.schema || t.schema.toLowerCase() === 'dbo'
      return {
        value: `${t.schema || 'dbo'}.${t.name}`,
        label: isDbo ? t.name : `${t.schema}.${t.name}`,
      }
    }),
    [allTables],
  )

  const discard = () => {
    setDraft(originalRef.current ?? NEW_TABLE_TEMPLATE)
    setNotice(null)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[length:var(--app-text-12)] text-text-muted">
        <Spinner size={14} />
        Reading table definition…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-danger">
        {error}
      </div>
    )
  }

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }))

  const updateColumn = (index, patch) =>
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.map((column, position) =>
        position === index ? { ...column, ...patch } : column,
      ),
    }))

  const addColumn = () =>
    setDraft((prev) => ({ ...prev, columns: [...prev.columns, { ...NEW_TABLE_TEMPLATE.columns[0], name: `column_${prev.columns.length + 1}`, isIdentity: false, isNullable: true }] }))

  const insertColumnAt = (index) =>
    setDraft((prev) => {
      const next = [...prev.columns]
      next.splice(index, 0, { ...NEW_TABLE_TEMPLATE.columns[0], name: `column_${prev.columns.length + 1}`, isIdentity: false, isNullable: true })
      return { ...prev, columns: next }
    })

  const handleDropColumn = (targetIndex, position) => {
    if (dragIndex === null || dragIndex === targetIndex) return
    setDraft((prev) => {
      const next = [...prev.columns]
      const [item] = next.splice(dragIndex, 1)
      let insertAt = targetIndex
      if (dragIndex < targetIndex) {
        insertAt = position === 'before' ? targetIndex - 1 : targetIndex
      } else {
        insertAt = position === 'before' ? targetIndex : targetIndex + 1
      }
      next.splice(insertAt, 0, item)
      return { ...prev, columns: next }
    })
  }

  const removeColumn = (index) =>
    setDraft((prev) => {
      const removed = prev.columns[index]
      return {
        ...prev,
        columns: prev.columns.filter((_, position) => position !== index),
        primaryKey: prev.primaryKey.filter((column) => column !== removed.name),
        uniqueKeys: prev.uniqueKeys
          .map((key) => ({ ...key, columns: key.columns.filter((column) => column !== removed.name) }))
          .filter((key) => key.columns.length > 0),
        foreignKeys: prev.foreignKeys
          .map((key) => ({
            ...key,
            columns: key.columns.filter((item) => item.column !== removed.name),
          }))
          .filter((key) => key.columns.length > 0),
        indexes: prev.indexes
          .map((idx) => ({ ...idx, columns: idx.columns.filter((column) => column !== removed.name) }))
          .filter((idx) => idx.columns.length > 0),
      }
    })

  const columnOptions = draft.columns
    .filter((column) => column.name)
    .map((column) => ({ value: column.name, label: column.name }))

  const getReferencedColumnOptions = (referencedSchema, referencedTable) => {
    if (!referencedTable) return []
    const schema = (referencedSchema || 'dbo').toLowerCase()
    const table = referencedTable.toLowerCase()

    let cols = []
    if (schema === (draft.schema || 'dbo').toLowerCase() && table === (draft.table || '').toLowerCase()) {
      cols = draft.columns.filter((c) => c.name).map((c) => c.name)
    } else {
      const match = availableColumns.find(
        (t) => t.schema.toLowerCase() === schema && t.name.toLowerCase() === table,
      )
      if (match?.columns?.length) {
        cols = match.columns
      } else {
        const tableMatch = allTables.find(
          (t) => t.schema.toLowerCase() === schema && t.name.toLowerCase() === table,
        )
        cols = tableMatch?.primaryKey ?? []
      }
    }
    return cols.map((name) => ({ value: name, label: name }))
  }

  const primaryNames = draft.primaryKey

  const togglePrimaryColumn = (name) =>
    setDraft((prev) => ({
      ...prev,
      primaryKey: prev.primaryKey.includes(name)
        ? prev.primaryKey.filter((column) => column !== name)
        : [...prev.primaryKey, name],
    }))

  const addUnique = () =>
    setDraft((prev) => ({
      ...prev,
      uniqueKeys: [
        ...prev.uniqueKeys,
        { name: `UQ_${prev.table || 'table'}_${prev.uniqueKeys.length + 1}`, columns: [], clustered: false },
      ],
    }))

  const updateUnique = (index, patch) =>
    setDraft((prev) => ({
      ...prev,
      uniqueKeys: prev.uniqueKeys.map((key, position) => (position === index ? { ...key, ...patch } : key)),
    }))

  const removeUnique = (index) =>
    setDraft((prev) => ({ ...prev, uniqueKeys: prev.uniqueKeys.filter((_, position) => position !== index) }))

  const addForeign = () =>
    setDraft((prev) => ({
      ...prev,
      foreignKeys: [
        ...prev.foreignKeys,
        {
          name: `FK_${prev.table || 'table'}_${prev.foreignKeys.length + 1}`,
          referencedSchema: 'dbo',
          referencedTable: '',
          columns: [{ column: '', referencedColumn: '' }],
        },
      ],
    }))

  const updateForeign = (index, patch) =>
    setDraft((prev) => ({
      ...prev,
      foreignKeys: prev.foreignKeys.map((key, position) => (position === index ? { ...key, ...patch } : key)),
    }))

  const handleReferencedTableChange = (fkIndex, fullTableName) => {
    const parts = fullTableName.split('.')
    const schema = parts.length > 1 ? parts[0] : (draft.schema || 'dbo')
    const tableName = parts.length > 1 ? parts.slice(1).join('.') : parts[0]
    const foundTable = allTables.find((t) => t.schema === schema && t.name === tableName)
    const defaultPk = foundTable?.primaryKey?.[0] || ''

    updateForeign(fkIndex, {
      referencedSchema: schema,
      referencedTable: tableName,
      columns: draft.foreignKeys[fkIndex].columns.map((c, i) =>
        i === 0 && !c.referencedColumn && defaultPk ? { ...c, referencedColumn: defaultPk } : c,
      ),
    })
  }

  const updateForeignColumn = (index, columnIndex, patch) =>
    setDraft((prev) => ({
      ...prev,
      foreignKeys: prev.foreignKeys.map((key, position) =>
        position === index
          ? { ...key, columns: key.columns.map((item, itemPosition) => (itemPosition === columnIndex ? { ...item, ...patch } : item)) }
          : key,
      ),
    }))

  const addForeignColumn = (index) =>
    setDraft((prev) => ({
      ...prev,
      foreignKeys: prev.foreignKeys.map((key, position) =>
        position === index ? { ...key, columns: [...key.columns, { column: '', referencedColumn: '' }] } : key,
      ),
    }))

  const removeForeignColumn = (index, columnIndex) =>
    setDraft((prev) => ({
      ...prev,
      foreignKeys: prev.foreignKeys.map((key, position) =>
        position === index ? { ...key, columns: key.columns.filter((_, itemPosition) => itemPosition !== columnIndex) } : key,
      ),
    }))

  const removeForeign = (index) =>
    setDraft((prev) => ({ ...prev, foreignKeys: prev.foreignKeys.filter((_, position) => position !== index) }))

  const addIndex = () =>
    setDraft((prev) => ({
      ...prev,
      indexes: [
        ...prev.indexes,
        { name: `IX_${prev.table || 'table'}_${prev.indexes.length + 1}`, columns: [], descending: [], unique: false, clustered: false },
      ],
    }))

  const updateIndex = (index, patch) =>
    setDraft((prev) => ({
      ...prev,
      indexes: prev.indexes.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    }))

  const removeIndex = (index) =>
    setDraft((prev) => ({ ...prev, indexes: prev.indexes.filter((_, position) => position !== index) }))

  const toggleIndexColumn = (index, column) =>
    setDraft((prev) => ({
      ...prev,
      indexes: prev.indexes.map((item, position) => {
        if (position !== index) return item
        const at = item.columns.indexOf(column)
        if (at === -1) return { ...item, columns: [...item.columns, column] }
        return {
          ...item,
          columns: item.columns.filter((_, itemPosition) => itemPosition !== at),
          descending: item.descending.filter((_, itemPosition) => itemPosition !== at),
        }
      }),
    }))

  const buildSql = (forceMode) => {
    if (mode === 'new') return generateCreateTable(draft)
    if (!originalRef.current) return '-- Loading'
    if (forceMode === 'recreate') return generateRecreateTable(originalRef.current, draft)
    return generateAlterTable(originalRef.current, draft)
  }

  const preview = (forceMode) => {
    try {
      const text = buildSql(forceMode)
      setNotice(null)
      return text
    } catch (buildError) {
      setNotice(buildError.message)
      return null
    }
  }

  const handleGenerate = (forceMode) => {
    if (mode === 'edit' && !forceMode && checkRequiresRecreation(originalRef.current, draft)) {
      setRecreateDialog({ open: true, action: 'generate' })
      return
    }
    const text = preview(forceMode)
    if (text) onGenerate(text)
  }

  const handleApply = (forceMode) => {
    if (mode === 'edit' && !forceMode && checkRequiresRecreation(originalRef.current, draft)) {
      setRecreateDialog({ open: true, action: 'apply' })
      return
    }
    const text = preview(forceMode)
    if (!text) return
    onApply(text, draft)
  }

  const confirmRecreate = () => {
    const action = recreateDialog.action
    setRecreateDialog({ open: false, action: null })
    if (action === 'generate') handleGenerate('recreate')
    if (action === 'apply') handleApply('recreate')
  }

  const confirmAlter = () => {
    const action = recreateDialog.action
    setRecreateDialog({ open: false, action: null })
    if (action === 'generate') handleGenerate('alter')
    if (action === 'apply') handleApply('alter')
  }

  const handleRename = () => {
    const next = draft.table.trim()
    if (!next || next === design?.table) return
    onRenameTable(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3.5">
        <Icon name="table" size={14} className="shrink-0 text-text-muted" />
        <span className="text-[length:var(--app-text-12)] text-text-muted">{draft.schema}</span>
        <button
          type="button"
          onClick={() => {}}
          title={mode === 'new' ? 'New table' : 'Click to load the name into the picker below'}
          className="text-[length:var(--app-text-13)] font-medium text-text"
        >
          {draft.table || '(untitled)'}
        </button>
        <span className="rounded border border-line-strong bg-tint/[0.03] px-2 py-0.5 text-[length:var(--app-text-10)] font-semibold uppercase tracking-wider text-text-muted">
          {mode === 'new' ? 'new' : 'design'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {mode === 'edit' ? (
            <button
              type="button"
              className="btn-ghost h-8 px-3 text-[length:var(--app-text-12)]"
              onClick={handleRename}
              disabled={!draft.table.trim() || draft.table === design?.table}
            >
              Rename
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost h-8 px-3 text-[length:var(--app-text-12)]"
            onClick={discard}
            disabled={busy}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn-soft h-8 px-3 text-[length:var(--app-text-12)]"
            onClick={handleGenerate}
            disabled={busy}
          >
            Generate SQL
          </button>
          <button
            type="button"
            className="btn-primary h-8 px-3.5 text-[length:var(--app-text-12)]"
            onClick={handleApply}
            disabled={busy || (mode === 'new' && !draft.table.trim())}
          >
            {busy ? <Spinner size={13} /> : <Icon name="check-circle" size={13} />}
            Apply
          </button>
        </div>
      </div>

      {notice ? (
        <div className="flex items-start gap-2 border-b border-warning/25 bg-warning/10 px-3 py-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+8px)] text-warning">
          <Icon name="alert-triangle" size={12} className="mt-0.5 shrink-0 text-warning" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-40">
        <div className="grid grid-cols-2 gap-3">
          <Editor label="Table name" value={draft.table} onChange={(value) => update({ table: value })} placeholder="my_table" />
          <Editor label="Schema" value={draft.schema} onChange={(value) => update({ schema: value })} disabled={mode === 'edit'} placeholder="dbo" />
        </div>

        <ColumnEditor
          columns={draft.columns}
          primaryNames={primaryNames}
          updateColumn={updateColumn}
          togglePrimaryColumn={togglePrimaryColumn}
          insertColumnAt={insertColumnAt}
          removeColumn={removeColumn}
          addColumn={addColumn}
          handleDropColumn={handleDropColumn}
          dragIndex={dragIndex}
          setDragIndex={setDragIndex}
          dragOverState={dragOverState}
          setDragOverState={setDragOverState}
        />

        <IndexConstraintEditor
          draft={draft}
          columnOptions={columnOptions}
          tableOptions={tableOptions}
          getReferencedColumnOptions={getReferencedColumnOptions}
          handleReferencedTableChange={handleReferencedTableChange}
          updateUnique={updateUnique}
          removeUnique={removeUnique}
          addUnique={addUnique}
          updateForeign={updateForeign}
          removeForeign={removeForeign}
          addForeign={addForeign}
          updateForeignColumn={updateForeignColumn}
          addForeignColumn={addForeignColumn}
          removeForeignColumn={removeForeignColumn}
          updateIndex={updateIndex}
          removeIndex={removeIndex}
          addIndex={addIndex}
          toggleIndexColumn={toggleIndexColumn}
        />
      </div>

      <RecreateConfirmDialog
        open={recreateDialog.open}
        onCancel={() => setRecreateDialog({ open: false, action: null })}
        onConfirmRecreate={confirmRecreate}
        onConfirmAlter={confirmAlter}
      />
    </div>
  )
}
