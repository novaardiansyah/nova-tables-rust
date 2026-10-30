import React, { useEffect, useRef, useState } from 'react'

export interface MenuBarItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  onSelect: () => void
}

export interface MenuBarMenu {
  id: string
  label: string
  items: MenuBarItem[]
}

export interface MenuBarProps {
  menus: MenuBarMenu[]
}

export default function MenuBar({ menus }: MenuBarProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openId) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenId(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openId])

  return (
    <div
      ref={barRef}
      className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2"
    >
      {menus.map((menu) => {
        const open = openId === menu.id
        return (
          <div key={menu.id} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : menu.id)}
              onMouseEnter={() => {
                if (openId) setOpenId(menu.id)
              }}
              className={`h-6 rounded px-2 text-[length:var(--app-text-12)] transition-colors ${
                open ? 'bg-tint/[0.08] text-text-strong' : 'text-text-soft hover:bg-tint/[0.05] hover:text-text'
              }`}
            >
              {menu.label}
            </button>

            {open ? (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[220px] animate-fade-in rounded-lg border border-line-strong bg-elevated py-1 shadow-xl shadow-black/50"
              >
                {menu.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpenId(null)
                      item.onSelect()
                    }}
                    className="flex w-full items-center gap-6 px-3 py-[5px] text-left text-[length:var(--app-text-12)] text-text transition-colors hover:bg-tint/[0.06] hover:text-text-strong disabled:pointer-events-none disabled:text-text-faint"
                  >
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut ? (
                      <span className="shrink-0 font-mono text-[length:var(--app-text-10)] text-text-faint">
                        {item.shortcut}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
