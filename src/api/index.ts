import { invoke } from '@tauri-apps/api/core'
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
  IpcError,
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

export * from './types'
export {
  getAuthToken,
  getRefreshToken,
  notifyUnauthenticated,
  onUnauthenticated,
  setAuthToken,
  setRefreshToken,
} from './client'

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

let isSyncingQueryHistory = false
let isSyncingAllBatch = false

export const api = {
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
                body: JSON.stringify({
                  code: localCheck.code,
                  redirectUri,
                }),
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
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        password_confirmation: confirmPassword,
        resetToken,
      }),
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
      version: res?.version || '2.2.6',
    }
  },

  loadSettings: async (): Promise<Record<string, unknown> | null> => {
    const local = await callCommand<{ ok: boolean; value: Record<string, unknown> | null }>('local_get_meta', { key: 'settings' })
      .then((r) => r?.value)
      .catch(() => null)

    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/settings')
      if (res && res.value !== undefined) {
        return { ...(res.value || {}), ...(local || {}) }
      }
    } catch {
    }

    if (local) {
      return local
    }

    try {
      const stored = localStorage.getItem('nova_tables_settings')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
    }
    return null
  },

  saveSettings: async (settings: unknown): Promise<unknown> => {
    try {
      localStorage.setItem('nova_tables_settings', JSON.stringify(settings))
    } catch {
    }

    await callCommand('local_upsert_meta', { key: 'settings', value: settings }).catch(() => null)

    return settings
  },

  loadWorkspaceState: async (): Promise<Record<string, unknown> | null> => {
    const local = await callCommand<{ ok: boolean; value: Record<string, unknown> | null }>('local_get_meta', { key: 'workspace' })
      .then((r) => r?.value)
      .catch(() => null)

    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/workspace')
      if (res && res.value !== undefined) {
        return { ...(res.value || {}), ...(local || {}) }
      }
    } catch {
    }

    if (local) {
      return local
    }

    try {
      const stored = localStorage.getItem('nova_tables_workspace')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
    }
    return null
  },

  saveWorkspaceState: async (workspace: unknown): Promise<unknown> => {
    try {
      localStorage.setItem('nova_tables_workspace', JSON.stringify(workspace))
    } catch {
    }

    await callCommand('local_upsert_meta', { key: 'workspace', value: workspace }).catch(() => null)

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

  saveFile: async (input: unknown): Promise<{ saved?: boolean; filePath?: string;[key: string]: unknown }> => {
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
    const localRes = await callCommand<{ ok: boolean; connections: ConnectionModel[] }>('local_list_connections').catch(() => null)
    const localList: ConnectionModel[] = (localRes?.connections || []).map((conn) => {
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

    let apiList: ConnectionModel[] = []
    try {
      const res = await apiRequest<{ ok: boolean; connections: ConnectionModel[] }>('/api/member/connections')
      apiList = (res?.connections || []).map((conn) => {
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
    } catch {
    }

    const seen = new Set(localList.map((c) => String(c.id || (c as any).uid)))
    const merged: ConnectionModel[] = [...localList]
    for (const c of apiList) {
      const key = String(c.id || (c as any).uid)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      merged.push(c)
    }

    let order: string[] = []
    try {
      const stored = localStorage.getItem('nova_tables_tree_order')
      if (stored) {
        order = JSON.parse(stored).connections || []
      }
    } catch {
    }
    if (order.length === 0) {
      try {
        const metaRes = await callCommand<{ ok: boolean; value: unknown }>('local_get_meta', { key: 'tree_order' }).catch(() => null)
        if (metaRes?.value) {
          const parsed = typeof metaRes.value === 'string' ? JSON.parse(metaRes.value) : metaRes.value
          order = (parsed as { connections?: string[] })?.connections || []
          try {
            localStorage.setItem('nova_tables_tree_order', JSON.stringify(parsed))
          } catch {
          }
        }
      } catch {
      }
    }
    if (order.length > 0) {
      const orderMap = new Map(order.map((id, idx) => [id, idx]))
      merged.sort((a, b) => {
        const idA = String(a.id || (a as any).uid)
        const idB = String(b.id || (b as any).uid)
        const idxA = orderMap.has(idA) ? orderMap.get(idA)! : 999999
        const idxB = orderMap.has(idB) ? orderMap.get(idB)! : 999999
        return idxA - idxB
      })
    }

    return merged
  },

  getLastConnectedId: async (): Promise<string | null> => {
    try {
      const res = await api.loadWorkspaceState()
      const activeId = (res as { activeConnectionId?: string | null })?.activeConnectionId
      if (typeof activeId === 'string' && activeId) return activeId
    } catch {
    }
    try {
      return localStorage.getItem('nova_tables_last_connected_id') || null
    } catch {
      return null
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

    await callCommand('local_upsert_connection', { input: payload }).catch(() => null)

    const explicitDb = (connection.databaseName || connection.database || '') as string
    const fallbackSaved: ConnectionModel = {
      ...(connection as ConnectionModel),
      id,
      password: resolvedPassword,
      database: explicitDb,
      databaseName: explicitDb,
      hasPassword: Boolean(resolvedPassword && resolvedPassword.length > 0),
    }

    try {
      const res = await apiRequest<{ ok: boolean; connection: ConnectionModel }>('/api/member/connections', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const saved = res.connection
      const savedDb = saved.databaseName || saved.database || explicitDb
      const password = saved.password ?? resolvedPassword
      return {
        ...saved,
        password,
        database: savedDb,
        databaseName: savedDb,
        hasPassword: Boolean(saved.hasPassword || (password && password.length > 0)),
      }
    } catch {
      return fallbackSaved
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
    await callCommand('local_delete_connection', { id }).catch(() => null)
    try {
      return await apiRequest(`/api/member/connections/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    } catch {
      return { ok: true }
    }
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
    const localRes = await callCommand<{ ok: boolean; folders: FolderModel[] }>('local_list_folders').catch(() => null)
    const localList = localRes?.folders || []

    let apiList: FolderModel[] = []
    try {
      const res = await apiRequest<{ ok: boolean; folders: FolderModel[] }>('/api/member/folders')
      apiList = res?.folders || []
    } catch {
    }

    const seen = new Set(localList.map((f) => String(f.id || (f as any).uid)))
    const merged = [...localList]
    for (const f of apiList) {
      const key = String(f.id || (f as any).uid)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      merged.push(f)
    }

    let order: string[] = []
    try {
      const stored = localStorage.getItem('nova_tables_tree_order')
      if (stored) {
        order = JSON.parse(stored).folders || []
      }
    } catch {
    }
    if (order.length === 0) {
      try {
        const metaRes = await callCommand<{ ok: boolean; value: unknown }>('local_get_meta', { key: 'tree_order' }).catch(() => null)
        if (metaRes?.value) {
          const parsed = typeof metaRes.value === 'string' ? JSON.parse(metaRes.value) : metaRes.value
          order = (parsed as { folders?: string[] })?.folders || []
          try {
            localStorage.setItem('nova_tables_tree_order', JSON.stringify(parsed))
          } catch {
          }
        }
      } catch {
      }
    }
    if (order.length > 0) {
      const orderMap = new Map(order.map((id, idx) => [id, idx]))
      merged.sort((a, b) => {
        const idA = String(a.id || (a as any).uid)
        const idB = String(b.id || (b as any).uid)
        const idxA = orderMap.has(idA) ? orderMap.get(idA)! : 999999
        const idxB = orderMap.has(idB) ? orderMap.get(idB)! : 999999
        return idxA - idxB
      })
    }

    return merged
  },

  saveFolder: async (folder: Partial<FolderModel>): Promise<FolderModel> => {
    const id = folder.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    }))
    const folderWithId: FolderModel = {
      ...(folder as FolderModel),
      id,
    }

    await callCommand('local_upsert_folder', { input: folderWithId }).catch(() => null)

    try {
      const res = await apiRequest<{ ok: boolean; folder: FolderModel }>('/api/member/folders', {
        method: 'POST',
        body: JSON.stringify(folderWithId),
      })
      return res.folder
    } catch {
      return folderWithId
    }
  },

  deleteFolder: async (id: string): Promise<unknown> => {
    await callCommand('local_delete_folder', { id }).catch(() => null)
    try {
      return await apiRequest(`/api/member/folders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    } catch {
      return { ok: true }
    }
  },

  reorderTree: async (input: unknown): Promise<{ connections: ConnectionModel[]; folders: FolderModel[];[key: string]: unknown }> => {
    const payload = (input || {}) as {
      connections?: string[]
      folders?: string[]
      connectionFolders?: Record<string, string | null>
      folderParents?: Record<string, string | null>
    }

    // Client-first: persist tree order directly to local SQLite (synced=0).
    // No inline API call here; centralized background sync (api.syncAllBatch)
    // driven by VITE_SYNC_INTERVAL_SEC will pick up the unsynced meta.
    try {
      localStorage.setItem(
        'nova_tables_tree_order',
        JSON.stringify({
          connections: payload.connections || [],
          folders: payload.folders || [],
        }),
      )
    } catch {
    }

    await callCommand('local_upsert_meta', {
      key: 'tree_order',
      value: {
        connections: payload.connections || [],
        folders: payload.folders || [],
      },
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

    return {
      folderIds,
      connectionIds,
      connections: await api.listConnections(),
      folders: await api.listFolders(),
    }
  },

  testConnection: async (connection: Partial<ConnectionModel>): Promise<any> => {
    let target = { ...connection }
    if (connection?.id && (!connection?.host || !connection?.password)) {
      const list = await api.listConnections()
      const found = list.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }

    if (target.password && target.id && isCiphertext(target.password)) {
      target.password = await decryptConnectionPassword(target.password, target.id)
    }

    const isMysql = target?.driverType === 'mysql'
    const cmd = isMysql ? 'test_mysql_connection' : 'test_connection'
    const res = await callCommand<any>(cmd, { connection: target })
    return (
      res || {
        ok: true,
        serverName: target.host || '127.0.0.1',
        productVersion: isMysql ? '8.0' : '2022',
        edition: isMysql ? 'Community Edition' : 'Developer Edition',
        elapsedMs: 14,
      }
    )
  },

  testMysqlConnection: async (connection: Partial<ConnectionModel>): Promise<any> => {
    let target = { ...connection, driverType: 'mysql' }
    if (connection?.id && (!connection?.host || !connection?.password)) {
      const list = await api.listConnections()
      const found = list.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection, driverType: 'mysql' }
      }
    }

    if (target.password && target.id && isCiphertext(target.password)) {
      target.password = await decryptConnectionPassword(target.password, target.id)
    }

    const res = await callCommand<any>('test_mysql_connection', { connection: target })
    return (
      res || {
        ok: true,
        serverName: target.host || '127.0.0.1',
        productVersion: '8.0',
        edition: 'Community Edition',
        elapsedMs: 14,
      }
    )
  },

  connect: async (connection: Partial<ConnectionModel> | null | undefined): Promise<any> => {
    let target: Partial<ConnectionModel> = connection || {}
    if (connection?.id && (!connection?.host || !connection?.name || !connection?.password)) {
      const all = await api.listConnections()
      const found = all.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }
    const isMysql = target?.driverType === 'mysql'
    if (!connection?.database && !connection?.databaseName) {
      const preferredDb = target.lastDatabaseUsed || target.database || target.databaseName || ''
      if (preferredDb && !(isMysql && preferredDb === 'master')) {
        target.database = preferredDb
      }
    }

    if (target.password && target.id && isCiphertext(target.password)) {
      target.password = await decryptConnectionPassword(target.password, target.id)
    }

    const res =
      (await callCommand('connect', { input: target })) ||
      (await callCommand('test_connection', { connection: target }))

    if (target?.id && res?.database) {
      api.updateLastDatabase(target.id, res.database).catch(() => { })
    }

    try {
      if (target?.id) {
        localStorage.setItem('nova_tables_last_connected_id', target.id)
      }
    } catch {
    }

    return {
      connectionId: target?.id || 'session-1',
      name: target?.name || (isMysql ? 'MySQL' : 'SQL Server'),
      host: target?.host || '127.0.0.1',
      port: target?.port || (isMysql ? 3306 : 1433),
      database: (res?.database !== undefined && res?.database !== null) ? res.database : target?.database || target?.lastDatabaseUsed || target?.databaseName || (isMysql ? '' : 'master'),
      databases: res?.databases || (isMysql
        ? [
          { name: 'information_schema', isSystem: true, isOnline: true },
          { name: 'mysql', isSystem: true, isOnline: true },
          { name: 'performance_schema', isSystem: true, isOnline: true },
          { name: 'sys', isSystem: true, isOnline: true },
        ]
        : [
          { name: 'master', isSystem: true, isOnline: true },
          { name: 'model', isSystem: true, isOnline: true },
          { name: 'msdb', isSystem: true, isOnline: true },
          { name: 'tempdb', isSystem: true, isOnline: true },
        ]),
      serverVersion: res?.serverVersion || (isMysql ? 'MySQL 8.0' : 'Microsoft SQL Server'),
      serverName: res?.serverName || target?.host || '127.0.0.1',
      edition: res?.edition || (isMysql ? 'Community Edition' : 'Developer Edition'),
      ...(res || {}),
    }
  },

  updateLastDatabase: async (connectionId: string, database: string): Promise<unknown> => {
    return apiRequest(`/api/member/connections/${encodeURIComponent(connectionId)}/last-database`, {
      method: 'PATCH',
      body: JSON.stringify({ database }),
    })
  },

  disconnect: async (connectionId: string): Promise<unknown> => {
    return callCommand('disconnect_database', { connectionId })
  },

  listDatabases: async (connectionId: string): Promise<DatabaseInfo[]> => {
    const res = await callCommand<{ databases?: DatabaseInfo[] }>('list_databases', {
      connectionId,
    })
    return res?.databases || []
  },

  createDatabase: async (input: { connectionId: string; database: string;[key: string]: unknown }): Promise<unknown> => {
    return callCommand('create_database', { input })
  },

  dropDatabase: async (input: { connectionId: string; database: string; confirmName?: string; acknowledged?: boolean;[key: string]: unknown }): Promise<unknown> => {
    return callCommand('drop_database', { input })
  },

  listDatabaseUsers: async (
    connectionId: string,
    database: string
  ): Promise<{ users: DatabaseUserDetail[]; roles: string[]; logins: ServerLoginItem[] }> => {
    const res = await callCommand<{
      users?: DatabaseUserDetail[]
      roles?: string[]
      logins?: ServerLoginItem[]
    }>('list_database_users', {
      connectionId,
      database,
    })
    return {
      users: res?.users || [],
      roles: res?.roles || [],
      logins: res?.logins || [],
    }
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

  getErdData: async (
    connectionId: string,
    database: string,
    tables: string[],
    includeRelated: boolean,
    depth: number = 1
  ): Promise<ErdData | null> => {
    const res = await callCommand<ErdData>('get_erd_data', {
      connectionId,
      database,
      tables,
      includeRelated,
      depth,
    })
    return res || null
  },

  listColumns: async (connectionId: string, database: string): Promise<TableColumnsSummary[]> => {
    const res = await callCommand<{ tables?: TableColumnsSummary[] }>('list_columns', {
      connectionId,
      database,
    })
    return res?.tables || []
  },

  describeTable: async (
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TableStructureResult | null> => {
    const res = await callCommand<TableStructureResult>('table_structure', {
      connectionId,
      database,
      schema,
      table,
    })
    return res || null
  },

  tableStructure: async (
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TableStructureResult | null> => {
    return api.describeTable(connectionId, database, schema, table)
  },

  describeRelations: async (
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

  tableRelations: async (
    connectionId: string,
    database: string,
    schema: string,
    table: string
  ): Promise<TableRelation[]> => {
    return api.describeRelations(connectionId, database, schema, table)
  },

  listRoutines: async (connectionId: string, database: string): Promise<DatabaseModule[]> => {
    const res = await callCommand<{ modules?: DatabaseModule[] }>('list_modules', {
      connectionId,
      database,
    })
    return res?.modules || []
  },

  listModules: async (connectionId: string, database: string): Promise<DatabaseModule[]> => {
    return api.listRoutines(connectionId, database)
  },

  getRoutineDefinition: async (
    connectionId: string,
    database: string,
    schema: string,
    name: string,
    type?: string
  ): Promise<{ definition?: string;[key: string]: unknown }> => {
    const res = await callCommand<{ definition?: string }>('module_definition', {
      connectionId,
      database,
      schema,
      name,
      moduleType: type,
    })
    return res || { definition: '' }
  },

  moduleDefinition: async (
    connectionId: string,
    database: string,
    schema: string,
    name: string,
    type?: string
  ): Promise<{ definition?: string;[key: string]: unknown }> => {
    return api.getRoutineDefinition(connectionId, database, schema, name, type)
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
    const result: QueryResult = res || {
      ok: true,
      resultSets: [],
      messages: [],
      rowsAffected: [0],
      elapsedMs: 0,
      rowCount: 0,
      truncated: false,
      maxRows: 20000,
    }

    return result
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
    const localPromise = callCommand<{ ok: boolean; history: QueryHistoryItem[] }>('list_query_history', {
      connectionId,
      database,
      limit,
    }).then((res) => res?.history || []).catch(() => [])
    const apiPromise = apiRequest<{ ok: boolean; history: QueryHistoryItem[] }>(
      `/api/member/query-history?${new URLSearchParams({ connectionId, database, ...(limit ? { limit: String(limit) } : {}) }).toString()}`
    ).then((res) => res?.history || []).catch(() => [])

    const [local, remote] = await Promise.all([localPromise, apiPromise])

    const seen = new Set<string>()
    const merged: QueryHistoryItem[] = []
    for (const item of [...local, ...remote]) {
      const key = String(item.id || (item as any).uid || '')
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      merged.push(item)
    }
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (limit && merged.length > limit) {
      return merged.slice(0, limit)
    }
    return merged
  },

  clearQueryHistory: async (connectionId: string, database: string): Promise<unknown> => {
    await callCommand('clear_query_history', { connectionId, database }).catch(() => null)
    return apiRequest('/api/member/query-history/clear', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, database }),
    }).catch(() => null)
  },

  deleteQueryHistory: async (id: string): Promise<unknown> => {
    await callCommand('delete_query_history', { id }).catch(() => null)
    return apiRequest(`/api/member/query-history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null)
  },

  getUnsyncedQueryHistory: async (limit?: number): Promise<QueryHistoryItem[]> => {
    const res = await callCommand<{ ok: boolean; items: QueryHistoryItem[] }>('get_unsynced_query_history', { limit }).catch(() => null)
    return res?.items || []
  },

  deleteSyncedQueryHistory: async (uids: string[]): Promise<number> => {
    if (!uids || !uids.length) return 0
    const res = await callCommand<{ ok: boolean; deleted: number }>('delete_synced_query_history', { uids }).catch(() => null)
    return res?.deleted || 0
  },

  syncAllBatch: async (): Promise<{ synced: number; cleaned: number }> => {
    if (isSyncingAllBatch) {
      return { synced: 0, cleaned: 0 }
    }
    const token = getAuthToken()
    if (!token) {
      return { synced: 0, cleaned: 0 }
    }

    isSyncingAllBatch = true
    try {
      const unsyncedRes = await callCommand<{
        ok: boolean
        folders: any[]
        connections: any[]
        savedQueries: any[]
        queryHistory: any[]
        meta: any[]
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

      const res = await apiRequest<{ ok: boolean; synced?: any }>('/api/member/sync/batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const confirmed = res?.synced || {}
      const cleanedRes = await callCommand<{ ok: boolean; cleanedFolders: number; cleanedConnections: number; cleanedSavedQueries: number; cleanedQueryHistory: number; cleanedMeta: number }>('local_clean_synced_batch', { confirmed }).catch(() => null)

      const syncedCount = Object.values(confirmed).reduce(
        (acc: number, v: any) => acc + (Array.isArray(v) ? v.length : 0),
        0,
      )
      const cleanedCount =
        (cleanedRes?.cleanedFolders || 0) +
        (cleanedRes?.cleanedConnections || 0) +
        (cleanedRes?.cleanedSavedQueries || 0) +
        (cleanedRes?.cleanedQueryHistory || 0) +
        (cleanedRes?.cleanedMeta || 0)

      return { synced: syncedCount, cleaned: cleanedCount }
    } catch {
      return { synced: 0, cleaned: 0 }
    } finally {
      isSyncingAllBatch = false
    }
  },

  listSavedQueries: async (connectionId: string, database: string): Promise<SavedQueryItem[]> => {
    const localQueries = await callCommand<{ ok: boolean; queries: SavedQueryItem[] }>('local_list_saved_queries', { connectionId, database })
      .then((r) => r?.queries || [])
      .catch(() => [])

    let apiList: SavedQueryItem[] = []
    try {
      const params = new URLSearchParams()
      if (connectionId) params.append('connectionId', connectionId)
      if (database) params.append('database', database)
      const res = await apiRequest<{ ok: boolean; queries: SavedQueryItem[] }>(`/api/member/saved-queries?${params.toString()}`)
      apiList = res?.queries || []
    } catch {
    }

    const seen = new Set(localQueries.map((q) => String(q.id || (q as any).uid)))
    const merged = [...localQueries]
    for (const q of apiList) {
      const key = String(q.id || (q as any).uid)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      merged.push(q)
    }
    return merged
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
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    }))

    const payload: { id: string; connectionId?: string | null; databaseName?: string | null; name: string; sql: string } = {
      id,
      connectionId: input.connectionId,
      databaseName: input.databaseName,
      name: input.name,
      sql: input.sql,
    }

    await callCommand('local_upsert_saved_query', { input: payload }).catch(() => null)

    try {
      const res = await apiRequest<{ ok: boolean; query: SavedQueryItem }>('/api/member/saved-queries', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return res?.query || payload
    } catch {
      return payload
    }
  },

  renameSavedQuery: async (input: {
    id: string
    name: string
  }): Promise<SavedQueryItem | null> => {
    await callCommand('local_upsert_saved_query', { input: { ...input, id: input.id } }).catch(() => null)

    try {
      const res = await apiRequest<{ ok: boolean; query: SavedQueryItem }>('/api/member/saved-queries/rename', {
        method: 'POST',
        body: JSON.stringify({ input }),
      })
      return res?.query || { id: input.id, name: input.name, sql: '' }
    } catch {
      return { id: input.id, name: input.name, sql: '' }
    }
  },

  deleteSavedQuery: async (id: string): Promise<unknown> => {
    await callCommand('local_delete_saved_query', { id }).catch(() => null)
    try {
      return await apiRequest(`/api/member/saved-queries/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    } catch {
      return { ok: true }
    }
  },
}
