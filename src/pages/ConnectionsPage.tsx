import React from 'react'
import ConnectionsScreen, { ConnectionsScreenProps } from '@/components/connections/ConnectionsScreen'

export default function ConnectionsPage(props: ConnectionsScreenProps) {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-base">
      <ConnectionsScreen {...props} />
    </div>
  )
}
