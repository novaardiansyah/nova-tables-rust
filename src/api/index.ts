import { openUrl } from '@tauri-apps/plugin-opener'
import {
  AuthSession,
  AuthUser,
  ColumnSummary,
  ConnectionModel,
  DatabaseInfo,
  DatabaseModule,
  DatabaseUserDetail,
  ExecutionPlanResult,
  FolderModel,
  QueryHistoryItem,
  QueryResult,
  SavedQueryItem,
  ServerLoginItem,
  SystemInfo,
  TableColumnsSummary,
  TableRelation,
  ErdData,
  ErdTable,
  ErdRelation,
  TableStructureResult,
  TableSummary,
} from './types'
import {
  apiRequest,
  getAuthToken,
  getRefreshToken,
  getStoredSession,
  notifyUnauthenticated,
  onUnauthenticated,
  setAuthToken,
  setRefreshToken,
  setStoredSession,
} from './client'
import {
  exportAppConfig,
  exportConnections,
  importAppConfig,
  importConnections,
  selectImportFile,
} from './transfer'
import {
  isCiphertext,
  encryptConnectionPassword,
  decryptConnectionPassword,
} from './crypto'
import { callCommand, isTauri } from './ipc'
import { createDatabaseOps } from './database'

export * from './types'
export {
  getAuthToken,
  getRefreshToken,
  notifyUnauthenticated,
  onUnauthenticated,
  setAuthToken,
  setRefreshToken,
} from './client'

