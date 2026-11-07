import React from 'react'
import { ErdRelation, erdRelationKey, computeRelationPath } from './erdTypes'

export interface ErdRelationLineProps {
  relation: ErdRelation
  sourcePos: { x: number; y: number }
  targetPos: { x: number; y: number }
  sourceWidth?: number
  targetWidth?: number
  sourceColIndex?: number
  targetColIndex?: number
  offset?: { x: number; y: number }
  isHighlighted?: boolean
  isDimmed?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onDragStart?: (e: React.MouseEvent, relKey: string) => void
  viewOnly?: boolean
}

export default function ErdRelationLine({
  relation,
  sourcePos,
  targetPos,
  sourceWidth = 260,
  targetWidth = 260,
  sourceColIndex = 0,
  targetColIndex = 0,
  offset,
  isHighlighted = false,
  isDimmed = false,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  viewOnly = false,
}: ErdRelationLineProps) {
  const relKey = erdRelationKey(relation)

  const isSelf =
    relation.sourceSchema.toLowerCase() === relation.targetSchema.toLowerCase() &&
    relation.sourceTable.toLowerCase() === relation.targetTable.toLowerCase()

  const {
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
  } = computeRelationPath(
    sourcePos,
    targetPos,
    sourceWidth,
    targetWidth,
    offset,
    sourceColIndex,
    targetColIndex,
    isSelf,
  )

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
        className={viewOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
        onMouseDown={(e) => {
          if (!viewOnly) {
            e.stopPropagation()
            onDragStart?.(e, relKey)
          }
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

      {!viewOnly && (isHighlighted || hasOffset) ? (
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
        >
          <title>Drag to adjust relation line bend</title>
        </circle>
      ) : null}

      <g
        transform={`translate(${badgeX}, ${badgeY})`}
        className={viewOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
        onMouseDown={(e) => {
          if (!viewOnly) {
            e.stopPropagation()
            onDragStart?.(e, relKey)
          }
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
