import { useEffect, useMemo, useState } from 'react'
import Icon, { Spinner } from '../common/Icon'
import { SavedQueryItem } from '../../hooks/useSavedQueries'

function preview(sql?: string | null) {
  const line = String(sql || '').replace(/\s+/g, ' ').trim()
  return line || 'Empty query'
}

function formatUpdated(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface SavedQueriesDialogProps {
  open: boolean
  connectionName: string
  database: string
  queries: SavedQueryItem[]
  loading?: boolean
  error?: string | null
  blocked?: boolean
  onOpen: (query: SavedQueryItem) => void
  onRename: (query: SavedQueryItem) => void
  onDelete: (query: SavedQueryItem) => void
  onClose: () => void
}

export default function SavedQueriesDialog({
  open,
  connectionName,
  database,
  queries,
  loading = false,
  error = null,
  blocked = false,
  onOpen,
  onRename,
  onDelete,
  onClose,
}: SavedQueriesDialogProps) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  useEffect(() => {
    if (!open || blocked) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, blocked, onClose])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return queries
    return queries.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) || item.sql.toLowerCase().includes(needle),
    )
  }, [queries, search])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="bookmark" size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--app-text-14)] font-semibold text-text-strong">Saved queries</h2>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[length:var(--app-text-11)] text-text-muted">
              <Icon name="database" size={10} className="shrink-0 text-text-faint" />
              <span className="truncate font-medium text-text-soft">{connectionName}</span>
              <span className="text-text-faint">/</span>
              <span className="truncate">{database}</span>
              <span className="ml-1 shrink-0 rounded border border-line bg-tint/[0.04] px-1.5 py-0.5 text-[length:var(--app-text-9)] uppercase tracking-wide text-text-faint">
                scoped
              </span>
            </p>
          </div>
          <button type="button" className="icon-btn h-6 w-6" onClick={onClose} title="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Icon
              name="search"
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              className="field pl-8"
              value={search}
              autoFocus
              placeholder="Search saved queries…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-[180px] flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[length:var(--app-text-12)] text-text-muted">
              <Spinner size={13} />
              Loading saved queries…
            </div>
          ) : error ? (
            <p className="px-3 py-8 text-center text-[length:var(--app-text-12)] text-danger">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tint/[0.04] text-text-faint">
                <Icon name={search.trim() ? 'search' : 'bookmark'} size={17} />
              </span>
              <p className="mt-3 text-[length:var(--app-text-13)] font-medium text-text-soft">
                {search.trim() ? 'No matching saved query' : 'No saved queries here yet'}
              </p>
              <p className="mt-1 max-w-sm text-[length:var(--app-text-11)] leading-[calc(var(--app-text-11)+5px)] text-text-faint">
                {search.trim()
                  ? 'Try another name or a fragment of the SQL.'
                  : 'Open a tab you want to keep, then press Ctrl+S or use the save button above the editor.'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-start gap-1 rounded-lg border border-transparent px-1 py-0.5 transition-colors hover:border-line hover:bg-tint/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    title={`Open “${item.name}” in a new tab`}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                      <Icon name="code" size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate text-[length:var(--app-text-12)] font-medium text-text-strong">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-[length:var(--app-text-10)] text-text-faint">
                          {formatUpdated(item.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[length:var(--app-text-11)] text-text-muted">
                        {preview(item.sql)}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 pt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      className="icon-btn h-6 w-6"
                      title="Rename"
                      onClick={() => onRename(item)}
                    >
                      <Icon name="pencil" size={12} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn h-6 w-6 hover:text-danger"
                      title="Delete"
                      onClick={() => onDelete(item)}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="min-w-0 truncate text-[length:var(--app-text-11)] text-text-faint">
            {loading
              ? 'Reading from this device'
              : `${queries.length} saved ${queries.length === 1 ? 'query' : 'queries'} for this database.`}
          </p>
          <button type="button" className="btn-soft" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
