import { useCallback, useRef, useState } from 'react'
import { api } from '@/api'
import { SessionTab, SessionData } from '@/utils/sessionHelpers'
import { executionGuard, ExecutionModeId } from '@/queryModes'
import { parseExecutionPlan, parseShowPlanXml } from '@/planParser'
import { FilterCondition, buildFilterWhere, buildFilteredSql } from '@/filters'
import {
  buildDeleteStatementsForRows,
  buildEditSource,
  buildQueryEditSource,
  buildUpdateStatements,
  editAllows,
  editSqlHeader,
  editTableFromSql,
} from '@/edits'
import { isDesignDirty, getDesignSql } from '@/designSql'
import { csvRecords, jsonRecords } from '@/resultFormats'

export interface UseQueryExecutionProps {
  activeSession: () => SessionData | null
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  updateTab: (connectionId: string, tabId: string, patch: Partial<SessionTab> | ((tab: SessionTab) => Partial<SessionTab>)) => void
  sqlRef: React.MutableRefObject<string>
  selectionRef: React.MutableRefObject<string>
  settings: any
  setSettings: React.Dispatch<React.SetStateAction<any>>
  openTab: (connectionId: string, title: string, sql: string, editSource?: any | null, savedQuery?: any | null) => string
  patchSession: (connectionId: string, patch: Partial<SessionData>) => void
  seedEditor: (sql: string, focus?: boolean) => void
  handleCloseTab: (tabId: string, force?: boolean) => void
  reloadDesign?: (tabId: string, schema: string, table: string) => Promise<any>
  loadTables?: (connectionId: string, database: string) => Promise<any>
  loadColumns?: (connectionId: string, database: string) => Promise<any>
}

