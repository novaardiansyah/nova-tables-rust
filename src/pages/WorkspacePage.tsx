import React, { ReactNode } from 'react'
import WorkspaceHeader, { WorkspaceHeaderDatabase, WorkspaceHeaderSession } from '../components/WorkspaceHeader'
import TabBar, { TabItem } from '../components/TabBar'
import Sidebar, { SidebarProps } from '../components/Sidebar'
import StatusBar from '../components/common/StatusBar'

export interface WorkspacePageProps {
  activeConnection?: WorkspaceHeaderSession | null
  connections?: unknown[]
  activeDatabase?: string | null
  databases?: WorkspaceHeaderDatabase[]
  tabs: TabItem[]
  activeTabId?: string | null
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  onDisconnect?: () => void
  children?: ReactNode
}

export default function WorkspacePage({
  activeConnection,
  connections,
  activeDatabase,
  databases,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onDisconnect,
  children,
}: WorkspacePageProps) {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-base">
      <WorkspaceHeader
        connection={activeConnection}
        connections={connections}
        activeDatabase={activeDatabase}
        databases={databases}
        queryExecutionMode="silent"
        onChangeExecutionMode={() => {}}
        onDisconnect={onDisconnect}
      />
      <div className="flex-1 flex overflow-hidden">
        {activeConnection ? (
          <Sidebar
            sessions={[]}
            pinnedTables={[]}
            onActivateSession={() => {}}
            onCloseSession={() => {}}
            onBrowseTable={() => {}}
            onCopyObjectName={() => {}}
            onScriptTable={() => {}}
            onRefreshDatabases={() => {}}
            onOpenStructure={() => {}}
            onOpenModule={() => {}}
            onCopyModuleDefinition={() => {}}
            onNewFunction={() => {}}
            onNewTable={() => {}}
            onRenameTable={() => {}}
            onCloneTable={() => {}}
            onTruncateTable={() => {}}
            onDropTable={() => {}}
            onTogglePin={() => {}}
            onOpenConnections={() => {}}
            onSelectTable={() => {}}
            onSelectModule={() => {}}
            onWidthChange={() => {}}
            onToggleCollapsed={() => {}}
          />
        ) : null}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onNewTab={onNewTab}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
      <StatusBar result={{}} editSource={null} activeDatabase={activeDatabase} queryStatus="idle" />
    </div>
  )
}
