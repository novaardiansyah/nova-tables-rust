export function quoteIdentifier(name: string | number): string {
  return `[${String(name).replace(/]/g, ']]')}]`
}

export interface DesignColumn {
  name: string
  originalName?: string | null
  typeName: string
  maxLength?: number | null
  precision?: number | null
  scale?: number | null
  isNullable?: boolean | null
  isIdentity?: boolean | null
  isComputed?: boolean | null
  computedDefinition?: string | null
  seedValue?: number | null
  incrementValue?: number | null
  collation?: string | null
  databaseCollation?: string | null
  defaultDefinition?: string | null
  defaultName?: string | null
}

export interface DesignUniqueKey {
  name: string
  clustered?: boolean
  columns: string[]
}

export interface DesignForeignKeyColumn {
  column: string
  referencedColumn: string
}

export interface DesignForeignKey {
  name: string
  referencedSchema: string
  referencedTable: string
  columns: DesignForeignKeyColumn[]
}

export interface DesignIndex {
  name: string
  clustered?: boolean
  unique?: boolean
  columns: string[]
  descending?: boolean[]
}

export interface TableDesign {
  schema: string
  table: string
  columns: DesignColumn[]
  primaryKey?: string[] | null
  primaryKeyName?: string | null
  uniqueKeys?: DesignUniqueKey[] | null
  foreignKeys?: DesignForeignKey[] | null
  indexes?: DesignIndex[] | null
  statement?: string
  [key: string]: unknown
}

function typeSql(typeName: string, column: DesignColumn): string {
  const t = String(typeName).toLowerCase()
  if (t === 'decimal' || t === 'numeric') {
    return `${typeName}(${column.precision ?? 10}, ${column.scale ?? 0})`
  }
  if (['char', 'varchar', 'binary', 'varbinary'].includes(t)) {
    return `${typeName}(${column.maxLength === -1 ? 'MAX' : column.maxLength ?? 1})`
  }
  if (['nchar', 'nvarchar'].includes(t)) {
    return `${typeName}(${column.maxLength === -1 ? 'MAX' : (column.maxLength ?? 2) / 2})`
  }
  if (['datetime2', 'datetimeoffset', 'time'].includes(t)) {
    return `${typeName}(${column.scale ?? 7})`
  }
  return typeName
}

function collationSql(column: DesignColumn): string {
  if (!column.collation || column.collation === column.databaseCollation) return ''
  return ` COLLATE ${column.collation}`
}

function columnBody(column: DesignColumn): string {
  return `${quoteIdentifier(column.name)} ${typeSql(column.typeName, column)}${collationSql(column)}${
    column.isNullable ? '' : ' NOT NULL'
  }`
}

function columnAdd(column: DesignColumn): string {
  if (column.isComputed && column.computedDefinition) {
    return `${quoteIdentifier(column.name)} AS ${column.computedDefinition}`
  }
  let definition = columnBody(column)
  if (column.isIdentity) {
    definition += ` IDENTITY(${column.seedValue ?? 1}, ${column.incrementValue ?? 1})`
  }
  if (column.defaultDefinition) definition += ` DEFAULT ${column.defaultDefinition}`
  return definition
}

function uniqueSql(key: DesignUniqueKey): string {
  return `CONSTRAINT ${quoteIdentifier(key.name)} UNIQUE${
    key.clustered ? ' CLUSTERED' : ''
  } (${key.columns.map(quoteIdentifier).join(', ')})`
}

function foreignSql(_table: TableDesign, foreign: DesignForeignKey): string {
  const columns = foreign.columns.map((item) => quoteIdentifier(item.column)).join(', ')
  const referenced = foreign.columns.map((item) => quoteIdentifier(item.referencedColumn)).join(', ')
  return `CONSTRAINT ${quoteIdentifier(foreign.name)} FOREIGN KEY (${columns}) REFERENCES ${quoteIdentifier(
    foreign.referencedSchema,
  )}.${quoteIdentifier(foreign.referencedTable)} (${referenced})`
}

function indexSql(table: TableDesign, index: DesignIndex): string {
  const columns = index.columns
    .map((column, position) => `${quoteIdentifier(column)}${index.descending?.[position] ? ' DESC' : ''}`)
    .join(', ')
  return `CREATE ${index.clustered ? 'CLUSTERED ' : ''}${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(
    index.name,
  )} ON ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.table)} (${columns})`
}

function tableName(design: TableDesign): string {
  return `${quoteIdentifier(design.schema)}.${quoteIdentifier(design.table)}`
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index])
}

export function generateCreateTable(design: TableDesign): string {
  const lines = design.columns.map(columnAdd)
  if (design.primaryKey?.length) {
    lines.push(`PRIMARY KEY (${design.primaryKey.map(quoteIdentifier).join(', ')})`)
  }
  for (const key of design.uniqueKeys ?? []) lines.push(uniqueSql(key))
  for (const foreign of design.foreignKeys ?? []) {
    if (foreign.referencedTable) lines.push(foreignSql(design, foreign))
  }

  const body = lines.map((line) => `  ${line}`).join(', \n')
  const statements = [`CREATE TABLE ${tableName(design)} (\n${body}\n);`]
  for (const index of design.indexes ?? []) statements.push(`${indexSql(design, index)};`)
  return statements.join('\n\n')
}

