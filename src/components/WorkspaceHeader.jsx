import Icon, { Spinner } from './common/Icon.jsx'
import QueryModeMenu from './QueryModeMenu.jsx'
import Select from './common/Select.jsx'

export default function WorkspaceHeader({
  session,
  activeDatabase,
  running,
  queryExecutionMode,
  canDropDatabase,
  dropDatabaseHint,
  canManageUsers,
  manageUsersHint,
  onSelectDatabase,
  onChangeExecutionMode,
  onDropDatabase,
  onManageUsers,
  onRun,
  onEstimatedPlan,
  onDisconnect,
  onShowShortcuts,
}) {
  const options = (session?.databases ?? []).map((database) => ({
    value: database.name,
    label: database.isOnline ? database.name : `${database.name} (offline)`,
  }))

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      {session ? (
        <>
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          <span className="max-w-[220px] truncate text-[length:var(--app-text-13)] font-medium text-text-strong" title={session.name}>
            {session.name}
          </span>
          <span className="text-text-faint">/</span>
          <Select
            value={activeDatabase}
            options={options}
            onChange={onSelectDatabase}
            disabled={options.length === 0}
            searchable
            searchPlaceholder="Search database…"
          />
          <span className="inline-flex" title={manageUsersHint}>
            <button
              type="button"
              className="icon-btn hover:text-accent disabled:pointer-events-none disabled:opacity-40"
              onClick={onManageUsers}
              disabled={!canManageUsers}
              title={manageUsersHint}
              aria-label="Users and permissions"
            >
              <Icon name="users" size={14} />
            </button>
          </span>
          <span className="inline-flex" title={dropDatabaseHint}>
            <button
              type="button"
              className="icon-btn hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
              onClick={onDropDatabase}
              disabled={!canDropDatabase}
              title={dropDatabaseHint}
              aria-label="Drop database"
            >
              <Icon name="trash" size={14} />
            </button>
          </span>
          <span className="hidden truncate text-[length:var(--app-text-11)] text-text-faint lg:block">
            {session.host}:{session.port}
          </span>
        </>
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

        <QueryModeMenu value={queryExecutionMode} onChange={onChangeExecutionMode} />

        <button
          type="button"
          className="btn-soft h-8 px-2.5 text-[length:var(--app-text-12)]"
          onClick={onEstimatedPlan}
          disabled={!session || running}
          title="Display Estimated Execution Plan"
        >
          <Icon name="plan" size={13} />
          Estimated plan
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={onRun}
          disabled={!session || running}
          title="Run query (Ctrl+Enter)"
        >
          {running ? <Spinner size={13} /> : <Icon name="play" size={12} />}
          Run
          <span className="kbd border-on-accent/40 bg-transparent text-on-accent">Ctrl</span>
          <span className="kbd border-on-accent/40 bg-transparent text-on-accent">↵</span>
        </button>

        {session ? (
          <button type="button" className="icon-btn" onClick={onDisconnect} title="Close connection">
            <Icon name="power" size={15} />
          </button>
        ) : null}
      </div>
    </header>
  )
}
