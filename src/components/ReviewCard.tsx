import type { PredictQuestion } from '../core/predict'
import { QuestionCard } from './PredictDialog'

// A one-question "Quick review" next to the learning-path card, 14 and 28
// days after a module was finished (#15). The question comes from that
// module's Predict set, ones answered wrong before first.
export function ReviewCard({ title, question, answered, onAnswer, onDone }: {
  title: string
  question: PredictQuestion
  answered: boolean
  onAnswer: (answer: string, correct: boolean) => void
  onDone: () => void
}) {
  return (
    // Folded, so the Continue card's next step stays the one thing in view (#102).
    <details className="panel review-card">
      <summary className="path-header">
        <h3>Quick review: {title}</h3>
      </summary>
      <ol className="predict-questions">
        <QuestionCard n={1} q={question} once onAnswer={onAnswer} />
      </ol>
      {answered && <button className="primary" onClick={onDone}>Done</button>}
    </details>
  )
}
