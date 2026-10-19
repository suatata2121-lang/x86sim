import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { assemble } from '../core/assembler'
import { Cpu, type CpuSnapshot } from '../core/cpu'
import type { Flags, Reg16 } from '../core/types'
import { RegisterFormatPicker, allFormatsByte, allFormatsWord, formatByte, formatWord, useRegisterFormat, type RegFormat } from './regFormat'

// The Observe step on one screen (issue #27): the example's code, Step
// controls, the registers the module cares about and a "What happened" line,
// all in one card. It runs its own Cpu like the Hardware demos, so nothing
// here touches the editor tabs; "Open in editor" hands the example over to
// the full simulator. The right-hand panel is a prop so a compact Memory or
// Stack view can take the registers' place for other modules.

const PLAY_INTERVAL_MS = 600
const GENERAL: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP']
const HALVES: Partial<Record<Reg16, [string, string]>> = {
  AX: ['AH', 'AL'], BX: ['BH', 'BL'], CX: ['CH', 'CL'], DX: ['DH', 'DL'],
}

/** What a step did: a module's callout, or the registers it changed (written in the chosen format when shown). */
type Happened = { callout: string } | { text: string; changes: [Reg16, number, number][] }

function happenedText(h: Happened, fmt: RegFormat): string {
  if ('callout' in h) return h.callout
  if (h.changes.length === 0) return `${h.text}: no register changed.`
  return `${h.text}: ${h.changes.map(([r, a, b]) => `${r} ${formatWord(a, fmt)} → ${formatWord(b, fmt)}`).join(', ')}.`
}

export interface ObservePanelProps {
  regs: Record<Reg16, number>
  flags: Flags
  /** Registers before the last step; null right after loading or a reset. */
  before: Record<Reg16, number> | null
}

/** The default right-hand panel: chosen registers with their halves, then the flags. */
export function CompactRegisters({ regs, flags, before, shown }: ObservePanelProps & { shown: Reg16[] }) {
  const [fmt] = useRegisterFormat()
  return (
    <div className="observe-regs" data-format={fmt}>
      <RegisterFormatPicker />
      {shown.map((name) => {
        const changed = before !== null && before[name] !== regs[name]
        const halves = HALVES[name]
        const bits = before ? before[name] ^ regs[name] : 0
        return (
          <div key={name} className={`observe-reg${changed ? ' changed' : ''}`}>
            <span className="observe-reg-name">{name}</span>
            <span className="observe-reg-value" title={allFormatsWord(regs[name])}>{formatWord(regs[name], fmt)}</span>
            {halves && fmt !== 'bin' && (
              <span className="observe-halves">
                <span className={changed && (bits >> 8) & 0xff ? 'changed' : undefined} title={allFormatsByte(regs[name] >> 8)}>
                  {halves[0]} <span className="reg-half-value">{formatByte(regs[name] >> 8, fmt)}</span>
                </span>
                <span className={changed && bits & 0xff ? 'changed' : undefined} title={allFormatsByte(regs[name] & 0xff)}>
                  {halves[1]} <span className="reg-half-value">{formatByte(regs[name] & 0xff, fmt)}</span>
                </span>
              </span>
            )}
          </div>
        )
      })}
      <div className="observe-flags">
        {(['ZF', 'SF', 'CF', 'OF'] as const).map((f) => <span key={f}>{f} {flags[f] ? 1 : 0}</span>)}
      </div>
    </div>
  )
}

interface Props {
  title: string
  source: string
  /** One line under the title (the module's "what to watch"). */
  summary?: string
  /** The module's "what to watch" list (#10). */
  guide?: string[]
  /** "Done watching → Predict": leaves Observe for the module's next step. */
  next?: { label: string; onClick: () => void }
  registers?: Reg16[]
  /** Source line -> text shown after that line runs, instead of the generated one. */
  callouts?: Record<number, string>
  panel?: (props: ObservePanelProps) => ReactNode
  /** The program reached its end. */
  onDone?: () => void
  onOpenInEditor: () => void
}

