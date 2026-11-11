import React, { useEffect, useMemo, useState, DragEvent, MouseEvent } from 'react'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import ContextMenu, { ContextMenuItem } from '@/components/common/ContextMenu'
import EnvironmentBadge from '@/components/common/EnvironmentBadge'
import Icon, { BrandMark, Spinner } from '@/components/common/Icon'
import PromptDialog from '@/components/common/PromptDialog'
import { api, AuthUser } from '@/api'
import {
  ConnectionTestResult,
  formatConnectionSuccess,
  formatConnectionError,
} from '@/components/connections/connectionTestUtils'
import {
  flattenRows,
  folderSubtree,
  folderTree,
  resolveTarget,
} from '@/components/connections/connectionTreeUtils'
import {
  ConnectionRow,
  FolderRow,
  ConnectionItem,
  FolderItem,
  DragKind,
  DragState,
  DropTargetState,
} from '@/components/connections/ConnectionTreeRow'
import ConnectionsSkeleton from './ConnectionsSkeleton'

function formatRelativeTime(dateString?: string | null) {
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

type PromptState =
  | { mode: 'create'; parentId: string | null; parentName: string | null }
  | { mode: 'rename'; folder: FolderItem }
  | null

interface ScreenMenuState {
  x: number
  y: number
  kind: DragKind
  item: any
  [key: string]: unknown
}

export interface ConnectionsScreenProps {
  connections: ConnectionItem[]
  folders: FolderItem[]
  openIds: string[]
  connectingId?: string | null
  appVersion?: string
  lastConnectedId?: string | null
  onOpen: (connection: ConnectionItem) => void
  onNewConnection: () => void
  onNewConnectionInFolder?: (folderId: string) => void
  onEditConnection: (connection: ConnectionItem) => void
  onDeleteConnection: (connection: ConnectionItem) => void
  onDuplicateConnection: (connection: ConnectionItem) => void
  onCreateFolder: (name: string, parentId?: string | null) => Promise<unknown> | void
  onRenameFolder: (folder: FolderItem, name: string) => Promise<unknown> | void
  onDeleteSelection: (selection: { connectionIds?: string[]; folderIds?: string[] }) => Promise<unknown> | void
  onMoveConnection: (connection: ConnectionItem, folderId: string | null) => void
  onReorderTree: (order: {
    connections: string[]
    folders: string[]
    connectionFolders: Record<string, string | null>
    folderParents: Record<string, string | null>
  }) => void
  onReloadConnections?: () => Promise<unknown> | void
  onNotify?: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  onTestConnection?: (connection: ConnectionItem) => Promise<unknown> | void
  currentUser?: AuthUser | null
  onLogout?: () => void
  loading?: boolean
}

export default function ConnectionsScreen({
  connections,
  folders,
  openIds,
  connectingId,
  appVersion,
  currentUser = null,
  onLogout,
  lastConnectedId,
  loading = false,
  onOpen,
  onNewConnection,
  onNewConnectionInFolder,
  onEditConnection,
  onDeleteConnection,
  onDuplicateConnection,
  onCreateFolder,
  onRenameFolder,
  onDeleteSelection,
  onMoveConnection,
  onReorderTree,
  onReloadConnections,
  onNotify,
  onTestConnection,
}: ConnectionsScreenProps) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set())
  const [prompt, setPrompt] = useState<PromptState>(null)
  const [promptBusy, setPromptBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FolderItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState<ScreenMenuState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTargetState | { kind: 'root' } | null>(null)
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<Set<string>>(() => new Set())
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<{ kind: DragKind; id: string } | null>(null)
  const [bulkDelete, setBulkDelete] = useState<{ connectionIds: string[]; folderIds: string[] } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [actionMoveMenu, setActionMoveMenu] = useState<{ x: number; y: number } | null>(null)
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null)

  const effectiveLastConnectedId = useMemo(() => {
    const marked = connections.find((c) => c.isRecent === true)
    if (marked) return marked.id
    if (lastConnectedId && connections.some((c) => c.id === lastConnectedId)) {
      return lastConnectedId
    }
    return null
  }, [connections, lastConnectedId])

  const lastConnection = useMemo(() => {
    if (!effectiveLastConnectedId) return null
    return connections.find((c) => c.id === effectiveLastConnectedId) || null
  }, [connections, effectiveLastConnectedId])

  const flatFolders = useMemo(() => folderTree(folders), [folders])
  const connectionOrder = useMemo(() => connections.map((item) => item.id), [connections])
  const folderOrder = useMemo(() => folders.map((item) => item.id), [folders])
  const treeConnections = useMemo(() => {
    const folderIds = new Set(folders.map((item) => item.id))
    return connections.map((connection) => {
      const folderId = connection.folderId ?? null
      if (!folderId || folderIds.has(folderId)) return connection
      return { ...connection, folderId: null }
    })
  }, [connections, folders])
  const visibleRows = useMemo(
    () => flattenRows(treeConnections, folders, openFolders),
    [treeConnections, folders, openFolders],
  )
  const selectedCount = selectedConnectionIds.size + selectedFolderIds.size
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

  const toggleFolder = (id: string) => {
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

  const isRowSelected = (kind: DragKind, id: string) =>
    kind === 'connection' ? selectedConnectionIds.has(id) : selectedFolderIds.has(id)

  const clearSelection = () => {
    setSelectedConnectionIds(new Set())
    setSelectedFolderIds(new Set())
    setSelectionAnchor(null)
  }

  const selectOnly = (kind: DragKind, id: string) => {
    setSelectedConnectionIds(new Set(kind === 'connection' ? [id] : []))
    setSelectedFolderIds(new Set(kind === 'folder' ? [id] : []))
    setSelectionAnchor({ kind, id })
  }

  const toggleSelection = (kind: DragKind, id: string) => {
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

  const selectRange = (kind: DragKind, id: string) => {
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
    const nextConnections = new Set<string>()
    const nextFolders = new Set<string>()
    for (const row of visibleRows.slice(start, end + 1)) {
      if (row.kind === 'connection') nextConnections.add(row.id)
      else nextFolders.add(row.id)
    }
    setSelectedConnectionIds(nextConnections)
    setSelectedFolderIds(nextFolders)
  }

  const applyModifierClick = (
    event: MouseEvent<HTMLButtonElement>,
    kind: DragKind,
    id: string,
  ): boolean => {
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

  const handleSelectClick = (
    event: MouseEvent<HTMLButtonElement>,
    kind: DragKind,
    id: string,
  ) => {
    event.stopPropagation()
    if (event.shiftKey) selectRange(kind, id)
    else toggleSelection(kind, id)
  }

  const openRowMenu = (
    event: MouseEvent<HTMLButtonElement | HTMLDivElement>,
    kind: DragKind,
    item: any,
  ) => {
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

  const moveSelectionTo = (folderId: string | null) => {
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

  const moveFolderTo = (folder: FolderItem, parentId: string | null) => {
    const next = folderOrder.filter((id) => id !== folder.id)
    onReorderTree({
      connections: connectionOrder,
      folders: [...next, folder.id],
      connectionFolders: {},
      folderParents: { [folder.id]: parentId },
    })
  }

  const moveTargets = (excludeFolderId: string | null = null) => {
    const blocked = excludeFolderId ? folderSubtree(folders, excludeFolderId) : new Set<string>()
    return flatFolders.filter(({ folder }) => !blocked.has(folder.id))
  }

  const folderMoveItems = (
    onSelect: (folderId: string | null) => void,
    { excludeFolderId = null, skipFolderId = null }: { excludeFolderId?: string | null; skipFolderId?: string | null } = {},
  ): ContextMenuItem[] => [
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

  const openCreatePrompt = (parentId: string | null = null) => {
    const parent = folders.find((folder) => folder.id === parentId)
    setPrompt({ mode: 'create', parentId, parentName: parent?.name ?? null })
  }

  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    kind: DragKind,
    id: string,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    const ids =
      kind === 'connection' && selectedConnectionIds.has(id)
        ? [...selectedConnectionIds]
        : [id]

    const handle = (event.currentTarget.classList.contains('icon-btn')
      ? event.currentTarget
      : event.currentTarget.querySelector('button[title*="Drag"], .icon-btn')) as HTMLElement | null

    if (handle) {
      event.dataTransfer.setDragImage(handle, 12, 12)
    } else {
      const icon = document.createElement('div')
      icon.style.width = '24px'
      icon.style.height = '24px'
      icon.style.display = 'flex'
      icon.style.alignItems = 'center'
      icon.style.justifyContent = 'center'
      icon.style.position = 'fixed'
      icon.style.top = '-9999px'
      icon.style.left = '-9999px'
      icon.style.borderRadius = '4px'
      icon.style.backgroundColor = 'rgba(22, 28, 38, 0.95)'
      icon.style.color = '#94a3b8'
      icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>`
      document.body.appendChild(icon)
      event.dataTransfer.setDragImage(icon, 12, 12)
      requestAnimationFrame(() => icon.remove())
    }

    setDrag({ kind, id, ids })
  }

  const handleDragEnd = () => {
    setDrag(null)
    setDropTarget(null)
  }

  const applyDrop = (dragged: DragState, target: any) => {
    setDrag(null)
    setDropTarget(null)

    if (dragged.kind === 'connection') {
      const moveIds = dragged.ids ?? (dragged.id ? [dragged.id] : [])
      if (target.kind === 'connection' && moveIds.includes(target.id)) return
      const next = connectionOrder.filter((id) => !moveIds.includes(id))
      let folderId: string | null = null
      let index = next.length

      if (target.kind === 'connection') {
        const targetIndex = next.indexOf(target.id)
        if (targetIndex < 0) return
        index = target.position === 'before' ? targetIndex : targetIndex + 1
        folderId = treeConnections.find((item) => item.id === target.id)?.folderId ?? null
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

    if (!dragged.id) return
    const next = folderOrder.filter((id) => id !== dragged.id)
    let parentId: string | null = null
    let index = next.length

    if (target.kind === 'folder') {
      const targetFolder = folders.find((item) => item.id === target.id)
      if (!targetFolder) return
      const blocked = folderSubtree(folders, dragged.id)
      if (blocked.has(target.id)) return
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

  const handleRowDragOver = (
    event: DragEvent<HTMLDivElement>,
    kind: DragKind,
    item: any,
  ) => {
    if (!drag) return
    event.stopPropagation()
    if (kind === 'connection' && (drag.kind !== 'connection' || drag.ids?.includes(item.id))) return
    if (kind === 'folder' && drag.kind === 'folder' && drag.id) {
      if (drag.id === item.id) return
      if (folderSubtree(folders, drag.id).has(item.id)) return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(resolveTarget(event as any, kind, item, drag as any) as any)
  }

  const handleRowDrop = (
    event: DragEvent<HTMLDivElement>,
    kind: DragKind,
    item: any,
  ) => {
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    applyDrop(drag, resolveTarget(event as any, kind, item, drag as any))
  }

  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget({ kind: 'root' })
  }

  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!drag) return
    event.preventDefault()
    event.stopPropagation()
    applyDrop(drag, { kind: 'root' })
  }

  const handlePromptConfirm = async (value: string) => {
    if (!prompt) return
    setPromptBusy(true)
    try {
      if (prompt.mode === 'rename') await onRenameFolder(prompt.folder, value)
      else {
        await onCreateFolder(value, prompt.parentId)
        if (prompt.parentId) {
          setOpenFolders((prev) => new Set(prev).add(prompt.parentId!))
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
    } catch (error: any) {
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
    } catch (error: any) {
      onNotify?.('error', error.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleTestConnection = async (connection: ConnectionItem) => {
    if (testingConnectionId) return
    setTestingConnectionId(connection.id)
    try {
      const result = onTestConnection
        ? await onTestConnection(connection)
        : await api.testConnection(connection)
      const message = formatConnectionSuccess(result as ConnectionTestResult, connection.name)
      onNotify?.('success', message)
    } catch (testError: any) {
      const message = formatConnectionError(testError, connection.name)
      onNotify?.('error', message)
    } finally {
      setTestingConnectionId(null)
    }
  }

  const connectionMenuItems = (connection: ConnectionItem): ContextMenuItem[] => [
    { id: 'delete', label: 'Delete Connection', onSelect: () => onDeleteConnection(connection) },
    { id: 'edit', label: 'Edit Connection', onSelect: () => onEditConnection(connection) },
    {
      id: 'move',
      label: 'Move To Folder',
      children: folderMoveItems((folderId) => onMoveConnection(connection, folderId), {
        skipFolderId: connection.folderId ?? null,
      }),
    },
    { id: 'open', label: 'Open Connection', onSelect: () => onOpen(connection) },
    { id: 'replicate', label: 'Replicate Connection', onSelect: () => onDuplicateConnection(connection) },
    {
      id: 'test',
      label: testingConnectionId === connection.id ? 'Testing Connection…' : 'Test Connection',
      onSelect: () => handleTestConnection(connection),
    },
  ]

  const folderMenuItems = (folder: FolderItem): ContextMenuItem[] => [
    {
      id: 'toggle',
      label: openFolders.has(folder.id) ? 'Collapse folder' : 'Expand folder',
      onSelect: () => toggleFolder(folder.id),
    },
    {
      id: 'new',
      label: 'New subfolder',
      onSelect: () => openCreatePrompt(folder.id),
    },
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
    {
      id: 'new-connection',
      label: 'New connection in folder',
      onSelect: () => onNewConnectionInFolder?.(folder.id),
    },
  ]

  const selectionMenuItems = (): ContextMenuItem[] => [
    ...(selectedConnectionIds.size > 0
      ? [
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
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable) return
      if (prompt || deleteTarget || bulkDelete || menu) return

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

  const renderConnectionItem = (connection: ConnectionItem, depth: number) => (
    <ConnectionRow
      key={connection.id}
      connection={connection}
      depth={depth}
      connectingId={connectingId || testingConnectionId}
      openIds={openIds}
      isLastConnected={connection.id === effectiveLastConnectedId}
      selectedConnectionIds={selectedConnectionIds}
      selectedCount={selectedCount}
      drag={drag}
      dropTarget={dropTarget as DropTargetState}
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

  const renderFolderItem = (folder: FolderItem, depth: number) => (
    <FolderRow
      key={folder.id}
      folder={folder}
      depth={depth}
      folders={folders}
      connections={treeConnections}
      openFolders={openFolders}
      selectedFolderIds={selectedFolderIds}
      selectedCount={selectedCount}
      drag={drag}
      dropTarget={dropTarget as DropTargetState}
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
  const rootConnections = treeConnections.filter((connection) => (connection.folderId ?? null) === null)
  const isEmpty = connections.length === 0 && folders.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-6">
        <BrandMark size={22} />
        <span className="text-[length:var(--app-text-13)] font-semibold tracking-tight text-text-strong">Nova Tables</span>

        <div className="ml-auto flex items-center gap-2">
          {currentUser ? (
            <div className="mr-2 flex items-center gap-2 border-r border-line pr-3">
              <span className="text-[length:var(--app-text-11)] text-text-muted">
                Signed in as <strong className="text-text-strong">{currentUser.name || currentUser.email || currentUser.username}</strong>
              </span>
              {onLogout ? (
                <button
                  type="button"
                  className="icon-btn hover:text-danger"
                  onClick={onLogout}
                  title="Sign out"
                >
                  <Icon name="power" size={14} />
                </button>
              ) : null}
            </div>
          ) : loading ? (
            <div className="mr-2 flex items-center gap-2 border-r border-line pr-3">
              <div className="skeleton-shimmer-subtle h-3.5 w-32 rounded" />
            </div>
          ) : null}
          <button
            type="button"
            className="btn-soft"
            disabled={loading}
            onClick={() => openCreatePrompt(null)}
            title="Create a folder to group connections"
          >
            <Icon name="folder-plus" size={14} />
            New folder
          </button>
          <button type="button" className="btn-primary" disabled={loading} onClick={onNewConnection}>
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
          {loading ? (
            <ConnectionsSkeleton />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[length:var(--app-text-15)] font-semibold text-text-strong">Connections</h1>
              <p className="mt-0.5 text-[length:var(--app-text-11)] text-text-muted">
                {connections.length} saved · Click to open, drag handle to organize
              </p>
            </div>
            {!isEmpty ? (
              <div className="flex items-center gap-3">
                {folders.length > 0 ? (
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
                        {lastConnection.driverType === 'sqlserver' ? (
                          <span
                            title={lastConnection.driverType}
                            className="flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] text-success"
                          >
                            <span className="h-1 w-1 rounded-full bg-current" />
                            {lastConnection.driverType}
                          </span>
                        ) : lastConnection.driverType === 'mysql' ? (
                          <span
                            title={lastConnection.driverType}
                            className="flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] text-warning"
                          >
                            <span className="h-1 w-1 rounded-full bg-current" />
                            {lastConnection.driverType}
                          </span>
                        ) : null}
                        {lastConnection.lastConnectedAt ? (
                          <span className="text-[length:var(--app-text-10)] text-text-faint">
                            · {formatRelativeTime(String(lastConnection.lastConnectedAt))}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[length:var(--app-text-12)] font-medium text-text">
                          {lastConnection.name}
                        </span>
                        <span className="truncate text-[length:var(--app-text-11)] text-text-muted">
                          {lastConnection.host}:{lastConnection.port}
                          {lastConnection.lastDatabaseUsed || lastConnection.database || lastConnection.databaseName
                            ? ` · ${lastConnection.lastDatabaseUsed || lastConnection.database || lastConnection.databaseName}`
                            : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={connectingId === lastConnection.id || testingConnectionId === lastConnection.id}
                    onClick={() => onOpen(lastConnection)}
                    title={
                      openIds.includes(lastConnection.id)
                        ? `Switch to ${lastConnection.name}`
                        : `Quick connect to ${lastConnection.name}`
                    }
                  >
                    {connectingId === lastConnection.id || testingConnectionId === lastConnection.id ? (
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
        <a
          href="https://novaardiansyah.id"
          onClick={(e) => {
            e.preventDefault()
            void api.openExternal('https://novaardiansyah.id')
          }}
          className="transition-colors hover:text-text hover:underline"
        >
          by Nova Ardiansyah
        </a>
        {appVersion ? (
          <a
            href="https://nova-tables.novaardiansyah.id"
            onClick={(e) => {
              e.preventDefault()
              void api.openExternal('https://nova-tables.novaardiansyah.id')
            }}
            className="transition-colors hover:text-text hover:underline"
          >
            v{appVersion}
          </a>
        ) : null}
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
    </div>
  )
}
