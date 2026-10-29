import React, { useCallback, useEffect, useRef, useState } from 'react'
import ContextMenu, { ContextMenuItem } from '@/components/common/ContextMenu'
import Icon, { BrandMark, Spinner } from '@/components/common/Icon'

export const SIDEBAR_DEFAULT_WIDTH = 272
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 560

export interface SidebarTable {
  schema: string
  name: string
  [key: string]: unknown
}

export interface SidebarModule {
  schema: string
  name: string
  type?: 'function' | 'procedure' | string
  [key: string]: unknown
}

export interface SidebarSessionItem {
  connectionId: string
  connection: {
    id: string
    name: string
    host: string
    port: number
    [key: string]: unknown
  }
  activeDatabase?: string | null
  databases: Array<{ name: string; [key: string]: unknown }>
  tables: {
    status: 'idle' | 'loading' | 'ready' | 'error' | string
    tables: SidebarTable[]
    error?: string | null
  }
  modules: {
    status: 'idle' | 'loading' | 'ready' | 'error' | string
    modules: SidebarModule[]
    error?: string | null
  }
}

export interface SidebarProps {
  sessions: SidebarSessionItem[]
  activeConnectionId?: string | null
  appVersion?: string
  pinnedTables: string[]
  onActivateSession: (connectionId: string) => void
  onCloseSession: (connectionId: string) => void
  onBrowseTable: (table: SidebarTable) => void
  onCopyObjectName: (object: { schema: string; name: string }) => void
  onScriptTable: (table: SidebarTable) => void
  onRefreshDatabases: (connectionId: string) => void
  onOpenStructure: (table: SidebarTable) => void
  onOpenModule: (module: SidebarModule) => void
  onCopyModuleDefinition: (module: SidebarModule) => void
  onNewFunction: () => void
  onNewTable: (table: SidebarTable) => void
  onRenameTable: (table: SidebarTable) => void
  onCloneTable: (table: SidebarTable) => void
  onTruncateTable: (table: SidebarTable) => void
  onDropTable: (table: SidebarTable) => void
  onTogglePin: (table: SidebarTable) => void
  onOpenConnections: () => void
  selectedTable?: string | null
  onSelectTable: (key: string) => void
  selectedModule?: string | null
  onSelectModule: (key: string) => void
  width?: number
  onWidthChange: (width: number) => void
  collapsed?: boolean
  onToggleCollapsed: (collapsed: boolean) => void
}

type MenuState =
  | { x: number; y: number; kind: 'table'; table: SidebarTable }
  | { x: number; y: number; kind: 'module'; module: SidebarModule }
  | null

