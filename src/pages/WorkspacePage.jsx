import WorkspaceHeader from '../components/WorkspaceHeader.jsx'
import TabBar from '../components/TabBar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import StatusBar from '../components/common/StatusBar.jsx'

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
}) {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-base">
      <WorkspaceHeader
        connection={activeConnection}
        connections={connections}
        activeDatabase={activeDatabase}
        databases={databases}
        onDisconnect={onDisconnect}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar connection={activeConnection} activeDatabase={activeDatabase} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onNewTab={onNewTab}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>
      <StatusBar connection={activeConnection} database={activeDatabase} />
    </div>
  )
}
