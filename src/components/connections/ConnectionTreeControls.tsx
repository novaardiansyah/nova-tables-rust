import React, { DragEvent } from 'react'
import Icon from '../common/Icon'

export interface DragHandleProps {
  title: string
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd: (event: DragEvent<HTMLButtonElement>) => void
}

export function DragHandle({ title, onDragStart, onDragEnd }: DragHandleProps) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={title}
      aria-label={title}
      className="icon-btn h-6 w-6 cursor-grab text-text-faint hover:text-text active:cursor-grabbing"
    >
      <Icon name="grip" size={12} />
    </button>
  )
}

export interface DropLineProps {
  depth: number
}

export function DropLine({ depth }: DropLineProps) {
  return (
    <div style={{ marginLeft: depth * 14 + 8 }} className="mr-2 h-0.5 rounded-full bg-accent" />
  )
}

export interface SelectBoxProps {
  checked: boolean
  active?: boolean
  label: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function SelectBox({ checked, active, label, onClick }: SelectBoxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-all duration-150 ${
        checked
          ? 'border-accent bg-accent text-on-accent'
          : `border-line-strong text-transparent hover:border-accent/70 ${
              active
                ? 'opacity-60 hover:opacity-100'
                : 'opacity-0 group-hover/row:opacity-60 focus-visible:opacity-100'
            }`
      }`}
    >
      <Icon name="check" size={9} strokeWidth={3} />
    </button>
  )
}
