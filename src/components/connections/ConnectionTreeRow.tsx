import React, { Fragment, DragEvent, MouseEvent } from 'react'
import EnvironmentBadge from '../common/EnvironmentBadge'
import Icon, { Spinner } from '../common/Icon'
import { DragHandle, DropLine, SelectBox } from './ConnectionTreeControls'

export interface ConnectionItem {
  id: string
  name: string
  host: string
  port: number
  username?: string | null
  password?: string | null
  database?: string | null
  databaseName?: string | null
  environment?: string | null
  folderId?: string | null
  lastConnectedAt?: string | null
  hasPassword?: boolean
  encrypt?: boolean
  trustServerCertificate?: boolean
  [key: string]: unknown
}

export interface FolderItem {
  id: string
  name: string
  parentId?: string | null
  [key: string]: unknown
}

export type DragKind = 'connection' | 'folder'

export interface DragState {
  kind: DragKind
  id?: string
  ids?: string[]
}

export interface DropTargetState {
  kind: DragKind
  id: string
  position: 'before' | 'after' | 'inside'
}

export interface RowMenuState {
  kind: DragKind
  item: { id: string; name?: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface ConnectionRowProps {
  connection: ConnectionItem
  depth: number
  connectingId?: string | null
  openIds: string[]
  isLastConnected?: boolean
  selectedConnectionIds: Set<string>
  selectedCount: number
  drag?: DragState | null
  dropTarget?: DropTargetState | null
  menu?: RowMenuState | null
  onOpen: (connection: ConnectionItem) => void
  onOpenRowMenu: (event: MouseEvent<HTMLButtonElement | HTMLDivElement>, kind: 'connection', item: ConnectionItem) => void
  onSelectClick: (event: MouseEvent<HTMLButtonElement>, kind: 'connection', id: string) => void
  onModifierClick: (event: MouseEvent<HTMLButtonElement>, kind: 'connection', id: string) => boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>, kind: 'connection', id: string) => void
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void
  onRowDragOver: (event: DragEvent<HTMLDivElement>, kind: 'connection', item: ConnectionItem) => void
  onRowDrop: (event: DragEvent<HTMLDivElement>, kind: 'connection', item: ConnectionItem) => void
}

export function ConnectionRow({
  connection,
  depth,
  connectingId,
  openIds,
  isLastConnected = false,
  selectedConnectionIds,
  selectedCount,
  drag,
  dropTarget,
  menu,
  onOpen,
  onOpenRowMenu,
  onSelectClick,
  onModifierClick,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDrop,
}: ConnectionRowProps) {
  const isConnecting = connectingId === connection.id
  const isOpen = openIds.includes(connection.id)
  const isSelected = selectedConnectionIds.has(connection.id)
  const isDragged = drag?.kind === 'connection' && (drag.ids?.includes(connection.id) || drag.id === connection.id)
  const isDropLine = (position: 'before' | 'after' | 'inside') =>
    dropTarget?.kind === 'connection' &&
    dropTarget.id === connection.id &&
    dropTarget.position === position

  return (
    <Fragment>
      {isDropLine('before') ? <DropLine depth={depth} /> : null}
      <div
        style={{ marginLeft: depth * 14 }}
        className={`group/row group/conn flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
          isSelected ? 'bg-accent/[0.08]' : 'hover:bg-tint/[0.04]'
        } ${isDragged ? 'opacity-40' : ''}`}
        onContextMenu={(event) => onOpenRowMenu(event, 'connection', connection)}
        onDragOver={(event) => onRowDragOver(event, 'connection', connection)}
        onDrop={(event) => onRowDrop(event, 'connection', connection)}
      >
        <SelectBox
          checked={isSelected}
          active={selectedCount > 0}
          label={isSelected ? `Deselect ${connection.name}` : `Select ${connection.name}`}
          onClick={(event) => onSelectClick(event, 'connection', connection.id)}
        />
        <DragHandle
          title="Drag to reorder or move into a folder"
          onDragStart={(event) => onDragStart(event, 'connection', connection.id)}
          onDragEnd={onDragEnd}
        />
        <button
          type="button"
          disabled={isConnecting}
          onClick={(event) => {
            if (onModifierClick(event, 'connection', connection.id)) return
            onOpen(connection)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-70"
          title={
            isOpen
              ? `Switch to ${connection.name}`
              : `Connect to ${connection.name} (${connection.host}:${connection.port})`
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
              <span className="truncate text-[length:var(--app-text-12)] text-text">{connection.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <EnvironmentBadge environment={connection.environment} />
                {isLastConnected ? (
                  <span
                    title="Last connected session"
                    className="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 py-px text-[length:var(--app-text-9)] font-medium leading-[calc(var(--app-text-9)+4px)] text-accent"
                  >
                    <span className="h-1 w-1 rounded-full bg-current" />
                    Recent
                  </span>
                ) : null}
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
              {connection.host}:{connection.port}
              {connection.database ? ` · ${connection.database}` : ''}
            </span>
          </span>
        </button>

        <button
          type="button"
          className={`icon-btn h-6 w-6 shrink-0 transition-opacity ${
            menu?.kind === 'connection' && menu.item.id === connection.id
              ? 'opacity-100'
              : 'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100'
          }`}
          title="Connection actions"
          aria-label={`Actions for ${connection.name}`}
          onClick={(event) => onOpenRowMenu(event, 'connection', connection)}
        >
          <Icon name="more-horizontal" size={13} />
        </button>
      </div>
      {isDropLine('after') ? <DropLine depth={depth} /> : null}
    </Fragment>
  )
}

export interface FolderRowProps {
  folder: FolderItem
  depth: number
  folders: FolderItem[]
  connections: ConnectionItem[]
  openFolders: Set<string>
  selectedFolderIds: Set<string>
  selectedCount: number
  drag?: DragState | null
  dropTarget?: DropTargetState | null
  menu?: RowMenuState | null
  onToggleFolder: (folderId: string) => void
  onOpenRowMenu: (event: MouseEvent<HTMLButtonElement | HTMLDivElement>, kind: 'folder', item: FolderItem) => void
  onSelectClick: (event: MouseEvent<HTMLButtonElement>, kind: 'folder', id: string) => void
  onModifierClick: (event: MouseEvent<HTMLButtonElement>, kind: 'folder', id: string) => boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>, kind: 'folder', id: string) => void
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void
  onRowDragOver: (event: DragEvent<HTMLDivElement>, kind: 'folder', item: FolderItem) => void
  onRowDrop: (event: DragEvent<HTMLDivElement>, kind: 'folder', item: FolderItem) => void
  renderConnection: (conn: ConnectionItem, depth: number) => React.ReactNode
  renderFolder: (folder: FolderItem, depth: number) => React.ReactNode
}

export function FolderRow({
  folder,
  depth,
  folders,
  connections,
  openFolders,
  selectedFolderIds,
  selectedCount,
  drag,
  dropTarget,
  menu,
  onToggleFolder,
  onOpenRowMenu,
  onSelectClick,
  onModifierClick,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDrop,
  renderConnection,
  renderFolder,
}: FolderRowProps) {
  const isOpen = openFolders.has(folder.id)
  const isSelected = selectedFolderIds.has(folder.id)
  const childFolders = folders.filter((item) => item.parentId === folder.id)
  const childConnections = connections.filter((item) => item.folderId === folder.id)
  const childCount = childFolders.length + childConnections.length
  const isDragged = drag?.kind === 'folder' && drag.id === folder.id
  const isDropLine = (position: 'before' | 'after' | 'inside') =>
    dropTarget?.kind === 'folder' &&
    dropTarget.id === folder.id &&
    dropTarget.position === position
  const isDropInside = isDropLine('inside')

  return (
    <Fragment>
      {isDropLine('before') ? <DropLine depth={depth} /> : null}
      <div
        style={{ marginLeft: depth * 14 }}
        className={`group/row group/folder flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
          isSelected ? 'bg-accent/[0.08]' : 'hover:bg-tint/[0.03]'
        } ${isDropInside ? 'bg-accent/10 ring-1 ring-accent/40' : ''} ${isDragged ? 'opacity-40' : ''}`}
        onContextMenu={(event) => onOpenRowMenu(event, 'folder', folder)}
        onDragOver={(event) => onRowDragOver(event, 'folder', folder)}
        onDrop={(event) => onRowDrop(event, 'folder', folder)}
      >
        <SelectBox
          checked={isSelected}
          active={selectedCount > 0}
          label={isSelected ? `Deselect ${folder.name}` : `Select ${folder.name}`}
          onClick={(event) => onSelectClick(event, 'folder', folder.id)}
        />
        <DragHandle
          title="Drag to reorder or move into a folder"
          onDragStart={(event) => onDragStart(event, 'folder', folder.id)}
          onDragEnd={onDragEnd}
        />
        <button
          type="button"
          onClick={(event) => {
            if (onModifierClick(event, 'folder', folder.id)) return
            onToggleFolder(folder.id)
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={isOpen ? 'Collapse folder' : 'Expand folder'}
        >
          <Icon
            name="chevron-right"
            size={11}
            className={`shrink-0 text-text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <Icon name="folder" size={13} className="shrink-0 text-warning/70" />
          <span className="truncate text-[length:var(--app-text-12)] font-medium text-text">{folder.name}</span>
          <span className="shrink-0 text-[length:var(--app-text-10)] tabular-nums text-text-faint">{childCount}</span>
        </button>

        <button
          type="button"
          className={`icon-btn h-6 w-6 shrink-0 transition-opacity ${
            menu?.kind === 'folder' && menu.item.id === folder.id
              ? 'opacity-100'
              : 'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100'
          }`}
          title="Folder actions"
          aria-label={`Actions for ${folder.name}`}
          onClick={(event) => onOpenRowMenu(event, 'folder', folder)}
        >
          <Icon name="more-horizontal" size={13} />
        </button>
      </div>

      {isOpen ? (
        <div className="space-y-px">
          {childConnections.map((conn) => renderConnection(conn, depth + 1))}
          {childFolders.map((child) => renderFolder(child, depth + 1))}
          {childCount === 0 ? (
            <p
              style={{ marginLeft: (depth + 1) * 14 }}
              className="px-2 py-1 text-[length:var(--app-text-11)] text-text-faint"
            >
              Empty folder
            </p>
          ) : null}
        </div>
      ) : null}
      {isDropLine('after') ? <DropLine depth={depth} /> : null}
    </Fragment>
  )
}
