// Learn views for the interrupts module (issue #52): a timeline of a program
// being interrupted, the Interrupt Vector Table layout and calculator, the
// 8259 block diagram and a PIC playground. None of them runs the Cpu: this
// simulator does not execute student ISRs (a separate decision, #53).
import { useEffect, useState } from 'react'
import { Box } from './Ppi8255Views'

const hex = (v: number, digits: number) => v.toString(16).toUpperCase().padStart(digits, '0') + 'h'
const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0')

// ---------------------------------------------------------------------------
// Timeline: main program interrupted by keyboard and printer
// ---------------------------------------------------------------------------

export function InterruptTimeline() {
  const main = (x1: number, x2: number) => <line className="mb-bus" x1={x1} y1={60} x2={x2} y2={60} />
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 150" role="img" aria-label="Timeline: the main program runs, is interrupted by a keyboard request and later a printer request; each time the ISR runs and the program continues where it stopped">
          <text className="mb-small mb-start" x={6} y={64}>Main</text>
          {main(40, 120)}
          {main(170, 270)}
          {main(320, 410)}
          <line className="mb-bus mb-bus-alt" x1={120} y1={60} x2={130} y2={110} />
          <rect className="mb-box mb-mem-alt" x={128} y={100} width={44} height={22} rx={4} />
          <text className="mb-small" x={150} y={115}>ISR</text>
          <line className="mb-bus mb-bus-alt" x1={172} y1={110} x2={170} y2={60} />
          <line className="mb-bus mb-bus-alt" x1={270} y1={60} x2={280} y2={110} />
          <rect className="mb-box mb-mem-alt" x={278} y={100} width={44} height={22} rx={4} />
          <text className="mb-small" x={300} y={115}>ISR</text>
          <line className="mb-bus mb-bus-alt" x1={322} y1={110} x2={320} y2={60} />
          <text className="mb-small" x={120} y={30}>keyboard</text>
          <line className="mb-bus" x1={120} y1={36} x2={120} y2={54} />
          <text className="mb-small" x={270} y={30}>printer</text>
          <line className="mb-bus" x1={270} y1={36} x2={270} y2={54} />
          <text className="mb-small" x={150} y={140}>IRET: back to the next instruction</text>
        </svg>
        <figcaption>The main program stops between two instructions, the ISR runs, and IRET returns exactly where it stopped</figcaption>
      </figure>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interrupt Vector Table
// ---------------------------------------------------------------------------

export function IvtDiagram() {
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 220" role="img" aria-label="Interrupt vector table from 00000h to 003FFh: types 0 to 4 dedicated, 5 to 31 reserved, 32 to 255 user-defined; each entry holds IP then CS">
          <Box x={110} y={10} w={140} h={40} title="Types 0–4" sub="dedicated · 00000h–00013h" className="mb-cpu" />
          <Box x={110} y={50} w={140} h={50} title="Types 5–31" sub="reserved · 00014h–0007Fh" className="mb-mem-alt" />
          <Box x={110} y={100} w={140} h={100} title="Types 32–255" sub="user-defined · 00080h–003FFh" className="mb-mem" />
          <text className="mb-small mb-end" x={104} y={16}>00000h</text>
          <text className="mb-small mb-end" x={104} y={202}>003FFh</text>
          <rect className="mb-box" x={290} y={40} width={110} height={120} rx={5} />
          <text className="mb-label" x={345} y={56}>Entry n at 4·n</text>
          <Box x={300} y={64} w={90} h={20} title="IP low" />
          <Box x={300} y={86} w={90} h={20} title="IP high" />
          <Box x={300} y={108} w={90} h={20} title="CS low" />
          <Box x={300} y={130} w={90} h={20} title="CS high" />
          <line className="mb-bus mb-bus-alt" x1={250} y1={140} x2={290} y2={100} />
        </svg>
        <figcaption>256 entries × 4 bytes = 1 KB: word 0 is IP, word 1 is CS</figcaption>
      </figure>
    </div>
  )
}

function category(n: number) {
  return n <= 4 ? 'dedicated' : n <= 31 ? 'reserved' : 'user-defined'
}