export function generateAlterTable(original: TableDesign | null | undefined, design: TableDesign): string {
  const table = tableName(design)
  const originalColumns = new Map<string, DesignColumn>(
    (original?.columns ?? []).map((column) => [column.name, column])
  )
  const draftOriginalNames = new Set<string>()
  const statements: string[] = []

  const droppedColumns: string[] = []
  const renamedColumns: { from: string; to: string }[] = []
  const addedColumns: DesignColumn[] = []
  const alteredColumns: DesignColumn[] = []

  for (const column of design.columns ?? []) {
    const previousName = column.originalName ?? null
    if (previousName) draftOriginalNames.add(previousName)
    const previous = previousName ? originalColumns.get(previousName) : null

    if (!previous) {
      addedColumns.push(column)
      continue
    }

    if (column.isIdentity !== previous.isIdentity) {
      throw new Error(`Column ${column.name}: identity cannot be changed on an existing column.`)
    }
    if (column.isComputed !== previous.isComputed || column.computedDefinition !== previous.computedDefinition) {
      throw new Error(`Column ${column.name}: computed expression cannot be changed on an existing column.`)
    }

    if (column.name !== previous.name) {
      renamedColumns.push({ from: previous.name, to: column.name })
    }

    if (columnBody(column) !== columnBody({ ...previous, name: column.name })) {
      alteredColumns.push(column)
    }
  }

  for (const name of originalColumns.keys()) {
    if (!draftOriginalNames.has(name)) droppedColumns.push(name)
  }

  const originalPrimaryColumns = original?.primaryKey ?? []
  const originalPrimaryKeyName = original?.primaryKeyName ?? null
  const primaryChanged = !sameColumns(originalPrimaryColumns, design.primaryKey ?? [])

  const originalForeign = new Map<string, DesignForeignKey>(
    (original?.foreignKeys ?? []).map((key) => [key.name, key])
  )
  const draftForeign = new Map<string, DesignForeignKey>(
    (design.foreignKeys ?? []).map((key) => [key.name, key])
  )
  const originalUnique = new Map<string, DesignUniqueKey>(
    (original?.uniqueKeys ?? []).map((key) => [key.name, key])
  )
  const draftUnique = new Map<string, DesignUniqueKey>(
    (design.uniqueKeys ?? []).map((key) => [key.name, key])
  )
  const originalIndexes = new Map<string, DesignIndex>(
    (original?.indexes ?? []).map((index) => [index.name, index])
  )
  const draftIndexes = new Map<string, DesignIndex>(
    (design.indexes ?? []).map((index) => [index.name, index])
  )

  const changedForeign = (name: string) =>
    originalForeign.has(name) && JSON.stringify(originalForeign.get(name)) !== JSON.stringify(draftForeign.get(name))
  const changedUnique = (name: string) =>
    originalUnique.has(name) && JSON.stringify(originalUnique.get(name)) !== JSON.stringify(draftUnique.get(name))
  const changedIndex = (name: string) =>
    originalIndexes.has(name) && JSON.stringify(originalIndexes.get(name)) !== JSON.stringify(draftIndexes.get(name))

  for (const name of originalForeign.keys()) {
    if (!draftForeign.has(name) || changedForeign(name)) {
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(name)};`)
    }
  }
  for (const name of originalIndexes.keys()) {
    if (!draftIndexes.has(name) || changedIndex(name)) {
      statements.push(`DROP INDEX ${quoteIdentifier(name)} ON ${table};`)
    }
  }
  for (const name of originalUnique.keys()) {
    if (!draftUnique.has(name) || changedUnique(name)) {
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(name)};`)
    }
  }
  if (primaryChanged && originalPrimaryKeyName) {
    statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(originalPrimaryKeyName)};`)
  }

  for (const name of droppedColumns) {
    statements.push(`ALTER TABLE ${table} DROP COLUMN ${quoteIdentifier(name)};`)
  }

  for (const rename of renamedColumns) {
    statements.push(
      `EXEC sp_rename N'${table.replace(/'/g, "''")}.${quoteIdentifier(rename.from).replace(/'/g, "''")}', N'${rename.to.replace(/'/g, "''")}', 'COLUMN';`,
    )
  }

  for (const column of alteredColumns) {
    statements.push(`ALTER TABLE ${table} ALTER COLUMN ${columnBody(column)};`)
  }

  for (const column of addedColumns) {
    statements.push(`ALTER TABLE ${table} ADD ${columnAdd(column)};`)
  }

  for (const column of design.columns ?? []) {
    const previous = column.originalName ? originalColumns.get(column.originalName) : null
    if (!previous) continue
    if ((previous.defaultDefinition ?? null) === (column.defaultDefinition ?? null)) continue

    if (previous.defaultName) {
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(previous.defaultName)};`)
    }
    if (column.defaultDefinition) {
      const name = previous.defaultName ?? `DF_${design.table}_${column.name}`.slice(0, 128)
      statements.push(
        `ALTER TABLE ${table} ADD CONSTRAINT ${quoteIdentifier(name)} DEFAULT ${column.defaultDefinition} FOR ${quoteIdentifier(column.name)};`,
      )
    }
  }

  if (primaryChanged && (design.primaryKey ?? []).length) {
    statements.push(
      `ALTER TABLE ${table} ADD PRIMARY KEY (${design.primaryKey!.map(quoteIdentifier).join(', ')});`,
    )
  }

  for (const [name, key] of draftUnique) {
    if (!originalUnique.has(name) || changedUnique(name)) {
      statements.push(`ALTER TABLE ${table} ADD ${uniqueSql(key)};`)
    }
  }

  for (const [name, foreign] of draftForeign) {
    if (!originalForeign.has(name) || changedForeign(name)) {
      if (foreign.referencedTable) statements.push(`ALTER TABLE ${table} ADD ${foreignSql(design, foreign)};`)
    }
  }

  for (const [name, index] of draftIndexes) {
    if (!originalIndexes.has(name) || changedIndex(name)) {
      statements.push(`${indexSql(design, index)};`)
    }
  }

  if (statements.length === 0) return '-- No changes'
  return statements.join('\n')
}

export function checkRequiresRecreation(
  original: TableDesign | null | undefined,
  design: TableDesign | null | undefined
): boolean {
  if (!original?.columns || !design?.columns) return false
  const origList = (original.columns ?? []).map((c) => c.name)
  const draftList = design.columns ?? []

  let lastOldIndex = -1
  for (let i = 0; i < draftList.length; i++) {
    const col = draftList[i]
    const origName = col.originalName || (origList.includes(col.name) ? col.name : null)
    if (origName) {
      if (i < lastOldIndex) return true
      lastOldIndex = i
    } else {
      const hasOldAfter = draftList.slice(i + 1).some((c) => {
        const name = c.originalName || (origList.includes(c.name) ? c.name : null)
        return Boolean(name)
      })
      if (hasOldAfter) return true
    }
  }

  const draftOldNames = draftList
    .map((c) => c.originalName || (origList.includes(c.name) ? c.name : null))
    .filter((n): n is string => Boolean(n))
  const origFiltered = origList.filter((name) => draftOldNames.includes(name))
  for (let i = 0; i < draftOldNames.length; i++) {
    if (draftOldNames[i] !== origFiltered[i]) return true
  }

  return false
}

export function generateRecreateTable(
  original: TableDesign,
  design: TableDesign
): string {
  const tmpName = `_tmp_nova_${design.table}`.slice(0, 128)
  const tmpDesign: TableDesign = {
    ...design,
    table: tmpName,
  }
  const fullOriginalTable = tableName(design)
  const fullTmpTable = `${quoteIdentifier(design.schema)}.${quoteIdentifier(tmpName)}`

  const createTmpSql = generateCreateTable(tmpDesign)

  const origColMap = new Map((original.columns ?? []).map((c) => [c.name, c]))
  const copyColumns: { dest: string; src: string }[] = []
  for (const col of design.columns ?? []) {
    if (col.isComputed) continue
    const origName = col.originalName || (origColMap.has(col.name) ? col.name : null)
    if (origName && origColMap.has(origName)) {
      copyColumns.push({ dest: col.name, src: origName })
    }
  }

  const hasIdentity = (design.columns ?? []).some((c) => c.isIdentity)
  const statements = ['BEGIN TRANSACTION;']

  statements.push(createTmpSql)

  if (copyColumns.length > 0) {
    if (hasIdentity) {
      statements.push(`SET IDENTITY_INSERT ${fullTmpTable} ON;`)
    }
    const destList = copyColumns.map((c) => quoteIdentifier(c.dest)).join(', ')
    const srcList = copyColumns.map((c) => quoteIdentifier(c.src)).join(', ')
    statements.push(
      `INSERT INTO ${fullTmpTable} (${destList}) SELECT ${srcList} FROM ${fullOriginalTable} WITH (HOLDLOCK TABLOCKX);`,
    )
    if (hasIdentity) {
      statements.push(`SET IDENTITY_INSERT ${fullTmpTable} OFF;`)
    }
  }

  statements.push(`DROP TABLE ${fullOriginalTable};`)
  statements.push(
    `EXEC sp_rename N'${design.schema.replace(/'/g, "''")}.${tmpName.replace(/'/g, "''")}', N'${design.table.replace(/'/g, "''")}', 'OBJECT';`,
  )
  statements.push('COMMIT TRANSACTION;')

  return statements.join('\n\n')
}
