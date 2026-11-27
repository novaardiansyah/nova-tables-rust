import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/common/Icon'

const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
const NO_MATCH = Symbol('NO_MATCH')
const CHUNK_CHAR_TARGET = 48000

interface ParsedJsonCache {
  raw: string
  valid: boolean
  value: unknown
}

export function tokenize(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  TOKEN_RE.lastIndex = 0

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))

    const [full, literal, colon, constant, number] = match

    if (literal) {
      nodes.push(
        <span key={key++} className={colon ? 'text-text-strong' : 'text-success'}>
          {literal}
        </span>,
      )
      if (colon) nodes.push(colon)
    } else if (constant) {
      nodes.push(
        <span key={key++} className="text-info">
          {constant}
        </span>,
      )
    } else if (number) {
      nodes.push(
        <span key={key++} className="text-warning">
          {number}
        </span>,
      )
    }

    last = match.index + full.length
  }

  if (last < text.length) nodes.push(text.slice(last))

  return nodes
}

function matchesPrimitiveValue(value: unknown, query: string): boolean {
  if (value === null) return 'null'.includes(query)
  if (typeof value === 'string') return value.toLowerCase().includes(query)
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase().includes(query)
  }
  return false
}

function filterJsonNode(node: unknown, query: string): unknown | typeof NO_MATCH {
  if (node === null || typeof node !== 'object') {
    return matchesPrimitiveValue(node, query) ? node : NO_MATCH
  }

  if (Array.isArray(node)) {
    const matchedItems: unknown[] = []
    for (let i = 0; i < node.length; i += 1) {
      const filteredItem = filterJsonNode(node[i], query)
      if (filteredItem !== NO_MATCH) {
        matchedItems.push(filteredItem)
      }
    }
    return matchedItems.length > 0 ? matchedItems : NO_MATCH
  }

  const record = node as Record<string, unknown>
  const keys = Object.keys(record)
  const matchedRecord: Record<string, unknown> = {}
  let hasMatch = false

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const val = record[key]
    if (key.toLowerCase().includes(query)) {
      matchedRecord[key] = val
      hasMatch = true
    } else {
      const filteredVal = filterJsonNode(val, query)
      if (filteredVal !== NO_MATCH) {
        matchedRecord[key] = filteredVal
        hasMatch = true
      }
    }
  }

  return hasMatch ? matchedRecord : NO_MATCH
}

function splitIntoLineChunks(source: string): string[] {
  if (source.length <= CHUNK_CHAR_TARGET) {
    return [source]
  }
  const chunks: string[] = []
  let offset = 0
  while (offset < source.length) {
    if (offset + CHUNK_CHAR_TARGET >= source.length) {
      chunks.push(source.slice(offset))
      break
    }
    const nextNewline = source.indexOf('\n', offset + CHUNK_CHAR_TARGET)
    if (nextNewline === -1) {
      chunks.push(source.slice(offset))
      break
    }
    chunks.push(source.slice(offset, nextNewline + 1))
    offset = nextNewline + 1
  }
  return chunks
}

const JsonChunk = React.memo(function JsonChunk({ chunk }: { chunk: string }) {
  const nodes = useMemo(() => tokenize(chunk), [chunk])
  return <>{nodes}</>
})

export interface JsonViewProps {
  text: string
  searchable?: boolean
}

