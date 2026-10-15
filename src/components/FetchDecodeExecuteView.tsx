// Step-by-step view of a short program going through the fetch-decode-execute
// cycle (issue #25): four instructions stored from 0100h, three phases each.
// The machine code is what an 8086 assembler emits for these lines, so the
// bytes, instruction lengths and IP values are real; the register and memory
// values are worked out step by step below rather than typed in.
import { useEffect, useState } from 'react'

type Unit = 'memory' | 'bus' | 'biu' | 'control' | 'registers' | 'alu' | 'flags'

interface Machine {
  IP: number
  AX: number
  BX: number
  flags: { ZF: number; SF: number; CF: number; OF: number }
  mem200: number
  mem201: number
}

interface ProgramLine {
  address: number
  bytes: number[]
  text: string
  decode: string
  execute: (m: Machine) => { m: Machine; what: string }
  units: Unit[]
}

const hex = (v: number, digits = 4) => `${v.toString(16).toUpperCase().padStart(digits, '0')}h`
const byte = (v: number) => v.toString(16).toUpperCase().padStart(2, '0')

const PROGRAM: ProgramLine[] = [
  {
    address: 0x0100, bytes: [0xb8, 0x05, 0x00], text: 'MOV AX, 5',
    decode: 'MOV, destination AX, source immediate 0005h',
    execute: (m) => ({ m: { ...m, AX: 5 }, what: 'AX = 0005h' }),
    units: ['control', 'registers'],
  },
  {
    address: 0x0103, bytes: [0xbb, 0x03, 0x00], text: 'MOV BX, 3',
    decode: 'MOV, destination BX, source immediate 0003h',
    execute: (m) => ({ m: { ...m, BX: 3 }, what: 'BX = 0003h' }),
    units: ['control', 'registers'],
  },
  {
    address: 0x0106, bytes: [0x03, 0xc3], text: 'ADD AX, BX',
    decode: 'ADD (ALU), destination AX, source BX',
    execute: (m) => {
      const sum = (m.AX + m.BX) & 0xffff
      const flags = { ZF: sum === 0 ? 1 : 0, SF: sum & 0x8000 ? 1 : 0, CF: m.AX + m.BX > 0xffff ? 1 : 0, OF: 0 }
      return {
        m: { ...m, AX: sum, flags },
        what: `ALU: ${m.AX} + ${m.BX}; AX = ${hex(sum)}; ZF=${flags.ZF} SF=${flags.SF} CF=${flags.CF} OF=${flags.OF}`,
      }
    },
    units: ['control', 'registers', 'alu', 'flags'],
  },
  {
    address: 0x0108, bytes: [0xa3, 0x00, 0x02], text: 'MOV [0200h], AX',
    decode: 'MOV, destination memory 0200h, source AX',
    execute: (m) => {
      const lo = m.AX & 0xff
      const hi = m.AX >> 8
      return {
        m: { ...m, mem200: lo, mem201: hi },
        what: `EU asks BIU to write: [0200h] = ${byte(lo)}h, [0201h] = ${byte(hi)}h`,
      }
    },
    units: ['control', 'registers', 'biu', 'bus', 'memory'],
  },
]

const PHASES = ['Fetch', 'Decode', 'Execute'] as const

interface Stage {
  line: ProgramLine
  phase: (typeof PHASES)[number]
  text: string
  units: Unit[]
  after: Machine
  /** Memory addresses the bus touches in this stage. */
  touched: number[]
  queue: number[]
}

// Runs the program once, phase by phase, keeping the machine state after each.
function buildStages(): Stage[] {
  let m: Machine = { IP: 0x0100, AX: 0, BX: 0, flags: { ZF: 0, SF: 0, CF: 0, OF: 0 }, mem200: 0, mem201: 0 }
  const stages: Stage[] = []
  for (const line of PROGRAM) {
    const n = line.bytes.length
    const next = line.address + n
    const addrs = line.bytes.map((_, i) => line.address + i)
    m = { ...m, IP: next }
    stages.push({
      line, phase: 'Fetch', units: ['memory', 'bus', 'biu'], after: m, touched: addrs, queue: line.bytes,
      text: `The BIU reads ${n} bytes at ${hex(line.address)} (${line.bytes.map(byte).join(' ')}) into the instruction ` +
        `queue. IP moves past them to ${hex(next)}.`,
    })
    stages.push({
      line, phase: 'Decode', units: ['control'], after: m, touched: [], queue: line.bytes,
      text: `The control unit takes ${line.bytes.map(byte).join(' ')} from the queue and decodes it: ${line.decode}.`,
    })
    const done = line.execute(m)
    m = done.m
    stages.push({
      line, phase: 'Execute', units: line.units, after: m, touched: line.units.includes('memory') ? [0x0200, 0x0201] : [],
      queue: [], text: done.what,
    })
  }
  return stages
}

