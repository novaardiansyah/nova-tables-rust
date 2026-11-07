import { api } from '@/api'
import { ErdTable, ErdRelation } from './erdTypes'

function getCssColor(varName: string, alpha = 1): string {
  if (typeof window === 'undefined') return '#000000'
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return '#000000'
  if (raw.startsWith('#')) {
    if (alpha < 1) {
      let hex = raw.slice(1)
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
      const num = parseInt(hex, 16)
      return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
    }
    return raw
  }
  if (raw.startsWith('rgb')) {
    if (alpha < 1 && raw.startsWith('rgb(')) {
      return raw.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
    }
    return raw
  }
  const parts = raw.split(/\s+/)
  if (parts.length === 3) {
    return alpha < 1
      ? `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
      : `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
  }
  return raw
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawKeyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x + 3.5, y + 3.5, 2.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + 5.5, y + 5.5)
  ctx.lineTo(x + 10, y + 10)
  ctx.moveTo(x + 8, y + 8)
  ctx.lineTo(x + 9.5, y + 6.5)
  ctx.stroke()
  ctx.restore()
}

function drawTableIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.3
  ctx.beginPath()
  drawRoundedRect(ctx, x, y, 13, 11, 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y + 4.5)
  ctx.lineTo(x + 13, y + 4.5)
  ctx.moveTo(x + 4.5, y + 4.5)
  ctx.lineTo(x + 4.5, y + 11)
  ctx.stroke()
  ctx.restore()
}

