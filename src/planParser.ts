export interface PlanSummary {
  statementText: string
  statementType: string
  statementSubTreeCost: number
  statementEstRows: number
  statementOptmLevel: string
  compileTime: string | null
  compileCPU: string | null
}

export interface PlanTargetObject {
  table: string
  schema: string
  index: string
}

export interface PlanNode {
  nodeId: string
  physicalOp: string
  logicalOp: string
  estimateRows: number
  estimateIO: number
  estimateCPU: number
  subtreeCost: number
  avgRowSize: number
  parallel: boolean
  targetObject: PlanTargetObject | null
  costPct: number
  children: PlanNode[]
}

export interface ParsedPlan {
  summary: PlanSummary
  rootNode: PlanNode | null
  raw: string
  format: 'xml' | 'json'
}

interface MysqlCostInfo {
  query_cost?: string
  read_cost?: string
  eval_cost?: string
  prefix_cost?: string
  sort_cost?: string
}

interface MysqlTablePlan {
  table_name?: string
  access_type?: string
  key?: string
  rows_examined_per_scan?: number
  rows_produced_per_join?: number
  cost_info?: MysqlCostInfo
}

interface MysqlUnionResult {
  query_specifications?: { query_block?: MysqlQueryBlock }[]
}

interface MysqlQueryBlock {
  select_id?: number
  cost_info?: MysqlCostInfo
  table?: MysqlTablePlan
  nested_loop?: MysqlQueryBlock[]
  ordering_operation?: MysqlQueryBlock
  grouping_operation?: MysqlQueryBlock
  duplicates_removal?: MysqlQueryBlock
  materialized_from_subquery?: MysqlQueryBlock
  attached_subqueries?: MysqlQueryBlock[]
  select_list_subqueries?: MysqlQueryBlock[]
  optimized_away_subqueries?: MysqlQueryBlock[]
  having_subqueries?: MysqlQueryBlock[]
  update_value_subqueries?: MysqlQueryBlock[]
  union_result?: MysqlUnionResult
}

interface MysqlExplainJson {
  query_block?: MysqlQueryBlock
}

function mysqlAccessOperation(accessType: string): string {
  switch (accessType) {
    case 'ALL':
      return 'Table Scan'
    case 'index':
      return 'Index Scan'
    case 'range':
      return 'Index Range Scan'
    case 'ref':
      return 'Index Lookup'
    case 'eq_ref':
      return 'Unique Index Lookup'
    case 'const':
      return 'Constant Lookup'
    case 'system':
      return 'System Table'
    case 'ref_or_null':
      return 'Index Lookup Or Null'
    case 'index_merge':
      return 'Index Merge'
    case 'unique_subquery':
      return 'Unique Subquery Lookup'
    case 'index_subquery':
      return 'Index Subquery Lookup'
    case 'fulltext':
      return 'Fulltext Index Scan'
    default:
      return 'Table Access'
  }
}

