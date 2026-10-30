import React, { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import { DEFAULT_SETTINGS, applySettings, Settings } from '@/settings'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useDatabaseUsers } from '@/hooks/useDatabaseUsers'
import { useQueryHistory } from '@/hooks/useQueryHistory'
import { useSavedQueries } from '@/hooks/useSavedQueries'
import { useTableOperations } from '@/hooks/useTableOperations'
import { useSessionManager } from '@/hooks/useSessionManager'
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout'
import { useQueryExecution } from '@/hooks/useQueryExecution'
import { useTableBrowser } from '@/hooks/useTableBrowser'
import { useTabManager } from '@/hooks/useTabManager'
import Banner, { BannerType } from '@/components/common/Banner'
import MenuBar, { MenuBarMenu } from '@/components/common/MenuBar'
import { ConfigTransferMode } from '@/components/dialogs/ConfigTransferDialog'
import ConnectionsScreen from '@/components/connections/ConnectionsScreen'
import WorkspaceView from '@/components/WorkspaceView'
import AppDialogs from '@/components/dialogs/AppDialogs'

export default function App() {
  const [banner, setBanner] = useState<{ type: BannerType; message: string } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [configTransfer, setConfigTransfer] = useState<ConfigTransferMode | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const showBanner = useCallback((type: BannerType, message: string) => {
    setBanner({ type, message })
  }, [])

  useEffect(() => {
    if (!banner) return undefined
    const timer = setTimeout(() => setBanner(null), 2500)
    return () => clearTimeout(timer)
  }, [banner])

  const layout = useWorkspaceLayout()
  const { sqlRef, selectionRef, seedEditor } = layout

  const sessionManager = useSessionManager({
    showBanner,
    onDismissBanner: () => setBanner(null),
    seedEditor,
    setSettings,
    settings,
    setSettingsOpen,
  })

  const { activeSession, patchSession, updateTab, setSessions, tabIdRef, activeConnectionId, screen, sessions } = sessionManager
  const scopeDatabase = activeConnectionId ? sessions[activeConnectionId]?.activeDatabase ?? null : null

  const queryExecution = useQueryExecution({
    activeSession,
    showBanner,
    updateTab,
    sqlRef,
    selectionRef,
    settings,
    setSettings,
    openTab: (connId, title, sql, src, saved) => tabManager.openTab(connId, title, sql, src, saved),
    patchSession,
    seedEditor,
    handleCloseTab: (tabId) => tabManager.handleCloseTab(tabId),
  })

  const tabManager = useTabManager({
    activeSession,
    patchSession,
    updateTab,
    setSessions,
    seedEditor,
    sqlRef,
    tabIdRef,
    setEditConfirmTarget: queryExecution.setEditConfirmTarget,
    setEditConfirmOpen: queryExecution.setEditConfirmOpen,
    setDeleteConfirmTarget: queryExecution.setDeleteConfirmTarget,
    setDeleteConfirmOpen: queryExecution.setDeleteConfirmOpen,
  })

  const tableBrowser = useTableBrowser({
    activeSession,
    patchSession,
    updateTab,
    openTab: tabManager.openTab,
    execute: queryExecution.execute,
    loadTables: sessionManager.loadTables,
    loadColumns: sessionManager.loadColumns,
    showBanner,
    sqlRef,
    selectionRef,
    setSessions,
    tabIdRef,
  })

  const databaseUsers = useDatabaseUsers({ activeSession, showBanner })

  const savedQueries = useSavedQueries({
    activeConnectionId,
    scopeDatabase,
    screen,
    activeSession,
    sessionsRef: sessionManager.sessionsRef,
    showBanner,
    openTab: tabManager.openTab,
    updateTab,
  })

  const queryHistory = useQueryHistory({
    activeSession,
    showBanner,
    openTab: tabManager.openTab,
  })

  const tableOperations = useTableOperations({
    activeSession,
    openTab: tabManager.openTab,
    patchSession,
    showBanner,
    loadTables: sessionManager.loadTables,
    loadColumns: sessionManager.loadColumns,
  })

  useEffect(() => {
    if (screen !== 'connections') return
    savedQueries.setSavedQueriesOpen(false)
    savedQueries.setSaveQueryDialog(null)
    savedQueries.setQueryRenameTarget(null)
    savedQueries.setQueryDeleteTarget(null)
    queryHistory.handleCloseHistory()
  }, [screen, queryHistory, savedQueries])

  const saveSettings = useCallback(
    async (next: Settings) => {
      try {
        const saved = await api.saveSettings(next)
        setSettings(applySettings(saved))
        setSettingsOpen(false)
      } catch (error: any) {
        applySettings(settings)
        showBanner('error', error.message)
        throw error
      }
    },
    [settings, showBanner],
  )

  const hasDialog =
    Boolean(sessionManager.dialog) ||
    Boolean(tableOperations.tablePrompt) ||
    Boolean(tableOperations.dropTarget) ||
    Boolean(sessionManager.deleteTarget) ||
    Boolean(sessionManager.databaseDrop) ||
    databaseUsers.databaseUsersOpen ||
    Boolean(queryExecution.runGuard) ||
    Boolean(savedQueries.saveQueryDialog) ||
    Boolean(savedQueries.queryRenameTarget) ||
    Boolean(savedQueries.queryDeleteTarget) ||
    savedQueries.savedQueriesOpen ||
    queryHistory.history.open ||
    shortcutsOpen ||
    settingsOpen ||
    Boolean(configTransfer) ||
    queryExecution.editConfirmOpen ||
    queryExecution.deleteConfirmOpen

  useKeyboardShortcuts({
    screen,
    hasDialog,
    shortcutsOpen,
    setShortcutsOpen,
    setSettingsOpen,
    setDialog: sessionManager.setDialog,
    handleRun: queryExecution.handleRun,
    handleSaveQuery: savedQueries.handleSaveQuery,
    openConnectionScreen: sessionManager.openConnectionScreen,
    handleCloseActiveTab: tabManager.handleCloseActiveTab,
    handleNewTab: tabManager.handleNewTab,
    handleReRun: queryExecution.handleReRun,
    handleCycleTab: tabManager.handleCycleTab,
    handleSelectTabIndex: tabManager.handleSelectTabIndex,
  })

  const session = activeConnectionId ? sessions[activeConnectionId] || null : null
  const activeTab = session ? session.tabs.find((tab) => tab.id === session.activeTabId) || null : null
  const workspaceReady = screen === 'workspace' && Boolean(session)

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'new-connection',
          label: 'New Connection',
          shortcut: 'Ctrl+N',
          onSelect: () => sessionManager.setDialog({ mode: 'new' }),
        },
        {
          id: 'connections',
          label: 'Connections',
          shortcut: 'Ctrl+O',
          onSelect: sessionManager.openConnectionScreen,
        },
        {
          id: 'new-query-tab',
          label: 'New Query Tab',
          shortcut: 'Ctrl+T',
          disabled: !workspaceReady,
          onSelect: tabManager.handleNewTab,
        },
        {
          id: 'save-query',
          label: 'Save Query',
          shortcut: 'Ctrl+S',
          disabled: !workspaceReady,
          onSelect: savedQueries.handleSaveQuery,
        },
        {
          id: 'close-tab',
          label: 'Close Tab',
          shortcut: 'Ctrl+W',
          disabled: !workspaceReady,
          onSelect: tabManager.handleCloseActiveTab,
        },
        {
          id: 'close-connection',
          label: 'Close Connection',
          disabled: !activeConnectionId,
          onSelect: () => {
            if (activeConnectionId) sessionManager.closeSession(activeConnectionId)
          },
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'saved-queries',
          label: 'Saved Queries',
          onSelect: savedQueries.handleOpenSavedQueries,
        },
        {
          id: 'query-history',
          label: 'Query History',
          onSelect: queryHistory.handleOpenQueryHistory,
        },
        {
          id: 'toggle-sidebar',
          label: layout.sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar',
          disabled: !workspaceReady,
          onSelect: () => layout.setSidebarCollapsed((collapsed) => !collapsed),
        },
        {
          id: 'toggle-json-panel',
          label: layout.jsonPanelCollapsed ? 'Show JSON Panel' : 'Hide JSON Panel',
          disabled: !workspaceReady,
          onSelect: () => layout.setJsonPanelCollapsed((collapsed) => !collapsed),
        },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        {
          id: 'preferences',
          label: 'Preferences',
          shortcut: 'Ctrl+,',
          onSelect: () => setSettingsOpen(true),
        },
        {
          id: 'export-config',
          label: 'Export Configuration',
          separatorBefore: true,
          onSelect: () => setConfigTransfer('export'),
        },
        {
          id: 'import-config',
          label: 'Import Configuration',
          onSelect: () => setConfigTransfer('import'),
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          id: 'shortcuts',
          label: 'Keyboard Shortcuts',
          shortcut: 'F1',
          onSelect: () => setShortcutsOpen(true),
        },
      ],
    },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MenuBar menus={menus} />
      {banner ? <Banner type={banner.type} message={banner.message} onDismiss={() => setBanner(null)} /> : null}

      {session && screen === 'workspace' ? (
        <WorkspaceView
          session={session}
          sessions={sessions}
          activeConnectionId={activeConnectionId}
          appVersion={sessionManager.appVersion}
          settings={settings}
          layout={layout}
          tabManager={tabManager}
          queryExecution={queryExecution}
          tableBrowser={tableBrowser}
          tableOperations={tableOperations}
          sessionManager={sessionManager}
          databaseUsers={databaseUsers}
          onShowShortcuts={() => setShortcutsOpen(true)}
          savedQueries={savedQueries}
          history={queryHistory}
        />
      ) : (
        <ConnectionsScreen
          connections={sessionManager.connections}
          folders={sessionManager.folders}
          openIds={Object.keys(sessions)}
          connectingId={sessionManager.connectingId}
          appVersion={sessionManager.appVersion}
          lastConnectedId={sessionManager.lastConnectedId}
          onOpen={sessionManager.handleConnect}
          onNewConnection={() => sessionManager.setDialog({ mode: 'new' })}
          onEditConnection={(connection) => sessionManager.setDialog({ mode: 'edit', connection })}
          onDeleteConnection={(connection) => sessionManager.setDeleteTarget(connection)}
          onCreateFolder={sessionManager.handleCreateFolder}
          onRenameFolder={sessionManager.handleRenameFolder}
          onDeleteSelection={sessionManager.handleDeleteSelection}
          onMoveConnection={sessionManager.handleMoveConnection}
          onReorderTree={sessionManager.handleReorderTree}
          onReloadConnections={sessionManager.handleReloadConnections}
          onNotify={showBanner}
        />
      )}

      <AppDialogs
        session={session}
        activeTab={activeTab}
        shortcutsOpen={shortcutsOpen}
        setShortcutsOpen={setShortcutsOpen}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        settings={settings}
        saveSettings={saveSettings}
        sessionManager={sessionManager}
        queryExecution={queryExecution}
        tableOperations={tableOperations}
        databaseUsers={databaseUsers}
        savedQueries={savedQueries}
        queryHistory={queryHistory}
        configTransfer={configTransfer}
        setConfigTransfer={setConfigTransfer}
        onNotify={showBanner}
      />
    </div>
  )
}
