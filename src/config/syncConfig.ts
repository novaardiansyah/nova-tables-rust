export const DEFAULT_SYNC_INTERVAL_SEC = 120

let activeSyncIntervalMs: number = DEFAULT_SYNC_INTERVAL_SEC * 1000

export function getSyncIntervalMs(): number {
  if (typeof window !== 'undefined') {
    const envVal = Number(import.meta.env?.VITE_SYNC_INTERVAL_SEC)
    if (!Number.isNaN(envVal) && envVal > 0) {
      return envVal * 1000
    }
  }
  return activeSyncIntervalMs
}

export function setSyncIntervalMs(intervalMs: number): void {
  if (intervalMs > 0) {
    activeSyncIntervalMs = intervalMs
  }
}
