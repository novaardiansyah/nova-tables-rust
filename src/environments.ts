export type EnvironmentTone = 'success' | 'warning' | 'danger'

export interface Environment {
  id: string
  label: string
  tone: EnvironmentTone
}

export interface EnvironmentOption {
  value: string
  label: string
}

export const ENVIRONMENTS: Environment[] = [
  { id: 'local', label: 'Local', tone: 'success' },
  { id: 'staging', label: 'Staging', tone: 'warning' },
  { id: 'production', label: 'Production', tone: 'danger' },
]

export const ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  { value: '', label: 'Not set' },
  ...ENVIRONMENTS.map((item) => ({ value: item.id, label: item.label })),
]

export function environmentById(id: string | null | undefined): Environment | null {
  if (!id) return null
  return ENVIRONMENTS.find((item) => item.id === id) ?? null
}
