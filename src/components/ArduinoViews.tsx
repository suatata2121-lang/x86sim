// The Microcontrollers (Arduino Uno) section's widgets (#112-#114). Nothing
// here simulates the AVR: each widget is scripted for its one page, because
// the students practise on real boards and only need to see the idea.
// Every widget follows the other Learn views' contract: `done` holds the part
// ids already recorded, `onDone` records one (learningPath.ts interactives).

import { useEffect, useRef, useState } from 'react'

interface PartProps {
  done?: Set<string>
  onDone?: (partId: string) => void
}

/** Records each part once per visit; `done` from the server keeps the tick on later visits. */
function useParts({ done, onDone }: PartProps) {
  const [here, setHere] = useState<Set<string>>(new Set())
  const sent = useRef(new Set<string>())
  // Timers (Run, the Serial Monitor) call mark from an older render; the
  // latest onDone is the one that knows the signed-in student.
  const latest = useRef(onDone)
  latest.current = onDone
  const mark = (part: string) => {
    if (sent.current.has(part)) return
    sent.current.add(part)
    setHere((s) => new Set(s).add(part))
    latest.current?.(part)
  }
  const isDone = (part: string) => here.has(part) || !!done?.has(part)
  return { mark, isDone }
}

function PartList({ parts, isDone }: { parts: [string, string][]; isDone: (p: string) => boolean }) {
  return (
    <ul className="mb-cases">
      {parts.map(([id, label]) => (
        <li key={id} className={isDone(id) ? 'done' : ''}>{isDone(id) ? '✓' : '○'} {label}</li>
      ))}
    </ul>
  )
}

