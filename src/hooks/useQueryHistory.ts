import { useCallback, useState } from 'react'
import { api, QueryHistoryItem } from '@/api'

export type { QueryHistoryItem }

export interface QueryHistoryState {
  open: boolean
  items: QueryHistoryItem[]
  loading: boolean
  error: string | null
}

export interface UseQueryHistoryProps {
  activeSession: () => {
    connectionId: string
    connection?: { id?: string | null } | null
    activeDatabase?: string | null
  } | null
  showBanner: (type: 'info' | 'warn' | 'error' | 'success', message: string) => void
  openTab: (connectionId: string, title: string, sql: string) => void
}

export function useQueryHistory({ activeSession, showBanner, openTab }: UseQueryHistoryProps) {
  const [history, setHistory] = useState<QueryHistoryState>({
    open: false,
    items: [],
    loading: false,
    error: null,
  })

  const loadHistory = useCallback(async (connectionId: string, database: string) => {
    setHistory((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const items = await api.listQueryHistory(connectionId, database)
      setHistory((prev) => ({ ...prev, items, loading: false }))
    } catch (error: any) {
      setHistory((prev) => ({ ...prev, loading: false, error: error.message }))
    }
  }, [])

  const handleOpenQueryHistory = useCallback(() => {
    const current = activeSession()
    const connectionId = current?.connection?.id ?? null
    if (!current || !connectionId || !current.activeDatabase) {
      showBanner('warn', 'Open a connection and pick a database to see its query history.')
      return
    }
    setHistory({ open: true, items: [], loading: true, error: null })
    loadHistory(connectionId, current.activeDatabase)
  }, [activeSession, loadHistory, showBanner])

  const handleOpenHistoryItem = useCallback(
    (item: QueryHistoryItem) => {
      const current = activeSession()
      if (!current) return
      setHistory((prev) => ({ ...prev, open: false }))
      openTab(current.connectionId, 'History', item.sql)
    },
    [activeSession, openTab],
  )

  const handleDeleteHistoryItem = useCallback(
    (item: QueryHistoryItem) => {
      setHistory((prev) => ({ ...prev, items: prev.items.filter((entry) => entry.id !== item.id) }))
      void api
        .deleteQueryHistory(item.id)
        .catch((error: any) => showBanner('error', error.message))
    },
    [showBanner],
  )

  const handleClearHistory = useCallback(() => {
    const current = activeSession()
    const connectionId = current?.connection?.id ?? null
    if (!connectionId || !current?.activeDatabase) return
    const itemsToClear = history.items.slice(0, 30)
    if (itemsToClear.length === 0) return
    const clearedIds = new Set(itemsToClear.map((item) => item.id))
    setHistory((prev) => ({
      ...prev,
      items: prev.items.filter((entry) => !clearedIds.has(entry.id)),
    }))
    void api
      .clearQueryHistory(connectionId, current.activeDatabase, [...clearedIds])
      .catch((error: any) => showBanner('error', error.message))
  }, [activeSession, history.items, showBanner])

  const handleCloseHistory = useCallback(() => {
    setHistory((prev) => ({ ...prev, open: false }))
  }, [])

  return {
    history,
    handleOpenQueryHistory,
    handleOpenHistoryItem,
    handleDeleteHistoryItem,
    handleClearHistory,
    handleCloseHistory,
  }
}
