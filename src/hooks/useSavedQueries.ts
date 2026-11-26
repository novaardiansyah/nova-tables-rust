import { useCallback, useEffect, useState, MutableRefObject } from 'react'
import { api, SavedQueryItem } from '@/api'

export type { SavedQueryItem }

export interface SaveQueryDialogState {
  tabId: string
  sql: string
  initialName: string
  existingNames: string[]
  error?: string | null
}

export interface OverwriteSavedQueryState {
  tabId: string
  sessionConnectionId: string
  savedConnectionId: string
  databaseName: string
  name: string
  sql: string
}

export interface SessionTab {
  id: string
  title: string
  sql: string
  savedQueryId?: string | null
  savedQueryName?: string | null
  savedQueryDatabase?: string | null
  [key: string]: unknown
}

export interface ActiveSessionData {
  connectionId: string
  activeDatabase?: string | null
  activeTabId?: string | null
  tabs: SessionTab[]
  [key: string]: unknown
}

export interface UseSavedQueriesProps {
  activeConnectionId?: string | null
  scopeDatabase?: string | null
  screen: string
  activeSession: () => any
  sessionsRef: MutableRefObject<Record<string, any>>
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  openTab: (
    connectionId: string,
    title: string,
    sql: string,
    editSource?: any,
    savedQuery?: any
  ) => any
  updateTab: (
    connectionId: string,
    tabId: string,
    updates: any
  ) => void
  patchSession?: (connectionId: string, patch: any) => void
  seedEditor?: (sql: string, focus?: boolean) => void
  sqlRef?: MutableRefObject<string>
}

