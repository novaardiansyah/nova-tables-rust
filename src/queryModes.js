export const EXECUTION_MODES = [
  {
    id: 'silent',
    label: 'Silent Mode',
    description: 'Send queries to the server without any warnings.',
    tone: 'success',
  },
  {
    id: 'alert-readonly',
    label: 'Alert Mode',
    description: 'Warn before sending queries to the server except SELECT queries.',
    tone: 'warning-outline',
  },
  {
    id: 'alert',
    label: 'Full Alert Mode',
    description: 'Warn before sending queries to the server.',
    tone: 'danger',
  },
]

const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|drop|create|alter|truncate|exec|execute|grant|revoke|backup|restore)\b/i

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT = /--[^\n]*/g

export function isReadOnlyQuery(sql) {
  const stripped = String(sql || '')
    .replace(BLOCK_COMMENT, ' ')
    .replace(LINE_COMMENT, ' ')
  if (!stripped.trim()) return true
  return !WRITE_KEYWORDS.test(stripped)
}

export function executionGuard(modeId, sql) {
  if (modeId === 'alert') return { kind: 'confirm' }
  if (modeId === 'alert-readonly') {
    return isReadOnlyQuery(sql) ? null : { kind: 'confirm' }
  }
  return null
}

export function getModeById(id) {
  return EXECUTION_MODES.find((mode) => mode.id === id) ?? EXECUTION_MODES[0]
}
