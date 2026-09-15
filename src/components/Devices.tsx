import { useEffect, useRef, useState } from 'react'

export const PORTS = {
  TRAFFIC_LIGHT: 0x40,
  STEPPER_MOTOR: 0x41,
  SEVEN_SEGMENT: 0x42,
  THERMOMETER: 0x43,
} as const

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

// A standard 4-step full-step unipolar coil sequence. Each valid step (a
// value from this list that differs from the last one seen) rotates the
// dial by STEP_DEGREES, forward or backward depending on which direction
// through the sequence the new value is closer to.
const STEPPER_SEQUENCE = [0b0011, 0b0110, 0b1100, 0b1001]
const STEP_DEGREES = 90

export function stepperDelta(sequence: number[], fromIndex: number, toIndex: number): number {
  const n = sequence.length
  const forward = (toIndex - fromIndex + n) % n
  const backward = (fromIndex - toIndex + n) % n
  return forward <= backward ? forward : -backward
}

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

export function DevicesView({ ports }: { ports: Uint8Array }) {
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
      </div>
    </div>
  )
}
