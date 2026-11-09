type SyncWriteListener = () => void
const writeListeners: Set<SyncWriteListener> = new Set()

export function onLocalWrite(listener: SyncWriteListener): () => void {
  writeListeners.add(listener)
  return () => {
    writeListeners.delete(listener)
  }
}

export function notifyLocalWrite(): void {
  writeListeners.forEach((listener) => {
    try {
      listener()
    } catch {
    }
  })
}

export type { SyncWriteListener }