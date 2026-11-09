import { callCommand } from './ipc'
import {
  ColumnSummary,
  ConnectionModel,
  DatabaseInfo,
  DatabaseModule,
  DatabaseUserDetail,
  ErdData,
  ExecutionPlanResult,
  QueryResult,
  ServerLoginItem,
  TableColumnsSummary,
  TableRelation,
  TableStructureResult,
  TableSummary,
} from './types'
import { isCiphertext, decryptConnectionPassword } from './crypto'

export interface DatabaseOpsContext {
  listConnections: () => Promise<ConnectionModel[]>
  updateLastDatabase: (connectionId: string, database: string) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
}

export function createDatabaseOps(ctx: DatabaseOpsContext) {
  const ops = {
    testConnection: async (connection: Partial<ConnectionModel>): Promise<any> => {
      let target = { ...connection }
      if (connection?.id && (!connection?.host || !connection?.password)) {
        const list = await ctx.listConnections()
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
        const list = await ctx.listConnections()
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
        const all = await ctx.listConnections()
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

      if (target?.password && target?.id && isCiphertext(target.password)) {
        target = {
          ...target,
          password: await decryptConnectionPassword(target.password, target.id),
        }
      }

      const res = await callCommand<any>('connect', { input: target })
      if (res?.database && target?.id) {
        ctx.updateLastDatabase(target.id, res.database).catch(() => {})
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
            { name: 'tempdb', isSystem: true, isOnline: true },
            { name: 'model', isSystem: true, isOnline: true },
            { name: 'msdb', isSystem: true, isOnline: true },
          ]),
        serverVersion: res?.serverVersion || (isMysql ? 'MySQL 8.0' : 'Microsoft SQL Server'),
        serverName: res?.serverName || target?.host || '127.0.0.1',
        edition: res?.edition || (isMysql ? 'Community Edition' : 'Developer Edition'),
        ...(res || {}),
      }
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

    createDatabase: async (input: { connectionId: string; database: string; [key: string]: unknown }): Promise<unknown> => {
      return callCommand('create_database', { input })
    },

    dropDatabase: async (input: { connectionId: string; database: string; confirmName?: string; acknowledged?: boolean; [key: string]: unknown }): Promise<unknown> => {
      return callCommand('drop_database', { input })
    },

    listDatabaseUsers: async (
      connectionId: string,
      database: string,
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
      depth: number = 1,
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
      table: string,
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
      table: string,
    ): Promise<TableStructureResult | null> => {
      return ops.describeTable(connectionId, database, schema, table)
    },

    describeRelations: async (
      connectionId: string,
      database: string,
      schema: string,
      table: string,
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
      table: string,
    ): Promise<TableRelation[]> => {
      const res = await callCommand<{ relations?: TableRelation[] }>('table_relations', {
        connectionId,
        database,
        schema,
        table,
      })
      return res?.relations || []
    },

    listRoutines: async (connectionId: string, database: string): Promise<DatabaseModule[]> => {
      const res = await callCommand<{ modules?: DatabaseModule[] }>('list_modules', {
        connectionId,
        database,
      })
      return res?.modules || []
    },

    listModules: async (connectionId: string, database: string): Promise<DatabaseModule[]> => {
      const res = await callCommand<{ modules?: DatabaseModule[] }>('list_modules', {
        connectionId,
        database,
      })
      return res?.modules || []
    },

    getRoutineDefinition: async (
      connectionId: string,
      database: string,
      schema: string,
      name: string,
      type?: string,
    ): Promise<{ definition?: string; [key: string]: unknown }> => {
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
      type?: string,
    ): Promise<{ definition?: string; [key: string]: unknown }> => {
      return ops.getRoutineDefinition(connectionId, database, schema, name, type)
    },

    describeResult: async (
      connectionId: string,
      database: string,
      sql: string,
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
  }

  return ops
}
