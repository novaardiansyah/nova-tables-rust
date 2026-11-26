import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react'
import { api, DatabaseInfo, getAuthToken } from '@/api'
import { SessionData, SessionTab, createTab, createSession, pickDatabase, starterSql, queryTitle, EMPTY_TABLES, EMPTY_COLUMNS, EMPTY_MODULES } from '@/utils/sessionHelpers'
import { ConnectionDialogConnection, ConnectionDialogMode } from '@/components/connections/ConnectionDialog'
import { Settings, applySettings } from '@/settings'
import { PersistedSessionTabs, tabsFromPersisted, workspaceTabsFromSession } from '@/workspaceState'

export interface UseSessionManagerProps {
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  onDismissBanner?: () => void
  seedEditor: (sql: string, focus?: boolean) => void
  setSettings: React.Dispatch<React.SetStateAction<Settings>>
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  getPersistedTabs?: (connectionId: string, database?: string | null) => PersistedSessionTabs | null
  savePersistedTabs?: (connectionId: string, database: string, tabs: PersistedSessionTabs | null) => void
  sqlRef: MutableRefObject<string>
}

export function useSessionManager({
  showBanner,
  onDismissBanner,
  seedEditor,
  setSettings,
  setSettingsOpen,
  getPersistedTabs,
  savePersistedTabs,
  sqlRef,
}: UseSessionManagerProps) {
  const [connections, setConnections] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [sessions, setSessions] = useState<Record<string, SessionData>>({})
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [lastConnectedId, setLastConnectedId] = useState<string | null>(null)
  const [screen, setScreen] = useState<'connections' | 'workspace'>('connections')
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const connectingIdRef = useRef<string | null>(null)
  const cancelConnectionRef = useRef<Set<string>>(new Set())
  const [dialog, setDialog] = useState<{ mode: ConnectionDialogMode; connection?: ConnectionDialogConnection | null; notice?: string | null } | null>(null)
  const [connectionSettings, setConnectionSettings] = useState<{
    connectionId: string
    name: string
    timezone: string
    error?: string | null
    busy?: boolean
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [databaseDrop, setDatabaseDrop] = useState<{ database: string; error?: string | null } | null>(null)
  const [databaseDropBusy, setDatabaseDropBusy] = useState(false)
  const [databaseCreate, setDatabaseCreate] = useState<{ error?: string | null } | null>(null)
  const [databaseCreateBusy, setDatabaseCreateBusy] = useState(false)
  const [databaseSwitch, setDatabaseSwitch] = useState<{
    connectionId: string
    savedConnectionId: string | null
    fromDatabase: string | null
    toDatabase: string
  } | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const duplicateSaveInFlightRef = useRef(false)
  const sessionSeqRef = useRef(0)

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

  const syncActiveSql = useCallback(() => {
    const sessionId = activeIdRef.current
    if (!sessionId) return
    const session = sessionsRef.current[sessionId]
    if (!session) return
    const tabId = session.activeTabId
    if (!tabId) return
    const sql = sqlRef.current
    setSessions((prev) => {
      const current = prev[sessionId]
      if (!current) return prev
      const tab = current.tabs.find((item) => item.id === tabId)
      if (!tab || tab.sql === sql) return prev
      return {
        ...prev,
        [sessionId]: {
          ...current,
          tabs: current.tabs.map((item) => (item.id === tabId ? { ...item, sql } : item)),
        },
      }
    })
  }, [setSessions, sqlRef])

  const activateSession = useCallback(
    (connectionId: string) => {
      if (!sessionsRef.current[connectionId]) return
      if (connectionId !== activeIdRef.current) syncActiveSql()
      setActiveConnectionId(connectionId)
      setScreen('workspace')
      seedSessionEditor(sessionsRef.current[connectionId])
    },
    [seedSessionEditor, syncActiveSql],
  )

  const openConnectionScreen = useCallback(() => {
    setScreen('connections')
    onDismissBanner?.()
  }, [onDismissBanner])

  useEffect(() => {
    let cancelled = false

    void api
      .appInfo()
      .then((info) => {
        if (!cancelled) setAppVersion(info.version)
      })
      .catch(() => {})

    if (!getAuthToken()) {
      setLoadingConnections(false)
      return () => {
        cancelled = true
      }
    }

    setLoadingConnections(true)

    Promise.all([
      api
        .listConnections()
        .then((list) => {
          if (!cancelled) setConnections(list)
        })
        .catch((error) => {
          if (!cancelled && error?.status !== 401 && !error?.isUnauthorized) {
            showBanner('error', error.message)
          }
        }),
      api
        .listFolders()
        .then((list) => {
          if (!cancelled) setFolders(list)
        })
        .catch((error) => {
          if (!cancelled && error?.status !== 401 && !error?.isUnauthorized) {
            showBanner('error', error.message)
          }
        }),
    ]).finally(() => {
      if (!cancelled) setLoadingConnections(false)
    })

    void api
      .getLastConnectedId()
      .then((id) => {
        if (!cancelled) setLastConnectedId(id)
      })
      .catch(() => {})

    void api
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

      syncActiveSql()

      void api.disconnect(target).catch(() => {})

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
    [seedSessionEditor, syncActiveSql],
  )

  const handleCancelConnection = useCallback((connectionId?: string) => {
    const targetId = connectionId || connectingIdRef.current
    if (!targetId) return
    if (connectingIdRef.current !== targetId) return
    cancelConnectionRef.current.add(targetId)
    connectingIdRef.current = null
    setConnectingId(null)
  }, [])

  const handleConnect = useCallback(
    async (connection: any) => {
      syncActiveSql()
      sessionSeqRef.current += 1
      const sessionId = `${connection.id}:${sessionSeqRef.current}`

      cancelConnectionRef.current.delete(connection.id)
      connectingIdRef.current = connection.id
      setConnectingId(connection.id)
      try {
        const result = await api.connect({ ...connection, sessionId })
        if (cancelConnectionRef.current.has(connection.id)) {
          cancelConnectionRef.current.delete(connection.id)
          try {
            await api.disconnect(sessionId)
          } catch {}
          return
        }
        const database = pickDatabase(result.databases, result.database)

        void api.setLastConnectedId(connection.id).catch(() => {})
        setLastConnectedId(connection.id)
        setConnections((prev) =>
          prev.map((c) => ({
            ...c,
            lastConnectedAt: c.id === connection.id ? new Date().toISOString() : c.lastConnectedAt,
            lastDatabaseUsed: c.id === connection.id ? database : c.lastDatabaseUsed,
            isRecent: c.id === connection.id,
          })),
        )

        tabIdRef.current += 1
        const persisted = getPersistedTabs?.(connection.id, database) ?? null
        let tabs: SessionTab[]
        if (persisted) {
          tabs = tabsFromPersisted(persisted)
          tabs.forEach((tab) => {
            const numeric = Number(tab.id.replace('tab-', ''))
            if (Number.isFinite(numeric) && numeric > tabIdRef.current) tabIdRef.current = numeric
          })
        } else {
          const initialSql = starterSql(connection?.driverType)
          tabs = [createTab(`tab-${tabIdRef.current}`, queryTitle(1), initialSql)]
        }

        const activeTabId =
          persisted && tabs.some((tab) => tab.id === persisted.activeTabId)
            ? persisted.activeTabId
            : tabs[0].id
        const created = createSession(result, connection, database, tabs[0])
        created.tabs = tabs
        created.activeTabId = activeTabId

        setSessions((prev) => ({ ...prev, [sessionId]: created }))
        setActiveConnectionId(sessionId)
        setScreen('workspace')
        seedEditor((tabs.find((tab) => tab.id === activeTabId) || tabs[0]).sql)
        await loadTables(sessionId, database)
        await loadColumns(sessionId, database)
        await loadModules(sessionId, database)
      } catch (error: any) {
        if (cancelConnectionRef.current.has(connection.id)) {
          cancelConnectionRef.current.delete(connection.id)
          try {
            await api.disconnect(sessionId)
          } catch {}
        } else if (error.code === 'PASSWORD_MISSING') {
          setDialog({
            mode: 'edit',
            connection,
            notice: 'Enter the password for this connection to finish opening it.',
          })
        } else {
          showBanner('error', `Could not connect to “${connection.name}”. ${error.message}`)
        }
      } finally {
        if (connectingIdRef.current === connection.id) {
          connectingIdRef.current = null
          setConnectingId(null)
        }
        cancelConnectionRef.current.delete(connection.id)
      }
    },
    [getPersistedTabs, loadColumns, loadModules, loadTables, seedEditor, showBanner, syncActiveSql],
  )

  const handleSelectDatabase = useCallback(
    (database: string) => {
      const current = activeSession()
      if (!current || !database || database === current.activeDatabase) return
      setDatabaseSwitch({
        connectionId: current.connectionId,
        savedConnectionId: current.connection?.id ?? null,
        fromDatabase: current.activeDatabase ?? null,
        toDatabase: database,
      })
    },
    [activeSession],
  )

  const handleDatabaseSwitchConfirm = useCallback(
    async (mode: 'close' | 'keep') => {
      const pending = databaseSwitch
      if (!pending) return
      setDatabaseSwitch(null)

      const current = sessionsRef.current[pending.connectionId]
      if (!current) return

      const { connectionId, savedConnectionId, fromDatabase, toDatabase } = pending
      const liveSql = sqlRef.current
      const syncedTabs = current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, sql: liveSql } : tab,
      )

      if (savedConnectionId && fromDatabase) {
        const fromPersisted = workspaceTabsFromSession({ ...current, tabs: syncedTabs }, null)
        savePersistedTabs?.(savedConnectionId, fromDatabase, fromPersisted)
      }

      const targetPersisted = savedConnectionId
        ? getPersistedTabs?.(savedConnectionId, toDatabase) ?? null
        : null
      const restoredTargetTabs = targetPersisted ? tabsFromPersisted(targetPersisted) : []

      restoredTargetTabs.forEach((tab) => {
        const numeric = Number(tab.id.replace('tab-', ''))
        if (Number.isFinite(numeric) && numeric > tabIdRef.current) {
          tabIdRef.current = numeric
        }
      })

      let nextTabs: SessionTab[]
      let nextActiveTabId: string

      if (mode === 'close') {
        if (restoredTargetTabs.length > 0) {
          nextTabs = restoredTargetTabs
          nextActiveTabId =
            targetPersisted && restoredTargetTabs.some((tab) => tab.id === targetPersisted.activeTabId)
              ? targetPersisted.activeTabId
              : restoredTargetTabs[0].id
        } else {
          tabIdRef.current += 1
          const freshTab = createTab(
            `tab-${tabIdRef.current}`,
            queryTitle(1),
            starterSql(current.connection?.driverType),
          )
          nextTabs = [freshTab]
          nextActiveTabId = freshTab.id
        }
      } else {
        const detachedTabs = syncedTabs.map((tab) => ({
          ...tab,
          savedQueryId: null,
          savedQueryName: null,
          savedQueryDatabase: null,
        }))
        const existingIds = new Set(detachedTabs.map((tab) => tab.id))
        const mergedTargetTabs = restoredTargetTabs.map((tab) => {
          if (!existingIds.has(tab.id)) {
            existingIds.add(tab.id)
            return tab
          }
          tabIdRef.current += 1
          const nextId = `tab-${tabIdRef.current}`
          existingIds.add(nextId)
          return { ...tab, id: nextId }
        })
        nextTabs = [...detachedTabs, ...mergedTargetTabs]
        nextActiveTabId = detachedTabs.some((tab) => tab.id === current.activeTabId)
          ? current.activeTabId
          : nextTabs[0].id

        if (savedConnectionId) {
          const toPersisted = workspaceTabsFromSession(
            { ...current, tabs: nextTabs, activeTabId: nextActiveTabId },
            null,
          )
          savePersistedTabs?.(savedConnectionId, toDatabase, toPersisted)
        }
      }

      patchSession(connectionId, {
        activeDatabase: toDatabase,
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      })

      const activeTab = nextTabs.find((tab) => tab.id === nextActiveTabId) || nextTabs[0]
      if (activeTab) {
        seedEditor(activeTab.sql, false)
      }

      setConnections((prev) =>
        prev.map((c) =>
          c.id === savedConnectionId
            ? {
                ...c,
                lastDatabaseUsed: toDatabase,
              }
            : c,
        ),
      )
      if (savedConnectionId) void api.updateLastDatabase(savedConnectionId, toDatabase).catch(() => {})
      await loadTables(connectionId, toDatabase)
      await loadColumns(connectionId, toDatabase)
      await loadModules(connectionId, toDatabase)
    },
    [
      databaseSwitch,
      getPersistedTabs,
      loadColumns,
      loadModules,
      loadTables,
      patchSession,
      savePersistedTabs,
      seedEditor,
      sqlRef,
    ],
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
      const savedId = sessionsRef.current[activeConnectionId]?.connection?.id ?? null

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
        if (database) {
          if (savedId) void api.updateLastDatabase(savedId, database).catch(() => {})
          setConnections((prev) =>
            prev.map((c) =>
              c.id === savedId
                ? {
                    ...c,
                    lastDatabaseUsed: database,
                  }
                : c,
            ),
          )
        }
        await loadTables(activeConnectionId, database)
        await loadColumns(activeConnectionId, database)
        await loadModules(activeConnectionId, database)
      } catch (error: any) {
        showBanner('error', `Database dropped, but the list could not refresh. ${error.message}`)
      }
    },
    [activeConnectionId, databaseDrop, loadColumns, loadModules, loadTables, patchSession, showBanner],
  )

  const handleOpenCreateDatabase = useCallback(() => {
    const current = activeSession()
    if (!current) return
    setDatabaseCreate({ error: null })
  }, [activeSession])

  const handleCreateDatabaseConfirm = useCallback(
    async (databaseName: string) => {
      const target = databaseName.trim()
      if (!target || !activeConnectionId) return
      const savedId = sessionsRef.current[activeConnectionId]?.connection?.id ?? null

      setDatabaseCreateBusy(true)
      setDatabaseCreate((prev) => (prev ? { ...prev, error: null } : prev))

      try {
        await api.createDatabase({ connectionId: activeConnectionId, database: target })
      } catch (error: any) {
        setDatabaseCreate((prev) => (prev ? { ...prev, error: error.message } : prev))
        setDatabaseCreateBusy(false)
        return
      }

      setDatabaseCreate(null)
      setDatabaseCreateBusy(false)
      showBanner('success', `Created database “${target}”.`)

      try {
        const databases = await api.listDatabases(activeConnectionId)
        const current = sessionsRef.current[activeConnectionId]
        if (!current) return
        patchSession(activeConnectionId, { databases, activeDatabase: target })
        if (savedId) void api.updateLastDatabase(savedId, target).catch(() => {})
        setConnections((prev) =>
          prev.map((c) =>
            c.id === savedId
              ? {
                  ...c,
                  lastDatabaseUsed: target,
                }
              : c,
          ),
        )
        await loadTables(activeConnectionId, target)
        await loadColumns(activeConnectionId, target)
        await loadModules(activeConnectionId, target)
      } catch (error: any) {
        showBanner('error', `Database created, but the list could not refresh. ${error.message}`)
      }
    },
    [activeConnectionId, loadColumns, loadModules, loadTables, patchSession, showBanner],
  )

  const handleDuplicateConnection = useCallback(
    async (connection: any) => {
      if (duplicateSaveInFlightRef.current) return
      duplicateSaveInFlightRef.current = true
      try {
        const saved = connection.id
          ? await api.duplicateConnection(connection.id, `${connection.name} (copy)`)
          : await api.saveConnection({
              ...connection,
              id: undefined,
              name: `${connection.name} (copy)`,
            })
        setConnections(await api.listConnections())
        if (saved.id) {
          setDialog({
            mode: 'edit',
            connection: {
              ...saved,
              isDuplicate: true,
              hasPassword: true,
            },
          })
        }
      } catch (error: any) {
        showBanner('error', error.message)
      } finally {
        duplicateSaveInFlightRef.current = false
      }
    },
    [showBanner],
  )

  const handleSaveConnection = useCallback(
    async (input: any) => {
      const saved = await api.saveConnection(input)
      setConnections(await api.listConnections())
      setDialog(null)

      if (!saved.id) return
      const targets = Object.values(sessionsRef.current).filter(
        (item) => item.connection?.id === saved.id,
      )
      if (targets.length === 0) return
      const first = targets[0]

      const reconnectKeys = [
        'host',
        'port',
        'username',
        'database',
        'databaseName',
        'encrypt',
        'trustServerCertificate',
        'hasPassword',
      ]
      const nextDb = saved.database || saved.databaseName || ''
      const currentDb =
        first.connection?.database ||
        first.connection?.databaseName ||
        first.activeDatabase ||
        ''
      const dbChanged = Boolean(nextDb !== currentDb)
      const needsReconnect =
        dbChanged ||
        reconnectKeys.some(
          (key) => (first.connection?.[key] ?? null) !== (saved[key] ?? null),
        )

      if (needsReconnect) {
        for (const target of targets) await closeSession(target.connectionId)
        showBanner('info', 'Connection settings changed — reconnect to apply them.')
      } else {
        for (const target of targets) {
          patchSession(target.connectionId, { name: saved.name || '', connection: saved })
        }
      }
    },
    [closeSession, patchSession, showBanner],
  )

  const handleOpenConnectionSettings = useCallback(
    (connectionId: string) => {
      const session = sessionsRef.current[connectionId] ?? null
      const connection =
        session?.connection ?? connections.find((item: any) => item.id === connectionId)
      if (!connection) return
      setConnectionSettings({
        connectionId: connection.id ?? connectionId,
        name: connection.name ?? '',
        timezone: connection.timezone ?? 'UTC',
        error: null,
        busy: false,
      })
    },
    [connections],
  )

  const handleSaveConnectionSettings = useCallback(
    async (timezone: string) => {
      const target = connectionSettings
      if (!target || target.busy) return
      const session =
        Object.values(sessionsRef.current).find(
          (item) => item.connection?.id === target.connectionId,
        ) ?? null
      const connection =
        connections.find((item: any) => item.id === target.connectionId) ?? session?.connection
      if (!connection) return

      setConnectionSettings({ ...target, busy: true, error: null })
      try {
        const saved = await api.saveConnection({ ...connection, timezone })
        const nextTimezone = saved.timezone ?? timezone
        setConnections((prev) =>
          prev.map((item: any) =>
            item.id === target.connectionId ? { ...item, timezone: nextTimezone } : item,
          ),
        )
        for (const item of Object.values(sessionsRef.current)) {
          if (item.connection?.id !== target.connectionId) continue
          patchSession(item.connectionId, {
            timezone: nextTimezone,
            connection: { ...item.connection, timezone: nextTimezone },
          })
        }
        setConnectionSettings(null)
        showBanner('success', `Settings saved for “${target.name}”.`)
      } catch (error: any) {
        setConnectionSettings((prev) =>
          prev ? { ...prev, busy: false, error: error.message } : prev,
        )
      }
    },
    [connectionSettings, connections, patchSession, showBanner],
  )

  const handleDeleteSelection = useCallback(
    async ({ connectionIds = [], folderIds = [] }: { connectionIds?: string[]; folderIds?: string[] }) => {
      const result = await api.deleteTree({ connectionIds, folderIds })
      setConnections(result.connections)
      setFolders(result.folders)
      if (lastConnectedId && result.connectionIds.includes(lastConnectedId)) {
        setLastConnectedId(null)
        void api.setLastConnectedId(null)
      }
      const sessionIds = Object.values(sessionsRef.current)
        .filter((item) => result.connectionIds.includes(item.connection?.id))
        .map((item) => item.connectionId)
      for (const id of sessionIds) {
        await closeSession(id)
      }
      return result
    },
    [closeSession, lastConnectedId],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await handleDeleteSelection({ connectionIds: [deleteTarget.id] })
      setDeleteTarget(null)
    } catch (error: any) {
      if (error?.status !== 401 && !error?.isUnauthorized) {
        showBanner('error', error.message)
      }
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
        const connectionOrder = Array.isArray(payload?.connections) ? payload.connections : []
        const folderOrder = Array.isArray(payload?.folders) ? payload.folders : []
        const connectionFolders = (payload?.connectionFolders || {}) as Record<string, string | null>
        const folderParents = (payload?.folderParents || {}) as Record<string, string | null>
        if (connectionOrder.length > 0) {
          setConnections((prev) => {
            const byId = new Map(prev.map((c: any) => [c.id, c]))
            return connectionOrder
              .map((id: string) => {
                const item = byId.get(id)
                return item ? { ...item, folderId: id in connectionFolders ? connectionFolders[id] : item.folderId } : null
              })
              .filter(Boolean)
          })
        }
        if (folderOrder.length > 0) {
          setFolders((prev) => {
            const byId = new Map(prev.map((f: any) => [f.id, f]))
            return folderOrder
              .map((id: string) => {
                const item = byId.get(id)
                return item ? { ...item, parentId: id in folderParents ? folderParents[id] : item.parentId } : null
              })
              .filter(Boolean)
          })
        }
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
    setLoadingConnections(true)
    try {
      const [nextFolders, nextConnections] = await Promise.all([
        api.listFolders(),
        api.listConnections(),
      ])
      setFolders(nextFolders)
      setConnections(nextConnections)
    } catch (error: any) {
      if (error?.status !== 401 && !error?.isUnauthorized) {
        showBanner('error', error.message)
      }
    } finally {
      setLoadingConnections(false)
    }

    void api
      .getLastConnectedId()
      .then((nextLastId) => {
        if (nextLastId) setLastConnectedId(nextLastId)
      })
      .catch(() => {})

    void api
      .loadSettings()
      .then((stored) => {
        const resolved = applySettings(stored)
        setSettings(resolved)
        if (!stored) {
          api.saveSettings(resolved).catch(() => {})
        }
      })
      .catch(() => {})
  }, [setSettings, showBanner])

  const handleNewConnectionInFolder = useCallback(
    (folderId: string) => {
      setDialog({ mode: 'new', connection: { folderId } })
    },
    [],
  )

  return {
    connections,
    folders,
    loadingConnections,
    sessions,
    setSessions,
    activeConnectionId,
    lastConnectedId,
    screen,
    setScreen,
    connectingId,
    dialog,
    setDialog,
    connectionSettings,
    setConnectionSettings,
    handleOpenConnectionSettings,
    handleSaveConnectionSettings,
    deleteTarget,
    setDeleteTarget,
    deleting,
    databaseDrop,
    setDatabaseDrop,
    databaseDropBusy,
    databaseCreate,
    setDatabaseCreate,
    databaseCreateBusy,
    databaseSwitch,
    setDatabaseSwitch,
    handleDatabaseSwitchConfirm,
    appVersion,
    sessionsRef,
    activeIdRef,
    tabIdRef,
    activeSession,
    patchSession,
    updateTab,
    syncActiveSql,
    activateSession,
    openConnectionScreen,
    loadTables,
    loadColumns,
    loadModules,
    closeSession,
    handleConnect,
    handleSelectDatabase,
    handleRefreshDatabases,
    handleOpenCreateDatabase,
    handleCreateDatabaseConfirm,
    handleOpenDropDatabase,
    handleDropDatabaseConfirm,
    handleDuplicateConnection,
    handleSaveConnection,
    handleDeleteSelection,
    handleDeleteConfirm,
    handleCreateFolder,
    handleRenameFolder,
    handleMoveConnection,
    handleReorderTree,
    handleReloadConnections,
    handleNewConnectionInFolder,
    handleCancelConnection,
  }
}
