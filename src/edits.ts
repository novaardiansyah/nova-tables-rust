import { quoteIdentifier, rowCondition, sqlLiteral } from '@/resultFormats'

export interface EditTableTarget {
  schema: string
  table: string
  primaryKey: string[]
  keyColumns: (string | null)[]
  columns: Record<string, string>
  editable: string[] | null
  identityColumns?: string[] | null
}

export interface EditSource {
  sql: string
  joined: boolean
  inferred: boolean
  driverType?: string | null
  tables: EditTableTarget[]
}

export interface SourceTable {
  schema: string
  name: string
  primaryKey?: string[] | null
  identityColumns?: string[] | null
}

export interface QueryColumnMeta {
  name: string
  schema?: string | null
  table?: string | null
  column?: string | null
  updateable?: boolean | null
  computed?: boolean | null
}

export interface ResultSetColumn {
  name: string
}

export interface ResultSet {
  columns: ResultSetColumn[]
  rows: unknown[][]
}

export interface CellEdit {
  value: unknown
}

const UNSUPPORTED_EDIT_SOURCE = /\b(join|union|into|group\s+by|having)\b/i
const IDENTIFIER = '(?:\\[[^\\]]+\\]|`[^`]+`|[A-Za-z_][\\w$#@]*)'
const TABLE_REFERENCE = new RegExp(
  `\\bfrom\\s+(${IDENTIFIER})(?:\\s*\\.\\s*(${IDENTIFIER}))?`,
  'i',
)

