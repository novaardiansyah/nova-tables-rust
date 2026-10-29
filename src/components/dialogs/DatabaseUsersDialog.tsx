import { useEffect, useMemo, useState, FormEvent } from 'react'
import Icon, { Spinner } from '../common/Icon'
import Select from '../common/Select'
import { DatabaseUserDetail, DatabaseUserStateData } from '../../hooks/useDatabaseUsers'

const EMPTY_STATE: DatabaseUserStateData = { status: 'idle', users: [], roles: [], logins: [], error: null }

const ROLE_HINTS: Record<string, string> = {
  db_owner: 'Full control of the database.',
  db_securityadmin: 'Manage permissions and role membership.',
  db_accessadmin: 'Add or remove database users.',
  db_backupoperator: 'Back up the database.',
  db_ddladmin: 'Create, alter and drop objects.',
  db_datareader: 'Read all tables and views.',
  db_datawriter: 'Insert, update and delete data.',
  db_denydatareader: 'Deny reading tables and views.',
  db_denydatawriter: 'Deny changing data.',
}

const TYPE_LABELS: Record<string, string> = {
  SQL_USER: 'SQL user',
  WINDOWS_USER: 'Windows user',
  WINDOWS_GROUP: 'Windows group',
  EXTERNAL_USER: 'External user',
  EXTERNAL_GROUP: 'External group',
}

function typeLabel(type?: string | null) {
  if (!type) return 'user'
  return TYPE_LABELS[type] ?? String(type).replace(/_/g, ' ').toLowerCase()
}