export function parseMysqlExplainPlan(planText: string | null | undefined): ParsedPlan | null {
  if (!planText) return null

  let root: MysqlExplainJson
  try {
    root = JSON.parse(planText) as MysqlExplainJson
  } catch {
    throw new Error('Failed to parse MySQL execution plan JSON')
  }

  const block = root.query_block
  if (!block) return null

  const numeric = (value: string | number | undefined): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  }

  const firstNumber = (...values: (string | number | undefined)[]): number => {
    for (const value of values) {
      if (value !== undefined) return numeric(value)
    }
    return 0
  }

  const totalCost = numeric(block.cost_info?.query_cost)
  let nodeCounter = 0

  const costPct = (subtreeCost: number): number =>
    totalCost > 0 ? Math.min(100, Math.round((subtreeCost / totalCost) * 100)) : 0

  const tableNode = (table: MysqlTablePlan): PlanNode => {
    const readCost = numeric(table.cost_info?.read_cost)
    const evalCost = numeric(table.cost_info?.eval_cost)
    const prefixCost = table.cost_info?.prefix_cost
    const subtreeCost = prefixCost !== undefined ? numeric(prefixCost) : readCost + evalCost
    const accessType = table.access_type ?? ''
    nodeCounter += 1
    return {
      nodeId: String(nodeCounter),
      physicalOp: mysqlAccessOperation(accessType),
      logicalOp: accessType,
      estimateRows: firstNumber(table.rows_produced_per_join, table.rows_examined_per_scan),
      estimateIO: readCost,
      estimateCPU: evalCost,
      subtreeCost,
      avgRowSize: 0,
      parallel: false,
      targetObject: {
        table: table.table_name ?? '',
        schema: '',
        index: table.key ?? '',
      },
      costPct: costPct(subtreeCost),
      children: [],
    }
  }

  const wrapNode = (
    physicalOp: string,
    logicalOp: string,
    source: MysqlQueryBlock,
    children: PlanNode[],
  ): PlanNode => {
    const ownCost = numeric(source.cost_info?.query_cost)
    const sortCost = numeric(source.cost_info?.sort_cost)
    const childCost = children.reduce((max, child) => Math.max(max, child.subtreeCost), 0)
    let subtreeCost = childCost
    if (ownCost > 0) {
      subtreeCost = ownCost
    } else if (sortCost > 0) {
      subtreeCost = childCost + sortCost
    }
    const estimateRows = children.reduce((max, child) => Math.max(max, child.estimateRows), 0)
    nodeCounter += 1
    return {
      nodeId: String(nodeCounter),
      physicalOp,
      logicalOp,
      estimateRows,
      estimateIO: 0,
      estimateCPU: sortCost,
      subtreeCost,
      avgRowSize: 0,
      parallel: false,
      targetObject: null,
      costPct: costPct(subtreeCost),
      children,
    }
  }

  const blockNodes = (source: MysqlQueryBlock): PlanNode[] => {
    let main: PlanNode[] = []

    if (source.ordering_operation) {
      main = [
        wrapNode(
          'Sort',
          'Ordering',
          source.ordering_operation,
          blockNodes(source.ordering_operation),
        ),
      ]
    } else if (source.grouping_operation) {
      main = [
        wrapNode(
          'Grouping',
          'Aggregate',
          source.grouping_operation,
          blockNodes(source.grouping_operation),
        ),
      ]
    } else if (source.duplicates_removal) {
      main = [
        wrapNode(
          'Distinct',
          'Duplicate Removal',
          source.duplicates_removal,
          blockNodes(source.duplicates_removal),
        ),
      ]
    } else if (source.materialized_from_subquery) {
      main = [
        wrapNode(
          'Materialized Subquery',
          'Subquery',
          source.materialized_from_subquery,
          blockNodes(source.materialized_from_subquery),
        ),
      ]
    } else if (source.union_result) {
      const children = (source.union_result.query_specifications ?? []).flatMap((spec) =>
        spec.query_block ? blockNodes(spec.query_block) : [],
      )
      main = [wrapNode('Union', 'Union', source, children)]
    } else if (source.nested_loop && source.nested_loop.length > 0) {
      main = [wrapNode('Nested Loop', 'Join', source, source.nested_loop.flatMap(blockNodes))]
    } else if (source.table) {
      main = [tableNode(source.table)]
    }

    const subqueries = subqueryNodes(source)
    if (subqueries.length === 0) return main
    if (main.length === 0) return subqueries
    return [wrapNode('Query Block', 'Query', source, [...main, ...subqueries])]
  }

  const subqueryNodes = (source: MysqlQueryBlock): PlanNode[] => {
    const groups: [string, MysqlQueryBlock[] | undefined][] = [
      ['Attached Subquery', source.attached_subqueries],
      ['Select List Subquery', source.select_list_subqueries],
      ['Having Subquery', source.having_subqueries],
      ['Optimized Away Subquery', source.optimized_away_subqueries],
      ['Update Value Subquery', source.update_value_subqueries],
    ]
    const nodes: PlanNode[] = []
    for (const [label, group] of groups) {
      for (const item of group ?? []) {
        nodes.push(wrapNode(label, 'Subquery', item, blockNodes(item)))
      }
    }
    return nodes
  }

  const nodes = blockNodes(block)
  const rootNode =
    nodes.length === 1
      ? nodes[0]
      : nodes.length > 1
      ? wrapNode('Query Block', 'Query', block, nodes)
      : null

  const summary: PlanSummary = {
    statementText: '',
    statementType: '',
    statementSubTreeCost: totalCost,
    statementEstRows: rootNode?.estimateRows ?? 0,
    statementOptmLevel: 'EXPLAIN',
    compileTime: null,
    compileCPU: null,
  }

  return {
    summary,
    rootNode,
    raw: planText,
    format: 'json',
  }
}

