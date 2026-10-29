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
  rawXml: string
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
    rawXml: xmlText,
  }
}
