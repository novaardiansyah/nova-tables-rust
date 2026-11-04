import { AuthSession, AuthUser } from './types'

const TOKEN_KEY = 'nova_tables_sanctum_token'
const SESSION_KEY = 'nova_tables_auth_session'

type UnauthenticatedListener = () => void
const unauthenticatedListeners = new Set<UnauthenticatedListener>()

export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener)
  return () => {
    unauthenticatedListeners.delete(listener)
  }
}

export function notifyUnauthenticated(): void {
  unauthenticatedListeners.forEach((listener) => {
    try {
      listener()
    } catch {
    }
  })
}

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
    const isAuthRoute =
      normalizedEndpoint === '/api/auth/login' ||
      normalizedEndpoint === '/api/auth/register' ||
      normalizedEndpoint.startsWith('/api/auth/google')

    if (response.status === 401 && !isAuthRoute) {
      setAuthToken(null)
      setStoredSession(null)
      notifyUnauthenticated()
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

    const error = new Error(message)
    if (response.status === 401) {
      ;(error as any).status = 401
      ;(error as any).isUnauthorized = true
    }
    throw error
  }

  return (data || {}) as T
}

