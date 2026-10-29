import { invoke } from '@tauri-apps/api/core'
import { encryptExportPayload, decryptImportPayload } from './crypto.js'

export class IpcError extends Error {
  constructor(payload) {
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

const isTauri = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)

async function callCommand(cmd, args = {}) {
  if (!isTauri()) {
    return null
  }
  try {
    const response = await invoke(cmd, args)
    if (response && response.ok === false) {
      throw new IpcError(response.error)
    }
    return response
  } catch (err) {
    if (err instanceof IpcError) throw err
    throw new IpcError({ message: err?.message || String(err) })
  }
}

function cleanText(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

function exportFolderChain(folderId, folderById) {
  const chain = []
  let current = folderId ? folderById.get(folderId) : null
  while (current && !chain.includes(current.id)) {
    chain.unshift(current.id)
    current = current.parentId ? folderById.get(current.parentId) : null
  }
  return chain
}

function importFolderKey(parentId, name) {
  return `${parentId ?? ''}::${String(name).toLowerCase()}`
}

function importFolderDepth(folder, folderById) {
  let depth = 0
  let current = folder
  while (current?.parentId && folderById.has(String(current.parentId)) && depth < 64) {
    current = folderById.get(String(current.parentId))
    depth += 1
  }
  return depth
}

export const api = {
  appInfo: async () => {
    const res = await callCommand('get_system_info')
    return {
      name: 'Nova Tables',
      version: res?.version || '1.2.4',
    }
  },

  loadSettings: async () => {
    try {
      const stored = localStorage.getItem('nova_tables_settings')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Ignore localStorage errors
    }
    const res = await callCommand('get_settings')
    return res?.settings || null
  },

  saveSettings: async (settings) => {
    try {
      localStorage.setItem('nova_tables_settings', JSON.stringify(settings))
    } catch {
      // Ignore localStorage errors
    }
    await callCommand('save_settings', { settings })
    return settings
  },

  copyText: async (text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    }
    return true
  },

  saveFile: async (input) => {
    return callCommand('save_file', { input })
  },

  onOpenConnection: (_handler) => {
    return () => {}
  },

  onNewConnection: (_handler) => {
    return () => {}
  },

  onPreferences: (_handler) => {
    return () => {}
  },

  listConnections: async () => {
    const res = await callCommand('list_connections')
    return res?.connections || []
  },

  getLastConnectedId: async () => {
    try {
      return localStorage.getItem('nova_tables_last_connected_id') || null
    } catch {
      return null
    }
  },

  saveConnection: async (connection) => {
    const payload = {
      ...connection,
      id: connection.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      name: connection.name || 'New Connection',
      host: connection.host || '127.0.0.1',
      port: Number(connection.port) || 1433,
      username: connection.username || '',
      databaseName: connection.databaseName || connection.database || '',
      folderId: connection.folderId || null,
      environment: connection.environment || '',
      encrypt: connection.encrypt !== false,
      trustServerCertificate: connection.trustServerCertificate !== false,
    }
    const res = await callCommand('save_connection', { connection: payload })
    return res?.connection || payload
  },

  deleteConnection: async (id) => {
    return callCommand('delete_connection', { id })
  },

  moveConnection: async (id, folderId) => {
    const list = await api.listConnections()
    const existing = list.find((c) => c.id === id)
    if (existing) {
      return api.saveConnection({ ...existing, folderId })
    }
    return callCommand('save_connection', { connection: { id, folderId } })
  },

  exportConnections: async (connectionIds, password) => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({ message: 'Password is required to encrypt export', code: 'PASSWORD_REQUIRED' })
    }

    const allConnections = await api.listConnections()
    const allSelected = !Array.isArray(connectionIds) || connectionIds.length === 0
    const targetIds = new Set(allSelected ? allConnections.map((c) => c.id) : connectionIds.map(String))

    const allFolders = await api.listFolders()
    const folderById = new Map(allFolders.map((f) => [f.id, f]))
    const folderIds = new Set()
    const folderOrder = []

