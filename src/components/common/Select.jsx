import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

export default function Select({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  buttonClassName = '',
  icon = 'database',
  placeholder = 'Select database',
  emptyLabel = 'No databases',
  panelAlign = 'left',
  panelClassName = 'w-64',
  searchable = false,
  searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openUpward, setOpenUpward] = useState(false)
  const [coords, setCoords] = useState(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef(null)
  const panelRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  const updateCoords = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const upward = spaceBelow < 250 && spaceAbove > spaceBelow
    const maxLeft = Math.max(8, window.innerWidth - 270)
    const maxRight = Math.max(8, window.innerWidth - 270)
    setOpenUpward(upward)
    setCoords({
      top: upward ? undefined : rect.bottom + 4,
      bottom: upward ? window.innerHeight - rect.top + 4 : undefined,
      left: panelAlign === 'right' ? undefined : Math.max(8, Math.min(rect.left, maxLeft)),
      right: panelAlign === 'right' ? Math.max(8, Math.min(window.innerWidth - rect.right, maxRight)) : undefined,
      minWidth: rect.width,
      maxHeight: Math.max(120, Math.min(240, (upward ? spaceAbove : spaceBelow) - 16)),
    })
  }, [panelAlign])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    updateCoords()
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setHighlightedIndex(0)
      return
    }

    if (searchable) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [open, searchable])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const handleScroll = (event) => {
      if (panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const handleResize = () => setOpen(false)

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  const current = options.find((option) => option.value === value)
  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!searchable || !query) return options
    return options.filter(
      (option) =>
        option.label?.toLowerCase().includes(query) ||
        String(option.value).toLowerCase().includes(query),
    )
  }, [searchable, query, options])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [search])

  useEffect(() => {
    if (!open || !searchable) return
    const listEl = listRef.current
    if (listEl && listEl.children[highlightedIndex]) {
      listEl.children[highlightedIndex].scrollIntoView?.({ block: 'nearest' })
    }
  }, [highlightedIndex, open, searchable])

  const buttonWidthClass = buttonClassName || (className ? 'w-full' : 'w-full max-w-[240px]')

  const panelContent = open && coords ? (
    <div
      ref={panelRef}
      style={{
        top: coords.top !== undefined ? `${coords.top}px` : undefined,
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
        left: coords.left !== undefined ? `${coords.left}px` : undefined,
        right: coords.right !== undefined ? `${coords.right}px` : undefined,
        minWidth: `${coords.minWidth}px`,
        maxHeight: `${coords.maxHeight}px`,
      }}
      className={`fixed z-50 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-elevated shadow-2xl shadow-black/60 ${
        openUpward ? 'origin-bottom' : 'origin-top'
      } ${panelClassName}`}
    >
      {searchable ? (
        <div className="shrink-0 border-b border-line bg-elevated p-1.5">
          <div className="flex items-center gap-1.5 rounded border border-line bg-panel px-2 py-1 transition-colors focus-within:border-accent/70">
            <Icon name="search" size={11} className="shrink-0 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlightedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : prev))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (filtered[highlightedIndex]) {
                    onChange(filtered[highlightedIndex].value)
                    setOpen(false)
                  }
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setOpen(false)
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[length:var(--app-text-11)] text-text outline-none placeholder:text-text-faint"
            />
            {search ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setSearch('')
                  searchInputRef.current?.focus()
                }}
                className="text-text-faint hover:text-text"
                title="Clear search"
              >
                <Icon name="x" size={10} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[length:var(--app-text-12)] text-text-muted">
            {searchable && query ? 'No matches' : emptyLabel}
          </p>
        ) : (
          filtered.map((option, index) => {
            const isSelected = option.value === value
            const isHighlighted = searchable && index === highlightedIndex

            return (
              <button
                key={option.value}
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[length:var(--app-text-12)] transition-colors ${
                  isSelected
                    ? 'bg-accent/15 text-accent font-medium'
                    : isHighlighted
                    ? 'bg-tint/[0.08] text-text'
                    : 'text-text hover:bg-tint/[0.05]'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Icon name="check-circle" size={13} /> : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  ) : null

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) updateCoords()
          setOpen((prev) => !prev)
        }}
        className={`flex h-8 items-center gap-2 rounded-md border border-line-strong bg-elevated px-2.5 text-[length:var(--app-text-12)] text-text transition-colors hover:border-accent/50 disabled:pointer-events-none disabled:opacity-50 ${buttonWidthClass}`}
      >
        <Icon name={icon} size={13} className="shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? value ?? placeholder}</span>
        <Icon
          name="chevron-down"
          size={13}
          className={`ml-auto shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {panelContent && typeof document !== 'undefined'
        ? createPortal(panelContent, document.body)
        : null}
    </div>
  )
}
