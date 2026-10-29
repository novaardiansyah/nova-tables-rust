import React, { useMemo } from 'react'
import ShortcutPanel from '@/components/dialogs/ShortcutPanel'
import SettingsDialog from '@/components/dialogs/SettingsDialog'
import SavedQueriesDialog from '@/components/dialogs/SavedQueriesDialog'
import QueryHistoryDialog from '@/components/dialogs/QueryHistoryDialog'
import SaveQueryDialog from '@/components/dialogs/SaveQueryDialog'
import ConnectionDialog, { ConnectionTestResult } from '@/components/connections/ConnectionDialog'
import PromptDialog from '@/components/common/PromptDialog'
import QueryGuardDialog from '@/components/dialogs/QueryGuardDialog'
import UpdateConfirmDialog from '@/components/results/UpdateConfirmDialog'
import DeleteConfirmDialog from '@/components/results/DeleteConfirmDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import DropDatabaseDialog from '@/components/dialogs/DropDatabaseDialog'
import DatabaseUsersDialog from '@/components/dialogs/DatabaseUsersDialog'
import { Settings } from '@/settings'
import { api } from '@/api'
import { SessionData, SessionTab } from '@/utils/sessionHelpers'
import { editSqlHeader, buildUpdateStatements, buildDeleteStatementsForRows } from '@/edits'

export interface AppDialogsProps {
  session: SessionData | null
  activeTab: SessionTab | null
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  settings: Settings
  saveSettings: (next: Settings) => Promise<void>
  sessionManager: any
  queryExecution: any
  tableOperations: any
  databaseUsers: any
  savedQueries: any
  queryHistory: any
  testConnection?: (connection: Record<string, unknown>) => Promise<ConnectionTestResult>
}

export default function AppDialogs({
  session,
  activeTab,
  shortcutsOpen,
  setShortcutsOpen,
  settingsOpen,
  setSettingsOpen,
  settings,
  saveSettings,
  sessionManager,
  queryExecution,
  tableOperations,
  databaseUsers,
  savedQueries,
  queryHistory,
  testConnection = api.testConnection,
}: AppDialogsProps) {
  const {
    dialog,
    setDialog,
    handleSaveConnection,
    databaseDrop,
    setDatabaseDrop,
    databaseDropBusy,
    handleDropDatabaseConfirm,
    deleteTarget,
    setDeleteTarget,
    deleting,
    handleDeleteConfirm,
  } = sessionManager

  const {
    runGuard,
    setRunGuard,
    handleGuardConfirm,
    editConfirmOpen,
    handleEditConfirmClose,
    handleEditConfirmApply,
    handleEditConfirmCopy,
    handleEditConfirmDiscard,
    deleteConfirmOpen,
    handleDeleteConfirmClose,
    handleDeleteConfirmApply,
    handleDeleteConfirmCopy,
    handleDeleteConfirmDiscard,
    tabResultSet,
  } = queryExecution

  const {
    tablePrompt,
    setTablePrompt,
    tableBusy,
    handleTablePromptConfirm,
    dropTarget,
    setDropTarget,
    handleDropConfirm,
  } = tableOperations

  const {
    databaseUsersOpen,
    databaseUsers: usersState,
    databaseUsersBusy,
    handleCloseDatabaseUsers,
    handleRefreshDatabaseUsers,
    handleCreateDatabaseUser,
    handleUpdateDatabaseUserRoles,
    handleDropDatabaseUser,
  } = databaseUsers

  const {
    savedQueriesOpen,
    setSavedQueriesOpen,
    savedQueries: queriesList,
    savedQueriesLoading,
    savedQueriesError,
    queryRenameTarget,
    setQueryRenameTarget,
    queryDeleteTarget,
    setQueryDeleteTarget,
    handleOpenSavedQuery,
    handleRenameSavedQuery,
    handleDeleteSavedQuery,
    saveQueryDialog,
    setSaveQueryDialog,
    queryBusy,
    handleSaveQuerySubmit,
  } = savedQueries

  const {
    history,
    handleOpenHistoryItem,
    handleDeleteHistoryItem,
    handleClearHistory,
    handleCloseHistory,
  } = queryHistory

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

  return (
    <>
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
        queries={queriesList}
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
          onTest={testConnection}
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
        state={usersState}
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
    </>
  )
}
