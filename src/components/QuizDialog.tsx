import { useEffect, useRef, useState } from 'react'
import type { DrawnQuestion, Quiz, QuizResult } from '../quizzes'

interface Props {
  quiz: Quiz
  topicTitle: (topic: string) => string
  /** Fetches one attempt's questions (quiz_draw). */
  draw: () => Promise<DrawnQuestion[]>
  /** Grades and records the attempt on the server (quiz_submit). */
  submit: (answers: { question_id: string; chosen: string }[]) => Promise<QuizResult>
  /** Closes the quiz and opens the Learn page a missed question came from. */
  onReview: (topic: string) => void
  onClose: () => void
  /** Offered after a pass, e.g. the next module. */
  next?: { label: string; onClick: () => void }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

// A module quiz (issue #20). Written against the Quiz type and two server
// calls only, so the placement quiz (#14) can reuse it. A failed attempt
// names the topics to review but never the right answers; the server sends
// those only with a pass.
export function QuizDialog({ quiz, topicTitle, draw, submit, onReview, onClose, next }: Props) {
  const [questions, setQuestions] = useState<DrawnQuestion[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only the latest draw may fill the dialog, if an older request answers late.
  const drawId = useRef(0)

  function start() {
    setQuestions(null)
    setChosen({})
    setResult(null)
    setError(null)
    const id = ++drawId.current
    draw()
      .then((qs) => {
        if (id !== drawId.current) return
        if (qs.length) setQuestions(qs)
        else setError('This quiz has no questions yet. Please tell your instructor.')
      })
      .catch((err) => id === drawId.current && setError(message(err)))
    document.querySelector('.quiz-modal')?.scrollTo(0, 0)
  }

  // Draw once on open; "Try again" draws again. The parent passes a new
  // draw function on every render, so it must not be an effect dependency.
  useEffect(() => {
    start()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const answeredCount = questions?.filter((q) => chosen[q.id] !== undefined).length ?? 0

  async function handleSubmit() {
    if (!questions) return
    setBusy(true)
    setError(null)
    try {
      setResult(await submit(questions.map((q) => ({ question_id: q.id, chosen: chosen[q.id] }))))
      document.querySelector('.quiz-modal')?.scrollTo(0, 0)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal quiz-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
        <div className="modal-header">
          <h2 id="quiz-title">{quiz.title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <p className="feedback-error">Something went wrong: {error}</p>}
        {!questions && !error && <p className="status">Loading questions…</p>}

        {questions && !result && (
          <>
            <p className="example-description">{quiz.intro}</p>
            <ol className="quiz-questions">
              {questions.map((q) => (
                <li key={q.id}>
                  <p className="quiz-question">{q.question}</p>
                  {q.options.map((option) => (
                    <label key={option} className="quiz-option">
                      <input
                        type="radio"
                        name={`quiz-${q.id}`}
                        checked={chosen[q.id] === option}
                        onChange={() => setChosen((c) => ({ ...c, [q.id]: option }))}
                      />
                      {option}
                    </label>
                  ))}
                </li>
              ))}
            </ol>
            <div className="feedback-actions">
              <span className="path-count">{answeredCount} / {questions.length} answered</span>
              <button className="primary" onClick={handleSubmit} disabled={busy || answeredCount < questions.length}>
                {busy ? 'Checking…' : 'Submit answers'}
              </button>
            </div>
          </>
        )}

        {questions && result && !result.passed && (
          <>
            <p className="quiz-score fail">
              You scored {result.score}/{result.total}. You need {quiz.passCount} to pass. Review the topics below, then try again.
            </p>
            <ul className="quiz-review">
              {result.answers.map((a, k) => {
                if (a.correct) return null
                const topic = questions.find((q) => q.id === a.question_id)?.topic ?? ''
                return (
                  <li key={a.question_id}>
                    Question {k + 1} · Review:{' '}
                    <button className="link-button" onClick={() => onReview(topic)}>{topicTitle(topic)}</button>
                  </li>
                )
              })}
            </ul>
            <div className="feedback-actions">
              <button onClick={onClose}>Close</button>
              <button className="primary" onClick={start}>Try again</button>
            </div>
          </>
        )}

        {questions && result && result.passed && (
          <>
            <p className="quiz-score pass">
              You scored {result.score}/{result.total} and passed. {quiz.passNote}
            </p>
            <ol className="quiz-questions">
              {result.answers.map((a) => (
                <li key={a.question_id}>
                  <p className="quiz-question">{questions.find((q) => q.id === a.question_id)?.question}</p>
                  {a.correct ? (
                    <p className="quiz-answer correct">✓ {a.answer}</p>
                  ) : (
                    <p className="quiz-answer">
                      <span className="quiz-chosen">✗ You chose {a.chosen}.</span> Correct answer: {a.answer}
                    </p>
                  )}
                  <p className="example-description">{a.explanation}</p>
                </li>
              ))}
            </ol>
            <div className="feedback-actions">
              <button onClick={onClose}>Close</button>
              {next && <button className="primary" onClick={next.onClick}>{next.label}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
