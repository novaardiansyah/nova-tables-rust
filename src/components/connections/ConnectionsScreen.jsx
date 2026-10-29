import { useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import ContextMenu from '../common/ContextMenu.jsx'
import EnvironmentBadge from '../common/EnvironmentBadge.jsx'
import ExportConnectionsDialog from './ExportConnectionsDialog.jsx'
import Icon, { BrandMark, Spinner } from '../common/Icon.jsx'
import ImportConnectionsDialog from './ImportConnectionsDialog.jsx'
import PromptDialog from '../common/PromptDialog.jsx'
import { api } from '../../api.js'
import {
  flattenRows,
  folderSubtree,
  folderTree,
  resolveTarget,
} from './connectionTreeUtils.js'
import { ConnectionRow, FolderRow } from './ConnectionTreeRow.jsx'

function formatRelativeTime(dateString) {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function ConnectionsScreen({
  connections,
  folders,
  openIds,
  connectingId,
  appVersion,
  lastConnectedId,
  onOpen,
  onNewConnection,
  onEditConnection,
  onDeleteConnection,
  onCreateFolder,
  onRenameFolder,
  onDeleteSelection,
  onMoveConnection,
  onReorderTree,
  onReloadConnections,
  onNotify,
}) {
  const [openFolders, setOpenFolders] = useState(() => new Set())
  const [prompt, setPrompt] = useState(null)
  const [promptBusy, setPromptBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState(null)
  const [drag, setDrag] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [exportTarget, setExportTarget] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState(null)
  const [selectedConnectionIds, setSelectedConnectionIds] = useState(() => new Set())
  const [selectedFolderIds, setSelectedFolderIds] = useState(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState(null)
  const [bulkDelete, setBulkDelete] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [actionMoveMenu, setActionMoveMenu] = useState(null)
  const [viewTab, setViewTab] = useState('all')

  const effectiveLastConnectedId = useMemo(() => {
    if (lastConnectedId && connections.some((c) => c.id === lastConnectedId)) {
      return lastConnectedId
    }
    const withTimestamp = connections
      .filter((c) => c.lastConnectedAt)
      .sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt))
    return withTimestamp[0]?.id || null
  }, [connections, lastConnectedId])

  const lastConnection = useMemo(() => {
    if (!effectiveLastConnectedId) return null
    return connections.find((c) => c.id === effectiveLastConnectedId) || null
  }, [connections, effectiveLastConnectedId])

  const recentConnections = useMemo(() => {
    return connections
      .filter((c) => c.lastConnectedAt || c.id === effectiveLastConnectedId)
      .sort((a, b) => {
        if (a.id === effectiveLastConnectedId) return -1
        if (b.id === effectiveLastConnectedId) return 1
        const timeA = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0
        const timeB = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0
        return timeB - timeA
      })
  }, [connections, effectiveLastConnectedId])

  const flatFolders = useMemo(() => folderTree(folders), [folders])
  const connectionOrder = useMemo(() => connections.map((item) => item.id), [connections])
  const folderOrder = useMemo(() => folders.map((item) => item.id), [folders])
  const visibleRows = useMemo(
    () => flattenRows(connections, folders, openFolders),
    [connections, folders, openFolders],
  )
  const selectedCount = selectedConnectionIds.size + selectedFolderIds.size
  const selectedExportIds = useMemo(() => {
    const ids = new Set(selectedConnectionIds)
    if (selectedFolderIds.size > 0) {
      const folderIds = new Set()
      for (const id of selectedFolderIds) {
        for (const child of folderSubtree(folders, id)) folderIds.add(child)
      }
      for (const connection of connections) {
        if (connection.folderId && folderIds.has(connection.folderId)) ids.add(connection.id)
      }
    }
    return [...ids]
  }, [connections, folders, selectedConnectionIds, selectedFolderIds])
  const selectedSummary = [
    selectedConnectionIds.size > 0
      ? `${selectedConnectionIds.size} connection${selectedConnectionIds.size === 1 ? '' : 's'}`
      : null,
    selectedFolderIds.size > 0
      ? `${selectedFolderIds.size} folder${selectedFolderIds.size === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const toggleFolder = (id) => {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const allowedConnections = new Set(connections.map((item) => item.id))
    const allowedFolders = new Set(folders.map((item) => item.id))
    setSelectedConnectionIds((prev) => {
      const next = new Set([...prev].filter((id) => allowedConnections.has(id)))
      return next.size === prev.size ? prev : next
    })
    setSelectedFolderIds((prev) => {
      const next = new Set([...prev].filter((id) => allowedFolders.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [connections, folders])

  const isRowSelected = (kind, id) =>
    kind === 'connection' ? selectedConnectionIds.has(id) : selectedFolderIds.has(id)

  const clearSelection = () => {
    setSelectedConnectionIds(new Set())
    setSelectedFolderIds(new Set())
    setSelectionAnchor(null)
  }

  const selectOnly = (kind, id) => {
    setSelectedConnectionIds(new Set(kind === 'connection' ? [id] : []))
    setSelectedFolderIds(new Set(kind === 'folder' ? [id] : []))
    setSelectionAnchor({ kind, id })
  }

  const toggleSelection = (kind, id) => {
    if (kind === 'connection') {
      setSelectedConnectionIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedFolderIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    setSelectionAnchor({ kind, id })
  }

  const selectRange = (kind, id) => {
    const target = visibleRows.findIndex((row) => row.kind === kind && row.id === id)
    const anchor = selectionAnchor
      ? visibleRows.findIndex(
          (row) => row.kind === selectionAnchor.kind && row.id === selectionAnchor.id,
        )
      : -1
    if (target < 0 || anchor < 0) {
      selectOnly(kind, id)
      return
    }

    const [start, end] = anchor <= target ? [anchor, target] : [target, anchor]
    const nextConnections = new Set()
    const nextFolders = new Set()
    for (const row of visibleRows.slice(start, end + 1)) {
      if (row.kind === 'connection') nextConnections.add(row.id)
      else nextFolders.add(row.id)
    }
    setSelectedConnectionIds(nextConnections)
    setSelectedFolderIds(nextFolders)
  }

  const applyModifierClick = (event, kind, id) => {
    if (event.shiftKey) {
      selectRange(kind, id)
      return true
    }
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(kind, id)
      return true
    }
    return false
  }

  const handleSelectClick = (event, kind, id) => {
    event.stopPropagation()
    if (event.shiftKey) selectRange(kind, id)
    else toggleSelection(kind, id)
  }

  const openRowMenu = (event, kind, item) => {
    event.preventDefault()
    event.stopPropagation()
    if (!isRowSelected(kind, item.id)) selectOnly(kind, item.id)
    const bounds = event.currentTarget.getBoundingClientRect()
    const fromPointer = event.type === 'contextmenu'
    setMenu({
      x: fromPointer ? event.clientX : Math.min(bounds.left, window.innerWidth - 208),
      y: fromPointer ? event.clientY : bounds.bottom + 4,
      kind,
      item,
    })
  }

  const moveSelectionTo = (folderId) => {
    const ids = [...selectedConnectionIds]
    if (ids.length === 0) return
    setActionMoveMenu(null)
    const next = connectionOrder.filter((id) => !ids.includes(id))
    onReorderTree({
      connections: [...next, ...ids],
      folders: folderOrder,
      connectionFolders: Object.fromEntries(ids.map((id) => [id, folderId])),
      folderParents: {},
    })
  }

  const moveFolderTo = (folder, parentId) => {
    const next = folderOrder.filter((id) => id !== folder.id)
    onReorderTree({
      connections: connectionOrder,
      folders: [...next, folder.id],
      connectionFolders: {},
      folderParents: { [folder.id]: parentId },
    })
  }

  const moveTargets = (excludeFolderId = null) => {
    const blocked = excludeFolderId ? folderSubtree(folders, excludeFolderId) : new Set()
    return flatFolders.filter(({ folder }) => !blocked.has(folder.id))
  }

  const folderMoveItems = (onSelect, { excludeFolderId = null, skipFolderId = null } = {}) => [
    {
      id: 'move-root',
      label: 'Top level',
      onSelect: () => onSelect(null),
    },
    ...moveTargets(excludeFolderId)
      .filter(({ folder }) => folder.id !== skipFolderId)
      .map(({ folder, depth }) => ({
        id: `move-${folder.id}`,
        label: `${'— '.repeat(depth)}${folder.name}`,
        onSelect: () => onSelect(folder.id),
      })),
  ]

  const openCreatePrompt = (parentId = null) => {
    const parent = folders.find((folder) => folder.id === parentId)
    setPrompt({ mode: 'create', parentId, parentName: parent?.name ?? null })
  }

  const handleDragStart = (event, kind, id) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    const ids =
      kind === 'connection' && selectedConnectionIds.has(id)
        ? [...selectedConnectionIds]
        : [id]
    setDrag({ kind, id, ids })
  }

  const handleDragEnd = () => {
    setDrag(null)
    setDropTarget(null)
  }

  const applyDrop = (dragged, target) => {
    setDrag(null)
    setDropTarget(null)

    if (dragged.kind === 'connection') {
      const moveIds = dragged.ids ?? [dragged.id]
      if (target.kind === 'connection' && moveIds.includes(target.id)) return
      const next = connectionOrder.filter((id) => !moveIds.includes(id))
      let folderId = null
      let index = next.length

      if (target.kind === 'connection') {
        const targetIndex = next.indexOf(target.id)
        if (targetIndex < 0) return
        index = target.position === 'before' ? targetIndex : targetIndex + 1
        folderId = connections.find((item) => item.id === target.id)?.folderId ?? null
      } else if (target.kind === 'folder') {
        folderId = target.id
        setOpenFolders((prev) => new Set(prev).add(target.id))
      }

      next.splice(index, 0, ...moveIds)
      onReorderTree({
        connections: next,
        folders: folderOrder,
        connectionFolders: Object.fromEntries(moveIds.map((id) => [id, folderId])),
        folderParents: {},
      })
      return
    }

    const next = folderOrder.filter((id) => id !== dragged.id)
    let parentId = null
    let index = next.length

    if (target.kind === 'folder') {
      const targetFolder = folders.find((item) => item.id === target.id)
      if (!targetFolder) return
      if (target.position === 'inside') {
        parentId = target.id
        setOpenFolders((prev) => new Set(prev).add(target.id))
      } else {
        const targetIndex = next.indexOf(target.id)
        if (targetIndex < 0) return
        index = target.position === 'before' ? targetIndex : targetIndex + 1
        parentId = targetFolder.parentId ?? null
      }
    }

    next.splice(index, 0, dragged.id)
    onReorderTree({
      connections: connectionOrder,
      folders: next,
      connectionFolders: {},
      folderParents: { [dragged.id]: parentId },
    })
  }

  const handleRowDragOver = (event, kind, item) => {
    if (!drag) return
    event.stopPropagation()
    if (kind === 'connection' && (drag.kind !== 'connection' || drag.ids.includes(item.id))) return
    if (kind === 'folder' && drag.kind === 'folder' && drag.id === item.id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(resolveTarget(event, kind, item, drag))
  }

  const handleRowDrop = (event, kind, item) => {
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    applyDrop(drag, resolveTarget(event, kind, item, drag))
  }

  const handleRootDragOver = (event) => {
    if (!drag) return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget({ kind: 'root' })
  }

  const handleRootDrop = (event) => {
    if (!drag) return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    event.stopPropagation()
    applyDrop(drag, { kind: 'root' })
  }

  const handlePromptConfirm = async (value) => {
    setPromptBusy(true)
    try {
      if (prompt.mode === 'rename') await onRenameFolder(prompt.folder, value)
      else {
        await onCreateFolder(value, prompt.parentId)
        if (prompt.parentId) {
          setOpenFolders((prev) => new Set(prev).add(prompt.parentId))
        }
      }
      setPrompt(null)
    } finally {
      setPromptBusy(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDeleteSelection({ folderIds: [deleteTarget.id] })
      setDeleteTarget(null)
      clearSelection()
    } catch (error) {
      onNotify?.('error', error.message)
    } finally {
      setDeleting(false)
    }
  }

  const openBulkDelete = () => {
    setBulkDelete({
      connectionIds: [...selectedConnectionIds],
      folderIds: [...selectedFolderIds],
    })
  }

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDelete) return
    setBulkBusy(true)
    try {
      await onDeleteSelection(bulkDelete)
      setBulkDelete(null)
      clearSelection()
    } catch (error) {
      onNotify?.('error', error.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleOpenExport = (connectionIds = null) => {
    const ids =
      connectionIds ??
      (selectedConnectionIds.size > 0
        ? [...selectedConnectionIds]
        : connections.map((conn) => conn.id))
    setExportTarget(ids)
  }

  const handleExportConfirm = async (selectedIds, password) => {
    setExportBusy(true)
    try {
      const result = await api.exportConnections(selectedIds, password)
      if (result.saved) {
        setExportTarget(null)
        onNotify?.('success', `Exported ${result.count} connection(s) successfully.`)
      }
    } catch (error) {
      onNotify?.('error', error.message)
    } finally {
      setExportBusy(false)
    }
  }

  const handleStartImport = async () => {
    try {
      const file = await api.selectImportFile()
      if (file.canceled) return
      setImportFile(file)
      setImportError(null)
    } catch (error) {
      onNotify?.('error', error.message)
    }
  }

  const handleImportConfirm = async (password) => {
    if (!importFile?.content) return
    setImportBusy(true)
    setImportError(null)
    try {
      const result = await api.importConnections(importFile.content, password)
      setImportFile(null)
      await onReloadConnections?.()
      const foldersCount = result.importedFolderCount
      const suffix = foldersCount > 0 ? ` and ${foldersCount} folder(s)` : ''
      onNotify?.('success', `Imported ${result.importedCount} connection(s)${suffix} successfully.`)
    } catch (error) {
      setImportError(error.message)
    } finally {
      setImportBusy(false)
    }
  }

  const connectionMenuItems = (connection) => [
    { id: 'open', label: 'Open connection', onSelect: () => onOpen(connection) },
    { id: 'edit', label: 'Edit connection', onSelect: () => onEditConnection(connection) },
    {
      id: 'move',
      label: 'Move to folder',
      children: folderMoveItems((folderId) => onMoveConnection(connection, folderId), {
        skipFolderId: connection.folderId ?? null,
      }),
    },
    {
      id: 'export',
      label: 'Export connection',
      onSelect: () => handleOpenExport([connection.id]),
    },
    { id: 'delete', label: 'Delete connection', onSelect: () => onDeleteConnection(connection) },
  ]

  const folderMenuItems = (folder) => [
    {
      id: 'toggle',
      label: openFolders.has(folder.id) ? 'Collapse folder' : 'Expand folder',
      onSelect: () => toggleFolder(folder.id),
    },
    { id: 'new', label: 'New subfolder', onSelect: () => openCreatePrompt(folder.id) },
    {
      id: 'rename',
      label: 'Rename folder',
      onSelect: () => setPrompt({ mode: 'rename', folder }),
    },
    {
      id: 'move',
      label: 'Move folder',
      children: folderMoveItems((parentId) => moveFolderTo(folder, parentId), {
        excludeFolderId: folder.id,
        skipFolderId: folder.parentId ?? null,
      }),
    },
    {
      id: 'delete',
      label: 'Delete folder',
      onSelect: () => {
        selectOnly('folder', folder.id)
        setDeleteTarget(folder)
      },
    },
  ]

  const selectionMenuItems = () => [
    ...(selectedExportIds.length > 0
      ? [
          {
            id: 'bulk-export',
            label: `Export ${selectedExportIds.length} connection${
              selectedExportIds.length === 1 ? '' : 's'
            }`,
            onSelect: () => handleOpenExport(selectedExportIds),
          },
          {
            id: 'bulk-move',
            label: 'Move connections to folder',
            children: folderMoveItems(moveSelectionTo),
          },
        ]
      : []),
    { id: 'bulk-delete', label: 'Delete selected', onSelect: openBulkDelete },
    { id: 'bulk-clear', label: 'Clear selection', onSelect: clearSelection },
  ]

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
      if (prompt || exportTarget || importFile || deleteTarget || bulkDelete || menu) return

      if (event.key === 'Escape' && selectedCount > 0) {
        event.preventDefault()
        clearSelection()
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        if (visibleRows.length === 0) return
        event.preventDefault()
        setSelectedConnectionIds(
          new Set(visibleRows.filter((row) => row.kind === 'connection').map((row) => row.id)),
        )
        setSelectedFolderIds(
          new Set(visibleRows.filter((row) => row.kind === 'folder').map((row) => row.id)),
        )
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedCount > 0) {
        event.preventDefault()
        openBulkDelete()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  const renderConnectionItem = (connection, depth) => (
    <ConnectionRow
      key={connection.id}
      connection={connection}
      depth={depth}
      connectingId={connectingId}
      openIds={openIds}
      isLastConnected={connection.id === effectiveLastConnectedId}
      selectedConnectionIds={selectedConnectionIds}
      selectedCount={selectedCount}
      drag={drag}
      dropTarget={dropTarget}
      menu={menu}
      onOpen={onOpen}
      onOpenRowMenu={openRowMenu}
      onSelectClick={handleSelectClick}
      onModifierClick={applyModifierClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onRowDragOver={handleRowDragOver}
      onRowDrop={handleRowDrop}
    />
  )

  const renderFolderItem = (folder, depth) => (
    <FolderRow
      key={folder.id}
      folder={folder}
      depth={depth}
      folders={folders}
      connections={connections}
      openFolders={openFolders}
      selectedFolderIds={selectedFolderIds}
      selectedCount={selectedCount}
      drag={drag}
      dropTarget={dropTarget}
      menu={menu}
      onToggleFolder={toggleFolder}
      onOpenRowMenu={openRowMenu}
      onSelectClick={handleSelectClick}
      onModifierClick={applyModifierClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onRowDragOver={handleRowDragOver}
      onRowDrop={handleRowDrop}
      renderConnection={renderConnectionItem}
      renderFolder={renderFolderItem}
    />
  )

  const rootFolders = folders.filter((folder) => (folder.parentId ?? null) === null)
  const rootConnections = connections.filter((connection) => (connection.folderId ?? null) === null)
  const isEmpty = connections.length === 0 && folders.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-6">
        <BrandMark size={22} />
        <span className="text-[length:var(--app-text-13)] font-semibold tracking-tight text-text-strong">Nova Tables</span>
        <span className="rounded border border-line-strong bg-tint/[0.03] px-1.5 py-0.5 text-[length:var(--app-text-9)] font-semibold uppercase tracking-wider text-text-muted">
          MSSQL
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn-soft"
            onClick={handleStartImport}
            title="Import connections from encrypted JSON file"
          >
            <Icon name="upload" size={14} />
            Import
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => handleOpenExport(selectedCount > 0 ? selectedExportIds : null)}
            title={
              selectedCount > 0
                ? `Export ${selectedExportIds.length} connection(s)`
                : 'Export all connections to encrypted JSON file'
            }
          >
            <Icon name="download" size={14} />
            {selectedCount > 0 ? 'Export selected' : 'Export'}
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => openCreatePrompt(null)}
            title="Create a folder to group connections"
          >
            <Icon name="folder-plus" size={14} />
            New folder
          </button>
          <button type="button" className="btn-primary" onClick={onNewConnection}>
            <Icon name="plus" size={14} />
            New connection
          </button>
        </div>
      </header>

      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6"
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[length:var(--app-text-15)] font-semibold text-text-strong">Connections</h1>
              <p className="mt-0.5 text-[length:var(--app-text-11)] text-text-muted">
                {connections.length} saved · Click to open, drag handle to organize
              </p>
            </div>
            {!isEmpty ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewTab('all')}
                    className={`rounded-md px-2.5 py-1 text-[length:var(--app-text-11)] font-medium transition-colors ${
                      viewTab === 'all'
                        ? 'bg-panel text-text-strong shadow-sm'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    All ({connections.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('recent')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[length:var(--app-text-11)] font-medium transition-colors ${
                      viewTab === 'recent'
                        ? 'bg-panel text-text-strong shadow-sm'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Recent
                    {recentConnections.length > 0 ? (
                      <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[length:var(--app-text-9)] font-semibold text-accent">
                        {recentConnections.length}
                      </span>
                    ) : null}
                  </button>
                </div>

                {viewTab === 'all' && folders.length > 0 ? (
                  <div className="flex items-center gap-1 text-[length:var(--app-text-11)] text-text-faint">
                    <button
                      type="button"
                      onClick={() => setOpenFolders(new Set(folders.map((f) => f.id)))}
                      className="rounded px-1.5 py-0.5 hover:bg-panel hover:text-text"
                    >
                      Expand all
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setOpenFolders(new Set())}
                      className="rounded px-1.5 py-0.5 hover:bg-panel hover:text-text"
                    >
                      Collapse all
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tint/[0.04] text-text-faint">
                <Icon name="server" size={24} />
              </div>
              <p className="mt-3 text-[length:var(--app-text-13)] font-medium text-text">No connections yet</p>
              <p className="mt-1 max-w-sm text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+6px)] text-text-muted">
                Create your first Microsoft SQL Server connection to start querying databases.
              </p>
              <button type="button" className="btn-primary mt-4" onClick={onNewConnection}>
                <Icon name="plus" size={14} />
                New connection
              </button>
            </div>
          ) : viewTab === 'recent' ? (
            recentConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tint/[0.04] text-text-faint">
                  <Icon name="history" size={24} />
                </div>
                <p className="mt-3 text-[length:var(--app-text-13)] font-medium text-text">No recent connections</p>
                <p className="mt-1 max-w-sm text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+6px)] text-text-muted">
                  Connect to a Microsoft SQL Server database to see your session history here.
                </p>
                <button type="button" className="btn-soft mt-4" onClick={() => setViewTab('all')}>
                  View all connections
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-panel p-2">
                <div className="space-y-px">
                  {recentConnections.map((conn) => {
                    const isConnecting = connectingId === conn.id
                    const isOpen = openIds.includes(conn.id)
                    const isSelected = selectedConnectionIds.has(conn.id)
                    return (
                      <div
                        key={conn.id}
                        className={`group/row flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${
                          isSelected ? 'bg-accent/[0.08]' : 'hover:bg-tint/[0.04]'
                        }`}
                        onContextMenu={(event) => openRowMenu(event, 'connection', conn)}
                      >
                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={(event) => {
                            if (applyModifierClick(event, 'connection', conn.id)) return
                            onOpen(conn)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-70"
                          title={
                            isOpen
                              ? `Switch to ${conn.name}`
                              : `Connect to ${conn.name} (${conn.host}:${conn.port})`
                          }
                        >
                          {isConnecting ? (
                            <Spinner size={12} className="shrink-0 text-accent" />
                          ) : (
                            <span
                              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                                isOpen ? 'bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-line-strong'
                              }`}
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[length:var(--app-text-12)] font-medium text-text">
                                {conn.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <EnvironmentBadge environment={conn.environment} />
                                {isOpen ? (
                                  <span
                                    title="Session is open"
                                    className="flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] text-success"
                                  >
                                    <span className="h-1 w-1 rounded-full bg-current" />
                                    Open
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <span className="block truncate text-[length:var(--app-text-10)] leading-[calc(var(--app-text-12)+4px)] text-text-faint">
                              {conn.host}:{conn.port}
                              {conn.database ? ` · ${conn.database}` : ''}
                              {conn.lastConnectedAt ? ` · ${formatRelativeTime(conn.lastConnectedAt)}` : ''}
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="btn-soft h-7 shrink-0 px-2.5 text-[length:var(--app-text-11)]"
                          disabled={isConnecting}
                          onClick={() => onOpen(conn)}
                        >
                          {isConnecting ? (
                            <Spinner size={12} />
                          ) : (
                            <Icon name={isOpen ? 'chevron-right' : 'play'} size={12} />
                          )}
                          {isOpen ? 'Open' : 'Connect'}
                        </button>

                        <button
                          type="button"
                          className={`icon-btn h-6 w-6 shrink-0 transition-opacity ${
                            menu?.kind === 'connection' && menu.item.id === conn.id
                              ? 'opacity-100'
                              : 'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100'
                          }`}
                          title="Connection actions"
                          aria-label={`Actions for ${conn.name}`}
                          onClick={(event) => openRowMenu(event, 'connection', conn)}
                        >
                          <Icon name="more-horizontal" size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          ) : (
            <>
              {lastConnection ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5 transition-colors">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Icon name="history" size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] text-accent">
                          <span className="h-1 w-1 rounded-full bg-current" />
                          Recent connection
                        </span>
                        <EnvironmentBadge environment={lastConnection.environment} />
                        {lastConnection.lastConnectedAt ? (
                          <span className="text-[length:var(--app-text-10)] text-text-faint">
                            · {formatRelativeTime(lastConnection.lastConnectedAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[length:var(--app-text-13)] font-semibold text-text-strong">
                          {lastConnection.name}
                        </span>
                        <span className="truncate text-[length:var(--app-text-11)] text-text-muted">
                          {lastConnection.host}:{lastConnection.port}
                          {lastConnection.database ? ` · ${lastConnection.database}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={connectingId === lastConnection.id}
                    onClick={() => onOpen(lastConnection)}
                    title={
                      openIds.includes(lastConnection.id)
                        ? `Switch to ${lastConnection.name}`
                        : `Quick connect to ${lastConnection.name}`
                    }
                  >
                    {connectingId === lastConnection.id ? (
                      <Spinner size={13} />
                    ) : openIds.includes(lastConnection.id) ? (
                      <Icon name="chevron-right" size={13} />
                    ) : (
                      <Icon name="play" size={13} />
                    )}
                    {openIds.includes(lastConnection.id) ? 'Open session' : 'Quick Connect'}
                  </button>
                </div>
              ) : null}

              <div
                className={`rounded-xl border border-line bg-panel p-2 transition-colors ${
                  dropTarget?.kind === 'root' ? 'ring-2 ring-accent' : ''
                }`}
              >
                <div className="space-y-px">
                  {rootConnections.map((conn) => renderConnectionItem(conn, 0))}
                  {rootFolders.map((folder) => renderFolderItem(folder, 0))}
                </div>
              </div>
            </>
          )}
        </div>

        {selectedCount > 0 ? (
          <div className="animate-fade-in pointer-events-none sticky bottom-4 z-20 mt-auto flex justify-center pt-4">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line-strong bg-elevated px-3 py-2 shadow-2xl shadow-black/60">
              <span className="text-[length:var(--app-text-11)] font-medium text-text-strong">
                {selectedSummary} selected
              </span>
              <span className="h-3 w-px bg-line-strong" />

              {selectedExportIds.length > 0 ? (
                <button
                  type="button"
                  className="btn-soft h-7 px-2.5 text-[length:var(--app-text-11)]"
                  onClick={() => handleOpenExport(selectedExportIds)}
                  title={`Export ${selectedExportIds.length} connection(s)`}
                >
                  <Icon name="download" size={12} />
                  Export
                </button>
              ) : null}

              {selectedConnectionIds.size > 0 ? (
                <div className="relative">
                  <button
                    type="button"
                    className="btn-soft h-7 px-2.5 text-[length:var(--app-text-11)]"
                    onClick={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect()
                      setActionMoveMenu({ x: bounds.left, y: bounds.top - 8 })
                    }}
                    title="Move selected connections to a folder"
                  >
                    <Icon name="folder" size={12} />
                    Move
                  </button>
                  {actionMoveMenu ? (
                    <ContextMenu
                      x={actionMoveMenu.x}
                      y={actionMoveMenu.y}
                      items={folderMoveItems(moveSelectionTo)}
                      onClose={() => setActionMoveMenu(null)}
                    />
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="btn-danger h-7 px-2.5 text-[length:var(--app-text-11)]"
                onClick={openBulkDelete}
                title="Delete selected items"
              >
                <Icon name="trash" size={12} />
                Delete
              </button>

              <button
                type="button"
                className="btn-ghost h-7 px-2 text-[length:var(--app-text-11)]"
                onClick={clearSelection}
                title="Clear selection (Esc)"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-line px-6 text-[length:var(--app-text-10)] text-text-faint">
        <span>Microsoft SQL Server client</span>
        <span>v{appVersion}</span>
      </footer>

      {prompt ? (
        <PromptDialog
          open
          title={
            prompt.mode === 'rename'
              ? `Rename ${prompt.folder.name}`
              : prompt.parentName
                ? `New folder inside ${prompt.parentName}`
                : 'New folder'
          }
          label="Folder name"
          initialValue={prompt.mode === 'rename' ? prompt.folder.name : ''}
          placeholder="e.g. Production"
          confirmLabel={prompt.mode === 'rename' ? 'Rename' : 'Create'}
          busy={promptBusy}
          onConfirm={handlePromptConfirm}
          onCancel={() => setPrompt(null)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          open
          title={`Delete folder "${deleteTarget.name}"?`}
          message="Everything inside this folder will also be deleted: all subfolders, connections, their saved passwords and query history. This cannot be undone."
          confirmLabel="Delete folder and contents"
          danger
          busy={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {bulkDelete ? (
        <ConfirmDialog
          open
          title="Delete selected items?"
          message={
            bulkDelete.folderIds.length > 0
              ? `You are about to delete ${selectedSummary}. Folders will be deleted together with all their subfolders and connections. This cannot be undone.`
              : `You are about to delete ${selectedSummary}. Their saved queries and history will also be removed. This cannot be undone.`
          }
          confirmLabel="Delete selected"
          danger
          busy={bulkBusy}
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setBulkDelete(null)}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            selectedCount > 1
              ? selectionMenuItems()
              : menu.kind === 'connection'
                ? connectionMenuItems(menu.item)
                : folderMenuItems(menu.item)
          }
          onClose={() => setMenu(null)}
        />
      ) : null}

      {exportTarget ? (
        <ExportConnectionsDialog
          open
          connections={connections}
          folders={folders}
          selectedIds={exportTarget}
          busy={exportBusy}
          onClose={() => setExportTarget(null)}
          onCancel={() => setExportTarget(null)}
          onExport={handleExportConfirm}
          onConfirm={handleExportConfirm}
        />
      ) : null}

      {importFile ? (
        <ImportConnectionsDialog
          open
          fileName={importFile.fileName}
          busy={importBusy}
          error={importError}
          onClose={() => {
            setImportFile(null)
            setImportError(null)
          }}
          onCancel={() => {
            setImportFile(null)
            setImportError(null)
          }}
          onImport={handleImportConfirm}
          onConfirm={handleImportConfirm}
        />
      ) : null}
    </div>
  )
}
