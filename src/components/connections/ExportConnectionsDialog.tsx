import React, { useEffect, useMemo, useState, FormEvent } from 'react'
import EnvironmentBadge from '@/components/common/EnvironmentBadge'
import Icon from '@/components/common/Icon'
import { ConnectionItem, FolderItem } from '@/components/connections/ConnectionTreeRow'

function byName(left: { name?: string | null }, right: { name?: string | null }): number {
  return String(left.name ?? '').localeCompare(String(right.name ?? ''))
}

function includedFolders(connections: ConnectionItem[], folders: FolderItem[]): Set<string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const included = new Set<string>()
  for (const connection of connections) {
    let current = connection.folderId ? byId.get(connection.folderId) : null
    while (current && !included.has(current.id)) {
      included.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : null
    }
  }
  return included
}

interface PreviewConnectionProps {
  connection: ConnectionItem
  depth: number
}

function PreviewConnection({ connection, depth }: PreviewConnectionProps) {
  return (
    <div
      style={{ paddingLeft: depth * 14 + 20 }}
      className="flex items-center gap-2 rounded px-2 py-1 text-[length:var(--app-text-11)] text-text-soft"
    >
      <Icon name="server" size={11} className="shrink-0 text-text-faint" />
      <span className="truncate">{connection.name}</span>
      <EnvironmentBadge environment={connection.environment} />
    </div>
  )
}

export interface ExportConnectionsDialogProps {
  open: boolean
  connections?: ConnectionItem[]
  folders?: FolderItem[]
  selectedIds?: string[]
  busy?: boolean
  onClose?: () => void
  onCancel?: () => void
  onExport?: (ids: string[], password: string) => void
  onConfirm?: (ids: string[], password: string) => void
}

export default function ExportConnectionsDialog({
  open,
  connections = [],
  folders = [],
  selectedIds = [],
  busy = false,
  onClose,
  onCancel,
  onExport,
  onConfirm,
}: ExportConnectionsDialogProps) {
  const handleClose = onClose || onCancel || (() => {})
  const handleExport = onExport || onConfirm || (() => {})
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  const targets = useMemo(() => {
    const ids = new Set(selectedIds)
    return connections.filter((connection) => ids.has(connection.id))
  }, [connections, selectedIds])

  const included = useMemo(() => includedFolders(targets, folders), [targets, folders])

  const preview = useMemo(() => {
    const grouped = new Map<string | null, ConnectionItem[]>()
    for (const connection of targets) {
      const key = connection.folderId ?? null
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(connection)
    }
    const visibleFolders = folders.filter((folder) => included.has(folder.id))
    return { grouped, visibleFolders }
  }, [targets, folders, included])

  if (!open) return null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (targets.length === 0) {
      setError('Select at least one connection to export.')
      return
    }
    if (!password) {
      setError('Password is required to encrypt the export.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    handleExport(targets.map((connection) => connection.id), password)
  }

  const renderFolder = (folder: FolderItem, depth: number): React.ReactNode => {
    const childFolders = preview.visibleFolders
      .filter((item) => item.parentId === folder.id)
      .sort(byName)
    const childConnections = preview.grouped.get(folder.id) ?? []

    return (
      <div key={folder.id}>
        <div
          style={{ paddingLeft: depth * 14 + 4 }}
          className="flex items-center gap-1.5 px-2 py-1 text-[length:var(--app-text-11)] font-medium text-text"
        >
          <Icon name="folder" size={11} className="shrink-0 text-warning/70" />
          <span className="truncate">{folder.name}</span>
        </div>
        {childConnections.map((connection) => (
          <PreviewConnection key={connection.id} connection={connection} depth={depth + 1} />
        ))}
        {childFolders.map((child) => renderFolder(child, depth + 1))}
      </div>
    )
  }

  const rootFolders = preview.visibleFolders
    .filter((folder) => (folder.parentId ?? null) === null)
    .sort(byName)
  const rootConnections = preview.grouped.get(null) ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) handleClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="download" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
              Export connections
            </h2>
            <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
              {targets.length} connection{targets.length === 1 ? '' : 's'} ·{' '}
              {included.size} folder{included.size === 1 ? '' : 's'} will be encrypted with your
              password. Change the selection on the connections screen.
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={handleClose} disabled={busy}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-5 py-4 space-y-4">
          <div>
            <span className="mb-2 block text-[length:var(--app-text-11)] font-medium text-text-muted">
              Preview
            </span>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line bg-panel/50 p-1">
              {targets.length === 0 ? (
                <p className="px-2 py-3 text-[length:var(--app-text-11)] text-text-faint">
                  No connection selected.
                </p>
              ) : (
                <>
                  {rootFolders.map((folder) => renderFolder(folder, 0))}
                  {rootConnections.map((connection) => (
                    <PreviewConnection key={connection.id} connection={connection} depth={0} />
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="field-label block" htmlFor="export-password">
                Encryption password
              </label>
              <div className="relative">
                <input
                  id="export-password"
                  className="field pr-9"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password to encrypt file"
                  autoComplete="new-password"
                  autoFocus
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

            <div>
              <label className="field-label block" htmlFor="export-confirm-password">
                Confirm password
              </label>
              <input
                id="export-confirm-password"
                className="field"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error ? (
            <p className="text-[length:var(--app-text-11)] text-danger">{error}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button type="button" className="btn-soft" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={targets.length === 0 || !password || busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </form>
    </div>
  )
}
