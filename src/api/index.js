import { invoke } from '@tauri-apps/api/core'

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
    const res = await callCommand('save_connection', { connection })
    return res?.connection || connection
  },

  deleteConnection: async (id) => {
    return callCommand('delete_connection', { id })
  },

  moveConnection: async (id, folderId) => {
    return callCommand('save_connection', { connection: { id, folderId } })
  },

  exportConnections: async (connectionIds, password) => {
    return callCommand('export_connections', { connectionIds, password })
  },

  selectImportFile: async () => {
    return null
  },

  importConnections: async (content, password) => {
    return callCommand('import_connections', { content, password })
  },

  listFolders: async () => {
    const res = await callCommand('list_folders')
    return res?.folders || []
  },

  saveFolder: async (folder) => {
    const res = await callCommand('save_folder', { folder })
    return res?.folder || folder
  },

  deleteFolder: async (id) => {
    return callCommand('delete_folder', { id })
  },

  reorderTree: async (input) => {
    return callCommand('reorder_tree', { input })
  },

  deleteTree: async (input) => {
    return callCommand('delete_tree', { input })
  },

  testConnection: async (connection) => {
    const res = await callCommand('test_connection', { connection })
    return res || { ok: true }
  },

  connect: async (connection) => {
    const res = await callCommand('test_connection', { connection })
    try {
      if (connection?.id) {
        localStorage.setItem('nova_tables_last_connected_id', connection.id)
      }
    } catch {
      // Ignore localStorage errors
    }
    return {
      connectionId: connection?.id || 'session-1',
      databases: [{ name: 'master' }, { name: 'model' }, { name: 'msdb' }, { name: 'tempdb' }],
      serverVersion: 'Microsoft SQL Server (Tauri)',
      currentDatabase: 'master',
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
