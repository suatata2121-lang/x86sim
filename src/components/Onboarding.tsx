// First sign-in (#14): a four-step tour of the tools on the Hello World
// example, then an 8-question placement quiz. 6 or more lets the student
// start at Module 1; they can always choose to start from the beginning.
import { useEffect, useLayoutEffect, useState } from 'react'
import { PLACEMENT_PASS, PLACEMENT_QUESTIONS } from '../placement'
import { QuestionCard } from './PredictDialog'

const buttonWithText = (text: string) => () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) ?? null

const TOUR: { text: string; target: () => Element | null }[] = [
  { text: 'This is the editor. You write 8086 assembly here.', target: () => document.querySelector('.cm-editor') },
  { text: 'Assemble checks your code and loads it into the simulated CPU.', target: buttonWithText('Assemble') },
  { text: 'Step runs one instruction. Step Back undoes it.', target: buttonWithText('Step ▶') },
  {
    text: 'The Registers panel shows every register after each step, in hex, decimal and binary.',
    target: () => document.querySelector('aside') ?? buttonWithText('Registers')(),
  },
]

export function Tour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Follow the highlighted element when the page scrolls or resizes.
  useLayoutEffect(() => {
    function measure() {
      const el = TOUR[step].target()
      if (el) el.scrollIntoView({ block: 'nearest' })
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  const last = step === TOUR.length - 1
  const pad = 6
  // The callout sits under the element, or above it when there's no room.
  const below = !rect || rect.bottom + 160 < window.innerHeight
  const top = rect ? (below ? rect.bottom + pad + 8 : Math.max(8, rect.top - pad - 150)) : window.innerHeight / 3
  const left = rect ? Math.min(Math.max(8, rect.left), window.innerWidth - 340) : window.innerWidth / 2 - 160

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Tour">
      {rect && (
        <div
          className="tour-highlight"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div className="tour-callout" style={{ top, left }}>
        <p className="tour-count">Step {step + 1} of {TOUR.length}</p>
        <p>{TOUR[step].text}</p>
        <div className="feedback-actions">
          <button onClick={onDone}>Skip tour</button>
          <button className="primary" autoFocus onClick={() => (last ? onDone() : setStep((s) => s + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlacementDialog({ onFinish }: {
  /** score is null when the quiz was skipped; credit means "start me at Module 1". */
  onFinish: (score: number | null, credit: boolean) => void
}) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const done = PLACEMENT_QUESTIONS.every((q) => q.id in answers)
  const score = Object.values(answers).filter(Boolean).length
  const passed = score >= PLACEMENT_PASS

  useEffect(() => {
    if (done) document.querySelector('.placement-result')?.scrollIntoView({ block: 'nearest' })
  }, [done])

  return (
    <div className="modal-backdrop">
      <div className="modal quiz-modal" role="dialog" aria-modal="true" aria-labelledby="placement-title">
        <div className="modal-header">
          <h2 id="placement-title">Where should you start?</h2>
        </div>
        <p className="example-description">
          Eight quick questions. If you already know number systems, you can skip Module 0 and start at Module 1.
          Numbers can be written in decimal, hex (0FDh) or binary (11111101b).
        </p>
        <ol className="quiz-questions predict-questions">
          {PLACEMENT_QUESTIONS.map((q, i) => (
            <QuestionCard
              key={q.id}
              n={i + 1}
              q={q}
              once
              onAnswer={(_, correct) => setAnswers((a) => (q.id in a ? a : { ...a, [q.id]: correct }))}
            />
          ))}
        </ol>
        {done ? (
          <div className="placement-result">
            <p className={`quiz-score${passed ? ' pass' : ''}`}>
              You scored {score}/{PLACEMENT_QUESTIONS.length}. We'll start you at{' '}
              {passed ? 'Module 1: The CPU and Its Registers' : 'Module 0: Number Systems'}.
            </p>
            <div className="feedback-actions">
              {passed && <button onClick={() => onFinish(score, false)}>Start from the beginning instead</button>}
              <button className="primary" onClick={() => onFinish(score, passed)}>Continue</button>
            </div>
          </div>
        ) : (
          <div className="feedback-actions">
            <button onClick={() => onFinish(null, false)}>Start from the beginning</button>
          </div>
        )}
      </div>
    </div>
  )
}
