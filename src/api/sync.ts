import { getSyncIntervalMs } from '@/config/syncConfig'
import { apiRequest, getAuthToken } from './client'
import { callCommand } from './ipc'

export type SyncStatus = 'idle' | 'syncing' | 'error'

let syncStatus: SyncStatus = 'idle'
let syncTimer: ReturnType<typeof setInterval> | null = null
let currentIntervalMs = getSyncIntervalMs()
let isEnabled = false
let isSyncing = false
const listeners: Set<(status: SyncStatus) => void> = new Set()

function setStatus(next: SyncStatus): void {
  if (syncStatus === next) return
  syncStatus = next
  listeners.forEach((listener) => {
    try {
      listener(syncStatus)
    } catch {
    }
  })
}

export async function pullSync(): Promise<void> {
  const token = getAuthToken()
  if (!token) return

  const [connectionsRes, foldersRes, savedQueriesRes, queryHistoryRes, settingsRes, workspaceRes] =
    await Promise.allSettled([
      apiRequest<{ ok: boolean; connections?: unknown[] }>('/api/member/connections'),
      apiRequest<{ ok: boolean; folders?: unknown[] }>('/api/member/folders'),
      apiRequest<{ ok: boolean; queries?: unknown[] }>('/api/member/saved-queries'),
      apiRequest<{ ok: boolean; history?: unknown[] }>('/api/member/query-history?limit=500'),
      apiRequest<{ ok: boolean; value?: unknown }>('/api/member/meta/settings'),
      apiRequest<{ ok: boolean; value?: unknown }>('/api/member/meta/workspace'),
    ])

  if (connectionsRes.status === 'fulfilled') {
    const connections = connectionsRes.value?.connections
    if (Array.isArray(connections)) {
      for (const conn of connections) {
        if (!conn) continue
        const c = conn as Record<string, unknown>
        const id = (c.uid || c.id) as string | undefined
        if (!id) continue
        const payload = {
          id,
          uid: id,
          name: c.name || '',
          host: c.host || '',
          port: c.port || 1433,
          username: c.username || '',
          password: c.password || c.password_cipher || null,
          databaseName: c.database_name || c.databaseName || c.database || '',
          environment: c.environment || '',
          encrypt: c.encrypt ?? true,
          trustServerCertificate: c.trust_server_certificate ?? c.trustServerCertificate ?? true,
          driverType: c.driver_type || c.driverType || 'sqlserver',
          folderId: c.folder_id || c.folderId || null,
          timezone: c.timezone || null,
          lastDatabaseUsed: c.last_database_used || c.lastDatabaseUsed || null,
          lastConnectedAt: c.last_connected_at || c.lastConnectedAt || null,
          _fromServer: true,
        }
        await callCommand('local_upsert_connection', { input: payload }).catch(() => null)
      }
    }
  }

  if (foldersRes.status === 'fulfilled') {
    const folders = foldersRes.value?.folders
    if (Array.isArray(folders)) {
      for (const folder of folders) {
        if (!folder) continue
        const f = folder as Record<string, unknown>
        const id = (f.uid || f.id) as string | undefined
        if (!id) continue
        const payload = {
          id,
          uid: id,
          name: f.name || '',
          parentId: f.parent_id || f.parentId || null,
          _fromServer: true,
        }
        await callCommand('local_upsert_folder', { input: payload }).catch(() => null)
      }
    }
  }

  if (savedQueriesRes.status === 'fulfilled') {
    const queries = savedQueriesRes.value?.queries
    if (Array.isArray(queries)) {
      for (const query of queries) {
        if (!query) continue
        const q = query as Record<string, unknown>
        const id = (q.uid || q.id) as string | undefined
        if (!id) continue
        const payload = {
          id,
          uid: id,
          connectionId: q.connection_id || q.connectionId || null,
          databaseName: q.database_name || q.databaseName || '',
          name: q.name || '',
          sql: q.sql || '',
          _fromServer: true,
        }
        await callCommand('local_upsert_saved_query', { input: payload }).catch(() => null)
      }
    }
  }

  if (queryHistoryRes.status === 'fulfilled') {
    const history = queryHistoryRes.value?.history
    if (Array.isArray(history)) {
      for (const item of history) {
        if (!item) continue
        const h = item as Record<string, unknown>
        const sql = (h.sql as string) || ''
        if (!sql) continue
        await callCommand('local_upsert_query_history_from_server', {
          input: {
            uid: h.uid || h.id || String(Date.now()),
            user_id: h.user_id,
            connectionId: h.connection_id || h.connectionId || null,
            databaseName: h.database_name || h.databaseName || h.database || '',
            sql,
            status: h.status || 'success',
            durationMs: h.duration_ms || h.durationMs || 0,
            rowCount: h.row_count || h.rowCount || 0,
            errorMessage: h.error_message || h.errorMessage || null,
            createdAt: h.created_at || h.createdAt || new Date().toISOString(),
          },
        }).catch(() => null)
      }
    }
  }

  if (settingsRes.status === 'fulfilled') {
    const value = settingsRes.value?.value
    if (value !== undefined) {
      await callCommand('local_upsert_meta_from_server', { key: 'settings', value }).catch(() => null)
    }
  }

  if (workspaceRes.status === 'fulfilled') {
    const value = workspaceRes.value?.value
    if (value !== undefined) {
      await callCommand('local_upsert_meta_from_server', { key: 'workspace', value }).catch(() => null)
    }
  }
}

