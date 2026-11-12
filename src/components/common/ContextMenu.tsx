import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const EDGE = 8

export interface ContextMenuItemData {
  id: string
  label: string
  onSelect?: () => void
  disabled?: boolean
  children?: ContextMenuItemData[]
}

export type ContextMenuItem = ContextMenuItemData

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItemData[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(EDGE, Math.min(x, document.documentElement.clientWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, document.documentElement.clientHeight - height - EDGE)),
    })
  }, [x, y])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    window.addEventListener('scroll', onClose, true)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-[188px] rounded-lg border border-line-strong bg-elevated py-1 shadow-xl shadow-black/50"
    >
      {items.map((item) => (
        <MenuItem key={item.id} item={item} onClose={onClose} />
      ))}
    </div>
  )
}

function MenuItem({ item, onClose }: { item: ContextMenuItemData; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const [subStyle, setSubStyle] = useState<React.CSSProperties>({})
  const itemRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !itemRef.current) return
    const itemRect = itemRef.current.getBoundingClientRect()
    const clientW = document.documentElement.clientWidth
    const clientH = document.documentElement.clientHeight
    const subW = subRef.current?.offsetWidth ?? 176
    const subH = subRef.current?.offsetHeight ?? 100

    const spaceOnRight = clientW - itemRect.right
    const spaceOnLeft = itemRect.left
    const shouldFlip = spaceOnRight < subW + EDGE || (spaceOnLeft > spaceOnRight && spaceOnRight < 200)
    setFlip(shouldFlip)

    const overflowBottom = itemRect.top + subH - (clientH - EDGE)
    if (overflowBottom > 0) {
      setSubStyle({ top: -Math.min(overflowBottom, Math.max(0, itemRect.top - EDGE)) })
    } else {
      setSubStyle({})
    }
  }, [open])

  const children = item.children ?? []

  if (!children.length) {
    return (
      <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={() => {
          if (item.disabled) return
          item.onSelect?.()
          onClose()
        }}
        className={`flex w-full items-center px-3 py-[5px] text-left text-[length:var(--app-text-12)] ${
          item.disabled
            ? 'cursor-not-allowed opacity-40 text-text-muted'
            : 'text-text hover:bg-tint/[0.06] hover:text-text-strong'
        }`}
      >
        {item.label}
      </button>
    )
  }

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 px-3 py-[5px] text-left text-[length:var(--app-text-12)] text-text hover:bg-tint/[0.06] hover:text-text-strong"
      >
        {item.label}
        <span className="ml-auto text-text-faint">›</span>
      </button>
      {open ? (
        <div
          ref={subRef}
          style={subStyle}
          className={`absolute top-0 min-w-[176px] rounded-lg border border-line-strong bg-elevated py-1 shadow-xl shadow-black/50 before:absolute before:top-0 before:bottom-0 before:w-2 before:content-[''] ${
            flip ? 'right-full mr-1 before:-right-2' : 'left-full ml-1 before:-left-2'
          }`}
        >
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              role="menuitem"
              onClick={() => {
                child.onSelect?.()
                onClose()
              }}
              className="flex w-full items-center px-3 py-[5px] text-left text-[length:var(--app-text-12)] text-text hover:bg-tint/[0.06] hover:text-text-strong"
            >
              {child.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
