import { quoteIdentifier, sqlLiteral } from './resultFormats'

export type FilterOperatorId =
  | 'contains'
  | 'not-contains'
  | 'starts-with'
  | 'ends-with'
  | 'equals'
  | 'not-equals'
  | 'greater'
  | 'greater-equal'
  | 'less'
  | 'less-equal'
  | 'is-null'
  | 'is-not-null'

export interface FilterOperator {
  id: FilterOperatorId
  label: string
  needsValue: boolean
}

export type FilterLogic = 'AND' | 'OR'

export interface FilterLogicOption {
  id: FilterLogic
  label: string
}

export interface FilterCondition {
  column: string
  operator: FilterOperatorId
  value?: string | number | null
  logic?: FilterLogic
}

export const FILTER_OPERATORS: FilterOperator[] = [
  { id: 'contains', label: 'Contains', needsValue: true },
  { id: 'not-contains', label: 'Does not contain', needsValue: true },
  { id: 'starts-with', label: 'Starts with', needsValue: true },
  { id: 'ends-with', label: 'Ends with', needsValue: true },
  { id: 'equals', label: 'Equals', needsValue: true },
  { id: 'not-equals', label: 'Does not equal', needsValue: true },
  { id: 'greater', label: 'Greater than', needsValue: true },
  { id: 'greater-equal', label: 'Greater or equal', needsValue: true },
  { id: 'less', label: 'Less than', needsValue: true },
  { id: 'less-equal', label: 'Less or equal', needsValue: true },
  { id: 'is-null', label: 'Is null', needsValue: false },
  { id: 'is-not-null', label: 'Is not null', needsValue: false },
]

export const FILTER_LOGICS: FilterLogicOption[] = [
  { id: 'AND', label: 'AND' },
  { id: 'OR', label: 'OR' },
]

const BUILDERS: Record<FilterOperatorId, (column: string, value: string | number) => string> = {
  contains: (column, value) => `${column} LIKE ${likeLiteral(value, '%', '%')}`,
  'not-contains': (column, value) => `${column} NOT LIKE ${likeLiteral(value, '%', '%')}`,
  'starts-with': (column, value) => `${column} LIKE ${likeLiteral(value, '', '%')}`,
  'ends-with': (column, value) => `${column} LIKE ${likeLiteral(value, '%', '')}`,
  equals: (column, value) => `${column} = ${comparisonLiteral(value)}`,
  'not-equals': (column, value) => `${column} <> ${comparisonLiteral(value)}`,
  greater: (column, value) => `${column} > ${comparisonLiteral(value)}`,
  'greater-equal': (column, value) => `${column} >= ${comparisonLiteral(value)}`,
  less: (column, value) => `${column} < ${comparisonLiteral(value)}`,
  'less-equal': (column, value) => `${column} <= ${comparisonLiteral(value)}`,
  'is-null': (column) => `${column} IS NULL`,
  'is-not-null': (column) => `${column} IS NOT NULL`,
}

function escapeLike(value: string | number): string {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`)
}

function likeLiteral(value: string | number, prefix: string, suffix: string): string {
  const text = escapeLike(value).replace(/'/g, "''")
  return `N'${prefix}${text}${suffix}' ESCAPE '\\'`
}

function comparisonLiteral(value: string | number): string {
  const text = String(value).trim()
  if (text !== '' && !Number.isNaN(Number(text))) return text
  return sqlLiteral(text)
}

export function filterOperatorById(id: string | null | undefined): FilterOperator | null {
  if (!id) return null
  return FILTER_OPERATORS.find((item) => item.id === id) ?? null
}

export function buildFilterCondition(condition: FilterCondition): string | null {
  const operator = filterOperatorById(condition.operator)
  if (!operator) return null
  return BUILDERS[operator.id](quoteIdentifier(condition.column), condition.value ?? '')
}

export function buildFilterWhere(conditions: FilterCondition[]): string {
  const parts: string[] = []
  for (const condition of conditions) {
    const operator = filterOperatorById(condition.operator)
    if (!operator) continue
    if (operator.needsValue && String(condition.value ?? '').trim() === '') continue
    const text = buildFilterCondition(condition)
    if (!text) continue
    parts.push(parts.length === 0 ? text : `${condition.logic ?? 'AND'} ${text}`)
  }
  return parts.join('\n  ')
}

export function buildFilteredSql(sql: string, where: string): string {
  const source = String(sql).trim().replace(/;+\s*$/, '')
  return `SELECT * FROM (\n${source}\n) AS _nova_filter\nWHERE ${where}\n`
}
