export interface ExtractedTable {
  schema?: string
  name: string
  raw: string
}

function unwrapIdentifier(token: string): string {
  const trimmed = token.trim()
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const RESERVED_KEYWORDS = new Set([
  'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit', 'offset',
  'union', 'all', 'join', 'inner', 'left', 'right', 'full', 'outer', 'cross',
  'natural', 'straight_join', 'on', 'using', 'as', 'into', 'insert', 'update',
  'delete', 'set', 'values', 'with', 'case', 'when', 'then', 'else', 'end',
  'and', 'or', 'not', 'in', 'exists', 'is', 'null', 'like', 'between', 'distinct',
  'top', 'apply', 'cross apply', 'outer apply',
])

export function extractTablesFromSql(sql: string): ExtractedTable[] {
  if (!sql || !sql.trim()) return []

  const cleanSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/'(?:''|\\'|[^'])*'/g, "''")

  const tables: ExtractedTable[] = []
  const seen = new Set<string>()

  function addTable(rawTable: string) {
    const trimmed = rawTable.trim()
    if (!trimmed || trimmed.startsWith('(')) return

    const parts = trimmed.split('.').map((p) => unwrapIdentifier(p.trim()))
    let schema: string | undefined
    let name = ''

    if (parts.length >= 2) {
      schema = parts[parts.length - 2]
      name = parts[parts.length - 1]
    } else if (parts.length === 1) {
      name = parts[0]
    }

    if (!name || RESERVED_KEYWORDS.has(name.toLowerCase())) return
    if (schema && RESERVED_KEYWORDS.has(schema.toLowerCase())) return

    const key = schema ? `${schema.toLowerCase()}.${name.toLowerCase()}` : name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)

    tables.push({
      schema,
      name,
      raw: schema ? `${schema}.${name}` : name,
    })
  }

  const fromRegex = /\bFROM\s+([^;]+?)(?=\s+\b(?:WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|UNION|WINDOW|FOR|FETCH|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|STRAIGHT_JOIN|NATURAL)\b|[;)]|$)/gi
  let match: RegExpExecArray | null

  while ((match = fromRegex.exec(cleanSql)) !== null) {
    const list = match[1].split(',')
    for (const item of list) {
      const token = item.trim()
      if (!token || token.startsWith('(')) continue
      const tableMatch = token.match(/^([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?(?:\.[`"\[]?[A-Za-z0-9_$@#]+[`"\]]?)?)/i)
      if (tableMatch) {
        addTable(tableMatch[1])
      }
    }
  }

  const joinRegex = /\b(?:JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|NATURAL\s+JOIN|STRAIGHT_JOIN)\s+([`"\[]?[A-Za-z0-9_$@#]+[`"\]]?(?:\.[`"\[]?[A-Za-z0-9_$@#]+[`"\]]?)?)/gi
  while ((match = joinRegex.exec(cleanSql)) !== null) {
    addTable(match[1])
  }

  return tables
}
