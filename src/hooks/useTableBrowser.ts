import { useCallback } from 'react'
import { api } from '../api'
import { SessionData, SessionTab, createDesignTab, browseSql, relatedSql, sessionTableFor, NEW_FUNCTION_SQL } from '../utils/sessionHelpers'
import { SidebarTable, SidebarModule } from '../components/Sidebar'
import { buildEditSource } from '../edits'
import { TableDesign } from '../designSql'
import { quoteIdentifier, csvRecords, jsonRecords } from '../resultFormats'
import { ExportDataPayload } from '../components/results/ResultsPanel'

export interface UseTableBrowserProps {
  activeSession: () => SessionData | null
  patchSession: (connectionId: string, patch: Partial<SessionData>) => void
  updateTab: (connectionId: string, tabId: string, patch: Partial<SessionTab> | ((tab: SessionTab) => Partial<SessionTab>)) => void
  openTab: (connectionId: string, title: string, sql: string, editSource?: any | null) => string
  execute: (sql: string, tabId: string) => void
  loadTables: (connectionId: string, database: string) => Promise<void>
  loadColumns: (connectionId: string, database: string) => Promise<void>
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  sqlRef: React.MutableRefObject<string>
  selectionRef: React.MutableRefObject<string>
  setSessions: React.Dispatch<React.SetStateAction<Record<string, SessionData>>>
  tabIdRef: React.MutableRefObject<number>
}

