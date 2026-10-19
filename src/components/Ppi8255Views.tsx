// Learn-page views for the 8255 topics (issue #37): the block diagram, the
// I/O-mode control-word builder and the BSR builder. They only decode words
// (core/ppi8255.ts); nothing here runs the Cpu.
import { useEffect, useState } from 'react'
import { decodeBsrWord, decodeControlWord } from '../core/ppi8255'

function hex2(v: number) {
  return v.toString(16).toUpperCase().padStart(2, '0') + 'h'
}

export function Box({ x, y, w, h, title, sub, className }: {
  x: number; y: number; w: number; h: number; title: string; sub?: string; className?: string
}) {
  return (
    <g>
      <rect className={`mb-box${className ? ` ${className}` : ''}`} x={x} y={y} width={w} height={h} rx={5} />
      <text className="mb-label" x={x + w / 2} y={sub ? y + h / 2 - 3 : y + h / 2 + 4}>{title}</text>
      {sub && <text className="mb-small" x={x + w / 2} y={y + h / 2 + 11}>{sub}</text>}
    </g>
  )
}

export function PpiBlockDiagram() {
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 215" role="img" aria-label="8255 block diagram: data bus buffer and read/write logic on an internal bus, Group A control driving Port A and Port C upper, Group B control driving Port C lower and Port B">
          <Box x={10} y={20} w={110} h={45} title="Data bus buffer" sub="D7–D0 to/from CPU" className="mb-cpu" />
          <Box x={10} y={145} w={110} h={50} title="Read/write logic" sub="RD̅ WR̅ A1 A0 RESET CS̅" className="mb-cpu" />
          <line className="mb-bus" x1={140} y1={30} x2={140} y2={185} />
          <text className="mb-small" x={131} y={110} transform="rotate(-90 131 110)">internal bus</text>
          <line className="mb-bus" x1={120} y1={42} x2={160} y2={42} />
          <line className="mb-bus" x1={120} y1={170} x2={160} y2={170} />
          <Box x={160} y={20} w={100} h={45} title="Group A control" className="mb-mem" />
          <Box x={160} y={148} w={100} h={45} title="Group B control" className="mb-mem-alt" />
          <line className="mb-bus" x1={260} y1={32} x2={290} y2={25} />
          <line className="mb-bus" x1={260} y1={55} x2={290} y2={67} />
          <line className="mb-bus mb-bus-alt" x1={260} y1={160} x2={290} y2={148} />
          <line className="mb-bus mb-bus-alt" x1={260} y1={182} x2={290} y2={190} />
          <Box x={290} y={8} w={120} h={34} title="Port A" sub="PA7–PA0" className="mb-mem" />
          <Box x={290} y={50} w={120} h={34} title="Port C upper" sub="PC7–PC4" className="mb-mem" />
          <Box x={290} y={131} w={120} h={34} title="Port C lower" sub="PC3–PC0" className="mb-mem-alt" />
          <Box x={290} y={173} w={120} h={34} title="Port B" sub="PB7–PB0" className="mb-mem-alt" />
        </svg>
        <figcaption>8255 PPI: Group A = Port A + PC7–PC4, Group B = Port B + PC3–PC0</figcaption>
      </figure>
    </div>
  )
}

// ---------------------------------------------------------------------------
// I/O-mode control word builder
// ---------------------------------------------------------------------------

const IO_BITS: { bit: number; label: string }[] = [
  { bit: 7, label: 'Mode set flag (1)' },
  { bit: 6, label: 'A mode' },
  { bit: 5, label: 'A mode' },
  { bit: 4, label: 'Port A 1 = in' },
  { bit: 3, label: 'C upper 1 = in' },
  { bit: 2, label: 'B mode' },
  { bit: 1, label: 'Port B 1 = in' },
  { bit: 0, label: 'C lower 1 = in' },
]

export const CONTROL_WORD_PARTS = ['ppi-cw-1', 'ppi-cw-2', 'ppi-cw-3']

function BitBoxes({ word, bits, locked, onToggle }: {
  word: number
  bits: { bit: number; label: string }[]
  locked: (bit: number) => boolean
  onToggle: (bit: number) => void
}) {
  return (
    <div className="ppi-bits">
      {bits.map(({ bit, label }) => (
        <button
          key={bit}
          className={`ppi-bit${(word >> bit) & 1 ? ' on' : ''}`}
          disabled={locked(bit)}
          title={label}
          onClick={() => onToggle(bit)}
        >
          <span className="ppi-bit-name">D{bit}</span>
          <span className="ppi-bit-value">{(word >> bit) & 1}</span>
          <span className="ppi-bit-label">{label}</span>
        </button>
      ))}
    </div>
  )
}