/** A drawn LED; `level` 0..1 is its brightness. */
function Led({ level, x, y, r = 14 }: { level: number; x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 6} fill="#ff4d4d" opacity={0.35 * level} />
      <circle cx={x} cy={y} r={r} fill="#5a1d1d" stroke="var(--border-strong)" />
      <circle cx={x} cy={y} r={r} fill="#ff4d4d" opacity={level} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// m14: the Uno board tour
// ---------------------------------------------------------------------------

type TourKind = 'digital' | 'pwm' | 'analog' | 'power' | 'other'

interface TourPart {
  id: string
  name: string
  text: string
  kind: TourKind
  x: number
  y: number
  w: number
  h: number
}

const PWM_PINS = [3, 5, 6, 9, 10, 11]
const DIGITAL_TEXT =
  'On/off input or output. Pins 0 and 1 are also used for talking to the computer, so keep them free while uploading.'
const PWM_TEXT =
  'A digital pin that can also make a "dimmed" output with analogWrite (Module m15).'

// Header layout as on the real board: the digital header runs 13..0 left to
// right along the top edge, the power and analog headers along the bottom.
const PIN_W = 18
const DIGITAL_ORDER = [13, 12, 11, 10, 9, 8, null, 7, 6, 5, 4, 3, 2, 1, 0]
const POWER_PINS: [string, string][] = [
  ['3.3V', '3.3 V supply for modules that need 3.3 V.'],
  ['5V', '5 V supply for sensors and modules.'],
  ['GND', 'Ground: the common 0 V reference. Every module shares it with the board.'],
  ['GND', 'Ground: the common 0 V reference. Every module shares it with the board.'],
  ['VIN', 'The voltage from the power jack (7–12 V), before the board turns it into 5 V.'],
]

function tourParts(): TourPart[] {
  const parts: TourPart[] = [
    { id: 'usb', name: 'USB connector', text: 'Power and programming; also carries the Serial Monitor text.', kind: 'other', x: 6, y: 60, w: 72, h: 70 },
    { id: 'jack', name: 'Power jack (7–12 V)', text: 'Power without a computer.', kind: 'other', x: 6, y: 280, w: 64, h: 66 },
    { id: 'reset', name: 'Reset button', text: 'Restarts the program from setup().', kind: 'other', x: 100, y: 52, w: 30, h: 30 },
    { id: 'chip', name: 'ATmega328P', text: 'The microcontroller that runs your program.', kind: 'other', x: 290, y: 262, w: 230, h: 52 },
    { id: 'crystal', name: '16 MHz crystal', text: 'The clock.', kind: 'other', x: 222, y: 200, w: 46, h: 20 },
    { id: 'led-l', name: '"L" LED', text: 'An LED already wired to pin 13.', kind: 'other', x: 186, y: 92, w: 22, h: 14 },
    { id: 'led-txrx', name: 'TX/RX LEDs', text: 'Blink while data goes to / comes from the computer.', kind: 'other', x: 186, y: 128, w: 22, h: 30 },
  ]
  let x = 186
  for (const pin of DIGITAL_ORDER) {
    if (pin === null) {
      x += 12
      continue
    }
    const pwm = PWM_PINS.includes(pin)
    const label = pin === 0 ? '0 (RX)' : pin === 1 ? '1 (TX)' : `${pwm ? '~' : ''}${pin}`
    parts.push({
      id: `d${pin}`,
      name: `Digital pin ${label}`,
      text: pwm ? PWM_TEXT : DIGITAL_TEXT,
      kind: pwm ? 'pwm' : 'digital',
      x, y: 26, w: PIN_W, h: 18,
    })
    x += PIN_W + 2
  }
  x = 200
  POWER_PINS.forEach(([name, text], i) => {
    parts.push({ id: `p${i}`, name: `Power pin ${name}`, text, kind: 'power', x, y: 376, w: PIN_W + 6, h: 18 })
    x += PIN_W + 8
  })
  x += 18
  for (let i = 0; i <= 5; i++) {
    parts.push({
      id: `a${i}`,
      name: `Analog pin A${i}`,
      text: 'Reads a voltage between 0 and 5 V with analogRead (Module m16).',
      kind: 'analog',
      x, y: 376, w: PIN_W + 6, h: 18,
    })
    x += PIN_W + 8
  }
  return parts
}

const TOUR_PARTS = tourParts()

function pinLabel(p: TourPart) {
  if (p.kind === 'analog') return p.id.toUpperCase()
  if (p.kind === 'power') return p.name.replace('Power pin ', '')
  const n = Number(p.id.slice(1))
  return `${PWM_PINS.includes(n) ? '~' : ''}${n}`
}

export function UnoBoardTour(props: PartProps) {
  const { mark, isDone } = useParts(props)
  const [open, setOpen] = useState<TourPart | null>(null)

  function pick(p: TourPart) {
    setOpen(p)
    if (p.kind !== 'other') mark(`uno-tour-${p.kind}`)
  }

  return (
    <div className="panel ard-panel">
      <h3>Uno board tour</h3>
      <div className="ard-tour">
        <svg viewBox="0 0 600 420" className="ard-board" role="img" aria-label="Arduino Uno board">
          <rect x="20" y="10" width="570" height="400" rx="14" fill="#0e6e7e" stroke="#0a4f5a" strokeWidth="2" />
          {/* header strips behind the pins */}
          <rect x="180" y="22" width="320" height="26" rx="3" fill="#1b1b1b" />
          <rect x="194" y="372" width="330" height="26" rx="3" fill="#1b1b1b" />
          <text x="340" y="80" className="ard-silk" textAnchor="middle">DIGITAL (PWM ~)</text>
          <text x="270" y="364" className="ard-silk" textAnchor="middle">POWER</text>
          <text x="440" y="364" className="ard-silk" textAnchor="middle">ANALOG IN</text>
          <text x="440" y="200" className="ard-silk ard-silk-big" textAnchor="middle">UNO</text>
          {TOUR_PARTS.map((p) => {
            const isPin = p.kind !== 'other'
            const active = open?.id === p.id
            return (
              <g
                key={p.id}
                className={`ard-part${active ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={p.name}
                onClick={() => pick(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p) } }}
              >
                <title>{p.name}</title>
                {p.id === 'usb' && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="#b8bcc2" stroke="#6b7078" />}
                {p.id === 'jack' && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="6" fill="#222" stroke="#555" />}
                {p.id === 'reset' && (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="#ccc" />
                    <circle cx={p.x + p.w / 2} cy={p.y + p.h / 2} r="9" fill="#c62828" />
                  </>
                )}
                {p.id === 'chip' && (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="#1e1e1e" />
                    <text x={p.x + p.w / 2} y={p.y + 31} className="ard-chip-text" textAnchor="middle">ATMEGA328P</text>
                  </>
                )}
                {p.id === 'crystal' && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="9" fill="#d9d9d9" stroke="#888" />}
                {p.id === 'led-l' && (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2" fill="#f5c542" />
                    <text x={p.x - 6} y={p.y + 11} className="ard-silk" textAnchor="end">L</text>
                  </>
                )}
                {p.id === 'led-txrx' && (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height="12" rx="2" fill="#f5c542" />
                    <rect x={p.x} y={p.y + 18} width={p.w} height="12" rx="2" fill="#f5c542" />
                    <text x={p.x - 6} y={p.y + 10} className="ard-silk" textAnchor="end">TX</text>
                    <text x={p.x - 6} y={p.y + 28} className="ard-silk" textAnchor="end">RX</text>
                  </>
                )}
                {isPin && (
                  <>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2" fill="#2b2b2b" stroke="#555" />
                    <rect x={p.x + p.w / 2 - 3} y={p.y + p.h / 2 - 3} width="6" height="6" fill="#999" />
                    <text
                      x={p.x + p.w / 2}
                      y={p.y < 200 ? p.y + p.h + 12 : p.y - 6}
                      className="ard-pin-label"
                      textAnchor="middle"
                    >
                      {pinLabel(p)}
                    </text>
                  </>
                )}
                {/* a generous transparent hit area over every part */}
                <rect x={p.x - 2} y={p.y - 2} width={p.w + 4} height={p.h + 4} className="ard-hit" />
              </g>
            )
          })}
        </svg>
        <div className="ard-info">
          {open ? (
            <>
              <strong>{open.name}</strong>
              <p>{open.text}</p>
              {open.kind === 'pwm' && <p className="ard-dim">It is still a digital pin: {DIGITAL_TEXT.toLowerCase()}</p>}
            </>
          ) : (
            <p className="ard-dim">Click a part of the board.</p>
          )}
        </div>
      </div>
      <PartList
        isDone={isDone}
        parts={[
          ['uno-tour-digital', 'A digital pin'],
          ['uno-tour-pwm', 'A PWM (~) pin'],
          ['uno-tour-analog', 'An analog pin'],
          ['uno-tour-power', 'A power pin'],
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// m14: the button and LED sketch, stepped line by line
// ---------------------------------------------------------------------------

const BUTTON_SKETCH = [
  'const int LED = 13;',
  'const int BUTTON = 2;',
  '',
  'void setup() {',
  '  pinMode(LED, OUTPUT);',
  '  pinMode(BUTTON, INPUT_PULLUP);',
  '}',
  '',
  'void loop() {',
  '  if (digitalRead(BUTTON) == LOW) {   // pressed',
  '    digitalWrite(LED, HIGH);',
  '  } else {',
  '    digitalWrite(LED, LOW);',
  '  }',
  '}',
]

// Line indexes the player stops on.
const L_SETUP = 3, L_MODE_LED = 4, L_MODE_BTN = 5, L_SETUP_END = 6, L_LOOP = 8, L_IF = 9, L_ON = 10, L_OFF = 12, L_LOOP_END = 14

function nextLine(line: number, pressed: boolean): number {
  switch (line) {
    case L_SETUP: return L_MODE_LED
    case L_MODE_LED: return L_MODE_BTN
    case L_MODE_BTN: return L_SETUP_END
    case L_SETUP_END: return L_LOOP
    case L_LOOP: return L_IF
    case L_IF: return pressed ? L_ON : L_OFF
    case L_ON:
    case L_OFF: return L_LOOP_END
    default: return L_LOOP // the end of loop(): it starts again
  }
}

function lineNote(line: number, pressed: boolean, loops: number): string {
  switch (line) {
    case L_SETUP: return 'Power on (or Reset): setup() starts. It runs only once.'
    case L_MODE_LED: return 'Pin 13 becomes an output.'
    case L_MODE_BTN: return 'Pin 2 becomes an input with the built-in pull-up: it reads HIGH while the button is released.'
    case L_SETUP_END: return 'setup() is finished and never runs again (until the next reset).'
    case L_LOOP: return loops === 0 ? 'loop() starts.' : `loop() starts again (time ${loops + 1}).`
    case L_IF: return `digitalRead(2) is ${pressed ? 'LOW: the button is pressed' : 'HIGH: the button is released'}.`
    case L_ON: return 'Pin 13 goes to 5 V: the LED is on.'
    case L_OFF: return 'Pin 13 goes to 0 V: the LED is off.'
    default: return 'The end of loop(): the board goes straight back to its first line.'
  }
}

export function ButtonLedPlayer(props: PartProps) {
  const { mark, isDone } = useParts(props)
  const [line, setLine] = useState(L_SETUP)
  const [loops, setLoops] = useState(0)
  const [pressed, setPressed] = useState(false)
  const [ledOn, setLedOn] = useState(false)
  const [running, setRunning] = useState(false)
  // Read inside the Run timer, which would otherwise see the values of the
  // render that started it.
  const state = useRef({ line, pressed, ledOn })
  state.current = { line, pressed, ledOn }

  function step() {
    const { line: at, pressed: btn, ledOn: on } = state.current
    const next = nextLine(at, btn)
    if (next === L_LOOP && at === L_LOOP_END) setLoops((n) => n + 1)
    if (next === L_ON) {
      setLedOn(true)
      if (!on) mark('button-led-on')
    }
    if (next === L_OFF) {
      setLedOn(false)
      if (on) mark('button-led-off')
    }
    setLine(next)
  }

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(step, 450)
    return () => window.clearInterval(t)
    // step reads the latest state through the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function reset() {
    setRunning(false)
    setLine(L_SETUP)
    setLoops(0)
    setLedOn(false)
  }

  const pin2 = pressed ? 'LOW' : 'HIGH'

  return (
    <div className="panel ard-panel">
      <h3>Button and LED</h3>
      <div className="ard-player">
        <pre className="ard-code">
          {BUTTON_SKETCH.map((text, i) => (
            <div key={i} className={`ard-code-line${i === line ? ' current' : ''}`}>{text || ' '}</div>
          ))}
        </pre>
        <div className="ard-bench">
          <svg viewBox="0 0 220 150" className="ard-bench-svg" aria-hidden="true">
            <text x="20" y="22" className="ard-bench-label">Pin 13</text>
            <Led level={ledOn ? 1 : 0} x={50} y={60} r={16} />
            <text x="130" y="22" className="ard-bench-label">Pin 2 = {pin2}</text>
            <rect x="130" y="40" width="60" height="44" rx="6" fill="#444" />
            <circle cx="160" cy="62" r={pressed ? 13 : 15} fill={pressed ? '#9a2a2a' : '#d84a4a'} />
            <line x1="160" y1="84" x2="160" y2="120" stroke="var(--text-dim)" strokeWidth="2" />
            <text x="160" y="138" className="ard-bench-label" textAnchor="middle">GND</text>
          </svg>
          <button className={pressed ? 'primary' : ''} aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>
            {pressed ? 'Release the button' : 'Press the button'}
          </button>
        </div>
      </div>
      <p className="ard-note">{lineNote(line, pressed, loops)}</p>
      <div className="feedback-actions">
        <button className="primary" onClick={step} disabled={running}>Step</button>
        <button onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Run'}</button>
        <button onClick={reset}>Reset board</button>
      </div>
      <PartList
        isDone={isDone}
        parts={[
          ['button-led-on', 'Turn the LED on with the button'],
          ['button-led-off', 'Turn it off again'],
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// m15: the PWM slider
// ---------------------------------------------------------------------------

export function PwmSlider(props: PartProps) {
  const { mark, isDone } = useParts(props)
  const [value, setValue] = useState(128)
  const [slow, setSlow] = useState(false)
  // Phase of the slowed wave, 0..1 within one period; 2 periods per second.
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!slow) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      setPhase((((now - start) / 500) % 1 + 1) % 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [slow])

  function change(v: number) {
    setValue(v)
    if (v <= 64) mark('pwm-low')
    if (v >= 192) mark('pwm-high')
  }

  const duty = value / 255
  const percent = Math.round(duty * 100)
  const volts = (5 * duty).toFixed(2)
  // At full speed the eye averages the switching; slowed down the LED follows the pin.
  const pinHigh = phase < duty
  const level = slow ? (pinHigh ? 1 : 0) : duty

  // Three periods of the square wave.
  const W = 360, H = 90, top = 20, bottom = 70, period = W / 3
  let d = `M 0 ${bottom}`
  for (let k = 0; k < 3; k++) {
    const x0 = k * period
    const x1 = x0 + duty * period
    if (duty > 0) d += ` L ${x0} ${top} L ${x1} ${top}`
    d += ` L ${x1} ${bottom} L ${x0 + period} ${bottom}`
  }

  return (
    <div className="panel ard-panel">
      <h3>PWM slider</h3>
      <label className="ard-slider">
        <code>analogWrite(9, {value})</code>
        <input type="range" min={0} max={255} step={1} value={value} onChange={(e) => change(Number(e.target.value))} />
      </label>
      <div className="ard-pwm">
        <svg viewBox={`-8 0 ${W + 16} ${H + 10}`} className="ard-wave" aria-label="Pin 9 output">
          <text x="0" y="12" className="ard-bench-label">5 V</text>
          <text x="0" y={bottom + 16} className="ard-bench-label">0 V</text>
          <line x1="0" y1={bottom} x2={W} y2={bottom} stroke="var(--border-strong)" />
          <path d={d} fill="none" stroke="var(--accent-text)" strokeWidth="2.5" />
          {slow && <line x1={phase * period} y1={top - 6} x2={phase * period} y2={bottom + 4} stroke="var(--error-text)" strokeWidth="2" />}
        </svg>
        <svg viewBox="0 0 80 90" className="ard-led-box" aria-hidden="true">
          <text x="40" y="12" className="ard-bench-label" textAnchor="middle">Pin 9</text>
          <Led level={level} x={40} y={50} r={18} />
        </svg>
      </div>
      <table className="fde-state ard-readout">
        <tbody>
          <tr><td>Duty cycle</td><td><strong>{percent} %</strong> ({value} / 255)</td></tr>
          <tr><td>Average voltage</td><td><strong>{volts} V</strong> (5 V × duty)</td></tr>
          <tr><td>The pin itself</td><td>{slow ? (pinHigh ? '5 V right now' : '0 V right now') : 'switches between 0 V and 5 V about 500 times per second'}</td></tr>
        </tbody>
      </table>
      <label className="pic-if">
        <input
          type="checkbox"
          checked={slow}
          onChange={(e) => {
            setSlow(e.target.checked)
            if (e.target.checked) mark('pwm-slow')
          }}
        />{' '}
        Slow motion (2 periods per second)
      </label>
      <PartList
        isDone={isDone}
        parts={[
          ['pwm-low', 'A low value (64 or less)'],
          ['pwm-high', 'A high value (192 or more)'],
          ['pwm-slow', 'Slow motion'],
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// m15: polling vs interrupt on a 5-second timeline
// ---------------------------------------------------------------------------

const SECONDS = 5
const PRESS = 0.2
// The polling loop checks the button, then waits in delay(1000).
const CHECKS = [0, 1, 2, 3, 4, 5]

export function PollingTimeline(props: PartProps) {
  const { mark, isDone } = useParts(props)
  // Start of the press in seconds; the press lasts PRESS.
  const [press, setPress] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const X0 = 90, X1 = 570
  const sx = (t: number) => X0 + (t / SECONDS) * (X1 - X0)

  function place(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const x = ((clientX - box.left) / box.width) * 600
    // Centred on the click, so clicking on a check mark catches it.
    const t = Math.round(((x - X0) / (X1 - X0)) * SECONDS * 20) / 20 - PRESS / 2
    const start = Math.min(SECONDS - PRESS, Math.max(0, t))
    setPress(start)
    const caught = CHECKS.some((c) => c >= start && c <= start + PRESS)
    mark(caught ? 'timeline-caught' : 'timeline-missed')
  }

  const caughtAt = press === null ? undefined : CHECKS.find((c) => c >= press && c <= press + PRESS)
  const fmt = (t: number) => `${t.toFixed(2)} s`

  return (
    <div className="panel ard-panel">
      <h3>Polling vs interrupt</h3>
      <svg
        ref={svgRef}
        viewBox="0 0 600 170"
        className="ard-timeline"
        role="button"
        aria-label="Time axis: click to press the button for 0.2 seconds"
        onClick={(e) => place(e.clientX)}
      >
        <text x="8" y="52" className="ard-bench-label">Polling</text>
        <text x="8" y="112" className="ard-bench-label">Interrupt</text>
        <line x1={X0} y1="50" x2={X1} y2="50" stroke="var(--border-strong)" />
        <line x1={X0} y1="110" x2={X1} y2="110" stroke="var(--border-strong)" />
        {CHECKS.map((c) => (
          <g key={c}>
            <line x1={sx(c)} y1="36" x2={sx(c)} y2="64" stroke="var(--accent-text)" strokeWidth="3" />
            <line x1={sx(c)} y1="140" x2={sx(c)} y2="146" stroke="var(--text-dim)" />
            <text x={sx(c)} y="160" className="ard-bench-label" textAnchor="middle">{c} s</text>
          </g>
        ))}
        <text x={sx(0.5)} y="30" className="ard-bench-label" textAnchor="middle">delay(1000)</text>
        {press !== null && (
          <>
            <rect x={sx(press)} y="20" width={sx(press + PRESS) - sx(press)} height="104" className="ard-press" />
            <text x={sx(press + PRESS / 2)} y="136" className="ard-bench-label" textAnchor="middle">press</text>
            {caughtAt !== undefined
              ? <text x={sx(caughtAt)} y="80" className="ard-ok" textAnchor="middle">caught</text>
              : <text x={sx(press + PRESS / 2)} y="80" className="ard-bad" textAnchor="middle">missed</text>}
            <text x={sx(press)} y="96" className="ard-ok" textAnchor="middle">caught</text>
          </>
        )}
      </svg>
      <p className="ard-note">
        {press === null && 'Click on the time axis to press the button. The blue marks are the moments the polling loop checks it.'}
        {press !== null && caughtAt !== undefined &&
          `Pressed ${fmt(press)} to ${fmt(press + PRESS)}. The polling loop checked at ${caughtAt} s, inside the press, so it caught it. The interrupt caught it at once, at ${fmt(press)}.`}
        {press !== null && caughtAt === undefined &&
          `Pressed ${fmt(press)} to ${fmt(press + PRESS)}. The polling loop was inside delay(1000) the whole time and missed it. The interrupt caught it at once, at ${fmt(press)}.`}
      </p>
      <PartList
        isDone={isDone}
        parts={[
          ['timeline-missed', 'A press polling misses'],
          ['timeline-caught', 'A press polling catches too'],
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// m16: the sensor slider (a potentiometer on A0)
// ---------------------------------------------------------------------------

/** Arduino's map() with integer arithmetic, as on the board. */
const arduinoMap = (v: number, inLo: number, inHi: number, outLo: number, outHi: number) =>
  Math.trunc(((v - inLo) * (outHi - outLo)) / (inHi - inLo)) + outLo

export function SensorSlider(props: PartProps) {
  const { mark, isDone } = useParts(props)
  const [volts, setVolts] = useState(2.5)
  const [lines, setLines] = useState<number[]>([])
  const value = Math.round((volts / 5) * 1023)
  const mapped = arduinoMap(value, 0, 1023, 0, 255)
  const first = useRef(true)
  const logRef = useRef<HTMLPreElement>(null)

  // A line is printed each time the slider stops, as if the sketch read A0 then.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => {
      setLines((l) => [...l, value].slice(-50))
      if (value <= 100) mark('sensor-low')
      if (value >= 900) mark('sensor-high')
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  // The knob turns through 270°, from -135° at 0 V to +135° at 5 V.
  const angle = -135 + (volts / 5) * 270
  const rad = ((angle - 90) * Math.PI) / 180

  return (
    <div className="panel ard-panel">
      <h3>Sensor slider</h3>
      <div className="ard-sensor">
        <svg viewBox="0 0 220 150" className="ard-pot" aria-hidden="true">
          <circle cx="70" cy="70" r="42" fill="#2f5f9a" stroke="#1d3d66" strokeWidth="3" />
          <line x1="70" y1="70" x2={70 + 34 * Math.cos(rad)} y2={70 + 34 * Math.sin(rad)} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <text x="70" y="135" className="ard-bench-label" textAnchor="middle">potentiometer</text>
          <line x1="112" y1="70" x2="180" y2="70" stroke="var(--accent-text)" strokeWidth="2" />
          <text x="186" y="74" className="ard-bench-label">A0</text>
          <text x="146" y="62" className="ard-bench-label" textAnchor="middle">{volts.toFixed(2)} V</text>
        </svg>
        <div className="ard-sensor-out">
          <label className="ard-slider">
            <span>Voltage on A0: <strong>{volts.toFixed(2)} V</strong></span>
            <input type="range" min={0} max={5} step={0.01} value={volts} onChange={(e) => setVolts(Number(e.target.value))} />
          </label>
          <table className="fde-state ard-readout">
            <tbody>
              <tr><td><code>analogRead(A0)</code></td><td><strong>{value}</strong> (round({volts.toFixed(2)} / 5 × 1023))</td></tr>
              <tr><td><code>map(value, 0, 1023, 0, 255)</code></td><td><strong>{mapped}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="ard-serial">
        <div className="ard-serial-head">Serial Monitor · 9600 baud</div>
        <pre ref={logRef}>{lines.length ? lines.join('\n') : ' '}</pre>
      </div>
      <PartList
        isDone={isDone}
        parts={[
          ['sensor-low', 'A reading of 100 or less'],
          ['sensor-high', 'A reading of 900 or more'],
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// m16: wire the four modules to the right pins
// ---------------------------------------------------------------------------

type Bus = 'uart' | 'i2c' | 'spi'

const BUS_GROUPS: { bus: Bus; pins: string; label: string }[] = [
  { bus: 'uart', pins: '0–1', label: 'Pins 0–1 (RX / TX)' },
  { bus: 'i2c', pins: 'A4–A5', label: 'Pins A4–A5 (SDA / SCL)' },
  { bus: 'spi', pins: '10–13', label: 'Pins 10–13 (SS / MOSI / MISO / SCK)' },
]

const BUS_NAME: Record<Bus, string> = { uart: 'UART', i2c: 'I²C', spi: 'SPI' }

const MODULES: { id: string; name: string; bus: Bus }[] = [
  { id: 'lcd', name: 'I²C LCD display', bus: 'i2c' },
  { id: 'mpu', name: 'MPU-6050 motion sensor', bus: 'i2c' },
  { id: 'sd', name: 'SD card module', bus: 'spi' },
  { id: 'hc05', name: 'HC-05 Bluetooth module', bus: 'uart' },
]

export function BusMatching(props: PartProps) {
  const { mark, isDone } = useParts(props)
  const [picked, setPicked] = useState<string | null>(null)
  const [wired, setWired] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('Pick a module, then the pins it goes to.')

  function choose(bus: Bus) {
    const m = MODULES.find((x) => x.id === picked)
    if (!m) {
      setMessage('Pick a module first.')
      return
    }
    const group = BUS_GROUPS.find((g) => g.bus === m.bus)!
    if (bus !== m.bus) {
      setMessage(`Not there: the ${m.name} uses ${BUS_NAME[m.bus]}, so it goes on pins ${group.pins}.`)
      return
    }
    const next = new Set(wired).add(m.id)
    setWired(next)
    setPicked(null)
    if (next.size === MODULES.length) {
      setMessage('All four modules are wired. Two of them share I²C: each has its own address on the bus.')
      mark('bus-matching')
    } else {
      setMessage(`Right: the ${m.name} talks ${BUS_NAME[m.bus]} on pins ${group.pins}.`)
    }
  }

  return (
    <div className="panel ard-panel">
      <h3>Wire the modules</h3>
      <div className="ard-bus">
        <div className="ard-bus-col">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={`ard-card${picked === m.id ? ' picked' : ''}${wired.has(m.id) ? ' wired' : ''}`}
              disabled={wired.has(m.id)}
              onClick={() => setPicked(m.id)}
            >
              {wired.has(m.id) ? '✓ ' : ''}{m.name}
              {wired.has(m.id) && <span className="ard-dim"> → {BUS_GROUPS.find((g) => g.bus === m.bus)!.pins}</span>}
            </button>
          ))}
        </div>
        <div className="ard-bus-col">
          {BUS_GROUPS.map((g) => (
            <button key={g.bus} className="ard-card ard-pins" onClick={() => choose(g.bus)}>{g.label}</button>
          ))}
        </div>
      </div>
      <p className="ard-note">{message}</p>
      <div className="feedback-actions">
        <button onClick={() => { setWired(new Set()); setPicked(null); setMessage('Pick a module, then the pins it goes to.') }}>Start over</button>
      </div>
      <PartList isDone={isDone} parts={[['bus-matching', 'Wire all four modules']]} />
    </div>
  )
}
