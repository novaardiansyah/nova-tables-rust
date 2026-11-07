import { api } from '@/api'
import { ErdTable, ErdRelation } from './erdTypes'

export async function exportDiagramToPng(
  database: string,
  tables: ErdTable[],
  relations: ErdRelation[],
  positions: Record<string, { x: number; y: number }>,
  cardDimensions: Record<string, { width: number; height: number }>,
  relationOffsets: Record<string, { x: number; y: number }>,
): Promise<void> {
  if (tables.length === 0) return

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const table of tables) {
    const key = `${table.schema}.${table.name}`
    const pos = positions[key] || { x: 0, y: 0 }
    const dim = cardDimensions[key] || {
      width: 260,
      height: 35 + Math.min(table.columns.length, 10) * 24 + 10,
    }
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + dim.width)
    maxY = Math.max(maxY, pos.y + dim.height)
  }

  for (const rel of relations) {
    const relKey = `${rel.name || 'rel'}-${rel.sourceTable}-${rel.targetTable}-${rel.sourceColumn}`
    const offset = relationOffsets[relKey]
    if (offset) {
      const sKey = `${rel.sourceSchema}.${rel.sourceTable}`
      const tKey = `${rel.targetSchema}.${rel.targetTable}`
      const sPos = positions[sKey] || { x: 0, y: 0 }
      const tPos = positions[tKey] || { x: 0, y: 0 }
      const sWidth = cardDimensions[sKey]?.width ?? 260
      const tWidth = cardDimensions[tKey]?.width ?? 260
      const midX = (sPos.x + sWidth / 2 + tPos.x + tWidth / 2) / 2 + offset.x
      const midY = (sPos.y + tPos.y) / 2 + offset.y
      minX = Math.min(minX, midX - 30)
      minY = Math.min(minY, midY - 30)
      maxX = Math.max(maxX, midX + 30)
      maxY = Math.max(maxY, midY + 30)
    }
  }

  const padding = 60
  const width = Math.ceil(maxX - minX + padding * 2)
  const height = Math.ceil(maxY - minY + padding * 2)
  const scale = 2

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(scale, scale)
  ctx.translate(-minX + padding, -minY + padding)

  ctx.fillStyle = '#0b0e14'
  ctx.fillRect(minX - padding, minY - padding, width, height)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  const startGx = Math.floor((minX - padding) / 20) * 20
  const endGx = Math.ceil((maxX + padding) / 20) * 20
  const startGy = Math.floor((minY - padding) / 20) * 20
  const endGy = Math.ceil((maxY + padding) / 20) * 20
  for (let gx = startGx; gx <= endGx; gx += 20) {
    for (let gy = startGy; gy <= endGy; gy += 20) {
      ctx.beginPath()
      ctx.arc(gx, gy, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const rel of relations) {
    const sKey = `${rel.sourceSchema}.${rel.sourceTable}`
    const tKey = `${rel.targetSchema}.${rel.targetTable}`
    const sPos = positions[sKey] || { x: 0, y: 0 }
    const tPos = positions[tKey] || { x: 0, y: 0 }
    const sWidth = cardDimensions[sKey]?.width ?? 260
    const tWidth = cardDimensions[tKey]?.width ?? 260
    const headerHeight = 35

    const sourceIsLeft = sPos.x + sWidth / 2 < tPos.x + tWidth / 2
    const startX = sourceIsLeft ? sPos.x + sWidth : sPos.x
    const startY = sPos.y + headerHeight + 25
    const endX = sourceIsLeft ? tPos.x : tPos.x + tWidth
    const endY = tPos.y + headerHeight + 25

    const defaultMidX = (startX + endX) / 2
    const defaultMidY = (startY + endY) / 2

    const relKey = `${rel.name || 'rel'}-${rel.sourceTable}-${rel.targetTable}-${rel.sourceColumn}`
    const offset = relationOffsets[relKey]
    const bendX = defaultMidX + (offset?.x ?? 0)
    const bendY = defaultMidY + (offset?.y ?? 0)

    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 1.5
    if (rel.isNullable) {
      ctx.setLineDash([4, 4])
    } else {
      ctx.setLineDash([])
    }

    ctx.beginPath()
    ctx.moveTo(startX, startY)
    if (offset && (offset.x !== 0 || offset.y !== 0)) {
      ctx.quadraticCurveTo(bendX, bendY, endX, endY)
    } else {
      const dx = Math.abs(endX - startX) * 0.5
      const cp1x = sourceIsLeft ? startX + Math.max(40, dx) : startX - Math.max(40, dx)
      const cp2x = sourceIsLeft ? endX - Math.max(40, dx) : endX + Math.max(40, dx)
      ctx.bezierCurveTo(cp1x, startY, cp2x, endY, endX, endY)
    }
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#64748b'
    ctx.beginPath()
    ctx.arc(startX, startY, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(endX, endY, 3, 0, Math.PI * 2)
    ctx.fill()

    const badgeX = offset && (offset.x !== 0 || offset.y !== 0)
      ? (startX + 2 * bendX + endX) / 4
      : defaultMidX
    const badgeY = offset && (offset.x !== 0 || offset.y !== 0)
      ? (startY + 2 * bendY + endY) / 4
      : defaultMidY

    const cardinalityLabel =
      rel.cardinality === 'one-to-one'
        ? '1 : 1'
        : rel.cardinality === 'many-to-many'
          ? 'N : M'
          : '1 : N'

    ctx.fillStyle = '#161f2e'
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    const bw = 36
    const bh = 18
    const bx = badgeX - bw / 2
    const by = badgeY - bh / 2
    drawRoundedRect(ctx, bx, by, bw, bh, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cardinalityLabel, badgeX, badgeY)
  }

  for (const table of tables) {
    const key = `${table.schema}.${table.name}`
    const pos = positions[key] || { x: 0, y: 0 }
    const dim = cardDimensions[key] || {
      width: 260,
      height: 35 + Math.min(table.columns.length, 10) * 24 + 10,
    }
    const x = pos.x
    const y = pos.y
    const w = dim.width
    const h = dim.height

    ctx.fillStyle = '#111722'
    ctx.strokeStyle = '#253347'
    ctx.lineWidth = 1
    drawRoundedRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()

    const headerH = 32
    ctx.save()
    ctx.beginPath()
    drawRoundedRect(ctx, x, y, w, headerH, 8)
    ctx.clip()
    ctx.fillStyle = '#182232'
    ctx.fillRect(x, y, w, headerH)
    ctx.restore()

    ctx.strokeStyle = '#253347'
    ctx.beginPath()
    ctx.moveTo(x, y + headerH)
    ctx.lineTo(x + w, y + headerH)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillStyle = '#f8fafc'
    const titleText = (table.schema && table.schema !== 'dbo' ? `${table.schema}.` : '') + table.name
    ctx.fillText(titleText, x + 10, y + headerH / 2)

    const rowH = 24
    let rowY = y + headerH + 2
    for (const col of table.columns) {
      if (rowY + rowH > y + h - 2) break

      if (col.isPrimaryKey) {
        ctx.fillStyle = '#eab308'
        ctx.font = 'bold 9px system-ui, sans-serif'
        ctx.fillText('PK', x + 10, rowY + rowH / 2)
      } else if (col.isForeignKey) {
        ctx.fillStyle = '#38bdf8'
        ctx.font = 'bold 9px system-ui, sans-serif'
        ctx.fillText('FK', x + 10, rowY + rowH / 2)
      }

      ctx.fillStyle = col.isPrimaryKey ? '#f8fafc' : col.isForeignKey ? '#38bdf8' : '#cbd5e1'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(col.name, x + 30, rowY + rowH / 2)

      ctx.textAlign = 'right'
      ctx.fillStyle = '#475569'
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillText(col.isNullable ? 'NULL' : 'NN', x + w - 8, rowY + rowH / 2)

      ctx.fillStyle = '#64748b'
      ctx.font = '10px monospace'
      ctx.fillText(col.dataType, x + w - 36, rowY + rowH / 2)
      ctx.textAlign = 'left'

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.beginPath()
      ctx.moveTo(x + 6, rowY + rowH)
      ctx.lineTo(x + w - 6, rowY + rowH)
      ctx.stroke()

      rowY += rowH
    }
  }

  const dataUrl = canvas.toDataURL('image/png')
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
  if (isTauri) {
    try {
      await api.saveFile({
        defaultPath: `erd-${database}-${Date.now()}.png`,
        filters: [{ name: 'PNG Image (*.png)', extensions: ['png'] }],
        base64: dataUrl,
      })
    } catch {
      // dialog cancelled or failed
    }
    return
  }

  // Fallback for standard browser environments
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `erd-${database}-${Date.now()}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