export async function exportDiagramToPng(
  database: string,
  tables: ErdTable[],
  relations: ErdRelation[],
  positions: Record<string, { x: number; y: number }>,
  cardDimensions: Record<string, { width: number; height?: number }>,
  relationOffsets: Record<string, { x: number; y: number }>,
): Promise<void> {
  if (tables.length === 0) return

  const resolvedDimensions: Record<string, { width: number; height: number }> = {}
  for (const table of tables) {
    const key = `${table.schema}.${table.name}`
    const custom = cardDimensions[key]
    const el = typeof document !== 'undefined' ? (document.querySelector(`[data-table-key="${key}"]`) as HTMLElement | null) : null
    const w = custom?.width ?? (el ? el.offsetWidth : 260)
    const h = custom?.height ?? (el ? el.offsetHeight : (36 + table.columns.length * 27 + 8))
    resolvedDimensions[key] = { width: w, height: h }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const table of tables) {
    const key = `${table.schema}.${table.name}`
    const pos = positions[key] || { x: 0, y: 0 }
    const dim = resolvedDimensions[key]
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
      const sWidth = resolvedDimensions[sKey]?.width ?? 260
      const tWidth = resolvedDimensions[tKey]?.width ?? 260
      const midX = (sPos.x + sWidth / 2 + tPos.x + tWidth / 2) / 2 + offset.x
      const midY = (sPos.y + tPos.y) / 2 + offset.y
      minX = Math.min(minX, midX - 40)
      minY = Math.min(minY, midY - 40)
      maxX = Math.max(maxX, midX + 40)
      maxY = Math.max(maxY, midY + 40)
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

  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--app-font-family').trim() || "ui-sans-serif, system-ui, -apple-system, sans-serif"
  const monoFont = getComputedStyle(document.documentElement).getPropertyValue('--query-font-family').trim() || "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace"

  const colorBase = getCssColor('--color-base')
  const colorPanel = getCssColor('--color-panel')
  const colorSurface = getCssColor('--color-surface')
  const colorLine = getCssColor('--color-line')
  const colorLineStrong = getCssColor('--color-line-strong')
  const colorAccent = getCssColor('--color-accent')
  const colorText = getCssColor('--color-text')
  const colorTextStrong = getCssColor('--color-text-strong')
  const colorTextMuted = getCssColor('--color-text-muted')
  const colorTextFaint = getCssColor('--color-text-faint')
  const colorWarning = getCssColor('--color-warning')

  ctx.fillStyle = colorBase
  ctx.fillRect(minX - padding, minY - padding, width, height)

  ctx.fillStyle = getCssColor('--color-line', 0.5)
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
    const sWidth = resolvedDimensions[sKey]?.width ?? 260
    const tWidth = resolvedDimensions[tKey]?.width ?? 260
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

    ctx.strokeStyle = colorLineStrong
    ctx.lineWidth = 1.5
    if (rel.isNullable) {
      ctx.setLineDash([4, 2])
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

    ctx.fillStyle = colorLineStrong
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

    ctx.fillStyle = colorPanel
    ctx.strokeStyle = colorLine
    ctx.lineWidth = 1
    const bw = 36
    const bh = 18
    const bx = badgeX - bw / 2
    const by = badgeY - bh / 2
    drawRoundedRect(ctx, bx, by, bw, bh, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = colorTextMuted
    ctx.font = `bold 10px ${monoFont}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cardinalityLabel, badgeX, badgeY)
  }

  for (const table of tables) {
    const key = `${table.schema}.${table.name}`
    const pos = positions[key] || { x: 0, y: 0 }
    const dim = resolvedDimensions[key]
    const x = pos.x
    const y = pos.y
    const w = dim.width
    const h = dim.height

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 4
    ctx.fillStyle = colorPanel
    ctx.strokeStyle = colorLine
    ctx.lineWidth = 1
    drawRoundedRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    const headerH = 34
    ctx.save()
    ctx.beginPath()
    drawRoundedRect(ctx, x, y, w, headerH, 8)
    ctx.clip()
    ctx.fillStyle = getCssColor('--color-surface', 0.8)
    ctx.fillRect(x, y, w, headerH)
    ctx.restore()

    ctx.strokeStyle = colorLine
    ctx.beginPath()
    ctx.moveTo(x, y + headerH)
    ctx.lineTo(x + w, y + headerH)
    ctx.stroke()

    drawTableIcon(ctx, x + 10, y + 11.5, colorAccent)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let titleOffset = x + 28
    if (table.schema && table.schema !== 'dbo') {
      ctx.font = `11px ${fontFamily}`
      ctx.fillStyle = colorTextFaint
      const schemaPrefix = `${table.schema}.`
      ctx.fillText(schemaPrefix, titleOffset, y + headerH / 2)
      titleOffset += ctx.measureText(schemaPrefix).width
    }

    ctx.font = `600 11px ${fontFamily}`
    ctx.fillStyle = colorTextStrong
    ctx.fillText(table.name, titleOffset, y + headerH / 2)

    if (table.isJunction) {
      const jText = 'Junction'
      ctx.font = `9px ${fontFamily}`
      const jWidth = ctx.measureText(jText).width + 8
      const jX = x + w - jWidth - 10
      const jY = y + (headerH - 16) / 2
      ctx.fillStyle = getCssColor('--color-accent', 0.15)
      drawRoundedRect(ctx, jX, jY, jWidth, 16, 4)
      ctx.fill()
      ctx.fillStyle = colorAccent
      ctx.textAlign = 'center'
      ctx.fillText(jText, jX + jWidth / 2, jY + 8)
    }

    ctx.save()
    ctx.beginPath()
    drawRoundedRect(ctx, x, y, w, h, 8)
    ctx.clip()

    const rowH = 26
    let rowY = y + headerH + 1
    for (const col of table.columns) {
      if (rowY + rowH > y + h - 2) break

      if (col.isPrimaryKey) {
        drawKeyIcon(ctx, x + 10, rowY + (rowH - 11) / 2, colorWarning)
      } else if (col.isForeignKey) {
        drawKeyIcon(ctx, x + 10, rowY + (rowH - 11) / 2, colorAccent)
      }

      ctx.fillStyle = col.isPrimaryKey
        ? colorTextStrong
        : col.isForeignKey
          ? colorAccent
          : colorText
      ctx.font = col.isPrimaryKey || col.isForeignKey
        ? `500 11px ${fontFamily}`
        : `11px ${fontFamily}`
      ctx.textAlign = 'left'
      ctx.fillText(col.name, x + 26, rowY + rowH / 2)

      if (col.isUnique && !col.isPrimaryKey) {
        const nameWidth = ctx.measureText(col.name).width
        const uqX = x + 28 + nameWidth
        ctx.fillStyle = getCssColor('--color-line', 0.6)
        drawRoundedRect(ctx, uqX, rowY + (rowH - 14) / 2, 18, 14, 3)
        ctx.fill()
        ctx.font = `9px ${fontFamily}`
        ctx.fillStyle = colorTextFaint
        ctx.textAlign = 'center'
        ctx.fillText('UQ', uqX + 9, rowY + rowH / 2)
      }

      ctx.textAlign = 'right'
      ctx.fillStyle = colorTextFaint
      ctx.font = `9px ${monoFont}`
      ctx.fillText(col.isNullable ? 'NULL' : 'NN', x + w - 10, rowY + rowH / 2)

      ctx.fillStyle = colorTextMuted
      ctx.font = `10px ${monoFont}`
      ctx.fillText(col.dataType, x + w - 42, rowY + rowH / 2)

      ctx.strokeStyle = getCssColor('--color-line', 0.4)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 6, rowY + rowH)
      ctx.lineTo(x + w - 6, rowY + rowH)
      ctx.stroke()

      rowY += rowH
    }

    ctx.restore()
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

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `erd-${database}-${Date.now()}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
