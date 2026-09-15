import type { Instruction } from '../core/types'

export type BusLane = 'mem-read' | 'mem-write' | 'mem-both' | 'io-in' | 'io-out' | 'alu' | 'reg' | 'control' | 'none'

const ALU_MNEMONICS = new Set([
  'ADD', 'SUB', 'AND', 'OR', 'XOR', 'CMP', 'TEST', 'MUL', 'DIV', 'NEG', 'NOT', 'INC', 'DEC', 'SHL', 'SHR',
])
const CONTROL_MNEMONICS = new Set([
  'JMP', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE', 'JA', 'JAE', 'JB', 'JBE', 'JCXZ', 'LOOP', 'CALL', 'RET',
])
const STACK_MNEMONICS = new Set(['PUSH', 'POP'])
const STRING_MNEMONICS = new Set(['MOVSB', 'STOSB', 'LODSB', 'CMPSB', 'SCASB'])

// Classifies what the last-executed instruction did in terms of the three
// blocks in the diagram (Registers/ALU, Memory, I/O ports), and in which
// direction data moved. Pure and instruction-shape-only (mnemonic + operand
// kinds), so it's testable without touching the CPU or assembler at all.
export function classifyDataFlow(instr: Instruction | null): { lane: BusLane; detail: string } {
  if (!instr) return { lane: 'none', detail: 'No instruction executed yet.' }
  const m = instr.mnemonic
  const kinds = instr.ops.map((o) => o.kind)

  if (m === 'IN') return { lane: 'io-in', detail: 'IN: Port → Register' }
  if (m === 'OUT') return { lane: 'io-out', detail: 'OUT: Register → Port' }
  if (m === 'INT') return { lane: 'io-out', detail: `${instr.raw || 'INT'}: CPU ↔ I/O` }

  if (STACK_MNEMONICS.has(m)) return { lane: 'mem-both', detail: `${m}: Register ↔ Stack (Memory)` }
  if (m === 'CALL' || m === 'RET') return { lane: 'mem-both', detail: `${m}: Memory (stack) ↔ IP` }
  if (STRING_MNEMONICS.has(m)) return { lane: 'mem-both', detail: `${m}: Memory ↔ Memory/Register` }

  if (kinds.includes('mem')) {
    const destIsMem = kinds[0] === 'mem'
    const srcIsMem = kinds[1] === 'mem'
    if (srcIsMem && !destIsMem) return { lane: 'mem-read', detail: `${m}: Memory → Register` }
    if (destIsMem) return { lane: 'mem-write', detail: `${m}: Register → Memory` }
    return { lane: 'mem-read', detail: `${m}: Memory access` }
  }

  if (ALU_MNEMONICS.has(m)) return { lane: 'alu', detail: `ALU: ${m}` }
  if (CONTROL_MNEMONICS.has(m)) return { lane: 'control', detail: `${m}: control flow (IP)` }
  if (m === 'MOV' || m === 'XCHG') return { lane: 'reg', detail: `${m}: Register → Register` }
  if (m === 'CLD' || m === 'STD' || m === 'NOP' || m === 'HLT') return { lane: 'none', detail: m }

  return { lane: 'none', detail: m }
}

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

export function DataBusView({ lastInstruction, steps }: { lastInstruction: Instruction | null; steps: number }) {
  const { lane, detail } = classifyDataFlow(lastInstruction)

  const memX1 = 78
  const cpuLeftX = 150
  const cpuRightX = 262
  const ioX2 = 334
  const y = 60

  return (
    <div className="panel">
      <h3>Data Bus</h3>
      <svg viewBox="0 0 400 120" className="bus-diagram">
        <line x1={memX1} y1={y} x2={cpuLeftX} y2={y} className="bus-line" />
        <line x1={cpuRightX} y1={y} x2={ioX2} y2={y} className="bus-line" />

        <rect x="8" y="35" width="70" height="50" rx="6" className="bus-box" />
        <text x="43" y="64" className="bus-label">MEMORY</text>

        <rect x="150" y="15" width="112" height="90" rx="6" className="bus-box bus-box-cpu" />
        <text x="206" y="30" className="bus-label bus-label-title">CPU</text>
        <rect key={`reg-${steps}`} x="160" y="38" width="44" height="26" rx="4" className={lane === 'reg' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="182" y="55" className="bus-sublabel">REG</text>
        <rect key={`alu-${steps}`} x="208" y="38" width="44" height="26" rx="4" className={lane === 'alu' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="230" y="55" className="bus-sublabel">ALU</text>
        <rect key={`ctl-${steps}`} x="160" y="72" width="92" height="22" rx="4" className={lane === 'control' ? 'bus-subbox on' : 'bus-subbox'} />
        <text x="206" y="88" className="bus-sublabel">IP / CONTROL</text>

        <rect x="334" y="35" width="58" height="50" rx="6" className="bus-box" />
        <text x="363" y="58" className="bus-label">I/O</text>
        <text x="363" y="72" className="bus-label">PORTS</text>

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
