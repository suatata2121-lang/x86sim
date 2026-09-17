import type { Instruction } from '../core/types'
import { classifyDataFlow } from '../core/dataBus'

function Pulse({ x1, x2, y, reverse, both }: { x1: number; x2: number; y: number; reverse?: boolean; both?: boolean }) {
  const from = reverse ? x2 : x1
  const to = reverse ? x1 : x2
  if (both) {
    return (
      <circle r="5" cy={y} className="bus-pulse">
        <animate attributeName="cx" values={`${x1};${x2};${x1}`} dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.08;0.5;0.92;1" dur="0.9s" fill="freeze" />
      </circle>
    )
  }
  return (
    <circle r="5" cy={y} className="bus-pulse">
      <animate attributeName="cx" from={from} to={to} dur="0.45s" fill="freeze" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.45s" fill="freeze" />
    </circle>
  )
}

// Which way the arrow between two boxes should point for a given lane:
// '→' means left-to-right (the first box's direction to the second), '←' the
// reverse, '↔' both (e.g. PUSH/POP/CALL/RET/string ops, which move data both
// ways depending on the exact instruction).
function arrowFor(lane: string, readLane: string, writeLane: string, bothLane: string): '→' | '←' | '↔' | null {
  if (lane === readLane) return '→'
  if (lane === writeLane) return '←'
  if (lane === bothLane) return '↔'
  return null
}

export function DataBusView({ lastInstruction, steps }: { lastInstruction: Instruction | null; steps: number }) {
  const { lane, detail } = classifyDataFlow(lastInstruction)

  const memX1 = 78
  const cpuLeftX = 150
  const cpuRightX = 262
  const ioX2 = 334
  const y = 60

  const memOn = lane === 'mem-read' || lane === 'mem-write' || lane === 'mem-both'
  const ioOn = lane === 'io-in' || lane === 'io-out'
  // Memory sits left of the CPU, so a memory READ (data moving into the CPU)
  // is drawn left-to-right; a WRITE (data leaving the CPU) is right-to-left.
  const memArrow = arrowFor(lane, 'mem-read', 'mem-write', 'mem-both')
  // I/O sits right of the CPU, so OUT (leaving the CPU) is left-to-right and
  // IN (entering the CPU) is right-to-left -- the opposite mapping from memory.
  const ioArrow = arrowFor(lane, 'io-out', 'io-in', '')

  return (
    <div className="panel">
      <h3>Data Bus</h3>
      <svg viewBox="0 0 400 120" className="bus-diagram">
        <line x1={memX1} y1={y} x2={cpuLeftX} y2={y} className="bus-line" />
        <line x1={cpuRightX} y1={y} x2={ioX2} y2={y} className="bus-line" />

        <rect key={`mem-${steps}`} x="8" y="35" width="70" height="50" rx="6" className={memOn ? 'bus-box on' : 'bus-box'} />
        <text x="43" y="64" className="bus-label">MEMORY</text>

        <rect x="150" y="15" width="112" height="90" rx="6" className="bus-box bus-box-cpu" />
        <text x="206" y="30" className="bus-label bus-label-title">CPU</text>
        <rect key={`reg-${steps}`} x="160" y="38" width="44" height="26" rx="4" className={lane === 'reg' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="182" y="55" className="bus-sublabel">REG</text>
        <rect key={`alu-${steps}`} x="208" y="38" width="44" height="26" rx="4" className={lane === 'alu' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="230" y="55" className="bus-sublabel">ALU</text>
        <rect key={`ctl-${steps}`} x="160" y="72" width="92" height="22" rx="4" className={lane === 'control' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="206" y="88" className="bus-sublabel">IP / CONTROL</text>

        <rect key={`io-${steps}`} x="334" y="35" width="58" height="50" rx="6" className={ioOn ? 'bus-box on' : 'bus-box'} />
        <text x="363" y="58" className="bus-label">I/O</text>
        <text x="363" y="72" className="bus-label">PORTS</text>

        {memArrow && (
          <text key={`mem-arrow-${steps}`} x={(memX1 + cpuLeftX) / 2} y={y - 10} className="bus-flow-arrow on">
            {memArrow}
          </text>
        )}
        {ioArrow && (
          <text key={`io-arrow-${steps}`} x={(cpuRightX + ioX2) / 2} y={y - 10} className="bus-flow-arrow on">
            {ioArrow}
          </text>
        )}

        {lane === 'mem-read' && <Pulse key={steps} x1={memX1} x2={cpuLeftX} y={y} />}
        {lane === 'mem-write' && <Pulse key={steps} x1={memX1} x2={cpuLeftX} y={y} reverse />}
        {lane === 'mem-both' && <Pulse key={steps} x1={memX1} x2={cpuLeftX} y={y} both />}
        {lane === 'io-in' && <Pulse key={steps} x1={cpuRightX} x2={ioX2} y={y} reverse />}
        {lane === 'io-out' && <Pulse key={steps} x1={cpuRightX} x2={ioX2} y={y} />}
      </svg>
      <p className="status bus-detail">{detail}</p>
    </div>
  )
}
