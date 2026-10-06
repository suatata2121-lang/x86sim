// A generic step-through figure: each step has a short title, a sentence about
// what happens, and a few labelled values. Used for the bus-control topics
// (control signals, bus request/grant, LOCK, address demultiplexing) so they
// share one interactive pattern instead of one-off components.
import { useState } from 'react'

export interface FigureStep {
  name: string
  where: string
  state: [string, string][]
}

export interface FigureSpec {
  title: string
  steps: FigureStep[]
}

export function FigureStepper({ spec }: { spec: FigureSpec }) {
  const [step, setStep] = useState(0)
  const current = spec.steps[step]
  const last = spec.steps.length - 1

  return (
    <div className="panel fde-panel figure-stepper">
      <h3>{spec.title}</h3>
      <div className="fde-stages">
        {spec.steps.map((s, i) => (
          <button
            key={s.name}
            className={i === step ? 'fde-stage active' : i < step ? 'fde-stage done' : 'fde-stage'}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s.name}
          </button>
        ))}
      </div>

      <p className="example-description fde-where">{current.where}</p>

      <table className="fde-state">
        <tbody>
          {current.state.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fde-controls">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>◀ Back</button>
        <button onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step === last}>Next ▶</button>
      </div>
    </div>
  )
}
