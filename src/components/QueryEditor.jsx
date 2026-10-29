import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { editorThemeName } from '../monaco.js'
import { setCompletionCatalog } from '../completions.js'
import { queryFontOptions, subscribeSettings } from '../settings.js'
import { Spinner } from './common/Icon.jsx'

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
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
  parameterHints: { enabled: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderWhitespace: 'none',
  fixedOverflowWidgets: true,
}

export default function QueryEditor({
  seed,
  theme,
  settings,
  catalog,
  onChange,
  onRun,
  onSelectionChange,
}) {
  const editorRef = useRef(null)
  const handlersRef = useRef({ onChange, onRun, onSelectionChange })
  const lastSeedRef = useRef(null)
  const seedingRef = useRef(false)
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

  function handleMount(editor, monaco) {
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

  return (
    <div className="h-full w-full">
      <Editor
        language="sql"
        theme={editorThemeName(theme)}
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
    </div>
  )
}
