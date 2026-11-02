import React, { useEffect, useMemo, useState, FormEvent } from 'react'
import EnvironmentBadge from '@/components/common/EnvironmentBadge'
import Icon, { Spinner } from '@/components/common/Icon'
import { ConnectionModel, FolderModel } from '@/api'

export type ConfigTransferMode = 'export' | 'import'

export interface ConfigTransferExportData {
  includeSettings: boolean
  selectedConnectionIds: string[]
  password: string
}

export interface ConfigTransferImportData {
  includeSettings: boolean
  includeConnections: boolean
  password: string
}

export interface ConfigTransferDialogProps {
  open: boolean
  mode: ConfigTransferMode
  connections?: ConnectionModel[]
  folders?: FolderModel[]
  fileName?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onChooseFile?: () => void
  onExport?: (data: ConfigTransferExportData) => void
  onImport?: (data: ConfigTransferImportData) => void
  onSubmit?: (password: string) => void
}

export default function ConfigTransferDialog({
  open,
  mode,
  connections = [],
  folders = [],
  fileName = '',
  busy = false,
  error = null,
  onClose,
  onChooseFile,
  onExport,
  onImport,
  onSubmit,
}: ConfigTransferDialogProps) {
  const exporting = mode === 'export'
  const [step, setStep] = useState<'selection' | 'password'>('selection')

  // Selection state
  const [exportSettings, setExportSettings] = useState(true)
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<Set<string>>(() => new Set())
  const [importSettings, setImportSettings] = useState(true)
  const [importConnections, setImportConnections] = useState(true)

  // Password state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Reset dialog state when opened or mode changes
  useEffect(() => {
    if (!open) return
    setStep('selection')
    setExportSettings(true)
    setSelectedConnectionIds(new Set(connections.map((c) => c.id || '').filter(Boolean)))
    setImportSettings(true)
    setImportConnections(true)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setLocalError(null)
  }, [open, mode, connections])

  // Escape key handler
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy) onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, onClose])

  // Group connections by folder
  const { folderTreeData, rootConnections } = useMemo(() => {
    const rootConns: ConnectionModel[] = []
    const byFolder = new Map<string, ConnectionModel[]>()

    for (const conn of connections) {
      if (conn.folderId) {
        if (!byFolder.has(conn.folderId)) byFolder.set(conn.folderId, [])
        byFolder.get(conn.folderId)!.push(conn)
      } else {
        rootConns.push(conn)
      }
    }

    const folderMap = new Map<string, FolderModel>(folders.map((f) => [f.id, f]))
    const topFolders = folders.filter((f) => !f.parentId)

    // Build hierarchy for each top-level folder
    const buildFolderNode = (folder: FolderModel): any => {
      const children = folders.filter((f) => f.parentId === folder.id).map(buildFolderNode)
      const folderConns = byFolder.get(folder.id) || []
      return {
        folder,
        children,
        connections: folderConns,
      }
    }

    const tree = topFolders.map(buildFolderNode)
    return { folderTreeData: tree, rootConnections: rootConns }
  }, [connections, folders])

  if (!open) return null

  // Selection actions
  const handleSelectAll = () => {
    if (exporting) {
      setExportSettings(true)
      setSelectedConnectionIds(new Set(connections.map((c) => c.id || '').filter(Boolean)))
    } else {
      setImportSettings(true)
      setImportConnections(true)
    }
  }

  const handleDeselectAll = () => {
    if (exporting) {
      setExportSettings(false)
      setSelectedConnectionIds(new Set())
    } else {
      setImportSettings(false)
      setImportConnections(false)
    }
  }

  const toggleConnection = (id: string) => {
    setSelectedConnectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleFolderConnections = (folderConns: ConnectionModel[]) => {
    const ids = folderConns.map((c) => c.id || '').filter(Boolean)
    const allSelected = ids.every((id) => selectedConnectionIds.has(id))

    setSelectedConnectionIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Navigation handlers
  const handleContinueToPassword = () => {
    setLocalError(null)
    if (exporting) {
      if (!exportSettings && selectedConnectionIds.size === 0) {
        setLocalError('Please select at least one configuration or connection to export.')
        return
      }
    } else {
      if (!fileName) {
        setLocalError('Please choose a configuration file to import.')
        return
      }
      if (!importSettings && !importConnections) {
        setLocalError('Please select at least one item to import.')
        return
      }
    }
    setStep('password')
  }

  const handleBackToSelection = () => {
    if (busy) return
    setLocalError(null)
    setStep('selection')
  }

  const handleSubmitPassword = (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)

    if (!password) {
      setLocalError(
        exporting
          ? 'Encryption password is required.'
          : 'Decryption password is required.',
      )
      return
    }

    if (exporting && password !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    if (exporting) {
      if (onExport) {
        onExport({
          includeSettings: exportSettings,
          selectedConnectionIds: Array.from(selectedConnectionIds),
          password,
        })
      } else if (onSubmit) {
        onSubmit(password)
      }
    } else {
      if (onImport) {
        onImport({
          includeSettings: importSettings,
          includeConnections: importConnections,
          password,
        })
      } else if (onSubmit) {
        onSubmit(password)
      }
    }
  }

  const totalExportItems = (exportSettings ? 1 : 0) + selectedConnectionIds.size
  const totalImportItems = (importSettings ? 1 : 0) + (importConnections ? 1 : 0)
  const displayError = localError || error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      {step === 'selection' ? (
        /* Dialog 1 — Configuration Selection */
        <div
          onClick={(event) => event.stopPropagation()}
          className="animate-fade-in flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
        >
          {/* Header */}
          <div className="flex items-start gap-3 p-5 border-b border-line">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name={exporting ? 'download' : 'upload'} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
                {exporting ? 'Export Configuration' : 'Import Configuration'}
              </h2>
              <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
                {exporting
                  ? 'Select the configurations and connections you want to include in the encrypted export.'
                  : 'Choose a configuration file and select which items to restore into your workspace.'}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn h-6 w-6"
              onClick={onClose}
              disabled={busy}
              title="Close"
            >
              <Icon name="x" size={13} />
            </button>
          </div>

          {/* Import File Chooser */}
          {!exporting ? (
            <div className="border-b border-line bg-panel/30 p-4">
              <span className="field-label block mb-2">Configuration file</span>
              {fileName ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2.5">
                  <Icon name="code" size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[length:var(--app-text-12)] text-text-strong">
                    {fileName}
                  </span>
                  <button
                    type="button"
                    className="btn-soft h-6 shrink-0 px-2 text-[length:var(--app-text-11)]"
                    onClick={onChooseFile}
                    disabled={busy}
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-soft w-full flex items-center justify-center gap-2 border-dashed py-3 text-text hover:border-accent"
                  onClick={onChooseFile}
                  disabled={busy}
                >
                  <Icon name="upload" size={14} className="text-accent" />
                  <span>Choose encrypted configuration file (.nova-tables)</span>
                </button>
              )}
            </div>
          ) : null}

          {/* Controls Bar: Select All / Deselect All */}
          <div className="flex items-center justify-between border-b border-line bg-panel/20 px-5 py-2 text-[length:var(--app-text-11)]">
            <span className="font-medium text-text-muted">
              {exporting
                ? `${totalExportItems} item${totalExportItems === 1 ? '' : 's'} selected`
                : `${totalImportItems} category item${totalImportItems === 1 ? '' : 's'} selected`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost h-6 px-2 text-[length:var(--app-text-11)]"
                onClick={handleSelectAll}
              >
                Select all
              </button>
              <span className="text-line-strong">|</span>
              <button
                type="button"
                className="btn-ghost h-6 px-2 text-[length:var(--app-text-11)]"
                onClick={handleDeselectAll}
              >
                Deselect all
              </button>
            </div>
          </div>

          {/* Scrollable Selection List */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Category 1: Preferences */}
            <div>
              <span className="field-label block mb-2">Preferences & Settings</span>
              <div
                className="flex items-start gap-3 rounded-lg border border-line bg-panel/30 p-3 hover:bg-tint/[0.03] cursor-pointer transition-colors"
                onClick={() => {
                  if (exporting) setExportSettings(!exportSettings)
                  else setImportSettings(!importSettings)
                }}
              >
                <input
                  type="checkbox"
                  id="pref-toggle"
                  className="mt-0.5 h-4 w-4 rounded border-line-strong accent-accent cursor-pointer"
                  checked={exporting ? exportSettings : importSettings}
                  onChange={(e) => {
                    e.stopPropagation()
                    if (exporting) setExportSettings(e.target.checked)
                    else setImportSettings(e.target.checked)
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-[length:var(--app-text-12)] text-text">
                    <Icon name="settings" size={13} className="text-accent" />
                    <span>App & Editor Preferences</span>
                  </div>
                  <p className="mt-0.5 text-[length:var(--app-text-11)] text-text-muted">
                    {exporting
                      ? 'Color theme, application & editor fonts, timezones, and query word wrap options.'
                      : 'Restore workspace color theme, typography, timezones, and editor preferences.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Category 2: Connections */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="field-label mb-0">Database Connections</span>
                {exporting ? (
                  <span className="text-[length:var(--app-text-10)] text-text-muted">
                    {selectedConnectionIds.size} of {connections.length} selected
                  </span>
                ) : null}
              </div>

              {exporting ? (
                /* Export Connections List */
                connections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-4 text-center text-[length:var(--app-text-12)] text-text-muted">
                    No connections saved in workspace.
                  </div>
                ) : (
                  <div className="rounded-lg border border-line bg-panel/20 divide-y divide-line overflow-hidden">
                    {/* Folders with nested connections */}
                    {folderTreeData.map((node: any) => {
                      const allFolderConns: ConnectionModel[] = [
                        ...node.connections,
                        ...node.children.flatMap((c: any) => c.connections),
                      ]
                      const folderIds = allFolderConns.map((c) => c.id || '').filter(Boolean)
                      const isAllFolderSelected =
                        folderIds.length > 0 &&
                        folderIds.every((id) => selectedConnectionIds.has(id))

                      return (
                        <div key={node.folder.id} className="bg-panel/40">
                          {/* Folder Header Row */}
                          <div
                            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-tint/[0.04] transition-colors"
                            onClick={() => toggleFolderConnections(allFolderConns)}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-line-strong accent-accent cursor-pointer"
                              checked={isAllFolderSelected}
                              onChange={(e) => {
                                e.stopPropagation()
                                toggleFolderConnections(allFolderConns)
                              }}
                            />
                            <Icon name="folder" size={13} className="text-warning/80 shrink-0" />
                            <span className="font-semibold text-[length:var(--app-text-12)] text-text truncate">
                              {node.folder.name}
                            </span>
                            <span className="text-[length:var(--app-text-10)] text-text-faint ml-auto">
                              {allFolderConns.length} connection{allFolderConns.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          {/* Connections inside Folder */}
                          <div className="pl-6 divide-y divide-line/40 bg-surface/30">
                            {node.connections.map((conn: ConnectionModel) => {
                              const isSelected = selectedConnectionIds.has(conn.id || '')
                              return (
                                <div
                                  key={conn.id}
                                  className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-tint/[0.04] transition-colors"
                                  onClick={() => toggleConnection(conn.id || '')}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-line-strong accent-accent cursor-pointer"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      toggleConnection(conn.id || '')
                                    }}
                                  />
                                  <Icon name="server" size={12} className="text-text-faint shrink-0" />
                                  <span className="min-w-0 flex-1 truncate text-[length:var(--app-text-11)] font-medium text-text">
                                    {conn.name}
                                  </span>
                                  <span className="truncate text-[length:var(--app-text-10)] text-text-muted">
                                    {conn.host}:{conn.port}
                                  </span>
                                  <EnvironmentBadge environment={conn.environment} />
                                  {conn.driverType === 'sqlserver' ? (
                                    <span className="rounded bg-success/10 px-1 py-0.5 text-[length:var(--app-text-9)] font-medium text-success">
                                      SQL Server
                                    </span>
                                  ) : conn.driverType === 'mysql' ? (
                                    <span className="rounded bg-warning/10 px-1 py-0.5 text-[length:var(--app-text-9)] font-medium text-warning">
                                      MySQL
                                    </span>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    {/* Root connections (without folder) */}
                    {rootConnections.length > 0 ? (
                      <div>
                        {folderTreeData.length > 0 ? (
                          <div className="bg-panel/20 px-3 py-1 text-[length:var(--app-text-10)] font-medium uppercase text-text-faint">
                            Direct Connections
                          </div>
                        ) : null}
                        <div className="divide-y divide-line/40">
                          {rootConnections.map((conn: ConnectionModel) => {
                            const isSelected = selectedConnectionIds.has(conn.id || '')
                            return (
                              <div
                                key={conn.id}
                                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-tint/[0.04] transition-colors"
                                onClick={() => toggleConnection(conn.id || '')}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-line-strong accent-accent cursor-pointer"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    toggleConnection(conn.id || '')
                                  }}
                                />
                                <Icon name="server" size={13} className="text-text-faint shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-[length:var(--app-text-12)] font-medium text-text">
                                  {conn.name}
                                </span>
                                <span className="truncate text-[length:var(--app-text-11)] text-text-muted">
                                  {conn.host}:{conn.port}
                                </span>
                                <EnvironmentBadge environment={conn.environment} />
                                {conn.driverType === 'sqlserver' ? (
                                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-[length:var(--app-text-9)] font-medium text-success">
                                    SQL Server
                                  </span>
                                ) : conn.driverType === 'mysql' ? (
                                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[length:var(--app-text-9)] font-medium text-warning">
                                    MySQL
                                  </span>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                /* Import Connections Category Item */
                <div
                  className="flex items-start gap-3 rounded-lg border border-line bg-panel/30 p-3 hover:bg-tint/[0.03] cursor-pointer transition-colors"
                  onClick={() => setImportConnections(!importConnections)}
                >
                  <input
                    type="checkbox"
                    id="import-conn-toggle"
                    className="mt-0.5 h-4 w-4 rounded border-line-strong accent-accent cursor-pointer"
                    checked={importConnections}
                    onChange={(e) => {
                      e.stopPropagation()
                      setImportConnections(e.target.checked)
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium text-[length:var(--app-text-12)] text-text">
                      <Icon name="server" size={13} className="text-accent" />
                      <span>Saved Connections & Folders</span>
                    </div>
                    <p className="mt-0.5 text-[length:var(--app-text-11)] text-text-muted">
                      Import all database connections and restore their folder structures from the
                      file. Existing connections are preserved.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {displayError ? (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-[length:var(--app-text-11)] text-danger">
                <Icon name="alert-circle" size={14} className="shrink-0" />
                <span>{displayError}</span>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5 bg-panel/30">
            <button type="button" className="btn-soft" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleContinueToPassword}
              disabled={
                exporting
                  ? !exportSettings && selectedConnectionIds.size === 0
                  : !fileName || (!importSettings && !importConnections)
              }
            >
              <span>Continue</span>
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>
      ) : (
        /* Dialog 2 — Encryption Password */
        <form
          onSubmit={handleSubmitPassword}
          onClick={(event) => event.stopPropagation()}
          className="animate-fade-in w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
        >
          {/* Header */}
          <div className="flex items-start gap-3 p-5 border-b border-line">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name={exporting ? 'download' : 'upload'} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">
                {exporting ? 'Encryption Password' : 'Decryption Password'}
              </h2>
              <p className="mt-1 text-[length:var(--app-text-12)] leading-[calc(var(--app-text-12)+8px)] text-text-soft">
                {exporting
                  ? 'Set a password to secure and encrypt your configuration file.'
                  : 'Enter the password used to encrypt this file to decrypt and apply items.'}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn h-6 w-6"
              onClick={onClose}
              disabled={busy}
              title="Close"
            >
              <Icon name="x" size={13} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Summary of Selected Items */}
            <div className="rounded-lg border border-line bg-panel/40 p-3 space-y-1.5 text-[length:var(--app-text-11)]">
              <span className="font-semibold text-text-strong block mb-1">
                {exporting ? 'Selected for Export' : 'Selected for Import'}
              </span>
              {!exporting && fileName ? (
                <div className="flex items-center gap-1.5 text-text-muted truncate">
                  <span className="font-medium text-text-faint">File:</span>
                  <span className="font-mono text-text truncate">{fileName}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-text-muted">
                <span>Preferences:</span>
                <span
                  className={
                    (exporting ? exportSettings : importSettings)
                      ? 'text-success font-medium'
                      : 'text-text-faint'
                  }
                >
                  {(exporting ? exportSettings : importSettings) ? 'Included' : 'Excluded'}
                </span>
              </div>
              <div className="flex items-center justify-between text-text-muted">
                <span>Connections:</span>
                <span
                  className={
                    (exporting ? selectedConnectionIds.size > 0 : importConnections)
                      ? 'text-success font-medium'
                      : 'text-text-faint'
                  }
                >
                  {exporting
                    ? `${selectedConnectionIds.size} connection(s)`
                    : importConnections
                      ? 'Included'
                      : 'Excluded'}
                </span>
              </div>
            </div>

            {/* Password input */}
            <div>
              <label className="field-label block" htmlFor="transfer-password">
                {exporting ? 'Encryption password' : 'Decryption password'}
              </label>
              <div className="relative">
                <input
                  id="transfer-password"
                  className="field pr-9"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    exporting
                      ? 'Password to encrypt file'
                      : 'Enter file password'
                  }
                  autoComplete={exporting ? 'new-password' : 'current-password'}
                  autoFocus
                  disabled={busy}
                />
                <button
                  type="button"
                  className="icon-btn absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
                </button>
              </div>
            </div>

            {/* Confirm Password (export only) */}
            {exporting ? (
              <div>
                <label className="field-label block" htmlFor="transfer-confirm-password">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="transfer-confirm-password"
                    className="field pr-9"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password to confirm"
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </div>
              </div>
            ) : null}

            {/* Error display */}
            {displayError ? (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-[length:var(--app-text-11)] text-danger">
                <Icon name="alert-circle" size={14} className="shrink-0" />
                <span>{displayError}</span>
              </div>
            ) : null}
          </div>

          {/* Footer with Back, Cancel, Submit */}
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5 bg-panel/30">
            <button
              type="button"
              className="btn-soft flex items-center gap-1.5"
              onClick={handleBackToSelection}
              disabled={busy}
            >
              <Icon name="chevron-left" size={13} />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-soft" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || !password || (exporting && !confirmPassword)}
              >
                {busy ? (
                  <>
                    <Spinner size={13} />
                    <span>{exporting ? 'Exporting…' : 'Importing…'}</span>
                  </>
                ) : (
                  <>
                    <Icon name={exporting ? 'download' : 'upload'} size={13} />
                    <span>{exporting ? 'Export' : 'Import'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
