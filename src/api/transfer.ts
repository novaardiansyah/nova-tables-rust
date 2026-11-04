import { encryptExportPayload, decryptImportPayload } from './crypto'
import { ConnectionModel, FolderModel, IpcError, ImportFileDialogResult } from './types'
import { api } from './index'

interface ConnectionsBundle {
  connections: Record<string, unknown>[]
  folders: { id: string; name: string; parentId: string | null }[]
  order: { connections: string[]; folders: string[] }
}

function cleanText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

function exportFolderChain(folderId: string, folderById: Map<string, FolderModel>): string[] {
  const chain: string[] = []
  let current: FolderModel | null = folderId ? folderById.get(folderId) ?? null : null
  while (current && !chain.includes(current.id)) {
    chain.unshift(current.id)
    current = current.parentId ? folderById.get(current.parentId) ?? null : null
  }
  return chain
}

function importFolderKey(parentId: string | null, name: string): string {
  return `${parentId ?? ''}::${String(name).toLowerCase()}`
}

function importFolderDepth(folder: FolderModel, folderById: Map<string, FolderModel>): number {
  let depth = 0
  let current: FolderModel | undefined = folder
  while (current?.parentId && folderById.has(String(current.parentId)) && depth < 64) {
    current = folderById.get(String(current.parentId))
    depth += 1
  }
  return depth
}

