import { ErdColumn, ErdTable, ErdRelation, ErdData } from '@/api/types'

export type { ErdColumn, ErdTable, ErdRelation, ErdData }

export interface TablePosition {
  x: number
  y: number
  width: number
  height: number
}

export function erdRelationKey(rel: ErdRelation): string {
  return `${rel.name || 'rel'}-${rel.sourceTable}-${rel.targetTable}-${rel.sourceColumn}`
}

export function computeInitialPositions(
  tables: ErdTable[],
  relations: ErdRelation[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  if (tables.length === 0) return positions

  const cardWidth = 260
  const horizontalGap = 120
  const verticalGap = 70

  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(tables.length * 1.4))))
  const colY: number[] = Array(cols).fill(60)
  const colX: number[] = Array(cols).fill(0).map((_, i) => 60 + i * (cardWidth + horizontalGap))

  tables.forEach((table) => {
    const key = `${table.schema}.${table.name}`
    let targetCol = 0
    for (let c = 1; c < cols; c++) {
      if (colY[c] < colY[targetCol]) {
        targetCol = c
      }
    }

    const estimatedHeight = 36 + table.columns.length * 27 + 10

    positions[key] = { x: colX[targetCol], y: colY[targetCol] }
    colY[targetCol] += estimatedHeight + verticalGap
  })

  return positions
}
