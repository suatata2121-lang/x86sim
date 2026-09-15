import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { Decoration, EditorView, gutter, GutterMarker } from '@codemirror/view'
import { RangeSet } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { asmLanguage } from './asmLanguage'

const asmHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.keyword, color: '#569cd6', fontWeight: 'bold' },
  { tag: t.atom, color: '#4ec9b0' },
  { tag: t.meta, color: '#c586c0' },
  { tag: t.definition(t.variableName), color: '#dcdcaa', fontWeight: 'bold' },
  { tag: t.variableName, color: '#9cdcfe' },
])

const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      fontSize: '14px',
      border: '1px solid #3a3a3a',
      borderRadius: '6px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-content': {
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      caretColor: '#d4d4d4',
    },
    '.cm-gutters': {
      backgroundColor: '#181818',
      color: '#666',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-line.cm-current-line': { backgroundColor: '#2a3f2a' },
    '.cm-line.cm-error-line': { backgroundColor: '#4a1f1f' },
    '.cm-breakpoint-gutter': { width: '14px' },
    '.cm-breakpoint-gutter .cm-gutterElement': {
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    '.cm-bp-dot': {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      border: '1px solid #555',
    },
    '.cm-bp-dot.on': {
      background: '#e05555',
      borderColor: '#e05555',
    },
  },
  { dark: true },
)

function makeBreakpointMarker(on: boolean) {
  return new (class extends GutterMarker {
    toDOM() {
      const span = document.createElement('span')
      span.className = on ? 'cm-bp-dot on' : 'cm-bp-dot'
      return span
    }
  })()
}

const emptyMarker = makeBreakpointMarker(false)
const filledMarker = makeBreakpointMarker(true)

// Computes line-start character offsets directly from the plain source
// string (rather than a live CM6 document), so these extensions can be
// built once up front in React and handed to CodeMirror as ready-made,
// position-accurate range sets.
function lineOffsets(value: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\n') offsets.push(i + 1)
  }
  return offsets
}

function buildBreakpointGutter(value: string, breakpoints: Set<number>, onToggle: (line: number) => void) {
  const offsets = lineOffsets(value)
  const ranges = []
  for (const lineNo of [...breakpoints].sort((a, b) => a - b)) {
    const offset = offsets[lineNo - 1]
    if (offset === undefined) continue
    ranges.push(filledMarker.range(offset))
  }
  const markerSet = RangeSet.of(ranges, true)
  return gutter({
    class: 'cm-breakpoint-gutter',
    markers: () => markerSet,
    initialSpacer: () => emptyMarker,
    domEventHandlers: {
      mousedown(view, line) {
        onToggle(view.state.doc.lineAt(line.from).number)
        return true
      },
    },
  })
}

function buildLineHighlights(value: string, currentLine: number | null, errorLines: Set<number> | undefined) {
  const offsets = lineOffsets(value)
  const ranges = []
  const total = offsets.length
  for (let lineNo = 1; lineNo <= total; lineNo++) {
    const classes: string[] = []
    if (errorLines?.has(lineNo)) classes.push('cm-error-line')
    if (currentLine === lineNo) classes.push('cm-current-line')
    if (classes.length === 0) continue
    const offset = offsets[lineNo - 1]
    ranges.push(Decoration.line({ class: classes.join(' ') }).range(offset))
  }
  return EditorView.decorations.of(RangeSet.of(ranges, true))
}

export function CodeEditor({
  value,
  onChange,
  breakpoints,
  onToggleBreakpoint,
  currentLine,
  errorLines,
}: {
  value: string
  onChange: (value: string) => void
  breakpoints: Set<number>
  onToggleBreakpoint: (line: number) => void
  currentLine: number | null
  errorLines?: Set<number>
}) {
  const extensions = useMemo(
    () => [
      asmLanguage,
      syntaxHighlighting(asmHighlightStyle),
      buildBreakpointGutter(value, breakpoints, onToggleBreakpoint),
      buildLineHighlights(value, currentLine, errorLines),
      editorTheme,
    ],
    [value, breakpoints, onToggleBreakpoint, currentLine, errorLines],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      minHeight="320px"
      maxHeight="600px"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        closeBrackets: true,
        bracketMatching: true,
        history: true,
      }}
    />
  )
}
