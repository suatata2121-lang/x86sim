// Teaching views for Module 2's memory topics (issue #35): the Von Neumann /
// Harvard block diagrams, the BHE̅/A0 bank selector and the "which chip
// answers?" check after the memory-interfacing figure. None of them touch the
// Cpu -- the simulator's memory is flat and models no odd-address penalty, so
// these are standalone illustrations of the real 8086 bus.
import { useEffect, useState } from 'react'

function hex(value: number, digits: number) {
  return value.toString(16).toUpperCase().padStart(digits, '0') + 'h'
}

// ---------------------------------------------------------------------------
// Von Neumann vs Harvard
// ---------------------------------------------------------------------------

function CpuBox({ x }: { x: number }) {
  return (
    <g>
      <rect className="mb-box mb-cpu" x={x} y={8} width={120} height={62} rx={6} />
      <text className="mb-title" x={x + 60} y={24}>CPU</text>
      <rect className="mb-box" x={x + 8} y={32} width={48} height={28} rx={4} />
      <text className="mb-label" x={x + 32} y={50}>CU</text>
      <rect className="mb-box" x={x + 64} y={32} width={48} height={28} rx={4} />
      <text className="mb-label" x={x + 88} y={50}>ALU</text>
    </g>
  )
}

export function ArchCompareView() {
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig">
        <svg viewBox="0 0 260 180" role="img" aria-label="Von Neumann: one memory and one bus shared by instructions and data">
          <CpuBox x={70} />
          <line className="mb-bus" x1={130} y1={70} x2={130} y2={115} />
          <text className="mb-small mb-start" x={138} y={96}>one shared bus</text>
          <rect className="mb-box mb-mem" x={40} y={115} width={180} height={55} rx={6} />
          <text className="mb-title" x={130} y={138}>Memory</text>
          <text className="mb-small" x={130} y={156}>instructions + data</text>
        </svg>
        <figcaption>Von Neumann (8086)</figcaption>
      </figure>
      <figure className="mb-arch-fig">
        <svg viewBox="0 0 260 180" role="img" aria-label="Harvard: separate instruction and data memories, each with its own bus">
          <CpuBox x={70} />
          <line className="mb-bus" x1={100} y1={70} x2={62} y2={115} />
          <line className="mb-bus mb-bus-alt" x1={160} y1={70} x2={198} y2={115} />
          <text className="mb-small mb-end" x={74} y={92}>instr. bus</text>
          <text className="mb-small mb-start" x={186} y={92}>data bus</text>
          <rect className="mb-box mb-mem" x={5} y={115} width={115} height={55} rx={6} />
          <text className="mb-title" x={62} y={138}>Instruction</text>
          <text className="mb-small" x={62} y={156}>memory</text>
          <rect className="mb-box mb-mem-alt" x={140} y={115} width={115} height={55} rx={6} />
          <text className="mb-title" x={198} y={138}>Data</text>
          <text className="mb-small" x={198} y={156}>memory</text>
        </svg>
        <figcaption>Harvard (PIC, AVR, DSPs)</figcaption>
      </figure>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bank selector: BHE̅ and A0
// ---------------------------------------------------------------------------

export const BANK_CASES = [
  { id: 'bank-even-byte', label: 'Byte at an even address' },
  { id: 'bank-odd-byte', label: 'Byte at an odd address' },
  { id: 'bank-even-word', label: 'Word at an even address' },
  { id: 'bank-odd-word', label: 'Word at an odd address' },
] as const

interface BusCycle {
  /** Address of the byte(s) this cycle moves; A0 is its low bit. */
  address: number
  a0: 0 | 1
  bhe: 0 | 1
  low: boolean
  high: boolean
  what: string
}

function cyclesFor(address: number, word: boolean): BusCycle[] {
  const odd = (address & 1) === 1
  const next = (address + 1) & 0xfffff
  if (!word) {
    return odd
      ? [{ address, a0: 1, bhe: 0, low: false, high: true, what: `the byte at ${hex(address, 5)}` }]
      : [{ address, a0: 0, bhe: 1, low: true, high: false, what: `the byte at ${hex(address, 5)}` }]
  }
  if (!odd) {
    return [{
      address, a0: 0, bhe: 0, low: true, high: true,
      what: `low byte at ${hex(address, 5)} and high byte at ${hex(next, 5)}`,
    }]
  }
  // An odd word straddles two bank rows: the low byte sits in the odd bank at
  // `address`, the high byte in the even bank one row up.
  return [
    { address, a0: 1, bhe: 0, low: false, high: true, what: `low byte of the word, at ${hex(address, 5)}` },
    { address: next, a0: 0, bhe: 1, low: true, high: false, what: `high byte of the word, at ${hex(next, 5)}` },
  ]
}

function dataLines(c: BusCycle) {
  return c.low && c.high ? 'D15–D0' : c.high ? 'D15–D8' : 'D7–D0'
}

function parseAddress(text: string): number | null {
  const t = text.trim().replace(/h$/i, '')
  if (!/^[0-9a-f]{1,5}$/i.test(t)) return null
  return parseInt(t, 16)
}

function BankDrawing({ cycle }: { cycle: BusCycle }) {
  // Four rows of each bank around the accessed one; a row holds the even
  // address (low bank) and the odd address above it (high bank).
  const row = cycle.address & 0xffffe
  const rows = [-2, 0, 2, 4].map((d) => (row + d + 0x100000) & 0xffffe)
  const cell = (addr: number, on: boolean, hit: boolean) => (
    <div key={addr} className={`mb-cell${on && hit ? ' hit' : ''}`}>{hex(addr, 5)}</div>
  )
  return (
    <div className="mb-banks">
      <div className={`mb-bank${cycle.high ? ' on' : ''}`}>
        <div className="mb-bank-head">Odd (high) bank</div>
        <div className="mb-bank-sub">BHE̅ = {cycle.bhe} · D15–D8</div>
        {[...rows].reverse().map((r) => cell(r + 1, cycle.high, r === row))}
      </div>
      <div className={`mb-bank${cycle.low ? ' on' : ''}`}>
        <div className="mb-bank-head">Even (low) bank</div>
        <div className="mb-bank-sub">A0 = {cycle.a0} · D7–D0</div>
        {[...rows].reverse().map((r) => cell(r, cycle.low, r === row))}
      </div>
    </div>
  )
}

/** `tried` holds the case ids already recorded (BANK_CASES). */
export function BankSelectorView({ tried, onTried }: { tried?: Set<string>; onTried?: (caseId: string) => void }) {
  const [text, setText] = useState('F0003')
  const [word, setWord] = useState(false)
  const [cycleIdx, setCycleIdx] = useState(0)
  // The starting case only counts once the student has changed something.
  const [touched, setTouched] = useState(false)
  const [triedHere, setTriedHere] = useState<Set<string>>(new Set())

  const address = parseAddress(text)
  const caseId = address === null ? null : `bank-${address & 1 ? 'odd' : 'even'}-${word ? 'word' : 'byte'}`

  useEffect(() => {
    if (!touched || !caseId) return
    setTriedHere((s) => (s.has(caseId) ? s : new Set(s).add(caseId)))
    onTried?.(caseId)
    // onTried is a fresh closure every render; only a new case should record.
  }, [touched, caseId])

  const cycles = address === null ? [] : cyclesFor(address, word)
  const cycle = cycles[Math.min(cycleIdx, cycles.length - 1)]

  function edit(nextText: string, nextWord: boolean) {
    setText(nextText)
    setWord(nextWord)
    setCycleIdx(0)
    setTouched(true)
  }

  return (
    <div className="panel mb-selector">
      <h3>Bank Selector</h3>
      <div className="mb-inputs">
        <label>
          Address{' '}
          <input
            className="mb-address"
            value={text}
            maxLength={6}
            spellCheck={false}
            onChange={(e) => edit(e.target.value, word)}
          />
        </label>
        <div className="reg-format" role="radiogroup" aria-label="Access size">
          <button role="radio" aria-checked={!word} className={!word ? 'mode-tab active' : 'mode-tab'} onClick={() => edit(text, false)}>Byte</button>
          <button role="radio" aria-checked={word} className={word ? 'mode-tab active' : 'mode-tab'} onClick={() => edit(text, true)}>Word</button>
        </div>
      </div>

      {address === null || !cycle ? (
        <p className="moveit-error">Type a 20-bit address in hex, 00000 to FFFFF (for example 1A3F5).</p>
      ) : (
        <>
          {cycles.length > 1 && (
            <div className="fde-stages">
              {cycles.map((_, i) => (
                <button key={i} className={i === cycleIdx ? 'fde-stage active' : 'fde-stage'} onClick={() => setCycleIdx(i)}>
                  Bus cycle {i + 1}
                </button>
              ))}
            </div>
          )}
          <BankDrawing cycle={cycle} />
          <table className="fde-state">
            <tbody>
              <tr><td>Transfer</td><td>{cycle.what}</td></tr>
              <tr><td>A0</td><td>{cycle.a0}</td></tr>
              <tr><td>BHE̅</td><td>{cycle.bhe}</td></tr>
              <tr><td>Banks enabled</td><td>{cycle.low && cycle.high ? 'both' : cycle.high ? 'odd (high) only' : 'even (low) only'}</td></tr>
              <tr><td>Data lines</td><td>{dataLines(cycle)}</td></tr>
              <tr><td>Bus cycles</td><td>{cycles.length}{cycles.length > 1 ? ` (this is cycle ${cycleIdx + 1})` : ''}</td></tr>
            </tbody>
          </table>
          {cycles.length > 1 && (
            <p className="moveit-hint">
              A word at an odd address does not fit one bank row, so the 8086 splits it into two bus cycles --
              {cycleIdx === 0 ? ' press "Bus cycle 2" to see the second half.' : ' twice the time of an aligned word.'}
            </p>
          )}
        </>
      )}

      <ul className="mb-cases">
        {BANK_CASES.map((c) => {
          const done = triedHere.has(c.id) || !!tried?.has(c.id)
          return <li key={c.id} className={done ? 'done' : ''}>{done ? '✓' : '○'} {c.label}</li>
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Memory interfacing check: which chip answers?
// ---------------------------------------------------------------------------

const CHIP_OPTIONS = ['EPROM 1 (even)', 'EPROM 2 (odd)', 'RAM 1 (even)', 'RAM 2 (odd)', 'RAM 1 and RAM 2', 'No chip']

const CHIP_QUESTIONS: { q: string; answer: string; why: string }[] = [
  {
    q: 'Which chip answers a byte read at F0003h?',
    answer: 'EPROM 2 (odd)',
    why: 'A19–A16 = 1111 selects the EPROM pair. The address is odd, so BHE̅ = 0 and A0 = 1: only the odd (high-byte) chip is enabled, on D15–D8.',
  },
  {
    q: 'Which chip answers a byte read at 1A000h?',
    answer: 'RAM 1 (even)',
    why: 'A19–A17 = 000 selects the RAM pair (1A000h is below 20000h). The address is even, so A0 = 0 and BHE̅ = 1: only the even chip, on D7–D0.',
  },
  {
    q: 'A word is read from 00010h. Which chips answer?',
    answer: 'RAM 1 and RAM 2',
    why: 'An even word address puts A0 = 0 and BHE̅ = 0, so both RAM chips are enabled in one bus cycle: 00010h from RAM 1 and 00011h from RAM 2.',
  },
]

export function ChipCheckView() {
  const [picked, setPicked] = useState<(string | null)[]>(CHIP_QUESTIONS.map(() => null))
  return (
    <div className="panel mb-check">
      <h3>Check: which chip answers?</h3>
      <p className="example-description">Use the address map above. Not graded -- it is for you.</p>
      <ol>
        {CHIP_QUESTIONS.map((item, i) => {
          const choice = picked[i]
          const right = choice === item.answer
          return (
            <li key={item.q}>
              <p>{item.q}</p>
              <div className="mb-options">
                {CHIP_OPTIONS.map((o) => (
                  <button
                    key={o}
                    className={choice === o ? (right ? 'mb-right' : 'mb-wrong') : ''}
                    onClick={() => setPicked((p) => p.map((x, j) => (j === i ? o : x)))}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {choice && (
                <p className={right ? 'mb-feedback-right' : 'moveit-error'}>
                  {right ? 'Correct. ' : 'Not quite. '}{right ? item.why : 'Check A0, BHE̅ and the fixed high bits again.'}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
