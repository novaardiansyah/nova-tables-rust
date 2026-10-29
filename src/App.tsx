import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { DEFAULT_SETTINGS, applySettings, Settings } from './settings'
import { jsonRecords } from './resultFormats'
import { editSqlHeader, buildUpdateStatements, buildDeleteStatementsForRows } from './edits'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDatabaseUsers } from './hooks/useDatabaseUsers'
import { useQueryHistory } from './hooks/useQueryHistory'
import { useSavedQueries } from './hooks/useSavedQueries'
import { useTableOperations } from './hooks/useTableOperations'
import { useSessionManager } from './hooks/useSessionManager'
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout'
import { useQueryExecution } from './hooks/useQueryExecution'
import { useTableBrowser } from './hooks/useTableBrowser'
import Banner, { BannerType } from './components/common/Banner'
import ConfirmDialog from './components/common/ConfirmDialog'
import ConnectionDialog from './components/connections/ConnectionDialog'
import ConnectionsScreen from './components/connections/ConnectionsScreen'
import DatabaseUsersDialog from './components/dialogs/DatabaseUsersDialog'
import DropDatabaseDialog from './components/dialogs/DropDatabaseDialog'
import PromptDialog from './components/common/PromptDialog'
import QueryEditor from './components/QueryEditor'
import QueryGuardDialog from './components/dialogs/QueryGuardDialog'
import JsonPanel from './components/results/JsonPanel'
import ResultsPanel from './components/results/ResultsPanel'
import SaveQueryDialog from './components/dialogs/SaveQueryDialog'
import SavedQueriesDialog from './components/dialogs/SavedQueriesDialog'
import QueryHistoryDialog from './components/dialogs/QueryHistoryDialog'
import Sidebar, { SidebarSessionItem } from './components/Sidebar'
import ShortcutPanel from './components/dialogs/ShortcutPanel'
import SettingsDialog from './components/dialogs/SettingsDialog'
import StatusBar from './components/common/StatusBar'
import TabBar from './components/TabBar'
import TableDesigner from './components/designer/TableDesigner'
import UpdateConfirmDialog from './components/results/UpdateConfirmDialog'
import DeleteConfirmDialog from './components/results/DeleteConfirmDialog'
import WorkspaceHeader from './components/WorkspaceHeader'
import { createTab, dropDatabaseState, manageUsersState, nextQueryTitle, IDLE_QUERY, queryTitle } from './utils/sessionHelpers'

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

  const {
    query,
    editorHeight,
    setEditorHeight,
    sidebarWidth,
    setSidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    jsonPanelWidth,
    setJsonPanelWidth,
    jsonPanelCollapsed,
    setJsonPanelCollapsed,
    jsonPanelHovered,
    setJsonPanelHovered,
    activeResultData,
    setActiveResultData,
    sqlRef,
    selectionRef,
    splitRef,
    seedEditor,
    handleSqlChange,
    handleSelectionChange,
    handleSplitPointerDown,
    jsonPanelVisible,
    jsonText,
  } = useWorkspaceLayout()

  const {
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
  } = useSessionManager({
    showBanner,
    onDismissBanner: () => setBanner(null),
    seedEditor,
    setSettings,
    settings,
    setSettingsOpen,
  })

  const scopeDatabase = activeConnectionId
    ? sessions[activeConnectionId]?.activeDatabase ?? null
    : null

  const openTab = useCallback(
    (connectionId: string, title: string, sql: string, editSource: any | null = null, savedQuery: any | null = null) => {
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
              createTab(id, title, sql, editSource, savedQuery),
            ],
            activeTabId: id,
          },
        }
      })
      seedEditor(sql)
      return id
    },
    [seedEditor, sqlRef, tabIdRef, setSessions],
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const current = activeSession()
      if (!current) return
      const index = current.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return
      const tab = current.tabs[index]
      if (tab && Object.keys(tab.edits || {}).length > 0) {
        setEditConfirmTarget({ type: 'close-tab', tabId })
        setEditConfirmOpen(true)
        return
      }
      if (tab && tab.deletingRows && tab.deletingRows.length > 0) {
        setDeleteConfirmTarget({ type: 'close-tab', tabId })
        setDeleteConfirmOpen(true)
        return
      }

      const remaining = current.tabs.filter((tab) => tab.id !== tabId)

      if (remaining.length === 0) {
        tabIdRef.current += 1
        const createdTab = createTab(`tab-${tabIdRef.current}`, queryTitle(1), '')
        patchSession(current.connectionId, { tabs: [createdTab], activeTabId: createdTab.id })
        seedEditor(createdTab.sql)
        return
      }

      if (tabId !== current.activeTabId) {
        patchSession(current.connectionId, { tabs: remaining })
        return
      }

      const neighbour = remaining[Math.min(index, remaining.length - 1)]
      patchSession(current.connectionId, { tabs: remaining, activeTabId: neighbour.id })
      seedEditor(neighbour.sql)
    },
    [activeSession, patchSession, seedEditor, tabIdRef],
  )

  const {
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
    tabResultSet,
    execute,
    handleRun,
    handleReRun,
    handleEstimatedPlan,
    handleGuardConfirm,
    handleChangeExecutionMode,
    handleCellChange,
    handleSetCellValue,
    handleDeleteRows,
    handleApplyFilter,
    handleEditConfirmApply,
    handleEditConfirmDiscard,
    handleEditConfirmCopy,
    handleEditConfirmClose,
    handleDeleteConfirmApply,
    handleDeleteConfirmDiscard,
    handleDeleteConfirmCopy,
    handleDeleteConfirmClose,
  } = useQueryExecution({
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
  })

  const {
    handleSelectTable,
    handleSelectModule,
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
    handleOpenStructure,
    handleNewTable,
    handleDesignGenerate,
    handleDesignApply,
    handleDesignRename,
  } = useTableBrowser({
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
  })

  const {
    databaseUsersOpen,
    databaseUsers,
    databaseUsersBusy,
    handleOpenDatabaseUsers,
    handleCloseDatabaseUsers,
    handleRefreshDatabaseUsers,
    handleCreateDatabaseUser,
    handleUpdateDatabaseUserRoles,
    handleDropDatabaseUser,
  } = useDatabaseUsers({ activeSession, showBanner })

  const {
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
    handleSaveQuery,
    handleSaveQuerySubmit,
    handleOpenSavedQueries,
    handleOpenSavedQuery,
    handleRenameSavedQuery,
    handleDeleteSavedQuery,
  } = useSavedQueries({
    activeConnectionId,
    scopeDatabase,
    screen,
    activeSession,
    sessionsRef,
    showBanner,
    openTab,
    updateTab,
  })

  const {
    history,
    handleOpenQueryHistory,
    handleOpenHistoryItem,
    handleDeleteHistoryItem,
    handleClearHistory,
    handleCloseHistory,
  } = useQueryHistory({ activeSession, showBanner, openTab })

  const {
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
  } = useTableOperations({
    activeSession,
    openTab,
    patchSession,
    showBanner,
    loadTables,
    loadColumns,
  })

  useEffect(() => {
    if (screen !== 'connections') return
    setSavedQueriesOpen(false)
    setSaveQueryDialog(null)
    setQueryRenameTarget(null)
    setQueryDeleteTarget(null)
    handleCloseHistory()
  }, [
    screen,
    handleCloseHistory,
    setQueryDeleteTarget,
    setQueryRenameTarget,
    setSaveQueryDialog,
    setSavedQueriesOpen,
  ])

  const syncLiveSql = useCallback((connectionId: string, tabId: string) => {
    const sql = sqlRef.current
    setSessions((prev) => {
      const current = prev[connectionId]
      if (!current) return prev
      return {
        ...prev,
        [connectionId]: {
          ...current,
          tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, sql } : tab)),
        },
      }
    })
  }, [sqlRef, setSessions])

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const current = activeSession()
      if (!current || tabId === current.activeTabId) return
      const next = current.tabs.find((tab) => tab.id === tabId)
      if (!next) return
      const active = current.tabs.find((tab) => tab.id === current.activeTabId)
      if (active && Object.keys(active.edits || {}).length > 0) {
        setEditConfirmTarget({ type: 'switch-tab', tabId })
        setEditConfirmOpen(true)
        return
      }
      if (active && active.deletingRows && active.deletingRows.length > 0) {
        setDeleteConfirmTarget({ type: 'switch-tab', tabId })
        setDeleteConfirmOpen(true)
        return
      }
      syncLiveSql(current.connectionId, current.activeTabId)
      patchSession(current.connectionId, { activeTabId: tabId })
      seedEditor(next.sql)
    },
    [activeSession, patchSession, seedEditor, syncLiveSql, setEditConfirmTarget, setEditConfirmOpen, setDeleteConfirmTarget, setDeleteConfirmOpen],
  )

  const handleNewTab = useCallback(() => {
    const current = activeSession()
    if (!current) return
    openTab(current.connectionId, nextQueryTitle(current.tabs), '')
  }, [activeSession, openTab])

  const handleCloseActiveTab = useCallback(() => {
    const current = activeSession()
    if (!current) return
    handleCloseTab(current.activeTabId)
  }, [activeSession, handleCloseTab])

  const handleCycleTab = useCallback(
    (direction: number) => {
      const current = activeSession()
      if (!current || current.tabs.length === 0) return
      const index = current.tabs.findIndex((tab) => tab.id === current.activeTabId)
      const next = (index + direction + current.tabs.length) % current.tabs.length
      handleSelectTab(current.tabs[next].id)
    },
    [activeSession, handleSelectTab],
  )

  const handleSelectTabIndex = useCallback(
    (index: number) => {
      const current = activeSession()
      if (!current) return
      const tab = current.tabs[index]
      if (!tab) return
      handleSelectTab(tab.id)
    },
    [activeSession, handleSelectTab],
  )

  const handleSelectSet = useCallback(
    (index: number) => {
      const current = activeSession()
      if (!current) return
      updateTab(current.connectionId, current.activeTabId, { activeSet: index })
    },
    [activeSession, updateTab],
  )

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
    [settings, showBanner, setSettings],
  )

  const hasDialog =
    Boolean(dialog) ||
    Boolean(tablePrompt) ||
    Boolean(dropTarget) ||
    Boolean(deleteTarget) ||
    Boolean(databaseDrop) ||
    databaseUsersOpen ||
    Boolean(runGuard) ||
    Boolean(saveQueryDialog) ||
    Boolean(queryRenameTarget) ||
    Boolean(queryDeleteTarget) ||
    savedQueriesOpen ||
    history.open ||
    shortcutsOpen ||
    settingsOpen ||
    editConfirmOpen ||
    deleteConfirmOpen

  useKeyboardShortcuts({
    screen,
    hasDialog,
    shortcutsOpen,
    setShortcutsOpen,
    setSettingsOpen,
    setDialog,
    handleRun,
    handleSaveQuery,
    openConnectionScreen,
    handleCloseActiveTab,
    handleNewTab,
    handleReRun,
    handleCycleTab,
    handleSelectTabIndex,
  })

  const session = activeConnectionId ? sessions[activeConnectionId] || null : null
  const completionCatalog = useMemo(
    () => ({
      tables: session?.tables?.tables ?? [],
      columns: session?.columns?.tables ?? [],
    }),
    [session?.tables, session?.columns],
  )
  const activeTab = session
    ? session.tabs.find((tab) => tab.id === session.activeTabId) || null
    : null
  const confirmSql = useMemo(() => {
    if (!editConfirmOpen || !activeTab) return ''
    try {
      return `${editSqlHeader(activeTab.editSource)}${buildUpdateStatements(activeTab.editSource, tabResultSet(activeTab), activeTab.edits || {}).join('\n\n')}`
    } catch {
      return ''
    }
  }, [editConfirmOpen, activeTab, tabResultSet])

  const confirmDeleteSql = useMemo(() => {
    if (!deleteConfirmOpen || !activeTab) return ''
    try {
      return `${editSqlHeader(activeTab.editSource)}${buildDeleteStatementsForRows(activeTab.editSource, tabResultSet(activeTab), activeTab.deletingRows || []).join('\n\n')}\n`
    } catch {
      return ''
    }
  }, [deleteConfirmOpen, activeTab, tabResultSet])

  const running = activeTab?.state.status === 'running'
  const activeDatabaseInfo = session
    ? (session.databases ?? []).find((database) => database.name === session.activeDatabase) ?? null
    : null
  const dropState = dropDatabaseState(session, activeDatabaseInfo, Boolean(running))
  const manageUsers = manageUsersState(session, activeDatabaseInfo)

  const sidebarSessions: SidebarSessionItem[] = Object.values(sessions).map((s: any) => ({
    connectionId: s.connectionId,
    connection: s.connection,
    activeDatabase: s.activeDatabase,
    databases: s.databases || [],
    tables: s.tables,
    modules: s.modules,
  }))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {banner ? (
        <Banner type={banner.type} message={banner.message} onDismiss={() => setBanner(null)} />
      ) : null}

      {session && screen === 'workspace' ? (
        <div className="relative flex min-h-0 flex-1">
          <Sidebar
            sessions={sidebarSessions}
            activeConnectionId={activeConnectionId}
            appVersion={appVersion}
            pinnedTables={pinnedTables}
            onActivateSession={activateSession}
            onCloseSession={closeSession}
            onBrowseTable={handleBrowseTable}
            onCopyObjectName={handleCopyObjectName}
            onScriptTable={handleScriptTable}
            onOpenStructure={handleOpenStructure}
            onOpenModule={handleOpenModule}
            onCopyModuleDefinition={handleCopyModuleDefinition}
            onNewFunction={handleNewFunction}
            onNewTable={handleNewTable}
            onRenameTable={handleRenameTable}
            onCloneTable={handleCloneTable}
            onTruncateTable={handleTruncateTable}
            onDropTable={handleDropTable}
            onTogglePin={handleTogglePin}
            onOpenConnections={openConnectionScreen}
            selectedTable={session.selectedTable}
            onSelectTable={handleSelectTable}
            selectedModule={session.selectedModule}
            onSelectModule={handleSelectModule}
            onRefreshDatabases={handleRefreshDatabases}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={setSidebarCollapsed}
          />

          <main className="flex min-w-0 flex-1 flex-col bg-base">
            <WorkspaceHeader
              session={session}
              activeDatabase={session.activeDatabase}
              running={running}
              queryExecutionMode={settings.queryExecutionMode}
              canDropDatabase={dropState.allowed}
              dropDatabaseHint={dropState.hint}
              canManageUsers={manageUsers.allowed}
              manageUsersHint={manageUsers.hint}
              onSelectDatabase={handleSelectDatabase}
              onChangeExecutionMode={handleChangeExecutionMode}
              onDropDatabase={handleOpenDropDatabase}
              onManageUsers={handleOpenDatabaseUsers}
              onRun={handleRun}
              onEstimatedPlan={handleEstimatedPlan}
              onDisconnect={() => closeSession(session.connectionId)}
              onShowShortcuts={() => setShortcutsOpen(true)}
            />

            <TabBar
              tabs={session.tabs}
              activeTabId={session.activeTabId}
              canSave={Boolean(session.activeDatabase && activeTab?.kind === 'query')}
              onSelect={handleSelectTab}
              onClose={handleCloseTab}
              onNewTab={handleNewTab}
              onSaveQuery={handleSaveQuery}
              onOpenSavedQueries={handleOpenSavedQueries}
              onOpenQueryHistory={handleOpenQueryHistory}
              onCopyQuery={handleCopyQuery}
            />

            {activeTab?.kind === 'design' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <TableDesigner
                  design={activeTab.design}
                  mode={activeTab.target?.mode}
                  loading={activeTab.loading}
                  error={activeTab.error}
                  busy={activeTab.busy}
                  availableTables={session?.tables?.tables ?? []}
                  availableColumns={session?.columns?.tables ?? []}
                  onGenerate={handleDesignGenerate}
                  onApply={(sql, draft) => handleDesignApply(activeTab.id, sql, draft)}
                  onRenameTable={(nextName) =>
                    handleDesignRename(activeTab.id, activeTab.design!, nextName)
                  }
                />
              </div>
            ) : (
              <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
                <div style={{ height: editorHeight }} className="min-h-[140px] shrink-0 overflow-hidden">
                  <QueryEditor
                    seed={query}
                    theme={settings.theme}
                    settings={settings}
                    catalog={completionCatalog}
                    onChange={handleSqlChange}
                    onRun={handleRun}
                    onSelectionChange={handleSelectionChange}
                  />
                </div>

                <div
                  onPointerDown={handleSplitPointerDown}
                  onDoubleClick={() => setEditorHeight(320)}
                  className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-base"
                  title="Drag to resize"
                >
                  <span className="h-px w-full bg-line transition-colors group-hover:bg-accent/60" />
                </div>

                <ResultsPanel
                  key={`${session.connectionId}:${activeTab?.id ?? 'empty'}`}
                  state={activeTab?.state || IDLE_QUERY}
                  activeSet={activeTab?.activeSet ?? 0}
                  onSelectSet={handleSelectSet}
                  relations={activeTab?.relations || []}
                  onRelationClick={handleOpenRelation}
                  onCopyText={handleCopyText}
                  editSource={activeTab?.editSource ?? null}
                  edits={activeTab?.edits ?? {}}
                  deletingRows={activeTab?.deletingRows ?? []}
                  onCellChange={handleCellChange}
                  onSetCellValue={handleSetCellValue}
                  onConfirmOpen={() => {
                    setEditConfirmTarget(null)
                    setEditConfirmOpen(true)
                  }}
                  onDeleteConfirmOpen={() => {
                    setDeleteConfirmTarget(null)
                    setDeleteConfirmOpen(true)
                  }}
                  onDeleteRows={handleDeleteRows}
                  onApplyFilter={handleApplyFilter}
                  onActiveDataChange={setActiveResultData}
                  onExport={handleExportResult}
                  tabTitle={activeTab?.title}
                  executionPlan={activeTab?.executionPlan ?? null}
                  onCopyXml={(xml) => handleCopyText(xml, 'Copied execution plan XML.')}
                  onOpenStructure={handleOpenStructure}
                />
              </div>
            )}

            <StatusBar
              result={activeTab?.state.result ?? null}
              editSource={activeTab?.editSource ?? null}
              activeDatabase={session.activeDatabase}
              queryStatus={activeTab?.state.status || 'idle'}
            />
          </main>

          <JsonPanel
            collapsed={jsonPanelCollapsed}
            onToggleCollapsed={setJsonPanelCollapsed}
            width={jsonPanelWidth}
            onWidthChange={setJsonPanelWidth}
            jsonText={jsonText}
            selectionLabel={activeResultData?.label ?? 'Selection'}
            onCopyJson={async () => {
              if (!jsonText) return
              await handleCopyText(jsonText, 'Copied row JSON.')
            }}
            onHoverVisibleChange={setJsonPanelHovered}
          />
        </div>
      ) : (
        <ConnectionsScreen
          connections={connections}
          folders={folders}
          openIds={Object.keys(sessions)}
          connectingId={connectingId}
          appVersion={appVersion}
          lastConnectedId={lastConnectedId}
          onOpen={handleConnect}
          onNewConnection={() => setDialog({ mode: 'new' })}
          onEditConnection={(connection) => setDialog({ mode: 'edit', connection })}
          onDeleteConnection={(connection) => setDeleteTarget(connection)}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteSelection={handleDeleteSelection}
          onMoveConnection={handleMoveConnection}
          onReorderTree={handleReorderTree}
          onReloadConnections={handleReloadConnections}
          onNotify={showBanner}
        />
      )}

      <ShortcutPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} session={session} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />

      <SavedQueriesDialog
        open={savedQueriesOpen}
        connectionName={session?.name ?? ''}
        database={session?.activeDatabase ?? ''}
        queries={savedQueries}
        loading={savedQueriesLoading}
        error={savedQueriesError}
        blocked={Boolean(queryRenameTarget || queryDeleteTarget)}
        onOpen={handleOpenSavedQuery}
        onRename={(item) => setQueryRenameTarget({ ...item, error: null })}
        onDelete={(item) => setQueryDeleteTarget(item)}
        onClose={() => setSavedQueriesOpen(false)}
      />

      <QueryHistoryDialog
        open={history.open}
        connectionName={session?.name ?? ''}
        database={session?.activeDatabase ?? ''}
        items={history.items}
        loading={history.loading}
        error={history.error}
        onOpen={handleOpenHistoryItem}
        onDelete={handleDeleteHistoryItem}
        onClear={handleClearHistory}
        onClose={handleCloseHistory}
      />

      <SaveQueryDialog
        open={Boolean(saveQueryDialog)}
        initialName={saveQueryDialog?.initialName}
        connectionName={session?.name ?? ''}
        database={session?.activeDatabase ?? ''}
        existingNames={saveQueryDialog?.existingNames ?? []}
        error={saveQueryDialog?.error ?? null}
        busy={queryBusy}
        onCancel={() => setSaveQueryDialog(null)}
        onSave={handleSaveQuerySubmit}
      />

      {dialog ? (
        <ConnectionDialog
          mode={dialog.mode}
          connection={dialog.connection}
          notice={dialog.notice}
          onClose={() => setDialog(null)}
          onSubmit={handleSaveConnection}
          onTest={api.testConnection}
        />
      ) : null}

      <PromptDialog
        open={Boolean(tablePrompt)}
        title={tablePrompt?.kind === 'rename' ? 'Rename table' : 'Truncate table'}
        description={
          tablePrompt?.kind === 'rename'
            ? `Rename ${tablePrompt.table.schema}.${tablePrompt.table.name}.`
            : `All rows in ${tablePrompt?.table.schema}.${tablePrompt?.table.name} will be removed. This cannot be undone.`
        }
        label={tablePrompt?.kind === 'rename' ? 'New name' : 'Table name'}
        hint={
          tablePrompt?.kind === 'rename'
            ? null
            : `Type "${tablePrompt?.table.name}" to confirm this action.`
        }
        confirmLabel={tableBusy ? 'Working…' : tablePrompt?.kind === 'rename' ? 'Rename' : 'Truncate'}
        initialValue={tablePrompt?.kind === 'rename' ? tablePrompt.table.name : ''}
        placeholder={tablePrompt?.kind === 'rename' ? tablePrompt.table.name : ''}
        busy={tableBusy}
        onCancel={() => setTablePrompt(null)}
        onConfirm={handleTablePromptConfirm}
      />

      <QueryGuardDialog
        open={Boolean(runGuard)}
        sql={runGuard?.sql}
        onCancel={() => setRunGuard(null)}
        onConfirm={handleGuardConfirm}
      />

      <UpdateConfirmDialog
        open={editConfirmOpen}
        changeCount={activeTab ? Object.keys(activeTab.edits || {}).length : 0}
        sql={confirmSql}
        onClose={handleEditConfirmClose}
        onApply={handleEditConfirmApply}
        onCopyQuery={handleEditConfirmCopy}
        onDiscard={handleEditConfirmDiscard}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        changeCount={activeTab ? (activeTab.deletingRows || []).length : 0}
        sql={confirmDeleteSql}
        onClose={handleDeleteConfirmClose}
        onApply={handleDeleteConfirmApply}
        onCopyQuery={handleDeleteConfirmCopy}
        onDiscard={handleDeleteConfirmDiscard}
      />

      <ConfirmDialog
        open={Boolean(dropTarget)}
        title="Drop table"
        message={
          dropTarget
            ? `“${dropTarget.schema}.${dropTarget.name}” will be permanently dropped. This cannot be undone.`
            : ''
        }
        confirmLabel={tableBusy ? 'Dropping…' : 'Drop Table'}
        danger
        busy={tableBusy}
        onCancel={() => setDropTarget(null)}
        onConfirm={handleDropConfirm}
      />

      <DropDatabaseDialog
        open={Boolean(databaseDrop)}
        database={databaseDrop?.database ?? ''}
        connectionName={session?.name ?? ''}
        server={session ? `${session.host}:${session.port}` : ''}
        error={databaseDrop?.error ?? null}
        busy={databaseDropBusy}
        onCancel={() => {
          if (!databaseDropBusy) setDatabaseDrop(null)
        }}
        onConfirm={handleDropDatabaseConfirm}
      />

      <DatabaseUsersDialog
        open={databaseUsersOpen}
        database={session?.activeDatabase ?? ''}
        connectionName={session?.name ?? ''}
        state={databaseUsers}
        busy={databaseUsersBusy}
        onClose={handleCloseDatabaseUsers}
        onRefresh={handleRefreshDatabaseUsers}
        onCreate={handleCreateDatabaseUser}
        onUpdateRoles={handleUpdateDatabaseUserRoles}
        onDrop={handleDropDatabaseUser}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete connection"
        message={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed from this device. Saved passwords for it are deleted as well.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      <PromptDialog
        open={Boolean(queryRenameTarget)}
        title="Rename saved query"
        description={
          queryRenameTarget
            ? `Rename “${queryRenameTarget.name}” in ${session?.name ?? ''} / ${queryRenameTarget.database}.`
            : ''
        }
        label="Query name"
        hint="Names are unique within this connection and database."
        confirmLabel={queryBusy ? 'Renaming…' : 'Rename'}
        initialValue={queryRenameTarget?.name ?? ''}
        error={queryRenameTarget?.error ?? null}
        busy={queryBusy}
        onCancel={() => setQueryRenameTarget(null)}
        onConfirm={handleRenameSavedQuery}
      />

      <ConfirmDialog
        open={Boolean(queryDeleteTarget)}
        title="Delete saved query"
        message={
          queryDeleteTarget
            ? `“${queryDeleteTarget.name}” will be removed from ${session?.name ?? ''} / ${queryDeleteTarget.database}. Open tabs keep their SQL.`
            : ''
        }
        confirmLabel={queryBusy ? 'Deleting…' : 'Delete'}
        danger
        busy={queryBusy}
        onCancel={() => setQueryDeleteTarget(null)}
        onConfirm={handleDeleteSavedQuery}
      />
    </div>
  )
}
