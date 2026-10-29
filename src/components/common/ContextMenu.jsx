import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const EDGE = 8

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    setPosition({
      left: Math.min(x, window.innerWidth - width - EDGE),
      top: Math.min(y, window.innerHeight - height - EDGE),
    })
  }, [x, y])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose()
    }
    const handleKeyDown = (event) => {
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

function MenuItem({ item, onClose }) {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const subRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !subRef.current) return
    const { right } = subRef.current.getBoundingClientRect()
    setFlip(right > window.innerWidth - EDGE)
  }, [open])

  const children = item.children ?? []

  if (!children.length) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          item.onSelect?.()
          onClose()
        }}
        className="flex w-full items-center px-3 py-[5px] text-left text-[length:var(--app-text-12)] text-text hover:bg-tint/[0.06] hover:text-text-strong"
      >
        {item.label}
      </button>
    )
  }

  return (
    <div
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
          className={`absolute top-0 min-w-[176px] rounded-lg border border-line-strong bg-elevated py-1 shadow-xl shadow-black/50 ${
            flip ? 'right-full mr-1' : 'left-full ml-1'
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
