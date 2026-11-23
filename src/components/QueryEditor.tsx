import React, { useEffect, useRef, useState } from 'react'
import Editor, { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { editorThemeName } from '@/monaco'
import { CompletionCatalog, setCompletionCatalog } from '@/completions'
import { queryFontOptions, Settings, subscribeSettings } from '@/settings'
import { Spinner } from '@/components/common/Icon'
import ContextMenu from '@/components/common/ContextMenu'
import { api } from '@/api'

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  contextmenu: false,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  renderLineHighlight: 'line',
  lineNumbersMinChars: 3,
  folding: true,
  glyphMargin: false,
  bracketPairColorization: { enabled: true },
  padding: { top: 12, bottom: 12 },
  wordWrap: 'off',
  tabSize: 2,
  automaticLayout: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  quickSuggestions: { other: true, strings: false, comments: false },
  suggestOnTriggerCharacters: true,
  wordBasedSuggestions: 'off',
  parameterHints: { enabled: true },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderWhitespace: 'none',
  fixedOverflowWidgets: true,
}

export interface QueryEditorSeed {
  id: string | number
  value: string
  focus?: boolean
}

export interface QueryEditorControl {
  clearSelection: () => void
}

export interface QueryEditorProps {
  seed: QueryEditorSeed
  theme?: string
  settings?: Settings | null
  catalog?: CompletionCatalog | null
  onChange?: (value: string) => void
  onRun?: () => void
  onSelectionChange?: (selectedText: string) => void
  controlRef?: React.MutableRefObject<QueryEditorControl | null>
}

export default function QueryEditor({
  seed,
  theme,
  settings,
  catalog,
  onChange,
  onRun,
  onSelectionChange,
  controlRef,
}: QueryEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const handlersRef = useRef({ onChange, onRun, onSelectionChange })
  const lastSeedRef = useRef<string | number | null>(null)
  const seedingRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const { fontFamily, fontSize, lineHeight, wordWrap } = queryFontOptions(settings)

  useEffect(() => {
    handlersRef.current = { onChange, onRun, onSelectionChange }
  }, [onChange, onRun, onSelectionChange])

  useEffect(() => {
    editorRef.current?.updateOptions({ fontFamily, fontSize, lineHeight, wordWrap })
  }, [fontFamily, fontSize, lineHeight, wordWrap])

  useEffect(
    () =>
      subscribeSettings((next) => {
        const options = queryFontOptions(next)
        editorRef.current?.updateOptions(options)
      }),
    [],
  )

  useEffect(() => {
    setCompletionCatalog(catalog || null)
  }, [catalog])

  useEffect(() => {
    if (!controlRef) return undefined
    controlRef.current = {
      clearSelection: () => {
        const editor = editorRef.current
        const selection = editor?.getSelection()
        if (!editor || !selection) return
        editor.setSelection({
          startLineNumber: selection.positionLineNumber,
          startColumn: selection.positionColumn,
          endLineNumber: selection.positionLineNumber,
          endColumn: selection.positionColumn,
        })
      },
    }
    return () => {
      controlRef.current = null
    }
  }, [controlRef])

  useEffect(() => {
    if (lastSeedRef.current === null || lastSeedRef.current === seed.id) {
      lastSeedRef.current = seed.id
      return
    }
    lastSeedRef.current = seed.id

    const editor = editorRef.current
    if (!editor) return
    seedingRef.current = true
    editor.setValue(seed.value)
    seedingRef.current = false
    editor.setPosition({ lineNumber: 1, column: 1 })
    if (seed.focus !== false) editor.focus()
  }, [seed])

  function handleMount(editor: editor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = editor
    editor.addAction({
      id: 'nova.runQuery',
      label: 'Run query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, monaco.KeyCode.F5],
      run: () => handlersRef.current.onRun?.(),
    })
    editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel()
      const text = model ? model.getValueInRange(event.selection).trim() : ''
      handlersRef.current.onSelectionChange?.(text)
    })
    editor.focus()
  }

  async function runClipboardAction(actionId: string) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()

    if (actionId === 'paste') {
      try {
        const text = await navigator.clipboard.readText()
        editor.focus()
        editor.trigger('clipboard', 'paste', { text })
      } catch (error) {
        console.error('Unable to read text from the clipboard.', error)
      }
      return
    }

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection || selection.isEmpty()) return

    const selectedText = model.getValueInRange(selection)
    const modelVersion = model.getVersionId()
    const copied = await api.copyText(selectedText)
    if (!copied) {
      console.error('Unable to write the selected text to the clipboard.')
      return
    }

    if (actionId === 'cut') {
      if (editor.getModel() !== model || model.getVersionId() !== modelVersion) return
      const cursor = selection.getStartPosition()
      if (!editor.executeEdits('nova.clipboard.cut', [{ range: selection, text: '' }])) {
        console.error('Unable to remove the selected text from the editor.')
        return
      }
      editor.setPosition(cursor)
      editor.focus()
    }
  }

  return (
    <div
      className="h-full w-full"
      onContextMenu={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.monaco-editor')) return
        event.preventDefault()
        setContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <Editor
        language="sql"
        theme={editorThemeName(theme || 'light-nova')}
        defaultValue={seed.value}
        onMount={handleMount}
        onChange={(value) => {
          if (seedingRef.current) return
          handlersRef.current.onChange?.(value ?? '')
        }}
        options={{ ...EDITOR_OPTIONS, fontFamily, fontSize, lineHeight, wordWrap }}
        loading={
          <div className="flex items-center gap-2 p-4 text-[length:var(--app-text-12)] text-text-muted">
            <Spinner size={13} />
            Loading editor…
          </div>
        }
      />
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: 'copy',
              label: 'Copy',
              onSelect: () => runClipboardAction('copy'),
            },
            {
              id: 'cut',
              label: 'Cut',
              onSelect: () => runClipboardAction('cut'),
            },
            {
              id: 'paste',
              label: 'Paste',
              onSelect: () => runClipboardAction('paste'),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  )
}
