import { useCallback, useState } from 'react'
import { api } from '../api.js'

export function useQueryHistory({ activeSession, showBanner, openTab }) {
  const [history, setHistory] = useState({ open: false, items: [], loading: false, error: null })

  const loadHistory = useCallback(async (connectionId, database) => {
    setHistory((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const items = await api.listQueryHistory(connectionId, database)
      setHistory((prev) => ({ ...prev, items, loading: false }))
    } catch (error) {
      setHistory((prev) => ({ ...prev, loading: false, error: error.message }))
    }
  }, [])

  const handleOpenQueryHistory = useCallback(() => {
    const current = activeSession()
    if (!current || !current.activeDatabase) {
      showBanner('warn', 'Open a connection and pick a database to see its query history.')
      return
    }
    setHistory({ open: true, items: [], loading: true, error: null })
    loadHistory(current.connectionId, current.activeDatabase)
  }, [activeSession, loadHistory, showBanner])

  const handleOpenHistoryItem = useCallback(
    (item) => {
      const current = activeSession()
      if (!current) return
      setHistory((prev) => ({ ...prev, open: false }))
      openTab(current.connectionId, 'History', item.sql)
    },
    [activeSession, openTab],
  )

  const handleDeleteHistoryItem = useCallback(
    async (item) => {
      try {
        await api.deleteQueryHistory(item.id)
        setHistory((prev) => ({ ...prev, items: prev.items.filter((entry) => entry.id !== item.id) }))
      } catch (error) {
        showBanner('error', error.message)
      }
    },
    [showBanner],
  )

  const handleClearHistory = useCallback(async () => {
    const current = activeSession()
    if (!current?.activeDatabase) return
    try {
      await api.clearQueryHistory(current.connectionId, current.activeDatabase)
      setHistory((prev) => ({ ...prev, items: [] }))
    } catch (error) {
      showBanner('error', error.message)
    }
  }, [activeSession, showBanner])

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
