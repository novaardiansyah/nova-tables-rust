import { useCallback } from 'react'
import { api } from '@/api'
import { SessionData, SessionTab, createDesignTab, createErdTab, browseSql, relatedSql, sessionTableFor, NEW_FUNCTION_SQL, newFunctionSql } from '@/utils/sessionHelpers'
import { extractTablesFromSql } from '@/utils/sqlTableExtractor'
import { SidebarTable, SidebarModule } from '@/components/Sidebar'
import { buildEditSource } from '@/edits'
import { TableDesign } from '@/designSql'
import { quoteIdentifier, csvRecords, jsonRecords } from '@/resultFormats'
import { ExportDataPayload } from '@/components/results/ResultsPanel'

export interface UseTableBrowserProps {
  activeSession: () => SessionData | null
  patchSession: (connectionId: string, patch: Partial<SessionData>) => void
  updateTab: (connectionId: string, tabId: string, patch: Partial<SessionTab> | ((tab: SessionTab) => Partial<SessionTab>)) => void
  openTab: (connectionId: string, title: string, sql: string, editSource?: any | null) => string
  execute: (sql: string, tabId: string, browseTable?: { schema: string; name: string; primaryKey?: string[] } | null) => void
  loadTables: (connectionId: string, database: string) => Promise<void>
  loadColumns: (connectionId: string, database: string) => Promise<void>
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  sqlRef: React.MutableRefObject<string>
  selectionRef: React.MutableRefObject<string>
  setSessions: React.Dispatch<React.SetStateAction<Record<string, SessionData>>>
  tabIdRef: React.MutableRefObject<number>
  onNewRow: (tabId?: string) => void
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
  onNewRow,
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
      const driverType = current.connection?.driverType
      const sql = relatedSql(relation, value, driverType)
      const table = sessionTableFor(
        current,
        relation.referencedSchema,
        relation.referencedTable,
      )
      const editSource = table ? buildEditSource(table, sql, driverType) : null
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
      const driverType = current.connection?.driverType
      const sql = browseSql(table, driverType)
      const editSource = buildEditSource(table, sql, driverType)
      const tabId = openTab(current.connectionId, table.name, sql, editSource)
      patchSession(current.connectionId, { selectedTable: `${table.schema}.${table.name}` })
      execute(sql, tabId, table)
      loadRelations(tabId, table)
    },
    [activeSession, execute, loadRelations, openTab, patchSession],
  )

  const handleNewRecord = useCallback(
    async (table: SidebarTable) => {
      const current = activeSession()
      if (!current) return
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before creating a new record.')
        return
      }
      const primaryKey = table.primaryKey
      if (!Array.isArray(primaryKey) || primaryKey.length === 0) {
        showBanner('warn', `${table.schema}.${table.name} has no primary key, so new records cannot be edited here.`)
        return
      }
      try {
        const summaries = await api.listColumns(current.connectionId, current.activeDatabase)
        const summary = summaries.find(
          (item) => item.schema === table.schema && item.name === table.name,
        )
        if (!summary || summary.columns.length === 0) {
          showBanner('warn', `No columns found for ${table.schema}.${table.name}.`)
          return
        }
        const driverType = current.connection?.driverType ?? null
        const sql = browseSql(table, driverType)
        const editSource = buildEditSource(table, sql, driverType)
        const tabId = openTab(current.connectionId, table.name, sql, editSource)
        patchSession(current.connectionId, { selectedTable: `${table.schema}.${table.name}` })
        updateTab(current.connectionId, tabId, {
          state: {
            status: 'success',
            result: {
              ok: true,
              resultSets: [
                {
                  columns: summary.columns.map((name) => ({ name })),
                  rows: [],
                  rowCount: 0,
                },
              ],
              messages: [],
              rowsAffected: [],
              elapsedMs: 0,
            },
            error: null,
          },
          activeSet: 0,
          relations: [],
          edits: {},
          deletingRows: [],
          creatingRows: [],
          lastExecutedSql: sql,
        })
        onNewRow(tabId)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [activeSession, onNewRow, openTab, patchSession, showBanner, updateTab],
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
        if (structure) {
          openTab(current.connectionId, `${table.name}.sql`, `${structure.statement}\n`)
        }
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

  const handleNewFunction = useCallback((driverTypeParam?: string) => {
    const current = activeSession()
    if (!current) return
    const driverType = driverTypeParam || current.connection?.driverType
    openTab(current.connectionId, 'New Function', newFunctionSql(driverType))
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

  const openErdTab = useCallback(
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
              createErdTab(id, title, target),
            ],
            activeTabId: id,
          },
        }
      })
      return id
    },
    [setSessions, sqlRef, tabIdRef],
  )

  const handleGenerateErd = useCallback(
    (table?: SidebarTable | null) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection first.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database first.')
        return
      }

      if (table) {
        const targetTable = table.schema ? `${table.schema}.${table.name}` : table.name
        openErdTab(current.connectionId, `ERD: ${table.name}`, {
          tables: [targetTable],
          depth: 1,
          includeRelated: true,
        })
      } else {
        const sql = sqlRef.current || ''
        const extracted = extractTablesFromSql(sql)
        const tables = extracted.map((t) => (t.schema ? `${t.schema}.${t.name}` : t.name))
        if (tables.length === 0) {
          showBanner('warn', 'No tables found in the active query to generate ERD.')
          return
        }
        openErdTab(current.connectionId, 'ERD: Query', {
          tables,
          depth: 1,
          includeRelated: true,
          sourceSql: sql,
        })
      }
    },
    [activeSession, openErdTab, showBanner, sqlRef],
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
      const referencingForeignKeysList = Array.isArray(structure?.referencingForeignKeys)
        ? structure.referencingForeignKeys
        : []
      const indexesList = Array.isArray(structure?.indexes) ? structure.indexes : []
      const columnsList = Array.isArray(structure?.columns) ? structure.columns : []

      updateTab(current.connectionId, tabId, {
        loading: false,
        error: null,
        title: `Design ${table}`,
        state: { status: 'success', result: null, error: null },
        target: { mode: 'edit', schema, table },
        design: {
          schema: structure?.schema || schema,
          table: structure?.table || table,
          columns: columnsList.map((column: any) => ({ ...column, originalName: column.name })),
          primaryKey: primaryKeyList[0]?.columns ?? [],
          primaryKeyName: primaryKeyList[0]?.name ?? null,
          uniqueKeys: uniqueKeysList,
          foreignKeys: foreignKeysList,
          referencingForeignKeys: referencingForeignKeysList,
          indexes: indexesList,
          statement: structure?.statement || '',
        },
        designDraft: null,
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
        updateTab(current.connectionId, tabId, {
          loading: false,
          error: error.message,
          state: { status: 'error', result: null, error: error.message },
        })
      }
    },
    [activeSession, openDesignTab, reloadDesign, showBanner, updateTab],
  )

  const handleNewTable = useCallback(
    (table?: SidebarTable) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before creating a table.')
        return
      }

      const defaultSchema =
        current.connection?.driverType === 'mysql'
          ? current.activeDatabase || ''
          : 'dbo'
      const schema = table?.schema || defaultSchema

      const tabId = openDesignTab(current.connectionId, 'New Table', {
        mode: 'new',
        schema,
        table: '',
      })

      updateTab(current.connectionId, tabId, {
        loading: false,
        state: { status: 'success', result: null, error: null },
        design: {
          schema,
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
    (sql: string, draft: TableDesign) => {
      const current = activeSession()
      if (!current) return
      // Persist the current draft into the design tab so switching back does not reset the form.
      updateTab(current.connectionId, current.activeTabId, { designDraft: draft })
      openTab(current.connectionId, 'Generated SQL', sql)
    },
    [activeSession, openTab, updateTab],
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
        const driverType = current.connection?.driverType ?? null
        // MySQL driver: ALTER TABLE ... RENAME TO is required for renaming tables in MySQL
        // SQL Server driver: sp_rename stored procedure is required for renaming tables in SQL Server
        const renameSql =
          driverType === 'mysql'
            ? `ALTER TABLE ${quoteIdentifier(draft.schema || 'dbo', driverType)}.${quoteIdentifier(draft.table, driverType)} RENAME TO ${quoteIdentifier(nextName, driverType)};`
            : `EXEC sp_rename N'${quoteIdentifier(draft.schema || 'dbo', driverType)}.${quoteIdentifier(draft.table, driverType)}', N'${nextName.replace(/'/g, "''")}';`
        await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql: renameSql,
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
    handleNewRecord,
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
    handleGenerateErd,
    handleNewTable,
    handleDesignGenerate,
    handleDesignApply,
    handleDesignRename,
  }
}
