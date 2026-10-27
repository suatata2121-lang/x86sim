// Learn views for the segments / addressing modes / byte order topics
// (issue #48). The simulator's memory is flat (see "Segmented Addressing vs
// This Simulator's Flat Model"), so these compute real-8086 addresses on
// their own instead of running the Cpu.
import { useEffect, useState } from 'react'

const hex = (v: number, digits: number) => v.toString(16).toUpperCase().padStart(digits, '0') + 'h'

/** "1A3Fh", "1a3f", "0x1A3F" -> number; null when it isn't hex or is too long. */
function parseHex(text: string, maxDigits: number): number | null {
  const t = text.trim().replace(/^0x/i, '').replace(/h$/i, '')
  if (!t || t.length > maxDigits || !/^[0-9a-f]+$/i.test(t)) return null
  const v = parseInt(t, 16)
  return v < 16 ** maxDigits ? v : null
}

function HexInput({ label, value, onChange, digits, width = '6rem' }: {
  label: string
  value: string
  onChange: (v: string) => void
  digits: number
  width?: string
}) {
  return (
    <label className="sv-field">
      <span>{label}</span>
      <input
        className="mb-address"
        style={{ width }}
        value={value}
        maxLength={digits + 2}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Program segments: memory map, calculator, practice
// ---------------------------------------------------------------------------

const MAP_SEGMENTS = [
  { reg: 'DS', seg: 0x2000, cls: 'mb-mem' },
  { reg: 'CS', seg: 0x3000, cls: 'mb-cpu' },
  { reg: 'SS', seg: 0x5000, cls: 'mb-mem-alt' },
  { reg: 'ES', seg: 0x7000, cls: 'mb-mem' },
]

export function SegmentMapDiagram() {
  // 00000h at the top, FFFFFh at the bottom; 1 MB = 240 px, so 64 KB = 15 px.
  const y = (addr: number) => 14 + (addr / 0x100000) * 240
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 270" role="img" aria-label="1 MB memory map with DS = 2000h, CS = 3000h, SS = 5000h and ES = 7000h, each a 64 KB block">
          <rect className="mb-box" x={130} y={y(0)} width={90} height={240} rx={4} />
          <text className="mb-small mb-end" x={124} y={y(0) + 4}>00000h</text>
          <text className="mb-small mb-end" x={124} y={y(0x100000)}>FFFFFh</text>
          {MAP_SEGMENTS.map(({ reg, seg, cls }) => {
            const start = seg * 16
            return (
              <g key={reg}>
                <rect className={`mb-box ${cls}`} x={130} y={y(start)} width={90} height={15} />
                <text className="mb-label" x={175} y={y(start) + 11}>{reg}</text>
                <line className="mb-bus" x1={222} y1={y(start) + 7} x2={236} y2={y(start) + 7} />
                <text className="mb-small mb-start" x={240} y={y(start) + 11}>
                  {reg} = {hex(seg, 4)} → {hex(start, 5)}–{hex(start + 0xffff, 5)}
                </text>
              </g>
            )
          })}
        </svg>
        <figcaption>Each segment register points at a 64 KB block that starts at segment × 10h</figcaption>
      </figure>
    </div>
  )
}

/** The slide's three-column working: shifted segment + offset = physical. */
function Working({ seg, off }: { seg: number; off: number }) {
  const sum = seg * 16 + off
  return (
    <table className="fde-state sv-working">
      <tbody>
        <tr><td>Segment × 10h (shift left 4 bits)</td><td>{hex(seg * 16, 5)}</td></tr>
        <tr><td>+ Offset</td><td>{hex(off, 4)}</td></tr>
        <tr>
          <td>= Physical address</td>
          <td>
            {sum > 0xfffff
              ? <>{hex(sum, 6)} exceeds 1 MB → wraps to <strong>{hex(sum & 0xfffff, 5)}</strong></>
              : <strong>{hex(sum, 5)}</strong>}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export function SegmentCalculator() {
  const [segText, setSegText] = useState('1980')
  const [offText, setOffText] = useState('78FE')
  const seg = parseHex(segText, 4)
  const off = parseHex(offText, 4)
  return (
    <div className="panel">
      <h3>Segment Calculator</h3>
      <div className="mb-inputs">
        <HexInput label="Segment" value={segText} onChange={setSegText} digits={4} />
        <HexInput label="Offset" value={offText} onChange={setOffText} digits={4} />
      </div>
      {seg === null || off === null ? (
        <p className="moveit-error">Type the segment and the offset in hex, 0000 to FFFF.</p>
      ) : (
        <>
          <p className="example-description">Logical address <code>{hex(seg, 4).slice(0, -1)}:{hex(off, 4).slice(0, -1)}</code></p>
          <Working seg={seg} off={off} />
          <p className="example-description">
            This segment spans {hex(seg * 16, 5)} (segment × 10h) to{' '}
            {seg * 16 + 0xffff > 0xfffff
              ? <>{hex(seg * 16 + 0xffff, 6)}, which wraps past FFFFFh to {hex((seg * 16 + 0xffff) & 0xfffff, 5)}</>
              : hex(seg * 16 + 0xffff, 5)}{' '}
            (+ FFFFh).
          </p>
        </>
      )}
    </div>
  )
}

type PracticeKind = 'physical' | 'lower' | 'upper' | 'overlap' | 'wrap'

interface PracticeQuestion {
  kind: PracticeKind
  prompt: string
  answer: number
  digits: number
  working: string
}

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const h4 = (v: number) => hex(v, 4)
const h5 = (v: number) => hex(v, 5)

function makeQuestion(kind: PracticeKind): PracticeQuestion {
  switch (kind) {
    case 'physical': {
      const seg = rand(0x0100, 0xefff)
      const off = rand(0, 0xffff)
      const p = seg * 16 + off
      return {
        kind,
        prompt: `What physical address does ${h4(seg).slice(0, -1)}:${h4(off).slice(0, -1)} name?`,
        answer: p,
        digits: 5,
        working: `${h5(seg * 16)} + ${h4(off)} = ${h5(p)}`,
      }
    }
    case 'lower': {
      const seg = rand(0x0100, 0xefff)
      return {
        kind,
        prompt: `A segment register holds ${h4(seg)}. Where does the segment start (lower range)?`,
        answer: seg * 16,
        digits: 5,
        working: `${h4(seg)} × 10h = ${h5(seg * 16)}`,
      }
    }
    case 'upper': {
      const seg = rand(0x0100, 0xefff)
      return {
        kind,
        prompt: `A segment register holds ${h4(seg)}. Where does the segment end (upper range)?`,
        answer: seg * 16 + 0xffff,
        digits: 5,
        working: `${h5(seg * 16)} + FFFFh = ${h5(seg * 16 + 0xffff)}`,
      }
    }
    case 'overlap': {
      const s1 = rand(0x1000, 0xe000)
      const o1 = rand(0, 0x7fff)
      const s2 = s1 - rand(1, 0x7ff)
      const p = s1 * 16 + o1
      const o2 = p - s2 * 16
      return {
        kind,
        prompt: `S1:O1 = ${h4(s1).slice(0, -1)}:${h4(o1).slice(0, -1)}. Which offset O2 makes ${h4(s2).slice(0, -1)}:O2 the same byte?`,
        answer: o2,
        digits: 4,
        working: `${h5(s1 * 16)} + ${h4(o1)} = ${h5(p)}; ${h5(p)} − ${h5(s2 * 16)} = ${h4(o2)}`,
      }
    }
    case 'wrap': {
      // F100h or above, so some offset up to FFFFh always crosses FFFFFh.
      const seg = rand(0xf100, 0xffff)
      const off = rand(0x10000 - (seg * 16 - 0xf0000) + 0x10, 0xffff)
      const sum = seg * 16 + off
      return {
        kind,
        prompt: `Which address does the 8086 put on its 20 address lines for ${h4(seg).slice(0, -1)}:${h4(off).slice(0, -1)}?`,
        answer: sum & 0xfffff,
        digits: 5,
        working: `${h5(seg * 16)} + ${h4(off)} = ${hex(sum, 6)}, past FFFFFh: bit 20 is dropped → ${h5(sum & 0xfffff)}`,
      }
    }
  }
}

const KINDS: PracticeKind[] = ['physical', 'lower', 'upper', 'overlap', 'wrap']
export const SEGMENT_PRACTICE_PARTS = ['seg-practice-1', 'seg-practice-2', 'seg-practice-3', 'seg-practice-4', 'seg-practice-5']

/** `done` holds the part ids already recorded (SEGMENT_PRACTICE_PARTS). */
export function SegmentPractice({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [round, setRound] = useState(0)
  const [q, setQ] = useState(() => makeQuestion(KINDS[0]))
  const [text, setText] = useState('')
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null)
  const [correct, setCorrect] = useState(0)
  const recorded = SEGMENT_PRACTICE_PARTS.filter((p) => done?.has(p)).length
  const shown = Math.max(recorded, correct)

  useEffect(() => {
    if (correct > 0 && correct <= SEGMENT_PRACTICE_PARTS.length) onDone?.(SEGMENT_PRACTICE_PARTS[correct - 1])
    // onDone is a fresh closure every render; only a new right answer should record.
  }, [correct])

  function check() {
    const v = parseHex(text, q.digits)
    const right = v === q.answer
    setVerdict(right ? 'right' : 'wrong')
    if (right) setCorrect((n) => n + 1)
  }

  function next() {
    const r = round + 1
    setRound(r)
    // Cycle through every question style, so each comes up within five.
    setQ(makeQuestion(KINDS[r % KINDS.length]))
    setText('')
    setVerdict(null)
  }

  return (
    <div className="panel">
      <h3>Segment Practice</h3>
      <p className="example-description">{q.prompt}</p>
      <div className="mb-inputs">
        <HexInput label="Answer (hex)" value={text} onChange={(v) => { setText(v); if (verdict === 'wrong') setVerdict(null) }} digits={q.digits} />
        {verdict === 'right'
          ? <button className="primary" onClick={next}>Next question</button>
          : <button onClick={check} disabled={!text.trim()}>Check</button>}
        {verdict === 'wrong' && <button onClick={next}>Skip</button>}
      </div>
      {verdict === 'right' && <p className="mb-feedback-right">Correct: {q.working}.</p>}
      {verdict === 'wrong' && (
        <p className="moveit-error">
          Not quite.{' '}
          {q.kind === 'wrap'
            ? 'Add the shifted segment and the offset, then remember the 8086 has only 20 address lines.'
            : q.kind === 'overlap'
              ? 'Work out the physical address of S1:O1, then subtract S2 × 10h.'
              : 'Shift the segment left by one hex digit (× 10h) before adding.'}
        </p>
      )}
      <ul className="mb-cases"><li className={shown >= 5 ? 'done' : ''}>Right answers: {Math.min(shown, 5)}/5</li></ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Effective address calculator
// ---------------------------------------------------------------------------

type SegReg = 'CS' | 'DS' | 'SS' | 'ES'
type AddrReg = 'BX' | 'BP' | 'SI' | 'DI'
const REG_FIELDS = ['DS', 'SS', 'ES', 'CS', 'BX', 'BP', 'SI', 'DI'] as const
type RegField = (typeof REG_FIELDS)[number]

const PRESET_REGS: Record<RegField, string> = {
  DS: '1200', SS: '1300', ES: '1400', CS: '0000', BX: '0100', BP: '0010', SI: '0020', DI: '0004',
}

const PRESETS = [
  'MOV AX, [BX+SI+0010h]',
  'MOV AX, [BP+DI+0020h]',
  'MOV AX, ES:[BX+DI+0010h]',
  'MOV AX, SS:[SI+BP+0008h]',
]
export const EA_PRESET_PARTS = ['ea-preset-1', 'ea-preset-2', 'ea-preset-3', 'ea-preset-4']

type EaResult =
  | { ok: false; reason: string }
  | { ok: true; mode: string; regs: AddrReg[]; disp: number; hasDisp: boolean; override: SegReg | null }

const GENERAL_REGS = ['AX', 'CX', 'DX', 'SP', 'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH', 'CS', 'DS', 'SS', 'ES', 'IP']

/** Parses "[BP+DI+20h]", "ES:[BX]" or a whole instruction, the way the 8086 would accept it. */
function parseMemoryOperand(text: string): EaResult {
  const m = text.match(/(?:\b(CS|DS|SS|ES)\s*:\s*)?\[([^\]]*)\]/i)
  if (!m) return { ok: false, reason: 'Type a memory operand in square brackets, e.g. [BX+SI+10h] or ES:[DI].' }
  const override = m[1] ? (m[1].toUpperCase() as SegReg) : null
  const terms = m[2].replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean)
  if (!terms.length) return { ok: false, reason: 'The brackets are empty.' }
  const regs: AddrReg[] = []
  let disp = 0
  let hasDisp = false
  for (const term of terms) {
    const t = term.toUpperCase()
    if (t === 'BX' || t === 'BP' || t === 'SI' || t === 'DI') {
      regs.push(t)
      continue
    }
    if (GENERAL_REGS.includes(t)) {
      return { ok: false, reason: `${t} cannot address memory: only BX or BP (base) and SI or DI (index) can go inside the brackets.` }
    }
    const neg = t.startsWith('-')
    const body = neg ? t.slice(1) : t
    const v = /^[0-9][0-9A-F]*H$/.test(body) ? parseInt(body.slice(0, -1), 16) : /^[0-9]+$/.test(body) ? parseInt(body, 10) : NaN
    if (Number.isNaN(v) || v > 0xffff) return { ok: false, reason: `"${term}" is not a register or a number (write hex with an h, e.g. 20h).` }
    disp += neg ? -v : v
    hasDisp = true
  }
  const bases = regs.filter((r) => r === 'BX' || r === 'BP')
  const indexes = regs.filter((r) => r === 'SI' || r === 'DI')
  if (bases.length > 1) return { ok: false, reason: `${bases.join(' + ')}: two base registers. The 8086 adds at most one base (BX or BP) and one index (SI or DI).` }
  if (indexes.length > 1) return { ok: false, reason: `${indexes.join(' + ')}: two index registers. The 8086 adds at most one base (BX or BP) and one index (SI or DI).` }
  const mode = regs.length === 0
    ? 'Direct'
    : regs.length === 1
      ? hasDisp ? 'Register relative' : 'Register indirect'
      : hasDisp ? 'Based relative plus indexed' : 'Based indexed'
  return { ok: true, mode, regs, disp, hasDisp, override }
}

/** `done` holds the part ids already recorded (EA_PRESET_PARTS). */
export function EaCalculator({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [operand, setOperand] = useState(PRESETS[0])
  const [regText, setRegText] = useState<Record<RegField, string>>(PRESET_REGS)
  const [ranHere, setRanHere] = useState<Set<string>>(new Set())

  function runPreset(i: number) {
    setOperand(PRESETS[i])
    setRegText(PRESET_REGS)
    setRanHere((s) => new Set(s).add(EA_PRESET_PARTS[i]))
    onDone?.(EA_PRESET_PARTS[i])
  }

  const regs = Object.fromEntries(REG_FIELDS.map((r) => [r, parseHex(regText[r], 4)])) as Record<RegField, number | null>
  const badReg = REG_FIELDS.find((r) => regs[r] === null)
  const parsed = parseMemoryOperand(operand)

  let body
  if (badReg) {
    body = <p className="moveit-error">{badReg} must be a hex value, 0000 to FFFF.</p>
  } else if (!parsed.ok) {
    body = <p className="moveit-error">Not a valid 8086 memory operand: {parsed.reason}</p>
  } else {
    const val = (r: RegField) => regs[r] as number
    const ea = (parsed.regs.reduce((sum, r) => sum + val(r), 0) + parsed.disp) & 0xffff
    const usesBp = parsed.regs.includes('BP')
    const seg: SegReg = parsed.override ?? (usesBp ? 'SS' : 'DS')
    const why = parsed.override
      ? `${seg} because of the ${seg}: override prefix${parsed.override === 'SS' && usesBp ? ' (SS is also the default here, because of BP)' : ''}`
      : usesBp
        ? 'SS, the default for any operand that contains BP'
        : parsed.regs.length
          ? 'DS, the default for BX, SI and DI'
          : 'DS, the default for a direct address'
    const terms = [
      ...parsed.regs.map((r) => `${r} (${hex(val(r), 4)})`),
      ...(parsed.hasDisp ? [hex(parsed.disp & 0xffff, 4)] : []),
    ]
    const physical = val(seg) * 16 + ea
    body = (
      <table className="fde-state">
        <tbody>
          <tr><td>Addressing mode</td><td>{parsed.mode}</td></tr>
          {/* Keyed by value so the row remounts and flashes on every change:
              students missed that the result follows their edits (#69). */}
          <tr key={`ea-${ea}`} className="sv-flash"><td>Effective address</td><td>{terms.join(' + ')} = {hex(ea, 4)}</td></tr>
          <tr><td>Segment</td><td>{why}</td></tr>
          <tr key={`pa-${seg}-${physical}`} className="sv-flash">
            <td>Physical address</td>
            <td>
              {seg} × 10h + EA = {hex(val(seg) * 16, 5)} + {hex(ea, 4)} ={' '}
              <strong>{hex(physical & 0xfffff, 5)}</strong>{physical > 0xfffff ? ' (wrapped past FFFFFh)' : ''}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <div className="panel">
      <h3>Effective Address Calculator</h3>
      <div className="sv-presets">
        {PRESETS.map((p, i) => (
          <button key={p} className={ranHere.has(EA_PRESET_PARTS[i]) || done?.has(EA_PRESET_PARTS[i]) ? 'sv-preset done' : 'sv-preset'} onClick={() => runPreset(i)}>
            {p}
          </button>
        ))}
      </div>
      <label className="sv-field sv-operand">
        <span>Memory operand or instruction</span>
        <input className="mb-address" value={operand} spellCheck={false} onChange={(e) => setOperand(e.target.value)} />
        <span className="sv-hint">Numbers: hex with h (20h), otherwise decimal.</span>
      </label>
      <div className="mb-inputs sv-regs">
        {REG_FIELDS.map((r) => (
          <HexInput key={r} label={`${r} (hex)`} value={regText[r]} digits={4} width="4.5rem" onChange={(v) => setRegText((s) => ({ ...s, [r]: v }))} />
        ))}
      </div>
      {body}
      <ul className="mb-cases">
        <li className={EA_PRESET_PARTS.every((p) => ranHere.has(p) || done?.has(p)) ? 'done' : ''}>
          Presets run: {EA_PRESET_PARTS.filter((p) => ranHere.has(p) || done?.has(p)).length}/4
        </li>
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Byte order
// ---------------------------------------------------------------------------

function Cells({ title, start, bytes }: { title: string; start: number; bytes: number[] }) {
  return (
    <div className="sv-cells">
      <div className="mb-bank-head">{title}</div>
      {bytes.map((b, i) => (
        <div key={i} className="sv-cell">
          <span className="sv-cell-addr">{hex((start + i) & 0xfffff, 5)}</span>
          <span className="sv-cell-byte">{b.toString(16).toUpperCase().padStart(2, '0')}</span>
        </div>
      ))}
    </div>
  )
}

export function EndianFigure() {
  const value = [0x0a, 0x0b, 0x0c, 0x0d]
  const cell = (x: number, i: number, b: number) => (
    <g key={`${x}-${i}`}>
      <rect className={`mb-box ${i === 0 ? 'mb-cpu' : ''}`} x={x} y={40 + i * 34} width={70} height={30} rx={4} />
      <text className="mb-label" x={x + 35} y={60 + i * 34}>{b.toString(16).toUpperCase().padStart(2, '0')}</text>
    </g>
  )
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 190" role="img" aria-label="0A0B0C0Dh stored big-endian as 0A 0B 0C 0D and little-endian as 0D 0C 0B 0A from address a upward">
          <text className="mb-title" x={210} y={18}>Value 0A0B0C0Dh</text>
          <text className="mb-label" x={105} y={34}>Big endian</text>
          <text className="mb-label" x={315} y={34}>Little endian</text>
          {[0, 1, 2, 3].map((i) => (
            <text key={i} className="mb-small" x={210} y={60 + i * 34}>a{i ? `+${i}` : ''}</text>
          ))}
          {value.map((b, i) => cell(70, i, b))}
          {[...value].reverse().map((b, i) => cell(280, i, b))}
        </svg>
        <figcaption>Address a holds the most significant byte (big endian) or the least significant byte (little endian, x86)</figcaption>
      </figure>
    </div>
  )
}

export const BYTE_LAYOUT_PARTS = ['byte-layout-value', 'byte-layout-dump']

/** `done` holds the part ids already recorded (BYTE_LAYOUT_PARTS). */
export function ByteLayout({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [valueText, setValueText] = useState('1234')
  const [startText, setStartText] = useState('0100')
  const [dumpText, setDumpText] = useState('78 56 34 12')
  const [tried, setTried] = useState<Set<string>>(new Set())

  const value = parseHex(valueText, 8)
  const start = parseHex(startText, 5)
  const valueDigits = valueText.trim().replace(/^0x/i, '').replace(/h$/i, '').length
  const width = value !== null && (value > 0xffff || valueDigits > 4) ? 4 : 2
  const dump = dumpText.trim().split(/[\s,]+/).filter(Boolean)
  const dumpBytes = dump.length === 4 && dump.every((b) => /^[0-9a-f]{1,2}h?$/i.test(b))
    ? dump.map((b) => parseInt(b.replace(/h$/i, ''), 16))
    : null

  function touch(part: string) {
    if (tried.has(part)) return
    setTried((s) => new Set(s).add(part))
    onDone?.(part)
  }

  const le = value === null ? [] : Array.from({ length: width }, (_, i) => (value >>> (8 * i)) & 0xff)
  const hex8 = (bytes: number[]) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('') + 'h'

  return (
    <div className="panel">
      <h3>Byte Layout</h3>
      <p className="example-description">A value and where its bytes go in memory:</p>
      <div className="mb-inputs">
        <HexInput label="Value (16 or 32 bits)" value={valueText} digits={8} width="8rem" onChange={(v) => { setValueText(v); if (parseHex(v, 8) !== null) touch('byte-layout-value') }} />
        <HexInput label="Start address" value={startText} digits={5} onChange={setStartText} />
      </div>
      {value === null || start === null ? (
        <p className="moveit-error">Type a value of up to 8 hex digits and a start address of up to 5.</p>
      ) : (
        <div className="sv-layout">
          <Cells title="Little endian (x86)" start={start} bytes={le} />
          <Cells title="Big endian (network)" start={start} bytes={[...le].reverse()} />
        </div>
      )}

      <p className="example-description">Four bytes from a memory dump, lowest address first, and the value they hold:</p>
      <div className="mb-inputs">
        <label className="sv-field">
          <span>Dump bytes</span>
          <input
            className="mb-address"
            style={{ width: '9rem' }}
            value={dumpText}
            spellCheck={false}
            onChange={(e) => {
              setDumpText(e.target.value)
              const parts = e.target.value.trim().split(/[\s,]+/).filter(Boolean)
              if (parts.length === 4 && parts.every((b) => /^[0-9a-f]{1,2}h?$/i.test(b))) touch('byte-layout-dump')
            }}
          />
        </label>
      </div>
      {dumpBytes === null ? (
        <p className="moveit-error">Type exactly four bytes in hex, separated by spaces (e.g. 78 56 34 12).</p>
      ) : (
        <table className="fde-state">
          <tbody>
            <tr><td>Read as little endian (x86)</td><td>{hex8([...dumpBytes].reverse())}</td></tr>
            <tr><td>Read as big endian</td><td>{hex8(dumpBytes)}</td></tr>
          </tbody>
        </table>
      )}
      <ul className="mb-cases">
        {BYTE_LAYOUT_PARTS.map((p) => {
          const ok = tried.has(p) || !!done?.has(p)
          return <li key={p} className={ok ? 'done' : ''}>{ok ? '✓' : '○'} {p === 'byte-layout-value' ? 'Lay out a value' : 'Read a dump'}</li>
        })}
      </ul>
    </div>
  )
}
