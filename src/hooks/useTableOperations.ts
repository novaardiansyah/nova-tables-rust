import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import { generateCreateTable } from '@/designSql'
import { quoteIdentifier } from '@/resultFormats'

export interface TableItem {
  schema: string
  name: string
  [key: string]: unknown
}

export function qualifiedName(table: { schema: string; name: string }, driverType?: string | null): string {
  return `${quoteIdentifier(table.schema, driverType)}.${quoteIdentifier(table.name, driverType)}`
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
    connection?: any
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
  const [pinnedByConnection, setPinnedByConnection] = useState<Record<string, string[]>>({})

  const currentSession = activeSession()
  const activeConnectionId = currentSession?.connectionId ?? null

  useEffect(() => {
    if (!activeConnectionId) return
    let cancelled = false

    const initialPinned = Array.isArray(currentSession?.connection?.pinnedTables)
      ? (currentSession.connection.pinnedTables as string[])
      : null

    if (initialPinned && !pinnedByConnection[activeConnectionId]) {
      setPinnedByConnection((prev) => ({ ...prev, [activeConnectionId]: initialPinned }))
    }

    void api.getPinnedTables(activeConnectionId).then((tables) => {
      if (!cancelled && Array.isArray(tables)) {
        setPinnedByConnection((prev) => ({ ...prev, [activeConnectionId]: tables }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeConnectionId])

  const pinnedTables = activeConnectionId ? (pinnedByConnection[activeConnectionId] ?? []) : []

  const handleRenameTable = useCallback((table: TableItem) => {
    setTablePrompt({ kind: 'rename', table })
  }, [])

  const handleTogglePin = useCallback(
    async (table: TableItem) => {
      const current = activeSession()
      if (!current?.connectionId) return
      const connectionId = current.connectionId
      const key = `${table.schema}.${table.name}`
      const currentList = pinnedByConnection[connectionId] ?? []
      const nextList = currentList.includes(key)
        ? currentList.filter((item) => item !== key)
        : [...currentList, key]

      setPinnedByConnection((prev) => ({ ...prev, [connectionId]: nextList }))

      try {
        await api.savePinnedTables(connectionId, nextList)
      } catch (error: any) {
        setPinnedByConnection((prev) => ({ ...prev, [connectionId]: currentList }))
        showBanner('error', error?.message || 'Failed to save pinned status')
      }
    },
    [activeSession, pinnedByConnection, showBanner],
  )

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
        if (!structure) return
        const copyName = `${table.name}_copy`
        const sql = generateCreateTable(cloneDesign(structure, copyName), current?.connection?.driverType ?? null)
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

      const driverType = current.connection?.driverType ?? null
      const qName = qualifiedName(table, driverType)
      const statement =
        prompt.kind === 'rename'
          ? (driverType === 'mysql'
              ? `RENAME TABLE ${qName} TO ${quoteIdentifier(table.schema, driverType)}.${quoteIdentifier(value, driverType)};`
              : `EXEC sp_rename N'${qName}', N'${value.replace(/'/g, "''")}';`)
          : `TRUNCATE TABLE ${qName};`

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
          const nextKey = `${table.schema}.${value}`
          const currentList = pinnedByConnection[current.connectionId] ?? []
          if (currentList.includes(previousKey)) {
            const nextList = currentList.map((item) => (item === previousKey ? nextKey : item))
            setPinnedByConnection((prev) => ({ ...prev, [current.connectionId]: nextList }))
            void api.savePinnedTables(current.connectionId, nextList).catch(() => {})
          }
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
    [activeSession, loadTables, loadColumns, patchSession, pinnedByConnection, showBanner, tablePrompt],
  )

  const handleDropConfirm = useCallback(async () => {
    const current = activeSession()
    if (!current || !dropTarget || !current.activeDatabase) return

    setTableBusy(true)
    try {
      await api.runQuery({
        connectionId: current.connectionId,
        database: current.activeDatabase,
        sql: `DROP TABLE ${qualifiedName(dropTarget, current.connection?.driverType ?? null)};`,
      })
      showBanner('success', `Dropped ${dropTarget.schema}.${dropTarget.name}.`)
      patchSession(current.connectionId, { selectedTable: null })
      const dropKey = `${dropTarget.schema}.${dropTarget.name}`
      const currentList = pinnedByConnection[current.connectionId] ?? []
      if (currentList.includes(dropKey)) {
        const nextList = currentList.filter((item) => item !== dropKey)
        setPinnedByConnection((prev) => ({ ...prev, [current.connectionId]: nextList }))
        void api.savePinnedTables(current.connectionId, nextList).catch(() => {})
      }
      setDropTarget(null)
      await loadTables(current.connectionId, current.activeDatabase)
      await loadColumns(current.connectionId, current.activeDatabase)
    } catch (error: any) {
      showBanner('error', error.message)
    } finally {
      setTableBusy(false)
    }
  }, [activeSession, dropTarget, loadTables, loadColumns, patchSession, pinnedByConnection, showBanner])

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
