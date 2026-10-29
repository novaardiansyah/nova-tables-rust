import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react'
import { api, DatabaseInfo } from '@/api'
import { SessionData, SessionTab, createTab, createSession, pickDatabase, STARTER_SQL, queryTitle, EMPTY_TABLES, EMPTY_COLUMNS, EMPTY_MODULES } from '@/utils/sessionHelpers'
import { ConnectionDialogConnection, ConnectionDialogMode } from '@/components/connections/ConnectionDialog'
import { Settings, applySettings } from '@/settings'

export interface UseSessionManagerProps {
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  onDismissBanner?: () => void
  seedEditor: (sql: string, focus?: boolean) => void
  setSettings: React.Dispatch<React.SetStateAction<Settings>>
  settings: Settings
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useSessionManager({
  showBanner,
  onDismissBanner,
  seedEditor,
  setSettings,
  settings,
  setSettingsOpen,
}: UseSessionManagerProps) {
  const [connections, setConnections] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionData>>({})
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [lastConnectedId, setLastConnectedId] = useState<string | null>(null)
  const [screen, setScreen] = useState<'connections' | 'workspace'>('connections')
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ mode: ConnectionDialogMode; connection?: ConnectionDialogConnection | null; notice?: string | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [databaseDrop, setDatabaseDrop] = useState<{ database: string; error?: string | null } | null>(null)
  const [databaseDropBusy, setDatabaseDropBusy] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  const sessionsRef = useRef<Record<string, SessionData>>({})
  const activeIdRef = useRef<string | null>(null)
  const tabIdRef = useRef(1)
  const tablesRequestRef = useRef<Record<string, number>>({})
  const columnsRequestRef = useRef<Record<string, number>>({})
  const modulesRequestRef = useRef<Record<string, number>>({})

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    activeIdRef.current = activeConnectionId
  }, [activeConnectionId])

  const activeSession = useCallback(() => {
    const id = activeIdRef.current
    return id ? sessionsRef.current[id] || null : null
  }, [])

  const patchSession = useCallback((connectionId: string, patch: Partial<SessionData>) => {
    setSessions((prev) => {
      const current = prev[connectionId]
      if (!current) return prev
      return { ...prev, [connectionId]: { ...current, ...patch } }
    })
  }, [])

  const updateTab = useCallback((connectionId: string, tabId: string, patch: Partial<SessionTab> | ((tab: SessionTab) => Partial<SessionTab>)) => {
    setSessions((prev) => {
      const current = prev[connectionId]
      if (!current) return prev
      return {
        ...prev,
        [connectionId]: {
          ...current,
          tabs: current.tabs.map((tab) => {
            if (tab.id !== tabId) return tab
            const resolvedPatch = typeof patch === 'function' ? patch(tab) : patch
            return { ...tab, ...resolvedPatch }
          }),
        },
      }
    })
  }, [])

  const seedSessionEditor = useCallback(
    (target: SessionData) => {
      if (!target) return
      const tab = target.tabs.find((item) => item.id === target.activeTabId) || target.tabs[0]
      if (tab) seedEditor(tab.sql, false)
    },
    [seedEditor],
  )

  const activateSession = useCallback(
    (connectionId: string) => {
      if (!sessionsRef.current[connectionId]) return
      setActiveConnectionId(connectionId)
      setScreen('workspace')
      seedSessionEditor(sessionsRef.current[connectionId])
    },
    [seedSessionEditor],
  )

  const openConnectionScreen = useCallback(() => {
    setScreen('connections')
    onDismissBanner?.()
  }, [onDismissBanner])

  useEffect(() => {
    let cancelled = false

    api
      .listConnections()
      .then((list) => {
        if (!cancelled) setConnections(list)
      })
      .catch((error) => showBanner('error', error.message))

    api
      .listFolders()
      .then((list) => {
        if (!cancelled) setFolders(list)
      })
      .catch((error) => showBanner('error', error.message))

    api
      .getLastConnectedId()
      .then((id) => {
        if (!cancelled) setLastConnectedId(id)
      })
      .catch(() => {})

    api
      .appInfo()
      .then((info) => {
        if (!cancelled) setAppVersion(info.version)
      })
      .catch(() => {})

    api
      .loadSettings()
      .then((stored) => {
        if (!cancelled) {
          const resolved = applySettings(stored)
          setSettings(resolved)
          if (!stored) {
            api.saveSettings(resolved).catch(() => {})
          }
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [showBanner, setSettings])

  useEffect(() => {
    try {
      const offOpen = api.onOpenConnection(openConnectionScreen)
      const offNew = api.onNewConnection(() => setDialog({ mode: 'new' }))
      const offPreferences = api.onPreferences(() => setSettingsOpen(true))
      return () => {
        offOpen()
        offNew()
        offPreferences()
      }
    } catch {
      return undefined
    }
  }, [openConnectionScreen, setSettingsOpen])

  const loadTables = useCallback(
    async (connectionId: string, database: string) => {
      const requestId = (tablesRequestRef.current[connectionId] || 0) + 1
      tablesRequestRef.current[connectionId] = requestId
      patchSession(connectionId, { tables: { status: 'loading', database, tables: [], error: null } })
      try {
        const tables = await api.listTables(connectionId, database)
        if (tablesRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { tables: { status: 'ready', database, tables, error: null } })
      } catch (error: any) {
        if (tablesRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { tables: { status: 'error', database, tables: [], error: error.message } })
      }
    },
    [patchSession],
  )

  const loadColumns = useCallback(
    async (connectionId: string, database: string) => {
      const requestId = (columnsRequestRef.current[connectionId] || 0) + 1
      columnsRequestRef.current[connectionId] = requestId
      try {
        const columns = await api.listColumns(connectionId, database)
        if (columnsRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { columns: { status: 'ready', database, tables: columns, error: null } })
      } catch {
        if (columnsRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { columns: { status: 'ready', database, tables: [], error: null } })
      }
    },
    [patchSession],
  )

  const loadModules = useCallback(
    async (connectionId: string, database: string) => {
      const requestId = (modulesRequestRef.current[connectionId] || 0) + 1
      modulesRequestRef.current[connectionId] = requestId
      patchSession(connectionId, { modules: { status: 'loading', database, modules: [], error: null } })
      try {
        const modules = await api.listModules(connectionId, database)
        if (modulesRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { modules: { status: 'ready', database, modules, error: null } })
      } catch (error: any) {
        if (modulesRequestRef.current[connectionId] !== requestId) return
        patchSession(connectionId, { modules: { status: 'error', database, modules: [], error: error.message } })
      }
    },
    [patchSession],
  )

  const closeSession = useCallback(
    async (connectionId?: string) => {
      const target = connectionId || activeIdRef.current
      if (!target) return

      try {
        await api.disconnect(target)
      } catch {}

      const remaining = { ...sessionsRef.current }
      delete remaining[target]
      sessionsRef.current = remaining
      setSessions(remaining)

      if (activeIdRef.current !== target) return

      const nextId = Object.keys(remaining)[0] || null
      activeIdRef.current = nextId
      setActiveConnectionId(nextId)
      if (nextId) seedSessionEditor(remaining[nextId])
      else setScreen('connections')
    },
    [seedSessionEditor],
  )

  const handleConnect = useCallback(
    async (connection: any) => {
      if (sessionsRef.current[connection.id]) {
        activateSession(connection.id)
        return
      }

      setConnectingId(connection.id)
      try {
        const result = await api.connect({ id: connection.id })
        const database = pickDatabase(result.databases, result.database)

        setLastConnectedId(connection.id)
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connection.id ? { ...c, lastConnectedAt: new Date().toISOString() } : c,
          ),
        )

        tabIdRef.current += 1
        const tab = createTab(`tab-${tabIdRef.current}`, queryTitle(1), STARTER_SQL)
        const created = createSession(result, connection, database, tab)

        setSessions((prev) => ({ ...prev, [connection.id]: created }))
        setActiveConnectionId(connection.id)
        setScreen('workspace')
        seedEditor(tab.sql)
        await loadTables(connection.id, database)
        await loadColumns(connection.id, database)
        await loadModules(connection.id, database)
      } catch (error: any) {
        if (error.code === 'PASSWORD_MISSING') {
          setDialog({
            mode: 'edit',
            connection,
            notice: 'Enter the password for this connection to finish opening it.',
          })
        } else {
          showBanner('error', `Could not connect to “${connection.name}”. ${error.message}`)
        }
      } finally {
        setConnectingId(null)
      }
    },
    [activateSession, loadColumns, loadModules, loadTables, seedEditor, showBanner],
  )

  const handleSelectDatabase = useCallback(
    async (database: string) => {
      const current = activeSession()
      if (!current || !database) return
      patchSession(current.connectionId, { activeDatabase: database })
      await loadTables(current.connectionId, database)
      await loadColumns(current.connectionId, database)
      await loadModules(current.connectionId, database)
    },
    [activeSession, loadColumns, loadModules, loadTables, patchSession],
  )

  const handleRefreshDatabases = useCallback(
    async (connectionId: string) => {
      const current = sessionsRef.current[connectionId]
      if (!current) return
      try {
        const databases = await api.listDatabases(connectionId)
        patchSession(connectionId, { databases })
        const database = current.activeDatabase
        if (database) {
          await loadTables(connectionId, database)
          await loadColumns(connectionId, database)
          await loadModules(connectionId, database)
        }
        showBanner('success', `Refreshed databases (${databases.length}).`)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [loadColumns, loadModules, loadTables, patchSession, showBanner],
  )

  const handleOpenDropDatabase = useCallback(() => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    setDatabaseDrop({ database: current.activeDatabase, error: null })
  }, [activeSession])

  const handleDropDatabaseConfirm = useCallback(
    async (confirmName: string) => {
      const target = databaseDrop?.database
      if (!target || !activeConnectionId) return

      setDatabaseDropBusy(true)
      setDatabaseDrop((prev) => (prev ? { ...prev, error: null } : prev))

      try {
        await api.dropDatabase({
          connectionId: activeConnectionId,
          database: target,
          confirmName,
          acknowledged: true,
        })
      } catch (error: any) {
        setDatabaseDrop((prev) => (prev ? { ...prev, error: error.message } : prev))
        setDatabaseDropBusy(false)
        return
      }

      setDatabaseDrop(null)
      setDatabaseDropBusy(false)
      showBanner('success', `Dropped database “${target}”.`)

      try {
        const databases = await api.listDatabases(activeConnectionId)
        const current = sessionsRef.current[activeConnectionId]
        if (!current) return
        const database = pickDatabase(databases, current.activeDatabase)
        patchSession(activeConnectionId, { databases, activeDatabase: database })
        await loadTables(activeConnectionId, database)
        await loadColumns(activeConnectionId, database)
        await loadModules(activeConnectionId, database)
      } catch (error: any) {
        showBanner('error', `Database dropped, but the list could not refresh. ${error.message}`)
      }
    },
    [activeConnectionId, databaseDrop, loadColumns, loadModules, loadTables, patchSession, showBanner],
  )

  const handleSaveConnection = useCallback(
    async (input: any) => {
      const saved = await api.saveConnection(input)
      setConnections(await api.listConnections())
      setDialog(null)

      if (!saved.id) return
      const current = sessionsRef.current[saved.id]
      if (!current) return

      const reconnectKeys = ['host', 'port', 'username', 'database', 'encrypt', 'trustServerCertificate', 'hasPassword']
      const needsReconnect = reconnectKeys.some(
        (key) => (current.connection?.[key] ?? null) !== (saved[key] ?? null),
      )

      if (needsReconnect) {
        await closeSession(saved.id)
        showBanner('info', 'Connection settings changed — reconnect to apply them.')
      } else {
        patchSession(saved.id, { name: saved.name || '', connection: saved })
      }
    },
    [closeSession, patchSession, showBanner],
  )

  const handleDeleteSelection = useCallback(
    async ({ connectionIds = [], folderIds = [] }: { connectionIds?: string[]; folderIds?: string[] }) => {
      const result = await api.deleteTree({ connectionIds, folderIds })
      setConnections(result.connections)
      setFolders(result.folders)
      setLastConnectedId((prev) => (prev && result.connectionIds.includes(prev) ? null : prev))
      for (const id of result.connectionIds) {
        if (sessionsRef.current[id]) await closeSession(id)
      }
      return result
    },
    [closeSession],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await handleDeleteSelection({ connectionIds: [deleteTarget.id] })
      setDeleteTarget(null)
    } catch (error: any) {
      showBanner('error', error.message)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, handleDeleteSelection, showBanner])

  const handleCreateFolder = useCallback(
    async (name: string, parentId?: string | null) => {
      try {
        await api.saveFolder({ name, parentId })
        setFolders(await api.listFolders())
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleRenameFolder = useCallback(
    async (folder: any, name: string) => {
      try {
        await api.saveFolder({ id: folder.id, name })
        setFolders(await api.listFolders())
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleMoveConnection = useCallback(
    async (connection: any, folderId?: string | null) => {
      try {
        await api.moveConnection(connection.id, folderId ?? null)
        setConnections(await api.listConnections())
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleReorderTree = useCallback(
    async (payload: any) => {
      try {
        const result = await api.reorderTree(payload)
        setConnections(result.connections)
        setFolders(result.folders)
      } catch (error: any) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleReloadConnections = useCallback(async () => {
    try {
      const [nextFolders, nextConnections, nextLastId] = await Promise.all([
        api.listFolders(),
        api.listConnections(),
        api.getLastConnectedId().catch(() => null),
      ])
      setFolders(nextFolders)
      setConnections(nextConnections)
      if (nextLastId) setLastConnectedId(nextLastId)
    } catch (error: any) {
      showBanner('error', error.message)
    }
  }, [showBanner])

  return {
    connections,
    folders,
    sessions,
    setSessions,
    activeConnectionId,
    lastConnectedId,
    screen,
    setScreen,
    connectingId,
    dialog,
    setDialog,
    deleteTarget,
    setDeleteTarget,
    deleting,
    databaseDrop,
    setDatabaseDrop,
    databaseDropBusy,
    appVersion,
    sessionsRef,
    activeIdRef,
    tabIdRef,
    activeSession,
    patchSession,
    updateTab,
    activateSession,
    openConnectionScreen,
    loadTables,
    loadColumns,
    loadModules,
    closeSession,
    handleConnect,
    handleSelectDatabase,
    handleRefreshDatabases,
    handleOpenDropDatabase,
    handleDropDatabaseConfirm,
    handleSaveConnection,
    handleDeleteSelection,
    handleDeleteConfirm,
    handleCreateFolder,
    handleRenameFolder,
    handleMoveConnection,
    handleReorderTree,
    handleReloadConnections,
  }
}
