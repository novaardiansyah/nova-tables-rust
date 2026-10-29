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
  onSaveQuery?: () => void
  onOpenSavedQueries?: () => void
  onOpenQueryHistory?: () => void
  onCopyQuery?: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  canSave = false,
  onSelect,
  onClose,
  onNewTab,
  onSaveQuery,
  onOpenSavedQueries,
  onOpenQueryHistory,
  onCopyQuery,
}: TabBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel">
      <div className="tab-strip flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const status = tab.state.status

          return (
            <div
              key={tab.id}
              className={`group flex min-w-0 max-w-[220px] shrink-0 items-center border-r border-line ${
                isActive ? 'bg-base' : 'hover:bg-tint/[0.03]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                title={tab.title}
                className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-3 pr-1 text-left text-[length:var(--app-text-12)] ${
                  isActive ? 'text-text-strong' : 'text-text-muted hover:text-text'
                }`}
              >
                {status === 'running' ? (
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
                onClick={() => onClose(tab.id)}
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
      </div>
    </div>
  )
}
