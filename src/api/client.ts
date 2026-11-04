import { AuthSession } from './types'

const TOKEN_KEY = 'nova_tables_sanctum_token'
const REFRESH_TOKEN_KEY = 'nova_tables_refresh_token'
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

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
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

let refreshPromise: Promise<string | null> | null = null

export async function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return null
  }

  refreshPromise = (async () => {
    try {
      const baseUrl = getApiBaseUrl()
      const res = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })

      if (!res.ok) {
        return null
      }

      const text = await res.text()
      let data: any = null
      try {
        data = JSON.parse(text)
      } catch {
        return null
      }

      if (!data?.ok || !data?.token) {
        return null
      }

      const newAccessToken = data.token as string
      const newRefreshToken = (data.refreshToken as string) || null

      setAuthToken(newAccessToken)
      if (newRefreshToken) {
        setRefreshToken(newRefreshToken)
      }

      const currentSession = getStoredSession()
      if (currentSession) {
        setStoredSession({
          ...currentSession,
          user: data.user || currentSession.user,
          token: newAccessToken,
          refreshToken: newRefreshToken || currentSession.refreshToken,
        })
      }

      return newAccessToken
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl()
  let token = getAuthToken()
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${normalizedEndpoint}`

  const isAuthRoute =
    normalizedEndpoint === '/api/auth/login' ||
    normalizedEndpoint === '/api/auth/register' ||
    normalizedEndpoint === '/api/auth/refresh' ||
    normalizedEndpoint.startsWith('/api/auth/google')

  const buildHeaders = (authToken: string | null) => ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  })

  let response = await fetch(url, {
    ...options,
    headers: buildHeaders(token),
  })

  if (response.status === 401 && !isAuthRoute) {
    const newToken = await refreshAccessTokenSingleFlight()
    if (newToken) {
      token = newToken
      response = await fetch(url, {
        ...options,
        headers: buildHeaders(token),
      })
    }
  }

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
    if (response.status === 401 && !isAuthRoute) {
      setAuthToken(null)
      setRefreshToken(null)
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
