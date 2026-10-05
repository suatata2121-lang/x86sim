import { useEffect, useRef, useState } from 'react'
import {
  PIPELINE_PROGRAMS,
  QUEUE_SIZE,
  initialState,
  sequentialClocks,
  tick,
  type BusCycle,
  type PipelineScenario,
  type PipeState,
} from '../core/biuEu'

const PLAY_INTERVAL_MS = 500

function hex(n: number, digits: number) {
  return n.toString(16).toUpperCase().padStart(digits, '0')
}

// Colors follow the instruction a byte belongs to, so the same hue shows up in
// the listing, the queue, and the EU row of the timeline.
function colorClass(instr: number) {
  return `pipe-c${instr % 6}`
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`
}

// One plain sentence describing what the BIU is doing on the current clock.
function biuSentence(bus: BusCycle | null, state: PipeState) {
  if (state.clock === 0) return 'Idle. Press Clock +1 to start.'
  if (bus?.kind === 'fetch') {
    return bus.stale
      ? 'Fetching bytes from memory, but the jump made them useless, so they will be thrown away.'
      : `Fetching ${bus.count} code byte${bus.count > 1 ? 's' : ''} from memory into the queue.`
  }
  if (bus) return 'Reading or writing a memory operand for the EU.'
  if (state.queue.length > QUEUE_SIZE - 2) return 'Idle. The queue is full, so there is nowhere to fetch into.'
  return 'Idle. All of the program bytes are already fetched.'
}

// One plain sentence describing what the EU is doing on the current clock.
function euSentence(state: PipeState, text: string | null) {
  const what = text ? `"${text}"` : 'the next instruction'
  switch (state.euPhase) {
    case 'idle':
      return state.clock === 0 ? 'Waiting for the first instruction.' : 'Done with the last instruction. Taking the next one from the queue.'
    case 'wait-queue':
      return `Waiting: ${what} is not fully in the queue yet.`
    case 'exec':
      return `Executing ${what}: clock ${state.stageTotal - state.stageRemaining} of ${state.stageTotal}.`
    case 'wait-bus':
      return 'Waiting for the BIU, because it needs a memory operand and the bus is busy.'
    case 'done':
      return 'Halted.'
  }
}

export function BiuEuView({ scenarios }: { scenarios: PipelineScenario[] }) {
  const [scenario, setScenario] = useState<PipelineScenario>(scenarios[0])
  const [state, setState] = useState<PipeState>(initialState)
  const [isPlaying, setIsPlaying] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const prog = PIPELINE_PROGRAMS[scenario]

  useEffect(() => {
    setState(initialState())
    setIsPlaying(false)
  }, [scenario])

  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => {
      setState((s) => tick(prog, s))
    }, PLAY_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isPlaying, prog])

  useEffect(() => {
    if (state.done) setIsPlaying(false)
  }, [state.done])

  useEffect(() => {
    const el = timelineRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [state.clock])

  function stepClock() {
    setState((s) => tick(prog, s))
  }

  // Runs clocks until the EU takes its next instruction (or the program ends).
  function stepInstruction() {
    setState((s) => {
      let next = tick(prog, s)
      let guard = 0
      while (!next.done && !next.tookInstr && guard++ < 500) next = tick(prog, next)
      return next
    })
  }

  function reset() {
    setIsPlaying(false)
    setState(initialState())
  }

  const bus = state.bus ?? state.completed
  const busT = state.biuHistory[state.biuHistory.length - 1]
  const currentText = state.current !== null ? prog.instrs[state.current].text : null
  const seq = sequentialClocks(prog)

  return (
    <div className="hw-playground pipe">
      {scenarios.length > 1 && (
        <div className="mode-tabs pipe-scenarios">
          {scenarios.map((id) => (
            <button key={id} className={scenario === id ? 'mode-tab active' : 'mode-tab'} onClick={() => setScenario(id)}>
              {PIPELINE_PROGRAMS[id].title}
            </button>
          ))}
        </div>
      )}
      <p className="example-description pipe-scenario-desc">{prog.description}</p>

      <p className="pipe-now">
        <b>{state.clock === 0 ? 'Before the first clock:' : `Clock ${state.clock}:`}</b>{' '}
        {biuSentence(bus, state)} {euSentence(state, currentText)}
      </p>

      <div className="hw-playground-controls">
        <button onClick={stepClock} disabled={state.done || isPlaying}>Clock +1</button>
        <button onClick={stepInstruction} disabled={state.done || isPlaying}>Next instruction</button>
        {isPlaying ? (
          <button onClick={() => setIsPlaying(false)}>Pause</button>
        ) : (
          <button onClick={() => setIsPlaying(true)} disabled={state.done}>Play</button>
        )}
        <button onClick={reset}>Reset</button>
        <span className="hw-playground-status">
          {state.done ? `Halted after ${state.clock} clocks` : `Clock ${state.clock}`}
        </span>
      </div>

      <div className="pipe-units">
        <div className="pipe-unit">
          <div className="pipe-unit-title">BUS INTERFACE UNIT (BIU)</div>
          <div className="pipe-tstates">
            {[1, 2, 3, 4].map((t) => (
              <span
                key={t}
                className={
                  busT && busT.kind !== 'idle' && busT.t === t
                    ? `pipe-tstate on pipe-bus-${busT.stale ? 'stale' : busT.kind}`
                    : 'pipe-tstate'
                }
              >
                T{t}
              </span>
            ))}
          </div>
          <div className="pipe-status">{biuSentence(bus, state)}</div>
          <div className="pipe-hint">next byte to fetch: IP = {hex(state.fetchOffset, 4)}h</div>
        </div>

        <div className="pipe-queue-wrap">
          <div className="pipe-queue-label">
            INSTRUCTION QUEUE <span className="pipe-hint">({state.queue.length}/{QUEUE_SIZE} bytes)</span>
            {state.flushed && <span className="pipe-flush">FLUSHED</span>}
          </div>
          <div className="pipe-queue">
            {Array.from({ length: QUEUE_SIZE }, (_, i) => {
              const b = state.queue[i]
              return (
                <span key={i} className={b ? `pipe-qbyte ${colorClass(b.instr)}` : 'pipe-qbyte empty'}>
                  {b ? hex(b.value, 2) : ''}
                </span>
              )
            })}
          </div>
        </div>

        <div className="pipe-unit">
          <div className="pipe-unit-title">EXECUTION UNIT (EU)</div>
          <div className="pipe-decoder-instr">
            {currentText && state.euPhase !== 'done' ? <code>{currentText}</code> : <span className="pipe-hint">—</span>}
          </div>
          <div className={`pipe-status pipe-eu-${state.euPhase}`}>{euSentence(state, currentText)}</div>
        </div>
      </div>

      <div className="pipe-timeline-wrap">
        <div className="pipe-timeline-labels">
          <span>BIU</span>
          <span>EU</span>
        </div>
        <div className="pipe-timeline" ref={timelineRef}>
          <div className="pipe-timeline-row">
            {state.biuHistory.map((c, i) => (
              <span
                key={i}
                className={`pipe-cell pipe-bus-${c.stale ? 'stale' : c.kind}`}
                title={`Clock ${i + 1}: ${c.kind === 'idle' ? 'idle' : `${c.kind} T${c.t}`}`}
              >
                {c.t ?? ''}
              </span>
            ))}
          </div>
          <div className="pipe-timeline-row">
            {state.euHistory.map((c, i) => (
              <span
                key={i}
                className={c.kind === 'exec' ? `pipe-cell ${colorClass(c.instr!)}` : `pipe-cell pipe-eu-cell-${c.kind}`}
                title={`Clock ${i + 1}: ${
                  c.kind === 'exec'
                    ? prog.instrs[c.instr!].text
                    : c.kind === 'wait-queue'
                      ? 'waiting for queue bytes'
                      : c.kind === 'wait-bus'
                        ? 'waiting for memory operand'
                        : 'halted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="pipe-legend">
        <span><i className="pipe-cell pipe-bus-fetch" /> code fetch</span>
        <span><i className="pipe-cell pipe-bus-read" /> memory operand</span>
        <span><i className="pipe-cell pipe-bus-idle" /> BIU idle</span>
        <span><i className="pipe-cell pipe-eu-cell-wait-queue" /> EU waiting for bytes</span>
      </div>

      {state.done && (
        <p className="example-description pipe-summary">
          Finished in <b>{state.clock}</b> {plural(state.clock, 'clock')}. Running the same instructions one after
          another, without overlap, would take <b>{seq}</b> clocks.
        </p>
      )}

      <table className="pipe-listing">
        <tbody>
          {prog.instrs.map((ins, i) => {
            const isCurrent = state.current === i && state.euPhase !== 'done' && state.euPhase !== 'idle' && state.euPhase !== 'wait-queue'
            const skipped = state.done && !state.executed.includes(i)
            return (
              <tr key={i} className={isCurrent ? 'current' : skipped ? 'skipped' : undefined}>
                <td>
                  <span className={`pipe-instr-chip ${colorClass(i)}`}>{ins.bytes.map((b) => hex(b, 2)).join(' ')}</span>
                </td>
                <td><code>{ins.text}</code></td>
                <td className="pipe-hint">{state.executed.includes(i) ? 'done' : skipped ? 'skipped' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
