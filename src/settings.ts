import { EXECUTION_MODES, ExecutionModeId } from '@/queryModes'

export interface ThemeOption {
  id: string
  label: string
}

export interface FontFamilyOption {
  id: string
  label: string
  value: string
}

export interface TimezoneOption {
  id: string
  label: string
}

export interface Settings {
  theme: string
  timezone: string
  appFontSize: number
  appFontFamily: string
  gridFontSize: number
  gridFontFamily: string
  jsonFontSize: number
  jsonFontFamily: string
  queryFontSize: number
  queryFontFamily: string
  queryWordWrap: boolean
  queryExecutionMode: ExecutionModeId
}

export type SettingsListener = (settings: Settings) => void

export const THEMES: ThemeOption[] = [
  { id: 'nova', label: 'Nova Blue' },
  { id: 'midnight', label: 'Midnight Violet' },
  { id: 'graphite', label: 'Graphite Amber' },
  { id: 'forest', label: 'Forest Green' },
  { id: 'rose', label: 'Rose Quartz' },
  { id: 'light-nova', label: 'Light Nova' },
  { id: 'light-midnight', label: 'Light Midnight' },
  { id: 'light-graphite', label: 'Light Graphite' },
  { id: 'light-forest', label: 'Light Forest' },
  { id: 'light-rose', label: 'Light Rose' },
]

const SANS_FALLBACK =
  "-apple-system, system-ui, 'Segoe UI', 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', 'Noto Sans', 'Noto Sans CJK JP', sans-serif"

const MONO_FALLBACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', 'Noto Sans Mono', monospace"

export const FONT_FAMILIES: FontFamilyOption[] = [
  { id: 'system', label: 'System UI', value: `ui-sans-serif, ${SANS_FALLBACK}` },
  { id: 'inter', label: 'Inter', value: `'Inter', ${SANS_FALLBACK}` },
  { id: 'hack', label: 'Hack', value: `'Hack', ${MONO_FALLBACK}` },
  { id: 'jetbrains', label: 'JetBrains Mono', value: `'JetBrains Mono', ${MONO_FALLBACK}` },
  { id: 'mono', label: 'Monospace', value: MONO_FALLBACK },
]

export const FONT_SIZE_MIN = 9
export const FONT_SIZE_MAX = 32
export const APP_FONT_SIZE_MAX = 20

const APP_BASE_SIZE = 13
const APP_LADDER = [9, 10, 11, 12, 13, 14, 15]
const listeners = new Set<SettingsListener>()

