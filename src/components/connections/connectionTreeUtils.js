export function byName(left, right) {
  return String(left.name).localeCompare(String(right.name))
}

export function folderTree(folders, parentId = null, depth = 0, result = []) {
  const children = folders.filter((folder) => (folder.parentId ?? null) === parentId).sort(byName)
  for (const folder of children) {
    result.push({ folder, depth })
    folderTree(folders, folder.id, depth + 1, result)
  }
  return result
}

export function flattenRows(connections, folders, openFolders, parentId = null, depth = 0, result = []) {
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

export function folderSubtree(folders, id) {
  const ids = new Set([id])
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

export function resolveTarget(event, kind, item, drag) {
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
