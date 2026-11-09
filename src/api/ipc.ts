import { invoke } from '@tauri-apps/api/core'
import { IpcError } from './types'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)

export async function callCommand<T = any>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  if (!isTauri()) {
    return null
  }
  try {
    const response = await invoke<any>(cmd, args)
    if (response && response.ok === false) {
      throw new IpcError(response.error)
    }
    return response as T
  } catch (err: unknown) {
    if (err instanceof IpcError) throw err
    const errorObj = err as { message?: string }
    throw new IpcError({ message: errorObj?.message || String(err) })
  }
}