    if (allSelected) {
      for (const folder of allFolders) folderIds.add(folder.id)
    } else {
      for (const conn of allConnections) {
        if (!targetIds.has(conn.id) || !conn.folderId) continue
        for (const id of exportFolderChain(conn.folderId, folderById)) {
          folderIds.add(id)
        }
      }
    }

    for (const folder of allFolders) {
      if (folderIds.has(folder.id)) folderOrder.push(folder.id)
    }

    const list = []
    const connectionOrder = []
    for (const item of allConnections) {
      if (!targetIds.has(item.id)) continue
      connectionOrder.push(item.id)
      list.push({
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

    if (list.length === 0) {
      throw new IpcError({ message: 'No connections found to export', code: 'NO_CONNECTIONS' })
    }

    const folders = folderOrder.map((id) => {
      const folder = folderById.get(id)
      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId ?? null,
      }
    })

    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      connections: list,
      folders,
      order: {
        connections: connectionOrder,
        folders: folderOrder,
      },
    }

    const encrypted = await encryptExportPayload(payload, secret)

    if (typeof document !== 'undefined') {
      const blob = new Blob([encrypted], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nova-tables-connections.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    return { saved: true, count: list.length }
  },

  selectImportFile: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
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

  importConnections: async (content, password) => {
    const secret = String(password ?? '')
    if (!secret) {
      throw new IpcError({ message: 'Password is required to decrypt connections', code: 'PASSWORD_REQUIRED' })
    }

    let payload
    try {
      payload = await decryptImportPayload(content, secret)
    } catch (err) {
      throw new IpcError({ message: err?.message || 'Failed to decrypt import file', code: err?.code || 'DECRYPT_ERROR' })
    }

    const items = payload.connections || []
    const sourceFolders = Array.isArray(payload.folders) ? payload.folders : []

    const existingConnections = await api.listConnections()
    const existingNames = new Set(existingConnections.map((c) => (c.name || '').toLowerCase()))
    const existingFolders = await api.listFolders()
    const reusableFolders = new Map()
    for (const folder of existingFolders) {
      const key = importFolderKey(folder.parentId ?? null, folder.name)
      if (!reusableFolders.has(key)) reusableFolders.set(key, folder.id)
    }

    const folderIdMap = new Map()
    const importedFolderIds = []
    const sourceFolderById = new Map(
      sourceFolders.filter((f) => f && f.id).map((f) => [String(f.id), f]),
    )
    const orderedSourceFolders = [...sourceFolderById.values()].sort(
      (left, right) => importFolderDepth(left, sourceFolderById) - importFolderDepth(right, sourceFolderById),
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

      folderIdMap.set(String(folder.id), targetId)
    }

    const nameFolderCache = new Map()
    const resolveLegacyFolder = async (folderName) => {
      const name = cleanText(folderName)
      if (!name) return null
      const key = importFolderKey(null, name)
      if (nameFolderCache.has(key)) return nameFolderCache.get(key)
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

    const imported = []
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

      let folderId = null
      if (item.folderId && folderIdMap.has(String(item.folderId))) {
        folderId = folderIdMap.get(String(item.folderId))
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
  },

  listFolders: async () => {
    const res = await callCommand('list_folders')
    return res?.folders || []
  },

  saveFolder: async (folder) => {
    const payload = {
      ...folder,
      id: folder.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      name: folder.name || 'New Folder',
      parentId: folder.parentId || null,
    }
    const res = await callCommand('save_folder', { folder: payload })
    return res?.folder || payload
  },

  deleteFolder: async (id) => {
    return callCommand('delete_folder', { id })
  },

  reorderTree: async (input) => {
    try {
      localStorage.setItem('nova_tables_tree_order', JSON.stringify(input))
    } catch {}
    return input
  },

  deleteTree: async (input) => {
    const folderIds = input?.folderIds || []
    const connectionIds = input?.connectionIds || []
    for (const id of connectionIds) {
      await callCommand('delete_connection', { id })
    }
    for (const id of folderIds) {
      await callCommand('delete_folder', { id })
    }
    const connections = await api.listConnections()
    const folders = await api.listFolders()
    return {
      folderIds,
      connectionIds,
      connections,
      folders,
    }
  },

  testConnection: async (connection) => {
    let target = connection || {}
    if (connection?.id && (!connection?.host || !connection?.name)) {
      const all = await api.listConnections()
      const found = all.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }
    const res = await callCommand('test_connection', { connection: target })
    return res || { ok: true, serverName: target.host || '127.0.0.1', productVersion: '2022', edition: 'Developer Edition', elapsedMs: 14 }
  },

  connect: async (connection) => {
    let target = connection || {}
    if (connection?.id && (!connection?.host || !connection?.name)) {
      const all = await api.listConnections()
      const found = all.find((c) => c.id === connection.id)
      if (found) {
        target = { ...found, ...connection }
      }
    }
    const res = (await callCommand('connect', { input: target })) || (await callCommand('test_connection', { connection: target }))
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
      database: target?.database || target?.databaseName || 'master',
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

  disconnect: async (connectionId) => {
    return callCommand('disconnect_database', { connectionId })
  },

  listDatabases: async (connectionId) => {
    const res = await callCommand('list_databases', { connectionId })
    return res?.databases || [
      { name: 'master', isSystem: true, isOnline: true },
      { name: 'model', isSystem: true, isOnline: true },
      { name: 'msdb', isSystem: true, isOnline: true },
      { name: 'tempdb', isSystem: true, isOnline: true },
    ]
  },

  dropDatabase: async (input) => {
    return callCommand('drop_database', { input })
  },

  listDatabaseUsers: async (connectionId, database) => {
    const res = await callCommand('list_database_users', { connectionId, database })
    return res?.users || []
  },

  createDatabaseUser: async (input) => {
    return callCommand('create_database_user', { input })
  },

  updateDatabaseUserRoles: async (input) => {
    return callCommand('update_database_user_roles', { input })
  },

  dropDatabaseUser: async (input) => {
    return callCommand('drop_database_user', { input })
  },

  listTables: async (connectionId, database) => {
    const res = await callCommand('list_tables', { connectionId, database })
    return res?.tables || []
  },

  listColumns: async (connectionId, database) => {
    const res = await callCommand('list_columns', { connectionId, database })
    return res?.columns || []
  },

  tableStructure: async (connectionId, database, schema, table) => {
    const res = await callCommand('table_structure', { connectionId, database, schema, table })
    return res || { columns: [], indexes: [], foreignKeys: [] }
  },

  tableRelations: async (connectionId, database, schema, table) => {
    const res = await callCommand('table_relations', { connectionId, database, schema, table })
    return res?.relations || []
  },

  listModules: async (connectionId, database) => {
    const res = await callCommand('list_modules', { connectionId, database })
    return res?.modules || []
  },

  moduleDefinition: async (connectionId, database, schema, name, type) => {
    const res = await callCommand('module_definition', { connectionId, database, schema, name, type })
    return res || { definition: '' }
  },

  describeResult: async (connectionId, database, sql) => {
    const res = await callCommand('describe_result', { connectionId, database, sql })
    return res?.columns || []
  },

  runQuery: async (input) => {
    const res = await callCommand('execute_query', input)
    return res || {
      ok: true,
      columns: [],
      rows: [],
      rowsAffected: 0,
      executionTimeMs: 0,
    }
  },

  getExecutionPlan: async (input) => {
    const res = await callCommand('get_execution_plan', input)
    return res || { plan: null }
  },

  listQueryHistory: async (connectionId, database, limit) => {
    const res = await callCommand('list_query_history', { connectionId, database, limit })
    return res?.history || []
  },

  clearQueryHistory: async (connectionId, database) => {
    return callCommand('clear_query_history', { connectionId, database })
  },

  deleteQueryHistory: async (id) => {
    return callCommand('delete_query_history', { id })
  },

  listSavedQueries: async (connectionId, database) => {
    const res = await callCommand('list_saved_queries', { connectionId, database })
    return res?.queries || []
  },

  saveSavedQuery: async (input) => {
    const res = await callCommand('save_saved_query', { input })
    return res?.query || null
  },

  renameSavedQuery: async (input) => {
    const res = await callCommand('rename_saved_query', { input })
    return res?.query || null
  },

  deleteSavedQuery: async (id) => {
    return callCommand('delete_saved_query', { id })
  },
}