/** `done` holds the part ids already recorded (CONTROL_WORD_PARTS). */
export function ControlWordBuilder({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [word, setWord] = useState(0x80)
  const [text, setText] = useState('80')
  // Words built here, so the count only grows with words the student made.
  const [built, setBuilt] = useState<Set<number>>(new Set())

  function choose(next: number, nextText = next.toString(16).toUpperCase().padStart(2, '0')) {
    setWord(next)
    setText(nextText)
    if (next & 0x80) setBuilt((s) => (s.has(next) ? s : new Set(s).add(next)))
  }

  useEffect(() => {
    if (built.size === 0) return
    onDone?.(CONTROL_WORD_PARTS[Math.min(built.size, CONTROL_WORD_PARTS.length) - 1])
    // onDone is a fresh closure every render; only a new word should record.
  }, [built.size])

  const typed = /^[0-9a-f]{1,2}h?$/i.test(text.trim()) ? parseInt(text.trim().replace(/h$/i, ''), 16) : null
  const c = decodeControlWord(word)
  const recorded = CONTROL_WORD_PARTS.filter((p) => done?.has(p)).length
  const count = Math.max(recorded, Math.min(built.size, CONTROL_WORD_PARTS.length))

  return (
    <div className="panel ppi-builder">
      <h3>Control Word Builder</h3>
      <p className="example-description">Click the bits to build a word, or type a hex value to decode one.</p>
      <BitBoxes word={word} bits={IO_BITS} locked={(b) => b === 7} onToggle={(b) => choose(word ^ (1 << b))} />
      <div className="mb-inputs">
        <label>
          Hex{' '}
          <input
            className="mb-address"
            value={text}
            maxLength={3}
            spellCheck={false}
            onChange={(e) => {
              const t = e.target.value
              const v = /^[0-9a-f]{1,2}h?$/i.test(t.trim()) ? parseInt(t.trim().replace(/h$/i, ''), 16) : null
              if (v !== null && v & 0x80) choose(v, t)
              else setText(t)
            }}
          />
        </label>
        <code className="ppi-word">{hex2(word)} = {word.toString(2).padStart(8, '0')}b</code>
      </div>
      {typed !== null && (typed & 0x80) === 0 && (
        <p className="moveit-hint">
          {hex2(typed)} has D7 = 0, so it is a BSR word, not an I/O-mode word: it would{' '}
          {decodeBsrWord(typed).set ? 'set' : 'reset'} PC{decodeBsrWord(typed).bit}. See "Bit Set/Reset (BSR) Mode".
        </p>
      )}
      {typed === null && <p className="moveit-error">Type a byte in hex, 80 to FF.</p>}
      <table className="fde-state">
        <tbody>
          <tr><td>Port A</td><td>{c.aIn ? 'input' : 'output'}, mode {c.aMode}</td></tr>
          <tr><td>Port B</td><td>{c.bIn ? 'input' : 'output'}, mode {c.bMode}</td></tr>
          <tr><td>Port C upper (PC7–PC4)</td><td>{c.cUpperIn ? 'input' : 'output'}</td></tr>
          <tr><td>Port C lower (PC3–PC0)</td><td>{c.cLowerIn ? 'input' : 'output'}</td></tr>
          <tr><td>Program it</td><td>MOV AL, {word >= 0xa0 ? '0' : ''}{hex2(word)} / OUT 83h, AL</td></tr>
        </tbody>
      </table>
      {(c.aMode !== 0 || c.bMode !== 0) && (
        <p className="example-description">
          {c.aMode === 2 ? 'Mode 2 uses five Port C lines for Port A\'s handshake.' : 'Mode 1 uses three Port C lines per port for the handshake.'}{' '}
          This simulator runs every port as Mode 0.
        </p>
      )}
      <p className="mb-cases"><span className={count >= 3 ? 'done' : ''}>Control words built: {count}/3</span></p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BSR builder
// ---------------------------------------------------------------------------

const BSR_BITS: { bit: number; label: string }[] = [
  { bit: 7, label: 'BSR flag (0)' },
  { bit: 6, label: "don't care" },
  { bit: 5, label: "don't care" },
  { bit: 4, label: "don't care" },
  { bit: 3, label: 'Bit select' },
  { bit: 2, label: 'Bit select' },
  { bit: 1, label: 'Bit select' },
  { bit: 0, label: '1 = set, 0 = reset' },
]

export const BSR_PARTS = ['ppi-bsr-set', 'ppi-bsr-reset']

export function BsrBuilder({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [word, setWord] = useState(0x07)
  const [portC, setPortC] = useState(0x00)
  const [didHere, setDidHere] = useState<Set<string>>(new Set())
  const { bit, set } = decodeBsrWord(word)
  const after = set ? portC | (1 << bit) : portC & ~(1 << bit)

  function send() {
    setPortC(after)
    const part = set ? 'ppi-bsr-set' : 'ppi-bsr-reset'
    setDidHere((s) => new Set(s).add(part))
    onDone?.(part)
  }

  return (
    <div className="panel ppi-builder">
      <h3>BSR Builder</h3>
      <p className="example-description">Pick a Port C bit and set or reset it, then send the word to the control register.</p>
      <BitBoxes word={word} bits={BSR_BITS} locked={(b) => b >= 4} onToggle={(b) => setWord(word ^ (1 << b))} />
      <div className="mb-inputs">
        <code className="ppi-word">{hex2(word)} = {word.toString(2).padStart(8, '0')}b</code>
        <span>→ {set ? 'set' : 'reset'} PC{bit}</span>
        <button onClick={send}>OUT 83h, AL</button>
      </div>
      <div className="ppi-c-row" aria-label="Port C">
        {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => (
          <span key={b} className={`ppi-c-cell${b === bit ? ' target' : ''}`}>
            <span className={`ppi-c-led${(portC >> b) & 1 ? ' on' : ''}`} />
            PC{b}
          </span>
        ))}
      </div>
      <p className="example-description">
        Port C now {hex2(portC)}; after this word it would be {hex2(after)}. Only PC{bit} can change -- the other seven bits stay as they are.
      </p>
      <ul className="mb-cases">
        {BSR_PARTS.map((p) => {
          const ok = didHere.has(p) || !!done?.has(p)
          return <li key={p} className={ok ? 'done' : ''}>{ok ? '✓' : '○'} {p === 'ppi-bsr-set' ? 'Set a bit' : 'Reset a bit'}</li>
        })}
      </ul>
    </div>
  )
}
