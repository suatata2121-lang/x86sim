// Automated grading engine: runs a student's assembled program against a set
// of instructor-defined test cases and checks the resulting CPU state
// (registers/flags/memory/output) against expectations. Each test case gets
// its own fresh Cpu instance, so test cases never interfere with each other
// even though they share the same assembled program.
import { assemble } from './assembler'
import { Cpu } from './cpu'
import type { AssembleError, Flags, RegName } from './types'

export interface MemoryAssertion {
  /** A raw absolute address. Ignored if `label` is given. */
  address?: number
  /** A declared DB/DW data label; resolved via the program's own data segment. */
  label?: string
  /** Added to `address` or the label's address before reading. */
  offset?: number
  size?: 'byte' | 'word'
  equals: number
}

export interface OutputAssertion {
  equals?: string
  contains?: string
}

export interface PortAssertion {
  /** Port number (0-255), e.g. 0x41 for the virtual stepper motor. */
  port: number
  equals: number
}

export interface Expectation {
  regs?: Partial<Record<RegName, number>>
  flags?: Partial<Flags>
  memory?: MemoryAssertion[]
  ports?: PortAssertion[]
  output?: OutputAssertion
  /** Defaults to true: the program must reach HLT / INT 21h AH=4Ch on its own. */
  halted?: boolean
}

export interface TestCase {
  name: string
  /** Answers fed in order each time the program requests keyboard input (INT 21h AH=01/0A). */
  input?: string[]
  expect: Expectation
  maxSteps?: number
}

export interface TestResult {
  name: string
  passed: boolean
  failures: string[]
  steps: number
  cycles: number
}

export interface GradeReport {
  assembled: boolean
  assembleErrors: AssembleError[]
  results: TestResult[]
  passedCount: number
  totalCount: number
}

const DEFAULT_MAX_STEPS = 200_000

function resolveAddress(cpu: Cpu, assertion: MemoryAssertion): number | null {
  const base = assertion.label ? cpu.dataLabels.get(assertion.label)?.address : assertion.address
  if (base === undefined) return null
  return (base + (assertion.offset ?? 0)) & 0xffff
}

function readMemValue(cpu: Cpu, addr: number, size: 'byte' | 'word' = 'byte'): number {
  return size === 'word' ? cpu.memory[addr] | (cpu.memory[(addr + 1) & 0xffff] << 8) : cpu.memory[addr]
}

// Drives the Cpu to completion, answering keyboard-input requests from the
// test case's scripted `input` list as they come up (mirroring what
// provideInput() does interactively in the UI).
function runToCompletion(cpu: Cpu, input: string[], maxSteps: number): void {
  let inputIndex = 0
  while (!cpu.halted && cpu.steps < maxSteps) {
    cpu.run(maxSteps)
    if (!cpu.waitingForInput) break
    cpu.provideInput(input[inputIndex++] ?? '')
  }
}

export function runTestCase(cpu: Cpu, testCase: TestCase): TestResult {
  const failures: string[] = []
  const maxSteps = testCase.maxSteps ?? DEFAULT_MAX_STEPS

  try {
    runToCompletion(cpu, testCase.input ?? [], maxSteps)
  } catch (e) {
    failures.push(`Runtime error: ${e instanceof Error ? e.message : String(e)}`)
    return { name: testCase.name, passed: false, failures, steps: cpu.steps, cycles: cpu.cycles }
  }

  const expectHalted = testCase.expect.halted ?? true
  if (cpu.halted !== expectHalted) {
    failures.push(
      expectHalted
        ? `Program did not halt within ${maxSteps} steps (check for an infinite loop or a missing INT 21h AH=4Ch)`
        : `Expected the program to still be running, but it halted`,
    )
  }

  for (const [reg, expected] of Object.entries(testCase.expect.regs ?? {})) {
    const actual = cpu.getReg(reg as RegName)
    if (actual !== expected) failures.push(`Register ${reg}: expected ${expected}, got ${actual}`)
  }

  for (const [flag, expected] of Object.entries(testCase.expect.flags ?? {})) {
    const actual = cpu.flags[flag as keyof Flags]
    if (actual !== expected) failures.push(`Flag ${flag}: expected ${expected}, got ${actual}`)
  }

  for (const m of testCase.expect.memory ?? []) {
    const addr = resolveAddress(cpu, m)
    const where = m.label ? `${m.label}${m.offset ? `+${m.offset}` : ''}` : `[${(m.address ?? 0).toString(16)}h]`
    if (addr === null) {
      failures.push(`Memory ${where}: unknown data label`)
      continue
    }
    const actual = readMemValue(cpu, addr, m.size)
    if (actual !== m.equals) failures.push(`Memory ${where}: expected ${m.equals}, got ${actual}`)
  }

  for (const p of testCase.expect.ports ?? []) {
    const actual = cpu.ports[p.port & 0xff]
    if (actual !== p.equals) {
      failures.push(`Port ${p.port.toString(16)}h: expected ${p.equals}, got ${actual}`)
    }
  }

  if (testCase.expect.output) {
    const actualOutput = cpu.output.join('')
    const { equals, contains } = testCase.expect.output
    if (equals !== undefined && actualOutput !== equals) {
      failures.push(`Output: expected ${JSON.stringify(equals)}, got ${JSON.stringify(actualOutput)}`)
    }
    if (contains !== undefined && !actualOutput.includes(contains)) {
      failures.push(`Output: expected it to contain ${JSON.stringify(contains)}, got ${JSON.stringify(actualOutput)}`)
    }
  }

  return { name: testCase.name, passed: failures.length === 0, failures, steps: cpu.steps, cycles: cpu.cycles }
}

export function gradeSource(source: string, testCases: TestCase[]): GradeReport {
  const { instructions, data, errors } = assemble(source)
  if (errors.length > 0) {
    return { assembled: false, assembleErrors: errors, results: [], passedCount: 0, totalCount: testCases.length }
  }

  const results = testCases.map((testCase) => {
    const cpu = new Cpu()
    cpu.load(instructions, data)
    return runTestCase(cpu, testCase)
  })

  return {
    assembled: true,
    assembleErrors: [],
    results,
    passedCount: results.filter((r) => r.passed).length,
    totalCount: testCases.length,
  }
}
