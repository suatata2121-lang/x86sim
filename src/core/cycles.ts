// Idealized 8086 execution-cycle costs, from Intel's published per-instruction
// timing table (the "best case": no bus contention, wait states, or
// prefetch-queue stalls modeled). Good enough to compare programs' relative
// cost and show *why* e.g. MUL/DIV or a memory operand are expensive next to
// a register op — not a cycle-accurate hardware simulation.
import type { Instruction, Mnemonic, Operand } from './types'

function isMem(op?: Operand): op is Operand & { kind: 'mem' } {
  return op?.kind === 'mem'
}

// Extra cycles to compute an effective address, per the 8086 EA-calculation
// table. Depends on which of displacement / base-register / index-register
// the addressing mode combines.
export function effectiveAddressCycles(op?: Operand): number {
  if (!isMem(op)) return 0
  const hasDisp = op.disp !== 0 || !!op.label
  if (op.base && op.index) {
    const slowPair = (op.base === 'BP' && op.index === 'SI') || (op.base === 'BX' && op.index === 'DI')
    return (slowPair ? 8 : 7) + (hasDisp ? 4 : 0)
  }
  if (op.base || op.index) return hasDisp ? 9 : 5
  return 6 // displacement-only, e.g. a bare data label
}

export interface CycleContext {
  /** Conditional jump / LOOP / JCXZ: whether the branch was actually taken. */
  taken?: boolean
  /** REP-prefixed string op: how many iterations actually ran this step. */
  repCount?: number
  /** SHL/SHR: the actual (post-clamp) shift count used. */
  shiftCount?: number
}

const CONDITIONAL_JUMPS: Mnemonic[] = ['JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE', 'JA', 'JAE', 'JB', 'JBE']

export function instructionCycles(
  instr: Instruction,
  op1: Operand | undefined,
  op2: Operand | undefined,
  isWord: boolean,
  ctx: CycleContext = {},
): number {
  const ea1 = effectiveAddressCycles(op1)
  const ea2 = effectiveAddressCycles(op2)
  const mem1 = isMem(op1)
  const mem2 = isMem(op2)

  if (CONDITIONAL_JUMPS.includes(instr.mnemonic)) return ctx.taken ? 16 : 4

  switch (instr.mnemonic) {
    case 'MOV':
      if (mem1) return 10 + ea1 // reg/imm -> mem
      if (mem2) return 8 + ea2 // mem -> reg
      return op2?.kind === 'imm' ? 4 : 2 // reg,imm / reg,reg
    case 'ADD': case 'SUB': case 'AND': case 'OR': case 'XOR': case 'CMP': case 'TEST': {
      const memCost = instr.mnemonic === 'TEST' ? 9 : 16
      if (mem1) return memCost + ea1
      if (mem2) return 9 + ea2
      return op2?.kind === 'imm' ? 4 : 3
    }
    case 'INC': case 'DEC': case 'NEG': case 'NOT':
      return mem1 ? 15 + ea1 : 3
    case 'MUL':
      return mem1 ? (isWord ? 128 : 78) + ea1 : isWord ? 125 : 75
    case 'DIV':
      return mem1 ? (isWord ? 155 : 87) + ea1 : isWord ? 153 : 85
    case 'SHL': case 'SHR': {
      const count = ctx.shiftCount ?? 1
      return mem1 ? 20 + ea1 + 4 * count : 8 + 4 * count
    }
    case 'XCHG':
      return mem1 || mem2 ? 17 + (ea1 || ea2) : 3
    case 'LEA':
      return 2 + ea2
    case 'JMP': return 15
    case 'JCXZ': return ctx.taken ? 18 : 6
    case 'LOOP': return ctx.taken ? 17 : 5
    case 'CALL': return 19
    case 'RET': return 8
    case 'PUSH': return mem1 ? 16 + ea1 : 11
    case 'POP': return mem1 ? 17 + ea1 : 8
    case 'IN': return op2?.kind === 'imm' ? 10 : 8
    case 'OUT': return op1?.kind === 'imm' ? 10 : 8
    case 'MOVSB': return ctx.repCount !== undefined ? 9 + ctx.repCount * 17 : 18
    case 'STOSB': return ctx.repCount !== undefined ? 9 + ctx.repCount * 10 : 11
    case 'LODSB': return 12
    case 'CMPSB': return ctx.repCount !== undefined ? 9 + ctx.repCount * 22 : 22
    case 'SCASB': return ctx.repCount !== undefined ? 9 + ctx.repCount * 15 : 15
    case 'CLD': case 'STD': return 2
    case 'HLT': return 2
    case 'INT': return 51
    case 'NOP': default: return 3
  }
}