function legacyCopyText(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

// Database operations are delegated to a separate module that calls Tauri commands directly.
// It receives listConnections/updateLastDatabase/openExternal context from this api object.
const databaseOps = createDatabaseOps({
  listConnections: async () => {
    const res = await apiRequest<{ ok: boolean; connections?: ConnectionModel[] }>('/api/member/connections')
    if (!res?.ok || !res?.connections) return []
    return res.connections
  },
  updateLastDatabase: async (connectionId: string, database: string) => {
    await apiRequest<{ ok: boolean }>(`/api/member/connections/${connectionId}/last-database`, {
      method: 'PATCH',
      body: JSON.stringify({ database }),
    }).catch(() => null)
    return { ok: true }
  },
  openExternal: (url: string) => api.openExternal(url),
})

export const api = {
  ...databaseOps,
  registerUser: async (email: string, password: string, name?: string): Promise<AuthUser> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      throw new Error('Email is required.')
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.')
    }

    const res = await apiRequest<{ ok: boolean; email: string; user: AuthUser }>('/api/member/register', {
      method: 'POST',
      body: JSON.stringify({ email: trimmedEmail, password, name }),
    })

    return res.user
  },

  loginUser: async (email: string, password: string): Promise<AuthUser> => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      throw new Error('Email and password are required.')
    }

    const res = await apiRequest<{ ok: boolean; token: string; refreshToken?: string; user: AuthUser }>('/api/member/login', {
      method: 'POST',
      body: JSON.stringify({ email: trimmedEmail, password }),
    })

    setAuthToken(res.token)
    if (res.refreshToken) {
      setRefreshToken(res.refreshToken)
    }
    setStoredSession({ user: res.user, token: res.token, refreshToken: res.refreshToken })
    return res.user
  },

  signInWithGoogle: async (): Promise<AuthUser> => {
    let port = 0
    let redirectUri: string | undefined
    let listenerStarted = false

    try {
      const listener = await callCommand<{ port: number; redirectUri: string }>('start_oauth_listener', { state: '' })
      if (listener?.port) {
        port = listener.port
        redirectUri = listener.redirectUri
        listenerStarted = true
      }
    } catch {
    }

    const redirectRes = await apiRequest<{ ok: boolean; url: string; state: string }>(
      `/api/member/google/redirect${port > 0 ? `?port=${port}` : ''}`
    )

    if (!redirectRes?.url) {
      throw new Error('Failed to obtain Google authorization URL.')
    }

    await api.openExternal(redirectRes.url)

    const startTime = Date.now()
    const timeoutMs = 180000

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 1500))

      if (listenerStarted) {
        try {
          const localCheck = await callCommand<{ status: string; code?: string; error?: string }>('check_oauth_result', {
            state: redirectRes.state,
          })

          if (localCheck?.status === 'completed' && localCheck.code) {
            const exchangeRes = await apiRequest<{ ok: boolean; token: string; refreshToken?: string; user: AuthUser }>(
              '/api/member/google/exchange',
              {
                method: 'POST',
                body: JSON.stringify({ code: localCheck.code, redirectUri }),
              }
            )

            setAuthToken(exchangeRes.token)
            if (exchangeRes.refreshToken) {
              setRefreshToken(exchangeRes.refreshToken)
            }
            setStoredSession({ user: exchangeRes.user, token: exchangeRes.token, refreshToken: exchangeRes.refreshToken })
            return exchangeRes.user
          }

          if (localCheck?.status === 'failed') {
            throw new Error(localCheck.error || 'Authentication cancelled or failed.')
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('not found') && !e.message.includes('pending')) {
            throw e
          }
        }
      }
    }

    try {
      const statusRes = await apiRequest<{ ok: boolean; status: string; token?: string; refreshToken?: string; user?: AuthUser; message?: string }>(
        `/api/member/google/status/${encodeURIComponent(redirectRes.state)}`
      )

      if (statusRes.status === 'completed' && statusRes.token && statusRes.user) {
        setAuthToken(statusRes.token)
        if (statusRes.refreshToken) {
          setRefreshToken(statusRes.refreshToken)
        }
        setStoredSession({ user: statusRes.user, token: statusRes.token, refreshToken: statusRes.refreshToken })
        return statusRes.user
      }

      if (statusRes.status === 'failed') {
        throw new Error(statusRes.message || 'Google authentication was cancelled or failed.')
      }

      if (statusRes.status === 'expired') {
        throw new Error('Authentication session expired. Please try again.')
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('cancelled') || err.message.includes('failed') || err.message.includes('expired'))) {
        throw err
      }
    }

    throw new Error('Authentication timed out. Please try again.')
  },

  verifyRegistrationOtp: async (email: string, otp: string): Promise<{ ok: boolean; user: AuthUser; message?: string }> => {
    const res = await apiRequest<{ ok: boolean; user: AuthUser; message?: string }>('/api/member/register/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
    })
    return res
  },

  verifyResetOtp: async (email: string, otp: string): Promise<{ ok: boolean; resetToken: string; message?: string }> => {
    const res = await apiRequest<{ ok: boolean; resetToken: string; message?: string }>('/api/member/verify-reset-otp', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
    })
    return res
  },

  resetPassword: async (
    email: string,
    password: string,
    confirmPassword: string,
    resetToken: string
  ): Promise<{ ok: boolean; message: string }> => {
    const res = await apiRequest<{ ok: boolean; message: string }>('/api/member/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, password_confirmation: confirmPassword, resetToken }),
    })
    return res
  },

  forgotPassword: async (email: string): Promise<{ ok: boolean; message: string }> => {
    const res = await apiRequest<{ ok: boolean; message: string }>('/api/member/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    return res
  },

  getCurrentSession: async (): Promise<AuthSession | null> => {
    const token = getAuthToken()
    if (!token) {
      return null
    }

    try {
      const res = await apiRequest<{ ok: boolean; user: AuthUser }>('/api/member/me')
      const refreshToken = getRefreshToken()
      const session: AuthSession = { user: res.user, token: getAuthToken() || token, refreshToken }
      setStoredSession(session)
      return session
    } catch {
      setAuthToken(null)
      setRefreshToken(null)
      setStoredSession(null)
      return null
    }
  },

  logout: async (): Promise<void> => {
    try {
      const refreshToken = getRefreshToken()
      await apiRequest('/api/member/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
    } finally {
      setAuthToken(null)
      setRefreshToken(null)
      setStoredSession(null)
    }
  },

  appInfo: async (): Promise<SystemInfo> => {
    const res = await callCommand<{ version?: string }>('get_system_info')
    return {
      name: 'Nova Tables',
      version: res?.version || '2.2.8',
    }
  },

  loadSettings: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/settings', {
        method: 'GET',
      })
      const value = res?.value ?? null
      if (value === undefined || value === null) return null
      const raw = typeof value === 'string' ? JSON.parse(value) : value
      if (!raw) return null
      return raw
    } catch {
      return null
    }
  },

  saveSettings: async (settings: unknown): Promise<unknown> => {
    await apiRequest('/api/member/meta/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    })
    return settings
  },

  loadWorkspaceState: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/workspace', {
        method: 'GET',
      })
      const value = res?.value ?? null
      if (value === undefined || value === null) return null
      const raw = typeof value === 'string' ? JSON.parse(value) : value
      if (!raw) return null
      return raw
    } catch {
      return null
    }
  },

  saveWorkspaceState: async (workspace: unknown): Promise<unknown> => {
    await apiRequest('/api/member/meta/workspace', {
      method: 'POST',
      body: JSON.stringify(workspace),
    })
    return workspace
  },

  copyText: async (text: string): Promise<boolean> => {
    const value = String(text ?? '')
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(value)
        return true
      } catch {
      }
    }
    return legacyCopyText(value)
  },

  openExternal: async (url: string): Promise<void> => {
    if (isTauri()) {
      try {
        await openUrl(url)
        return
      } catch {
      }
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  },

  saveFile: async (input: unknown): Promise<{ saved?: boolean; filePath?: string; [key: string]: unknown }> => {
    const res = await callCommand<any>('save_file', { input })
    return res || { saved: false }
  },

  onOpenConnection: (_handler: unknown): (() => void) => {
    return () => { }
  },

  onNewConnection: (_handler: unknown): (() => void) => {
    return () => { }
  },

  onPreferences: (_handler: unknown): (() => void) => {
    return () => { }
  },

  listConnections: async (): Promise<ConnectionModel[]> => {
    const res = await apiRequest<{ ok: boolean; connections?: ConnectionModel[]; lastConnectedId?: string | null }>('/api/member/connections')
    if (!res?.ok || !res?.connections) return []

    if (res.lastConnectedId) {
      try {
        localStorage.setItem('nova_tables_last_connected_id', res.lastConnectedId)
      } catch {
      }
    }

    const localList: ConnectionModel[] = res.connections.map((conn) => {
      const explicitDb =
        conn.databaseName !== undefined && conn.databaseName !== null
          ? conn.databaseName
          : conn.database !== undefined && conn.database !== null
            ? conn.database
            : conn.lastDatabaseUsed || ''
      const password = conn.password ?? null
      const hasPassword = Boolean(conn.hasPassword || (password && password.length > 0))
      return {
        ...conn,
        password,
        database: explicitDb,
        databaseName: explicitDb,
        hasPassword,
      }
    })

    try {
      const metaRes = await apiRequest<{ ok: boolean; value: unknown }>('/api/member/meta/tree_order').catch(() => null)
      if (metaRes?.value) {
        const parsed = typeof metaRes.value === 'string' ? JSON.parse(metaRes.value) : metaRes.value
        const order = (parsed.connections || []) as string[]
        const orderMap = new Map<string, number>(order.map((id, idx) => [id, idx] as [string, number]))
        localList.sort((a, b) => {
          const idA = String(a.id || (a as any).uid)
          const idB = String(b.id || (b as any).uid)
          const idxA = orderMap.has(idA) ? orderMap.get(idA)! : 999999
          const idxB = orderMap.has(idB) ? orderMap.get(idB)! : 999999
          return idxA - idxB
        })
      }
    } catch {
    }

    return localList
  },

  getLastConnectedId: async (): Promise<string | null> => {
    try {
      const res = await apiRequest<{ ok: boolean; value: unknown }>('/api/member/meta/last_connected_id', {
        method: 'GET',
      }).catch(() => null)
      const value = res?.value
      if (typeof value === 'string' && value) return value
      if (value && typeof value === 'object' && 'value' in (value as any)) {
        const inner = (value as any).value
        if (typeof inner === 'string' && inner) return inner
      }
    } catch {
    }
    try {
      const cached = localStorage.getItem('nova_tables_last_connected_id')
      if (cached) return cached
    } catch {
    }
    return null
  },

  setLastConnectedId: async (id: string | null): Promise<void> => {
    if (!id) return
    try {
      localStorage.setItem('nova_tables_last_connected_id', id)
    } catch {
    }
    await Promise.allSettled([
      apiRequest('/api/member/meta/last_connected_id', {
        method: 'POST',
        body: JSON.stringify({ value: id }),
      }),
      apiRequest(`/api/member/connections/${id}/touch`, {
        method: 'POST',
      }),
    ])
  },

  getPinnedTables: async (connectionId: string): Promise<string[]> => {
    try {
      const res = await apiRequest<{ ok: boolean; tables: string[] }>(`/api/member/connections/${connectionId}/pinned-tables`, {
        method: 'GET',
      })
      return Array.isArray(res?.tables) ? res.tables : []
    } catch {
      return []
    }
  },

  savePinnedTables: async (connectionId: string, tables: string[]): Promise<string[]> => {
    try {
      const res = await apiRequest<{ ok: boolean; tables: string[] }>(`/api/member/connections/${connectionId}/pinned-tables`, {
        method: 'POST',
        body: JSON.stringify({ tables }),
      })
      return Array.isArray(res?.tables) ? res.tables : []
    } catch {
      return tables
    }
  },

  saveConnection: async (connection: Partial<ConnectionModel>): Promise<ConnectionModel> => {
    let id = connection.id
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID()
      } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(16)
        crypto.getRandomValues(bytes)
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
        id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      } else {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        })
      }
    }
    let resolvedPassword = connection.password ?? null
    if (resolvedPassword && !isCiphertext(resolvedPassword)) {
      resolvedPassword = await encryptConnectionPassword(resolvedPassword, id)
    }

    const payload: Record<string, unknown> = {
      ...connection,
      id,
    }
    if (resolvedPassword !== null) {
      payload.password = resolvedPassword
    }

    await apiRequest('/api/member/connections', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => null)

    const explicitDb = (connection.databaseName || connection.database || '') as string
    return {
      ...connection,
      id,
      password: resolvedPassword,
      database: explicitDb,
      databaseName: explicitDb,
      hasPassword: Boolean(resolvedPassword && resolvedPassword.length > 0),
    }
  },

  duplicateConnection: async (id: string, name?: string): Promise<ConnectionModel> => {
    const list = await api.listConnections()
    const target = list.find((c) => c.id === id)
    if (!target) {
      throw new Error(`Connection ${id} not found`)
    }

    const rawPassword = target.password && target.id
      ? await decryptConnectionPassword(target.password, target.id)
      : null

    const duplicatePayload = {
      ...target,
      id: undefined,
      password: rawPassword,
      name: name || `${target.name} (Copy)`,
    }

    return api.saveConnection(duplicatePayload)
  },

  deleteConnection: async (id: string): Promise<unknown> => {
    await apiRequest(`/api/member/connections/${id}`, {
      method: 'DELETE',
    }).catch(() => null)
    try {
      const lastId = await api.getLastConnectedId()
      if (lastId === id) {
        await api.setLastConnectedId(null)
      }
    } catch {
    }
    return { ok: true }
  },

  updateLastDatabase: async (connectionId: string, database: string): Promise<unknown> => {
    await apiRequest<{ ok: boolean }>(`/api/member/connections/${connectionId}/last-database`, {
      method: 'PATCH',
      body: JSON.stringify({ database }),
    }).catch(() => null)
    return { ok: true }
  },

  moveConnection: async (id: string, folderId?: string | null): Promise<unknown> => {
    const list = await api.listConnections()
    const existing = list.find((c) => c.id === id)
    if (existing) {
      return api.saveConnection({ ...existing, folderId })
    }
    return null
  },

  exportConnections,
  exportAppConfig,
  selectImportFile,
  importConnections,
  importAppConfig,

  listFolders: async (): Promise<FolderModel[]> => {
    const res = await apiRequest<{ ok: boolean; folders?: FolderModel[] }>('/api/member/folders')
    if (!res?.ok || !res?.folders) return []

    const localList: FolderModel[] = res.folders || []

    try {
      const metaRes = await apiRequest<{ ok: boolean; value: unknown }>('/api/member/meta/tree_order').catch(() => null)
      if (metaRes?.value) {
        const parsed = typeof metaRes.value === 'string' ? JSON.parse(metaRes.value) : metaRes.value
        const order = (parsed.folders || []) as string[]
        const orderMap = new Map<string, number>(order.map((id, idx) => [id, idx] as [string, number]))
        localList.sort((a, b) => {
          const idA = String(a.id || (a as any).uid || '')
          const idB = String(b.id || (b as any).uid || '')
          const idxA = orderMap.has(idA) ? orderMap.get(idA)! : 999999
          const idxB = orderMap.has(idB) ? orderMap.get(idB)! : 999999
          return idxA - idxB
        })
      }
    } catch {
    }

    return localList
  },

  saveFolder: async (folder: Partial<FolderModel>): Promise<FolderModel> => {
    const id = folder.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3f) | 0x80
      return v.toString(16)
    }))

    const folderWithId: FolderModel = {
      ...(folder as FolderModel),
      id,
    }

    await apiRequest('/api/member/folders', {
      method: 'POST',
      body: JSON.stringify(folderWithId),
    }).catch(() => null)

    return folderWithId
  },

  deleteFolder: async (id: string): Promise<{ ok?: boolean; deletedConnectionIds?: string[] } | null> => {
    const res = await apiRequest<{ ok?: boolean; deletedConnectionIds?: string[] }>(`/api/member/folders/${id}`, {
      method: 'DELETE',
    }).catch(() => null)
    return res || { ok: true, deletedConnectionIds: [] }
  },

  reorderTree: async (input: unknown): Promise<{ connections: ConnectionModel[]; folders: FolderModel[]; [key: string]: unknown }> => {
    const payload = (input || {}) as {
      connections?: string[]
      folders?: string[]
      connectionFolders?: Record<string, string | null>
      folderParents?: Record<string, string | null>
    }

    if (payload.connectionFolders && Object.keys(payload.connectionFolders).length > 0) {
      const currentConnections = await api.listConnections()
      for (const [cId, targetFolderId] of Object.entries(payload.connectionFolders)) {
        const found = currentConnections.find((c) => c.id === cId)
        if (found) {
          await api.saveConnection({
            ...found,
            folderId: targetFolderId,
          }).catch(() => null)
        }
      }
    }

    if (payload.folderParents && Object.keys(payload.folderParents).length > 0) {
      const currentFolders = await api.listFolders()
      for (const [fId, targetParentId] of Object.entries(payload.folderParents)) {
        const found = currentFolders.find((f) => f.id === fId)
        if (found) {
          await api.saveFolder({
            ...found,
            parentId: targetParentId,
          }).catch(() => null)
        }
      }
    }

    await apiRequest('/api/member/meta/tree_order', {
      method: 'POST',
      body: JSON.stringify({
        connections: payload.connections || [],
        folders: payload.folders || [],
      }),
    }).catch(() => null)

    return {
      connections: await api.listConnections(),
      folders: await api.listFolders(),
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
    const folderIds = input?.folderIds || []
    const connectionIds = [...(input?.connectionIds || [])]

    for (const fId of folderIds) {
      try {
        const res = (await api.deleteFolder(fId)) as { ok?: boolean; deletedConnectionIds?: string[] } | null
        if (res && Array.isArray(res.deletedConnectionIds)) {
          for (const cId of res.deletedConnectionIds) {
            if (!connectionIds.includes(cId)) {
              connectionIds.push(cId)
            }
          }
        }
      } catch {
      }
    }

    for (const cId of input?.connectionIds || []) {
      try {
        await api.deleteConnection(cId)
      } catch {
      }
    }

    const lastId = await api.getLastConnectedId().catch(() => null)
    if (lastId && connectionIds.includes(lastId)) {
      await api.setLastConnectedId(null)
    }

    return {
      folderIds,
      connectionIds,
      connections: await api.listConnections(),
      folders: await api.listFolders(),
    }
  },

  listQueryHistory: async (
    connectionId: string,
    database: string,
    limit?: number
  ): Promise<QueryHistoryItem[]> => {
    const res = await apiRequest<{ ok: boolean; history?: QueryHistoryItem[] }>(`/api/member/query-history?limit=${limit || 30}&connectionId=${encodeURIComponent(connectionId)}&database=${encodeURIComponent(database)}`, {
      method: 'GET',
    }).catch(() => null)
    return res?.history || []
  },

  clearQueryHistory: async (connectionId: string, database: string, ids?: string[]): Promise<unknown> => {
    await apiRequest('/api/member/query-history/clear', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, database, ids, limit: 30 }),
    }).catch(() => null)
    return { ok: true }
  },

  deleteQueryHistory: async (id: string): Promise<unknown> => {
    await apiRequest(`/api/member/query-history/${id}`, {
      method: 'DELETE',
    }).catch(() => null)
    return { ok: true }
  },

  listSavedQueries: async (connectionId: string, database: string): Promise<SavedQueryItem[]> => {
    const res = await apiRequest<{ ok: boolean; queries?: SavedQueryItem[] }>('/api/member/saved-queries', {
      method: 'GET',
    }).catch(() => null)
    return res?.queries || []
  },

  saveSavedQuery: async (input: {
    id?: string | null
    connectionId?: string | null
    databaseName?: string | null
    name: string
    sql: string
  }): Promise<SavedQueryItem | null> => {
    const id = input.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3f) | 0x80
      return v.toString(16)
    }))

    const payload: { id: string; connectionId?: string | null; databaseName?: string | null; name: string; sql: string } = {
      id,
      connectionId: input.connectionId,
      databaseName: input.databaseName,
      name: input.name,
      sql: input.sql,
    }

    await apiRequest('/api/member/saved-queries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => null)

    return payload
  },

  renameSavedQuery: async (input: {
    id: string
    name: string
  }): Promise<SavedQueryItem | null> => {
    await apiRequest('/api/member/saved-queries/rename', {
      method: 'POST',
      body: JSON.stringify({ id: input.id, name: input.name }),
    }).catch(() => null)

    return { id: input.id, name: input.name, sql: '' }
  },

  deleteSavedQuery: async (id: string): Promise<unknown> => {
    await apiRequest(`/api/member/saved-queries/${id}`, {
      method: 'DELETE',
    }).catch(() => null)
    return { ok: true }
  },
}

export * from './types'
