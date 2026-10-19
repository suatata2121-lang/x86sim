import { useEffect } from 'react'

// The optional cycle challenge under the test results (#15), for students who
// passed an assignment in their first one or two runs.
export function ChallengePanel({ limit, cycles, passed, completedBefore, onComplete }: {
  limit: number
  /** All test cases' cycles added up, from the latest Run Tests. */
  cycles: number
  passed: boolean
  completedBefore: boolean
  onComplete: () => void
}) {
  const made = passed && cycles <= limit
  useEffect(() => {
    if (made && !completedBefore) onComplete()
    // Record once, when this run makes it.
  }, [made, completedBefore])

  return (
    <div className={`panel challenge-panel${made || completedBefore ? ' done' : ''}`}>
      <h3>🏅 Challenge</h3>
      {made || completedBefore ? (
        <p className="mb-feedback-right">Challenge complete: {limit} cycles or fewer.</p>
      ) : (
        <p className="example-description">
          Challenge (optional): pass the same tests in fewer than {limit} cycles. Open the Profiler to see where the
          cycles go.
        </p>
      )}
      {passed && <p className="admin-meta">This run: {cycles.toLocaleString()} cycles.</p>}
    </div>
  )
}
