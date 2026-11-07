import React from 'react'
import Icon, { Spinner } from '@/components/common/Icon'

export interface TabItemState {
  status: 'idle' | 'running' | 'success' | 'error' | string
  [key: string]: unknown
}

export interface TabItem {
  id: string
  title: string
  state: TabItemState
  kind?: string
  savedQueryId?: string | null
  [key: string]: unknown
}

export interface TabBarProps {
  tabs: TabItem[]
  activeTabId?: string | null
  canSave?: boolean
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onNewTab: () => void
  onReorderTabs?: (fromIndex: number, toIndex: number) => void
  onSaveQuery?: () => void
  onOpenSavedQueries?: () => void
  onOpenQueryHistory?: () => void
  onCopyQuery?: () => void
  headerCollapsed?: boolean
  onToggleHeader?: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  canSave = false,
  onSelect,
  onClose,
  onNewTab,
  onReorderTabs,
  onSaveQuery,
  onOpenSavedQueries,
  onOpenQueryHistory,
  onCopyQuery,
  headerCollapsed = false,
  onToggleHeader,
}: TabBarProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dragOverState, setDragOverState] = React.useState<{
    index: number
    position: 'before' | 'after'
  } | null>(null)

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel">
      <div className="tab-strip flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const status = tab.state.status
          const isDragging = dragIndex === index
          const isOver = dragOverState?.index === index
          const overPos = dragOverState?.position

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index))
                event.dataTransfer.effectAllowed = 'move'
                setDragIndex(index)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDragOverState(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragIndex === null || dragIndex === index) return
                event.dataTransfer.dropEffect = 'move'
                const rect = event.currentTarget.getBoundingClientRect()
                const isLeft = event.clientX - rect.left < rect.width / 2
                const position = isLeft ? 'before' : 'after'
                if (dragOverState?.index !== index || dragOverState?.position !== position) {
                  setDragOverState({ index, position })
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  if (dragOverState?.index === index) {
                    setDragOverState(null)
                  }
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex === null || dragIndex === index) {
                  setDragIndex(null)
                  setDragOverState(null)
                  return
                }
                const rect = event.currentTarget.getBoundingClientRect()
                const isLeft = event.clientX - rect.left < rect.width / 2
                let targetIndex = isLeft ? index : index + 1
                if (dragIndex < targetIndex) {
                  targetIndex -= 1
                }
                if (dragIndex !== targetIndex && onReorderTabs) {
                  onReorderTabs(dragIndex, targetIndex)
                }
                setDragIndex(null)
                setDragOverState(null)
              }}
              className={`group relative flex min-w-0 max-w-[220px] shrink-0 items-center border-r border-line ${
                isActive ? 'bg-base' : 'hover:bg-tint/[0.03]'
              } ${isDragging ? 'opacity-40' : ''}`}
            >
              {isOver && overPos === 'before' ? (
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-[2px] bg-accent" />
              ) : null}
              {isOver && overPos === 'after' ? (
                <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-[2px] bg-accent" />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                title={tab.title}
                className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-3 pr-1 text-left text-[length:var(--app-text-12)] cursor-grab active:cursor-grabbing ${
                  isActive ? 'text-text-strong' : 'text-text-muted hover:text-text'
                }`}
              >
                {tab.kind === 'erd' ? (
                  <Icon name="er-diagram" size={12} className="shrink-0 text-accent" />
                ) : status === 'running' ? (
                  <Spinner size={11} className="shrink-0 text-accent" />
                ) : (
                  <span
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                      status === 'error'
                        ? 'bg-danger'
                        : status === 'success'
                          ? 'bg-success/80'
                          : 'bg-line-strong'
                    }`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                {tab.savedQueryId ? (
                  <Icon name="bookmark" size={9} className="shrink-0 text-accent/70" />
                ) : null}
              </button>
              <button
                type="button"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                title="Close tab (Ctrl+W)"
                className={`icon-btn mr-1 h-5 w-5 shrink-0 ${
                  isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'
                } hover:opacity-100`}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={onNewTab}
          title="New tab (Ctrl+T)"
          className="icon-btn ml-1 h-6 w-6 shrink-0 self-center"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="flex shrink-0 items-center border-l border-line">
        <button
          type="button"
          onClick={onCopyQuery}
          disabled={!canSave}
          title="Copy query (or selection)"
          className="icon-btn h-6 w-6 disabled:pointer-events-none disabled:opacity-30"
        >
          <Icon name="copy" size={13} />
        </button>
        <button
          type="button"
          onClick={onSaveQuery}
          disabled={!canSave}
          title="Save query (Ctrl+S)"
          className="icon-btn ml-1 h-6 w-6 disabled:pointer-events-none disabled:opacity-30"
        >
          <Icon name="save" size={13} />
        </button>
        <button
          type="button"
          onClick={onOpenSavedQueries}
          disabled={!canSave}
          title="Saved queries"
          className="icon-btn ml-1 h-6 w-6 disabled:pointer-events-none disabled:opacity-30"
        >
          <Icon name="bookmark" size={13} />
        </button>
        <button
          type="button"
          onClick={onOpenQueryHistory}
          disabled={!canSave}
          title="Query history"
          className="icon-btn mx-1 h-6 w-6 disabled:pointer-events-none disabled:opacity-30"
        >
          <Icon name="history" size={13} />
        </button>
        {onToggleHeader ? (
          <button
            type="button"
            onClick={onToggleHeader}
            title={headerCollapsed ? 'Show toolbar' : 'Hide toolbar'}
            aria-label={headerCollapsed ? 'Show toolbar' : 'Hide toolbar'}
            className={`icon-btn mr-1 h-6 w-6 ${headerCollapsed ? 'text-text-muted' : ''}`}
          >
            <Icon name="panel-top" size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
