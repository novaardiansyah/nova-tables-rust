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
import ConnectionsScreen from '@/components/connections/ConnectionsScreen'
import WorkspaceView from '@/components/WorkspaceView'
import AppDialogs from '@/components/dialogs/AppDialogs'

export default function App() {
  const [banner, setBanner] = useState<{ type: BannerType; message: string } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
      />
    </div>
  )
}
