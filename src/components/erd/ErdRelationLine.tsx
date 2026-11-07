import React from 'react'
import { ErdRelation } from './erdTypes'

export interface ErdRelationLineProps {
  relation: ErdRelation
  sourcePos: { x: number; y: number }
  targetPos: { x: number; y: number }
  isHighlighted?: boolean
  isDimmed?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ErdRelationLine({
  relation,
  sourcePos,
  targetPos,
  isHighlighted = false,
  isDimmed = false,
  onMouseEnter,
  onMouseLeave,
}: ErdRelationLineProps) {
  const cardWidth = 260
  const headerHeight = 35

  const sourceIsLeft = sourcePos.x + cardWidth / 2 < targetPos.x + cardWidth / 2

  const startX = sourceIsLeft ? sourcePos.x + cardWidth : sourcePos.x
  const startY = sourcePos.y + headerHeight + 25

  const endX = sourceIsLeft ? targetPos.x : targetPos.x + cardWidth
  const endY = targetPos.y + headerHeight + 25

  const dx = Math.abs(endX - startX) * 0.5
  const cp1x = sourceIsLeft ? startX + Math.max(40, dx) : startX - Math.max(40, dx)
  const cp1y = startY
  const cp2x = sourceIsLeft ? endX - Math.max(40, dx) : endX + Math.max(40, dx)
  const cp2y = endY

  const pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`

  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2

  const cardinalityLabel =
    relation.cardinality === 'one-to-one'
      ? '1 : 1'
      : relation.cardinality === 'many-to-many'
        ? 'N : M'
        : '1 : N'

  const tooltip = `${relation.name || 'FK'}: ${relation.sourceTable}.${relation.sourceColumn} -> ${relation.targetTable}.${relation.targetColumn} (${relation.cardinality})`

  const accentColor = 'rgb(var(--color-accent))'
  const lineStrongColor = 'rgb(var(--color-line-strong))'
  const lineColor = 'rgb(var(--color-line))'
  const panelColor = 'rgb(var(--color-panel))'
  const textMutedColor = 'rgb(var(--color-text-muted))'

  return (
    <g
      className={`cursor-pointer transition-opacity ${isDimmed ? 'opacity-20' : 'opacity-100'}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <title>{tooltip}</title>

      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
      />

      <path
        d={pathData}
        fill="none"
        stroke={isHighlighted ? accentColor : lineStrongColor}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeDasharray={relation.isNullable ? '4 2' : undefined}
      />

      <circle
        cx={startX}
        cy={startY}
        r={3}
        fill={isHighlighted ? accentColor : lineStrongColor}
      />

      <circle
        cx={endX}
        cy={endY}
        r={3}
        fill={isHighlighted ? accentColor : lineStrongColor}
      />

      <g transform={`translate(${midX}, ${midY})`}>
        <rect
          x={-18}
          y={-9}
          width={36}
          height={18}
          rx={4}
          fill={panelColor}
          stroke={isHighlighted ? accentColor : lineColor}
          strokeWidth={1}
        />
        <text
          x={0}
          y={3.5}
          textAnchor="middle"
          fontSize={10}
          fontFamily="monospace"
          fontWeight="bold"
          fill={isHighlighted ? accentColor : textMutedColor}
        >
          {cardinalityLabel}
        </text>
      </g>
    </g>
  )
}
