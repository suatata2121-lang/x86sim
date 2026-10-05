import { useEffect, useRef, useState } from 'react'
import {
  CS_VALUE,
  DS_VALUE,
  PIPELINE_PROGRAMS,
  QUEUE_SIZE,
  initialState,
  instrOffsets,
  sequentialClocks,
  tick,
  type BusCycle,
  type PipelineScenario,
  type PipeState,
} from '../core/biuEu'

const PLAY_INTERVAL_MS = 220
const EU_REGS = ['AX', 'BX', 'CX', 'DX', 'SP', 'BP', 'SI', 'DI'] as const
const ALU_MNEMONICS = new Set(['ADD', 'SUB', 'MUL', 'INC', 'DEC', 'AND', 'OR', 'XOR', 'CMP'])

function hex(n: number, digits: number) {
  return n.toString(16).toUpperCase().padStart(digits, '0')
}

// Colors are keyed to the instruction a byte belongs to, so the same hue
// follows it from the program listing into the queue and on into the EU row
// of the timeline.
function colorClass(instr: number) {
  return `pipe-c${instr % 6}`
}

// The 16-bit registers an instruction's text mentions (AL/BL/... count
// toward their full register), to highlight them in the EU's register file.
function registersUsed(text: string): Set<string> {
  const used = new Set<string>()
  const operands = text.replace(/^\w+:\s*/, '').replace(/^\S+/, '')
  for (const m of operands.matchAll(/\b([ABCD][XLH]|SP|BP|SI|DI)\b/g)) {
    const r = m[1]
    used.add(/[LH]$/.test(r) ? `${r[0]}X` : r)
  }
  return used
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`
}

function mnemonicOf(text: string) {
  return text.replace(/^\w+:\s*/, '').split(/\s+/)[0]
}

function busDescription(bus: BusCycle) {
  if (bus.kind === 'fetch') {
    return bus.stale
      ? `Code fetch @ ${hex(bus.physical, 5)}h -- discarded (queue was flushed)`
      : `Code fetch: ${bus.count} byte${bus.count > 1 ? 's' : ''} @ ${hex(bus.physical, 5)}h`
  }
  return `Memory ${bus.kind} for the EU @ ${hex(bus.physical, 5)}h`
}

export function BiuEuView({ scenarios }: { scenarios: PipelineScenario[] }) {
  const [scenario, setScenario] = useState<PipelineScenario>(scenarios[0])
  const [state, setState] = useState<PipeState>(initialState)
  const [isPlaying, setIsPlaying] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const prog = PIPELINE_PROGRAMS[scenario]
  const offsets = instrOffsets(prog)

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

  // Runs clocks until the EU picks up its next instruction (or the program
  // ends) -- a quicker way through long stretches like a 70-clock MUL.
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
  const currentInstr = state.current !== null ? prog.instrs[state.current] : null
  const usedRegs = currentInstr && state.euPhase !== 'done' ? registersUsed(currentInstr.text) : new Set<string>()
  const aluActive =
    currentInstr !== null && state.euPhase === 'exec' && ALU_MNEMONICS.has(mnemonicOf(currentInstr.text))
  const dataBusActive = bus !== null && bus.kind !== 'fetch'
  const queuedInstrs = new Set(state.queue.map((b) => b.instr))
  const euWaitClocks = state.euHistory.filter((c) => c.kind === 'wait-queue' || c.kind === 'wait-bus').length
  const biuIdleClocks = state.biuHistory.filter((c) => c.kind === 'idle').length
  const seq = sequentialClocks(prog)

  let biuStatus: string
  if (state.clock === 0) biuStatus = 'Ready -- press Clock or Play'
  else if (bus) biuStatus = busDescription(bus)
  else if (state.queue.length > QUEUE_SIZE - 2) biuStatus = 'Idle (Ti): queue full, nothing to fetch into'
  else biuStatus = 'Idle (Ti): all program bytes already fetched'

  let euStatus: string
  switch (state.euPhase) {
    case 'idle':
      euStatus =
        state.clock === 0
          ? 'Waiting for the first instruction bytes'
          : 'Finished -- takes the next instruction from the queue on the next clock'
      break
    case 'wait-queue':
      euStatus = `Waiting: "${prog.instrs[state.pc].text}" is not fully in the queue yet`
      break
    case 'exec':
      euStatus = `Executing: clock ${state.stageTotal - state.stageRemaining} of ${state.stageTotal}`
      break
    case 'wait-bus':
      euStatus =
        `Waiting for the BIU to ${currentInstr?.mem?.kind === 'write' ? 'write' : 'read'} the memory operand` +
        (state.bus?.kind === 'fetch' ? ' -- the bus is still busy finishing a code fetch' : '')
      break
    case 'done':
      euStatus = 'Halted'
      break
  }

  return (
    <div className="hw-playground pipe">
      {scenarios.length > 1 && (
        <div className="mode-tabs pipe-scenarios">
          {scenarios.map((id) => (
            <button
              key={id}
              className={scenario === id ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setScenario(id)}
            >
              {PIPELINE_PROGRAMS[id].title}
            </button>
          ))}
        </div>
      )}
      <p className="example-description pipe-scenario-desc">{prog.description}</p>
      <p className="pipe-now">
        <b>{state.clock === 0 ? 'Before the first clock:' : `Clock ${state.clock}:`}</b>{' '}
        {state.clock === 0
          ? 'nothing has happened yet. Press Clock +1 to watch the BIU start fetching bytes while the EU waits.'
          : `${bus ? 'the BIU is using the bus' : 'the BIU has nothing to fetch and sits idle'}, and ${
              state.euPhase === 'exec'
                ? 'the EU is busy running an instruction'
                : state.euPhase === 'idle'
                  ? 'the EU is between instructions'
                  : state.euPhase === 'done'
                    ? 'the program has halted'
                    : 'the EU is waiting for bytes or the bus'
            }.`}
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
        <span className="hw-playground-status">{state.done ? `Halted after ${state.clock} clocks` : `Clock ${state.clock}`}</span>
      </div>

      <div className="pipe-units">
        <div className="pipe-unit">
          <div className="pipe-unit-title">BUS INTERFACE UNIT (BIU)</div>

          <div className="pipe-row">
            <span className="pipe-reg"><b>CS</b> {hex(CS_VALUE, 4)}h</span>
            <span className="pipe-reg"><b>DS</b> {hex(DS_VALUE, 4)}h</span>
            <span className="pipe-reg"><b>SS</b> 3000h</span>
            <span className="pipe-reg"><b>ES</b> 2000h</span>
          </div>
          <div className="pipe-row">
            <span className="pipe-reg"><b>IP</b> {hex(state.fetchOffset, 4)}h</span>
            <span className="pipe-hint">next byte the BIU will fetch</span>
          </div>

          <div className={bus ? 'pipe-adder on' : 'pipe-adder'}>
            <span className="pipe-adder-sigma">Σ</span>
            {bus ? (
              <span>
                {bus.kind === 'fetch' ? 'CS' : 'DS'} × 10h + {hex(bus.offset, 4)}h = <b>{hex(bus.physical, 5)}h</b>
              </span>
            ) : (
              <span className="pipe-hint">address adder idle</span>
            )}
          </div>

          <div className="pipe-bus-control">
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
            <div className="pipe-status">{biuStatus}</div>
          </div>

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

        <div className="pipe-links">
          <div className={state.tookInstr ? 'pipe-link on' : 'pipe-link'}>
            queue → EU<span className="pipe-link-arrow">➜</span>
          </div>
          <div className={dataBusActive ? 'pipe-link on data' : 'pipe-link'}>
            <span className="pipe-link-arrow">⇄</span>operand data
          </div>
        </div>

        <div className="pipe-unit">
          <div className="pipe-unit-title">EXECUTION UNIT (EU)</div>

          <div className="pipe-decoder">
            <div className="pipe-hint">CONTROL UNIT / DECODER</div>
            <div className="pipe-decoder-instr">
              {currentInstr && state.euPhase !== 'done' ? (
                <>
                  <span className={`pipe-instr-chip ${colorClass(state.current!)}`}>
                    {currentInstr.bytes.map((b) => hex(b, 2)).join(' ')}
                  </span>
                  <code>{currentInstr.text}</code>
                </>
              ) : (
                <span className="pipe-hint">—</span>
              )}
            </div>
            <div className={`pipe-status pipe-eu-${state.euPhase}`}>{euStatus}</div>
          </div>

          <div className="pipe-regs">
            {EU_REGS.map((r) => (
              <span key={r} className={usedRegs.has(r) ? 'pipe-reg on' : 'pipe-reg'}>{r}</span>
            ))}
          </div>

          <div className="pipe-row">
            <span className={aluActive ? 'pipe-alu on' : 'pipe-alu'}>ALU</span>
            <span className="pipe-reg">FLAGS</span>
          </div>
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
                className={
                  c.kind === 'exec'
                    ? `pipe-cell ${colorClass(c.instr!)}`
                    : `pipe-cell pipe-eu-cell-${c.kind}`
                }
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
        <span><i className="pipe-cell pipe-bus-read" /> memory read/write</span>
        <span><i className="pipe-cell pipe-bus-stale" /> discarded fetch</span>
        <span><i className="pipe-cell pipe-bus-idle" /> BIU idle</span>
        <span><i className="pipe-cell pipe-eu-cell-wait-queue" /> EU waiting for bytes</span>
        <span><i className="pipe-cell pipe-eu-cell-wait-bus" /> EU waiting for operand</span>
      </div>

      <div className="pipe-stats">
        <span>EU waited: <b>{euWaitClocks}</b> {plural(euWaitClocks, 'clock')}</span>
        <span>BIU idle: <b>{biuIdleClocks}</b> {plural(biuIdleClocks, 'clock')}</span>
        {state.done && (
          <span>
            Without the queue (fetch, then execute, one at a time): <b>{seq}</b> clocks -- the overlap saved{' '}
            <b>{seq - state.clock}</b> clocks ({Math.round(((seq - state.clock) / seq) * 100)}%).
          </span>
        )}
      </div>

      <table className="pipe-listing">
        <tbody>
          {prog.instrs.map((ins, i) => {
            const isCurrent = state.current === i && state.euPhase !== 'done' && state.euPhase !== 'idle' && state.euPhase !== 'wait-queue'
            const skipped = state.done && !state.executed.includes(i)
            return (
              <tr key={i} className={isCurrent ? 'current' : skipped ? 'skipped' : undefined}>
                <td className="pipe-hint">{hex(offsets[i], 4)}</td>
                <td>
                  <span className={`pipe-instr-chip ${colorClass(i)}`}>{ins.bytes.map((b) => hex(b, 2)).join(' ')}</span>
                </td>
                <td><code>{ins.text}</code></td>
                <td className="pipe-hint">
                  {state.executed.includes(i) ? 'done' : queuedInstrs.has(i) ? 'in queue' : skipped ? 'skipped' : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
