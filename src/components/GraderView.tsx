import type { GradeReport } from '../core/grader'

export function GraderView({ report }: { report: GradeReport }) {
  if (!report.assembled) {
    return (
      <div className="panel grader-panel">
        <h3>Test Results</h3>
        <p className="status error">Assembly failed — fix the errors above before your tests can run.</p>
        <ul className="errors">
          {report.assembleErrors.map((e, i) => (
            <li key={i}>Line {e.line}: {e.message}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="panel grader-panel">
      <h3>Test Results</h3>
      <p className={report.passedCount === report.totalCount ? 'status grader-summary-pass' : 'status grader-summary-fail'}>
        {report.passedCount} / {report.totalCount} tests passed
      </p>
      <ul className="grader-results">
        {report.results.map((r) => (
          <li key={r.name} className={r.passed ? 'grader-result pass' : 'grader-result fail'}>
            <div className="grader-result-head">
              <span className="grader-result-icon">{r.passed ? '✓' : '✗'}</span>
              <span className="grader-result-name">{r.name}</span>
              <span className="grader-result-meta">{r.steps} steps / {r.cycles.toLocaleString()} cycles</span>
            </div>
            {r.failures.length > 0 && (
              <ul className="grader-failures">
                {r.failures.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
