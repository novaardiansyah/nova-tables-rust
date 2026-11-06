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
    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/settings')
      if (res && res.value !== undefined) {
        return res.value
      }
    } catch {
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

    try {
      await apiRequest('/api/member/meta/settings', {
        method: 'POST',
        body: JSON.stringify({ value: settings }),
      })
    } catch {
    }

    return settings
  },

  loadWorkspaceState: async (): Promise<Record<string, unknown> | null> => {
    try {
      const res = await apiRequest<{ ok: boolean; value: Record<string, unknown> | null }>('/api/member/meta/workspace')
      if (res && res.value !== undefined) {
        return res.value
      }
    } catch {
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

    try {
      await apiRequest('/api/member/meta/workspace', {
        method: 'POST',
        body: JSON.stringify({ value: workspace }),
      })
    } catch {
    }

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
    const res = await apiRequest<{ ok: boolean; connections: ConnectionModel[] }>('/api/member/connections')
    const list = res?.connections || []
    return list.map((conn) => {
      const explicitDb =
        conn.databaseName !== undefined && conn.databaseName !== null
          ? conn.databaseName
          : conn.database !== undefined && conn.database !== null
            ? conn.database
            : conn.lastDatabaseUsed || ''
      const password = conn.password ?? null
      const hasPassword = Boolean(
        conn.hasPassword || (password && password.length > 0),
      )
      return {
        ...conn,
        password,
        database: explicitDb,
        databaseName: explicitDb,
        hasPassword,
      }
    })
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

    const res = await apiRequest<{ ok: boolean; connection: ConnectionModel }>('/api/member/connections', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const saved = res.connection
    const explicitDb = saved.databaseName || saved.database || ''
    const password = saved.password ?? resolvedPassword
    return {
      ...saved,
      password,
      database: explicitDb,
      databaseName: explicitDb,
      hasPassword: Boolean(saved.hasPassword || (password && password.length > 0)),
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
    return apiRequest(`/api/member/connections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
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
    const res = await apiRequest<{ ok: boolean; folders: FolderModel[] }>('/api/member/folders')
    return res?.folders || []
  },

  saveFolder: async (folder: Partial<FolderModel>): Promise<FolderModel> => {
    const res = await apiRequest<{ ok: boolean; folder: FolderModel }>('/api/member/folders', {
      method: 'POST',
      body: JSON.stringify(folder),
    })
    return res.folder
  },

  deleteFolder: async (id: string): Promise<unknown> => {
    return apiRequest(`/api/member/folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  reorderTree: async (input: unknown): Promise<{ connections: ConnectionModel[]; folders: FolderModel[];[key: string]: unknown }> => {
    await apiRequest('/api/member/connections/reorder', {
      method: 'POST',
      body: JSON.stringify(input),
    })
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

  syncQueryHistoryBatch: async (): Promise<{ synced: number }> => {
    if (isSyncingQueryHistory) {
      return { synced: 0 }
    }
    const token = getAuthToken()
    if (!token) {
      return { synced: 0 }
    }

    isSyncingQueryHistory = true
    try {
      const unsyncedRes = await callCommand<{ ok: boolean; items: QueryHistoryItem[] }>('get_unsynced_query_history').catch(() => null)
      const items = unsyncedRes?.items || []
      if (!items.length) {
        return { synced: 0 }
      }

      const payload = items.map((item) => ({
        uid: item.uid || item.id,
        connectionId: item.connectionId || (item as any).connection_id,
        databaseName: item.databaseName || (item as any).database_name || (item as any).database,
        sql: item.sql,
        status: item.status || 'success',
        durationMs: item.durationMs || (item as any).duration_ms || 0,
        rowCount: item.rowCount || (item as any).row_count || 0,
        errorMessage: item.errorMessage || (item as any).error_message || null,
        createdAt: item.createdAt || (item as any).created_at,
      }))

      const res = await apiRequest<{ ok: boolean; syncedUids?: string[]; synced_uids?: string[] }>(
        '/api/member/query-history/batch',
        {
          method: 'POST',
          body: JSON.stringify({ items: payload }),
        }
      )

      const confirmedUids = res?.syncedUids || res?.synced_uids || []
      if (confirmedUids.length > 0) {
        await callCommand('delete_synced_query_history', { uids: confirmedUids }).catch(() => null)
      }
      return { synced: confirmedUids.length }
    } catch {
      return { synced: 0 }
    } finally {
      isSyncingQueryHistory = false
    }
  },

  listSavedQueries: async (connectionId: string, database: string): Promise<SavedQueryItem[]> => {
    const params = new URLSearchParams()
    if (connectionId) params.append('connectionId', connectionId)
    if (database) params.append('database', database)

    const res = await apiRequest<{ ok: boolean; queries: SavedQueryItem[] }>(`/api/member/saved-queries?${params.toString()}`)
    return res?.queries || []
  },

  saveSavedQuery: async (input: {
    connectionId?: string | null
    databaseName?: string | null
    name: string
    sql: string
  }): Promise<SavedQueryItem | null> => {
    const res = await apiRequest<{ ok: boolean; query: SavedQueryItem }>('/api/member/saved-queries', {
      method: 'POST',
      body: JSON.stringify({
        input,
        connectionId: input.connectionId,
        databaseName: input.databaseName,
        name: input.name,
        sql: input.sql,
      }),
    })
    return res?.query || null
  },

  renameSavedQuery: async (input: {
    id: string
    name: string
  }): Promise<SavedQueryItem | null> => {
    const res = await apiRequest<{ ok: boolean; query: SavedQueryItem }>('/api/member/saved-queries/rename', {
      method: 'POST',
      body: JSON.stringify({ input }),
    })
    return res?.query || null
  },

  deleteSavedQuery: async (id: string): Promise<unknown> => {
    return apiRequest(`/api/member/saved-queries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
