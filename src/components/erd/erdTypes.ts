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

export interface RelationPathResult {
  startX: number
  startY: number
  endX: number
  endY: number
  bendX: number
  bendY: number
  hasOffset: boolean
  pathData: string
  badgeX: number
  badgeY: number
  isCubic: boolean
  cp1x: number
  cp1y: number
  cp2x: number
  cp2y: number
}

export function computeRelationPath(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceWidth = 260,
  targetWidth = 260,
  offset?: { x: number; y: number },
  sourceColIndex = 0,
  targetColIndex = 0,
  isSelf = false,
): RelationPathResult {
  const headerHeight = 35
  const rowH = 27
  const startY = sourcePos.y + headerHeight + Math.max(0, sourceColIndex) * rowH + 13.5
  let endY = targetPos.y + headerHeight + Math.max(0, targetColIndex) * rowH + 13.5

  let startX: number
  let endX: number
  let cp1x: number
  let cp1y: number
  let cp2x: number
  let cp2y: number
  let defaultMidX: number
  let defaultMidY: number
  let badgeX: number
  let badgeY: number

  if (isSelf) {
    startX = sourcePos.x + sourceWidth
    endX = sourcePos.x + sourceWidth
    if (Math.abs(startY - endY) < 10) {
      endY = startY + 24
    }
    const loopW = 40
    cp1x = startX + loopW
    cp1y = startY - 10
    cp2x = endX + loopW
    cp2y = endY + 10
    defaultMidX = startX + loopW
    defaultMidY = (startY + endY) / 2
    badgeX = defaultMidX
    badgeY = defaultMidY
  } else {
    const sLeft = sourcePos.x
    const sRight = sourcePos.x + sourceWidth
    const tLeft = targetPos.x
    const tRight = targetPos.x + targetWidth

    if (sRight <= tLeft + 20) {
      startX = sRight
      endX = tLeft
      const dx = endX - startX
      const curve = Math.max(30, Math.min(160, dx * 0.45))
      cp1x = startX + curve
      cp1y = startY
      cp2x = endX - curve
      cp2y = endY
      defaultMidX = (startX + endX) / 2
      defaultMidY = (startY + endY) / 2
      badgeX = defaultMidX
      badgeY = defaultMidY
    } else if (tRight <= sLeft + 20) {
      startX = sLeft
      endX = tRight
      const dx = startX - endX
      const curve = Math.max(30, Math.min(160, dx * 0.45))
      cp1x = startX - curve
      cp1y = startY
      cp2x = endX + curve
      cp2y = endY
      defaultMidX = (startX + endX) / 2
      defaultMidY = (startY + endY) / 2
      badgeX = defaultMidX
      badgeY = defaultMidY
    } else {
      const distY = Math.abs(endY - startY)
      const curve = Math.max(40, Math.min(140, distY * 0.3))
      if ((sLeft + tLeft) / 2 > 700) {
        startX = sLeft
        endX = tLeft
        const loopX = Math.min(sLeft, tLeft) - curve
        cp1x = loopX
        cp1y = startY
        cp2x = loopX
        cp2y = endY
        defaultMidX = loopX
        defaultMidY = (startY + endY) / 2
        badgeX = loopX
        badgeY = defaultMidY
      } else {
        startX = sRight
        endX = tRight
        const loopX = Math.max(sRight, tRight) + curve
        cp1x = loopX
        cp1y = startY
        cp2x = loopX
        cp2y = endY
        defaultMidX = loopX
        defaultMidY = (startY + endY) / 2
        badgeX = loopX
        badgeY = defaultMidY
      }
    }
  }

  const hasOffset = Boolean(offset && (offset.x !== 0 || offset.y !== 0))
  const bendX = defaultMidX + (offset?.x ?? 0)
  const bendY = defaultMidY + (offset?.y ?? 0)

  let pathData: string
  if (hasOffset) {
    pathData = `M ${startX} ${startY} Q ${bendX} ${bendY}, ${endX} ${endY}`
    badgeX = (startX + 2 * bendX + endX) / 4
    badgeY = (startY + 2 * bendY + endY) / 4
  } else {
    pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`
  }

  return {
    startX,
    startY,
    endX,
    endY,
    bendX,
    bendY,
    hasOffset,
    pathData,
    badgeX,
    badgeY,
    isCubic: !hasOffset,
    cp1x,
    cp1y,
    cp2x,
    cp2y,
  }
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
