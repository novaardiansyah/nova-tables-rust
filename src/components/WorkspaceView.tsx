import React, { useMemo, useCallback, useEffect, useRef } from 'react'
import Sidebar, { SidebarSessionItem } from '@/components/Sidebar'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import TabBar from '@/components/TabBar'
import TableDesigner from '@/components/designer/TableDesigner'
import ErdViewer from '@/components/erd/ErdViewer'
import QueryEditor from '@/components/QueryEditor'
import type { QueryEditorControl } from '@/components/QueryEditor'
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
    handleNewRecord,
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
    handleSelectDatabase,
    handleRefreshDatabases,
    handleOpenCreateDatabase,
    handleOpenDropDatabase,
    updateTab,
  } = sessionManager

  const activeTab = session
    ? session.tabs.find((tab) => tab.id === session.activeTabId) || null
    : null

  const editorControlRef = useRef<QueryEditorControl | null>(null)

  const handleGridActivate = useCallback(() => {
    editorControlRef.current?.clearSelection()
  }, [])

  const sqlSyncTimerRef = useRef<number | null>(null)
  const pendingSqlRef = useRef<{ connectionId: string; tabId: string; value: string } | null>(null)

  const flushPendingSql = useCallback(() => {
    if (sqlSyncTimerRef.current !== null) {
      window.clearTimeout(sqlSyncTimerRef.current)
      sqlSyncTimerRef.current = null
    }
    const pending = pendingSqlRef.current
    pendingSqlRef.current = null
    if (pending) updateTab(pending.connectionId, pending.tabId, { sql: pending.value })
  }, [updateTab])

  const handleEditorChange = useCallback(
    (value: string) => {
      handleSqlChange(value)
      const connectionId = session.connectionId
      const tabId = session.activeTabId
      pendingSqlRef.current = { connectionId, tabId, value }
      if (sqlSyncTimerRef.current !== null) {
        window.clearTimeout(sqlSyncTimerRef.current)
      }
      sqlSyncTimerRef.current = window.setTimeout(() => {
        sqlSyncTimerRef.current = null
        const pending = pendingSqlRef.current
        pendingSqlRef.current = null
        if (pending) updateTab(pending.connectionId, pending.tabId, { sql: pending.value })
      }, 800)
    },
    [handleSqlChange, session.connectionId, session.activeTabId, updateTab],
  )

  useEffect(() => flushPendingSql, [flushPendingSql])

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
    const sessionEntries = Object.entries(sessions)
    const ordered: SidebarSessionItem[] = []
    const seen = new Set<string>()

    const push = (sessionId: string, s: any) => {
      seen.add(sessionId)
      ordered.push({
        connectionId: sessionId,
        connection: s.connection,
        activeDatabase: s.activeDatabase,
        databases: s.databases || [],
        tables: s.tables,
        modules: s.modules,
      })
    }

    const connList = sessionManager.connections || []
    for (const conn of connList) {
      for (const [sessionId, s] of sessionEntries) {
        if (seen.has(sessionId) || s.connection?.id !== conn.id) continue
        push(sessionId, s)
      }
    }

    for (const [sessionId, s] of sessionEntries) {
      if (!seen.has(sessionId)) push(sessionId, s)
    }

    return ordered
  }, [sessions, sessionManager.connections])

  const handleReorderSessions = useCallback(
    (fromConnectionId: string, toConnectionId: string, position: 'before' | 'after') => {
      if (fromConnectionId === toConnectionId) return
      const fromId = sessions[fromConnectionId]?.connection?.id ?? null
      const toId = sessions[toConnectionId]?.connection?.id ?? null
      if (!fromId || !toId || fromId === toId) return
      const currentList: any[] = sessionManager.connections || []
      const currentIds = currentList.map((c: any) => c.id)
      if (!currentIds.includes(fromId) || !currentIds.includes(toId)) return

      const next = currentIds.filter((id: string) => id !== fromId)
      const toIndex = next.indexOf(toId)
      if (toIndex < 0) return
      const insertIndex = position === 'before' ? toIndex : toIndex + 1
      next.splice(insertIndex, 0, fromId)

      const folderOrder = (sessionManager.folders || []).map((f: any) => f.id)
      sessionManager.handleReorderTree({
        connections: next,
        folders: folderOrder,
        connectionFolders: {},
        folderParents: {},
      })
    },
    [sessionManager, sessions],
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
        onOpenConnectionSettings={sessionManager.handleOpenConnectionSettings}
        onReorderSessions={handleReorderSessions}
        onBrowseTable={handleBrowseTable}
        onNewRecord={handleNewRecord}
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
              draft={activeTab.designDraft}
              mode={activeTab.target?.mode}
              loading={activeTab.loading}
              error={activeTab.error}
              busy={activeTab.busy}
              availableTables={session?.tables?.tables ?? []}
              availableColumns={session?.columns?.tables ?? []}
              driverType={session?.connection?.driverType ?? null}
              onDraftChange={(draft) =>
                sessionManager.updateTab(session.connectionId, activeTab.id, { designDraft: draft })
              }
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
                onChange={handleEditorChange}
                onRun={handleRun}
                onSelectionChange={handleSelectionChange}
                controlRef={editorControlRef}
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
              timezone={session.timezone}
              systemTimezone={session.systemTimezone}
              driverType={session?.connection?.driverType ?? null}
              editSource={activeTab?.editSource ?? null}
              edits={activeTab?.edits ?? {}}
              deletingRows={activeTab?.deletingRows ?? []}
              creatingRows={activeTab?.creatingRows ?? []}
              onCellChange={handleCellChange}
              onSetCellValue={handleSetCellValue}
              onNewRow={queryExecution.handleNewRow}
              onDuplicateRow={queryExecution.handleDuplicateRow}
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
              editMode={activeTab?.editMode ?? false}
              onEditModeChange={(editing) => {
                sessionManager.updateTab(session.connectionId, activeTab?.id ?? session.activeTabId, { editMode: editing })
              }}
              executionPlan={activeTab?.executionPlan ?? null}
              onCopyPlan={(raw) => handleCopyText(raw, 'Copied execution plan XML.')}
              onCancel={queryExecution.handleCancel}
              onOpenStructure={handleOpenStructure}
              onGenerateErd={handleGenerateErd ? () => handleGenerateErd(null) : undefined}
              onGridActivate={handleGridActivate}
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
        columns={activeResultData?.columnNames ?? []}
        rows={activeResultData?.rows ?? []}
        columnTypes={activeResultData?.columnTypes ?? []}
        rowIndexes={activeResultData?.rowIndexes ?? []}
        onCellChange={handleCellChange}
        driverType={session?.connection?.driverType ?? null}
        timezone={session.timezone}
        systemTimezone={session.systemTimezone}
        onCopyText={handleCopyText}
      />
    </div>
  )
}