export async function pushSync(): Promise<{ synced: number; cleaned: number }> {
  const token = getAuthToken()
  if (!token) {
    return { synced: 0, cleaned: 0 }
  }

  const unsyncedRes = await callCommand<{
    ok: boolean
    folders: unknown[]
    connections: unknown[]
    savedQueries: unknown[]
    queryHistory: unknown[]
    meta: unknown[]
  }>('local_unsynced_batch').catch(() => null)

  const folders = unsyncedRes?.folders || []
  const connections = unsyncedRes?.connections || []
  const savedQueries = unsyncedRes?.savedQueries || []
  const queryHistory = unsyncedRes?.queryHistory || []
  const meta = unsyncedRes?.meta || []

  const total = folders.length + connections.length + savedQueries.length + queryHistory.length + meta.length
  if (total === 0) {
    return { synced: 0, cleaned: 0 }
  }

  const payload = {
    folders,
    connections,
    savedQueries,
    queryHistory,
    meta,
  }

  const res = await apiRequest<{ ok: boolean; synced?: Record<string, unknown[]> }>('/api/member/sync/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const confirmed = res?.synced || {}
  const cleanedRes = await callCommand<{
    ok: boolean
    cleanedFolders: number
    cleanedConnections: number
    cleanedSavedQueries: number
    cleanedQueryHistory: number
    cleanedMeta: number
  }>('local_clean_synced_batch', { confirmed }).catch(() => null)

  const syncedCount = Object.values(confirmed).reduce(
    (acc: number, v: unknown) => acc + (Array.isArray(v) ? v.length : 0),
    0,
  )
  const cleanedCount =
    (cleanedRes?.cleanedFolders || 0) +
    (cleanedRes?.cleanedConnections || 0) +
    (cleanedRes?.cleanedSavedQueries || 0) +
    (cleanedRes?.cleanedQueryHistory || 0) +
    (cleanedRes?.cleanedMeta || 0)

  return { synced: syncedCount, cleaned: cleanedCount }
}

export async function syncAll(): Promise<{ synced: number; cleaned: number }> {
  if (isSyncing) {
    return { synced: 0, cleaned: 0 }
  }
  const token = getAuthToken()
  if (!token) {
    return { synced: 0, cleaned: 0 }
  }

  isSyncing = true
  setStatus('syncing')
  try {
    const pushResult = await pushSync()
    await pullSync()
    setStatus('idle')
    return pushResult
  } catch {
    setStatus('error')
    return { synced: 0, cleaned: 0 }
  } finally {
    isSyncing = false
  }
}

export const syncService = {
  start(): void {
    if (isEnabled) return
    isEnabled = true
    currentIntervalMs = getSyncIntervalMs()
    syncTimer = setInterval(() => {
      void syncAll()
    }, currentIntervalMs)
    void syncAll()
  },

  stop(): void {
    isEnabled = false
    if (syncTimer) {
      clearInterval(syncTimer)
      syncTimer = null
    }
  },

  getIntervalMs(): number {
    return currentIntervalMs
  },

  getStatus(): SyncStatus {
    return syncStatus
  },

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  isEnabled: (): boolean => isEnabled,

  triggerSync(): void {
    void syncAll()
  },
}