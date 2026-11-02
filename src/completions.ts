import { monaco } from '@/monaco'

const SQL_KEYWORDS =
  'select from where not like union all exists between case when then else having into values set inner outer full cross is null and or insert delete truncate commit rollback begin transaction if order group by using declare with distinct top join on as offset fetch next rows only asc desc primary key foreign references cascade constraint unique default check left right count sum min max avg'.split(
    ' ',
  )

const SQL_FUNCTIONS = (
  'avg cast ceil coalesce concat convert count dateadd datediff datename datepart day floor getdate iif isnull len lower ' +
  'ltrim max min month nullif replace right round row_number rank dense_rank rtrim sum upper year charindex abs power sqrt'
)
  .split(/\s+/)
  .filter(Boolean)

const TABLE_KIND = monaco.languages.CompletionItemKind.Class
const COLUMN_KIND = monaco.languages.CompletionItemKind.Field
const KEYWORD_KIND = monaco.languages.CompletionItemKind.Keyword
const FUNCTION_KIND = monaco.languages.CompletionItemKind.Function

const RESERVED_ALIAS = new Set(
  'select from where group having order limit offset join inner left right full cross outer natural straight_join on as using set values and or case when then else end insert update delete into table union with apply fetch begin commit rollback transaction top for'.split(
    ' ',
  ),
)

export interface CatalogTable {
  schema: string
  name: string
}

export interface CatalogTableColumns {
  schema: string
  name: string
  columns: string[]
}

export interface CompletionCatalog {
  tables?: CatalogTable[]
  columns?: CatalogTableColumns[]
  driverType?: string | null
  activeDatabase?: string | null
}

interface Segment {
  value: string
  start: number
}

interface Reference {
  schema: string
  name: string
  alias: string
}

const catalog: {
  tables: CatalogTable[]
  columns: CatalogTableColumns[]
  driverType: string | null
  activeDatabase: string | null
} = {
  tables: [],
  columns: [],
  driverType: null,
  activeDatabase: null,
}

export function setCompletionCatalog(next: CompletionCatalog | null | undefined): void {
  catalog.tables = [...(next?.tables || [])]
  catalog.columns = [...(next?.columns || [])]
  catalog.driverType = next?.driverType || null
  catalog.activeDatabase = next?.activeDatabase || null
}

function tableKey(schema: string, name: string): string {
  return `${schema}.${name}`.toLowerCase()
}