function unquoteIdentifier(value: string): string {
  const bracketed = /^\[([^\]]+)\]$/.exec(value)
  if (bracketed) return bracketed[1]
  const backticked = /^`([^`]+)`$/.exec(value)
  if (backticked) return backticked[1]
  return value
}

const PLAIN_COLUMN = new RegExp(`^(${IDENTIFIER})(\\s*\\.\\s*(${IDENTIFIER}))?$`)

function plainProjection(text: string): boolean {
  const match = /^select\s+([\s\S]*?)\s+from\b/i.exec(text)
  if (!match) return false
  const items = match[1].split(',')
  if (!items.length) return false
  const qualifiedStar = new RegExp(`^${IDENTIFIER}\\s*\\.\\s*\\*$`)
  return items.every((item) => {
    const value = item.trim()
    if (value === '*') return true
    if (qualifiedStar.test(value)) return true
    return PLAIN_COLUMN.test(value)
  })
}

export function buildEditSource(
  table: SourceTable,
  sql: string,
  driverType?: string | null,
): EditSource {
  const primaryKey = table.primaryKey ?? []
  const identityColumns = table.identityColumns ?? []
  return {
    sql,
    joined: false,
    inferred: false,
    driverType,
    tables: [
      {
        schema: table.schema,
        table: table.name,
        primaryKey,
        keyColumns: primaryKey,
        columns: {},
        editable: null,
        identityColumns,
      },
    ],
  }
}

export function editTableFromSql(sql: string | null | undefined, tables: SourceTable[]): SourceTable | null {
  const text = String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .trim()
  if (!/^select\b/i.test(text) || UNSUPPORTED_EDIT_SOURCE.test(text)) return null
  if (!plainProjection(text)) return null

  const match = TABLE_REFERENCE.exec(text)
  if (!match) return null
  const schema = match[2] ? unquoteIdentifier(match[1]) : null
  const name = unquoteIdentifier(match[2] || match[1])

  return (
    tables.find(
      (table) =>
        table.name.toLowerCase() === name.toLowerCase() &&
        (schema === null || table.schema.toLowerCase() === schema.toLowerCase()),
    ) ?? null
  )
}

export function buildQueryEditSource({
  sql,
  columns,
  tables,
  driverType,
}: {
  sql: string | null | undefined
  columns: QueryColumnMeta[] | null | undefined
  tables: SourceTable[]
  driverType?: string | null
}): EditSource | null {
  if (!sql || !Array.isArray(columns) || !columns.length) return null

  const nameCounts = new Map<string, number>()
  for (const column of columns) {
    if (!column.name) continue
    const key = column.name.toLowerCase()
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }
  const uniqueName = (name: string) => nameCounts.get(String(name).toLowerCase()) === 1

  const byTable = new Map<string, QueryColumnMeta[]>()
  for (const column of columns) {
    if (!column.name || !column.schema || !column.table || !column.column) continue
    const key = `${column.schema}.${column.table}`.toLowerCase()
    const list = byTable.get(key) ?? []
    list.push(column)
    byTable.set(key, list)
  }

  const sources: EditTableTarget[] = []
  for (const list of byTable.values()) {
    const schema = String(list[0].schema)
    const name = String(list[0].table)
    const table = tables.find(
      (item) =>
        item.name.toLowerCase() === name.toLowerCase() &&
        item.schema.toLowerCase() === schema.toLowerCase(),
    )
    if (!table) continue

    const primaryKey = table.primaryKey ?? []
    const keyColumns = primaryKey.map(
      (keyName) =>
        list.find((column) => column.column?.toLowerCase() === keyName.toLowerCase())?.name ?? null,
    )
    if (!keyColumns.length || keyColumns.some((value) => value === null)) continue
    if (!keyColumns.every((k) => k !== null && uniqueName(k))) continue

    const mapping: Record<string, string> = {}
    const editable: string[] = []
    for (const column of list) {
      if (column.column) {
        mapping[column.name] = column.column
      }
      if (column.updateable && !column.computed && column.name && uniqueName(column.name)) {
        editable.push(column.name)
      }
    }
    if (!editable.length) continue

    sources.push({
      schema: table.schema,
      table: table.name,
      primaryKey,
      keyColumns,
      columns: mapping,
      editable,
      identityColumns: table.identityColumns ?? [],
    })
  }

  if (!sources.length) return null

  return {
    sql,
    joined: byTable.size > 1,
    inferred: true,
    driverType,
    tables: sources,
  }
}

export function editAllows(editSource: EditSource | null | undefined, columnName: string): boolean {
  if (!editSource) return false
  return editSource.tables.some(
    (table) => !table.editable || table.editable.includes(columnName),
  )
}

export function editEditableColumns(editSource: EditSource | null | undefined): Set<string> | null {
  if (!editSource) return null
  if (editSource.tables.every((table) => !table.editable)) return null
  const names = new Set<string>()
  for (const table of editSource.tables) {
    for (const name of table.editable ?? []) names.add(name)
  }
  return names
}

export function editHasKeys(editSource: EditSource | null | undefined): boolean {
  return Boolean(editSource && editSource.tables.some((table) => table.primaryKey.length))
}

export function editSqlHeader(editSource: EditSource | null | undefined): string {
  return ''
}

function editTarget(editSource: EditSource, columnName: string): EditTableTarget | null {
  return (
    editSource.tables.find(
      (table) => !table.editable || table.editable.includes(columnName),
    ) ?? null
  )
}

function columnIndexes(resultSet: ResultSet): Map<string, number> {
  return new Map(resultSet.columns.map((column, index) => [column.name.toLowerCase(), index]))
}

function keyPositions(target: EditTableTarget, indexes: Map<string, number>): number[] | null {
  const positions: number[] = []
  for (const name of target.keyColumns) {
    if (name === null) return null
    const pos = indexes.get(name.toLowerCase())
    if (pos === undefined) return null
    positions.push(pos)
  }
  return positions
}

export function isAutoIncrementPrimaryKey(
  columnName: string,
  editSource?: EditSource | null,
  columns?: ResultSetColumn[] | null,
): boolean {
  if (!columnName) return false
  const lower = columnName.toLowerCase()

  if (editSource?.tables) {
    for (const table of editSource.tables) {
      const isPk =
        (table.primaryKey || []).some((k) => k.toLowerCase() === lower) ||
        (table.keyColumns || []).some((k) => k && k.toLowerCase() === lower)
      const isIdentity = (table.identityColumns || []).some((k) => k.toLowerCase() === lower)
      if (isPk && isIdentity) return true
    }
  }

  if (columns) {
    const col = columns.find((c) => c.name.toLowerCase() === lower)
    if (col && (col as any).isIdentity && (col as any).isPrimaryKey) return true
  }

  return false
}

export function buildInsertStatements(
  editSource: EditSource | null | undefined,
  resultSet: ResultSet | null | undefined,
  edits: Record<string, CellEdit>,
  creatingRows: number[] = [],
): string[] {
  if (!editSource || !resultSet || !creatingRows.length) return []
  const target = editSource.tables[0]
  if (!target) return []

  const driverType = editSource.driverType ?? null
  const statements: string[] = []

  for (const rowIndex of creatingRows) {
    const row = resultSet.rows[rowIndex]
    const assignments: [string, unknown][] = []

    for (let colIdx = 0; colIdx < resultSet.columns.length; colIdx += 1) {
      const col = resultSet.columns[colIdx]
      if (!col) continue
      const colName = col.name

      if (isAutoIncrementPrimaryKey(colName, editSource, resultSet.columns)) {
        continue
      }

      const editKey = `${rowIndex}:${colName}`
      if (editKey in edits) {
        const val = edits[editKey].value
        const targetCol = target.columns[colName] ?? colName
        assignments.push([targetCol, val])
      } else if (row && row[colIdx] !== null && row[colIdx] !== undefined) {
        const targetCol = target.columns[colName] ?? colName
        assignments.push([targetCol, row[colIdx]])
      }
    }

    const tableIdent =
      driverType === 'mysql'
        ? // Targeted for MySQL: backtick quoting for schema and table name.
          `\`${target.schema.replace(/`/g, '``')}\`.\`${target.table.replace(/`/g, '``')}\``
        : // Targeted for SQL Server: bracket quoting for schema and table name.
          `[${target.schema.replace(/]/g, ']]')}].[${target.table.replace(/]/g, ']]')}]`

    if (assignments.length === 0) {
      if (driverType === 'mysql') {
        // Targeted for MySQL: insert default values with empty column and value list.
        statements.push(`INSERT INTO ${tableIdent} () VALUES ();`)
      } else {
        // Targeted for SQL Server: insert default values using DEFAULT VALUES syntax.
        statements.push(`INSERT INTO ${tableIdent} DEFAULT VALUES;`)
      }
    } else {
      const colList = assignments.map(([c]) => quoteIdentifier(c, driverType)).join(', ')
      const valList = assignments.map(([, v]) => sqlLiteral(v, driverType)).join(', ')
      statements.push(`INSERT INTO ${tableIdent} (${colList})\nVALUES (${valList});`)
    }
  }

  return statements
}

