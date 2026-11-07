import { ErdColumn, ErdTable, ErdRelation, ErdData } from '@/api/types'

export type { ErdColumn, ErdTable, ErdRelation, ErdData }

export interface TablePosition {
  x: number
  y: number
  width: number
  height: number
}

export function computeInitialPositions(
  tables: ErdTable[],
  relations: ErdRelation[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  if (tables.length === 0) return positions

  const cardWidth = 260
  const horizontalGap = 120
  const verticalGap = 60

  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length * 1.5)))

  tables.forEach((table, index) => {
    const key = `${table.schema}.${table.name}`
    const colIndex = index % cols
    const rowIndex = Math.floor(index / cols)

    const x = 60 + colIndex * (cardWidth + horizontalGap)
    const y = 60 + rowIndex * (240 + verticalGap)
    positions[key] = { x, y }
  })

  return positions
}