export function ObserveView({
  title, source, summary, guide, next, registers = ['AX', 'BX', 'CX', 'DX'], callouts, panel, onDone, onOpenInEditor,
}: Props) {
  const program = useMemo(() => assemble(source), [source])
  // Steps to the end, from a dry run, for "Step n / total".
  const total = useMemo(() => {
    if (program.errors.length) return 0
    const cpu = new Cpu()
    cpu.load(program.instructions, program.data)
    try {
      // Keyboard reads get a stand-in key; the count doesn't depend on which.
      while (!cpu.halted && cpu.steps < 10000) {
        cpu.run(10000)
        if (!cpu.waitingForInput) break
        cpu.provideInput('a')
      }
    } catch { /* the real run shows the error */ }
    return cpu.steps
  }, [program])

  const cpuRef = useRef<Cpu>(new Cpu())
  const historyRef = useRef<{ snap: CpuSnapshot; happened: Happened | null; before: Record<Reg16, number> | null }[]>([])
  const [, setTick] = useState(0)
  const [happened, setHappened] = useState<Happened | null>(null)
  const [fmt] = useRegisterFormat()
  const [before, setBefore] = useState<Record<Reg16, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [input, setInput] = useState('')
  const timerRef = useRef<number | null>(null)
  const sourceLines = source.split(/\r?\n/)

  function load() {
    stop()
    const cpu = new Cpu()
    cpu.load(program.instructions, program.data)
    cpuRef.current = cpu
    historyRef.current = []
    setHappened(null)
    setBefore(null)
    setError(null)
    setTick((t) => t + 1)
  }

  useEffect(load, [program]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stop, [])

  function describe(line: number, prev: Record<Reg16, number>, cpu: Cpu): Happened {
    if (callouts?.[line]) return { callout: callouts[line] }
    const text = (sourceLines[line - 1] ?? '').replace(/;.*$/, '').trim()
    const changes = GENERAL.filter((r) => prev[r] !== cpu.regs[r]).map((r): [Reg16, number, number] => [r, prev[r], cpu.regs[r]])
    return { text, changes }
  }

  function step(): boolean {
    const cpu = cpuRef.current
    if (cpu.halted || cpu.waitingForInput || program.errors.length) return false
    historyRef.current.push({ snap: cpu.snapshot(), happened, before })
    const prev = { ...cpu.regs }
    const line = cpu.instructions[cpu.ip]?.line
    try {
      cpu.step()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
    setBefore(prev)
    setHappened(line !== undefined ? describe(line, prev, cpu) : null)
    setTick((t) => t + 1)
    if (cpu.halted) onDone?.()
    return !cpu.halted && !cpu.waitingForInput
  }

  // Keyboard examples (INT 21h AH=01h/0Ah) pause here until the student types.
  function sendInput() {
    cpuRef.current.provideInput(input)
    setInput('')
    setTick((t) => t + 1)
  }

  function back() {
    stop()
    const last = historyRef.current.pop()
    if (!last) return
    cpuRef.current.restore(last.snap)
    setHappened(last.happened)
    setBefore(last.before)
    setError(null)
    setTick((t) => t + 1)
  }

  function stop() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    setPlaying(false)
  }

  function play() {
    if (timerRef.current !== null) return
    setPlaying(true)
    timerRef.current = window.setInterval(() => {
      if (!step()) stop()
    }, PLAY_INTERVAL_MS)
  }

  const cpu = cpuRef.current
  const ranLine = cpu.lastInstruction?.line ?? null
  const nextLine = cpu.halted ? null : cpu.instructions[cpu.ip]?.line ?? null
  const codeLines = sourceLines
    .map((text, i) => ({ n: i + 1, text: text.replace(/;.*$/, '').trimEnd() }))
    .filter((l) => l.text.trim())
  const panelProps: ObservePanelProps = { regs: cpu.regs, flags: cpu.flags, before }

  return (
    <div className="panel observe">
      <div className="observe-controls">
        <h3>Observe · {title}</h3>
        <span className="observe-count">Step {cpu.steps} / {total}</span>
        <div className="observe-buttons">
          <button onClick={back} disabled={historyRef.current.length === 0}>⏪ Back</button>
          <button className="primary" onClick={() => { stop(); step() }} disabled={cpu.halted || !!cpu.waitingForInput || playing}>Step ▶</button>
          {playing
            ? <button onClick={stop}>⏸ Pause</button>
            : <button onClick={play} disabled={cpu.halted}>▶ Play</button>}
          <button onClick={load}>↺ Reset</button>
        </div>
      </div>
      {(summary || guide) && (
        <details className="observe-summary" open>
          <summary>What to watch</summary>
          {summary}
          {guide && <ul className="watch-guide">{guide.map((g) => <li key={g}>{g}</li>)}</ul>}
        </details>
      )}
      {program.errors.length > 0 && <p className="feedback-error">{program.errors[0].message}</p>}
      <div className="observe-body">
        <ol className="observe-code" aria-label="Program">
          {codeLines.map((l) => (
            <li key={l.n} className={l.n === ranLine ? 'ran' : l.n === nextLine ? 'next' : undefined}>
              <span className="observe-line-no">{l.n === ranLine ? '▶' : ''}{l.n}</span>
              <code>{l.text}</code>
              {l.n === ranLine && <span className="observe-tag">just ran</span>}
              {l.n === nextLine && <span className="observe-tag">next</span>}
            </li>
          ))}
        </ol>
        {panel ? panel(panelProps) : <CompactRegisters {...panelProps} shown={registers} />}
      </div>
      {cpu.waitingForInput && (
        <div className="input-request-row observe-input">
          <span>The program is waiting for {cpu.waitingForInput.kind === 'char' ? 'a key' : 'a line of text'}:</span>
          <input
            autoFocus
            className="input-request-field"
            value={input}
            maxLength={cpu.waitingForInput.kind === 'string' ? cpu.waitingForInput.maxLen : 1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendInput() }}
          />
          <button onClick={sendInput}>Send</button>
        </div>
      )}
      {cpu.output.length > 0 && <pre className="output observe-output">{cpu.output.join('')}</pre>}
      <div className="observe-happened" aria-live="polite">
        {error
          ? <span className="moveit-error">Runtime error: {error}</span>
          : happened ? happenedText(happened, fmt) : 'Press Step to run the first line.'}
        {cpu.halted && <strong className="observe-done"> Done. You watched the whole program run.</strong>}
      </div>
      <div className="observe-footer">
        <button className="link-button" onClick={onOpenInEditor}>Open in editor</button>
        {next && <button className="primary" onClick={next.onClick}>{next.label}</button>}
      </div>
    </div>
  )
}
