import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { Decoration, EditorView, gutter, GutterMarker } from '@codemirror/view'
import { RangeSet } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { asmLanguage } from './asmLanguage'

const asmHighlightStyleDark = HighlightStyle.define([
  { tag: t.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: t.string, color: '#ce9178' },
  { tag: t.number, color: '#b5cea8' },
  { tag: t.keyword, color: '#569cd6', fontWeight: 'bold' },
  { tag: t.atom, color: '#4ec9b0' },
  { tag: t.meta, color: '#c586c0' },
  { tag: t.definition(t.variableName), color: '#dcdcaa', fontWeight: 'bold' },
  { tag: t.variableName, color: '#9cdcfe' },
])

const asmHighlightStyleLight = HighlightStyle.define([
  { tag: t.comment, color: '#008000', fontStyle: 'italic' },
  { tag: t.string, color: '#a31515' },
  { tag: t.number, color: '#098658' },
  { tag: t.keyword, color: '#0000ff', fontWeight: 'bold' },
  { tag: t.atom, color: '#267f99' },
  { tag: t.meta, color: '#af00db' },
  { tag: t.definition(t.variableName), color: '#795e26', fontWeight: 'bold' },
  { tag: t.variableName, color: '#001080' },
])

function makeEditorTheme(dark: boolean) {
  const c = dark
    ? {
        bg: '#1e1e1e', fg: '#d4d4d4', border: '#3a3a3a',
        gutterBg: '#181818', gutterFg: '#666',
        currentLine: '#2a3f2a', errorLine: '#4a1f1f',
        bpDotBorder: '#555', bpDotOn: '#e05555',
      }
    : {
        bg: '#ffffff', fg: '#1a1a1a', border: '#d5d5d5',
        gutterBg: '#f0f0f0', gutterFg: '#888888',
        currentLine: '#d9f2d9', errorLine: '#fbdcdc',
        bpDotBorder: '#aaaaaa', bpDotOn: '#d13b3b',
      }
  return EditorView.theme(
    {
      '&': {
        backgroundColor: c.bg,
        color: c.fg,
        fontSize: '14px',
        border: `1px solid ${c.border}`,
        borderRadius: '6px',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-content': {
        fontFamily: "'Cascadia Code', 'Consolas', monospace",
        caretColor: c.fg,
      },
      '.cm-gutters': {
        backgroundColor: c.gutterBg,
        color: c.gutterFg,
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-line.cm-current-line': { backgroundColor: c.currentLine },
      '.cm-line.cm-error-line': { backgroundColor: c.errorLine },
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
        border: `1px solid ${c.bpDotBorder}`,
      },
      '.cm-bp-dot.on': {
        background: c.bpDotOn,
        borderColor: c.bpDotOn,
      },
    },
    { dark },
  )
}

const editorThemeDark = makeEditorTheme(true)
const editorThemeLight = makeEditorTheme(false)

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
  theme = 'dark',
}: {
  value: string
  onChange: (value: string) => void
  breakpoints: Set<number>
  onToggleBreakpoint: (line: number) => void
  currentLine: number | null
  errorLines?: Set<number>
  theme?: 'light' | 'dark'
}) {
  const extensions = useMemo(
    () => [
      asmLanguage,
      syntaxHighlighting(theme === 'dark' ? asmHighlightStyleDark : asmHighlightStyleLight),
      buildBreakpointGutter(value, breakpoints, onToggleBreakpoint),
      buildLineHighlights(value, currentLine, errorLines),
      theme === 'dark' ? editorThemeDark : editorThemeLight,
    ],
    [value, breakpoints, onToggleBreakpoint, currentLine, errorLines, theme],
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
