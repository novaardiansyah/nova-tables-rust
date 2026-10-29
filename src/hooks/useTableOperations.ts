import { useCallback, useState } from 'react'
import { api } from '../api'
import { generateCreateTable } from '../designSql'
import { quoteIdentifier } from '../resultFormats'

export interface TableItem {
  schema: string
  name: string
  [key: string]: unknown
}

export function qualifiedName(table: { schema: string; name: string }): string {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
}

function constraintName(prefix: string, table: string, columns: string[]): string {
  return `${prefix}_${table}_${columns.join('_')}`.slice(0, 128)
}

function cloneDesign(structure: any, name: string): any {
  const primaryKeyList = Array.isArray(structure?.primaryKey) ? structure.primaryKey : []
  const uniqueKeysList = Array.isArray(structure?.uniqueKeys) ? structure.uniqueKeys : []
  const foreignKeysList = Array.isArray(structure?.foreignKeys) ? structure.foreignKeys : []
  const indexesList = Array.isArray(structure?.indexes) ? structure.indexes : []
  const columnsList = Array.isArray(structure?.columns) ? structure.columns : []

  return {
    schema: structure?.schema || 'dbo',
    table: name,
    columns: columnsList.map((column: any) => ({
      ...column,
      defaultName: null,
      originalName: null,
    })),
    primaryKey: primaryKeyList[0]?.columns ?? [],
    uniqueKeys: uniqueKeysList.map((key: any) => ({
      ...key,
      name: constraintName('UQ', name, key.columns || []),
    })),
    foreignKeys: foreignKeysList.map((key: any) => ({
      ...key,
      name: constraintName('FK', name, (key.columns || []).map((item: any) => item.column)),
    })),
    indexes: indexesList.map((index: any) => ({
      ...index,
      name: constraintName('IX', name, index.columns || []),
    })),
  }
}

export interface TablePromptState {
  kind: 'rename' | 'truncate'
  table: TableItem
}

export interface UseTableOperationsProps {
  activeSession: () => {
    connectionId: string
    activeDatabase?: string | null
  } | null
  openTab: (connectionId: string, title: string, sql: string) => void
  patchSession: (connectionId: string, patch: Record<string, unknown>) => void
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  loadTables: (connectionId: string, database: string) => Promise<unknown>
  loadColumns: (connectionId: string, database: string) => Promise<unknown>
}

export function useTableOperations({
  activeSession,
  openTab,
  patchSession,
  showBanner,
  loadTables,
  loadColumns,
}: UseTableOperationsProps) {
  const [tablePrompt, setTablePrompt] = useState<TablePromptState | null>(null)
  const [dropTarget, setDropTarget] = useState<TableItem | null>(null)
  const [tableBusy, setTableBusy] = useState(false)
  const [pinnedTables, setPinnedTables] = useState<string[]>([])

  const handleRenameTable = useCallback((table: TableItem) => {
    setTablePrompt({ kind: 'rename', table })
  }, [])

  const handleTogglePin = useCallback((table: TableItem) => {
    const key = `${table.schema}.${table.name}`
    setPinnedTables((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }, [])

  const handleCloneTable = useCallback(
    async (table: TableItem) => {
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
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [activeSession, openTab, patchSession, showBanner],
  )

  const handleTruncateTable = useCallback((table: TableItem) => {
    setTablePrompt({ kind: 'truncate', table })
  }, [])

  const handleDropTable = useCallback((table: TableItem) => {
    setDropTarget(table)
  }, [])

  const handleTablePromptConfirm = useCallback(
    async (value: string) => {
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
      } catch (error: any) {
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
    } catch (error: any) {
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
