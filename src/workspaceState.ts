import { JSON_PANEL_DEFAULT_WIDTH } from '@/components/results/JsonPanel'
import { SIDEBAR_DEFAULT_WIDTH } from '@/components/Sidebar'
import { EDITOR_DEFAULT_HEIGHT, SessionData, SessionTab, createTab } from '@/utils/sessionHelpers'

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 560
const JSON_PANEL_MIN_WIDTH = 240
const JSON_PANEL_MAX_WIDTH = 800
const EDITOR_MIN_HEIGHT = 140
const EDITOR_MAX_HEIGHT = 900

export interface PersistedTab {
  id: string
  title: string
  sql: string
  savedQueryId: string | null
  savedQueryName: string | null
}

export interface PersistedSessionTabs {
  activeTabId: string
  tabs: PersistedTab[]
}

export interface WorkspaceState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  jsonPanelCollapsed: boolean
  jsonPanelWidth: number
  headerCollapsed: boolean
  editorHeight: number
  activeConnectionId: string | null
  connections: Record<string, PersistedSessionTabs>
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  jsonPanelCollapsed: true,
  jsonPanelWidth: JSON_PANEL_DEFAULT_WIDTH,
  headerCollapsed: false,
  editorHeight: EDITOR_DEFAULT_HEIGHT,
  activeConnectionId: null,
  connections: {},
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const size = Math.round(Number(value))
  if (!Number.isFinite(size)) return fallback
  return Math.min(Math.max(size, min), max)
}

function normalizeTab(input: unknown): PersistedTab | null {
  if (!input || typeof input !== 'object') return null
  const source = input as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id : ''
  if (!id) return null
  return {
    id,
    title: typeof source.title === 'string' && source.title ? source.title : 'Query',
    sql: typeof source.sql === 'string' ? source.sql : '',
    savedQueryId: typeof source.savedQueryId === 'string' ? source.savedQueryId : null,
    savedQueryName: typeof source.savedQueryName === 'string' ? source.savedQueryName : null,
  }
}

function normalizeSessionTabs(input: unknown): PersistedSessionTabs | null {
  if (!input || typeof input !== 'object') return null
  const source = input as Record<string, unknown>
  if (!Array.isArray(source.tabs)) return null
  const tabs = source.tabs.map(normalizeTab).filter((tab): tab is PersistedTab => Boolean(tab))
  if (tabs.length === 0) return null
  const activeTabId =
    typeof source.activeTabId === 'string' && tabs.some((tab) => tab.id === source.activeTabId)
      ? source.activeTabId
      : tabs[0].id
  return { activeTabId, tabs }
}

export function normalizeWorkspaceState(input: unknown): WorkspaceState {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const connections: Record<string, PersistedSessionTabs> = {}

  if (source.connections && typeof source.connections === 'object') {
    Object.entries(source.connections as Record<string, unknown>).forEach(([connectionId, value]) => {
      const normalized = normalizeSessionTabs(value)
      if (connectionId && normalized) connections[connectionId] = normalized
    })
  }

  return {
    sidebarCollapsed: source.sidebarCollapsed === true,
    sidebarWidth: clampNumber(
      source.sidebarWidth,
      DEFAULT_WORKSPACE_STATE.sidebarWidth,
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    ),
    jsonPanelCollapsed: source.jsonPanelCollapsed !== false,
    jsonPanelWidth: clampNumber(
      source.jsonPanelWidth,
      DEFAULT_WORKSPACE_STATE.jsonPanelWidth,
      JSON_PANEL_MIN_WIDTH,
      JSON_PANEL_MAX_WIDTH,
    ),
    headerCollapsed: source.headerCollapsed === true,
    editorHeight: clampNumber(
      source.editorHeight,
      DEFAULT_WORKSPACE_STATE.editorHeight,
      EDITOR_MIN_HEIGHT,
      EDITOR_MAX_HEIGHT,
    ),
    activeConnectionId:
      typeof source.activeConnectionId === 'string' && source.activeConnectionId
        ? source.activeConnectionId
        : null,
    connections,
  }
}

export function workspaceTabsFromSession(
  session: SessionData,
  liveSql: string | null,
): PersistedSessionTabs | null {
  const tabs = session.tabs
    .filter((tab) => tab.kind === 'query')
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      sql: tab.id === session.activeTabId && liveSql !== null ? liveSql : tab.sql,
      savedQueryId: tab.savedQueryId ?? null,
      savedQueryName: tab.savedQueryName ?? null,
    }))

  if (tabs.length === 0) return null

  const activeTabId = tabs.some((tab) => tab.id === session.activeTabId)
    ? session.activeTabId
    : tabs[0].id

  return { activeTabId, tabs }
}

export function tabsFromPersisted(input: PersistedSessionTabs): SessionTab[] {
  return input.tabs.map((tab) => ({
    ...createTab(tab.id, tab.title, tab.sql),
    savedQueryId: tab.savedQueryId,
    savedQueryName: tab.savedQueryName,
  }))
}
