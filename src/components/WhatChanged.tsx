import type { Cpu, CpuSnapshot } from '../core/cpu'
import type { Flags, Reg16 } from '../core/types'
import { formatByte, formatWord, useRegisterFormat } from './regFormat'

// The one-line "what changed" under the editor (#73): the instruction the
// last Step ran and every register, flag and memory byte it changed. The
// register table already highlights changed rows, but on a busy page
// students missed it.

const REGS: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'DS', 'ES', 'SS', 'CS']
const SEGMENTS = new Set<Reg16>(['DS', 'ES', 'SS', 'CS'])
const FLAGS: (keyof Flags)[] = ['CF', 'PF', 'AF', 'ZF', 'SF', 'IF', 'DF', 'OF']
// A REP MOVSB can touch many bytes; the line stays one line.
const MAX_MEMORY = 4

export interface StepChange {
  instruction: string
  regs: [Reg16, number, number][]
  flags: [keyof Flags, boolean, boolean][]
  memory: [number, number, number][]
  /** Bytes changed beyond the MAX_MEMORY shown. */
  moreMemory: number
}

/**
 * What the CPU did since `before`, or null when that was not exactly one
 * instruction (a Run, or nothing yet). After Step Back `before` is the undo
 * point of the step before, so the line shows that step again.
 */
export function describeStep(before: CpuSnapshot | undefined, cpu: Cpu, source: string | null): StepChange | null {
  if (!before || cpu.steps !== before.steps + 1) return null
  const line = cpu.instructions[before.ip]?.line
  const text = line !== undefined ? (source?.split('\n')[line - 1] ?? '') : ''
  const memory: [number, number, number][] = []
  let moreMemory = 0
  for (let a = 0; a < cpu.memory.length; a++) {
    if (cpu.memory[a] === before.memory[a]) continue
    if (memory.length < MAX_MEMORY) memory.push([a, before.memory[a], cpu.memory[a]])
    else moreMemory++
  }
  return {
    instruction: text.replace(/;.*/, '').trim().replace(/\s+/g, ' '),
    regs: REGS.filter((r) => cpu.regs[r] !== before.regs[r]).map((r) => [r, before.regs[r], cpu.regs[r]]),
    flags: FLAGS.filter((f) => cpu.flags[f] !== before.flags[f]).map((f) => [f, before.flags[f], cpu.flags[f]]),
    memory,
    moreMemory,
  }
}

export function WhatChanged({ change, className }: { change: StepChange | null; className?: string }) {
  const [fmt] = useRegisterFormat()
  if (!change) return null
  const parts = [
    ...change.regs.map(([r, a, b]) => `${r} ${formatWord(a, fmt, SEGMENTS.has(r))} → ${formatWord(b, fmt, SEGMENTS.has(r))}`),
    ...change.flags.map(([f, a, b]) => `${f} ${a ? 1 : 0} → ${b ? 1 : 0}`),
    ...change.memory.map(([addr, a, b]) => `[${addr.toString(16).toUpperCase().padStart(4, '0')}h] ${formatByte(a, fmt)} → ${formatByte(b, fmt)}`),
    ...(change.moreMemory > 0 ? [`${change.moreMemory} more bytes`] : []),
  ]
  return (
    <p className={`what-changed${className ? ` ${className}` : ''}`} aria-live="polite">
      <code>{change.instruction || '(instruction)'}</code> → {parts.length ? parts.join(', ') : 'no register changed'}
    </p>
  )
}
