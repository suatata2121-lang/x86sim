import { useEffect, useRef, useState } from 'react'
import { PORTS, STEPPER_SEQUENCE, stepperDelta } from '../core/stepper'
import { PPI_PORT_A, PPI_PORT_B, PPI_PORT_C, describeControlWord, type Ppi8255 } from '../core/ppi8255'

function TrafficLightView({ value }: { value: number }) {
  const red = (value & 0x1) !== 0
  const yellow = (value & 0x2) !== 0
  const green = (value & 0x4) !== 0
  return (
    <div className="tl-body">
      <div className={`tl-lamp tl-red${red ? ' on' : ''}`} />
      <div className={`tl-lamp tl-yellow${yellow ? ' on' : ''}`} />
      <div className={`tl-lamp tl-green${green ? ' on' : ''}`} />
    </div>
  )
}

const STEP_DEGREES = 90

function StepperMotorView({ value }: { value: number }) {
  const [angle, setAngle] = useState(0)
  const lastIndex = useRef(-1)

  useEffect(() => {
    const idx = STEPPER_SEQUENCE.indexOf(value & 0x0f)
    if (idx === -1) return
    if (lastIndex.current === -1) {
      lastIndex.current = idx
      return
    }
    if (idx === lastIndex.current) return
    const delta = stepperDelta(STEPPER_SEQUENCE, lastIndex.current, idx)
    setAngle((a) => a + delta * STEP_DEGREES)
    lastIndex.current = idx
  }, [value])

  return (
    <div className="motor-dial">
      <div className="motor-pointer" style={{ transform: `rotate(${angle}deg)` }} />
      <div className="motor-hub" />
    </div>
  )
}

const SEG_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 8, y: 2, w: 24, h: 6 },
  f: { x: 2, y: 8, w: 6, h: 24 },
  b: { x: 32, y: 8, w: 6, h: 24 },
  g: { x: 8, y: 32, w: 24, h: 6 },
  e: { x: 2, y: 38, w: 6, h: 24 },
  c: { x: 32, y: 38, w: 6, h: 24 },
  d: { x: 8, y: 62, w: 24, h: 6 },
}
const SEG_BITS: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6 }

function SevenSegmentView({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 40 70" width="56" height="98" className="seven-seg">
      <rect x="0" y="0" width="40" height="70" rx="4" className="seven-seg-bg" />
      {Object.entries(SEG_RECTS).map(([seg, r]) => {
        const on = (value & (1 << SEG_BITS[seg])) !== 0
        return <rect key={seg} x={r.x} y={r.y} width={r.w} height={r.h} rx="2" className={on ? 'seg on' : 'seg'} />
      })}
    </svg>
  )
}

function ThermometerView({ value }: { value: number }) {
  const celsius = Math.max(0, Math.min(99, value))
  const pct = Math.max(2, Math.min(100, celsius))
  return (
    <div className="thermometer">
      <div className="therm-tube">
        <div className="therm-fill" style={{ height: `${pct}%` }} />
      </div>
      <div className="therm-bulb" />
      <div className="therm-label">{celsius}°C</div>
    </div>
  )
}

// The 4511 on the slide's board: PB3-PB0 as one BCD digit; A-F are blank.
const BCD_SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]

/**
 * One row of 8 port pins, bit 7 on the left. Bits in `inputMask` are
 * switches the student flips; the rest are LEDs showing the output latch.
 */
function PinRow({ name, value, inputMask, onFlip }: {
  name: string
  value: number
  inputMask: number
  onFlip: (bit: number) => void
}) {
  return (
    <div className="ppi-pins">
      {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => {
        const on = (value & (1 << bit)) !== 0
        const label = `${name}${bit}`
        return (inputMask & (1 << bit)) !== 0 ? (
          <button
            key={bit}
            className={`ppi-switch${on ? ' on' : ''}`}
            title={`${label}: switch ${on ? 'on' : 'off'}`}
            aria-pressed={on}
            onClick={() => onFlip(bit)}
          >
            <span className="ppi-knob" />
            <span className="ppi-pin-label">{bit}</span>
          </button>
        ) : (
          <span key={bit} className="ppi-led-cell" title={`${label}: ${on ? '1' : '0'}`}>
            <span className={`ppi-led${on ? ' on' : ''}`} />
            <span className="ppi-pin-label">{bit}</span>
          </span>
        )
      })}
    </div>
  )
}

