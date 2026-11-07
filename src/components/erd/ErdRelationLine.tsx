import React from 'react'
import { ErdRelation, erdRelationKey } from './erdTypes'

export interface ErdRelationLineProps {
  relation: ErdRelation
  sourcePos: { x: number; y: number }
  targetPos: { x: number; y: number }
  sourceWidth?: number
  targetWidth?: number
  offset?: { x: number; y: number }
  isHighlighted?: boolean
  isDimmed?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onDragStart?: (e: React.MouseEvent, relKey: string) => void
}

export default function ErdRelationLine({
  relation,
  sourcePos,
  targetPos,
  sourceWidth = 260,
  targetWidth = 260,
  offset,
  isHighlighted = false,
  isDimmed = false,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
}: ErdRelationLineProps) {
  const relKey = erdRelationKey(relation)
  const headerHeight = 35

  const sourceIsLeft = sourcePos.x + sourceWidth / 2 < targetPos.x + targetWidth / 2

  const startX = sourceIsLeft ? sourcePos.x + sourceWidth : sourcePos.x
  const startY = sourcePos.y + headerHeight + 25

  const endX = sourceIsLeft ? targetPos.x : targetPos.x + targetWidth
  const endY = targetPos.y + headerHeight + 25

  const defaultMidX = (startX + endX) / 2
  const defaultMidY = (startY + endY) / 2

  const bendX = defaultMidX + (offset?.x ?? 0)
  const bendY = defaultMidY + (offset?.y ?? 0)

  const hasOffset = Boolean(offset && (offset.x !== 0 || offset.y !== 0))

  const pathData = hasOffset
    ? `M ${startX} ${startY} Q ${bendX} ${bendY}, ${endX} ${endY}`
    : (() => {
        const dx = Math.abs(endX - startX) * 0.5
        const cp1x = sourceIsLeft ? startX + Math.max(40, dx) : startX - Math.max(40, dx)
        const cp1y = startY
        const cp2x = sourceIsLeft ? endX - Math.max(40, dx) : endX + Math.max(40, dx)
        const cp2y = endY
        return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`
      })()

  const badgeX = hasOffset
    ? (startX + 2 * bendX + endX) / 4
    : defaultMidX
  const badgeY = hasOffset
    ? (startY + 2 * bendY + endY) / 4
    : defaultMidY

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
      className={`transition-opacity ${isDimmed ? 'opacity-20' : 'opacity-100'}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <title>{tooltip}</title>

      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          e.stopPropagation()
          onDragStart?.(e, relKey)
        }}
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

      {isHighlighted || hasOffset ? (
        <circle
          cx={bendX}
          cy={bendY}
          r={5}
          fill={accentColor}
          stroke="white"
          strokeWidth={1.5}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            e.stopPropagation()
            onDragStart?.(e, relKey)
          }}
          title="Drag to adjust relation line bend"
        />
      ) : null}

      <g
        transform={`translate(${badgeX}, ${badgeY})`}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          e.stopPropagation()
          onDragStart?.(e, relKey)
        }}
      >
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