export function parseExecutionPlan(
  rawText: string | null | undefined,
  driverType?: string | null,
): ParsedPlan | null {
  if (!rawText) return null
  const trimmed = rawText.trim()
  if (driverType === 'mysql' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseMysqlExplainPlan(trimmed)
  }
  return parseShowPlanXml(trimmed)
}
export function parseShowPlanXml(xmlText: string | null | undefined): ParsedPlan | null {
  if (!xmlText) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error(parserError.textContent || 'Failed to parse ShowPlan XML')

  const stmt = doc.querySelector('StmtSimple')
  const queryPlan = doc.querySelector('QueryPlan')

  const summary: PlanSummary = {
    statementText: stmt?.getAttribute('StatementText') ?? '',
    statementType: stmt?.getAttribute('StatementType') ?? '',
    statementSubTreeCost: parseFloat(stmt?.getAttribute('StatementSubTreeCost') || '0'),
    statementEstRows: parseFloat(stmt?.getAttribute('StatementEstRows') || '0'),
    statementOptmLevel: stmt?.getAttribute('StatementOptmLevel') ?? '',
    compileTime: queryPlan?.getAttribute('CompileTime') ?? null,
    compileCPU: queryPlan?.getAttribute('CompileCPU') ?? null,
  }

  const parseRelOp = (el: Element | null, totalCost: number): PlanNode | null => {
    if (!el || el.nodeName !== 'RelOp') return null
    const physicalOp = el.getAttribute('PhysicalOp') || 'Operator'
    const logicalOp = el.getAttribute('LogicalOp') || physicalOp
    const nodeId = el.getAttribute('NodeId') || '0'
    const estimateRows = parseFloat(el.getAttribute('EstimateRows') || '0')
    const estimateIO = parseFloat(el.getAttribute('EstimateIO') || '0')
    const estimateCPU = parseFloat(el.getAttribute('EstimateCPU') || '0')
    const subtreeCost = parseFloat(el.getAttribute('EstimatedTotalSubtreeCost') || '0')
    const avgRowSize = parseFloat(el.getAttribute('AvgRowSize') || '0')
    const parallel = el.getAttribute('Parallel') === '1'

    let targetObject: PlanTargetObject | null = null
    const objEl = el.querySelector('Object')
    if (objEl) {
      targetObject = {
        table: objEl.getAttribute('Table') || '',
        schema: objEl.getAttribute('Schema') || '',
        index: objEl.getAttribute('Index') || '',
      }
    }

    const childRelOps: Element[] = []
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.nodeName === 'RelOp') {
          childRelOps.push(child)
        } else {
          walk(child)
        }
      }
    }
    walk(el)

    const children: PlanNode[] = []
    for (const child of childRelOps) {
      const parsed = parseRelOp(child, totalCost)
      if (parsed) children.push(parsed)
    }

    const costPct = totalCost > 0 ? Math.min(100, Math.round((subtreeCost / totalCost) * 100)) : 0

    return {
      nodeId,
      physicalOp,
      logicalOp,
      estimateRows,
      estimateIO,
      estimateCPU,
      subtreeCost,
      avgRowSize,
      parallel,
      targetObject,
      costPct,
      children,
    }
  }

  const rootRelOp = queryPlan ? queryPlan.querySelector('RelOp') : null
  const rootNode = rootRelOp ? parseRelOp(rootRelOp, summary.statementSubTreeCost) : null

  return {
    summary,
    rootNode,
    raw: xmlText,
    format: 'xml',
  }
}
