import ConnectionsScreen from '../components/connections/ConnectionsScreen.jsx'

export default function ConnectionsPage(props) {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-base">
      <ConnectionsScreen {...props} />
    </div>
  )
}
