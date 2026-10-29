export interface ColumnTypeConfig {
  value: string
  length?: boolean
  scale?: boolean
  precision?: boolean
}

export const COLUMN_TYPES: ColumnTypeConfig[] = [
  { value: 'bigint', length: false },
  { value: 'binary', length: true },
  { value: 'bit', length: false },
  { value: 'char', length: true },
  { value: 'date', length: false },
  { value: 'datetime', length: false },
  { value: 'datetime2', scale: true },
  { value: 'datetimeoffset', scale: true },
  { value: 'decimal', precision: true },
  { value: 'float', length: false },
  { value: 'image', length: false },
  { value: 'int', length: false },
  { value: 'money', length: false },
  { value: 'nchar', length: true },
  { value: 'ntext', length: false },
  { value: 'numeric', precision: true },
  { value: 'nvarchar', length: true },
  { value: 'real', length: false },
  { value: 'smalldatetime', length: false },
  { value: 'smallint', length: false },
  { value: 'smallmoney', length: false },
  { value: 'text', length: false },
  { value: 'time', scale: true },
  { value: 'tinyint', length: false },
  { value: 'uniqueidentifier', length: false },
  { value: 'varbinary', length: true },
  { value: 'varchar', length: true },
  { value: 'xml', length: false },
]

export const TYPE_BY_NAME = new Map<string, ColumnTypeConfig>(
  COLUMN_TYPES.map((type) => [type.value, type])
)

export const TYPE_OPTIONS = COLUMN_TYPES.map((type) => ({
  value: type.value,
  label: type.value,
}))

export interface DesignerColumn {
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

export const BLANK_COLUMN: DesignerColumn = {
  name: '',
  typeName: 'int',
  maxLength: 4,
  precision: 18,
  scale: 0,
  isNullable: true,
  isIdentity: false,
  isComputed: false,
  computedDefinition: null,
  seedValue: 1,
  incrementValue: 1,
  collation: null,
  databaseCollation: null,
}

export interface DesignerIndexConstraint {
  name?: string
  columns?: string[]
  isUnique?: boolean
  isPrimaryKey?: boolean
  referencedSchema?: string
  referencedTable?: string
  referencedColumns?: string[]
  [key: string]: unknown
}

export interface TableTemplate {
  schema: string
  table: string
  columns: DesignerColumn[]
  primaryKey: string[]
  uniqueKeys: DesignerIndexConstraint[]
  foreignKeys: DesignerIndexConstraint[]
  indexes: DesignerIndexConstraint[]
  statement: string
}

export const NEW_TABLE_TEMPLATE: TableTemplate = {
  schema: 'dbo',
  table: '',
  columns: [{ ...BLANK_COLUMN, name: 'id', isIdentity: true, isNullable: false }],
  primaryKey: [],
  uniqueKeys: [],
  foreignKeys: [],
  indexes: [],
  statement: '',
}
