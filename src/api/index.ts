import { invoke } from '@tauri-apps/api/core'
import { encryptExportPayload, decryptImportPayload } from '@/api/crypto'

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
  username?: string
  password?: string | null
  database?: string
  databaseName?: string
  lastDatabaseUsed?: string | null
  folderId?: string | null
  environment?: string
  encrypt?: boolean
  trustServerCertificate?: boolean
  createdAt?: string
  updatedAt?: string
  lastConnectedAt?: string | null
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

export interface DatabaseUser {
  name: string
  typeDesc?: string
  roles: string[]
  isFixedRole?: boolean
}

export interface TableSummary {
  schema: string
  name: string
  type?: string
  rowCount?: number | null
  primaryKey?: string[] | null
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

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)

async function callCommand<T = any>(cmd: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!isTauri()) {
    return null
  }
  try {
    const response = await invoke<any>(cmd, args)
    if (response && response.ok === false) {
      throw new IpcError(response.error)
    }
    return response as T
  } catch (err: unknown) {
    if (err instanceof IpcError) throw err
    const errorObj = err as { message?: string }
    throw new IpcError({ message: errorObj?.message || String(err) })
  }
}

function cleanText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

function exportFolderChain(folderId: string, folderById: Map<string, FolderModel>): string[] {
  const chain: string[] = []
  let current: FolderModel | null = folderId ? folderById.get(folderId) ?? null : null
  while (current && !chain.includes(current.id)) {
    chain.unshift(current.id)
    current = current.parentId ? folderById.get(current.parentId) ?? null : null
  }
  return chain
}

function importFolderKey(parentId: string | null, name: string): string {
  return `${parentId ?? ''}::${String(name).toLowerCase()}`
}

function importFolderDepth(folder: FolderModel, folderById: Map<string, FolderModel>): number {
  let depth = 0
  let current: FolderModel | undefined = folder
  while (current?.parentId && folderById.has(String(current.parentId)) && depth < 64) {
    current = folderById.get(String(current.parentId))
    depth += 1
  }
  return depth
}

export interface ImportFileDialogResult {
  canceled: boolean
  filePath?: string
  fileName?: string
  content?: string
}

interface ConnectionsBundle {
  connections: Record<string, unknown>[]
  folders: { id: string; name: string; parentId: string | null }[]
  order: { connections: string[]; folders: string[] }
}

async function buildConnectionsBundle(
  connectionIds: string[] | null | undefined
): Promise<ConnectionsBundle> {
  const allConnections = await api.listConnections()
  const allSelected = !Array.isArray(connectionIds) || connectionIds.length === 0
  const targetIds = new Set(
    allSelected ? allConnections.map((c) => c.id!) : connectionIds.map(String)
  )

  const allFolders = await api.listFolders()
  const folderById = new Map<string, FolderModel>(allFolders.map((f) => [f.id, f]))
  const folderIds = new Set<string>()
  const folderOrder: string[] = []

  if (allSelected) {
    for (const folder of allFolders) folderIds.add(folder.id)
  } else {
    for (const conn of allConnections) {
      if (!targetIds.has(conn.id!) || !conn.folderId) continue
      for (const id of exportFolderChain(conn.folderId, folderById)) {
        folderIds.add(id)
      }
    }
  }

  for (const folder of allFolders) {
    if (folderIds.has(folder.id)) folderOrder.push(folder.id)
  }

  const connections: Record<string, unknown>[] = []
  const connectionOrder: string[] = []
  for (const item of allConnections) {
    if (!targetIds.has(item.id!)) continue
    connectionOrder.push(item.id!)
    connections.push({
      name: item.name,
      host: item.host,
      port: item.port,
      username: item.username,
      database: item.databaseName || item.database || '',
      environment: item.environment || '',
      encrypt: item.encrypt !== false,
      trustServerCertificate: item.trustServerCertificate !== false,
      password: item.password || null,
      folderId: item.folderId ?? null,
    })
  }

  const folders = folderOrder.map((id) => {
    const folder = folderById.get(id)!
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
    }
  })

  return { connections, folders, order: { connections: connectionOrder, folders: folderOrder } }
}

