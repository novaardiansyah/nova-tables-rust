import React, { useEffect, useRef, useState, FormEvent, ChangeEvent } from 'react'
import Icon, { Spinner } from '@/components/common/Icon'
import Select from '@/components/common/Select'
import { ENVIRONMENT_OPTIONS } from '@/environments'
import { ConnectionItem } from '@/components/connections/ConnectionTreeRow'

export interface ConnectionFormState {
  name: string
  host: string
  port: string
  username: string
  password: string
  database: string
  environment: string
  encrypt: boolean
  trustServerCertificate: boolean
  driverType: string
}

const DEFAULTS: ConnectionFormState = {
  name: '',
  host: 'localhost',
  port: '1433',
  username: 'sa',
  password: '',
  database: '',
  environment: '',
  encrypt: true,
  trustServerCertificate: true,
  driverType: 'sqlserver',
}

export type ConnectionDialogMode = 'new' | 'edit'

export interface ConnectionDialogConnection extends Partial<ConnectionItem> {
  hasPassword?: boolean
  encrypt?: boolean
  trustServerCertificate?: boolean
  driverType?: string
}

function buildInitial(connection?: ConnectionDialogConnection | null): ConnectionFormState {
  if (!connection) return { ...DEFAULTS }
  return {
    name: connection.name || '',
    host: connection.host || '',
    port: String(connection.port || 1433),
    username: connection.username || '',
    password: '',
    database:
      connection.databaseName !== undefined && connection.databaseName !== null
        ? connection.databaseName
        : connection.database || '',
    environment: connection.environment || '',
    encrypt: connection.encrypt !== false,
    trustServerCertificate: connection.trustServerCertificate !== false,
    driverType: connection.driverType || 'sqlserver',
  }
}

export interface ConnectionTestResult {
  serverName?: string
  productVersion?: string
  edition?: string
  elapsedMs?: number
  [key: string]: unknown
}

export interface ConnectionDialogProps {
  mode: ConnectionDialogMode
  connection?: ConnectionDialogConnection | null
  notice?: string | null
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown> | void
  onTest?: (payload: Record<string, unknown>) => Promise<ConnectionTestResult>
}