function Ppi8255Card({ ppi }: { ppi: Ppi8255 }) {
  // Flipping a switch changes the chip object directly, not React state.
  const [, rerender] = useState(0)
  const c = ppi.config
  const word = ppi.control
  const portB = ppi.read(PPI_PORT_B)
  const digit = portB & 0x0f
  const flip = (field: 'switchesA' | 'switchesC', bit: number) => {
    ppi[field] ^= 1 << bit
    rerender((n) => n + 1)
  }
  return (
    <div className="device-card ppi-card">
      <div className="device-title">8255 PPI <span className="device-port">ports 80h–83h</span></div>
      <div className="ppi-control">
        Control word <code>{word.toString(16).toUpperCase().padStart(2, '0')}h</code>{' '}
        <code>{word.toString(2).padStart(8, '0')}</code>
      </div>
      <div className="ppi-decode">{describeControlWord(word)}</div>
      {(c.aMode !== 0 || c.bMode !== 0) && (
        <div className="ppi-notice">Mode 1/2 handshaking is not simulated; ports behave as in Mode 0.</div>
      )}
      <div className="ppi-port">
        <span className="ppi-port-name">Port A <small>80h · {c.aIn ? 'switches' : 'LEDs'}</small></span>
        <PinRow name="PA" value={ppi.read(PPI_PORT_A)} inputMask={c.aIn ? 0xff : 0} onFlip={(b) => flip('switchesA', b)} />
      </div>
      <div className="ppi-port">
        <span className="ppi-port-name">Port B <small>81h · LEDs + BCD display</small></span>
        <div className="ppi-port-b">
          <PinRow name="PB" value={portB} inputMask={0} onFlip={() => {}} />
          <SevenSegmentView value={c.bIn || digit > 9 ? 0 : BCD_SEGMENTS[digit]} />
        </div>
      </div>
      <div className="ppi-port">
        <span className="ppi-port-name">
          Port C <small>82h · upper {c.cUpperIn ? 'switches' : 'LEDs'}, lower {c.cLowerIn ? 'switches' : 'LEDs'}</small>
        </span>
        <PinRow
          name="PC"
          value={ppi.read(PPI_PORT_C)}
          inputMask={(c.cUpperIn ? 0xf0 : 0) | (c.cLowerIn ? 0x0f : 0)}
          onFlip={(b) => flip('switchesC', b)}
        />
      </div>
    </div>
  )
}

export function DevicesView({ ports, ppi }: { ports: Uint8Array; ppi?: Ppi8255 }) {
  return (
    <div className="panel">
      <h3>Virtual Devices</h3>
      <div className="devices-grid">
        <div className="device-card">
          <div className="device-title">Traffic Light <span className="device-port">port 40h</span></div>
          <TrafficLightView value={ports[PORTS.TRAFFIC_LIGHT]} />
        </div>
        <div className="device-card">
          <div className="device-title">Stepper Motor <span className="device-port">port 41h</span></div>
          <StepperMotorView value={ports[PORTS.STEPPER_MOTOR]} />
        </div>
        <div className="device-card">
          <div className="device-title">7-Segment Display <span className="device-port">port 42h</span></div>
          <SevenSegmentView value={ports[PORTS.SEVEN_SEGMENT]} />
        </div>
        <div className="device-card">
          <div className="device-title">Thermometer <span className="device-port">port 43h</span></div>
          <ThermometerView value={ports[PORTS.THERMOMETER]} />
        </div>
        {ppi && <Ppi8255Card ppi={ppi} />}
      </div>
    </div>
  )
}