function getYYYYMMDD(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

async function saveFileWithDialog(input: {
  defaultPath: string
  filters: { name: string; extensions: string[] }[]
  content: string
}): Promise<{ saved: boolean; filePath?: string }> {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
    // Fallback to browser download if not Tauri
    const blob = new Blob([input.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = input.defaultPath
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { saved: true }
  }
  const res = await callCommand<any>('save_file', input)
  return res || { saved: false }
}

async function applyImportedConnections(payload: {
  connections?: any[]
  folders?: any[]
}): Promise<{
  importedCount: number
  importedFolderCount: number
  connections: ConnectionModel[]
  folders: FolderModel[]
}> {
  const items = payload.connections || []
  const sourceFolders = Array.isArray(payload.folders) ? payload.folders : []

  const existingConnections = await api.listConnections()
  const existingNames = new Set(existingConnections.map((c) => (c.name || '').toLowerCase()))
  const existingFolders = await api.listFolders()
  const reusableFolders = new Map<string, string>()
  for (const folder of existingFolders) {
    const key = importFolderKey(folder.parentId ?? null, folder.name)
    if (!reusableFolders.has(key)) reusableFolders.set(key, folder.id)
  }

  const folderIdMap = new Map<string, string>()
  const importedFolderIds: string[] = []
  const sourceFolderById = new Map<string, FolderModel>(
    sourceFolders.filter((f: any) => f && f.id).map((f: any) => [String(f.id), f])
  )
  const orderedSourceFolders = [...sourceFolderById.values()].sort(
    (left, right) =>
      importFolderDepth(left, sourceFolderById) - importFolderDepth(right, sourceFolderById)
  )

  for (const folder of orderedSourceFolders) {
    const name = cleanText(folder.name)
    if (!name) continue
    const sourceParentId = folder.parentId ? String(folder.parentId) : null
    const parentId = sourceParentId ? folderIdMap.get(sourceParentId) ?? null : null
    const key = importFolderKey(parentId, name)
    const reusableId = reusableFolders.get(key)
    let targetId = reusableId

    if (reusableId) {
      reusableFolders.delete(key)
    } else {
      const created = await api.saveFolder({ name, parentId })
      targetId = created.id
      importedFolderIds.push(targetId)
    }

    if (targetId) {
      folderIdMap.set(String(folder.id), targetId)
    }
  }

  const nameFolderCache = new Map<string, string>()
  const resolveLegacyFolder = async (folderName: string): Promise<string | null> => {
    const name = cleanText(folderName)
    if (!name) return null
    const key = importFolderKey(null, name)
    if (nameFolderCache.has(key)) return nameFolderCache.get(key) ?? null
    const fine = reusableFolders.get(key) ?? null
    if (fine) {
      reusableFolders.delete(key)
      nameFolderCache.set(key, fine)
      return fine
    }
    const created = await api.saveFolder({ name })
    importedFolderIds.push(created.id)
    nameFolderCache.set(key, created.id)
    return created.id
  }

  const imported: ConnectionModel[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    let name = cleanText(item.name)
    if (!name) continue

    if (existingNames.has(name.toLowerCase())) {
      name = `(new) ${name}`
      while (existingNames.has(name.toLowerCase())) {
        name = `(new) ${name}`
      }
    }
    existingNames.add(name.toLowerCase())

    let folderId: string | null = null
    if (item.folderId && folderIdMap.has(String(item.folderId))) {
      folderId = folderIdMap.get(String(item.folderId)) ?? null
    } else if (item.folderName) {
      folderId = await resolveLegacyFolder(item.folderName)
    }

    const saved = await api.saveConnection({
      name,
      host: item.host,
      port: Number(item.port) || 1433,
      username: item.username || '',
      databaseName: item.database || item.databaseName || '',
      environment: item.environment || '',
      encrypt: item.encrypt !== false,
      trustServerCertificate: item.trustServerCertificate !== false,
      folderId,
      password: item.password || null,
    })

    imported.push(saved)
  }

  return {
    importedCount: imported.length,
    importedFolderCount: importedFolderIds.length,
    connections: await api.listConnections(),
    folders: await api.listFolders(),
  }
}

export const api = {
  appInfo: async (): Promise<SystemInfo> => {
    const res = await callCommand<{ version?: string }>('get_system_info')
    return {
      name: 'Nova Tables',
      version: res?.version || '2.1.0',
    }
  },

  loadSettings: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await callCommand<{ settings?: Record<string, unknown> }>('get_settings')
      if (res?.settings) {
        return res.settings
      }
    } catch {
      // Ignore IPC errors and fall back to localStorage
    }
    try {
      const stored = localStorage.getItem('nova_tables_settings')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore localStorage errors
    }
    return null
  },

  saveSettings: async (settings: unknown): Promise<unknown> => {
    try {
      localStorage.setItem('nova_tables_settings', JSON.stringify(settings))
    } catch {
      // Ignore localStorage errors
    }
    await callCommand('save_settings', { settings })
    return settings
  },

  loadWorkspaceState: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await callCommand<{ workspace?: Record<string, unknown> }>('get_workspace_state')
      if (res?.workspace) {
        return res.workspace
      }
    } catch {
      // Ignore IPC errors and fall back to localStorage
    }
    try {
      const stored = localStorage.getItem('nova_tables_workspace')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore localStorage errors
    }
    return null
  },

  saveWorkspaceState: async (workspace: unknown): Promise<unknown> => {
    try {
      localStorage.setItem('nova_tables_workspace', JSON.stringify(workspace))
    } catch {
      // Ignore localStorage errors
    }
    await callCommand('save_workspace_state', { workspace })
    return workspace
  },

  copyText: async (text: string): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    }
    return true
  },

  saveFile: async (input: unknown): Promise<{ saved?: boolean; filePath?: string; [key: string]: unknown }> => {
    const res = await callCommand<any>('save_file', { input })
    return res || { saved: false }
  },

  onOpenConnection: (_handler: unknown): (() => void) => {
    return () => {}
  },

  onNewConnection: (_handler: unknown): (() => void) => {
    return () => {}
  },

  onPreferences: (_handler: unknown): (() => void) => {
    return () => {}
  },

  listConnections: async (): Promise<ConnectionModel[]> => {
    const res = await callCommand<{ connections?: ConnectionModel[] }>('list_connections')
    const list = res?.connections || []
    return list.map((conn) => ({
      ...conn,
      database: conn.lastDatabaseUsed || conn.databaseName || conn.database || '',
    }))
  },

  getLastConnectedId: async (): Promise<string | null> => {
    try {
      const res = await callCommand<{ workspace?: { activeConnectionId?: string | null } }>(
        'get_workspace_state',
      )
      const activeId = res?.workspace?.activeConnectionId
      if (typeof activeId === 'string' && activeId) return activeId
    } catch {
      // Ignore IPC errors and fall back to localStorage
    }
    try {
      return localStorage.getItem('nova_tables_last_connected_id') || null
    } catch {
      return null
    }
  },

  saveConnection: async (connection: Partial<ConnectionModel>): Promise<ConnectionModel> => {
    const payload: ConnectionModel = {
      ...connection,
      id:
        connection.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      name: connection.name || 'New Connection',
      host: connection.host || '127.0.0.1',
      port: Number(connection.port) || 1433,
      username: connection.username || '',
      databaseName:
        connection.databaseName !== undefined && connection.databaseName !== null
          ? connection.databaseName
          : connection.database || '',
      folderId: connection.folderId || null,
      environment: connection.environment || '',
      encrypt: connection.encrypt !== false,
      trustServerCertificate: connection.trustServerCertificate !== false,
      driverType: connection.driverType,
    }
    const res = await callCommand<{ connection?: ConnectionModel }>('save_connection', {
      connection: payload,
    })
    return res?.connection || payload
  },

  deleteConnection: async (id: string): Promise<unknown> => {
    return callCommand('delete_connection', { id })
  },

  moveConnection: async (id: string, folderId?: string | null): Promise<unknown> => {
    const list = await api.listConnections()
    const existing = list.find((c) => c.id === id)
    if (existing) {
      return api.saveConnection({ ...existing, folderId })
    }
    return callCommand('save_connection', { connection: { id, folderId } })
  },

  exportConnections: async (
    connectionIds: string[] | null | undefined,
    password: string | null | undefined
  ): Promise<{ saved: boolean; count: number }> => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({
        message: 'Password is required to encrypt export',
        code: 'PASSWORD_REQUIRED',
      })
    }

    const bundle = await buildConnectionsBundle(connectionIds)
    if (bundle.connections.length === 0) {
      throw new IpcError({ message: 'No connections found to export', code: 'NO_CONNECTIONS' })
    }

    const encrypted = await encryptExportPayload(
      {
        version: 2,
        exportedAt: new Date().toISOString(),
        ...bundle,
      },
      secret
    )
    const defaultName = `connections-${getYYYYMMDD()}.nova-tables`
    saveFileWithDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'Nova Tables Export', extensions: ['nova-tables'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      content: encrypted,
    })

    return { saved: true, count: bundle.connections.length }
  },

  exportAppConfig: async (
    settings: unknown,
    password: string | null | undefined
  ): Promise<{ saved: boolean; connectionCount: number }> => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({
        message: 'Password is required to encrypt export',
        code: 'PASSWORD_REQUIRED',
      })
    }

    const bundle = await buildConnectionsBundle(null)
    const encrypted = await encryptExportPayload(
      {
        version: 2,
        kind: 'app-config',
        exportedAt: new Date().toISOString(),
        settings: settings ?? null,
        ...bundle,
      },
      secret
    )
    const defaultName = `configs-${getYYYYMMDD()}.nova-tables`
    saveFileWithDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'Nova Tables Config', extensions: ['nova-tables'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      content: encrypted,
    })

    return { saved: true, connectionCount: bundle.connections.length }
  },

  selectImportFile: async (): Promise<{
    canceled: boolean
    filePath?: string
    fileName?: string
    content?: string
  }> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.nova-tables,.json,application/json'
      input.style.display = 'none'
      document.body.appendChild(input)

      let settled = false
      const cleanup = () => {
        if (input.parentNode) {
          input.parentNode.removeChild(input)
        }
      }

      input.addEventListener('change', async () => {
        settled = true
        const file = input.files?.[0]
        cleanup()
        if (!file) {
          resolve({ canceled: true })
          return
        }
        try {
          const content = await file.text()
          resolve({
            canceled: false,
            filePath: file.name,
            fileName: file.name,
            content,
          })
        } catch {
          resolve({ canceled: true })
        }
      })

      input.addEventListener('cancel', () => {
        settled = true
        cleanup()
        resolve({ canceled: true })
      })

      window.addEventListener(
        'focus',
        () => {
          setTimeout(() => {
            if (!settled) {
              cleanup()
              resolve({ canceled: true })
            }
          }, 600)
        },
        { once: true },
      )

      input.click()
    })
  },

  importConnections: async (
    content: string | Record<string, unknown>,
    password: string | null | undefined
  ): Promise<{
    importedCount: number
    importedFolderCount: number
    connections: ConnectionModel[]
    folders: FolderModel[]
  }> => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({
        message: 'Password is required to decrypt connections',
        code: 'PASSWORD_REQUIRED',
      })
    }

    let payload: { connections?: any[]; folders?: any[] }
    try {
      payload = await decryptImportPayload(content, secret)
    } catch (err: any) {
      throw new IpcError({
        message: err?.message || 'Failed to decrypt import file',
        code: err?.code || 'DECRYPT_ERROR',
      })
    }

    return applyImportedConnections(payload)
  },

  importAppConfig: async (
    content: string | Record<string, unknown>,
    password: string | null | undefined
  ): Promise<{
    importedCount: number
    importedFolderCount: number
    connections: ConnectionModel[]
    folders: FolderModel[]
    settings: Record<string, unknown> | null
  }> => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({
        message: 'Password is required to decrypt configuration',
        code: 'PASSWORD_REQUIRED',
      })
    }

    let payload: { connections?: any[]; folders?: any[]; settings?: unknown }
    try {
      payload = await decryptImportPayload(content, secret)
    } catch (err: any) {
      throw new IpcError({
        message: err?.message || 'Failed to decrypt configuration file',
        code: err?.code || 'DECRYPT_ERROR',
      })
    }

    const imported = await applyImportedConnections(payload)
    const settings =
      payload.settings && typeof payload.settings === 'object'
        ? (payload.settings as Record<string, unknown>)
        : null

    return { ...imported, settings }
  },

  listFolders: async (): Promise<FolderModel[]> => {
    const res = await callCommand<{ folders?: FolderModel[] }>('list_folders')
    return res?.folders || []
  },

  saveFolder: async (folder: Partial<FolderModel>): Promise<FolderModel> => {
    const payload: FolderModel = {
      ...folder,
      id:
        folder.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      name: folder.name || 'New Folder',
      parentId: folder.parentId || null,
    }
    const res = await callCommand<{ folder?: FolderModel }>('save_folder', { folder: payload })
    return res?.folder || payload
  },

  deleteFolder: async (id: string): Promise<unknown> => {
    return callCommand('delete_folder', { id })
  },

  reorderTree: async (input: unknown): Promise<{ connections: ConnectionModel[]; folders: FolderModel[]; [key: string]: unknown }> => {
    try {
      localStorage.setItem('nova_tables_tree_order', JSON.stringify(input))
    } catch {}
    const res = await callCommand<any>('reorder_tree', { input })
    return {
      connections: res?.connections || (await api.listConnections()),
      folders: res?.folders || (await api.listFolders()),
      ...(res || {}),
    }
  },

  deleteTree: async (
    input?: { folderIds?: string[]; connectionIds?: string[] } | null
  ): Promise<{
    folderIds: string[]
    connectionIds: string[]
    connections: ConnectionModel[]
    folders: FolderModel[]
  }> => {
    const payload = {
      folderIds: input?.folderIds || [],
      connectionIds: input?.connectionIds || [],
    }
    const res = await callCommand<{
      ok?: boolean
      folderIds?: string[]
      connectionIds?: string[]
      connections?: ConnectionModel[]
      folders?: FolderModel[]
    }>('delete_tree', { input: payload })

    let result: {
      folderIds: string[]
      connectionIds: string[]
      connections: ConnectionModel[]
      folders: FolderModel[]
    }

    if (res && res.ok) {
      result = {
        folderIds: res.folderIds || payload.folderIds,
        connectionIds: res.connectionIds || payload.connectionIds,
        connections: res.connections || (await api.listConnections()),
        folders: res.folders || (await api.listFolders()),
      }
    } else {
      for (const id of payload.connectionIds) {
        await callCommand('delete_connection', { id })
      }
      for (const id of payload.folderIds) {
        await callCommand('delete_folder', { id })
      }
      result = {
        folderIds: payload.folderIds,
        connectionIds: payload.connectionIds,
        connections: await api.listConnections(),
        folders: await api.listFolders(),
      }
    }

    try {
      const stored = localStorage.getItem('nova_tables_tree_order')
      if (stored) {
        const parsed = JSON.parse(stored)
        const connSet = new Set(result.connectionIds)
        const folderSet = new Set(result.folderIds)
        const nextConnections = (parsed.connections || []).filter((id: string) => !connSet.has(id))
        const nextFolders = (parsed.folders || []).filter((id: string) => !folderSet.has(id))
        localStorage.setItem(
          'nova_tables_tree_order',
          JSON.stringify({ connections: nextConnections, folders: nextFolders }),
        )
      }
    } catch {}

    return result
  },

  testConnection: async (connection: Partial<ConnectionModel> | null | undefined): Promise<any> => {
    let target: Partial<ConnectionModel> = connection || {}
    if (connection?.id && (!connection?.host || !connection?.name)) {
      const all = await api.listConnections()
      const found = all.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }
    const res = await callCommand('test_connection', { connection: target })
    return (
      res || {
        ok: true,
        serverName: target.host || '127.0.0.1',
        productVersion: '2022',
        edition: 'Developer Edition',
        elapsedMs: 14,
      }
    )
  },

  connect: async (connection: Partial<ConnectionModel> | null | undefined): Promise<any> => {
    let target: Partial<ConnectionModel> = connection || {}
    if (connection?.id && (!connection?.host || !connection?.name)) {
      const all = await api.listConnections()
      const found = all.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }
    if (!connection?.database && !connection?.databaseName) {
      const preferredDb = target.lastDatabaseUsed || target.database || target.databaseName || ''
      if (preferredDb) {
        target.database = preferredDb
      }
    }
    const res =
      (await callCommand('connect', { input: target })) ||
      (await callCommand('test_connection', { connection: target }))
    try {
      if (target?.id) {
        localStorage.setItem('nova_tables_last_connected_id', target.id)
      }
    } catch {
      // Ignore localStorage errors
    }
    return {
      connectionId: target?.id || 'session-1',
      name: target?.name || 'SQL Server',
      host: target?.host || '127.0.0.1',
      port: target?.port || 1433,
      database: res?.database || target?.database || target?.lastDatabaseUsed || target?.databaseName || 'master',
      databases: [
        { name: 'master', isSystem: true, isOnline: true },
        { name: 'model', isSystem: true, isOnline: true },
        { name: 'msdb', isSystem: true, isOnline: true },
        { name: 'tempdb', isSystem: true, isOnline: true },
      ],
      serverVersion: 'Microsoft SQL Server',
      serverName: target?.host || '127.0.0.1',
      edition: 'Developer Edition',
      ...(res || {}),
    }
  },

  updateLastDatabase: async (connectionId: string, database: string): Promise<unknown> => {
    return callCommand('update_last_database', { connectionId, database })
  },

  disconnect: async (connectionId: string): Promise<unknown> => {
    return callCommand('disconnect_database', { connectionId })
  },

  listDatabases: async (connectionId: string): Promise<DatabaseInfo[]> => {
    const res = await callCommand<{ databases?: DatabaseInfo[] }>('list_databases', {
      connectionId,
    })
    return (
      res?.databases || [
        { name: 'master', isSystem: true, isOnline: true },
        { name: 'model', isSystem: true, isOnline: true },
        { name: 'msdb', isSystem: true, isOnline: true },
        { name: 'tempdb', isSystem: true, isOnline: true },
      ]
    )
  },

  dropDatabase: async (input: { connectionId: string; database: string; confirmName?: string; acknowledged?: boolean; [key: string]: unknown }): Promise<unknown> => {
    return callCommand('drop_database', { input })
  },

  listDatabaseUsers: async (
    connectionId: string,
    database: string
  ): Promise<DatabaseUser[]> => {
    const res = await callCommand<{ users?: DatabaseUser[] }>('list_database_users', {
      connectionId,
      database,
    })
    return res?.users || []
  },

  createDatabaseUser: async (input: {
    connectionId: string
    database: string
    name: string
    loginName?: string | null
    withoutLogin?: boolean
    password?: string | null
    roles?: string[]
  }): Promise<unknown> => {
    return callCommand('create_database_user', { input })
  },

  updateDatabaseUserRoles: async (input: {
    connectionId: string
    database: string
    name: string
    roles: string[]
  }): Promise<unknown> => {
    return callCommand('update_database_user_roles', { input })
  },

  dropDatabaseUser: async (input: {
    connectionId: string
    database: string
    name: string
  }): Promise<unknown> => {
    return callCommand('drop_database_user', { input })
  },

  listTables: async (connectionId: string, database: string): Promise<TableSummary[]> => {
    const res = await callCommand<{ tables?: TableSummary[] }>('list_tables', {
      connectionId,
      database,
    })
    return res?.tables || []
  },

  listColumns: async (connectionId: string, database: string): Promise<ColumnSummary[]> => {
    const res = await callCommand<{ columns?: ColumnSummary[] }>('list_columns', {
      connectionId,
      database,
    })
    return res?.columns || []
  },

  tableStructure: async (
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TableStructureResult> => {
    const res = await callCommand<any>('table_structure', {
      connectionId,
      database,
      schema,
      table,
    })
    const targetSchema = schema || 'dbo'
    const targetTable = table || ''
    return {
      schema: res?.schema || targetSchema,
      table: res?.table || targetTable,
      objectName: res?.objectName || `[${targetSchema}].[${targetTable}]`,
      statement: res?.statement || '',
      columns: Array.isArray(res?.columns) ? res.columns : [],
      primaryKey: Array.isArray(res?.primaryKey) ? res.primaryKey : [],
      uniqueKeys: Array.isArray(res?.uniqueKeys) ? res.uniqueKeys : [],
      foreignKeys: Array.isArray(res?.foreignKeys) ? res.foreignKeys : [],
      indexes: Array.isArray(res?.indexes) ? res.indexes : [],
    }
  },

  tableRelations: async (
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TableRelation[]> => {
    const res = await callCommand<{ relations?: TableRelation[] }>('table_relations', {
      connectionId,
      database,
      schema,
      table,
    })
    return res?.relations || []
  },

  listModules: async (connectionId: string, database: string): Promise<DatabaseModule[]> => {
    const res = await callCommand<{ modules?: DatabaseModule[] }>('list_modules', {
      connectionId,
      database,
    })
    return res?.modules || []
  },

  moduleDefinition: async (
    connectionId: string,
    database: string,
    schema: string,
    name: string,
    type?: string
  ): Promise<{ definition?: string; statement?: string; [key: string]: unknown }> => {
    const res = await callCommand<any>('module_definition', {
      connectionId,
      database,
      schema,
      name,
      moduleType: type,
    })
    return res || { definition: '' }
  },

  describeResult: async (
    connectionId: string,
    database: string,
    sql: string
  ): Promise<ColumnSummary[]> => {
    const res = await callCommand<{ columns?: ColumnSummary[] }>('describe_result', {
      connectionId,
      database,
      sql,
    })
    return res?.columns || []
  },

  runQuery: async (input: {
    connectionId: string
    database: string
    sql: string
    maxRows?: number
    recordHistory?: boolean
  }): Promise<QueryResult> => {
    const res = await callCommand<QueryResult>('execute_query', input)
    return (
      res || {
        ok: true,
        resultSets: [],
        messages: [],
        rowsAffected: [0],
        elapsedMs: 0,
        rowCount: 0,
        truncated: false,
        maxRows: 20000,
      }
    )
  },

  getExecutionPlan: async (input: {
    connectionId: string
    database: string
    sql: string
  }): Promise<ExecutionPlanResult> => {
    const res = await callCommand<ExecutionPlanResult>('get_execution_plan', input)
    return res || { plan: null }
  },

  listQueryHistory: async (
    connectionId: string,
    database: string,
    limit?: number
  ): Promise<QueryHistoryItem[]> => {
    const res = await callCommand<{ history?: QueryHistoryItem[] }>('list_query_history', {
      connectionId,
      database,
      limit,
    })
    return res?.history || []
  },

  clearQueryHistory: async (connectionId: string, database: string): Promise<unknown> => {
    return callCommand('clear_query_history', { connectionId, database })
  },

  deleteQueryHistory: async (id: string): Promise<unknown> => {
    return callCommand('delete_query_history', { id })
  },

  listSavedQueries: async (connectionId: string, database: string): Promise<SavedQueryItem[]> => {
    const res = await callCommand<{ queries?: SavedQueryItem[] }>('list_saved_queries', {
      connectionId,
      database,
    })
    return res?.queries || []
  },

  saveSavedQuery: async (input: {
    connectionId?: string | null
    databaseName?: string | null
    name: string
    sql: string
  }): Promise<SavedQueryItem | null> => {
    const res = await callCommand<{ query?: SavedQueryItem }>('save_saved_query', { input })
    return res?.query || null
  },

  renameSavedQuery: async (input: {
    id: string
    name: string
  }): Promise<SavedQueryItem | null> => {
    const res = await callCommand<{ query?: SavedQueryItem }>('rename_saved_query', { input })
    return res?.query || null
  },

  deleteSavedQuery: async (id: string): Promise<unknown> => {
    return callCommand('delete_saved_query', { id })
  },
}