export function useSavedQueries({
  activeConnectionId,
  scopeDatabase,
  screen,
  activeSession,
  sessionsRef,
  showBanner,
  openTab,
  updateTab,
  patchSession,
  seedEditor,
  sqlRef,
}: UseSavedQueriesProps) {
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([])
  const [savedQueriesLoading, setSavedQueriesLoading] = useState(false)
  const [savedQueriesError, setSavedQueriesError] = useState<string | null>(null)
  const [saveQueryDialog, setSaveQueryDialog] = useState<SaveQueryDialogState | null>(null)
  const [overwriteQueryTarget, setOverwriteQueryTarget] = useState<OverwriteSavedQueryState | null>(null)
  const [queryRenameTarget, setQueryRenameTarget] = useState<SavedQueryItem | null>(null)
  const [queryDeleteTarget, setQueryDeleteTarget] = useState<SavedQueryItem | null>(null)
  const [queryBusy, setQueryBusy] = useState(false)

  const refreshSavedQueries = useCallback(async () => {
    const current = activeSession()
    const connectionId = current?.connection?.id ?? null
    if (!connectionId || !current?.activeDatabase) {
      setSavedQueries([])
      return
    }
    try {
      const items = await api.listSavedQueries(connectionId, current.activeDatabase)
      setSavedQueries(items)
      setSavedQueriesError(null)
    } catch (error: any) {
      setSavedQueriesError(error.message)
    }
  }, [activeSession])

  useEffect(() => {
    if (screen !== 'workspace' || !activeConnectionId || !scopeDatabase) {
      setSavedQueries([])
      setSavedQueriesError(null)
      setSavedQueriesLoading(false)
      return undefined
    }

    const connectionId = activeSession()?.connection?.id ?? null
    if (!connectionId) {
      setSavedQueries([])
      setSavedQueriesError(null)
      setSavedQueriesLoading(false)
      return undefined
    }

    let active = true
    setSavedQueries([])
    setSavedQueriesLoading(true)
    setSavedQueriesError(null)

    api
      .listSavedQueries(connectionId, scopeDatabase)
      .then((items) => {
        if (!active) return
        setSavedQueries(items)
        setSavedQueriesLoading(false)
      })
      .catch((error: any) => {
        if (!active) return
        setSavedQueriesError(error.message)
        setSavedQueriesLoading(false)
      })

    return () => {
      active = false
    }
  }, [activeConnectionId, activeSession, scopeDatabase, screen])

  const unbindOtherTabsForSavedQuery = useCallback(
    (savedConnectionId: string, databaseName: string, savedQueryId: string, keepTabId: string) => {
      for (const current of Object.values(sessionsRef.current)) {
        if (current?.connection?.id !== savedConnectionId) continue
        if ((current?.activeDatabase ?? '').toLowerCase() !== databaseName.toLowerCase()) continue
        for (const tab of current.tabs ?? []) {
          if (tab.id === keepTabId || tab.savedQueryId !== savedQueryId) continue
          updateTab(current.connectionId, tab.id, {
            savedQueryId: null,
            savedQueryName: null,
            savedQueryDatabase: null,
          })
        }
      }
    },
    [sessionsRef, updateTab],
  )

  const handleSaveQuery = useCallback(async () => {
    const current = activeSession()
    if (!current) {
      showBanner('warn', 'Open a connection before saving a query.')
      return
    }
    if (!current.activeDatabase) {
      showBanner('warn', 'Select a database before saving a query.')
      return
    }

    const savedConnectionId = current.connection?.id ?? null
    if (!savedConnectionId) {
      showBanner('warn', 'Save this connection before saving queries to it.')
      return
    }

    const tab = current.tabs.find((item: any) => item.id === current.activeTabId) || current.tabs[0]
    if (!tab) return
    const sql = (sqlRef ? sqlRef.current : tab.sql) ?? tab.sql ?? ''
    if (!sql.trim()) {
      showBanner('warn', 'Enter a query before saving.')
      return
    }

    const scopeMatches =
      Boolean(tab.savedQueryId) &&
      (!tab.savedQueryDatabase || tab.savedQueryDatabase.toLowerCase() === current.activeDatabase.toLowerCase())

    if (scopeMatches && tab.savedQueryId) {
      setQueryBusy(true)
      try {
        const saved = await api.saveSavedQuery({
          id: tab.savedQueryId,
          connectionId: savedConnectionId,
          databaseName: current.activeDatabase,
          name: tab.savedQueryName || tab.title,
          sql,
          strictScope: true,
        })
        if (saved) {
          updateTab(current.connectionId, tab.id, {
            savedQueryId: saved.id,
            savedQueryName: saved.name,
            savedQueryDatabase: current.activeDatabase,
            title: saved.name,
            sql,
          })
          await refreshSavedQueries()
          showBanner('success', `Saved “${saved.name}”.`)
        }
        return
      } catch (error: any) {
        if (error?.code === 'SAVED_QUERY_MISSING' || error?.status === 404) {
          updateTab(current.connectionId, tab.id, {
            savedQueryId: null,
            savedQueryName: null,
            savedQueryDatabase: null,
          })
          setSaveQueryDialog({
            tabId: tab.id,
            sql,
            initialName: tab.savedQueryName || (/^Query \d+$/.test(tab.title) ? '' : tab.title),
            existingNames: savedQueries.map((item) => item.name),
          })
          return
        }
        showBanner('error', error.message)
        return
      } finally {
        setQueryBusy(false)
      }
    }

    if (tab.savedQueryId && !scopeMatches) {
      updateTab(current.connectionId, tab.id, {
        savedQueryId: null,
        savedQueryName: null,
        savedQueryDatabase: null,
      })
    }

    setSaveQueryDialog({
      tabId: tab.id,
      sql,
      initialName: /^Query \d+$/.test(tab.title) ? '' : tab.title,
      existingNames: savedQueries.map((item) => item.name),
    })
  }, [activeSession, refreshSavedQueries, savedQueries, showBanner, sqlRef, updateTab])

  const handleSaveQuerySubmit = useCallback(
    async (name: string) => {
      const pending = saveQueryDialog
      const current = activeSession()
      if (!pending || !current || !current.activeDatabase) return

      const savedConnectionId = current.connection?.id ?? null
      if (!savedConnectionId) {
        setSaveQueryDialog((prev) => (prev ? { ...prev, error: 'Connection is not saved.' } : prev))
        return
      }

      const trimmedName = name.trim()
      if (!trimmedName) return

      const liveSql = pending.sql || (sqlRef ? sqlRef.current : '') || ''
      if (!liveSql.trim()) {
        showBanner('warn', 'Enter a query before saving.')
        return
      }

      const localConflict = savedQueries.find(
        (item) => item.name.toLowerCase() === trimmedName.toLowerCase(),
      )
      if (localConflict) {
        setOverwriteQueryTarget({
          tabId: pending.tabId,
          sessionConnectionId: current.connectionId,
          savedConnectionId,
          databaseName: current.activeDatabase,
          name: localConflict.name,
          sql: liveSql,
        })
        return
      }

      setQueryBusy(true)
      try {
        const saved = await api.saveSavedQuery({
          connectionId: savedConnectionId,
          databaseName: current.activeDatabase,
          name: trimmedName,
          sql: liveSql,
          overwrite: false,
        })
        if (saved) {
          updateTab(current.connectionId, pending.tabId, {
            savedQueryId: saved.id,
            savedQueryName: saved.name,
            savedQueryDatabase: current.activeDatabase,
            title: saved.name,
            sql: liveSql,
          })
          setSaveQueryDialog(null)
          await refreshSavedQueries()
          showBanner('success', `Saved “${saved.name}” to ${current.activeDatabase}.`)
        }
      } catch (error: any) {
        if (error?.code === 'DUPLICATE_SAVED_QUERY_NAME' || error?.status === 409) {
          const existingName = error?.data?.existingQuery?.name || trimmedName
          setOverwriteQueryTarget({
            tabId: pending.tabId,
            sessionConnectionId: current.connectionId,
            savedConnectionId,
            databaseName: current.activeDatabase,
            name: existingName,
            sql: liveSql,
          })
          return
        }
        setSaveQueryDialog((prev) => (prev ? { ...prev, error: error.message } : prev))
      } finally {
        setQueryBusy(false)
      }
    },
    [activeSession, refreshSavedQueries, saveQueryDialog, savedQueries, showBanner, sqlRef, updateTab],
  )

  const handleConfirmOverwriteQuery = useCallback(async () => {
    const target = overwriteQueryTarget
    if (!target) return

    setQueryBusy(true)
    try {
      const saved = await api.saveSavedQuery({
        connectionId: target.savedConnectionId,
        databaseName: target.databaseName,
        name: target.name,
        sql: target.sql,
        overwrite: true,
      })
      if (saved) {
        unbindOtherTabsForSavedQuery(
          target.savedConnectionId,
          target.databaseName,
          saved.id,
          target.tabId,
        )
        updateTab(target.sessionConnectionId, target.tabId, {
          savedQueryId: saved.id,
          savedQueryName: saved.name,
          savedQueryDatabase: target.databaseName,
          title: saved.name,
          sql: target.sql,
        })
        setOverwriteQueryTarget(null)
        setSaveQueryDialog(null)
        await refreshSavedQueries()
        showBanner('success', `Overwrote “${saved.name}” in ${target.databaseName}.`)
      }
    } catch (error: any) {
      setOverwriteQueryTarget(null)
      setSaveQueryDialog((prev) => (prev ? { ...prev, error: error.message } : prev))
    } finally {
      setQueryBusy(false)
    }
  }, [overwriteQueryTarget, refreshSavedQueries, showBanner, unbindOtherTabsForSavedQuery, updateTab])

  const handleOpenSavedQueries = useCallback(() => {
    const current = activeSession()
    if (!current || !current.activeDatabase) {
      showBanner('warn', 'Open a connection and pick a database to see its saved queries.')
      return
    }
    setSavedQueriesOpen(true)
    void refreshSavedQueries()
  }, [activeSession, refreshSavedQueries, showBanner])

  const handleOpenSavedQuery = useCallback(
    (item: SavedQueryItem & { database?: string | null }) => {
      const current = activeSession()
      if (!current || !current.activeDatabase) return
      const db = item.databaseName || item.database || ''
      if (
        item.connectionId !== (current.connection?.id ?? null) ||
        !db ||
        db.toLowerCase() !== current.activeDatabase.toLowerCase()
      ) {
        showBanner('warn', 'This saved query belongs to another connection or database.')
        return
      }
      setSavedQueriesOpen(false)

      const existingTab = (current.tabs ?? []).find(
        (tab: any) => tab.kind === 'query' && tab.savedQueryId === item.id,
      )
      if (existingTab) {
        if (current.activeTabId && current.activeTabId !== existingTab.id && sqlRef) {
          updateTab(current.connectionId, current.activeTabId, { sql: sqlRef.current })
        }
        updateTab(current.connectionId, existingTab.id, {
          title: item.name,
          sql: item.sql,
          savedQueryId: item.id,
          savedQueryName: item.name,
          savedQueryDatabase: current.activeDatabase,
        })
        patchSession?.(current.connectionId, { activeTabId: existingTab.id })
        seedEditor?.(item.sql)
        showBanner('success', `Opened “${item.name}”.`)
        return
      }

      openTab(current.connectionId, item.name, item.sql, null, {
        id: item.id,
        name: item.name,
        databaseName: current.activeDatabase,
      })
      showBanner('success', `Opened “${item.name}”.`)
    },
    [activeSession, openTab, patchSession, seedEditor, showBanner, sqlRef, updateTab],
  )

  const handleRenameSavedQuery = useCallback(
    async (name: string) => {
      const target = queryRenameTarget
      const current = activeSession()
      if (!target) return

      const scopeConnectionId = target.connectionId ?? current?.connection?.id ?? null
      const scopeDb = target.databaseName || target.database || current?.activeDatabase || null

      setQueryBusy(true)
      try {
        const saved = await api.renameSavedQuery({
          id: target.id,
          name: name.trim(),
          connectionId: scopeConnectionId,
          databaseName: scopeDb,
        })
        if (saved && scopeConnectionId) {
          for (const sess of Object.values(sessionsRef.current)) {
            if (sess?.connection?.id !== scopeConnectionId) continue
            if (scopeDb && (sess?.activeDatabase ?? '').toLowerCase() !== scopeDb.toLowerCase()) continue
            for (const tab of sess.tabs ?? []) {
              if (tab.savedQueryId !== saved.id) continue
              updateTab(sess.connectionId, tab.id, {
                savedQueryName: saved.name,
                title: saved.name,
              })
            }
          }
        }
        setQueryRenameTarget(null)
        await refreshSavedQueries()
        showBanner('success', `Renamed saved query to “${saved?.name || name.trim()}”.`)
      } catch (error: any) {
        setQueryRenameTarget((prev) => (prev ? { ...prev, error: error.message } : prev))
      } finally {
        setQueryBusy(false)
      }
    },
    [activeSession, queryRenameTarget, refreshSavedQueries, sessionsRef, showBanner, updateTab],
  )

  const handleDeleteSavedQuery = useCallback(async () => {
    const target = queryDeleteTarget
    const current = activeSession()
    if (!target) return

    const scopeConnectionId = target.connectionId ?? current?.connection?.id ?? null
    const scopeDb = target.databaseName || target.database || current?.activeDatabase || null

    setQueryBusy(true)
    try {
      await api.deleteSavedQuery(target.id, {
        connectionId: scopeConnectionId,
        database: scopeDb,
      })
      if (scopeConnectionId) {
        for (const sess of Object.values(sessionsRef.current)) {
          if (sess?.connection?.id !== scopeConnectionId) continue
          if (scopeDb && (sess?.activeDatabase ?? '').toLowerCase() !== scopeDb.toLowerCase()) continue
          for (const tab of sess.tabs ?? []) {
            if (tab.savedQueryId !== target.id) continue
            updateTab(sess.connectionId, tab.id, {
              savedQueryId: null,
              savedQueryName: null,
              savedQueryDatabase: null,
            })
          }
        }
      }
      setQueryDeleteTarget(null)
      await refreshSavedQueries()
      showBanner('success', `Deleted “${target.name}”.`)
    } catch (error: any) {
      showBanner('error', error.message)
    } finally {
      setQueryBusy(false)
    }
  }, [activeSession, queryDeleteTarget, refreshSavedQueries, sessionsRef, showBanner, updateTab])

  return {
    savedQueriesOpen,
    setSavedQueriesOpen,
    savedQueries,
    savedQueriesLoading,
    savedQueriesError,
    saveQueryDialog,
    setSaveQueryDialog,
    overwriteQueryTarget,
    setOverwriteQueryTarget,
    queryRenameTarget,
    setQueryRenameTarget,
    queryDeleteTarget,
    setQueryDeleteTarget,
    queryBusy,
    refreshSavedQueries,
    handleSaveQuery,
    handleSaveQuerySubmit,
    handleConfirmOverwriteQuery,
    handleOpenSavedQueries,
    handleOpenSavedQuery,
    handleRenameSavedQuery,
    handleDeleteSavedQuery,
  }
}
