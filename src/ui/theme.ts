export const THEMES = {
  DEFAULT: 'default',
  MIDNIGHT: 'midnight',
  SLATE: 'slate',
  AMBER: 'amber',
  EMERALD: 'emerald',
  ROSE: 'rose',
} as const

export type ThemeName = typeof THEMES[keyof typeof THEMES]

export const LAYOUT = {
  SIDEBAR_MIN_WIDTH: 220,
  SIDEBAR_DEFAULT_WIDTH: 320,
  SIDEBAR_MAX_WIDTH: 600,
  RESULTS_PANEL_DEFAULT_HEIGHT: 320,
  JSON_PANEL_DEFAULT_WIDTH: 420,
} as const

export interface EnvironmentStyle {
  badge: string
  dot: string
}

export const ENVIRONMENT_COLORS: Record<string, EnvironmentStyle> = {
  local: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  staging: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  production: {
    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    dot: 'bg-rose-400',
  },
}
