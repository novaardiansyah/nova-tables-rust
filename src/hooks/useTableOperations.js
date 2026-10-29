import { useCallback, useState } from 'react'
import { api } from '../api.js'
import { generateCreateTable } from '../designSql.js'
import { quoteIdentifier } from '../resultFormats.js'

export function qualifiedName(table) {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
}

function constraintName(prefix, table, columns) {
  return `${prefix}_${table}_${columns.join('_')}`.slice(0, 128)
}

function cloneDesign(structure, name) {
  return {
    schema: structure.schema,
    table: name,
    columns: structure.columns.map((column) => ({
      ...column,
      defaultName: null,
      originalName: null,
    })),
    primaryKey: structure.primaryKey[0]?.columns ?? [],
    uniqueKeys: structure.uniqueKeys.map((key) => ({
      ...key,
      name: constraintName('UQ', name, key.columns),
    })),
    foreignKeys: structure.foreignKeys.map((key) => ({
      ...key,
      name: constraintName('FK', name, key.columns.map((item) => item.column)),
    })),
    indexes: structure.indexes.map((index) => ({
      ...index,
      name: constraintName('IX', name, index.columns),
    })),
  }
}

export function useTableOperations({
  activeSession,
  openTab,
  patchSession,
  showBanner,
  loadTables,
  loadColumns,
}) {
  const [tablePrompt, setTablePrompt] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [tableBusy, setTableBusy] = useState(false)
  const [pinnedTables, setPinnedTables] = useState([])

  const handleRenameTable = useCallback((table) => {
    setTablePrompt({ kind: 'rename', table })
  }, [])

  const handleTogglePin = useCallback((table) => {
    const key = `${table.schema}.${table.name}`
    setPinnedTables((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }, [])

  const handleCloneTable = useCallback(
    async (table) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before cloning a table.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before cloning a table.')
        return
      }

      try {
        const structure = await api.tableStructure(
          current.connectionId,
          current.activeDatabase,
          table.schema,
          table.name,
        )
        const copyName = `${table.name}_copy`
        const sql = generateCreateTable(cloneDesign(structure, copyName))
        openTab(current.connectionId, copyName, sql)
        patchSession(current.connectionId, { selectedTable: `${structure.schema}.${copyName}` })
      } catch (error) {
        showBanner('error', error.message)
      }
    },
    [activeSession, openTab, patchSession, showBanner],
  )

  const handleTruncateTable = useCallback((table) => {
    setTablePrompt({ kind: 'truncate', table })
  }, [])

  const handleDropTable = useCallback((table) => {
    setDropTarget(table)
  }, [])

  const handleTablePromptConfirm = useCallback(
    async (value) => {
      const current = activeSession()
      const prompt = tablePrompt
      if (!current || !prompt || !current.activeDatabase) return

      const table = prompt.table
      if (prompt.kind === 'truncate' && value !== table.name) {
        showBanner('warn', `Type “${table.name}” to confirm the truncate.`)
        return
      }

      const statement =
        prompt.kind === 'rename'
          ? `EXEC sp_rename N'${qualifiedName(table)}', N'${value.replace(/'/g, "''")}';`
          : `TRUNCATE TABLE ${qualifiedName(table)};`

      setTableBusy(true)
      try {
        await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql: statement,
        })
        const nextName = prompt.kind === 'rename' ? value : table.name
        showBanner(
          'success',
          prompt.kind === 'rename' ? `Renamed to ${value}.` : `Truncated ${table.name}.`,
        )
        patchSession(current.connectionId, { selectedTable: `${table.schema}.${nextName}` })
        if (prompt.kind === 'rename') {
          const previousKey = `${table.schema}.${table.name}`
          setPinnedTables((prev) =>
            prev.map((item) => (item === previousKey ? `${table.schema}.${value}` : item)),
          )
        }
        setTablePrompt(null)
        await loadTables(current.connectionId, current.activeDatabase)
        await loadColumns(current.connectionId, current.activeDatabase)
      } catch (error) {
        showBanner('error', error.message)
      } finally {
        setTableBusy(false)
      }
    },
    [activeSession, loadTables, loadColumns, patchSession, showBanner, tablePrompt],
  )

  const handleDropConfirm = useCallback(async () => {
    const current = activeSession()
    if (!current || !dropTarget || !current.activeDatabase) return

    setTableBusy(true)
    try {
      await api.runQuery({
        connectionId: current.connectionId,
        database: current.activeDatabase,
        sql: `DROP TABLE ${qualifiedName(dropTarget)};`,
      })
      showBanner('success', `Dropped ${dropTarget.schema}.${dropTarget.name}.`)
      patchSession(current.connectionId, { selectedTable: null })
      setPinnedTables((prev) =>
        prev.filter((item) => item !== `${dropTarget.schema}.${dropTarget.name}`),
      )
      setDropTarget(null)
      await loadTables(current.connectionId, current.activeDatabase)
      await loadColumns(current.connectionId, current.activeDatabase)
    } catch (error) {
      showBanner('error', error.message)
    } finally {
      setTableBusy(false)
    }
  }, [activeSession, dropTarget, loadTables, loadColumns, patchSession, showBanner])

  return {
    tablePrompt,
    setTablePrompt,
    dropTarget,
    setDropTarget,
    tableBusy,
    pinnedTables,
    handleRenameTable,
    handleTogglePin,
    handleCloneTable,
    handleTruncateTable,
    handleDropTable,
    handleTablePromptConfirm,
    handleDropConfirm,
  }
}
