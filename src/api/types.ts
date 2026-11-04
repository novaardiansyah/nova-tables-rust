export interface IpcErrorPayload {
  message?: string
  code?: string | null
  number?: number | null
  lineNumber?: number | null
  state?: number | null
  severity?: number | null
  fields?: Record<string, unknown> | null
}

export class IpcError extends Error {
  code: string | null
  number: number | null
  lineNumber: number | null
  state: number | null
  severity: number | null
  fields: Record<string, unknown> | null

  constructor(payload?: IpcErrorPayload | null) {
    super(payload?.message || 'Unexpected error')
    this.name = 'IpcError'
    this.code = payload?.code || null
    this.number = payload?.number ?? null
    this.lineNumber = payload?.lineNumber ?? null
    this.state = payload?.state ?? null
    this.severity = payload?.severity ?? null
    this.fields = payload?.fields || null
  }
}

export interface ConnectionModel {
  id?: string
  name?: string
  host?: string
  port?: number | string
  username?: string | null
  password?: string | null
  database?: string | null
  databaseName?: string | null
  lastDatabaseUsed?: string | null
  folderId?: string | null
  environment?: string | null
  encrypt?: boolean
  trustServerCertificate?: boolean
  driverType?: string | null
  createdAt?: string
  updatedAt?: string
  lastConnectedAt?: string | null
  hasPassword?: boolean
  isDuplicate?: boolean
  timezone?: string | null
  [key: string]: unknown
}

export interface FolderModel {
  id: string
  name: string
  parentId?: string | null
  createdAt?: string
  [key: string]: unknown
}

export interface DatabaseInfo {
  name: string
  isSystem?: boolean
  isOnline?: boolean
  [key: string]: unknown
}

export interface DatabaseUserDetail {
  name: string
  type: string
  defaultSchema?: string | null
  canManage: boolean
  reason?: string | null
  loginName?: string | null
  roles: string[]
}

export type DatabaseUser = DatabaseUserDetail

export interface ServerLoginItem {
  name: string
  type: string
  isDisabled?: boolean
  isLocked?: boolean
}

export interface TableSummary {
  schema: string
  name: string
  type?: string
  rowCount?: number | null
  primaryKey?: string[] | null
}

export interface TableColumnsSummary {
  schema: string
  name: string
  columns: string[]
}

export interface ColumnSummary {
  schema: string
  table: string
  name: string
  column?: string
  typeName?: string
  dataType?: string
  maxLength?: number | null
  isNullable?: boolean
  isIdentity?: boolean
  isPrimaryKey?: boolean
  updateable?: boolean
  computed?: boolean
  [key: string]: unknown
}

export interface TableStructureResult {
  schema: string
  table: string
  objectName: string
  statement: string
  columns: unknown[]
  primaryKey: any[]
  uniqueKeys: any[]
  foreignKeys: any[]
  indexes: any[]
  [key: string]: unknown
}

export interface TableRelation {
  name: string
  schema: string
  table: string
  referencedSchema: string
  referencedTable: string
  columns: { column: string; referencedColumn: string }[]
}

export interface DatabaseModule {
  schema: string
  name: string
  type: string
  typeDesc?: string
}

export interface QueryResult {
  ok?: boolean
  resultSets: {
    columns: { name: string; type?: string; [key: string]: unknown }[]
    rows: unknown[][]
    rowCount: number
    [key: string]: unknown
  }[]
  messages: {
    type?: string
    count?: number
    text?: string
    [key: string]: unknown
  }[]
  rowsAffected: number[]
  elapsedMs: number
  rowCount?: number
  truncated?: boolean
  maxRows?: number
  columns?: { name: string; type?: string; [key: string]: unknown }[]
  rows?: unknown[][]
  executionTimeMs?: number
  message?: string
  [key: string]: unknown
}

export interface ExecutionPlanResult {
  plan?: string | null
  xml?: string | null
  columns?: any[]
  rows?: any[][]
  [key: string]: unknown
}

export interface QueryHistoryItem {
  id: string
  connectionId: string
  databaseName: string
  sql: string
  executionTimeMs?: number
  durationMs?: number
  rowsAffected?: number
  rowCount?: number
  status: string
  errorMessage?: string | null
  createdAt: string
  [key: string]: unknown
}

export interface SavedQueryItem {
  id: string
  connectionId?: string | null
  databaseName?: string | null
  database?: string | null
  name: string
  sql: string
  error?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface SystemInfo {
  name: string
  version: string
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  username?: string
  createdAt?: string
}

export interface AuthUserWithCredentials {
  id: string
  email: string
  name?: string
  username?: string
  passwordHash?: string
  salt?: string
  createdAt?: string
}

export interface AuthSession {
  user: AuthUser
  token: string
}

export interface ImportFileDialogResult {
  canceled: boolean
  filePath?: string
  fileName?: string
  content?: string
}
