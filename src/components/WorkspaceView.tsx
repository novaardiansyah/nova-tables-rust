import React, { useMemo, useCallback } from 'react'
import Sidebar, { SidebarSessionItem } from '@/components/Sidebar'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import TabBar from '@/components/TabBar'
import TableDesigner from '@/components/designer/TableDesigner'
import ErdViewer from '@/components/erd/ErdViewer'
import QueryEditor from '@/components/QueryEditor'
import ResultsPanel from '@/components/results/ResultsPanel'
import StatusBar from '@/components/common/StatusBar'
import JsonPanel from '@/components/results/JsonPanel'
import { SessionData, createDatabaseState, dropDatabaseState, manageUsersState, IDLE_QUERY } from '@/utils/sessionHelpers'
import { Settings } from '@/settings'

export interface WorkspaceViewProps {
  session: SessionData
  sessions: Record<string, SessionData>
  activeConnectionId: string | null
  appVersion: string
  settings: Settings
  layout: any
  tabManager: any
  queryExecution: any
  tableBrowser: any
  tableOperations: any
  sessionManager: any
  databaseUsers: any
  onShowShortcuts: () => void
  savedQueries: any
  history: any
}

export default function WorkspaceView({
  session,
  sessions,
  activeConnectionId,
  appVersion,
  settings,
  layout,
  tabManager,
  queryExecution,
  tableBrowser,
  tableOperations,
  sessionManager,
  databaseUsers,
  onShowShortcuts,
  savedQueries,
  history,
}: WorkspaceViewProps) {
  const {
    query,
    editorHeight,
    setEditorHeight,
    headerCollapsed,
    toggleHeaderCollapsed,
    sidebarWidth,
    setSidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    jsonPanelWidth,
    setJsonPanelWidth,
    jsonPanelCollapsed,
    setJsonPanelCollapsed,
    setJsonPanelHovered,
    activeResultData,
    setActiveResultData,
    splitRef,
    handleSqlChange,
    handleSelectionChange,
    handleSplitPointerDown,
    jsonText,
  } = layout

  const {
    handleSelectTab,
    handleCloseTab,
    handleNewTab,
    handleSelectSet,
    handleReorderTabs,
  } = tabManager

  const {
    setEditConfirmOpen,
    setEditConfirmTarget,
    setDeleteConfirmOpen,
    setDeleteConfirmTarget,
    handleRun,
    handleEstimatedPlan,
    handleChangeExecutionMode,
    handleCellChange,
    handleSetCellValue,
    handleDeleteRows,
    handleApplyFilter,
    handleResetFilter,
  } = queryExecution

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
    handleGenerateErd,
    handleNewTable,
    handleDesignGenerate,
    handleDesignApply,
    handleDesignRename,
  } = tableBrowser

  const {
    pinnedTables,
    handleRenameTable,
    handleTogglePin,
    handleCloneTable,
    handleTruncateTable,
    handleDropTable,
  } = tableOperations

  const {
    activateSession,
    closeSession,
    openConnectionScreen,
    handleSelectDatabase,
    handleRefreshDatabases,
    handleOpenCreateDatabase,
    handleOpenDropDatabase,
  } = sessionManager

  const activeTab = session
    ? session.tabs.find((tab) => tab.id === session.activeTabId) || null
    : null

  const running = activeTab?.state.status === 'running'
  const activeDatabaseInfo = session
    ? (session.databases ?? []).find((database) => database.name === session.activeDatabase) ?? null
    : null
  const dropState = dropDatabaseState(session, activeDatabaseInfo, Boolean(running))
  const createState = createDatabaseState(session, Boolean(running))
  const manageUsers = manageUsersState(session, activeDatabaseInfo)

  const completionCatalog = useMemo(
    () => ({
      tables: session?.tables?.tables ?? [],
      columns: session?.columns?.tables ?? [],
      driverType: session?.connection?.driverType ?? null,
      activeDatabase: session?.activeDatabase ?? null,
    }),
    [session?.tables, session?.columns, session?.connection?.driverType, session?.activeDatabase],
  )

  const sidebarSessions: SidebarSessionItem[] = useMemo(() => {
    const sessionMap = new Map<string, any>(Object.entries(sessions))
    const ordered: SidebarSessionItem[] = []
    const seen = new Set<string>()

    const connList = sessionManager.connections || []
    for (const conn of connList) {
      const s = sessionMap.get(conn.id)
      if (s) {
        seen.add(conn.id)
        ordered.push({
          connectionId: s.connectionId,
          connection: s.connection,
          activeDatabase: s.activeDatabase,
          databases: s.databases || [],
          tables: s.tables,
          modules: s.modules,
        })
      }
    }

    for (const [id, s] of sessionMap.entries()) {
      if (!seen.has(id)) {
        ordered.push({
          connectionId: s.connectionId,
          connection: s.connection,
          activeDatabase: s.activeDatabase,
          databases: s.databases || [],
          tables: s.tables,
          modules: s.modules,
        })
      }
    }

    return ordered
  }, [sessions, sessionManager.connections])

  const handleReorderSessions = useCallback(
    (fromConnectionId: string, toConnectionId: string, position: 'before' | 'after') => {
      if (fromConnectionId === toConnectionId) return
      const currentList: any[] = sessionManager.connections || []
      const currentIds = currentList.map((c: any) => c.id)
      if (!currentIds.includes(fromConnectionId) || !currentIds.includes(toConnectionId)) return

      const next = currentIds.filter((id: string) => id !== fromConnectionId)
      const toIndex = next.indexOf(toConnectionId)
      if (toIndex < 0) return
      const insertIndex = position === 'before' ? toIndex : toIndex + 1
      next.splice(insertIndex, 0, fromConnectionId)

      const folderOrder = (sessionManager.folders || []).map((f: any) => f.id)
      sessionManager.handleReorderTree({
        connections: next,
        folders: folderOrder,
        connectionFolders: {},
        folderParents: {},
      })
    },
    [sessionManager],
  )

  return (
    <div className="relative flex min-h-0 flex-1">
      <Sidebar
        sessions={sidebarSessions}
        activeConnectionId={activeConnectionId}
        appVersion={appVersion}
        pinnedTables={pinnedTables}
        onActivateSession={activateSession}
        onCloseSession={closeSession}
        onReorderSessions={handleReorderSessions}
        onBrowseTable={handleBrowseTable}
        onCopyObjectName={handleCopyObjectName}
        onScriptTable={handleScriptTable}
        onGenerateErd={handleGenerateErd}
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
        onOpenCreateDatabase={handleOpenCreateDatabase}
        onOpenDropDatabase={handleOpenDropDatabase}
        onManageUsers={databaseUsers.handleOpenDatabaseUsers}
        canCreateDatabase={createState.allowed}
        canDropDatabase={dropState.allowed}
        canManageUsers={manageUsers.allowed}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-base">
        {headerCollapsed ? null : (
          <WorkspaceHeader
            session={session}
            activeDatabase={session.activeDatabase}
            running={running}
            queryExecutionMode={settings.queryExecutionMode}
            canCreateDatabase={createState.allowed}
            createDatabaseHint={createState.hint}
            canDropDatabase={dropState.allowed}
            dropDatabaseHint={dropState.hint}
            canManageUsers={manageUsers.allowed}
            manageUsersHint={manageUsers.hint}
            onSelectDatabase={handleSelectDatabase}
            onChangeExecutionMode={handleChangeExecutionMode}
            onCreateDatabase={handleOpenCreateDatabase}
            onDropDatabase={handleOpenDropDatabase}
            onManageUsers={databaseUsers.handleOpenDatabaseUsers}
            onRun={handleRun}
            onCancel={queryExecution.handleCancel}
            onEstimatedPlan={handleEstimatedPlan}
            onDisconnect={() => closeSession(session.connectionId)}
            onShowShortcuts={onShowShortcuts}
          />
        )}

        <TabBar
          tabs={session.tabs}
          activeTabId={session.activeTabId}
          canSave={Boolean(session.activeDatabase && activeTab?.kind === 'query')}
          onSelect={handleSelectTab}
          onClose={handleCloseTab}
          onNewTab={handleNewTab}
          onReorderTabs={handleReorderTabs}
          onSaveQuery={savedQueries.handleSaveQuery}
          onOpenSavedQueries={savedQueries.handleOpenSavedQueries}
          onOpenQueryHistory={history.handleOpenQueryHistory}
          onCopyQuery={handleCopyQuery}
          headerCollapsed={headerCollapsed}
          onToggleHeader={toggleHeaderCollapsed}
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
              driverType={session?.connection?.driverType ?? null}
              onGenerate={handleDesignGenerate}
              onApply={(sql, draft) => handleDesignApply(activeTab.id, sql, draft)}
              onRenameTable={(nextName) =>
                handleDesignRename(activeTab.id, activeTab.design!, nextName)
              }
            />
          </div>
        ) : activeTab?.kind === 'erd' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <ErdViewer
              connectionId={session.connectionId}
              database={session.activeDatabase ?? ''}
              initialTables={activeTab.target?.tables ?? []}
              depth={activeTab.target?.depth ?? 1}
              includeRelated={activeTab.target?.includeRelated ?? true}
              sourceSql={activeTab.target?.sourceSql ?? null}
              driverType={session?.connection?.driverType ?? null}
              onOpenTable={(schema, name) => {
                const table = (session?.tables?.tables ?? []).find(
                  (t: any) => t.schema === schema && t.name === name,
                )
                if (table) handleBrowseTable(table)
              }}
              onOpenStructure={(table) => {
                const sidebarTable = (session?.tables?.tables ?? []).find(
                  (t: any) => t.schema === table.schema && t.name === table.name,
                )
                if (sidebarTable) handleOpenStructure(sidebarTable)
              }}
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
              timezone={settings.timezone}
              driverType={session?.connection?.driverType ?? null}
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
              onResetFilter={handleResetFilter}
              filterConditions={activeTab?.filterConditions}
              onActiveDataChange={setActiveResultData}
              onExport={handleExportResult}
              tabTitle={activeTab?.title}
              executionPlan={activeTab?.executionPlan ?? null}
              onCopyPlan={(raw) => handleCopyText(raw, 'Copied execution plan XML.')}
              onCancel={queryExecution.handleCancel}
              onOpenStructure={handleOpenStructure}
              onGenerateErd={handleGenerateErd ? () => handleGenerateErd(null) : undefined}
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
        columns={activeResultData?.columnNames ?? []}
        rows={activeResultData?.rows ?? []}
        columnTypes={activeResultData?.columnTypes ?? []}
        rowIndexes={activeResultData?.rowIndexes ?? []}
        onCellChange={handleCellChange}
        driverType={session?.connection?.driverType ?? null}
        timezone={settings.timezone}
        onCopyText={handleCopyText}
      />
    </div>
  )
}