export default function Sidebar({
  sessions,
  activeConnectionId,
  appVersion,
  pinnedTables,
  onActivateSession,
  onCloseSession,
  onBrowseTable,
  onCopyObjectName,
  onScriptTable,
  onRefreshDatabases,
  onOpenStructure,
  onOpenModule,
  onCopyModuleDefinition,
  onNewFunction,
  onNewTable,
  onRenameTable,
  onCloneTable,
  onTruncateTable,
  onDropTable,
  onTogglePin,
  onOpenConnections,
  selectedTable,
  onSelectTable,
  selectedModule,
  onSelectModule,
  width = SIDEBAR_DEFAULT_WIDTH,
  onWidthChange,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const [filter, setFilter] = useState('')
  const [hoverOpen, setHoverOpen] = useState(false)
  const hoverOpenRef = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const railRef = useRef<HTMLElement | null>(null)

  const showOverlay = useCallback(() => {
    if (hoverOpenRef.current) return
    hoverOpenRef.current = true
    setHoverOpen(true)
  }, [])

  const hideOverlay = useCallback(() => {
    if (!hoverOpenRef.current) return
    hoverOpenRef.current = false
    setHoverOpen(false)
    setMenu(null)
  }, [])

  useEffect(() => {
    if (!collapsed) return undefined

    const handlePointerMove = (event: MouseEvent) => {
      const rect = railRef.current?.getBoundingClientRect()
      if (!rect) return
      const withinRow = event.clientY >= rect.top && event.clientY <= rect.bottom
      const overRail = withinRow && event.clientX >= rect.left && event.clientX <= rect.right
      const overPanel = withinRow && event.clientX >= rect.left && event.clientX <= rect.left + width

      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
      if (hoverOpenRef.current) {
        if (overPanel) return
        closeTimer.current = window.setTimeout(hideOverlay, 120)
        return
      }
      if (overRail) showOverlay()
    }

    window.addEventListener('mousemove', handlePointerMove)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [collapsed, hideOverlay, showOverlay, width])

  useEffect(() => {
    if (!collapsed) hideOverlay()
  }, [collapsed, hideOverlay])

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()

      const startX = event.clientX
      const startWidth = width
      const move = (moveEvent: PointerEvent) => {
        const next = Math.min(
          Math.max(startWidth + (moveEvent.clientX - startX), SIDEBAR_MIN_WIDTH),
          SIDEBAR_MAX_WIDTH,
        )
        onWidthChange(next)
      }
      const stop = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop)
    },
    [onWidthChange, width],
  )

  useEffect(() => {
    setFilter('')
  }, [activeConnectionId])

  const filterText = filter.trim().toLowerCase()

  const matchesFilter = (schema: string, name: string) =>
    filterText === '' || `${schema}.${name}`.toLowerCase().includes(filterText)

  const handleTableContextMenu = (event: React.MouseEvent, table: SidebarTable) => {
    event.preventDefault()
    onSelectTable(`${table.schema}.${table.name}`)
    setMenu({ x: event.clientX, y: event.clientY, kind: 'table', table })
  }

  const handleModuleContextMenu = (event: React.MouseEvent, module: SidebarModule) => {
    event.preventDefault()
    onSelectModule(`${module.schema}.${module.name}`)
    setMenu({ x: event.clientX, y: event.clientY, kind: 'module', module })
  }

  const pinned = new Set(pinnedTables)

  const renderTable = (table: SidebarTable) => {
    const key = `${table.schema}.${table.name}`
    return (
      <div
        key={key}
        onDoubleClick={() => onBrowseTable(table)}
        onContextMenu={(event) => handleTableContextMenu(event, table)}
        className="group/table flex items-center gap-1.5 rounded px-2 py-[3px] text-[length:var(--app-text-12)] text-text hover:bg-tint/[0.04]"
      >
        <Icon name="table" size={11} className="shrink-0 text-text-faint" />
        <button
          type="button"
          onClick={() => onSelectTable(key)}
          className={`flex min-w-0 flex-1 items-center truncate text-left ${
            selectedTable === key ? 'text-accent' : ''
          }`}
          title={`${table.schema}.${table.name}`}
        >
          {table.schema !== 'dbo' ? <span className="text-text-faint">{table.schema}.</span> : null}
          <span className="truncate">{table.name}</span>
        </button>
        <button
          type="button"
          className={`icon-btn h-5 w-5 shrink-0 ${
            pinned.has(key) ? 'text-accent' : 'opacity-0 group-hover/table:opacity-100'
          }`}
          title={pinned.has(key) ? 'Unpin from top' : 'Pin to top'}
          onClick={() => onTogglePin(table)}
        >
          <Icon name="pin" size={10} />
        </button>
      </div>
    )
  }

  const renderModule = (module: SidebarModule) => {
    const key = `${module.schema}.${module.name}`
    return (
      <div
        key={key}
        onDoubleClick={() => onOpenModule(module)}
        onContextMenu={(event) => handleModuleContextMenu(event, module)}
        className="group/module flex items-center gap-1.5 rounded px-2 py-[3px] text-[length:var(--app-text-12)] text-text hover:bg-tint/[0.04]"
      >
        <Icon
          name={module.type === 'function' ? 'function' : 'procedure'}
          size={11}
          className="shrink-0 text-text-faint"
        />
        <button
          type="button"
          onClick={() => onSelectModule(key)}
          className={`flex min-w-0 flex-1 items-center truncate text-left ${
            selectedModule === key ? 'text-accent' : ''
          }`}
          title={`${module.schema}.${module.name}`}
        >
          {module.schema !== 'dbo' ? <span className="text-text-faint">{module.schema}.</span> : null}
          <span className="truncate">{module.name}</span>
        </button>
        <span className="shrink-0 text-[length:var(--app-text-9)] uppercase tracking-wider text-text-faint">
          {module.type === 'function' ? 'fn' : 'sp'}
        </span>
      </div>
    )
  }

  const orderedTablesFor = (tables: SidebarTable[]) =>
    tables
      .map((table, index) => ({ table, index }))
      .sort((left, right) => {
        const leftRank = pinned.has(`${left.table.schema}.${left.table.name}`) ? 0 : 1
        const rightRank = pinned.has(`${right.table.schema}.${right.table.name}`) ? 0 : 1
        return leftRank - rightRank || left.index - right.index
      })
      .map((entry) => entry.table)

  const renderGroup = (item: SidebarSessionItem, group: 'tables' | 'modules') => {
    const key = `${item.connectionId}:${group}`
    const isOpen = !collapsedGroups[key] || filterText !== ''
    const state = group === 'tables' ? item.tables : item.modules
    const items = (group === 'tables' ? (state as any).tables : (state as any).modules) || []
    const visible = items.filter((entry: SidebarTable | SidebarModule) => matchesFilter(entry.schema, entry.name))
    const count = state.status === 'ready' ? (filterText === '' ? items.length : visible.length) : null

    return (
      <div key={group}>
        <button
          type="button"
          onClick={() => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
          className="tree-row"
          title={isOpen ? 'Collapse' : 'Expand'}
        >
          <Icon
            name="chevron-right"
            size={11}
            className={`shrink-0 text-text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <Icon
            name={group === 'tables' ? 'table' : 'code'}
            size={12}
            className="shrink-0 text-text-muted"
          />
          <span className="truncate">{group === 'tables' ? 'Tables' : 'Procedures & functions'}</span>
          {count !== null ? (
            <span className="ml-auto tabular-nums text-[length:var(--app-text-10)] text-text-faint">{count}</span>
          ) : null}
        </button>

        {isOpen ? (
          <div className="ml-3 space-y-px border-l border-line pl-1.5">
            {state.status === 'loading' ? (
              <div className="flex items-center gap-2 px-2 py-1 text-[length:var(--app-text-11)] text-text-muted">
                <Spinner size={11} />
                {group === 'tables' ? 'Loading tables…' : 'Loading routines…'}
              </div>
            ) : null}

            {state.status === 'error' ? (
              <p className="px-2 py-1 text-[length:var(--app-text-11)] leading-[calc(var(--app-text-12)+4px)] text-text-danger">
                {state.error}
              </p>
            ) : null}

            {state.status === 'ready' && visible.length === 0 ? (
              <p className="px-2 py-1 text-[length:var(--app-text-11)] text-text-faint">
                {filterText === ''
                  ? `No ${group === 'tables' ? 'tables' : 'routines'}`
                  : 'No matches'}
              </p>
            ) : null}

            {state.status === 'ready' ? (
              group === 'tables' ? (
                orderedTablesFor(visible as SidebarTable[]).map(renderTable)
              ) : (
                (visible as SidebarModule[]).map(renderModule)
              )
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const renderSession = (item: SidebarSessionItem) => {
    const isActive = item.connectionId === activeConnectionId

    return (
      <div key={item.connectionId} className="mb-1">
        <div
          className={`group relative flex items-center gap-1.5 rounded-md pr-1 ${
            isActive ? 'bg-accent-soft' : 'hover:bg-tint/[0.03]'
          }`}
        >
          <button
            type="button"
            onClick={() => (isActive ? setExpanded((value) => !value) : onActivateSession(item.connectionId))}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left"
            title={isActive ? `Collapse ${item.connection.name}` : `Switch to ${item.connection.name}`}
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                isActive ? 'bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-line-strong'
              }`}
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-[length:var(--app-text-12)] font-medium ${
                  isActive ? 'text-text-strong' : 'text-text-soft'
                }`}
              >
                {item.connection.name}
              </span>
              <span className="block truncate text-[length:var(--app-text-10)] leading-[calc(var(--app-text-12)+4px)] text-text-muted">
                {item.connection.host}:{item.connection.port}
                {item.activeDatabase ? ` · ${item.activeDatabase}` : ''}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="icon-btn h-6 w-6"
              title="Refresh databases"
              onClick={() => onRefreshDatabases(item.connectionId)}
            >
              <Icon name="refresh" size={13} />
            </button>
            <button
              type="button"
              className="icon-btn h-6 w-6"
              title="Close connection"
              onClick={() => onCloseSession(item.connectionId)}
            >
              <Icon name="power" size={13} />
            </button>
          </div>
        </div>

        {isActive ? (
          expanded ? (
            <div className="mt-0.5 space-y-px pl-3">
              <div className="mb-1 flex items-center gap-1.5 rounded-md border border-line bg-base px-2 py-[5px] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
                <Icon name="search" size={12} className="shrink-0 text-text-faint" />
                <input
                  type="text"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Search here.."
                  aria-label="Search here.."
                  className="w-full min-w-0 bg-transparent text-[length:var(--app-text-12)] text-text placeholder:text-text-muted"
                />
                {filter ? (
                  <button
                    type="button"
                    className="icon-btn h-4 w-4 text-text-faint hover:text-text"
                    title="Clear filter"
                    aria-label="Clear filter"
                    onClick={() => setFilter('')}
                  >
                    <Icon name="x" size={11} />
                  </button>
                ) : null}
              </div>
              {renderGroup(item, 'tables')}
              {renderGroup(item, 'modules')}
            </div>
          ) : null
        ) : (
          <p className="mt-0.5 truncate px-2 py-1 pl-4 text-[length:var(--app-text-10)] font-semibold uppercase tracking-wider text-text-faint">
            {item.databases.length} {item.databases.length === 1 ? 'database' : 'databases'}
          </p>
        )}
      </div>
    )
  }

  const renderPanel = (toggleAction: { icon: string; title: string; onClick: () => void }) => (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <BrandMark size={20} />
        <span className="min-w-0 truncate text-[length:var(--app-text-13)] font-semibold tracking-tight text-text-strong">Nova Tables</span>
        <span className="ml-auto shrink-0 rounded border border-line-strong bg-tint/[0.03] px-1.5 py-0.5 text-[length:var(--app-text-9)] font-semibold uppercase tracking-wider text-text-muted">
          MSSQL
        </span>
        <button
          type="button"
          className="icon-btn h-6 w-6 shrink-0"
          title={toggleAction.title}
          aria-label={toggleAction.title}
          onClick={toggleAction.onClick}
        >
          <Icon name={toggleAction.icon} size={13} />
        </button>
      </div>

      <div className="space-y-1.5 p-3">
        <button type="button" className="btn-soft w-full" onClick={onOpenConnections}>
          <Icon name="server" size={14} />
          Add Connection
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <div className="mx-1 mt-2 rounded-lg border border-dashed border-line-strong px-3 py-6 text-center">
            <Icon name="server" size={18} className="mx-auto mb-2 text-text-faint" />
            <p className="text-[length:var(--app-text-12)] text-text-muted">No connection open</p>
            <p className="mt-1 text-[length:var(--app-text-11)] text-text-faint">Pick one to browse its databases.</p>
          </div>
        ) : (
          sessions.map(renderSession)
        )}
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4 text-[length:var(--app-text-10)] text-text-faint">
        <span>Microsoft SQL Server</span>
        <span>{appVersion ? `v${appVersion}` : ''}</span>
      </div>
    </>
  )

  const menuNode = menu ? (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={
        menu.kind === 'module'
          ? ([
              {
                id: 'open-new-tab',
                label: 'Open new tab',
                onSelect: () => onOpenModule(menu.module),
              },
              {
                id: 'copy-object-name',
                label: 'Copy object name',
                onSelect: () => onCopyObjectName(menu.module),
              },
              {
                id: 'copy-module-definition',
                label: 'Copy definition',
                onSelect: () => onCopyModuleDefinition(menu.module),
              },
              {
                id: 'new-function',
                label: 'New function',
                onSelect: () => onNewFunction(),
              },
            ] as ContextMenuItem[])
          : ([
              {
                id: 'open-new-tab',
                label: 'Open new tab',
                onSelect: () => onBrowseTable(menu.table),
              },
              {
                id: 'copy-object-name',
                label: 'Copy object name',
                onSelect: () => onCopyObjectName(menu.table),
              },
              {
                id: 'script-table',
                label: 'Script as CREATE',
                onSelect: () => onScriptTable(menu.table),
              },
              {
                id: 'open-structure',
                label: 'Open structure',
                onSelect: () => onOpenStructure(menu.table),
              },
              {
                id: 'new-table',
                label: 'New table',
                onSelect: () => onNewTable(menu.table),
              },
              {
                id: 'rename',
                label: 'Rename',
                onSelect: () => onRenameTable(menu.table),
              },
              {
                id: 'clone',
                label: 'Clone',
                onSelect: () => onCloneTable(menu.table),
              },
              {
                id: 'pin-to-top',
                label: pinnedTables.includes(`${menu.table.schema}.${menu.table.name}`)
                  ? 'Unpin from top'
                  : 'Pin to top',
                onSelect: () => onTogglePin(menu.table),
              },
              {
                id: 'truncate',
                label: 'Truncate',
                onSelect: () => onTruncateTable(menu.table),
              },
              {
                id: 'drop-table',
                label: 'Drop Table',
                onSelect: () => onDropTable(menu.table),
              },
            ] as ContextMenuItem[])
      }
      onClose={() => setMenu(null)}
    />
  ) : null

  if (collapsed) {
    return (
      <>
        <aside
          ref={railRef}
          className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-line bg-panel py-3"
        >
          <button
            type="button"
            className="icon-btn h-7 w-7"
            title="Show sidebar"
            aria-label="Show sidebar"
            onClick={() => onToggleCollapsed(false)}
          >
            <Icon name="chevron-right" size={13} />
          </button>
          <BrandMark size={18} className="mt-1 opacity-70" />
        </aside>

        <aside
          style={{ width }}
          className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-line bg-panel shadow-2xl shadow-black/60 ${
            hoverOpen
              ? 'translate-x-0 opacity-100 transition-[opacity,transform] duration-200 ease-out'
              : '-translate-x-3 opacity-0 pointer-events-none transition-[opacity,transform] duration-150 ease-in'
          }`}
        >
          {renderPanel({
            icon: 'chevron-right',
            title: 'Expand sidebar',
            onClick: () => onToggleCollapsed(false),
          })}
        </aside>

        {menuNode}
      </>
    )
  }

  return (
    <aside style={{ width }} className="relative flex shrink-0 flex-col border-r border-line bg-panel">
      {renderPanel({
        icon: 'panel-left',
        title: 'Collapse sidebar',
        onClick: () => onToggleCollapsed(true),
      })}

      <div
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => onWidthChange(SIDEBAR_DEFAULT_WIDTH)}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/40"
        title="Drag to resize"
      />

      {menuNode}
    </aside>
  )
}
