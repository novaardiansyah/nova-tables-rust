import { AuthSession, AuthUser } from './types'

const TOKEN_KEY = 'nova_tables_sanctum_token'
const SESSION_KEY = 'nova_tables_auth_session'

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://127.0.0.1:12143'
  return envUrl.replace(/\/+$/, '')
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function setStoredSession(session: AuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const token = getAuthToken()
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${normalizedEndpoint}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const text = await response.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null)
      setStoredSession(null)
    }

    let message = 'Request failed'
    if (data?.message) {
      message = data.message
    } else if (data?.errors && typeof data.errors === 'object') {
      const values = Object.values(data.errors) as string[][]
      message = values.flat().join(' ')
    } else {
      message = `Request failed with status ${response.status}`
    }

    throw new Error(message)
  }

  return (data || {}) as T
}