const STAGES = buildStages()
const INITIAL: Machine = { IP: 0x0100, AX: 0, BX: 0, flags: { ZF: 0, SF: 0, CF: 0, OF: 0 }, mem200: 0, mem201: 0 }
const CODE_BYTES = PROGRAM.flatMap((l) => l.bytes.map((b, i) => ({ address: l.address + i, value: b })))

export function FetchDecodeExecuteView({ onFinish }: { onFinish?: () => void }) {
  const [index, setIndex] = useState(0)
  const stage = STAGES[index]
  const before = index > 0 ? STAGES[index - 1].after : INITIAL
  const m = stage.after
  const last = index === STAGES.length - 1

  // Reaching the 4th instruction's Execute counts as having stepped through.
  useEffect(() => {
    if (last) onFinish?.()
  }, [last, onFinish])

  const on = (u: Unit) => (stage.units.includes(u) ? ' on' : '')
  const changed = (a: unknown, b: unknown) => (JSON.stringify(a) !== JSON.stringify(b) ? ' changed' : '')
  const flagText = (f: Machine['flags']) => `ZF=${f.ZF} SF=${f.SF} CF=${f.CF} OF=${f.OF}`

  return (
    <div className="panel fde-panel">
      <h3>Four instructions, three phases each</h3>
      <div className="fde-progress">
        {PROGRAM.map((line, li) => (
          <div key={line.address} className="fde-progress-line">
            <code>{line.text}</code>
            {PHASES.map((p, pi) => {
              const i = li * 3 + pi
              return (
                <button
                  key={p}
                  className={i === index ? 'fde-stage active' : i < index ? 'fde-stage done' : 'fde-stage'}
                  onClick={() => setIndex(i)}
                >
                  {p}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <p className="example-description fde-where">
        <strong>{stage.phase}: {stage.line.text}.</strong> {stage.text}
      </p>

      <div className="fde-body">
        <table className="fde-memory" aria-label="Memory">
          <thead><tr><th>Address</th><th>Byte</th></tr></thead>
          <tbody>
            {CODE_BYTES.map(({ address, value }) => (
              <tr key={address} className={stage.touched.includes(address) ? 'fde-hit' : undefined}>
                <td>{hex(address)}</td>
                <td>{byte(value)}{address === m.IP && <span className="fde-ip"> ◀ IP</span>}</td>
              </tr>
            ))}
            {m.IP === 0x010b && (
              <tr><td>{hex(0x010b)}</td><td>…<span className="fde-ip"> ◀ IP</span></td></tr>
            )}
            <tr className="fde-gap"><td colSpan={2}>⋮</td></tr>
            {[[0x0200, m.mem200, before.mem200], [0x0201, m.mem201, before.mem201]].map(([address, value, prev]) => (
              <tr key={address} className={`${stage.touched.includes(address) ? 'fde-hit' : ''}${changed(value, prev)}`}>
                <td>{hex(address)}</td>
                <td>{byte(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="fde-diagram" aria-label="CPU blocks; the ones working in this phase are lit">
          <div className={`fde-unit${on('memory')}`}>Memory</div>
          <div className={`fde-bus${on('bus')}`}>Bus</div>
          <div className={`fde-unit fde-biu${on('biu')}`}>
            <strong>BIU</strong>
            <span>IP = {hex(m.IP)}</span>
            <span>Instruction queue: {stage.queue.length ? stage.queue.map(byte).join(' ') : '(empty)'}</span>
          </div>
          <div className="fde-unit fde-eu">
            <strong>EU</strong>
            <span className={`fde-part${on('control')}`}>Control unit</span>
            <span className={`fde-part${on('registers')}`}>Registers</span>
            <span className={`fde-part${on('alu')}`}>ALU</span>
            <span className={`fde-part${on('flags')}`}>FLAGS</span>
          </div>
        </div>
      </div>

      <table className="fde-state">
        <tbody>
          <tr>
            <td>AX</td><td className={changed(m.AX, before.AX)}>{hex(m.AX)}</td>
            <td>BX</td><td className={changed(m.BX, before.BX)}>{hex(m.BX)}</td>
            <td>IP</td><td className={changed(m.IP, before.IP)}>{hex(m.IP)}</td>
            <td>FLAGS</td><td className={stage.units.includes('flags') ? ' changed' : ''}>{flagText(m.flags)}</td>
          </tr>
        </tbody>
      </table>

      <div className="fde-controls">
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>◀ Back</button>
        <button onClick={() => setIndex((i) => Math.min(STAGES.length - 1, i + 1))} disabled={last}>Next ▶</button>
        <span className="hw-playground-status">Step {index + 1} of {STAGES.length}</span>
      </div>
    </div>
  )
}