export default function JsonView({ text, searchable = false }: JsonViewProps) {
  const [filter, setFilter] = useState('')
  const deferredFilter = useDeferredValue(filter)
  const activeFilter = searchable ? deferredFilter.trim().toLowerCase() : ''
  const parsedCacheRef = useRef<ParsedJsonCache | null>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const filteredResult = useMemo<{ text: string; hasMatch: boolean }>(() => {
    if (!activeFilter) {
      return { text, hasMatch: true }
    }

    let cache = parsedCacheRef.current
    if (!cache || cache.raw !== text) {
      try {
        cache = { raw: text, valid: true, value: JSON.parse(text) }
      } catch {
        cache = { raw: text, valid: false, value: null }
      }
      parsedCacheRef.current = cache
    }

    if (!cache.valid) {
      const matchedLines = text
        .split('\n')
        .filter((line) => line.toLowerCase().includes(activeFilter))
      if (matchedLines.length === 0) {
        return { text: '', hasMatch: false }
      }
      return { text: matchedLines.join('\n'), hasMatch: true }
    }

    const filtered = filterJsonNode(cache.value, activeFilter)
    if (filtered === NO_MATCH) {
      return { text: '', hasMatch: false }
    }

    return { text: JSON.stringify(filtered, null, 2), hasMatch: true }
  }, [text, activeFilter])

  const chunks = useMemo(() => splitIntoLineChunks(filteredResult.text), [filteredResult.text])
  const [chunkState, setChunkState] = useState<{ source: string; count: number }>({
    source: filteredResult.text,
    count: 1,
  })
  const visibleChunkCount = chunkState.source === filteredResult.text ? chunkState.count : 1
  const visibleChunks = useMemo(
    () => chunks.slice(0, visibleChunkCount),
    [chunks, visibleChunkCount],
  )

  useEffect(() => {
    if (!searchable) return
    if (preRef.current) {
      preRef.current.scrollTop = 0
    }
  }, [activeFilter, searchable])

  useEffect(() => {
    const el = preRef.current
    if (!el || visibleChunkCount >= chunks.length) return
    if (el.scrollHeight <= el.clientHeight + 240) {
      setChunkState({ source: filteredResult.text, count: visibleChunkCount + 1 })
    }
  }, [chunks.length, filteredResult.text, visibleChunkCount])

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLPreElement>) => {
      if (visibleChunkCount >= chunks.length) return
      const el = event.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 480) {
        setChunkState((prev) => {
          const currentCount = prev.source === filteredResult.text ? prev.count : 1
          if (currentCount >= chunks.length) return prev
          return { source: filteredResult.text, count: currentCount + 1 }
        })
      }
    },
    [chunks.length, filteredResult.text, visibleChunkCount],
  )

  if (!searchable) {
    return (
      <pre
        ref={preRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 select-text leading-[calc(var(--json-font-size)+8px)] text-text"
        style={{ fontFamily: 'var(--json-font-family)', fontSize: 'var(--json-font-size)' }}
      >
        {visibleChunks.map((chunk, index) => (
          <JsonChunk key={index} chunk={chunk} />
        ))}
      </pre>
    )
  }

  const displayedQuery = deferredFilter.trim()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-base px-2 py-[5px] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
          <Icon name="search" size={12} className="shrink-0 text-text-faint" />
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && filter) {
                event.stopPropagation()
                setFilter('')
              }
            }}
            placeholder="Search keys or values.."
            aria-label="Search JSON keys or values"
            className="w-full min-w-0 bg-transparent text-[length:var(--app-text-12)] text-text placeholder:text-text-muted outline-none"
          />
          {filter ? (
            <button
              type="button"
              className="icon-btn h-4 w-4 text-text-faint hover:text-text"
              aria-label="Clear Filter"
              onClick={() => setFilter('')}
            >
              <Icon name="x" size={11} />
            </button>
          ) : null}
        </div>
      </div>

      {!filteredResult.hasMatch ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <p className="py-4 text-center text-[length:var(--app-text-11)] text-text-faint">
            No matches for &quot;{displayedQuery}&quot;
          </p>
        </div>
      ) : (
        <pre
          ref={preRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 select-text leading-[calc(var(--json-font-size)+8px)] text-text"
          style={{ fontFamily: 'var(--json-font-family)', fontSize: 'var(--json-font-size)' }}
        >
          {visibleChunks.map((chunk, index) => (
            <JsonChunk key={index} chunk={chunk} />
          ))}
        </pre>
      )}
    </div>
  )
}
