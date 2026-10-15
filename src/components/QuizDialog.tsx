import { useEffect, useState } from 'react'
import { drawQuestions, type DrawnQuestion, type Quiz, type QuizAnswer } from '../quizzes'

export interface QuizResult {
  answers: QuizAnswer[]
  score: number
  total: number
  passed: boolean
}

interface Props {
  quiz: Quiz
  topicTitle: (topic: string) => string
  onSubmit: (result: QuizResult) => void
  /** Closes the quiz and opens the Learn page a missed question came from. */
  onReview: (topic: string) => void
  onClose: () => void
  /** Offered after a pass, e.g. the next module. */
  next?: { label: string; onClick: () => void }
}

// A module quiz (issue #20). Written against the Quiz type only, so the
// placement quiz (#14) can reuse it. A failed attempt names the topics to
// review but never the right answers; those show only after a pass.
export function QuizDialog({ quiz, topicTitle, onSubmit, onReview, onClose, next }: Props) {
  const [questions, setQuestions] = useState<DrawnQuestion[]>(() => drawQuestions(quiz))
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const answeredCount = questions.filter((q) => chosen[q.id] !== undefined).length

  function submit() {
    const answers = questions.map((q) => ({ question_id: q.id, chosen: chosen[q.id], correct: chosen[q.id] === q.options[0] }))
    const score = answers.filter((a) => a.correct).length
    const r = { answers, score, total: questions.length, passed: score >= quiz.passCount }
    setResult(r)
    onSubmit(r)
    document.querySelector('.quiz-modal')?.scrollTo(0, 0)
  }

  function retake() {
    setQuestions(drawQuestions(quiz))
    setChosen({})
    setResult(null)
    document.querySelector('.quiz-modal')?.scrollTo(0, 0)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal quiz-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
        <div className="modal-header">
          <h2 id="quiz-title">{quiz.title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!result && (
          <>
            <p className="example-description">{quiz.intro}</p>
            <ol className="quiz-questions">
              {questions.map((q) => (
                <li key={q.id}>
                  <p className="quiz-question">{q.question}</p>
                  {q.shuffled.map((option) => (
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
              <button className="primary" onClick={submit} disabled={answeredCount < questions.length}>Submit answers</button>
            </div>
          </>
        )}

        {result && !result.passed && (
          <>
            <p className="quiz-score fail">
              You scored {result.score}/{result.total}. You need {quiz.passCount} to pass. Review the topics below, then try again.
            </p>
            <ul className="quiz-review">
              {result.answers.map((a, k) => {
                if (a.correct) return null
                const topic = questions[k].topic
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
              <button className="primary" onClick={retake}>Try again</button>
            </div>
          </>
        )}

        {result && result.passed && (
          <>
            <p className="quiz-score pass">
              You scored {result.score}/{result.total} and passed. {quiz.passNote}
            </p>
            <ol className="quiz-questions">
              {questions.map((q, k) => (
                <li key={q.id}>
                  <p className="quiz-question">{q.question}</p>
                  {result.answers[k].correct ? (
                    <p className="quiz-answer correct">✓ {q.options[0]}</p>
                  ) : (
                    <p className="quiz-answer">
                      <span className="quiz-chosen">✗ You chose {result.answers[k].chosen}.</span> Correct answer: {q.options[0]}
                    </p>
                  )}
                  <p className="example-description">{q.explanation}</p>
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
