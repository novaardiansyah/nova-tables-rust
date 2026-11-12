export function quoteIdentifier(name: string | number, driverType: string | null = null): string {
  if (driverType === 'mysql') {
    return `\`${String(name).replace(/`/g, '``')}\``
  }
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
  onDelete?: string | null
  onUpdate?: string | null
}

export interface DesignReferencingForeignKey {
  name: string
  schema: string
  table: string
  columns: DesignForeignKeyColumn[]
  onDelete?: string | null
  onUpdate?: string | null
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
  referencingForeignKeys?: DesignReferencingForeignKey[] | null
  indexes?: DesignIndex[] | null
  statement?: string
  [key: string]: unknown
}

function typeSql(typeName: string, column: DesignColumn, driverType?: string | null): string {
  const t = String(typeName).toLowerCase()
  if (t === 'decimal' || t === 'numeric') {
    return `${typeName}(${column.precision ?? 10}, ${column.scale ?? 0})`
  }
  if (['char', 'varchar', 'binary', 'varbinary'].includes(t)) {
    // Targeted for MySQL vs SQL Server: MySQL does not support VARCHAR(MAX) or VARBINARY(MAX); map to LONGTEXT / LONGBLOB.
    if (driverType === 'mysql' && column.maxLength === -1) {
      return ['binary', 'varbinary'].includes(t) ? 'LONGBLOB' : 'LONGTEXT'
    }
    return `${typeName}(${column.maxLength === -1 ? 'MAX' : column.maxLength ?? 1})`
  }
  if (['nchar', 'nvarchar'].includes(t)) {
    // Targeted for MySQL vs SQL Server: MySQL does not support NVARCHAR(MAX); map to LONGTEXT.
    if (driverType === 'mysql' && column.maxLength === -1) {
      return 'LONGTEXT'
    }
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

function columnBody(column: DesignColumn, driverType: string = 'mssql'): string {
  return `${quoteIdentifier(column.name, driverType)} ${typeSql(column.typeName, column, driverType)}${collationSql(column)}${
    column.isNullable ? '' : ' NOT NULL'
  }`
}

function columnAdd(column: DesignColumn, driverType: string = 'mssql'): string {
  const parts: string[] = [quoteIdentifier(column.name, driverType), typeSql(column.typeName, column, driverType)]
  const collation = collationSql(column)
  if (collation) parts.push(collation.trim())
  if (!column.isNullable) parts.push('NOT NULL')
  if (column.isIdentity) {
    parts.push(driverType === 'mysql' ? 'AUTO_INCREMENT' : `IDENTITY(${column.seedValue ?? 1}, ${column.incrementValue ?? 1})`)
  }
  if (column.defaultDefinition) parts.push(`DEFAULT ${column.defaultDefinition}`)
  return parts.join(' ')
}

function uniqueSql(key: DesignUniqueKey, driverType: string = 'mssql'): string {
  return `CONSTRAINT ${quoteIdentifier(key.name, driverType)} UNIQUE${
    key.clustered ? ' CLUSTERED' : ''
  } (${key.columns.map((c) => quoteIdentifier(c, driverType)).join(', ')})`
}

function referentialActionSql(foreign: { onDelete?: string | null; onUpdate?: string | null }): string {
  const parts: string[] = []
  if (foreign.onDelete && foreign.onDelete !== 'NO ACTION' && foreign.onDelete !== 'RESTRICT') {
    parts.push(`ON DELETE ${foreign.onDelete}`)
  }
  if (foreign.onUpdate && foreign.onUpdate !== 'NO ACTION' && foreign.onUpdate !== 'RESTRICT') {
    parts.push(`ON UPDATE ${foreign.onUpdate}`)
  }
  return parts.length ? ` ${parts.join(' ')}` : ''
}

function foreignSql(_table: TableDesign, foreign: DesignForeignKey, driverType: string = 'mssql'): string {
  const columns = foreign.columns.map((item) => quoteIdentifier(item.column, driverType)).join(', ')
  const referenced = foreign.columns.map((item) => quoteIdentifier(item.referencedColumn, driverType)).join(', ')
  return `CONSTRAINT ${quoteIdentifier(foreign.name, driverType)} FOREIGN KEY (${columns}) REFERENCES ${quoteIdentifier(
    foreign.referencedSchema,
    driverType,
  )}.${quoteIdentifier(foreign.referencedTable, driverType)} (${referenced})${referentialActionSql(foreign)}`
}

function referencingForeignSql(
  design: TableDesign,
  foreign: DesignReferencingForeignKey,
  driverType: string = 'mssql',
): string {
  const columns = foreign.columns.map((item) => quoteIdentifier(item.column, driverType)).join(', ')
  const referenced = foreign.columns.map((item) => quoteIdentifier(item.referencedColumn, driverType)).join(', ')
  return `ALTER TABLE ${quoteIdentifier(foreign.schema, driverType)}.${quoteIdentifier(foreign.table, driverType)} ADD CONSTRAINT ${quoteIdentifier(
    foreign.name,
    driverType,
  )} FOREIGN KEY (${columns}) REFERENCES ${tableName(design, driverType)} (${referenced})${referentialActionSql(foreign)};`
}

function indexSql(table: TableDesign, index: DesignIndex, driverType: string = 'mssql'): string {
  const columns = index.columns
    .map((column, position) => `${quoteIdentifier(column, driverType)}${index.descending?.[position] ? ' DESC' : ''}`)
    .join(', ')
  return `CREATE ${index.clustered ? 'CLUSTERED ' : ''}${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(
    index.name,
    driverType,
  )} ON ${quoteIdentifier(table.schema, driverType)}.${quoteIdentifier(table.table, driverType)} (${columns})`
}

function tableName(design: TableDesign, driverType?: string | null): string {
  return `${quoteIdentifier(design.schema, driverType)}.${quoteIdentifier(design.table, driverType)}`
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index])
}

