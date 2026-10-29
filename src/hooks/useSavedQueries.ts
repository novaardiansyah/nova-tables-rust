import { useCallback, useEffect, useState, MutableRefObject } from 'react'
import { api, SavedQueryItem } from '../api'

export type { SavedQueryItem }

export interface SaveQueryDialogState {
  tabId: string
  sql: string
  initialName: string
  existingNames: string[]
  error?: string | null
}

export interface SessionTab {
  id: string
  title: string
  sql: string
  savedQueryId?: string | null
  savedQueryName?: string | null
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
}: UseSavedQueriesProps) {
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([])
  const [savedQueriesLoading, setSavedQueriesLoading] = useState(false)
  const [savedQueriesError, setSavedQueriesError] = useState<string | null>(null)
  const [saveQueryDialog, setSaveQueryDialog] = useState<SaveQueryDialogState | null>(null)
  const [queryRenameTarget, setQueryRenameTarget] = useState<SavedQueryItem | null>(null)
  const [queryDeleteTarget, setQueryDeleteTarget] = useState<SavedQueryItem | null>(null)
  const [queryBusy, setQueryBusy] = useState(false)

  const refreshSavedQueries = useCallback(async () => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    try {
      const items = await api.listSavedQueries(current.connectionId, current.activeDatabase)
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

    let active = true
    setSavedQueriesLoading(true)
    setSavedQueriesError(null)

    api
      .listSavedQueries(activeConnectionId, scopeDatabase)
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
  }, [activeConnectionId, scopeDatabase, screen])

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

    const tab = current.tabs.find((item: any) => item.id === current.activeTabId) || current.tabs[0]
    if (!tab) return
    const sql = tab.sql

    if (tab.savedQueryId) {
      setQueryBusy(true)
      try {
        const saved = await api.saveSavedQuery({
          connectionId: current.connectionId,
          databaseName: current.activeDatabase,
          name: tab.savedQueryName || tab.title,
          sql,
        })
        if (saved) {
          updateTab(current.connectionId, tab.id, {
            savedQueryId: saved.id,
            savedQueryName: saved.name,
            title: saved.name,
          })
          await refreshSavedQueries()
          showBanner('success', `Saved “${saved.name}”.`)
        }
      } catch (error: any) {
        if (error.code === 'SAVED_QUERY_MISSING') {
          updateTab(current.connectionId, tab.id, { savedQueryId: null, savedQueryName: null })
        }
        showBanner('error', error.message)
      } finally {
        setQueryBusy(false)
      }
      return
    }

    setSaveQueryDialog({
      tabId: tab.id,
      sql,
      initialName: /^Query \d+$/.test(tab.title) ? '' : tab.title,
      existingNames: savedQueries.map((item) => item.name),
    })
  }, [activeSession, refreshSavedQueries, savedQueries, showBanner, updateTab])

  const handleSaveQuerySubmit = useCallback(
    async (name: string) => {
      const pending = saveQueryDialog
      const current = activeSession()
      if (!pending || !current || !current.activeDatabase) return

      setQueryBusy(true)
      try {
        const saved = await api.saveSavedQuery({
          connectionId: current.connectionId,
          databaseName: current.activeDatabase,
          name,
          sql: pending.sql,
        })
        if (saved) {
          updateTab(current.connectionId, pending.tabId, {
            savedQueryId: saved.id,
            savedQueryName: saved.name,
            title: saved.name,
          })
          setSaveQueryDialog(null)
          await refreshSavedQueries()
          showBanner('success', `Saved “${saved.name}” to ${current.activeDatabase}.`)
        }
      } catch (error: any) {
        setSaveQueryDialog((prev) => (prev ? { ...prev, error: error.message } : prev))
      } finally {
        setQueryBusy(false)
      }
    },
    [activeSession, refreshSavedQueries, saveQueryDialog, showBanner, updateTab],
  )

  const handleOpenSavedQueries = useCallback(() => {
    const current = activeSession()
    if (!current || !current.activeDatabase) {
      showBanner('warn', 'Open a connection and pick a database to see its saved queries.')
      return
    }
    setSavedQueriesOpen(true)
    refreshSavedQueries()
  }, [activeSession, refreshSavedQueries, showBanner])

  const handleOpenSavedQuery = useCallback(
    (item: SavedQueryItem & { database?: string | null }) => {
      const current = activeSession()
      if (!current || !current.activeDatabase) return
      const db = item.database || item.databaseName
      if (
        item.connectionId !== current.connectionId ||
        (db && db.toLowerCase() !== current.activeDatabase.toLowerCase())
      ) {
        showBanner('warn', 'This saved query belongs to another connection or database.')
        return
      }
      setSavedQueriesOpen(false)
      openTab(current.connectionId, item.name, item.sql, null, { id: item.id, name: item.name })
      showBanner('success', `Opened “${item.name}”.`)
    },
    [activeSession, openTab, showBanner],
  )

  const handleRenameSavedQuery = useCallback(
    async (name: string) => {
      const target = queryRenameTarget
      if (!target) return

      setQueryBusy(true)
      try {
        const saved = await api.renameSavedQuery({ id: target.id, name })
        if (saved && target.connectionId) {
          const current = sessionsRef.current[target.connectionId]
          for (const tab of current?.tabs ?? []) {
            if (tab.savedQueryId !== saved.id) continue
            updateTab(target.connectionId, tab.id, { savedQueryName: saved.name, title: saved.name })
          }
        }
        setQueryRenameTarget(null)
        await refreshSavedQueries()
        showBanner('success', `Renamed saved query to “${saved?.name || name}”.`)
      } catch (error: any) {
        setQueryRenameTarget((prev) => (prev ? { ...prev, error: error.message } : prev))
      } finally {
        setQueryBusy(false)
      }
    },
    [queryRenameTarget, refreshSavedQueries, showBanner, updateTab, sessionsRef],
  )

  const handleDeleteSavedQuery = useCallback(async () => {
    const target = queryDeleteTarget
    if (!target) return

    setQueryBusy(true)
    try {
      await api.deleteSavedQuery(target.id)
      if (target.connectionId) {
        const current = sessionsRef.current[target.connectionId]
        for (const tab of current?.tabs ?? []) {
          if (tab.savedQueryId !== target.id) continue
          updateTab(target.connectionId, tab.id, { savedQueryId: null, savedQueryName: null })
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
  }, [queryDeleteTarget, refreshSavedQueries, showBanner, updateTab, sessionsRef])

  return {
    savedQueriesOpen,
    setSavedQueriesOpen,
    savedQueries,
    savedQueriesLoading,
    savedQueriesError,
    saveQueryDialog,
    setSaveQueryDialog,
    queryRenameTarget,
    setQueryRenameTarget,
    queryDeleteTarget,
    setQueryDeleteTarget,
    queryBusy,
    refreshSavedQueries,
    handleSaveQuery,
    handleSaveQuerySubmit,
    handleOpenSavedQueries,
    handleOpenSavedQuery,
    handleRenameSavedQuery,
    handleDeleteSavedQuery,
  }
}
