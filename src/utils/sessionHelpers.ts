import { DatabaseInfo } from '@/api'
import { SidebarTable } from '@/components/Sidebar'
import { EditSource } from '@/edits'
import { SavedQueryItem } from '@/api'
import { TableDesign } from '@/designSql'
import { ResultsPanelState } from '@/components/results/ResultsPanel'

export const STARTER_SQL = `-- Nova Tables
-- Pick a table in the sidebar or write a query, then press Ctrl+Enter to run it.

SELECT TOP (100) *
FROM sys.databases;
`

export const MYSQL_STARTER_SQL = `-- Nova Tables
-- Pick a table in the sidebar or write a query, then press Ctrl+Enter to run it.

SELECT *
FROM information_schema.tables
LIMIT 100;
`

export function starterSql(driverType?: string | null): string {
  return driverType === 'mysql' ? MYSQL_STARTER_SQL : STARTER_SQL
}

export const NEW_FUNCTION_SQL = `CREATE FUNCTION dbo.fn_name()
RETURNS INT
AS
BEGIN
    RETURN 0
END
`

export const EMPTY_TABLES = { status: 'idle', database: null, tables: [], error: null }
export const EMPTY_MODULES = { status: 'idle', database: null, modules: [], error: null }
export const EMPTY_COLUMNS = { status: 'idle', database: null, tables: [], error: null }
export const IDLE_QUERY: ResultsPanelState = { status: 'idle', result: null, error: null }
export const EDITOR_DEFAULT_HEIGHT = 320
export const BROWSE_ROWS = 300

export interface SessionTab {
  id: string
  kind: 'query' | 'design'
  title: string
  sql: string
  savedQueryId?: string | null
  savedQueryName?: string | null
  state: ResultsPanelState
  activeSet: number
  relations: any[]
  editSource?: EditSource | null
  edits: Record<string, { value: unknown; original?: unknown }>
  deletingRows: number[]
  lastExecutedSql?: string | null
  // Design properties
  target?: any
  design?: TableDesign | null
  loading?: boolean
  error?: string | null
  busy?: boolean
  executionPlan?: any | null
  [key: string]: unknown
}

export interface SessionData {
  connectionId: string
  connection: any
  name: string
  host: string
  port: number
  activeDatabase?: string | null
  tables: any
  columns: any
  modules: any
  tabs: SessionTab[]
  activeTabId: string
  selectedTable?: string | null
  selectedModule?: string | null
  databases?: DatabaseInfo[]
  [key: string]: unknown
}

export function createTab(id: string, title: string, sql: string, editSource: EditSource | null = null, savedQuery: SavedQueryItem | null = null): SessionTab {
  return {
    id,
    kind: 'query',
    title,
    sql,
    savedQueryId: savedQuery?.id ?? null,
    savedQueryName: savedQuery?.name ?? null,
    state: IDLE_QUERY,
    activeSet: 0,
    relations: [],
    editSource,
    edits: {},
    deletingRows: [],
    lastExecutedSql: null,
  }
}

export function createDesignTab(id: string, title: string, target: any): SessionTab {
  return {
    id,
    kind: 'design',
    title,
    target,
    design: null,
    loading: true,
    error: null,
    busy: false,
    sql: '',
    state: IDLE_QUERY,
    activeSet: 0,
    edits: {},
    deletingRows: [],
    relations: [],
  }
}

export function pickDatabase(databases: DatabaseInfo[], configured?: string | null): string {
  const names = databases.map((database) => database.name)
  if (configured && names.includes(configured)) return configured
  const online = databases.find((database) => !database.isSystem && database.isOnline)
  return online?.name || names[0] || configured || 'master'
}

export function dropDatabaseState(session: SessionData | null, database: DatabaseInfo | null, running: boolean) {
  if (!session) return { allowed: false, hint: 'Open a connection first.' }
  if (!database) return { allowed: false, hint: 'Select a database first.' }
  if (database.isSystem) return { allowed: false, hint: 'System databases cannot be dropped.' }
  if (!database.isOnline) return { allowed: false, hint: 'The database must be online.' }
  if (String(database.name).toLowerCase() === String(session.activeDatabase || '').toLowerCase()) {
    return { allowed: false, hint: 'The connection default database cannot be dropped.' }
  }
  if (running) return { allowed: false, hint: 'Wait for the running query to finish.' }
  return { allowed: true, hint: 'Drop database' }
}

export function manageUsersState(session: SessionData | null, database: DatabaseInfo | null) {
  if (!session) return { allowed: false, hint: 'Open a connection first.' }
  if (!database) return { allowed: false, hint: 'Select a database first.' }
  if (database.isSystem) return { allowed: false, hint: 'System databases cannot be managed here.' }
  if (!database.isOnline) return { allowed: false, hint: 'The database must be online.' }
  return { allowed: true, hint: 'Users & permissions' }
}

export function qualifiedName(table: SidebarTable, driverType?: string | null): string {
  return `${quoteIdentifier(table.schema, driverType)}.${quoteIdentifier(table.name, driverType)}`
}

import { quoteIdentifier, sqlLiteral } from '@/resultFormats'

export function browseSql(table: SidebarTable & { primaryKey?: string[] }, driverType?: string | null): string {
  const pk = table.primaryKey || []
  const order = pk.map((column) => `${quoteIdentifier(column, driverType)} DESC`).join(', ')
  const orderBy = order ? `\nORDER BY ${order}` : ''
  const qualified = qualifiedName(table, driverType)
  if (driverType === 'mysql') {
    return `SELECT *\nFROM ${qualified}${orderBy}\nLIMIT ${BROWSE_ROWS};`
  }
  return `SELECT TOP (${BROWSE_ROWS}) *\nFROM ${qualified}${orderBy};`
}

export function sessionTableFor(session: SessionData, schema: string, name: string): SidebarTable | null {
  const tables = session.tables?.tables ?? []
  return tables.find((table: SidebarTable) => table.schema === schema && table.name === name) ?? null
}

export function relatedSql(relation: { referencedColumn: string; referencedSchema: string; referencedTable: string }, value: unknown, driverType?: string | null): string {
  const column = quoteIdentifier(relation.referencedColumn, driverType)
  const filter =
    value === null || value === undefined
      ? `${column} IS NULL`
      : `${column} = ${sqlLiteral(value)}`
  const schema = quoteIdentifier(relation.referencedSchema, driverType)
  const table = quoteIdentifier(relation.referencedTable, driverType)
  if (driverType === 'mysql') {
    return `SELECT *\nFROM ${schema}.${table}\nWHERE ${filter}\nLIMIT ${BROWSE_ROWS};`
  }
  return `SELECT TOP (${BROWSE_ROWS}) *\nFROM ${schema}.${table}\nWHERE ${filter};`
}

export function queryTitle(index: number): string {
  return `Query ${index}`
}

export function nextQueryTitle(tabs: SessionTab[]): string {
  const highest = tabs.reduce((max, tab) => {
    const match = /^Query (\d+)$/.exec(tab.title)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return queryTitle(highest + 1)
}

export function createSession(result: any, connection: any, database: string, tab: SessionTab): SessionData {
  return {
    ...result,
    name: result?.name || connection?.name || 'SQL Server',
    host: result?.host || connection?.host || '127.0.0.1',
    port: Number(result?.port || connection?.port || 1433),
    connection,
    activeDatabase: database,
    tables: EMPTY_TABLES,
    columns: EMPTY_COLUMNS,
    modules: EMPTY_MODULES,
    tabs: [tab],
    activeTabId: tab.id,
    selectedTable: null,
    selectedModule: null,
  }
}
