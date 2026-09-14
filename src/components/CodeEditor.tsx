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
  const lineCount = value.split('\n').length

  return (
    <div className="code-editor">
      <div className="code-gutter">
        {Array.from({ length: lineCount }, (_, i) => {
          const lineNo = i + 1
          const classes = ['gutter-line']
          if (currentLine === lineNo) classes.push('gutter-current')
          if (errorLines?.has(lineNo)) classes.push('gutter-error')
          return (
            <div
              key={lineNo}
              className={classes.join(' ')}
              onClick={() => onToggleBreakpoint(lineNo)}
              title="Kesme noktasını aç/kapat"
            >
              <span className={breakpoints.has(lineNo) ? 'bp-dot on' : 'bp-dot'} />
              <span className="gutter-num">{lineNo}</span>
            </div>
          )
        })}
      </div>
      <textarea
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(16, lineCount + 1)}
      />
    </div>
  )
}
