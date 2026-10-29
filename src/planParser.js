export function parseShowPlanXml(xmlText) {
  if (!xmlText) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error(parserError.textContent || 'Failed to parse ShowPlan XML')

  const stmt = doc.querySelector('StmtSimple')
  const queryPlan = doc.querySelector('QueryPlan')

  const summary = {
    statementText: stmt?.getAttribute('StatementText') ?? '',
    statementType: stmt?.getAttribute('StatementType') ?? '',
    statementSubTreeCost: parseFloat(stmt?.getAttribute('StatementSubTreeCost') || '0'),
    statementEstRows: parseFloat(stmt?.getAttribute('StatementEstRows') || '0'),
    statementOptmLevel: stmt?.getAttribute('StatementOptmLevel') ?? '',
    compileTime: queryPlan?.getAttribute('CompileTime') ?? null,
    compileCPU: queryPlan?.getAttribute('CompileCPU') ?? null,
  }

  const parseRelOp = (el, totalCost) => {
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

    let targetObject = null
    const objEl = el.querySelector('Object')
    if (objEl) {
      targetObject = {
        table: objEl.getAttribute('Table') || '',
        schema: objEl.getAttribute('Schema') || '',
        index: objEl.getAttribute('Index') || '',
      }
    }

    const childRelOps = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child.nodeName === 'RelOp') {
          childRelOps.push(child)
        } else {
          walk(child)
        }
      }
    }
    walk(el)

    const children = []
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
