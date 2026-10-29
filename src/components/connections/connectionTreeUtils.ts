export interface TreeFolder {
  id: string
  name: string
  parentId?: string | null
  [key: string]: unknown
}

export interface TreeConnection {
  id: string
  name?: string
  folderId?: string | null
  [key: string]: unknown
}

export interface FolderTreeItem {
  folder: TreeFolder
  depth: number
}

export interface FlatRow {
  kind: 'connection' | 'folder'
  id: string
  depth: number
}

export interface DragItem {
  kind: 'connection' | 'folder'
  id: string
}

export interface DragTarget {
  kind: 'connection' | 'folder'
  id: string
  position: 'before' | 'after' | 'inside'
}

export function byName(left: { name?: string | null }, right: { name?: string | null }): number {
  return String(left.name ?? '').localeCompare(String(right.name ?? ''))
}

export function folderTree(
  folders: TreeFolder[],
  parentId: string | null = null,
  depth = 0,
  result: FolderTreeItem[] = []
): FolderTreeItem[] {
  const children = folders.filter((folder) => (folder.parentId ?? null) === parentId).sort(byName)
  for (const folder of children) {
    result.push({ folder, depth })
    folderTree(folders, folder.id, depth + 1, result)
  }
  return result
}

export function flattenRows(
  connections: TreeConnection[],
  folders: TreeFolder[],
  openFolders: Set<string>,
  parentId: string | null = null,
  depth = 0,
  result: FlatRow[] = []
): FlatRow[] {
  for (const connection of connections.filter((item) => (item.folderId ?? null) === parentId)) {
    result.push({ kind: 'connection', id: connection.id, depth })
  }
  const children = folders.filter((folder) => (folder.parentId ?? null) === parentId).sort(byName)
  for (const folder of children) {
    result.push({ kind: 'folder', id: folder.id, depth })
    if (openFolders.has(folder.id)) {
      flattenRows(connections, folders, openFolders, folder.id, depth + 1, result)
    }
  }
  return result
}

export function folderSubtree(folders: TreeFolder[], id: string): Set<string> {
  const ids = new Set<string>([id])
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const folder of folders) {
      if (folder.parentId === current && !ids.has(folder.id)) {
        ids.add(folder.id)
        queue.push(folder.id)
      }
    }
  }
  return ids
}

export function resolveTarget(
  event: React.MouseEvent<HTMLElement>,
  kind: 'connection' | 'folder',
  item: { id: string },
  drag?: DragItem | null
): DragTarget {
  const bounds = event.currentTarget.getBoundingClientRect()
  if (kind === 'connection') {
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
    return { kind: 'connection', id: item.id, position }
  }
  if (drag?.kind === 'folder') {
    const offset = (event.clientY - bounds.top) / bounds.height
    const position = offset < 0.25 ? 'before' : offset > 0.75 ? 'after' : 'inside'
    return { kind: 'folder', id: item.id, position }
  }
  return { kind: 'folder', id: item.id, position: 'inside' }
}
