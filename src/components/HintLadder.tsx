import { useState, type ReactNode } from 'react'

const STEP_LABELS = ['1 · Direction', '2 · Similar example', '3 · Partial solution']

/** Renders the little markup hints use: **bold** and `code`. */
function hintText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

// A worked solution's lines that are nothing but `code` run together into
// one code block; the rest stay paragraphs.
function solutionBlocks(lines: string[]): (string | string[])[] {
  const blocks: (string | string[])[] = []
  for (const line of lines) {
    const code = /^`([^`]+)`$/.exec(line)
    const last = blocks[blocks.length - 1]
    if (!code) blocks.push(line)
    else if (Array.isArray(last)) last.push(code[1])
    else blocks.push([code[1]])
  }
  return blocks
}

// Shown under the test results once a student has failed Run Tests a few
// times (#12): each click opens the next step, and open steps stay open.
export function HintLadder({ hints, level, onReveal, solution, solutionReady, onSolutionViewed }: {
  hints: [string, string, string]
  level: number
  onReveal: () => void
  /** The task's worked solution, if it has one (#103). */
  solution?: string[]
  /** Every hint is open and enough runs have failed to offer it. */
  solutionReady?: boolean
  onSolutionViewed?: () => void
}) {
  const [solutionOpen, setSolutionOpen] = useState(false)
  return (
    <div className="panel hint-ladder">
      <h3>Hints</h3>
      {level > 0 && (
        <ol className="hint-steps">
          {hints.slice(0, level).map((h, i) => (
            <li key={i}>
              <span className="hint-step-label">{STEP_LABELS[i]}</span>
              <span>{hintText(h)}</span>
            </li>
          ))}
        </ol>
      )}
      {level < 3 ? (
        <button onClick={onReveal}>Show a hint</button>
      ) : !solution || !solutionReady ? (
        <p className="example-description">That was the last hint.</p>
      ) : !solutionOpen ? (
        <button
          onClick={() => {
            setSolutionOpen(true)
            onSolutionViewed?.()
          }}
        >
          Show a worked solution
        </button>
      ) : (
        <div className="worked-solution">
          <p className="example-description">
            You've used every hint. Here is one way to solve it. Read it, then write your own version and run the tests.
          </p>
          {solutionBlocks(solution).map((b, i) =>
            typeof b === 'string' ? <p key={i}>{hintText(b)}</p> : <pre key={i} className="instr-example">{b.join('\n')}</pre>)}
        </div>
      )}
    </div>
  )
}
