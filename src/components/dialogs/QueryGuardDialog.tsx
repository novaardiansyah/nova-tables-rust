import { useEffect, useState } from 'react'
import { monaco } from '@/monaco'
import ConfirmDialog from '@/components/common/ConfirmDialog'

export interface QueryGuardDialogProps {
  open: boolean
  sql?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export default function QueryGuardDialog({ open, sql, onCancel, onConfirm }: QueryGuardDialogProps) {
  const text = String(sql || '').trim()
  const [highlighted, setHighlighted] = useState<{ text: string; html: string | null }>({ text: '', html: null })

  useEffect(() => {
    if (!open || !text) return undefined
    let active = true

    monaco.editor
      .colorize(text, 'sql', { tabSize: 2 })
      .then((html) => {
        if (active) setHighlighted({ text, html })
      })
      .catch(() => {
        if (active) setHighlighted({ text, html: null })
      })

    return () => {
      active = false
    }
  }, [open, text])

  if (!open) return null

  return (
    <ConfirmDialog
      open={open}
      title="Send query to the server?"
      detail={text}
      detailHtml={highlighted.text === text ? highlighted.html : null}
      confirmLabel="Send"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