function getYYYYMMDD(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}${second}`
}

async function buildConnectionsBundle(
  connectionIds: string[] | null | undefined
): Promise<ConnectionsBundle> {
  const allConnections = await api.listConnections()
  const allSelected = !Array.isArray(connectionIds) || connectionIds.length === 0
  const targetIds = new Set(
    allSelected ? allConnections.map((c) => c.id!) : connectionIds.map(String)
  )

  const allFolders = await api.listFolders()
  const folderById = new Map<string, FolderModel>(allFolders.map((f) => [f.id, f]))
  const folderIds = new Set<string>()
  const folderOrder: string[] = []

  if (allSelected) {
    for (const folder of allFolders) folderIds.add(folder.id)
  } else {
    for (const conn of allConnections) {
      if (!targetIds.has(conn.id!) || !conn.folderId) continue
      for (const id of exportFolderChain(conn.folderId, folderById)) {
        folderIds.add(id)
      }
    }
  }

  for (const folder of allFolders) {
    if (folderIds.has(folder.id)) folderOrder.push(folder.id)
  }

  const connections: Record<string, unknown>[] = []
  const connectionOrder: string[] = []
  for (const item of allConnections) {
    if (!targetIds.has(item.id!)) continue
    connectionOrder.push(item.id!)
    connections.push({
      name: item.name,
      host: item.host,
      port: item.port,
      username: item.username,
      database: item.databaseName || item.database || '',
      environment: item.environment || '',
      encrypt: item.encrypt !== false,
      trustServerCertificate: item.trustServerCertificate !== false,
      driverType: item.driverType ?? null,
      password: item.password || null,
      folderId: item.folderId ?? null,
    })
  }

  const folders = folderOrder.map((id) => {
    const folder = folderById.get(id)!
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
    }
  })

  return { connections, folders, order: { connections: connectionOrder, folders: folderOrder } }
}

async function saveFileWithDialog(input: {
  defaultPath: string
  filters: { name: string; extensions: string[] }[]
  content: string
}): Promise<{ saved: boolean; filePath?: string }> {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
    const blob = new Blob([input.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = input.defaultPath
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { saved: true }
  }
  const res = await api.saveFile(input)
  return { saved: Boolean(res?.saved), filePath: res?.filePath }
}

export async function applyImportedConnections(payload: {
  connections?: any[]
  folders?: any[]
}): Promise<{
  importedCount: number
  importedFolderCount: number
  connections: ConnectionModel[]
  folders: FolderModel[]
}> {
  const items = payload.connections || []
  const sourceFolders = Array.isArray(payload.folders) ? payload.folders : []

  const existingConnections = await api.listConnections()
  const existingNames = new Set(existingConnections.map((c) => (c.name || '').toLowerCase()))
  const existingFolders = await api.listFolders()
  const reusableFolders = new Map<string, string>()
  for (const folder of existingFolders) {
    const key = importFolderKey(folder.parentId ?? null, folder.name)
    if (!reusableFolders.has(key)) reusableFolders.set(key, folder.id)
  }

  const folderIdMap = new Map<string, string>()
  const importedFolderIds: string[] = []
  const sourceFolderById = new Map<string, FolderModel>(
    sourceFolders.filter((f: any) => f && f.id).map((f: any) => [String(f.id), f])
  )
  const orderedSourceFolders = [...sourceFolderById.values()].sort(
    (left, right) =>
      importFolderDepth(left, sourceFolderById) - importFolderDepth(right, sourceFolderById)
  )

  for (const folder of orderedSourceFolders) {
    const name = cleanText(folder.name)
    if (!name) continue
    const sourceParentId = folder.parentId ? String(folder.parentId) : null
    const parentId = sourceParentId ? folderIdMap.get(sourceParentId) ?? null : null
    const key = importFolderKey(parentId, name)
    const reusableId = reusableFolders.get(key)
    let targetId = reusableId

    if (reusableId) {
      reusableFolders.delete(key)
    } else {
      const created = await api.saveFolder({ name, parentId })
      targetId = created.id
      importedFolderIds.push(targetId)
    }

    if (targetId) {
      folderIdMap.set(String(folder.id), targetId)
    }
  }

  const nameFolderCache = new Map<string, string>()
  const resolveLegacyFolder = async (folderName: string): Promise<string | null> => {
    const name = cleanText(folderName)
    if (!name) return null
    const key = importFolderKey(null, name)
    if (nameFolderCache.has(key)) return nameFolderCache.get(key) ?? null
    const fine = reusableFolders.get(key) ?? null
    if (fine) {
      reusableFolders.delete(key)
      nameFolderCache.set(key, fine)
      return fine
    }
    const created = await api.saveFolder({ name })
    importedFolderIds.push(created.id)
    nameFolderCache.set(key, created.id)
    return created.id
  }

  const imported: ConnectionModel[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    let name = cleanText(item.name)
    if (!name) continue

    if (existingNames.has(name.toLowerCase())) {
      name = `(new) ${name}`
      while (existingNames.has(name.toLowerCase())) {
        name = `(new) ${name}`
      }
    }
    existingNames.add(name.toLowerCase())

    let folderId: string | null = null
    if (item.folderId && folderIdMap.has(String(item.folderId))) {
      folderId = folderIdMap.get(String(item.folderId)) ?? null
    } else if (item.folderName) {
      folderId = await resolveLegacyFolder(item.folderName)
    }

    const saved = await api.saveConnection({
      name,
      host: item.host,
      port: Number(item.port) || 1433,
      username: item.username || '',
      databaseName: item.database || item.databaseName || '',
      environment: item.environment || '',
      encrypt: item.encrypt !== false,
      trustServerCertificate: item.trustServerCertificate !== false,
      driverType: item.driverType,
      folderId,
      password: item.password || null,
    })

    imported.push(saved)
  }

  return {
    importedCount: imported.length,
    importedFolderCount: importedFolderIds.length,
    connections: await api.listConnections(),
    folders: await api.listFolders(),
  }
}

export async function exportConnections(
  connectionIds: string[] | null | undefined,
  password: string | null | undefined
): Promise<{ saved: boolean; count: number }> {
  const secret = String(password ?? '')
  if (!secret) {
    throw new IpcError({
      message: 'Password is required to encrypt export',
      code: 'PASSWORD_REQUIRED',
    })
  }

  const bundle = await buildConnectionsBundle(connectionIds)
  if (bundle.connections.length === 0) {
    throw new IpcError({ message: 'No connections found to export', code: 'NO_CONNECTIONS' })
  }

  const encrypted = await encryptExportPayload(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      ...bundle,
    },
    secret
  )
  const defaultName = `connections-${getYYYYMMDD()}.nova-tables`
  const saveResult = await saveFileWithDialog({
    defaultPath: defaultName,
    filters: [
      { name: 'Nova Tables Export', extensions: ['nova-tables'] },
    ],
    content: encrypted,
  })

  return saveResult.saved ? { saved: true, count: bundle.connections.length } : { saved: false, count: 0 }
}

export async function exportAppConfig(
  target: unknown,
  password: string | null | undefined
): Promise<{ saved: boolean; connectionCount: number; hasSettings?: boolean }> {
  const secret = String(password ?? '')
  if (!secret) {
    throw new IpcError({
      message: 'Password is required to encrypt export',
      code: 'PASSWORD_REQUIRED',
    })
  }

  let settingsPayload: unknown = null
  let connectionIds: string[] | null | undefined = null
  let includeConnections = true

  if (
    target &&
    typeof target === 'object' &&
    ('includeSettings' in target || 'connectionIds' in target || 'includeConnections' in target)
  ) {
    const opts = target as {
      settings?: unknown
      connectionIds?: string[] | null
      includeSettings?: boolean
      includeConnections?: boolean
    }
    settingsPayload = opts.includeSettings !== false ? (opts.settings ?? null) : null
    connectionIds = opts.connectionIds ?? null
    includeConnections = opts.includeConnections !== false
  } else {
    settingsPayload = target ?? null
  }

  const bundle = includeConnections
    ? await buildConnectionsBundle(connectionIds)
    : { connections: [], folders: [], order: { connections: [], folders: [] } }

  if (!settingsPayload && bundle.connections.length === 0) {
    throw new IpcError({
      message: 'No configuration or connections selected to export',
      code: 'NO_DATA',
    })
  }

  const encrypted = await encryptExportPayload(
    {
      version: 2,
      kind: 'app-config',
      exportedAt: new Date().toISOString(),
      settings: settingsPayload,
      ...bundle,
    },
    secret
  )
  const defaultName = `configs-${getYYYYMMDD()}.nova-tables`
  const saveResult = await saveFileWithDialog({
    defaultPath: defaultName,
    filters: [
      { name: 'Nova Tables Config', extensions: ['nova-tables'] },
    ],
    content: encrypted,
  })

  return saveResult.saved
    ? { saved: true, connectionCount: bundle.connections.length, hasSettings: Boolean(settingsPayload) }
    : { saved: false, connectionCount: 0, hasSettings: false }
}

export async function selectImportFile(): Promise<ImportFileDialogResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.nova-tables'
    input.style.display = 'none'
    document.body.appendChild(input)

    let settled = false
    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input)
      }
    }

    input.addEventListener('change', async () => {
      settled = true
      const file = input.files?.[0]
      cleanup()
      if (!file || !file.name.endsWith('.nova-tables')) {
        resolve({ canceled: true })
        return
      }
      try {
        const content = await file.text()
        resolve({
          canceled: false,
          filePath: file.name,
          fileName: file.name,
          content,
        })
      } catch {
        resolve({ canceled: true })
      }
    })

    input.addEventListener('cancel', () => {
      settled = true
      cleanup()
      resolve({ canceled: true })
    })

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled) {
            cleanup()
            resolve({ canceled: true })
          }
        }, 600)
      },
      { once: true },
    )

    input.click()
  })
}

export async function importConnections(
  content: string | Record<string, unknown>,
  password: string | null | undefined
): Promise<{
  importedCount: number
  importedFolderCount: number
  connections: ConnectionModel[]
  folders: FolderModel[]
}> {
  const secret = String(password ?? '')
  if (!secret) {
    throw new IpcError({
      message: 'Password is required to decrypt connections',
      code: 'PASSWORD_REQUIRED',
    })
  }

  let payload: { connections?: any[]; folders?: any[] }
  try {
    payload = await decryptImportPayload(content, secret)
  } catch (err: any) {
    throw new IpcError({
      message: err?.message || 'Failed to decrypt import file',
      code: err?.code || 'DECRYPT_ERROR',
    })
  }

  return applyImportedConnections(payload)
}

export async function importAppConfig(
  content: string | Record<string, unknown>,
  password: string | null | undefined,
  options?: {
    includeSettings?: boolean
    includeConnections?: boolean
  }
): Promise<{
  importedCount: number
  importedFolderCount: number
  connections: ConnectionModel[]
  folders: FolderModel[]
  settings: Record<string, unknown> | null
}> {
  const secret = String(password ?? '')
  if (!secret) {
    throw new IpcError({
      message: 'Password is required to decrypt configuration',
      code: 'PASSWORD_REQUIRED',
    })
  }

  let payload: { connections?: any[]; folders?: any[]; settings?: unknown }
  try {
    payload = await decryptImportPayload(content, secret)
  } catch (err: any) {
    throw new IpcError({
      message: err?.message || 'Failed to decrypt configuration file',
      code: err?.code || 'DECRYPT_ERROR',
    })
  }

  const includeConnections = options?.includeConnections !== false
  const includeSettings = options?.includeSettings !== false

  const imported = includeConnections
    ? await applyImportedConnections(payload)
    : {
      importedCount: 0,
      importedFolderCount: 0,
      connections: await api.listConnections(),
      folders: await api.listFolders(),
    }

  const settings =
    includeSettings && payload.settings && typeof payload.settings === 'object'
      ? (payload.settings as Record<string, unknown>)
      : null

  return { ...imported, settings }
}
