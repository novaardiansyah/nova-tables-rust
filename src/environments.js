export const ENVIRONMENTS = [
  { id: 'local', label: 'Local', tone: 'success' },
  { id: 'staging', label: 'Staging', tone: 'warning' },
  { id: 'production', label: 'Production', tone: 'danger' },
]

export const ENVIRONMENT_OPTIONS = [
  { value: '', label: 'Not set' },
  ...ENVIRONMENTS.map((item) => ({ value: item.id, label: item.label })),
]

export function environmentById(id) {
  return ENVIRONMENTS.find((item) => item.id === id) ?? null
}
