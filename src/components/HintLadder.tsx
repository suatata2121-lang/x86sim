import type { ReactNode } from 'react'

const STEP_LABELS = ['1 · Direction', '2 · Similar example', '3 · Partial solution']

/** Renders the little markup hints use: **bold** and `code`. */
function hintText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

// Shown under the test results once a student has failed Run Tests a few
// times (#12): each click opens the next step, and open steps stay open.
export function HintLadder({ hints, level, onReveal }: {
  hints: [string, string, string]
  level: number
  onReveal: () => void
}) {
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
      ) : (
        <p className="example-description">That was the last hint.</p>
      )}
    </div>
  )
}