export const IVT_PARTS = ['ivt-calc-1', 'ivt-calc-2', 'ivt-calc-3']

/** `done` holds the part ids already recorded (IVT_PARTS). */
export function IvtCalculator({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [nText, setNText] = useState('5')
  const [ip, setIp] = useState('1000')
  const [cs, setCs] = useState('2000')
  const [tried, setTried] = useState<Set<number>>(new Set())

  const t = nText.trim()
  const n = /^[0-9a-f]+h$/i.test(t) ? parseInt(t.slice(0, -1), 16) : /^\d+$/.test(t) ? parseInt(t, 10) : NaN
  const valid = Number.isInteger(n) && n >= 0 && n <= 255
  const ipV = /^[0-9a-f]{1,4}h?$/i.test(ip.trim()) ? parseInt(ip.trim().replace(/h$/i, ''), 16) : null
  const csV = /^[0-9a-f]{1,4}h?$/i.test(cs.trim()) ? parseInt(cs.trim().replace(/h$/i, ''), 16) : null

  useEffect(() => {
    if (!valid || tried.has(n)) return
    const next = new Set(tried).add(n)
    setTried(next)
    // The first type shown counts too: the student has already read its result.
    onDone?.(IVT_PARTS[Math.min(next.size, IVT_PARTS.length) - 1])
    // onDone is a fresh closure every render; only a new type should record.
  }, [n, valid])

  const count = Math.max(IVT_PARTS.filter((p) => done?.has(p)).length, Math.min(tried.size, 3))
  const addr = valid ? n * 4 : 0
  const physical = ipV !== null && csV !== null ? ((csV * 16 + ipV) & 0xfffff) : null

  return (
    <div className="panel">
      <h3>IVT Calculator</h3>
      <div className="mb-inputs">
        <label className="sv-field"><span>Type n (decimal, or hex with h)</span>
          <input className="mb-address" value={nText} onChange={(e) => setNText(e.target.value)} spellCheck={false} />
        </label>
        <label className="sv-field"><span>IP word</span>
          <input className="mb-address" value={ip} maxLength={5} onChange={(e) => setIp(e.target.value)} spellCheck={false} />
        </label>
        <label className="sv-field"><span>CS word</span>
          <input className="mb-address" value={cs} maxLength={5} onChange={(e) => setCs(e.target.value)} spellCheck={false} />
        </label>
      </div>
      {!valid ? (
        <p className="moveit-error">Type an interrupt type from 0 to 255 (e.g. 5 or 21h).</p>
      ) : (
        <table className="fde-state">
          <tbody>
            <tr><td>Type</td><td>{n} = {hex(n, 2)} <span className={`ivt-badge ${category(n).replace('-', '')}`}>{category(n)}</span></td></tr>
            <tr><td>IVT address</td><td>4 × {n} = {addr} = <strong>{hex(addr, 5)}</strong></td></tr>
            <tr>
              <td>Bytes</td>
              <td>
                {ipV !== null && csV !== null
                  ? `${hex(addr, 5)}: ${hex2(ipV & 0xff)} ${hex2(ipV >> 8)} (IP)   ${hex(addr + 2, 5)}: ${hex2(csV & 0xff)} ${hex2(csV >> 8)} (CS)`
                  : 'Type IP and CS as hex words'}
              </td>
            </tr>
            <tr><td>Vector</td><td>{csV !== null && ipV !== null ? `${hex(csV, 4)}:${hex(ipV, 4)}` : '–'}</td></tr>
            <tr>
              <td>ISR address</td>
              <td>{physical !== null && csV !== null ? <>CS × 10h + IP = {hex(csV * 16, 5)} + {hex(ipV as number, 4)} = <strong>{hex(physical, 5)}</strong></> : '–'}</td>
            </tr>
          </tbody>
        </table>
      )}
      <ul className="mb-cases"><li className={count >= 3 ? 'done' : ''}>Types tried: {count}/3</li></ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 8259 block diagram
// ---------------------------------------------------------------------------

export function Pic8259Diagram() {
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 230" role="img" aria-label="8259 block diagram: data bus buffer, read/write logic and cascade buffer on the internal bus; control logic with INT and INTA; interrupt request register, priority resolver, in-service register and interrupt mask register">
          <Box x={10} y={10} w={110} h={40} title="Data bus buffer" sub="D7–D0" className="mb-cpu" />
          <Box x={10} y={64} w={110} h={44} title="Read/write logic" sub="RD̅ WR̅ A0 CS̅" className="mb-cpu" />
          <Box x={10} y={122} w={110} h={44} title="Cascade buffer" sub="CAS0–2 · SP̅/EN̅" className="mb-cpu" />
          <Box x={10} y={180} w={110} h={40} title="Control logic" sub="INT out · INTA̅ in" className="mb-cpu" />
          <line className="mb-bus" x1={140} y1={20} x2={140} y2={210} />
          <line className="mb-bus" x1={120} y1={30} x2={140} y2={30} />
          <line className="mb-bus" x1={120} y1={86} x2={140} y2={86} />
          <line className="mb-bus" x1={120} y1={144} x2={140} y2={144} />
          <line className="mb-bus" x1={120} y1={200} x2={140} y2={200} />
          <line className="mb-bus" x1={140} y1={60} x2={160} y2={60} />
          <line className="mb-bus" x1={140} y1={175} x2={300} y2={175} />
          <Box x={160} y={40} w={70} h={44} title="ISR" sub="in service" className="mb-mem" />
          <Box x={245} y={40} w={80} h={44} title="Priority" sub="resolver" className="mb-mem-alt" />
          <Box x={340} y={40} w={70} h={44} title="IRR" sub="requests" className="mb-mem" />
          <line className="mb-bus mb-bus-alt" x1={230} y1={62} x2={245} y2={62} />
          <line className="mb-bus mb-bus-alt" x1={325} y1={62} x2={340} y2={62} />
          <Box x={240} y={150} w={120} h={44} title="IMR" sub="1 = masked" className="mb-mem-alt" />
          <line className="mb-bus mb-bus-alt" x1={285} y1={150} x2={285} y2={84} />
          <text className="mb-small" x={375} y={104}>IR0–IR7</text>
          <line className="mb-bus" x1={375} y1={92} x2={375} y2={84} />
        </svg>
        <figcaption>IRR holds requests, IMR masks them, the priority resolver picks one, ISR remembers what is being served</figcaption>
      </figure>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PIC playground
// ---------------------------------------------------------------------------

export const PIC_PARTS = ['pic-served', 'pic-masked', 'pic-eoi']

const bit = (v: number, i: number) => (v >> i) & 1
const lowestSet = (v: number) => {
  for (let i = 0; i < 8; i++) if (bit(v, i)) return i
  return -1
}

/** `done` holds the part ids already recorded (PIC_PARTS). */
export function PicPlayground({ done, onDone }: { done?: Set<string>; onDone?: (partId: string) => void }) {
  const [irr, setIrr] = useState(0)
  const [imr, setImr] = useState(0)
  const [isr, setIsr] = useState(0)
  const [ifFlag, setIfFlag] = useState(true)
  const [maskText, setMaskText] = useState('00')
  const [log, setLog] = useState<string[]>(['Raise a request on IR0–IR7.'])
  const [didHere, setDidHere] = useState<Set<string>>(new Set())

  function mark(part: string) {
    if (didHere.has(part)) return
    setDidHere((s) => new Set(s).add(part))
    onDone?.(part)
  }
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 6))

  // Fixed priority, IR0 highest: the best unmasked request, if nothing of
  // equal or higher priority is already in service.
  const pending = irr & ~imr & 0xff
  const candidate = lowestSet(pending)
  const inService = lowestSet(isr)
  const intHigh = candidate >= 0 && (inService < 0 || candidate < inService)

  function raise(i: number) {
    setIrr((v) => v | (1 << i))
    if (bit(imr, i)) {
      say(`IR${i} requested, but IMR bit ${i} is 1: masked, it waits.`)
      mark('pic-masked')
    } else {
      say(`IR${i} requested: IRR bit ${i} set.`)
    }
  }

  function acknowledge() {
    if (!intHigh) return
    setIrr((v) => v & ~(1 << candidate))
    setIsr((v) => v | (1 << candidate))
    say(`INTA, INTA: IR${candidate} moves IRR → ISR; the 8259 sends type ${hex(8 + candidate, 2)} (08h + ${candidate}).` +
      (inService >= 0 ? ` It interrupts IR${inService}'s ISR (higher priority).` : ''))
    mark('pic-served')
  }

  function eoi() {
    if (inService < 0) {
      say('EOI with nothing in service: no effect.')
      return
    }
    setIsr((v) => v & ~(1 << inService))
    say(`EOI (OUT 20h, 20h): ISR bit ${inService} cleared.`)
    mark('pic-eoi')
  }

  function setMask(v: number) {
    setImr(v)
    setMaskText(hex2(v))
  }

  const row = (label: string, value: number, onToggle?: (i: number) => void) => (
    <tr>
      <td>{label}</td>
      {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
        <td key={i}>
          {onToggle ? (
            <button className={`ppi-bit pic-bit${bit(value, i) ? ' on' : ''}`} onClick={() => onToggle(i)}>{bit(value, i)}</button>
          ) : (
            <span className={`pic-cell${bit(value, i) ? ' on' : ''}`}>{bit(value, i)}</span>
          )}
        </td>
      ))}
      <td><code>{hex(value, 2)}</code></td>
    </tr>
  )

  return (
    <div className="panel pic-playground">
      <h3>PIC Playground</h3>
      <div className="pic-raise">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <button key={i} onClick={() => raise(i)}>Raise IR{i}</button>)}
      </div>
      <table className="fde-state pic-table">
        <thead><tr><th /> {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => <th key={i}>{i}</th>)}<th /></tr></thead>
        <tbody>
          {row('IRR', irr)}
          {row('IMR', imr, (i) => setMask(imr ^ (1 << i)))}
          {row('ISR', isr)}
        </tbody>
      </table>
      <div className="mb-inputs">
        <label className="sv-field"><span>IMR as if OUT 21h, AL (hex)</span>
          <input
            className="mb-address"
            value={maskText}
            maxLength={3}
            spellCheck={false}
            onChange={(e) => {
              setMaskText(e.target.value)
              const v = e.target.value.trim().replace(/h$/i, '')
              if (/^[0-9a-f]{1,2}$/i.test(v)) setImr(parseInt(v, 16))
            }}
          />
        </label>
        <label className="pic-if"><input type="checkbox" checked={ifFlag} onChange={(e) => setIfFlag(e.target.checked)} /> CPU IF = {ifFlag ? 1 : 0}</label>
      </div>
      <p className={`pic-int${intHigh ? ' high' : ''}`}>
        INT → CPU: <strong>{intHigh ? 'high' : 'low'}</strong>
        {intHigh && !ifFlag && ' -- IF = 0, so the CPU ignores it and the request stays pending.'}
        {intHigh && ifFlag && ` -- IR${candidate} is waiting for the CPU.`}
        {!intHigh && candidate >= 0 && inService >= 0 && ` -- IR${candidate} waits: IR${inService} (higher or equal priority) is in service.`}
      </p>
      <div className="feedback-actions">
        <button className="primary" onClick={acknowledge} disabled={!intHigh || !ifFlag}>CPU answers: INTA × 2</button>
        <button onClick={eoi}>Send EOI (OUT 20h, 20h)</button>
        <button onClick={() => { setIrr(0); setIsr(0); setMask(0); setLog(['Reset.']) }}>Reset</button>
      </div>
      <ul className="pic-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <ul className="mb-cases">
        {PIC_PARTS.map((p) => {
          const ok = didHere.has(p) || !!done?.has(p)
          const label = p === 'pic-served' ? 'Serve a request' : p === 'pic-masked' ? 'Block one with the mask' : 'Send an EOI'
          return <li key={p} className={ok ? 'done' : ''}>{ok ? '✓' : '○'} {label}</li>
        })}
      </ul>
    </div>
  )
}