export function generateCreateTable(design: TableDesign, driverType?: string | null): string {
  const driver = driverType || 'mssql'
  const lines = design.columns.map((column) => columnAdd(column, driver))
  if (design.primaryKey?.length) {
    lines.push(`PRIMARY KEY (${design.primaryKey.map((c) => quoteIdentifier(c, driver)).join(', ')})`)
  }
  for (const key of design.uniqueKeys ?? []) lines.push(uniqueSql(key, driver))
  for (const foreign of design.foreignKeys ?? []) {
    if (foreign.referencedTable) lines.push(foreignSql(design, foreign, driver))
  }

  const body = lines.map((line) => `  ${line}`).join(', \n')
  const tableNameResult = tableName(design, driver)
  const statements = [`CREATE TABLE ${tableNameResult} (\n${body}\n);`]
  for (const index of design.indexes ?? []) statements.push(`${indexSql(design, index, driver)};`)
  return statements.join('\n\n')
}

export function generateAlterTable(original: TableDesign | null | undefined, design: TableDesign, driverType?: string | null): string {
  const driver = driverType || 'mssql'
  const table = tableName(design, driver)
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

    if (columnBody(column, driver) !== columnBody({ ...previous, name: column.name }, driver)) {
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
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(name, driver)};`)
    }
  }
  for (const name of originalIndexes.keys()) {
    if (!draftIndexes.has(name) || changedIndex(name)) {
      statements.push(`DROP INDEX ${quoteIdentifier(name, driver)} ON ${table};`)
    }
  }
  for (const name of originalUnique.keys()) {
    if (!draftUnique.has(name) || changedUnique(name)) {
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(name, driver)};`)
    }
  }
  if (primaryChanged && originalPrimaryKeyName) {
    statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(originalPrimaryKeyName, driver)};`)
  }

  for (const name of droppedColumns) {
    statements.push(`ALTER TABLE ${table} DROP COLUMN ${quoteIdentifier(name, driver)};`)
  }

  for (const rename of renamedColumns) {
    statements.push(
      `EXEC sp_rename N'${table.replace(/'/g, "''")}.${quoteIdentifier(rename.from, driver).replace(/'/g, "''")}', N'${rename.to.replace(/'/g, "''")}', 'COLUMN';`,
    )
  }

  for (const column of alteredColumns) {
    statements.push(`ALTER TABLE ${table} ALTER COLUMN ${columnBody(column, driver)};`)
  }

  for (const column of addedColumns) {
    statements.push(`ALTER TABLE ${table} ADD ${columnAdd(column, driver)};`)
  }

  for (const column of design.columns ?? []) {
    const previous = column.originalName ? originalColumns.get(column.originalName) : null
    if (!previous) continue
    if ((previous.defaultDefinition ?? null) === (column.defaultDefinition ?? null)) continue

    if (previous.defaultName) {
      statements.push(`ALTER TABLE ${table} DROP CONSTRAINT ${quoteIdentifier(previous.defaultName, driver)};`)
    }
    if (column.defaultDefinition) {
      const name = previous.defaultName ?? `DF_${design.table}_${column.name}`.slice(0, 128)
      statements.push(
        `ALTER TABLE ${table} ADD CONSTRAINT ${quoteIdentifier(name, driver)} DEFAULT ${column.defaultDefinition} FOR ${quoteIdentifier(column.name, driver)};`,
      )
    }
  }

  if (primaryChanged && (design.primaryKey ?? []).length) {
    statements.push(
      `ALTER TABLE ${table} ADD PRIMARY KEY (${design.primaryKey!.map((c) => quoteIdentifier(c, driver)).join(', ')});`,
    )
  }

  for (const [name, key] of draftUnique) {
    if (!originalUnique.has(name) || changedUnique(name)) {
      statements.push(`ALTER TABLE ${table} ADD ${uniqueSql(key, driver)};`)
    }
  }

  for (const [name, foreign] of draftForeign) {
    if (!originalForeign.has(name) || changedForeign(name)) {
      if (foreign.referencedTable) statements.push(`ALTER TABLE ${table} ADD ${foreignSql(design, foreign, driver)};`)
    }
  }

  for (const [name, index] of draftIndexes) {
    if (!originalIndexes.has(name) || changedIndex(name)) {
      statements.push(`${indexSql(design, index, driver)};`)
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
  design: TableDesign,
  driverType?: string | null
): string {
  const driver = driverType || 'mssql'
  const tmpName = `_tmp_nova_${design.table}`.slice(0, 128)
  const tmpDesign: TableDesign = {
    ...design,
    table: tmpName,
    foreignKeys: [],
    uniqueKeys: [],
  }
  const fullOriginalTable = tableName(design, driver)
  const fullTmpTable = `${quoteIdentifier(design.schema, driver)}.${quoteIdentifier(tmpName, driver)}`

  const createTmpSql = generateCreateTable(tmpDesign, driver)

  const origColMap = new Map((original.columns ?? []).map((c) => [c.name, c]))
  const copyColumns: { dest: string; src: string }[] = []
  for (const col of design.columns ?? []) {
    if (col.isComputed) continue
    const origName = col.originalName || (origColMap.has(col.name) ? col.name : null)
    if (origName && origColMap.has(origName)) {
      copyColumns.push({ dest: col.name, src: origName })
    }
  }

  const referencingForeignKeys = original.referencingForeignKeys ?? []
  const hasIdentity = (design.columns ?? []).some((c) => c.isIdentity)
  const statements = ['BEGIN TRANSACTION;']

  for (const foreign of referencingForeignKeys) {
    statements.push(
      `ALTER TABLE ${quoteIdentifier(foreign.schema, driver)}.${quoteIdentifier(foreign.table, driver)} DROP CONSTRAINT ${quoteIdentifier(foreign.name, driver)};`,
    )
  }

  statements.push(createTmpSql)

  if (copyColumns.length > 0) {
    if (hasIdentity) {
      statements.push(`SET IDENTITY_INSERT ${fullTmpTable} ON;`)
    }
    const destList = copyColumns.map((c) => quoteIdentifier(c.dest, driver)).join(', ')
    const srcList = copyColumns.map((c) => quoteIdentifier(c.src, driver)).join(', ')
    statements.push(
      `INSERT INTO ${fullTmpTable} (${destList}) SELECT ${srcList} FROM ${fullOriginalTable} WITH (HOLDLOCK TABLOCKX);`,
    )
    if (hasIdentity) {
      statements.push(`SET IDENTITY_INSERT ${fullTmpTable} OFF;`)
    }
  }

  statements.push(`DROP TABLE ${fullOriginalTable};`)
  if (driver === 'mysql') {
    // MySQL driver: RENAME TABLE is required to finalize recreated table in MySQL
    statements.push(`RENAME TABLE ${fullTmpTable} TO ${fullOriginalTable};`)
  } else {
    // SQL Server driver: sp_rename stored procedure is required to rename temporary table in SQL Server
    statements.push(
      `EXEC sp_rename N'${design.schema.replace(/'/g, "''")}.${tmpName.replace(/'/g, "''")}', N'${design.table.replace(/'/g, "''")}', 'OBJECT';`,
    )
  }

  for (const key of design.uniqueKeys ?? []) {
    statements.push(`ALTER TABLE ${fullOriginalTable} ADD ${uniqueSql(key, driver)};`)
  }
  for (const foreign of design.foreignKeys ?? []) {
    if (foreign.referencedTable) {
      statements.push(`ALTER TABLE ${fullOriginalTable} ADD ${foreignSql(design, foreign, driver)};`)
    }
  }
  for (const foreign of referencingForeignKeys) {
    statements.push(referencingForeignSql(design, foreign, driver))
  }
  statements.push('COMMIT TRANSACTION;')

  return statements.join('\n\n')
}

export function getDesignDiff(
  original: TableDesign | null | undefined,
  draft: TableDesign | null | undefined,
  mode: 'new' | 'edit' = 'edit',
  driverType?: string | null,
): { isDirty: boolean; changeCount: number; sql: string } {
  if (mode === 'new') {
    if (!draft) return { isDirty: false, changeCount: 0, sql: '' }
    const hasTableName = Boolean(draft.table && draft.table.trim().length > 0)
    const isDefaultTemplate =
      !hasTableName &&
      (draft.columns ?? []).length === 1 &&
      draft.columns[0]?.name === 'id' &&
      draft.columns[0]?.typeName === 'bigint' &&
      !(draft.uniqueKeys && draft.uniqueKeys.length > 0) &&
      !(draft.foreignKeys && draft.foreignKeys.length > 0) &&
      !(draft.indexes && draft.indexes.length > 0)
    if (isDefaultTemplate) {
      return { isDirty: false, changeCount: 0, sql: '' }
    }
    const changeCount = Math.max(
      1,
      (draft.columns ?? []).length +
        (draft.uniqueKeys?.length ?? 0) +
        (draft.foreignKeys?.length ?? 0) +
        (draft.indexes?.length ?? 0),
    )
    let sql = ''
    try {
      sql = generateCreateTable(draft, driverType)
    } catch {
      sql = ''
    }
    return { isDirty: true, changeCount, sql }
  }

  if (!original || !draft) {
    return { isDirty: false, changeCount: 0, sql: '' }
  }
  const tableRenamed = Boolean(
    draft.table && draft.table.trim() && draft.table.trim() !== original.table,
  )
  const originalColumns = new Map<string, DesignColumn>(
    (original.columns ?? []).map((col) => [col.name, col]),
  )
  const draftOriginalNames = new Set<string>()
  let addedCount = 0
  let alteredCount = 0
  let renamedCount = 0
  for (const col of draft.columns ?? []) {
    const prevName = col.originalName ?? null
    if (prevName) draftOriginalNames.add(prevName)
    const prev = prevName ? originalColumns.get(prevName) : null
    if (!prev) {
      addedCount += 1
    } else {
      if (col.name !== prev.name) renamedCount += 1
      if (
        columnBody(col, driverType || 'mssql') !==
        columnBody({ ...prev, name: col.name }, driverType || 'mssql')
      ) {
        alteredCount += 1
      }
    }
  }
  let droppedCount = 0
  for (const name of originalColumns.keys()) {
    if (!draftOriginalNames.has(name)) droppedCount += 1
  }
  const primaryChanged = !sameColumns(original.primaryKey ?? [], draft.primaryKey ?? []) ? 1 : 0

  const originalForeign = new Map((original.foreignKeys ?? []).map((k) => [k.name, k]))
  const draftForeign = new Map((draft.foreignKeys ?? []).map((k) => [k.name, k]))
  let foreignChangedCount = 0
  for (const [name, key] of draftForeign) {
    if (!originalForeign.has(name) || JSON.stringify(originalForeign.get(name)) !== JSON.stringify(key)) {
      foreignChangedCount += 1
    }
  }
  for (const name of originalForeign.keys()) {
    if (!draftForeign.has(name)) foreignChangedCount += 1
  }

  const originalUnique = new Map((original.uniqueKeys ?? []).map((k) => [k.name, k]))
  const draftUnique = new Map((draft.uniqueKeys ?? []).map((k) => [k.name, k]))
  let uniqueChangedCount = 0
  for (const [name, key] of draftUnique) {
    if (!originalUnique.has(name) || JSON.stringify(originalUnique.get(name)) !== JSON.stringify(key)) {
      uniqueChangedCount += 1
    }
  }
  for (const name of originalUnique.keys()) {
    if (!draftUnique.has(name)) uniqueChangedCount += 1
  }

  const originalIndexes = new Map((original.indexes ?? []).map((k) => [k.name, k]))
  const draftIndexes = new Map((draft.indexes ?? []).map((k) => [k.name, k]))
  let indexChangedCount = 0
  for (const [name, key] of draftIndexes) {
    if (!originalIndexes.has(name) || JSON.stringify(originalIndexes.get(name)) !== JSON.stringify(key)) {
      indexChangedCount += 1
    }
  }
  for (const name of originalIndexes.keys()) {
    if (!draftIndexes.has(name)) indexChangedCount += 1
  }

  const recreationNeeded = checkRequiresRecreation(original, draft)
  const changeCount =
    (tableRenamed ? 1 : 0) +
    addedCount +
    droppedCount +
    alteredCount +
    renamedCount +
    primaryChanged +
    foreignChangedCount +
    uniqueChangedCount +
    indexChangedCount +
    (recreationNeeded && addedCount === 0 && droppedCount === 0 && alteredCount === 0 && renamedCount === 0 ? 1 : 0)

  if (changeCount === 0) {
    return { isDirty: false, changeCount: 0, sql: '' }
  }

  const statements: string[] = []
  if (tableRenamed) {
    if (driverType === 'mysql') {
      // MySQL driver: ALTER TABLE ... RENAME TO is required for renaming tables in MySQL
      statements.push(
        `ALTER TABLE ${quoteIdentifier(original.schema || 'dbo', driverType)}.${quoteIdentifier(original.table, driverType)} RENAME TO ${quoteIdentifier(draft.table, driverType)};`,
      )
    } else {
      // SQL Server driver: sp_rename stored procedure is required for renaming tables in SQL Server
      statements.push(
        `EXEC sp_rename N'${quoteIdentifier(original.schema || 'dbo', driverType)}.${quoteIdentifier(original.table, driverType)}', N'${draft.table.replace(/'/g, "''")}', 'OBJECT';`,
      )
    }
  }
  try {
    let alterSql = ''
    if (recreationNeeded) {
      alterSql = generateRecreateTable(original, draft, driverType)
    } else {
      alterSql = generateAlterTable(original, draft, driverType)
    }
    if (alterSql && alterSql !== '-- No changes') {
      statements.push(alterSql)
    }
  } catch {
  }

  return { isDirty: true, changeCount, sql: statements.join('\n\n') }
}

export function isDesignDirty(
  tab?: {
    kind?: string
    design?: TableDesign | null
    designDraft?: TableDesign | null
    target?: any
    loading?: boolean
    error?: string | null
  } | null,
  driverType?: string | null,
): boolean {
  if (!tab || tab.kind !== 'design' || tab.loading || tab.error) return false
  const mode = (tab.target?.mode === 'new' ? 'new' : 'edit') as 'new' | 'edit'
  const draft = tab.designDraft ?? (mode === 'new' ? tab.design : null)
  return getDesignDiff(tab.design, draft, mode, driverType).isDirty
}

export function getDesignChangeCount(
  tab?: {
    kind?: string
    design?: TableDesign | null
    designDraft?: TableDesign | null
    target?: any
    loading?: boolean
    error?: string | null
  } | null,
  driverType?: string | null,
): number {
  if (!tab || tab.kind !== 'design' || tab.loading || tab.error) return 0
  const mode = (tab.target?.mode === 'new' ? 'new' : 'edit') as 'new' | 'edit'
  const draft = tab.designDraft ?? (mode === 'new' ? tab.design : null)
  return getDesignDiff(tab.design, draft, mode, driverType).changeCount
}

export function getDesignSql(
  tab?: {
    kind?: string
    design?: TableDesign | null
    designDraft?: TableDesign | null
    target?: any
    loading?: boolean
    error?: string | null
  } | null,
  driverType?: string | null,
): string {
  if (!tab || tab.kind !== 'design' || tab.loading || tab.error) return ''
  const mode = (tab.target?.mode === 'new' ? 'new' : 'edit') as 'new' | 'edit'
  const draft = tab.designDraft ?? (mode === 'new' ? tab.design : null)
  return getDesignDiff(tab.design, draft, mode, driverType).sql
}
