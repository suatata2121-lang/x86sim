import type { Instruction } from './types'

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
// blocks in the data bus diagram (Registers/ALU, Memory, I/O ports), and in
// which direction data moved. Pure and instruction-shape-only (mnemonic +
// operand kinds), so it's testable without touching the CPU or assembler,
// and kept out of DataBusView.tsx so that file exports only the component.
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
