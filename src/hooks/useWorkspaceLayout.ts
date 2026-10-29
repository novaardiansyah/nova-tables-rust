import { useCallback, useMemo, useRef, useState } from 'react'
import { jsonRecords } from '@/resultFormats'
import { ActiveDataPayload } from '@/components/results/ResultsPanel'
import { EDITOR_DEFAULT_HEIGHT, STARTER_SQL } from '@/utils/sessionHelpers'
import { SIDEBAR_DEFAULT_WIDTH } from '@/components/Sidebar'
import { JSON_PANEL_DEFAULT_WIDTH } from '@/components/results/JsonPanel'

export interface QueryState {
  id: number
  value: string
  focus: boolean
}

export function useWorkspaceLayout() {
  const [query, setQuery] = useState<QueryState>({ id: 0, value: STARTER_SQL, focus: true })
  const [editorHeight, setEditorHeight] = useState(EDITOR_DEFAULT_HEIGHT)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [jsonPanelWidth, setJsonPanelWidth] = useState(JSON_PANEL_DEFAULT_WIDTH)
  const [jsonPanelCollapsed, setJsonPanelCollapsed] = useState(true)
  const [jsonPanelHovered, setJsonPanelHovered] = useState(false)
  const [activeResultData, setActiveResultData] = useState<ActiveDataPayload | null>(null)

  const sqlRef = useRef(STARTER_SQL)
  const selectionRef = useRef('')
  const seedIdRef = useRef(0)
  const splitRef = useRef<HTMLDivElement | null>(null)

  const seedEditor = useCallback((sql: string, focus = true) => {
    seedIdRef.current += 1
    sqlRef.current = sql
    setQuery({ id: seedIdRef.current, value: sql, focus })
  }, [])

  const handleSqlChange = useCallback((value: string) => {
    sqlRef.current = value
  }, [])

  const handleSelectionChange = useCallback((text: string) => {
    selectionRef.current = text
  }, [])

  const handleSplitPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    const container = splitRef.current
    if (!container) return
    event.preventDefault()

    const bounds = container.getBoundingClientRect()
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(Math.max(moveEvent.clientY - bounds.top, 140), bounds.height - 160)
      setEditorHeight(next)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }, [])

  const jsonPanelVisible = !jsonPanelCollapsed || jsonPanelHovered
  const jsonText = useMemo(
    () => (jsonPanelVisible && activeResultData ? jsonRecords(activeResultData.columnNames, activeResultData.rows) : ''),
    [jsonPanelVisible, activeResultData],
  )

  return {
    query,
    editorHeight,
    setEditorHeight,
    sidebarWidth,
    setSidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    jsonPanelWidth,
    setJsonPanelWidth,
    jsonPanelCollapsed,
    setJsonPanelCollapsed,
    jsonPanelHovered,
    setJsonPanelHovered,
    activeResultData,
    setActiveResultData,
    sqlRef,
    selectionRef,
    splitRef,
    seedEditor,
    handleSqlChange,
    handleSelectionChange,
    handleSplitPointerDown,
    jsonPanelVisible,
    jsonText,
  }
}
