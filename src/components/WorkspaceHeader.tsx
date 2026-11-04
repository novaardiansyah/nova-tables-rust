import React from 'react'
import Icon, { Spinner } from '@/components/common/Icon'
import QueryModeMenu from '@/components/QueryModeMenu'
import Select, { SelectOption } from '@/components/common/Select'
import { ExecutionModeId } from '@/queryModes'

export interface WorkspaceHeaderDatabase {
  name: string
  isOnline?: boolean
  isSystem?: boolean
  [key: string]: unknown
}

export interface WorkspaceHeaderSession {
  name: string
  host: string
  port: number
  driverType?: string
  connection?: {
    driverType?: string
    [key: string]: unknown
  }
  databases?: WorkspaceHeaderDatabase[]
  [key: string]: unknown
}

export interface WorkspaceHeaderProps {
  session?: WorkspaceHeaderSession | null
  activeDatabase?: string | null
  running?: boolean
  queryExecutionMode: ExecutionModeId | string
  canDropDatabase?: boolean
  dropDatabaseHint?: string
  canCreateDatabase?: boolean
  createDatabaseHint?: string
  canManageUsers?: boolean
  manageUsersHint?: string
  onSelectDatabase?: (databaseName: string) => void
  onChangeExecutionMode: (modeId: ExecutionModeId) => void
  onCreateDatabase?: () => void
  onDropDatabase?: () => void
  onManageUsers?: () => void
  onRun?: () => void
  onCancel?: () => void
  onEstimatedPlan?: () => void
  onDisconnect?: () => void
  onShowShortcuts?: () => void
  // Legacy / page props compatibility
  connection?: WorkspaceHeaderSession | null
  connections?: unknown[]
  databases?: WorkspaceHeaderDatabase[]
}

export default function WorkspaceHeader({
  session: sessionProp,
  connection,
  activeDatabase,
  databases: databasesProp,
  running = false,
  queryExecutionMode,
  canDropDatabase = false,
  dropDatabaseHint,
  canCreateDatabase = false,
  createDatabaseHint,
  canManageUsers = false,
  manageUsersHint,
  onSelectDatabase,
  onChangeExecutionMode,
  onCreateDatabase,
  onDropDatabase,
  onManageUsers,
  onRun,
  onCancel,
  onEstimatedPlan,
  onDisconnect,
  onShowShortcuts,
}: WorkspaceHeaderProps) {
  const session = sessionProp || connection || null
  const databases = session?.databases ?? databasesProp ?? []

  // MySQL driver: Estimated execution plan is restricted to SQL Server connections only.
  const isMysql =
    session?.connection?.driverType === 'mysql' ||
    session?.driverType === 'mysql'

  const options: SelectOption[] = databases.map((database) => ({
    value: database.name,
    label: database.isOnline === false ? `${database.name} (offline)` : database.name,
  }))

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      {session ? (
        <Select
          value={activeDatabase ?? ''}
          options={options}
          onChange={(val) => onSelectDatabase?.(String(val))}
          disabled={options.length === 0}
          searchable
          searchPlaceholder="Search database…"
        />
      ) : (
        <>
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-line-strong" />
          <span className="text-[length:var(--app-text-13)] text-text-soft">No connection open</span>
          <span className="hidden text-[length:var(--app-text-11)] text-text-faint lg:block">
            Pick a saved connection in the sidebar to start browsing.
          </span>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="icon-btn"
          onClick={onShowShortcuts}
          title="Keyboard shortcuts (F1)"
        >
          <Icon name="question" size={15} />
        </button>

        {session ? (
          <button type="button" className="icon-btn hover:text-danger" onClick={onDisconnect} title="Close connection">
            <Icon name="power" size={15} />
          </button>
        ) : null}

        <QueryModeMenu value={queryExecutionMode} onChange={onChangeExecutionMode} />

        {!isMysql ? (
          <button
            type="button"
            className="icon-btn hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            onClick={onEstimatedPlan}
            disabled={!session || running}
            title="Display Estimated Execution Plan"
            aria-label="Display Estimated Execution Plan"
          >
            <Icon name="plan" size={15} />
          </button>
        ) : null}

        {running ? (
          <button
            type="button"
            className="icon-btn text-danger hover:bg-danger/10 hover:text-danger"
            onClick={onCancel}
            title="Cancel running query"
            aria-label="Cancel running query"
          >
            <Icon name="x" size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn text-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            onClick={onRun}
            disabled={!session}
            title="Run query (Ctrl+Enter)"
            aria-label="Run query (Ctrl+Enter)"
          >
            <Icon name="play" size={15} />
          </button>
        )}
      </div>
    </header>
  )
}
