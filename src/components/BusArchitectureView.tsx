import type { Instruction } from '../core/types'
import { classifyDataFlow } from '../core/dataBus'

function hex(value: number, digits: number) {
  return value.toString(16).toUpperCase().padStart(digits, '0') + 'h'
}

function Pulse({ x1, x2, y, reverse, both }: { x1: number; x2: number; y: number; reverse?: boolean; both?: boolean }) {
  const from = reverse ? x2 : x1
  const to = reverse ? x1 : x2
  if (both) {
    return (
      <circle r="4" cy={y} className="bus-pulse">
        <animate attributeName="cx" values={`${x1};${x2};${x1}`} dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" values="0;1;1;1;0" keyTimes="0;0.08;0.5;0.92;1" dur="0.9s" fill="freeze" />
      </circle>
    )
  }
  return (
    <circle r="4" cy={y} className="bus-pulse">
      <animate attributeName="cx" from={from} to={to} dur="0.45s" fill="freeze" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="0.45s" fill="freeze" />
    </circle>
  )
}

// A dedicated, more detailed bus diagram for the "Address Bus vs Data Bus vs
// Control Bus" topic: unlike the generic DataBusView (one shared lane, no
// literal values), this draws the three buses as separate wires and shows
// the actual address/value/control-signal each one carries -- which requires
// the extra Cpu instrumentation (lastAddress/lastMemValue/lastPort/
// lastPortValue) HardwarePlayground reads and passes in.
export function BusArchitectureView({
  lastInstruction,
  steps,
  lastAddress,
  lastMemValue,
  lastPort,
  lastPortValue,
}: {
  lastInstruction: Instruction | null
  steps: number
  lastAddress: number | null
  lastMemValue: number | null
  lastPort: number | null
  lastPortValue: number | null
}) {
  const { lane } = classifyDataFlow(lastInstruction)

  const memActive = lane === 'mem-read' || lane === 'mem-write' || lane === 'mem-both'
  const ioActive = lane === 'io-in' || lane === 'io-out'

  // Memory/CPU/I-O box edges, with a left margin reserved for the ADDR/DATA/
  // CTRL lane labels so they never sit underneath the (opaque) MEMORY box.
  const memBoxX = 30
  const memX1 = 92 // memory box's right edge -- where its bus lines start
  const cpuLeftX = 178
  const cpuRightX = 262
  const ioBoxX = 336 // I/O box's left edge -- where its bus lines end
  const ioBoxW = 58
  const addrY = 42
  const dataY = 80
  const ctrlY = 118

  // '→' = left-to-right, '←' = right-to-left, '↔' = both directions.
  const memArrow = lane === 'mem-read' ? '→' : lane === 'mem-write' ? '←' : lane === 'mem-both' ? '↔' : null
  const ioArrow = lane === 'io-out' ? '→' : lane === 'io-in' ? '←' : null

  const memCtrlLabel = lane === 'mem-read' ? 'MEMR' : lane === 'mem-write' ? 'MEMW' : lane === 'mem-both' ? 'MEMR/W' : null
  const ioCtrlLabel = lane === 'io-in' ? 'IOR' : lane === 'io-out' ? 'IOW' : null

  const addrValue = memActive && lastAddress !== null ? hex(lastAddress, 4) : ioActive && lastPort !== null ? hex(lastPort, 2) : null
  const dataValue = memActive && lastMemValue !== null ? hex(lastMemValue, memActive && (lastMemValue > 0xff) ? 4 : 2)
    : ioActive && lastPortValue !== null ? hex(lastPortValue, 2)
    : null

  let detail: string
  if (memActive) {
    detail = `${lastInstruction?.raw?.trim() || ''} — Address bus: ${addrValue ?? '?'}, Data bus: ${dataValue ?? '?'}, Control bus: ${memCtrlLabel} (${lane === 'mem-read' ? 'memory read' : lane === 'mem-write' ? 'memory write' : 'memory read + write'})`
  } else if (ioActive) {
    detail = `${lastInstruction?.raw?.trim() || ''} — Address bus: port ${addrValue ?? '?'}, Data bus: ${dataValue ?? '?'}, Control bus: ${ioCtrlLabel} (${lane === 'io-in' ? 'I/O read' : 'I/O write'})`
  } else if (lastInstruction) {
    detail = `${lastInstruction.raw?.trim() || lastInstruction.mnemonic} — an internal CPU operation; the external address/data/control buses stay idle.`
  } else {
    detail = 'No instruction executed yet.'
  }

  return (
    <div className="panel">
      <h3>Address / Data / Control Bus</h3>
      <svg viewBox="0 0 400 150" className="bus-diagram bus-diagram-tall">
        <line x1={memX1} y1={addrY} x2={cpuLeftX} y2={addrY} className="bus-line" />
        <line x1={memX1} y1={dataY} x2={cpuLeftX} y2={dataY} className="bus-line" />
        <line x1={memX1} y1={ctrlY} x2={cpuLeftX} y2={ctrlY} className="bus-line" />
        <line x1={cpuRightX} y1={addrY} x2={ioBoxX} y2={addrY} className="bus-line" />
        <line x1={cpuRightX} y1={dataY} x2={ioBoxX} y2={dataY} className="bus-line" />
        <line x1={cpuRightX} y1={ctrlY} x2={ioBoxX} y2={ctrlY} className="bus-line" />

        <text x="2" y={addrY - 8} className="bus-lane-label">ADDR</text>
        <text x="2" y={dataY - 8} className="bus-lane-label">DATA</text>
        <text x="2" y={ctrlY - 8} className="bus-lane-label">CTRL</text>

        <rect key={`mem-${steps}`} x={memBoxX} y="18" width={memX1 - memBoxX} height="112" rx="6" className={memActive ? 'bus-box on' : 'bus-box'} />
        <text x={(memBoxX + memX1) / 2} y="78" className="bus-label">MEMORY</text>

        <rect x={cpuLeftX} y="18" width={cpuRightX - cpuLeftX} height="112" rx="6" className="bus-box bus-box-cpu" />
        <text x={(cpuLeftX + cpuRightX) / 2} y="78" className="bus-label bus-label-title">CPU</text>

        <rect key={`io-${steps}`} x={ioBoxX} y="18" width={ioBoxW} height="112" rx="6" className={ioActive ? 'bus-box on' : 'bus-box'} />
        <text x={ioBoxX + ioBoxW / 2} y="72" className="bus-label">I/O</text>
        <text x={ioBoxX + ioBoxW / 2} y="86" className="bus-label">PORTS</text>

        {memActive && addrValue && (
          <text key={`mem-addr-${steps}`} x={(memX1 + cpuLeftX) / 2} y={addrY - 6} className="bus-value-label on">{addrValue}</text>
        )}
        {memActive && (
          <text key={`mem-ctrl-${steps}`} x={(memX1 + cpuLeftX) / 2} y={ctrlY + 16} className="bus-value-label on ctrl">{memCtrlLabel}</text>
        )}
        {memArrow && (
          <text key={`mem-arrow-${steps}`} x={(memX1 + cpuLeftX) / 2} y={dataY - 6} className="bus-flow-arrow on">{memArrow}</text>
        )}
        {memActive && dataValue && (
          <text key={`mem-data-${steps}`} x={(memX1 + cpuLeftX) / 2} y={dataY + 16} className="bus-value-label on">{dataValue}</text>
        )}

        {ioActive && addrValue && (
          <text key={`io-addr-${steps}`} x={(cpuRightX + ioBoxX) / 2} y={addrY - 6} className="bus-value-label on">{addrValue}</text>
        )}
        {ioActive && (
          <text key={`io-ctrl-${steps}`} x={(cpuRightX + ioBoxX) / 2} y={ctrlY + 16} className="bus-value-label on ctrl">{ioCtrlLabel}</text>
        )}
        {ioArrow && (
          <text key={`io-arrow-${steps}`} x={(cpuRightX + ioBoxX) / 2} y={dataY - 6} className="bus-flow-arrow on">{ioArrow}</text>
        )}
        {ioActive && dataValue && (
          <text key={`io-data-${steps}`} x={(cpuRightX + ioBoxX) / 2} y={dataY + 16} className="bus-value-label on">{dataValue}</text>
        )}

        {lane === 'mem-read' && <Pulse key={`p-${steps}`} x1={memX1} x2={cpuLeftX} y={dataY} />}
        {lane === 'mem-write' && <Pulse key={`p-${steps}`} x1={memX1} x2={cpuLeftX} y={dataY} reverse />}
        {lane === 'mem-both' && <Pulse key={`p-${steps}`} x1={memX1} x2={cpuLeftX} y={dataY} both />}
        {lane === 'io-in' && <Pulse key={`p-${steps}`} x1={cpuRightX} x2={ioBoxX} y={dataY} reverse />}
        {lane === 'io-out' && <Pulse key={`p-${steps}`} x1={cpuRightX} x2={ioBoxX} y={dataY} />}
      </svg>
      <p className="status bus-detail">{detail}</p>
    </div>
  )
}
