import { useCallback } from 'react'
import { SessionTab, SessionData, createTab, nextQueryTitle, queryTitle } from '../utils/sessionHelpers'
import { EditSource } from '../edits'
import { SavedQueryItem } from '../api'

export interface UseTabManagerProps {
  activeSession: () => SessionData | null
  patchSession: (connectionId: string, patch: Partial<SessionData>) => void
  updateTab: (connectionId: string, tabId: string, patch: Partial<SessionTab> | ((tab: SessionTab) => Partial<SessionTab>)) => void
  setSessions: React.Dispatch<React.SetStateAction<Record<string, SessionData>>>
  seedEditor: (sql: string, focus?: boolean) => void
  sqlRef: React.MutableRefObject<string>
  tabIdRef: React.MutableRefObject<number>
  setEditConfirmTarget: React.Dispatch<React.SetStateAction<{ type: string; tabId?: string; sql?: string } | null>>
  setEditConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>
  setDeleteConfirmTarget: React.Dispatch<React.SetStateAction<{ type: string; tabId?: string; sql?: string } | null>>
  setDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useTabManager({
  activeSession,
  patchSession,
  updateTab,
  setSessions,
  seedEditor,
  sqlRef,
  tabIdRef,
  setEditConfirmTarget,
  setEditConfirmOpen,
  setDeleteConfirmTarget,
  setDeleteConfirmOpen,
}: UseTabManagerProps) {
  const openTab = useCallback(
    (connectionId: string, title: string, sql: string, editSource: EditSource | null = null, savedQuery: SavedQueryItem | null = null) => {
      tabIdRef.current += 1
      const id = `tab-${tabIdRef.current}`
      const liveSql = sqlRef.current
      setSessions((prev) => {
        const current = prev[connectionId]
        if (!current) return prev
        return {
          ...prev,
          [connectionId]: {
            ...current,
            tabs: [
              ...current.tabs.map((tab) => (tab.id === current.activeTabId ? { ...tab, sql: liveSql } : tab)),
              createTab(id, title, sql, editSource, savedQuery),
            ],
            activeTabId: id,
          },
        }
      })
      seedEditor(sql)
      return id
    },
    [seedEditor, sqlRef, tabIdRef, setSessions],
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const current = activeSession()
      if (!current) return
      const index = current.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return
      const tab = current.tabs[index]
      if (tab && Object.keys(tab.edits || {}).length > 0) {
        setEditConfirmTarget({ type: 'close-tab', tabId })
        setEditConfirmOpen(true)
        return
      }
      if (tab && tab.deletingRows && tab.deletingRows.length > 0) {
        setDeleteConfirmTarget({ type: 'close-tab', tabId })
        setDeleteConfirmOpen(true)
        return
      }

      const remaining = current.tabs.filter((tab) => tab.id !== tabId)

      if (remaining.length === 0) {
        tabIdRef.current += 1
        const createdTab = createTab(`tab-${tabIdRef.current}`, queryTitle(1), '')
        patchSession(current.connectionId, { tabs: [createdTab], activeTabId: createdTab.id })
        seedEditor(createdTab.sql)
        return
      }

      if (tabId !== current.activeTabId) {
        patchSession(current.connectionId, { tabs: remaining })
        return
      }

      const neighbour = remaining[Math.min(index, remaining.length - 1)]
      patchSession(current.connectionId, { tabs: remaining, activeTabId: neighbour.id })
      seedEditor(neighbour.sql)
    },
    [activeSession, patchSession, seedEditor, tabIdRef, setEditConfirmTarget, setEditConfirmOpen, setDeleteConfirmTarget, setDeleteConfirmOpen],
  )

  const syncLiveSql = useCallback((connectionId: string, tabId: string) => {
    const sql = sqlRef.current
    setSessions((prev) => {
      const current = prev[connectionId]
      if (!current) return prev
      return {
        ...prev,
        [connectionId]: {
          ...current,
          tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, sql } : tab)),
        },
      }
    })
  }, [sqlRef, setSessions])

  const handleSelectTab = useCallback(
    (tabId: string) => {
      const current = activeSession()
      if (!current || tabId === current.activeTabId) return
      const next = current.tabs.find((tab) => tab.id === tabId)
      if (!next) return
      const active = current.tabs.find((tab) => tab.id === current.activeTabId)
      if (active && Object.keys(active.edits || {}).length > 0) {
        setEditConfirmTarget({ type: 'switch-tab', tabId })
        setEditConfirmOpen(true)
        return
      }
      if (active && active.deletingRows && active.deletingRows.length > 0) {
        setDeleteConfirmTarget({ type: 'switch-tab', tabId })
        setDeleteConfirmOpen(true)
        return
      }
      syncLiveSql(current.connectionId, current.activeTabId)
      patchSession(current.connectionId, { activeTabId: tabId })
      seedEditor(next.sql)
    },
    [activeSession, patchSession, seedEditor, syncLiveSql, setEditConfirmTarget, setEditConfirmOpen, setDeleteConfirmTarget, setDeleteConfirmOpen],
  )

  const handleNewTab = useCallback(() => {
    const current = activeSession()
    if (!current) return
    openTab(current.connectionId, nextQueryTitle(current.tabs), '')
  }, [activeSession, openTab])

  const handleCloseActiveTab = useCallback(() => {
    const current = activeSession()
    if (!current) return
    handleCloseTab(current.activeTabId)
  }, [activeSession, handleCloseTab])

  const handleCycleTab = useCallback(
    (direction: number) => {
      const current = activeSession()
      if (!current || current.tabs.length === 0) return
      const index = current.tabs.findIndex((tab) => tab.id === current.activeTabId)
      const next = (index + direction + current.tabs.length) % current.tabs.length
      handleSelectTab(current.tabs[next].id)
    },
    [activeSession, handleSelectTab],
  )

  const handleSelectTabIndex = useCallback(
    (index: number) => {
      const current = activeSession()
      if (!current) return
      const tab = current.tabs[index]
      if (!tab) return
      handleSelectTab(tab.id)
    },
    [activeSession, handleSelectTab],
  )

  const handleSelectSet = useCallback(
    (index: number) => {
      const current = activeSession()
      if (!current) return
      updateTab(current.connectionId, current.activeTabId, { activeSet: index })
    },
    [activeSession, updateTab],
  )

  return {
    openTab,
    handleCloseTab,
    syncLiveSql,
    handleSelectTab,
    handleNewTab,
    handleCloseActiveTab,
    handleCycleTab,
    handleSelectTabIndex,
    handleSelectSet,
  }
}