export default function ConnectionDialog({
  mode,
  connection,
  notice,
  onClose,
  onSubmit,
  onTest,
}: ConnectionDialogProps) {
  const isEdit = mode === 'edit' && Boolean(connection?.id)
  const [form, setForm] = useState<ConnectionFormState>(() => buildInitial(connection))
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  const update = (key: keyof typeof DEFAULTS) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
    setTestResult(null)
  }

  function validate() {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = 'Name is required'
    if (!form.host.trim()) errors.host = 'Host is required'
    if (!form.username.trim()) errors.username = 'Username is required'
    const port = Number(form.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Invalid port'
    return errors
  }

  function payload(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: form.name.trim(),
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username.trim(),
      database: form.database.trim(),
      databaseName: form.database.trim(),
      environment: form.environment,
      encrypt: form.encrypt,
      trustServerCertificate: form.trustServerCertificate,
      driverType: form.driverType,
    }
    if (isEdit && connection?.id) data.id = connection.id
    if (!isEdit || form.password !== '') data.password = form.password
    return data
  }

  async function handleTest() {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (!onTest) return

    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const result = await onTest(payload())
      const details = [result.serverName, result.productVersion ? `SQL Server ${result.productVersion}` : null, result.edition]
        .filter(Boolean)
        .join(' · ')
      setTestResult({
        ok: true,
        message: `${details} — connected in ${result.elapsedMs} ms`,
      })
    } catch (testError: any) {
      setTestResult({ ok: false, message: testError.message })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setError(null)
    try {
      await onSubmit(payload())
    } catch (submitError: any) {
      setError(submitError.message)
      if (submitError.fields) setFieldErrors(submitError.fields)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg animate-fade-in overflow-auto rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="server" size={16} />
          </span>
          <div className="flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              {isEdit
                ? 'Edit connection'
                : form.driverType === 'mysql'
                ? 'New MySQL connection'
                : 'New SQL Server connection'}
            </h2>
            <p className="text-[length:var(--app-text-11)] text-text-muted">
              {isEdit
                ? 'Update the connection details below.'
                : form.driverType === 'mysql'
                ? 'Connect to a MySQL or MariaDB instance.'
                : 'Connect to a Microsoft SQL Server instance.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" disabled={saving}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {notice ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-warning">
              <Icon name="info" size={13} className="mt-0.5 shrink-0 text-warning" />
              <span>{notice}</span>
            </div>
          ) : null}

          {/* Connection name full width */}
          <div>
            <label className="field-label" htmlFor="conn-name">
              Connection name
            </label>
            <input
              id="conn-name"
              className="field"
              value={form.name}
              onChange={update('name')}
              placeholder="Production database"
              autoFocus
            />
            <FieldError message={fieldErrors.name} />
          </div>

          {/* Environment and Driver side by side */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <span className="field-label">Environment</span>
              <Select
                value={form.environment}
                options={ENVIRONMENT_OPTIONS}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, environment: value }))
                  setTestResult(null)
                }}
                icon="server"
                placeholder="Select environment"
                emptyLabel="No environments"
                panelClassName="w-64"
              />
            </div>
            <div>
              <span className="field-label">Driver</span>
              <Select
                value={form.driverType}
                options={[
                  { value: 'sqlserver', label: 'SQL Server' },
                  { value: 'mysql', label: 'MySQL' },
                ]}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, driverType: value }))
                  setTestResult(null)
                }}
                icon="database"
                placeholder="Select driver"
                emptyLabel="No drivers"
                panelClassName="w-48"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label className="field-label" htmlFor="conn-host">
                Host
              </label>
              <input
                id="conn-host"
                className="field"
                value={form.host}
                onChange={update('host')}
                placeholder="localhost"
                spellCheck={false}
              />
              <FieldError message={fieldErrors.host} />
            </div>
            <div>
              <label className="field-label" htmlFor="conn-port">
                Port
              </label>
              <input
                id="conn-port"
                className="field"
                value={form.port}
                onChange={update('port')}
                placeholder="1433"
                inputMode="numeric"
              />
              <FieldError message={fieldErrors.port} />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="conn-database">
              Database <span className="normal-case text-text-faint">(optional)</span>
            </label>
            <input
              id="conn-database"
              className="field"
              value={form.database}
              onChange={update('database')}
              placeholder="Leave blank to browse all databases"
              spellCheck={false}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="conn-username">
                Username
              </label>
              <input
                id="conn-username"
                className="field"
                value={form.username}
                onChange={update('username')}
                placeholder="sa"
                spellCheck={false}
                autoComplete="off"
              />
              <FieldError message={fieldErrors.username} />
            </div>
            <div>
              <label className="field-label" htmlFor="conn-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="conn-password"
                  className="field pr-9"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder={isEdit && connection?.hasPassword ? 'Unchanged' : 'Password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="icon-btn absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
                </button>
              </div>
            </div>
          </div>

          {isEdit && connection?.hasPassword ? (
            <p className="-mt-2 text-[length:var(--app-text-11)] text-text-muted">
              Leave the password blank to keep the saved password.
            </p>
          ) : null}

          <div className="space-y-2 rounded-lg border border-line bg-base px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--app-text-12)] text-text">
              <input
                type="checkbox"
                checked={form.encrypt}
                onChange={update('encrypt')}
                className="h-3.5 w-3.5 accent-accent"
              />
              Encrypt connection (TLS)
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--app-text-12)] text-text">
              <input
                type="checkbox"
                checked={form.trustServerCertificate}
                onChange={update('trustServerCertificate')}
                className="h-3.5 w-3.5 accent-accent"
              />
              Trust server certificate
            </label>
          </div>

          <p className="text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+4px)] text-text-faint">
            Passwords are stored only in the local SQLite database and never leave your computer.
          </p>

          {testResult ? (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] ${
                testResult.ok
                  ? 'border-success/25 bg-success/10 text-success'
                  : 'border-danger/25 bg-danger/10 text-danger'
              }`}
            >
              <Icon
                name={testResult.ok ? 'check-circle' : 'alert-triangle'}
                size={13}
                className={`mt-0.5 shrink-0 ${testResult.ok ? 'text-success' : 'text-danger'}`}
              />
              <span className="break-words">{testResult.message}</span>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-danger">
              <Icon name="alert-triangle" size={13} className="mt-0.5 shrink-0 text-danger" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <button type="button" className="btn-ghost" onClick={handleTest} disabled={testing || saving}>
              {testing ? <Spinner size={13} /> : <Icon name="refresh" size={13} />}
              Test connection
            </button>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-soft" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || testing}>
                {saving ? <Spinner size={13} /> : <Icon name="check-circle" size={13} />}
                {isEdit ? 'Save changes' : 'Create connection'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-[length:var(--app-text-11)] text-danger">{message}</p>
}