function sorted(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

export interface DatabaseUsersDialogProps {
  open: boolean
  database: string
  connectionName: string
  state?: DatabaseUserStateData
  busy?: boolean
  onClose?: () => void
  onCancel?: () => void
  onRefresh: () => void
  onCreate: (login: string, roles: string[]) => Promise<boolean>
  onUpdateRoles: (user: DatabaseUserDetail, roles: string[]) => Promise<boolean>
  onDrop: (user: DatabaseUserDetail) => Promise<boolean>
}

export default function DatabaseUsersDialog({
  open,
  database,
  connectionName,
  state = EMPTY_STATE,
  busy = false,
  onClose,
  onCancel,
  onRefresh,
  onCreate,
  onUpdateRoles,
  onDrop,
}: DatabaseUsersDialogProps) {
  const handleClose = onClose || onCancel || (() => {})
  const [selectedName, setSelectedName] = useState('')
  const [draftRoles, setDraftRoles] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)
  const [login, setLogin] = useState('')
  const [createRoles, setCreateRoles] = useState<string[]>([])
  const [confirmDrop, setConfirmDrop] = useState<DatabaseUserDetail | null>(null)

  const selectedUser = useMemo(
    () => state.users.find((user: DatabaseUserDetail) => user.name === selectedName) ?? null,
    [selectedName, state.users],
  )
  const loginOptions = state.logins.map((item) => ({ value: item.name, label: item.name }))
  const selectedLogin = state.logins.find((item) => item.name === login) ?? null
  const roleOptions = state.roles.map((name) => ({ name, hint: ROLE_HINTS[name] ?? 'Fixed database role.' }))

  useEffect(() => {
    if (!open) return
    setCreating(false)
    setSavingRoles(false)
    setConfirmDrop(null)
    setLogin('')
    setCreateRoles([])
  }, [database, open])

  useEffect(() => {
    if (!open) return
    if (state.users.length === 0) {
      if (selectedName) setSelectedName('')
      return
    }
    if (state.users.some((user: DatabaseUserDetail) => user.name === selectedName)) return
    const preferred = state.users.find((user: DatabaseUserDetail) => user.canManage) ?? state.users[0]
    setSelectedName(preferred.name)
  }, [open, selectedName, state.users])

  useEffect(() => {
    setDraftRoles(selectedUser?.roles ?? [])
  }, [selectedUser])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      if (confirmDrop) {
        setConfirmDrop(null)
        return
      }
      if (creating) {
        setCreating(false)
        return
      }
      handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, confirmDrop, creating, handleClose, open])

  if (!open) return null

  const rolesDirty =
    sorted(draftRoles).join('\u0000') !== sorted(selectedUser?.roles ?? []).join('\u0000')

  const openCreate = () => {
    if (!state.logins.length) return
    setCreating(true)
    setConfirmDrop(null)
    setLogin(state.logins[0]?.name ?? '')
    setCreateRoles([])
  }

  const toggleDraftRole = (role: string) => {
    setDraftRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  const toggleCreateRole = (role: string) => {
    setCreateRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!login || busy) return
    const created = await onCreate(login, createRoles)
    if (!created) return
    setCreating(false)
    setSelectedName(login)
    setLogin('')
    setCreateRoles([])
  }

  const submitRoles = async () => {
    if (!selectedUser || !rolesDirty || busy) return
    setSavingRoles(true)
    try {
      await onUpdateRoles(selectedUser, draftRoles)
    } finally {
      setSavingRoles(false)
    }
  }

  const submitDrop = async () => {
    if (!confirmDrop || busy) return
    const dropped = await onDrop(confirmDrop)
    if (dropped) setConfirmDrop(null)
  }

  const protectedLabel =
    selectedUser?.reason === 'current' ? 'Current connection user' : 'System user'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) handleClose()
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in flex h-[min(680px,86vh)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="users" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Users & permissions
            </h2>
            <p className="mt-0.5 truncate text-[length:var(--app-text-11)] text-text-muted">
              {connectionName ? `${connectionName} / ` : ''}
              {database}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            onClick={onRefresh}
            disabled={busy || state.status === 'loading'}
            title="Refresh users"
            aria-label="Refresh users"
          >
            {state.status === 'loading' ? <Spinner size={12} /> : <Icon name="refresh" size={13} />}
          </button>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            onClick={handleClose}
            disabled={busy}
            title="Close"
            aria-label="Close users"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col border-r border-line">
            <div className="border-b border-line p-3">
              <button
                type="button"
                className="btn-soft w-full justify-center"
                onClick={openCreate}
                disabled={busy || !state.logins.length}
                title={state.logins.length ? 'New database user' : 'No unmapped logins available'}
              >
                <Icon name="plus" size={12} />
                New user
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {state.status === 'loading' && state.users.length === 0 ? (
                <div className="flex items-center gap-2 px-2 py-3 text-[length:var(--app-text-11)] text-text-muted">
                  <Spinner size={12} />
                  Loading users…
                </div>
              ) : null}

              {state.status === 'error' && state.users.length === 0 ? (
                <div className="m-1 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-danger">
                  <p>{state.error}</p>
                  <button type="button" className="mt-2 underline" onClick={onRefresh} disabled={busy}>
                    Try again
                  </button>
                </div>
              ) : null}

              {state.users.map((user) => {
                const active = user.name === selectedName && !creating
                return (
                  <button
                    key={user.name}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedName(user.name)
                      setCreating(false)
                      setConfirmDrop(null)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left disabled:opacity-60 ${
                      active ? 'bg-accent-soft text-accent' : 'text-text-soft hover:bg-tint/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        active ? 'bg-accent/15 text-accent' : 'bg-tint/[0.04] text-text-muted'
                      }`}
                    >
                      <Icon name="users" size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[length:var(--app-text-11)]">
                        {user.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[length:var(--app-text-10)] text-text-faint">
                        {typeLabel(user.type)} · {user.roles.length} role
                        {user.roles.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    {user.canManage ? null : (
                      <Icon name="lock" size={11} className="shrink-0 text-text-faint" />
                    )}
                  </button>
                )
              })}

              {state.status === 'ready' && state.users.length === 0 ? (
                <p className="px-2 py-3 text-[length:var(--app-text-11)] text-text-faint">
                  No database users found.
                </p>
              ) : null}
            </div>

            <div className="border-t border-line px-3 py-2 text-[length:var(--app-text-10)] text-text-faint">
              {state.users.length} user{state.users.length === 1 ? '' : 's'}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            {creating ? (
              <form onSubmit={submitCreate} className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-line px-5 py-4">
                  <h3 className="text-[length:var(--app-text-13)] font-semibold text-text-strong">
                    New database user
                  </h3>
                  <p className="mt-1 text-[length:var(--app-text-11)] text-text-muted">
                    Map an existing server login to this database.
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                  {state.error ? (
                    <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-danger">
                      {state.error}
                    </div>
                  ) : null}

                  <label className="field-label block">Server login</label>
                  <Select
                    value={login}
                    options={loginOptions}
                    onChange={setLogin}
                    disabled={busy || loginOptions.length === 0}
                    icon="users"
                    placeholder="Select login"
                    emptyLabel="No unmapped logins"
                    panelClassName="w-full"
                    className="mt-1.5"
                  />
                  <p className="mt-2 text-[length:var(--app-text-10)] text-text-faint">
                    {selectedLogin
                      ? `${typeLabel(selectedLogin.type)} · the login itself is not changed.`
                      : 'Only enabled logins without a user in this database are listed.'}
                  </p>

                  <div className="mt-5">
                    <h4 className="text-[length:var(--app-text-12)] font-medium text-text-strong">
                      Initial roles
                    </h4>
                    <p className="mt-0.5 text-[length:var(--app-text-10)] text-text-faint">
                      Optional. Roles can be changed after the user is created.
                    </p>
                    <div className="mt-2.5 space-y-1.5">
                      {roleOptions.map((role) => (
                        <label
                          key={role.name}
                          className="flex items-start gap-2.5 rounded-md border border-line bg-panel px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                            checked={createRoles.includes(role.name)}
                            disabled={busy}
                            aria-label={`${role.name} initial role`}
                            onChange={() => toggleCreateRole(role.name)}
                          />
                          <span className="min-w-0">
                            <span className="block font-mono text-[length:var(--app-text-11)] text-text-strong">
                              {role.name}
                            </span>
                            <span className="mt-0.5 block text-[length:var(--app-text-10)] text-text-faint">
                              {role.hint}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => setCreating(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={busy || !login}>
                    {busy ? <Spinner size={12} /> : <Icon name="plus" size={12} />}
                    {busy ? 'Creating…' : 'Create user'}
                  </button>
                </div>
              </form>
            ) : selectedUser ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-line px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-mono text-[length:var(--app-text-13)] font-semibold text-text-strong">
                        {selectedUser.name}
                      </h3>
                      <p className="mt-1 text-[length:var(--app-text-11)] text-text-muted">
                        {typeLabel(selectedUser.type)}
                        {selectedUser.loginName ? ` · Login ${selectedUser.loginName}` : ''}
                        {selectedUser.defaultSchema
                          ? ` · Schema ${selectedUser.defaultSchema}`
                          : ''}
                      </p>
                    </div>
                    {selectedUser.canManage ? (
                      <button
                        type="button"
                        className="btn-ghost shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
                        onClick={() => setConfirmDrop(selectedUser)}
                        disabled={busy}
                      >
                        <Icon name="trash" size={12} />
                        Drop user
                      </button>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-1 text-[length:var(--app-text-10)] text-text-faint">
                        <Icon name="lock" size={10} />
                        {protectedLabel}
                      </span>
                    )}
                  </div>
                </div>

                {confirmDrop ? (
                  <div className="flex items-start gap-3 border-b border-danger/30 bg-danger/10 px-5 py-3">
                    <Icon name="alert-triangle" size={13} className="mt-0.5 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[length:var(--app-text-12)] font-medium text-danger">
                        Drop database user “{confirmDrop.name}”?
                      </p>
                      <p className="mt-0.5 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-text-muted">
                        The server login stays, but the user loses access to this database.
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="btn-soft"
                        onClick={() => setConfirmDrop(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={submitDrop}
                        disabled={busy}
                        aria-label={`Confirm drop ${confirmDrop.name}`}
                      >
                        {busy ? 'Dropping…' : 'Drop user'}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                  {state.error ? (
                    <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-danger">
                      {state.error}
                    </div>
                  ) : null}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[length:var(--app-text-12)] font-medium text-text-strong">
                        Database roles
                      </h4>
                      <p className="mt-0.5 text-[length:var(--app-text-10)] text-text-faint">
                        Fixed roles grant permissions across this database.
                      </p>
                    </div>
                    {rolesDirty ? (
                      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[length:var(--app-text-10)] text-warning">
                        Unsaved
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {roleOptions.map((role) => (
                      <label
                        key={role.name}
                        className={`flex items-start gap-2.5 rounded-md border border-line px-3 py-2 ${
                          selectedUser.canManage ? 'bg-panel' : 'bg-panel/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                          checked={draftRoles.includes(role.name)}
                          disabled={busy || !selectedUser.canManage || Boolean(confirmDrop)}
                          aria-label={`${role.name} role`}
                          onChange={() => toggleDraftRole(role.name)}
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-[length:var(--app-text-11)] text-text-strong">
                            {role.name}
                          </span>
                          <span className="mt-0.5 block text-[length:var(--app-text-10)] text-text-faint">
                            {role.hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                </div>

                {selectedUser.canManage ? (
                  <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                    <button
                      type="button"
                      className="btn-soft"
                      onClick={() => setDraftRoles(selectedUser.roles)}
                      disabled={busy || savingRoles || !rolesDirty || Boolean(confirmDrop)}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={submitRoles}
                      disabled={busy || savingRoles || !rolesDirty || Boolean(confirmDrop)}
                    >
                      {savingRoles ? <Spinner size={12} /> : null}
                      {savingRoles ? 'Saving…' : 'Save roles'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                <div>
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-tint/[0.04] text-text-muted">
                    <Icon name="users" size={18} />
                  </span>
                  <p className="mt-3 text-[length:var(--app-text-12)] text-text-soft">
                    Select a user to manage its roles.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