function unwrap(part: string): string {
  return String(part || '')
    .trim()
    .replace(/^[`"\[]|[`"\]]$/g, '')
}

function isDefaultSchema(schema: string): boolean {
  if (!schema) return true
  const lower = schema.toLowerCase()
  if (lower === 'dbo') return true
  if (catalog.driverType === 'mysql') return true
  if (catalog.activeDatabase && lower === catalog.activeDatabase.toLowerCase()) return true
  return false
}

function tableLabel(schema: string, name: string): string {
  return isDefaultSchema(schema) ? name : `${schema}.${name}`
}

function splitChain(chunk: string): Segment[] {
  const segments: Segment[] = []
  let value = ''
  let start = 0
  let inBracket = false
  let inBacktick = false
  let inQuote = false

  for (let i = 0; i <= chunk.length; i += 1) {
    const character = i < chunk.length ? chunk[i] : '.'
    if (character === '[') inBracket = true
    else if (character === ']') inBracket = false
    else if (character === '`') inBacktick = !inBacktick
    else if (character === '"') inQuote = !inQuote

    if (character === '.' && !inBracket && !inBacktick && !inQuote) {
      segments.push({ value, start })
      value = ''
      start = i + 1
      continue
    }
    if (character !== '.') value += character
  }

  return segments
}

function parseChain(line: string, column: number): { chainStart: number; segments: Segment[] } {
  let index = column - 2

  while (index >= 0) {
    const character = line[index]
    if (/[A-Za-z0-9_$@#.[\]`"]/.test(character)) index -= 1
    else break
  }

  return {
    chainStart: index + 2,
    segments: splitChain(line.slice(index + 1, column - 1)),
  }
}

function buildColumnCache(): Map<string, string[]> {
  const cache = new Map<string, string[]>()

  for (const table of catalog.columns) {
    cache.set(tableKey(table.schema, table.name), table.columns || [])
  }

  return cache
}

function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/--.*$/gm, (m) => ' '.repeat(m.length))
    .replace(/'(?:''|[^'])*'/g, (m) => ' '.repeat(m.length))
}

function getContextualSql(strippedSql: string, offset: number): string {
  const prevSemi = strippedSql.lastIndexOf(';', Math.max(0, offset - 1))
  const start = prevSemi === -1 ? 0 : prevSemi + 1

  const nextSemi = strippedSql.indexOf(';', offset)
  const end = nextSemi === -1 ? strippedSql.length : nextSemi

  return strippedSql.slice(start, end)
}

function recordReference(rawTable: string, rawAlias: string | undefined, references: Reference[]): void {
  if (!rawTable) return
  const parts = rawTable.split('.').map(unwrap)
  let schema = ''
  let name = ''

  if (parts.length === 1) {
    name = parts[0]
  } else {
    schema = parts[0]
    name = parts[1]
  }

  if (!name || RESERVED_ALIAS.has(name.toLowerCase())) return

  let alias = ''
  if (rawAlias) {
    const unwrappedAlias = unwrap(rawAlias).toLowerCase()
    if (!RESERVED_ALIAS.has(unwrappedAlias)) {
      alias = unwrappedAlias
    }
  }

  references.push({
    schema: schema.toLowerCase(),
    name: name.toLowerCase(),
    alias,
  })
}

function parseTableAndAlias(raw: string, references: Reference[]): void {
  const trimmed = raw.trim()
  if (!trimmed) return
  const match = trimmed.match(
    /^([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?(?:\.[`"\[]?[A-Za-z0-9_$@#]+[`"\]]?)?)(?:\s+(?:AS\s+)?([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?))?/i,
  )
  if (match) {
    recordReference(match[1], match[2], references)
  }
}

function extractReferences(sql: string): Reference[] {
  const references: Reference[] = []

  const fromRegex =
    /\bFROM\s+([^;]+?)(?=\s+\b(?:WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|UNION|WINDOW|FOR|FETCH|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|STRAIGHT_JOIN|NATURAL)\b|[;)]|$)/gi
  let fromMatch: RegExpExecArray | null

  while ((fromMatch = fromRegex.exec(sql))) {
    const list = fromMatch[1].split(',')
    for (const item of list) {
      parseTableAndAlias(item, references)
    }
  }

  const joinRegex =
    /\b(?:JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|NATURAL\s+JOIN|STRAIGHT_JOIN)\s+([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?(?:\.[`"\[]?[A-Za-z0-9_$@#]+[`"\]]?)?)(?:\s+(?:AS\s+)?([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?))?/gi
  let joinMatch: RegExpExecArray | null

  while ((joinMatch = joinRegex.exec(sql))) {
    recordReference(joinMatch[1], joinMatch[2], references)
  }

  const otherRegex =
    /\b(?:UPDATE|INTO|USING)\s+([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?(?:\.[`"\[]?[A-Za-z0-9_$@#]+[`"\]]?)?)(?:\s+(?:AS\s+)?([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?))?/gi
  let otherMatch: RegExpExecArray | null

  while ((otherMatch = otherRegex.exec(sql))) {
    recordReference(otherMatch[1], otherMatch[2], references)
  }

  return references
}

function columnsForReference(cache: Map<string, string[]>, reference: Reference): string[] | null {
  const schema = reference.schema ? unwrap(reference.schema).toLowerCase() : ''
  const name = unwrap(reference.name).toLowerCase()

  if (schema) {
    const direct = cache.get(tableKey(schema, name))
    if (direct) return direct
  }

  if (catalog.activeDatabase) {
    const active = cache.get(tableKey(catalog.activeDatabase, name))
    if (active) return active
  }

  const dbo = cache.get(tableKey('dbo', name))
  if (dbo) return dbo

  for (const [key, columns] of cache) {
    if (key.endsWith(`.${name}`)) return columns
  }

  return null
}

function resolveColumns(
  cache: Map<string, string[]>,
  references: Reference[],
  parts: string[],
): string[] | null {
  const partsLower = parts.map(unwrap).map((part) => part.toLowerCase())
  const partsJoined = partsLower.join('.')

  for (const reference of references) {
    if (reference.alias && reference.alias === partsJoined) {
      return columnsForReference(cache, reference)
    }
  }

  for (const reference of references) {
    if (
      reference.name === partsJoined ||
      (reference.schema === partsLower[0] && reference.name === partsLower[1])
    ) {
      return columnsForReference(cache, reference)
    }
  }

  if (partsLower.length === 2) {
    const direct = cache.get(tableKey(partsLower[0], partsLower[1]))
    if (direct) return direct
  }

  const candidates = catalog.tables.filter(
    (table) => table.name.toLowerCase() === partsLower[partsLower.length - 1],
  )

  if (candidates.length === 1) {
    return cache.get(tableKey(candidates[0].schema, candidates[0].name)) || null
  }

  return null
}

function suggestion(
  label: string,
  kind: monaco.languages.CompletionItemKind,
  insertText: string,
  range: monaco.IRange,
  bucket: string,
  detail?: string,
  sortIndex?: number,
): monaco.languages.CompletionItem {
  return {
    label,
    kind,
    insertText,
    range,
    detail: detail || '',
    sortText:
      sortIndex !== undefined
        ? `0${String(sortIndex).padStart(10, '0')}`
        : `${bucket}${String(label).toLowerCase().replace(/\W/g, '')}`,
  }
}

function buildBareSuggestions(
  cache: Map<string, string[]>,
  references: Reference[],
  prefix: string,
  position: monaco.Position,
): monaco.languages.CompletionItem[] {
  const items: monaco.languages.CompletionItem[] = []
  const range = new monaco.Range(
    position.lineNumber,
    position.column - prefix.length,
    position.lineNumber,
    position.column,
  )
  const prefixLower = prefix.toLowerCase()
  const unique = new Map<string, Reference>()

  for (const reference of references) {
    const key = tableKey(reference.schema, reference.name)
    if (!unique.has(key)) unique.set(key, reference)
  }

  if (unique.size === 1) {
    const columns = columnsForReference(cache, Array.from(unique.values())[0]) || []

    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index]
      if (!prefixLower || column.toLowerCase().startsWith(prefixLower)) {
        items.push(suggestion(column, COLUMN_KIND, column, range, '0', undefined, index))
      }
    }
  }

  for (const table of catalog.tables) {
    const label = tableLabel(table.schema, table.name)
    if (!prefixLower || label.toLowerCase().startsWith(prefixLower) || table.name.toLowerCase().startsWith(prefixLower)) {
      items.push(
        suggestion(
          label,
          TABLE_KIND,
          label,
          range,
          '1',
          table.schema,
        ),
      )
    }
  }

  for (const keyword of SQL_KEYWORDS) {
    if (!prefixLower || keyword.startsWith(prefixLower)) {
      items.push(
        suggestion(
          keyword.toUpperCase(),
          KEYWORD_KIND,
          keyword.toUpperCase(),
          range,
          '2',
        ),
      )
    }
  }

  for (const fn of SQL_FUNCTIONS) {
    if (!prefixLower || fn.startsWith(prefixLower)) {
      items.push(
        suggestion(`${fn.toUpperCase()}()`, FUNCTION_KIND, `${fn.toUpperCase()}(`, range, '3'),
      )
    }
  }

  return items
}

function buildDottedSuggestions(
  cache: Map<string, string[]>,
  references: Reference[],
  segments: Segment[],
  position: monaco.Position,
  chainStart: number,
): monaco.languages.CompletionItem[] {
  const items: monaco.languages.CompletionItem[] = []
  const last = segments[segments.length - 1]
  const preceding = segments.slice(0, -1)
  const prefixLower = last.value.toLowerCase()

  const range = new monaco.Range(
    position.lineNumber,
    chainStart + last.start,
    position.lineNumber,
    position.column,
  )

  if (preceding.length === 1) {
    const identifier = preceding[0].value
    const columns = resolveColumns(cache, references, [identifier])

    if (columns) {
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index]
        if (!prefixLower || column.toLowerCase().startsWith(prefixLower)) {
          items.push(suggestion(column, COLUMN_KIND, column, range, '0', undefined, index))
        }
      }

      return items
    }

    for (const table of catalog.tables) {
      if (table.schema.toLowerCase() !== identifier.toLowerCase()) continue

      items.push(
        suggestion(
          table.name,
          TABLE_KIND,
          table.name,
          range,
          `1${table.name.toLowerCase()}`,
          table.schema,
        ),
      )
    }
  }

  if (preceding.length === 2) {
    const columns = resolveColumns(cache, references, [
      preceding[0].value,
      preceding[1].value,
    ])

    if (columns) {
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index]
        if (!prefixLower || column.toLowerCase().startsWith(prefixLower)) {
          items.push(suggestion(column, COLUMN_KIND, column, range, '0', undefined, index))
        }
      }
    }
  }

  return items
}

function provideCompletionItems(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionList {
  const cache = buildColumnCache()
  const line = model.getLineContent(position.lineNumber)
  const { chainStart, segments } = parseChain(line, position.column)
  const last = segments[segments.length - 1]

  const fullSql = model.getValue()
  const offset = model.getOffsetAt(position)
  const strippedSql = stripCommentsAndStrings(fullSql)
  const contextualSql = getContextualSql(strippedSql, offset)
  let references = extractReferences(contextualSql)
  if (references.length === 0) {
    references = extractReferences(strippedSql)
  }

  if (segments.length === 1) {
    return {
      suggestions: buildBareSuggestions(cache, references, last.value, position),
    }
  }

  return {
    suggestions: buildDottedSuggestions(cache, references, segments, position, chainStart),
  }
}

monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: ['.'],
  provideCompletionItems,
})
