import { getCurrentSettings } from '@/settings'

export interface SpecialValue {
  special: string
}

export interface TableReference {
  schema: string
  name: string
}

export function quoteIdentifier(name: string | number, driverType?: string | null): string {
  if (driverType === 'mysql') {
    return `\`${String(name).replace(/`/g, '``')}\``
  }
  return `[${String(name).replace(/]/g, ']]')}]`
}

export function sqlLiteral(value: unknown, driverType?: string | null): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'object' && value !== null && 'special' in value) {
    return String((value as SpecialValue).special)
  }
  if (value instanceof Date) return `N'${value.toISOString().replace('T', ' ').slice(0, 23)}'`
  if (driverType === 'mysql') {
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
  }
  return `N'${String(value).replace(/'/g, "''")}'`
}

export function rowCondition(
  primaryKey: string[],
  keyIndexes: number[],
  row: unknown[],
  driverType?: string | null,
): string {
  return primaryKey
    .map((name, position) => {
      const value = row[keyIndexes[position]]
      if (value === null || value === undefined) return `${quoteIdentifier(name, driverType)} IS NULL`
      return `${quoteIdentifier(name, driverType)} = ${sqlLiteral(value, driverType)}`
    })
    .join('\n   AND ')
}

const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i
const TIBERIUS_DATETIME_RE = /^(?:Small)?DateTime\s*\{\s*days:\s*(-?\d+),\s*seconds_fragments:\s*(\d+)\s*\}/

export function isDateTimeString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return ISO_DATE_TIME_RE.test(trimmed) || TIBERIUS_DATETIME_RE.test(trimmed)
}

export function parseDateTime(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  const tiberiusMatch = TIBERIUS_DATETIME_RE.exec(trimmed)
  if (tiberiusMatch) {
    const isSmall = trimmed.startsWith('Small')
    const days = parseInt(tiberiusMatch[1], 10)
    const frags = parseInt(tiberiusMatch[2], 10)
    const epoch = Date.UTC(1900, 0, 1)
    const dayMs = days * 86400000
    const timeMs = isSmall ? frags * 60000 : Math.round((frags * 10) / 3)
    const date = new Date(epoch + dayMs + timeMs)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (ISO_DATE_TIME_RE.test(trimmed)) {
    if (/Z|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
      const date = new Date(trimmed)
      return Number.isNaN(date.getTime()) ? null : date
    }
    const iso = trimmed.replace(' ', 'T') + 'Z'
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone)
  if (!dtf) {
    try {
      dtf = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hourCycle: 'h23',
      })
      dtfCache.set(timeZone, dtf)
    } catch {
      dtf = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hourCycle: 'h23',
      })
      dtfCache.set(timeZone, dtf)
    }
  }
  return dtf
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 0
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date)
    const name = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00'
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
    if (!match) return 0
    const minutes = Number(match[2]) * 60 + Number(match[3] || 0)
    return (match[1] === '-' ? -minutes : minutes) * 60000
  } catch {
    return 0
  }
}

function formatWithFormatter(date: Date, timeZone: string): string {
  const pad = (num: number, len = 2) => String(num).padStart(len, '0')
  const dtf = getFormatter(timeZone)
  const parts: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) {
    parts[part.type] = part.value
  }
  const ms = parts.fractionalSecond || pad(date.getUTCMilliseconds(), 3)
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${ms}`
}

export function formatDateTime(value: unknown, timeZone?: string): string {
  const date = parseDateTime(value)
  if (!date) return value === null || value === undefined ? '' : String(value)
  
  const userTz = timeZone || getCurrentSettings()?.timezone || 'UTC'
  const systemTz = getCurrentSettings()?.systemTimezone || 'UTC'
  const isNaive = typeof value === 'string' && !/Z|[+-]\d{2}:?\d{2}$/i.test(value.trim())
  
  // Naive timestamps are interpreted as system timezone and converted to user timezone
  const instant = isNaive && systemTz !== 'UTC'
    ? new Date(date.getTime() - getTimezoneOffsetMs(date, systemTz))
    : date
  
  if (userTz === 'UTC') {
    const pad = (num: number, len = 2) => String(num).padStart(len, '0')
    const day = `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`
    const time = `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}:${pad(instant.getUTCSeconds())}`
    return `${day} ${time}.${pad(instant.getUTCMilliseconds(), 3)}`
  }
  
  try {
    return formatWithFormatter(instant, userTz)
  } catch {
    const pad = (num: number, len = 2) => String(num).padStart(len, '0')
    const day = `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`
    const time = `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}:${pad(instant.getUTCSeconds())}`
    return `${day} ${time}.${pad(instant.getUTCMilliseconds(), 3)}`
  }
}

export function cellText(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value !== null && 'special' in value) {
    return String((value as SpecialValue).special)
  }
  if (value instanceof Date) return formatDateTime(value, timeZone)
  const str = String(value)
  if (isDateTimeString(str)) {
    return formatDateTime(str, timeZone)
  }
  return str
}

export function formatNumber(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString()
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function cleanText(matrix: unknown[][], timeZone?: string): string {
  return matrix.map((cells) => cells.map((cell) => cellText(cell, timeZone)).join('\t')).join('\n')
}

export function sqlInsertRows(
  table: TableReference,
  columnNames: string[],
  matrix: unknown[][]
): string {
  const target = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
  const columns = columnNames.map((name) => quoteIdentifier(name)).join(', ')
  return matrix
    .map(
      (cells) =>
        `INSERT INTO ${target} (${columns})\nVALUES (${cells.map((cell) => sqlLiteral(cell)).join(', ')});`
    )
    .join('\n\n')
}

export function jsonRecords(columnNames: string[], matrix: unknown[][], timeZone?: string): string {
  const records = matrix.map((cells) => {
    const record: Record<string, unknown> = {}
    columnNames.forEach((name, index) => {
      const val = cells[index]
      if (val !== null && val !== undefined && isDateTimeString(val)) {
        record[name] = formatDateTime(val, timeZone)
      } else {
        record[name] = val ?? null
      }
    })
    return record
  })
  return JSON.stringify(records, null, 2)
}

function escapeCsvCell(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined) return ''
  const str = cellText(value, timeZone)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function csvRecords(columnNames: string[], matrix: unknown[][], timeZone?: string): string {
  const header = columnNames.map((name) => escapeCsvCell(name, timeZone)).join(',')
  const rows = matrix.map((cells) => cells.map((cell) => escapeCsvCell(cell, timeZone)).join(','))
  return [header, ...rows].join('\r\n')
}