export const TIMEZONES: TimezoneOption[] = [
  { id: 'UTC', label: 'UTC (GMT+0)' },
  { id: 'Asia/Jakarta', label: 'Asia/Jakarta (GMT+7)' },
  { id: 'Asia/Makassar', label: 'Asia/Makassar (GMT+8)' },
  { id: 'Asia/Jayapura', label: 'Asia/Jayapura (GMT+9)' },
  { id: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { id: 'Asia/Bangkok', label: 'Bangkok (GMT+7)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong (GMT+8)' },
  { id: 'Asia/Seoul', label: 'Seoul (GMT+9)' },
  { id: 'Asia/Shanghai', label: 'Shanghai (GMT+8)' },
  { id: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
  { id: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { id: 'Europe/London', label: 'London (GMT+0)' },
  { id: 'Europe/Paris', label: 'Paris (GMT+1)' },
  { id: 'Europe/Berlin', label: 'Berlin (GMT+1)' },
  { id: 'America/New_York', label: 'New York (GMT-5)' },
  { id: 'America/Chicago', label: 'Chicago (GMT-6)' },
  { id: 'America/Denver', label: 'Denver (GMT-7)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (GMT-8)' },
  { id: 'Australia/Sydney', label: 'Sydney (GMT+10)' },
]

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light-nova',
  timezone: 'UTC',
  appFontSize: 12,
  appFontFamily: 'system',
  gridFontSize: 12,
  gridFontFamily: 'system',
  jsonFontSize: 12,
  jsonFontFamily: 'mono',
  queryFontSize: 12,
  queryFontFamily: 'hack',
  queryWordWrap: false,
  queryExecutionMode: 'silent',
}

let activeSettings: Settings = { ...DEFAULT_SETTINGS }

export function getCurrentSettings(): Settings {
  return activeSettings
}

export function getResponsiveDefaultFontSize(): number {
  if (typeof window !== 'undefined') {
    const width = window.screen?.width || window.innerWidth || 0
    if (width >= 1600) {
      return 14
    }
  }
  return 12
}

function normalizeFontSize(value: unknown, fallback: number, max = FONT_SIZE_MAX): number {
  const size = Math.round(Number(value))
  if (!Number.isFinite(size)) return fallback
  return Math.min(Math.max(size, FONT_SIZE_MIN), max)
}

function normalizeFontFamily(value: unknown, fallback: string): string {
  return FONT_FAMILIES.some((family) => family.id === value) ? (value as string) : fallback
}

function normalizeTimezone(value: unknown, fallback: string): string {
  return TIMEZONES.some((tz) => tz.id === value) ? (value as string) : fallback
}

export function normalizeSettings(input: unknown): Settings {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const defaultSize = getResponsiveDefaultFontSize()

  const queryExecutionModeCandidate = source.queryExecutionMode as ExecutionModeId
  const validExecutionMode = EXECUTION_MODES.some((mode) => mode.id === queryExecutionModeCandidate)
    ? queryExecutionModeCandidate
    : DEFAULT_SETTINGS.queryExecutionMode

  return {
    theme: THEMES.some((theme) => theme.id === source.theme)
      ? (source.theme as string)
      : DEFAULT_SETTINGS.theme,
    timezone: normalizeTimezone(source.timezone, DEFAULT_SETTINGS.timezone),
    appFontSize: normalizeFontSize(source.appFontSize, defaultSize, APP_FONT_SIZE_MAX),
    appFontFamily: normalizeFontFamily(source.appFontFamily, DEFAULT_SETTINGS.appFontFamily),
    gridFontSize: normalizeFontSize(source.gridFontSize, defaultSize),
    gridFontFamily: normalizeFontFamily(source.gridFontFamily, DEFAULT_SETTINGS.gridFontFamily),
    jsonFontSize: normalizeFontSize(source.jsonFontSize, defaultSize),
    jsonFontFamily: normalizeFontFamily(source.jsonFontFamily, DEFAULT_SETTINGS.jsonFontFamily),
    queryFontSize: normalizeFontSize(source.queryFontSize, defaultSize),
    queryFontFamily: normalizeFontFamily(source.queryFontFamily, DEFAULT_SETTINGS.queryFontFamily),
    queryWordWrap: source.queryWordWrap === true,
    queryExecutionMode: validExecutionMode,
  }
}

export function fontFamilyValue(id: string): string {
  const family = FONT_FAMILIES.find((item) => item.id === id) || FONT_FAMILIES[0]
  return family.value
}

export function applySettings(input: unknown): Settings {
  const settings = normalizeSettings(input)
  const root = document.documentElement
  const scale = settings.appFontSize / APP_BASE_SIZE

  root.dataset.theme = settings.theme
  if (settings.theme.startsWith('light')) {
    root.classList.remove('dark')
    root.classList.add('light')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }

  APP_LADDER.forEach((size) => {
    root.style.setProperty(`--app-text-${size}`, `${Math.round(size * scale)}px`)
  })
  root.style.setProperty('--app-font-family', fontFamilyValue(settings.appFontFamily))
  root.style.setProperty('--grid-font-size', `${settings.gridFontSize}px`)
  root.style.setProperty('--grid-font-family', fontFamilyValue(settings.gridFontFamily))
  root.style.setProperty('--json-font-size', `${settings.jsonFontSize}px`)
  root.style.setProperty('--json-font-family', fontFamilyValue(settings.jsonFontFamily))
  root.style.setProperty('--query-font-size', `${settings.queryFontSize}px`)
  root.style.setProperty('--query-font-family', fontFamilyValue(settings.queryFontFamily))

  activeSettings = settings
  listeners.forEach((listener) => listener(settings))

  return settings
}

export function subscribeSettings(listener: SettingsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export interface QueryFontOptions {
  fontFamily: string
  fontSize: number
  lineHeight: number
  wordWrap: 'on' | 'off'
}

export function queryFontOptions(settings: unknown): QueryFontOptions {
  const normalized = normalizeSettings(settings)
  return {
    fontFamily: fontFamilyValue(normalized.queryFontFamily),
    fontSize: normalized.queryFontSize,
    lineHeight: Math.round(normalized.queryFontSize * 1.6),
    wordWrap: normalized.queryWordWrap ? 'on' : 'off',
  }
}
