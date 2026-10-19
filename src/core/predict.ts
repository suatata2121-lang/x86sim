// Predict-step questions (issue #11): the student guesses what a short
// snippet does before running it. A 'run' question's right answer is never
// typed into the data: the snippet runs in its own Cpu (like the grader) and
// the answer is read from the result, so a question can't carry a wrong key.
import { assemble } from './assembler'
import { Cpu } from './cpu'
import type { Flags, Reg8, RegName } from './types'

export type PredictTarget =
  | { reg: RegName }
  | { flag: keyof Flags }
  /** A byte (or word) of memory at an absolute address. */
  | { mem: number; size?: 'byte' | 'word' }
  /** The port that ends up holding this value (for "which port now holds 5?"). */
  | { portWith: number }
  /** What the snippet printed with INT 21h. */
  | { output: true }

export type PredictQuestion =
  | { id: string; kind: 'run'; question: string; code: string; target: PredictTarget }
  | { id: string; kind: 'choice'; question: string; code?: string; options: string[]; answer: number }

const REG8 = new Set<string>(['AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH'])

export type PredictValue = { kind: 'number'; value: number; bits: 1 | 8 | 16 } | { kind: 'text'; value: string }

/** Runs a 'run' question's snippet (with HLT appended) and reads its target. */
export function predictAnswer(q: Extract<PredictQuestion, { kind: 'run' }>): PredictValue {
  const { instructions, data, errors } = assemble(`${q.code}\nHLT\n`)
  if (errors.length) throw new Error(`Predict question ${q.id} does not assemble: ${errors[0].message}`)
  const cpu = new Cpu()
  cpu.load(instructions, data)
  cpu.run(10_000)
  const t = q.target
  if ('reg' in t) return { kind: 'number', value: cpu.getReg(t.reg), bits: REG8.has(t.reg) ? 8 : 16 }
  if ('flag' in t) return { kind: 'number', value: cpu.flags[t.flag] ? 1 : 0, bits: 1 }
  if ('mem' in t) {
    const word = t.size === 'word'
    const v = word ? cpu.memory[t.mem] | (cpu.memory[(t.mem + 1) & 0xffff] << 8) : cpu.memory[t.mem]
    return { kind: 'number', value: v, bits: word ? 16 : 8 }
  }
  if ('portWith' in t) return { kind: 'number', value: cpu.ports.findIndex((v) => v === t.portWith), bits: 16 }
  return { kind: 'text', value: cpu.output.join('') }
}

/**
 * A typed number in any notation the course uses: 0FDh, FDh, 0xFD, 253,
 * 11111101b, or a negative decimal (read as two's complement). Digits A-F
 * without a suffix count as hex, so "FD" works; plain digits are decimal.
 */
export function parseNumber(text: string, bits: number): number | null {
  const t = text.trim().replace(/_/g, '')
  let v: number
  if (/^-?\d+$/.test(t)) v = parseInt(t, 10)
  else if (/^0x[0-9a-f]+$/i.test(t)) v = parseInt(t.slice(2), 16)
  else if (/^[0-9a-f]+h$/i.test(t)) v = parseInt(t.slice(0, -1), 16)
  else if (/^[01]+b$/i.test(t)) v = parseInt(t.slice(0, -1), 2)
  else if (/^[0-9a-f]+$/i.test(t)) v = parseInt(t, 16)
  else return null
  if (bits === 1) return v === 0 || v === 1 ? v : null
  const mask = bits === 8 ? 0xff : 0xffff
  if (v < -(mask + 1) / 2 || v > mask) return null
  return v & mask
}

export function checkAnswer(expected: PredictValue, typed: string): boolean {
  if (expected.kind === 'text') return typed.trim().replace(/^['"]|['"]$/g, '') === expected.value
  return parseNumber(typed, expected.bits) === expected.value
}

/** How the right answer is shown after Check: decimal and hex, or the flag/text as is. */
export function formatAnswer(v: PredictValue): string {
  if (v.kind === 'text') return `"${v.value}"`
  if (v.bits === 1) return String(v.value)
  const digits = v.bits === 8 ? 2 : 4
  return `${v.value} = ${v.value.toString(16).toUpperCase().padStart(digits, '0')}h`
}

export const isReg8 = (r: string): r is Reg8 => REG8.has(r)