export function buildUpdateStatements(
  editSource: EditSource | null | undefined,
  resultSet: ResultSet | null | undefined,
  edits: Record<string, CellEdit>,
  creatingRows: number[] = [],
): string[] {
  if (!editSource || !resultSet) return []

  const insertStatements = buildInsertStatements(editSource, resultSet, edits, creatingRows)

  const creatingSet = new Set(creatingRows)
  const updateEdits: Record<string, CellEdit> = {}
  for (const [key, edit] of Object.entries(edits)) {
    const [rowKey] = key.split(':')
    if (!creatingSet.has(Number(rowKey))) {
      updateEdits[key] = edit
    }
  }

  const indexes = columnIndexes(resultSet)
  const groups = new Map<
    string,
    {
      target: EditTableTarget
      positions: number[]
      rows: Map<number, { row: unknown[]; assignments: Map<string, unknown> }>
    }
  >()

  for (const [key, edit] of Object.entries(updateEdits)) {
    const [rowKey, columnName] = key.split(':')
    const rowIndex = Number(rowKey)
    const target = editTarget(editSource, columnName)
    if (!target) continue
    const positions = keyPositions(target, indexes)
    if (!positions) continue
    const row = resultSet.rows[rowIndex]
    if (!row) continue

    const groupKey = `${target.schema}.${target.table}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { target, positions, rows: new Map() }
      groups.set(groupKey, group)
    }
    let rowEdits = group.rows.get(rowIndex)
    if (!rowEdits) {
      rowEdits = { row, assignments: new Map() }
      group.rows.set(rowIndex, rowEdits)
    }
    rowEdits.assignments.set(target.columns[columnName] ?? columnName, edit.value)
  }

  const statements: string[] = []
  const driverType = editSource.driverType ?? null
  for (const group of groups.values()) {
    for (const { row, assignments } of group.rows.values()) {
      const setText = Array.from(assignments)
        .map(([column, value]) => `${quoteIdentifier(column, driverType)} = ${sqlLiteral(value, driverType)}`)
        .join(',\n       ')
      statements.push(
        `UPDATE ${quoteIdentifier(group.target.schema, driverType)}.${quoteIdentifier(group.target.table, driverType)}\n   SET ${setText}\n WHERE ${rowCondition(group.target.primaryKey, group.positions, row, driverType)};`,
      )
    }
  }
  return [...insertStatements, ...statements]
}

export function buildDeleteStatementsForRows(
  editSource: EditSource | null | undefined,
  resultSet: ResultSet | null | undefined,
  rowIndexes: number[]
): string[] {
  if (!editSource || !resultSet) return []
  const target = editSource.tables[0]
  if (!target) return []
  const positions = keyPositions(target, columnIndexes(resultSet))
  if (!positions) return []

  const statements: string[] = []
  const driverType = editSource.driverType ?? null
  for (const rowIndex of rowIndexes) {
    const row = resultSet.rows[rowIndex]
    if (!row) continue
    statements.push(
      `DELETE FROM ${quoteIdentifier(target.schema, driverType)}.${quoteIdentifier(target.table, driverType)}\n WHERE ${rowCondition(target.primaryKey, positions, row, driverType)};`,
    )
  }
  return statements
}

export function buildDeleteStatements(
  editSource: EditSource | null | undefined,
  resultSet: ResultSet | null | undefined,
  rowStart: number,
  rowEnd: number
): string[] {
  if (!editSource || !resultSet) return []
  const target = editSource.tables[0]
  if (!target) return []
  const positions = keyPositions(target, columnIndexes(resultSet))
  if (!positions) return []

  const statements: string[] = []
  const driverType = editSource.driverType ?? null
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const row = resultSet.rows[rowIndex]
    if (!row) continue
    statements.push(
      `DELETE FROM ${quoteIdentifier(target.schema, driverType)}.${quoteIdentifier(target.table, driverType)}\n WHERE ${rowCondition(target.primaryKey, positions, row, driverType)};`,
    )
  }
  return statements
}
