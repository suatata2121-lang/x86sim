import { useEffect, useMemo, useState } from 'react'
import { checkAnswer, formatAnswer, predictAnswer, type PredictQuestion, type PredictValue } from '../core/predict'

interface Props {
  title: string
  questions: PredictQuestion[]
  /** Question ids answered before (right or wrong), e.g. on another visit. */
  answered: Set<string>
  onAnswer: (questionId: string, answer: string, correct: boolean) => void
  /** Opens a 'run' question's code in a new editor tab so the student can Step through it. */
  onTryInEditor: (code: string) => void
  onClose: () => void
  /** Offered once every question has an answer, e.g. "Continue: Task". */
  next?: { label: string; onClick: () => void }
}

type Result = { correct: boolean; shown: string }

/** One question with its answer box; also used by the placement quiz (#14). */
export function QuestionCard({ n, q, answeredBefore = false, once = false, onAnswer, onTryInEditor }: {
  n: number
  q: PredictQuestion
  answeredBefore?: boolean
  /** Only the first answer counts (placement): the card locks after Check. */
  once?: boolean
  onAnswer: (answer: string, correct: boolean) => void
  onTryInEditor?: (code: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  // A 'run' question's key comes from the simulator, never from the data.
  const expected: PredictValue | null = useMemo(() => (q.kind === 'run' ? predictAnswer(q) : null), [q])

  const locked = once && result !== null

  function check(answer: string) {
    if (locked) return
    if (q.kind === 'run') {
      const correct = checkAnswer(expected as PredictValue, answer)
      setResult({ correct, shown: formatAnswer(expected as PredictValue) })
      onAnswer(answer, correct)
    } else {
      const i = q.options.indexOf(answer)
      const correct = i === q.answer
      setResult({ correct, shown: q.options[q.answer] })
      onAnswer(answer, correct)
    }
  }

  return (
    <li className={`predict-card${result ? (result.correct ? ' right' : ' wrong') : ''}`}>
      <p className="quiz-question">
        <strong>{n}.</strong> {q.question}
        {answeredBefore && !result && <span className="admin-badge passed">answered</span>}
      </p>
      {q.code && <pre className="instr-example quiz-code">{q.code}</pre>}
      {q.kind === 'run' ? (
        <form
          className="predict-answer"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) check(typed)
          }}
        >
          <input
            className="mb-address"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Your prediction"
            spellCheck={false}
            disabled={locked}
          />
          <button type="submit" disabled={!typed.trim() || locked}>Check</button>
          {onTryInEditor && <button type="button" onClick={() => onTryInEditor(q.code)}>Try it in the editor</button>}
        </form>
      ) : (
        <div className="mb-options">
          {q.options.map((o) => (
            <button key={o} onClick={() => check(o)} disabled={locked}>{o}</button>
          ))}
        </div>
      )}
      {result && (
        <p className={result.correct ? 'mb-feedback-right' : 'moveit-error'}>
          {result.correct ? 'Correct.' : 'Not quite.'} The answer is <strong>{result.shown}</strong>.
          {q.kind === 'run' && !result.correct && onTryInEditor && ' Try it in the editor and Step through it to see why.'}
        </p>
      )}
    </li>
  )
}

// The Predict step (issue #11): think, then run, then compare. Every Check
// is recorded; the step is done once each question has been answered once,
// right or wrong -- a wrong guess is useful information, not a failure.
export function PredictDialog({ title, questions, answered, onAnswer, onTryInEditor, onClose, next }: Props) {
  const [answeredHere, setAnsweredHere] = useState<Set<string>>(new Set())
  const allAnswered = questions.every((q) => answered.has(q.id) || answeredHere.has(q.id))

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal quiz-modal" role="dialog" aria-modal="true" aria-labelledby="predict-title">
        <div className="modal-header">
          <h2 id="predict-title">Predict: {title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="example-description">
          Work out each answer in your head first, then Check it. Numbers can be written in decimal, hex (0FDh, 0xFD)
          or binary (11111101b). Wrong guesses are fine: they show what to look at again.
        </p>
        <ol className="quiz-questions predict-questions">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              n={i + 1}
              q={q}
              answeredBefore={answered.has(q.id)}
              onAnswer={(answer, correct) => {
                setAnsweredHere((s) => new Set(s).add(q.id))
                onAnswer(q.id, answer, correct)
              }}
              onTryInEditor={onTryInEditor}
            />
          ))}
        </ol>
        <div className="feedback-actions">
          <button onClick={onClose}>Close</button>
          {next && (
            <button className="primary" disabled={!allAnswered} onClick={next.onClick} title={allAnswered ? undefined : 'Answer every question first'}>
              {next.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
