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

async function callCommand(cmd, args = {}) {
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
  getSystemInfo: async () => callCommand('get_system_info'),

  listConnections: async () => {
    const res = await callCommand('list_connections')
    return res?.connections || []
  },

  getLastConnectedId: async () => {
    return null
  },

  saveConnection: async (connection) => {
    const res = await callCommand('save_connection', { connection })
    return res?.connection || null
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
    return res?.folder || null
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
    return callCommand('test_connection', { connection })
  },

  connect: async (connection) => {
    return callCommand('test_connection', { connection })
  },

  disconnect: async (connectionId) => {
    return callCommand('disconnect_database', { connectionId })
  },

  listDatabases: async (connectionId) => {
    const res = await callCommand('list_databases', { connectionId })
    return res?.databases || []
  },

  dropDatabase: async (input) => {
    return callCommand('drop_database', { input })
  },

  listDatabaseUsers: async (connectionId, database) => {
    return []
  },

  createDatabaseUser: async (input) => {
    return null
  },

  updateDatabaseUserRoles: async (input) => {
    return null
  },

  dropDatabaseUser: async (input) => {
    return null
  },

  listTables: async (connectionId, database) => {
    const res = await callCommand('list_tables', { connectionId, database })
    return res?.tables || []
  },

  listColumns: async (connectionId, database) => {
    return []
  },

  tableStructure: async (connectionId, database, schema, table) => {
    return null
  },

  tableRelations: async (connectionId, database, schema, table) => {
    return []
  },

  listModules: async (connectionId, database) => {
    return []
  },

  moduleDefinition: async (connectionId, database, schema, name, type) => {
    return null
  },

  saveModuleDefinition: async (input) => {
    return null
  },

  execute: async (connectionId, database, sql, queryMode) => {
    return callCommand('execute_query', { connectionId, database, sql, queryMode })
  },

  cancelQuery: async (connectionId) => {
    return null
  },

  fetchPage: async (input) => {
    return null
  },

  explain: async (connectionId, database, sql) => {
    return null
  },

  saveTableDesign: async (input) => {
    return null
  },

  saveQuery: async (input) => {
    return null
  },

  listSavedQueries: async (connectionId, database) => {
    return []
  },

  deleteSavedQuery: async (id) => {
    return null
  },

  recordHistory: async (input) => {
    return null
  },

  listHistory: async (connectionId, database) => {
    return []
  },

  clearHistory: async (connectionId) => {
    return null
  },
}
