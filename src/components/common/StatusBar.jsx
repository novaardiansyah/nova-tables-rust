import Icon, { Spinner } from './Icon.jsx'
import { formatDuration, formatNumber } from '../../resultFormats.js'

export default function StatusBar({ result, editSource, activeDatabase, queryStatus }) {
  const resultSets = result?.resultSets ?? []

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-3 text-[length:var(--app-text-10)] text-text-muted">
      <div className="flex min-w-0 items-center gap-3">
        {queryStatus === 'success' && editSource?.joined ? (
          <span
            title={`Only columns traced to ${editSource.tables
              .map((source) => `${source.schema}.${source.table}`)
              .join(', ')} can be edited; every other column stays read-only.`}
            className="flex min-w-0 items-center gap-1 rounded bg-tint/[0.05] px-1.5 text-text-faint"
          >
            <Icon name="pencil" size={10} className="shrink-0" />
            <span className="truncate">Editing {editSource.tables.map((source) => source.table).join(', ')}</span>
          </span>
        ) : null}

        {queryStatus === 'success' && result ? (
          <>
            <span className="shrink-0 tabular-nums">{formatNumber(result.rowCount)} rows</span>
            <span className="text-text-faint">•</span>
            <span className="shrink-0 tabular-nums">{formatDuration(result.elapsedMs)}</span>
            {resultSets.length > 1 ? (
              <>
                <span className="text-text-faint">•</span>
                <span className="shrink-0">{resultSets.length} result sets</span>
              </>
            ) : null}
          </>
        ) : null}

        {queryStatus === 'idle' ? <span>Ready</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {activeDatabase ? (
          <span className="flex items-center gap-1.5">
            <Icon name="database" size={10} className="text-text-faint" />
            {activeDatabase}
          </span>
        ) : null}

        {queryStatus === 'running' ? (
          <span className="flex items-center gap-1.5 text-accent">
            <Spinner size={10} />
            Executing
          </span>
        ) : null}
        {queryStatus === 'success' ? (
          <span className="flex items-center gap-1.5 text-success/80">
            <Icon name="check-circle" size={10} />
            Query succeeded
          </span>
        ) : null}
        {queryStatus === 'error' ? (
          <span className="flex items-center gap-1.5 text-danger">
            <Icon name="alert-triangle" size={10} />
            Query failed
          </span>
        ) : null}
      </div>
    </footer>
  )
}