export function useTableBrowser({
  activeSession,
  patchSession,
  updateTab,
  openTab,
  execute,
  loadTables,
  loadColumns,
  showBanner,
  sqlRef,
  selectionRef,
  setSessions,
  tabIdRef,
}: UseTableBrowserProps) {
  const handleSelectTable = useCallback(
    (key: string) => {
      const current = activeSession()
      if (!current) return
      patchSession(current.connectionId, { selectedTable: key })
    },
    [activeSession, patchSession],
  )

  const handleSelectModule = useCallback(
    (key: string) => {
      const current = activeSession()
      if (!current) return
      patchSession(current.connectionId, { selectedModule: key })
    },
    [activeSession, patchSession],
  )

  const loadRelations = useCallback(
    async (tabId: string, table: SidebarTable) => {
      const current = activeSession()
      if (!current || !current.activeDatabase) return
      try {
        const relations = await api.tableRelations(
          current.connectionId,
          current.activeDatabase,
          table.schema,
          table.name,
        )
        updateTab(current.connectionId, tabId, { relations })
      } catch {}
    },
    [activeSession, updateTab],
  )

  const handleOpenRelation = useCallback(
    (relation: any, value: unknown) => {
      const current = activeSession()
      if (!current) return
      const sql = relatedSql(relation, value)
      const table = sessionTableFor(
        current,
        relation.referencedSchema,
        relation.referencedTable,
      )
      const editSource = table ? buildEditSource(table, sql) : null
      const tabId = openTab(current.connectionId, relation.referencedTable, sql, editSource)
      patchSession(current.connectionId, {
        selectedTable: `${relation.referencedSchema}.${relation.referencedTable}`,
      })
      execute(sql, tabId)
      loadRelations(tabId, {
        schema: relation.referencedSchema,
        name: relation.referencedTable,
      })
    },
    [activeSession, execute, loadRelations, openTab, patchSession],
  )

  const handleBrowseTable = useCallback(
    (table: SidebarTable) => {
      const current = activeSession()
      if (!current) return
      const sql = browseSql(table)
      const editSource = buildEditSource(table, sql)
      const tabId = openTab(current.connectionId, table.name, sql, editSource)
      patchSession(current.connectionId, { selectedTable: `${table.schema}.${table.name}` })
      execute(sql, tabId)
      loadRelations(tabId, table)
    },
    [activeSession, execute, loadRelations, openTab, patchSession],
  )

  const handleCopyObjectName = useCallback(
    async (table: SidebarTable) => {
      try {
        await api.copyText(table.name)
        showBanner('success', `Copied object name of ${table.schema}.${table.name}.`)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleScriptTable = useCallback(
    async (table: SidebarTable) => {
      const current = activeSession()
      if (!current) return
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before generating table script.')
        return
      }
      try {
        const structure = await api.tableStructure(
          current.connectionId,
          current.activeDatabase,
          table.schema,
          table.name,
        )
        openTab(current.connectionId, `${table.name}.sql`, `${structure.statement}\n`)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [activeSession, openTab, showBanner],
  )

  const handleOpenModule = useCallback(
    async (module: SidebarModule) => {
      const current = activeSession()
      if (!current) return
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before opening a routine.')
        return
      }
      try {
        const result = await api.moduleDefinition(
          current.connectionId,
          current.activeDatabase,
          module.schema,
          module.name,
        )
        openTab(current.connectionId, module.name, `${result.statement}\n`)
        showBanner(
          'warn',
          `ALTER statement for ${module.schema}.${module.name} is not executed. Review and run it manually.`,
        )
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [activeSession, openTab, showBanner],
  )

  const handleCopyModuleDefinition = useCallback(
    async (module: SidebarModule) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before copying a definition.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before copying a definition.')
        return
      }
      try {
        const result = await api.moduleDefinition(
          current.connectionId,
          current.activeDatabase,
          module.schema,
          module.name,
        )
        await api.copyText(result.definition || '')
        showBanner('success', `Copied definition of ${module.schema}.${module.name}.`)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [activeSession, showBanner],
  )

  const handleNewFunction = useCallback(() => {
    const current = activeSession()
    if (!current) return
    openTab(current.connectionId, 'New function', NEW_FUNCTION_SQL)
  }, [activeSession, openTab])

  const handleCopyText = useCallback(
    async (text: string, message = 'Copied to clipboard.') => {
      if (!text) return false
      try {
        await api.copyText(text)
        showBanner('success', message)
        return true
      } catch (error: any) {
        showBanner('error', error.message)
        return false
      }
    },
    [showBanner],
  )

  const handleCopyQuery = useCallback(async () => {
    const current = activeSession()
    if (!current || !current.activeDatabase) {
      showBanner('warn', 'Open a connection and pick a database before copying a query.')
      return
    }

    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    if (!tab || tab.kind !== 'query') return

    const sql = selectionRef.current || sqlRef.current
    if (!sql.trim()) {
      showBanner('warn', 'Write a query before copying it.')
      return
    }

    await handleCopyText(sql, 'Copied query to clipboard.')
  }, [activeSession, handleCopyText, showBanner, selectionRef, sqlRef])

  const handleExportResult = useCallback(
    async ({ format, filename, columnNames, rows }: ExportDataPayload) => {
      try {
        const isCsv = format === 'csv'
        const content = isCsv ? csvRecords(columnNames, rows) : jsonRecords(columnNames, rows)
        const ext = isCsv ? 'csv' : 'json'
        const filterName = isCsv ? 'CSV Files (*.csv)' : 'JSON Files (*.json)'
        const defaultName = `${filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_') : 'query_results'}.${ext}`

        const response = await api.saveFile({
          defaultPath: defaultName,
          filters: [
            { name: filterName, extensions: [ext] },
            { name: 'All Files', extensions: ['*'] },
          ],
          content,
        })

        if (response.saved && response.filePath) {
          showBanner('success', `Exported to ${response.filePath}.`)
        }
      } catch (error: any) {
        showBanner('error', `Export failed: ${error.message}`)
      }
    },
    [showBanner],
  )

  const openDesignTab = useCallback(
    (connectionId: string, title: string, target: any) => {
      tabIdRef.current += 1
      const id = `tab-${tabIdRef.current}`
      const liveSql = sqlRef.current
      setSessions((prev) => {
        const current = prev[connectionId]
        if (!current) return prev
        return {
          ...prev,
          [connectionId]: {
            ...current,
            tabs: [
              ...current.tabs.map((tab) => (tab.id === current.activeTabId ? { ...tab, sql: liveSql } : tab)),
              createDesignTab(id, title, target),
            ],
            activeTabId: id,
          },
        }
      })
      return id
    },
    [setSessions, sqlRef, tabIdRef],
  )

  const reloadDesign = useCallback(
    async (tabId: string, schema: string, table: string) => {
      const current = activeSession()
      if (!current || !current.activeDatabase) return
      const structure = await api.tableStructure(
        current.connectionId,
        current.activeDatabase,
        schema,
        table,
      )
      const primaryKeyList = Array.isArray(structure?.primaryKey) ? structure.primaryKey : []
      const uniqueKeysList = Array.isArray(structure?.uniqueKeys) ? structure.uniqueKeys : []
      const foreignKeysList = Array.isArray(structure?.foreignKeys) ? structure.foreignKeys : []
      const indexesList = Array.isArray(structure?.indexes) ? structure.indexes : []
      const columnsList = Array.isArray(structure?.columns) ? structure.columns : []

      updateTab(current.connectionId, tabId, {
        loading: false,
        error: null,
        title: `Design ${table}`,
        target: { mode: 'edit', schema, table },
        design: {
          schema: structure?.schema || schema,
          table: structure?.table || table,
          columns: columnsList.map((column: any) => ({ ...column, originalName: column.name })),
          primaryKey: primaryKeyList[0]?.columns ?? [],
          primaryKeyName: primaryKeyList[0]?.name ?? null,
          uniqueKeys: uniqueKeysList,
          foreignKeys: foreignKeysList,
          indexes: indexesList,
          statement: structure?.statement || '',
        },
      })
    },
    [activeSession, updateTab],
  )

  const handleOpenStructure = useCallback(
    async (table: SidebarTable) => {
      if (!table) return
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before opening a structure.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before opening a structure.')
        return
      }

      const schema = table.schema || 'dbo'
      const tableName = table.name || (table as any).table || ''
      if (!tableName) return

      const tabId = openDesignTab(current.connectionId, `Design ${tableName}`, {
        mode: 'edit',
        schema,
        table: tableName,
      })

      try {
        await reloadDesign(tabId, schema, tableName)
      } catch (error: any) {
        updateTab(current.connectionId, tabId, { loading: false, error: error.message })
      }
    },
    [activeSession, openDesignTab, reloadDesign, showBanner, updateTab],
  )

  const handleNewTable = useCallback(
    (table: SidebarTable) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before creating a table.')
        return
      }

      const tabId = openDesignTab(current.connectionId, 'New table', {
        mode: 'new',
        schema: table?.schema || 'dbo',
        table: '',
      })

      updateTab(current.connectionId, tabId, {
        loading: false,
        design: {
          schema: table?.schema || 'dbo',
          table: '',
          columns: [
            {
              name: 'id',
              typeName: 'bigint',
              maxLength: 8,
              precision: 19,
              scale: 0,
              isNullable: false,
              isIdentity: true,
              isComputed: false,
              computedDefinition: null,
              seedValue: 1,
              incrementValue: 1,
              collation: null,
              databaseCollation: null,
              defaultName: null,
              defaultDefinition: null,
              originalName: null,
            },
          ],
          primaryKey: ['id'],
          primaryKeyName: null,
          uniqueKeys: [],
          foreignKeys: [],
          indexes: [],
          statement: '',
        },
      })
    },
    [activeSession, openDesignTab, showBanner, updateTab],
  )

  const handleDesignGenerate = useCallback(
    (sql: string) => {
      const current = activeSession()
      if (!current) return
      openTab(current.connectionId, 'Generated SQL', sql)
    },
    [activeSession, openTab],
  )

  const handleDesignApply = useCallback(
    async (tabId: string, sql: string, draft: TableDesign) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before applying changes.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before applying changes.')
        return
      }

      updateTab(current.connectionId, tabId, { busy: true })
      try {
        await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql,
        })
        showBanner('success', 'Structure applied.')
        await loadTables(current.connectionId, current.activeDatabase)
        await loadColumns(current.connectionId, current.activeDatabase)
        await reloadDesign(tabId, draft.schema, draft.table)
      } catch (error: any) {
        showBanner('error', error.message)
      } finally {
        updateTab(current.connectionId, tabId, { busy: false })
      }
    },
    [activeSession, loadTables, loadColumns, reloadDesign, showBanner, updateTab],
  )

  const handleDesignRename = useCallback(
    async (tabId: string, draft: TableDesign, nextName: string) => {
      const current = activeSession()
      if (!current || !current.activeDatabase) return
      if (!nextName || nextName === draft.table) return

      updateTab(current.connectionId, tabId, { busy: true })
      try {
        await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql: `EXEC sp_rename N'${quoteIdentifier(draft.schema)}.${quoteIdentifier(draft.table)}', N'${nextName.replace(/'/g, "''")}';`,
        })
        showBanner('success', `Renamed table to ${nextName}.`)
        await loadTables(current.connectionId, current.activeDatabase)
        await loadColumns(current.connectionId, current.activeDatabase)
        await reloadDesign(tabId, draft.schema, nextName)
      } catch (error: any) {
        showBanner('error', error.message)
      } finally {
        updateTab(current.connectionId, tabId, { busy: false })
      }
    },
    [activeSession, loadTables, loadColumns, reloadDesign, showBanner, updateTab],
  )

  return {
    handleSelectTable,
    handleSelectModule,
    loadRelations,
    handleOpenRelation,
    handleBrowseTable,
    handleCopyObjectName,
    handleScriptTable,
    handleOpenModule,
    handleCopyModuleDefinition,
    handleNewFunction,
    handleCopyText,
    handleCopyQuery,
    handleExportResult,
    openDesignTab,
    reloadDesign,
    handleOpenStructure,
    handleNewTable,
    handleDesignGenerate,
    handleDesignApply,
    handleDesignRename,
  }
}
