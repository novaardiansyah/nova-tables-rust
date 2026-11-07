export const DEFAULT_SYNC_INTERVAL_MS = 2 * 60 * 1000

let activeSyncIntervalMs: number = DEFAULT_SYNC_INTERVAL_MS

export function getSyncIntervalMs(): number {
  if (typeof window !== 'undefined') {
    const envVal = Number(import.meta.env?.VITE_SYNC_INTERVAL_MS)
    if (!Number.isNaN(envVal) && envVal > 0) {
      return envVal
    }
  }
  return activeSyncIntervalMs
}

export function setSyncIntervalMs(intervalMs: number): void {
  if (intervalMs > 0) {
    activeSyncIntervalMs = intervalMs
  }
}