export function useQueryExecution({
  activeSession,
  showBanner,
  updateTab,
  sqlRef,
  selectionRef,
  settings,
  setSettings,
  openTab,
  patchSession,
  seedEditor,
  handleCloseTab,
  reloadDesign,
  loadTables,
  loadColumns,
}: UseQueryExecutionProps) {
  const [runGuard, setRunGuard] = useState<{ kind: string; sql: string; tabId: string } | null>(null)
  const [editConfirmOpen, setEditConfirmOpen] = useState(false)
  const [editConfirmTarget, setEditConfirmTarget] = useState<{ type: string; tabId?: string; sql?: string } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ type: string; tabId?: string; sql?: string } | null>(null)

  const editSourceRequestsRef = useRef<Record<string, number>>({})

  const activeQueryTab = useCallback(() => {
    const current = activeSession()
    if (!current) return null
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    return tab ? { connectionId: current.connectionId, tab } : null
  }, [activeSession])

  const tabResultSet = (tab: SessionTab) => {
    const resultSets = tab.state?.result?.resultSets ?? []
    return resultSets[tab.activeSet ?? 0] ?? null
  }

  const describeEditSource = useCallback(async (connectionId: string, database: string, sql: string, tables: any[], driverType?: string | null) => {
    try {
      const columns = await api.describeResult(connectionId, database, sql)
      return buildQueryEditSource({ sql, columns, tables, driverType })
    } catch {
      return null
    }
  }, [])

  const cancelRequestedRef = useRef(false)

  const handleCancel = useCallback(() => {
    cancelRequestedRef.current = true
    const current = activeSession()
    if (current) {
      updateTab(current.connectionId, current.activeTabId, {
        state: {
          status: 'error',
          result: null,
          error: { message: 'Query was cancelled by user' },
        },
      })
    }
  }, [activeSession, updateTab])

  const execute = useCallback(
    async (sql: string, tabId: string) => {
      cancelRequestedRef.current = false
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before running a query.')
        return
      }
      if (!current.activeDatabase) {
        showBanner('warn', 'Select a database before running a query.')
        return
      }

      const tab = current.tabs.find((item) => item.id === tabId)
      const patch: Partial<SessionTab> = {
        state: { status: 'running', result: null, error: null },
        activeSet: 0,
        edits: {},
        deletingRows: [],
        lastExecutedSql: sql,
      }
      const source = tab?.editSource && tab.editSource.sql === sql ? tab.editSource : null
      const inferredTable = !source ? editTableFromSql(sql, current.tables?.tables ?? []) : null
      if (tab && !source) {
        patch.editSource = inferredTable
          ? buildEditSource(inferredTable, sql, current.connection?.driverType)
          : null
      }
      if (!source && !inferredTable) {
        patch.relations = []
      }
      const requestId = (editSourceRequestsRef.current[tabId] ?? 0) + 1
      editSourceRequestsRef.current[tabId] = requestId

      updateTab(current.connectionId, tabId, patch)
      try {
        const result = await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql,
          recordHistory: true,
        })
        if (cancelRequestedRef.current) return
        let resultSets = result.resultSets
        const tabNow = current.tabs.find((item) => item.id === tabId)
        if (resultSets.length === 0 && tabNow?.filterConditions && tabNow?.cachedColumns?.length) {
          resultSets = [
            {
              columns: tabNow.cachedColumns,
              rows: [],
              rowCount: 0,
            },
          ]
        }
        const firstFilled = resultSets.findIndex((set) => set.rowCount > 0)
        updateTab(current.connectionId, tabId, {
          state: { status: 'success', result: { ...result, resultSets }, error: null },
          activeSet: firstFilled === -1 ? 0 : firstFilled,
        })
        if (inferredTable) {
          const relations = await api
            .tableRelations(
              current.connectionId,
              current.activeDatabase,
              inferredTable.schema,
              inferredTable.name,
            )
            .catch(() => [])
          if (editSourceRequestsRef.current[tabId] === requestId) {
            updateTab(current.connectionId, tabId, { relations })
          }
        }
        if (
          tab &&
          !source &&
          !patch.editSource &&
          result.resultSets.length === 1 &&
          (result.resultSets[0]?.columns?.length ?? 0) > 0
        ) {
          const editSource = await describeEditSource(
            current.connectionId,
            current.activeDatabase,
            sql,
            current.tables?.tables ?? [],
            current.connection?.driverType,
          )
          if (editSource && editSourceRequestsRef.current[tabId] === requestId) {
            updateTab(current.connectionId, tabId, (latest) =>
              latest.editSource ? {} : { editSource },
            )
          }
        }
      } catch (error: any) {
        if (cancelRequestedRef.current) return
        updateTab(current.connectionId, tabId, {
          state: {
            status: 'error',
            result: null,
            error: {
              message: error.message,
              code: error.code,
              number: error.number,
              lineNumber: error.lineNumber,
              severity: error.severity,
              state: error.state,
            },
          },
        })
      }
    },
    [activeSession, describeEditSource, showBanner, updateTab],
  )

  const runWithGuard = useCallback(
    (sql: string, tabId: string) => {
      const guard = executionGuard(settings.queryExecutionMode, sql)
      if (guard) {
        setRunGuard({ kind: guard.kind, sql, tabId })
        return
      }
      execute(sql, tabId)
    },
    [execute, settings.queryExecutionMode],
  )

  const handleRun = useCallback(() => {
    const current = activeSession()
    if (!current) {
      showBanner('warn', 'Open a connection before running a query.')
      return
    }
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    const sql = selectionRef.current || sqlRef.current
    if (tab && Object.keys(tab.edits || {}).length > 0) {
      setEditConfirmTarget({ type: 'run', sql })
      setEditConfirmOpen(true)
      return
    }
    if (tab && tab.deletingRows && tab.deletingRows.length > 0) {
      setDeleteConfirmTarget({ type: 'run', sql })
      setDeleteConfirmOpen(true)
      return
    }
    runWithGuard(sql, current.activeTabId)
  }, [activeSession, runWithGuard, showBanner, selectionRef, sqlRef])

  const handleReRun = useCallback(() => {
    const current = activeSession()
    if (!current) {
      showBanner('warn', 'Open a connection before running a query.')
      return
    }
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    if (!tab) return
    if (tab.kind === 'design') {
      const driverType = current.connection?.driverType ?? null
      if (isDesignDirty(tab, driverType)) {
        setEditConfirmTarget({ type: 'reload', tabId: tab.id })
        setEditConfirmOpen(true)
        return
      }
      const schema = tab.design?.schema || tab.target?.schema || 'dbo'
      const table = tab.design?.table || tab.target?.table || ''
      if (table && reloadDesign) {
        reloadDesign(tab.id, schema, table)
      }
      return
    }
    if (tab.kind !== 'query') return
    const sql = tab.lastExecutedSql
    if (Object.keys(tab.edits || {}).length > 0) {
      setEditConfirmTarget({ type: 'run', sql: sql || undefined })
      setEditConfirmOpen(true)
      return
    }
    if (tab && tab.deletingRows && tab.deletingRows.length > 0) {
      setDeleteConfirmTarget({ type: 'run', sql: sql || undefined })
      setDeleteConfirmOpen(true)
      return
    }
    if (!sql || !sql.trim()) {
      showBanner('warn', 'No query has been run on this tab yet.')
      return
    }
    runWithGuard(sql, current.activeTabId)
  }, [activeSession, runWithGuard, showBanner, reloadDesign])

  const handleEstimatedPlan = useCallback(async () => {
    const current = activeSession()
    if (!current) {
      showBanner('warn', 'Open a connection before generating an execution plan.')
      return
    }
    // MySQL driver: Estimated execution plan is restricted to SQL Server connections only per user requirement.
    if (current.connection?.driverType === 'mysql') {
      showBanner('warn', 'Estimated execution plan is only available for SQL Server connections.')
      return
    }
    const target = activeQueryTab()
    if (!target) return
    const sql = (selectionRef.current || sqlRef.current || '').trim()
    if (!sql) {
      showBanner('warn', 'Nothing to analyze — write or select a query first.')
      return
    }

    updateTab(current.connectionId, target.tab.id, { busy: true })
    try {
      const res = await api.getExecutionPlan({
        connectionId: current.connectionId,
        database: current.activeDatabase || 'master',
        sql,
      })
      const rawPlan = typeof res?.plan === 'string' ? res.plan.trim() : ''
      if (!rawPlan) {
        throw new Error('No execution plan returned by the server.')
      }
      const parsed = parseExecutionPlan(rawPlan, current.connection?.driverType)
      if (!parsed) {
        throw new Error('Failed to parse the execution plan returned by the server.')
      }
      updateTab(current.connectionId, target.tab.id, { executionPlan: parsed, busy: false })
      showBanner('success', 'Generated estimated execution plan.')
    } catch (error: any) {
      updateTab(current.connectionId, target.tab.id, { busy: false })
      showBanner('error', error?.message || 'Failed to generate execution plan.')
    }
  }, [activeQueryTab, activeSession, showBanner, updateTab, selectionRef, sqlRef])

  const handleGuardConfirm = useCallback(() => {
    const pending = runGuard
    setRunGuard(null)
    if (!pending) return
    execute(pending.sql, pending.tabId)
  }, [execute, runGuard])

  const handleChangeExecutionMode = useCallback(
    async (modeId: ExecutionModeId) => {
      const next = { ...settings, queryExecutionMode: modeId }
      setSettings(next)
      try {
        const saved = await api.saveSettings(next)
        setSettings(saved)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [settings, setSettings, showBanner],
  )

  const setCellEdit = useCallback(
    (connectionId: string, tab: SessionTab, rowIndex: number, column: string, value: unknown, original: unknown) => {
      const sameValue = (value as any)?.special ? (value as any).special === (original as any)?.special : value === original
      if (sameValue) {
        updateTab(connectionId, tab.id, (current) => {
          const edits = { ...(current.edits || {}) }
          delete edits[`${rowIndex}:${column}`]
          return { edits }
        })
        return
      }
      updateTab(connectionId, tab.id, (current) => ({
        edits: {
          ...(current.edits || {}),
          [`${rowIndex}:${column}`]: { value, original },
        },
      }))
    },
    [updateTab],
  )

  const handleCellChange = useCallback(
    (rowIndex: number, column: string, value: unknown, original: unknown) => {
      const target = activeQueryTab()
      if (!target) return
      const { connectionId, tab } = target
      if (!editAllows(tab.editSource, column)) return
      setCellEdit(connectionId, tab, rowIndex, column, value, original)
    },
    [activeQueryTab, setCellEdit],
  )

  const handleSetCellValue = useCallback(
    (rowIndex: number, column: string, value: unknown) => {
      const target = activeQueryTab()
      if (!target) return
      const { connectionId, tab } = target
      const resultSet = tabResultSet(tab)
      if (!resultSet || !editAllows(tab.editSource, column)) return
      const columnIndex = resultSet.columns.findIndex((item: any) => item.name === column)
      if (columnIndex === -1) return
      const row = resultSet.rows[rowIndex]
      if (!row) return
      setCellEdit(connectionId, tab, rowIndex, column, value, row[columnIndex])
    },
    [activeQueryTab, setCellEdit, tabResultSet],
  )

  const handleDeleteRows = useCallback(
    (startOrIndexes: number[] | number, maybeEnd?: number) => {
      const target = activeQueryTab()
      if (!target) return
      const { connectionId, tab } = target
      const resultSet = tabResultSet(tab)
      if (
        !tab.editSource ||
        tab.editSource.tables.length !== 1 ||
        !resultSet
      ) {
        return
      }
      let rowIndexes: number[] = []
      if (Array.isArray(startOrIndexes)) {
        rowIndexes = startOrIndexes
      } else if (typeof startOrIndexes === 'number') {
        const start = startOrIndexes
        const end = typeof maybeEnd === 'number' ? maybeEnd : start
        for (let i = start; i <= end; i += 1) {
          rowIndexes.push(i)
        }
      }
      if (rowIndexes.length === 0) return
      const existing = tab.deletingRows || []
      const merged = Array.from(new Set([...existing, ...rowIndexes]))
      updateTab(connectionId, tab.id, {
        deletingRows: merged,
      })
    },
    [activeQueryTab, updateTab, tabResultSet],
  )

  const handleRunUpdate = useCallback(
    async (sql: string) => {
      if (!sql || !sql.trim()) return false
      const current = activeSession()
      if (!current || !current.activeDatabase) return false
      try {
        await api.runQuery({
          connectionId: current.connectionId,
          database: current.activeDatabase,
          sql,
          recordHistory: true,
        })
        const tab = current.tabs.find((item) => item.id === current.activeTabId)
        if (tab) updateTab(current.connectionId, tab.id, { edits: {}, deletingRows: [] })
        showBanner('success', 'Changes applied to the database.')
        return true
      } catch (error: any) {
        showBanner('error', error.message)
        return false
      }
    },
    [activeSession, showBanner, updateTab],
  )

  const handleApplyFilter = useCallback(
    async (conditions: FilterCondition[]) => {
      const current = activeSession()
      if (!current) {
        showBanner('warn', 'Open a connection before filtering a result.')
        return
      }
      const tab = current.tabs.find((item) => item.id === current.activeTabId)
      if (!tab || tab.kind !== 'query') {
        showBanner('warn', 'Open a query tab before filtering a result.')
        return
      }
      const baseSql = (tab.baseSql || tab.lastExecutedSql || sqlRef.current).trim()
      if (!baseSql) {
        showBanner('warn', 'There is no query to filter.')
        return
      }
      const driverType = current.connection?.driverType ?? null
      const where = buildFilterWhere(conditions, driverType)
      if (!where) return

      const sql = buildFilteredSql(baseSql, where, driverType)
      const previousColumns = tab.state.result?.resultSets?.[0]?.columns ?? []
      const cachedColumns = previousColumns.length > 0 ? previousColumns : (tab.cachedColumns ?? [])

      updateTab(current.connectionId, tab.id, {
        filterConditions: conditions,
        baseSql,
        cachedColumns,
      })

      execute(sql, tab.id)
    },
    [activeSession, execute, showBanner, sqlRef, updateTab],
  )

  const handleResetFilter = useCallback(async () => {
    const current = activeSession()
    if (!current) return
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    if (!tab || tab.kind !== 'query') return

    const originalSql = (tab.baseSql || sqlRef.current).trim()
    updateTab(current.connectionId, tab.id, {
      filterConditions: undefined,
      baseSql: undefined,
      cachedColumns: undefined,
    })

    if (originalSql) {
      execute(originalSql, tab.id)
    }
  }, [activeSession, execute, sqlRef, updateTab])

  const handleEditConfirmApply = useCallback(async () => {
    const target = editConfirmTarget
    const current = activeSession()
    if (!current) return
    const targetTabId = target?.tabId || current.activeTabId
    const tab = current.tabs.find((item) => item.id === targetTabId)
    if (!tab) return

    if (tab.kind === 'design') {
      const driverType = current.connection?.driverType ?? null
      const sql = getDesignSql(tab, driverType)
      const ok = await handleRunUpdate(sql)
      if (!ok) return
      setEditConfirmOpen(false)
      setEditConfirmTarget(null)
      updateTab(current.connectionId, tab.id, { designDraft: null })
      if (loadTables && current.activeDatabase) {
        await loadTables(current.connectionId, current.activeDatabase)
      }
      if (loadColumns && current.activeDatabase) {
        await loadColumns(current.connectionId, current.activeDatabase)
      }
      if (target?.type === 'close-tab' && target.tabId) {
        handleCloseTab(target.tabId, true)
      } else if (target?.type === 'reload' || target?.type === 'save') {
        const schema = tab.designDraft?.schema || tab.design?.schema || 'dbo'
        const table = tab.designDraft?.table || tab.design?.table || ''
        if (table && reloadDesign) await reloadDesign(tab.id, schema, table)
      }
      return
    }

    let sql = ''
    try {
      sql = `${editSqlHeader(tab.editSource)}${buildUpdateStatements(tab.editSource, tabResultSet(tab), tab.edits || {}).join('\n\n')}`
    } catch {
      sql = ''
    }
    const ok = await handleRunUpdate(sql)
    if (!ok) return
    setEditConfirmOpen(false)
    setEditConfirmTarget(null)
    if (target?.type === 'switch-tab' && target.tabId) {
      const next = current.tabs.find((item) => item.id === target.tabId)
      if (next) {
        patchSession(current.connectionId, { activeTabId: target.tabId })
        seedEditor(next.sql)
      }
    } else if (target?.type === 'close-tab' && target.tabId) {
      handleCloseTab(target.tabId, true)
    } else if (target?.type === 'run') {
      const runSql = target.sql ?? ''
      if (runSql.trim()) runWithGuard(runSql, current.activeTabId)
    }
  }, [
    activeSession,
    editConfirmTarget,
    handleRunUpdate,
    handleCloseTab,
    patchSession,
    seedEditor,
    runWithGuard,
    tabResultSet,
    updateTab,
    loadTables,
    loadColumns,
    reloadDesign,
  ])

  const handleEditConfirmDiscard = useCallback(() => {
    const target = editConfirmTarget
    const current = activeSession()
    if (!current) return
    const targetTabId = target?.tabId || current.activeTabId
    const tab = current.tabs.find((item) => item.id === targetTabId)
    if (tab?.kind === 'design') {
      updateTab(current.connectionId, tab.id, { designDraft: null })
      setEditConfirmOpen(false)
      setEditConfirmTarget(null)
      if (target?.type === 'close-tab' && target.tabId) {
        handleCloseTab(target.tabId, true)
      } else if (target?.type === 'reload') {
        const schema = tab.design?.schema || tab.target?.schema || 'dbo'
        const table = tab.design?.table || tab.target?.table || ''
        if (table && reloadDesign) reloadDesign(tab.id, schema, table)
      }
      return
    }
    if (tab) updateTab(current.connectionId, tab.id, { edits: {} })
    setEditConfirmOpen(false)
    setEditConfirmTarget(null)
    if (target?.type === 'close-tab' && target.tabId) {
      handleCloseTab(target.tabId, true)
    }
  }, [activeSession, editConfirmTarget, updateTab, handleCloseTab, reloadDesign])

  const handleEditConfirmCopy = useCallback(async () => {
    const target = editConfirmTarget
    const current = activeSession()
    if (!current) return
    const targetTabId = target?.tabId || current.activeTabId
    const tab = current.tabs.find((item) => item.id === targetTabId)
    if (!tab) return
    if (tab.kind === 'design') {
      const driverType = current.connection?.driverType ?? null
      const sql = getDesignSql(tab, driverType)
      try {
        await api.copyText(sql)
        showBanner('success', 'Copied structure SQL to clipboard.')
      } catch (error: any) {
        showBanner('error', error.message)
      }
      return
    }
    let sql = ''
    try {
      sql = `${editSqlHeader(tab.editSource)}${buildUpdateStatements(tab.editSource, tabResultSet(tab), tab.edits || {}).join('\n\n')}`
    } catch {
      sql = ''
    }
    try {
      await api.copyText(sql)
      showBanner('success', 'Copied UPDATE query to clipboard.')
    } catch (error: any) {
      showBanner('error', error.message)
    }
  }, [activeSession, editConfirmTarget, showBanner, tabResultSet])

  const handleEditConfirmClose = useCallback(() => {
    setEditConfirmOpen(false)
    setEditConfirmTarget(null)
  }, [])

  const handleDeleteConfirmApply = useCallback(async () => {
    const target = deleteConfirmTarget
    const current = activeSession()
    if (!current) return
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    let sql = ''
    if (tab) {
      try {
        sql = `${editSqlHeader(tab.editSource)}${buildDeleteStatementsForRows(tab.editSource, tabResultSet(tab), tab.deletingRows || []).join('\n\n')}\n`
      } catch {
        sql = ''
      }
    }
    const ok = await handleRunUpdate(sql)
    if (!ok) return
    setDeleteConfirmOpen(false)
    setDeleteConfirmTarget(null)
    if (tab) updateTab(current.connectionId, tab.id, { deletingRows: [] })
    if (target?.type === 'switch-tab' && target.tabId) {
      const next = current.tabs.find((item) => item.id === target.tabId)
      if (next) {
        patchSession(current.connectionId, { activeTabId: target.tabId })
        seedEditor(next.sql)
      }
    } else if (target?.type === 'close-tab' && target.tabId) {
      handleCloseTab(target.tabId)
    } else if (target?.type === 'run') {
      const runSql = target.sql ?? ''
      if (runSql.trim()) runWithGuard(runSql, current.activeTabId)
    }
  }, [
    activeSession,
    deleteConfirmTarget,
    handleRunUpdate,
    updateTab,
    patchSession,
    seedEditor,
    handleCloseTab,
    runWithGuard,
    tabResultSet,
  ])

  const handleDeleteConfirmDiscard = useCallback(() => {
    const target = deleteConfirmTarget
    const current = activeSession()
    if (!current) return
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    if (tab) updateTab(current.connectionId, tab.id, { deletingRows: [] })
    setDeleteConfirmOpen(false)
    setDeleteConfirmTarget(null)
    if (target?.type === 'close-tab' && target.tabId) {
      handleCloseTab(target.tabId)
    } else if (target?.type === 'switch-tab' && target.tabId) {
      const next = current?.tabs.find((item) => item.id === target.tabId)
      if (next) {
        patchSession(current.connectionId, { activeTabId: target.tabId })
        seedEditor(next.sql)
      }
    } else if (target?.type === 'run') {
      const runSql = target.sql ?? ''
      if (runSql.trim()) runWithGuard(runSql, current.activeTabId)
    }
  }, [
    activeSession,
    deleteConfirmTarget,
    updateTab,
    handleCloseTab,
    patchSession,
    seedEditor,
    runWithGuard,
  ])

  const handleDeleteConfirmCopy = useCallback(async () => {
    const current = activeSession()
    if (!current) return
    const tab = current.tabs.find((item) => item.id === current.activeTabId)
    if (!tab) return
    let sql = ''
    try {
      sql = `${editSqlHeader(tab.editSource)}${buildDeleteStatementsForRows(tab.editSource, tabResultSet(tab), tab.deletingRows || []).join('\n\n')}\n`
    } catch {
      sql = ''
    }
    try {
      await api.copyText(sql)
      showBanner('success', 'Copied DELETE query to clipboard.')
    } catch (error: any) {
      showBanner('error', error.message)
    }
  }, [activeSession, showBanner, tabResultSet])

  const handleDeleteConfirmClose = useCallback(() => {
    setDeleteConfirmOpen(false)
    setDeleteConfirmTarget(null)
  }, [])

  return {
    runGuard,
    setRunGuard,
    editConfirmOpen,
    setEditConfirmOpen,
    editConfirmTarget,
    setEditConfirmTarget,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteConfirmTarget,
    setDeleteConfirmTarget,
    activeQueryTab,
    tabResultSet,
    execute,
    runWithGuard,
    handleRun,
    handleCancel,
    handleReRun,
    handleEstimatedPlan,
    handleGuardConfirm,
    handleChangeExecutionMode,
    handleCellChange,
    handleSetCellValue,
    handleDeleteRows,
    handleRunUpdate,
    handleApplyFilter,
    handleResetFilter,
    handleEditConfirmApply,
    handleEditConfirmDiscard,
    handleEditConfirmCopy,
    handleEditConfirmClose,
    handleDeleteConfirmApply,
    handleDeleteConfirmDiscard,
    handleDeleteConfirmCopy,
    handleDeleteConfirmClose,
  }
}
