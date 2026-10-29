import { useEffect } from 'react'

export function useKeyboardShortcuts({
  screen,
  hasDialog,
  shortcutsOpen,
  setShortcutsOpen,
  setSettingsOpen,
  setDialog,
  handleRun,
  handleSaveQuery,
  openConnectionScreen,
  handleCloseActiveTab,
  handleNewTab,
  handleReRun,
  handleCycleTab,
  handleSelectTabIndex,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault()
        setShortcutsOpen((value) => !value)
        return
      }

      const target = event.target
      const inEditor = Boolean(target?.closest?.('.monaco-editor'))
      const tagName = target?.tagName
      const isFormField =
        !inEditor &&
        (tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          Boolean(target?.isContentEditable))

      if (!event.ctrlKey && !event.metaKey) {
        if (event.key === 'F5' && !hasDialog && !isFormField) {
          event.preventDefault()
          handleRun()
        }
        return
      }

      if (event.altKey) return

      if (event.key === 'Enter') {
        if (inEditor || hasDialog || isFormField) return
        event.preventDefault()
        handleRun()
        return
      }

      if (isFormField || hasDialog) return

      if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault()
        handleSaveQuery()
        return
      }

      if (event.key.toLowerCase() === 'n' && !event.shiftKey) {
        event.preventDefault()
        setDialog({ mode: 'create' })
        return
      }

      if (event.key.toLowerCase() === 'o' && !event.shiftKey) {
        event.preventDefault()
        openConnectionScreen()
        return
      }

      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      if (screen !== 'workspace') return

      const key = event.key.toLowerCase()

      if (key === 'w') {
        event.preventDefault()
        handleCloseActiveTab()
        return
      }

      if (key === 't') {
        event.preventDefault()
        handleNewTab()
        return
      }

      if (key === 'r') {
        event.preventDefault()
        handleReRun()
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        handleCycleTab(event.shiftKey ? -1 : 1)
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        handleSelectTabIndex(Number(event.key) - 1)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    screen,
    hasDialog,
    shortcutsOpen,
    setShortcutsOpen,
    setSettingsOpen,
    setDialog,
    handleRun,
    handleSaveQuery,
    openConnectionScreen,
    handleCloseActiveTab,
    handleNewTab,
    handleReRun,
    handleCycleTab,
    handleSelectTabIndex,
  ])
}
