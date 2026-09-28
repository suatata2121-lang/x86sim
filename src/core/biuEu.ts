// A clock-by-clock model of the 8086's two internal units, for the Learn tab's
// BIU/EU topics: the Bus Interface Unit fetches instruction bytes into a
// 6-byte prefetch queue (one 4-clock T1-T4 bus cycle per word) while the
// Execution Unit independently pulls whole instructions off the front of that
// queue and executes them. The main Cpu (core/cpu.ts) runs instructions as
// atomic steps and knows nothing about bytes, queues, or bus cycles, so this
// is a separate, deliberately simplified model driven by hand-encoded
// programs with Intel-table clock counts:
// - the BIU starts a code fetch only when at least 2 queue bytes are free,
//   and always fetches a word (2 bytes) at a time;
// - an EU memory operand request takes priority over prefetching, but has to
//   wait for a bus cycle already in progress to finish;
// - the EU takes an instruction only once all of its bytes are in the queue;
// - a jump empties the queue and a code fetch still in flight is discarded.
// No wait states, odd-address penalties, or DMA/bus-hold are modeled.

export const QUEUE_SIZE = 6
export const CS_VALUE = 0x1000
export const DS_VALUE = 0x2000
export const ORIGIN = 0x0100

export interface PipeInstr {
  text: string
  bytes: number[]
  // EU clocks spent before the instruction's memory bus cycle (or the whole
  // instruction, when it has no memory operand).
  exec: number
  mem?: { kind: 'read' | 'write'; offset: number }
  // EU clocks spent after the memory operand arrives (e.g. the ALU work of
  // ADD AX, [BX] once the operand has been read).
  post?: number
  // Index of the instruction a jump transfers to.
  jumpTo?: number
}

export interface PipeProgram {
  id: string
  title: string
  description: string
  instrs: PipeInstr[]
}

export type BusKind = 'fetch' | 'read' | 'write'

export interface BusCycle {
  kind: BusKind
  t: 1 | 2 | 3 | 4
  offset: number
  count: number
  physical: number
  // A code fetch that was in flight when a jump flushed the queue: it still
  // has to finish on the bus, but its bytes are thrown away.
  stale: boolean
}

export interface QueueByte {
  value: number
  offset: number
  instr: number
}

export type BiuCell = { kind: BusKind | 'idle'; t?: number; stale?: boolean }
export type EuCell = { kind: 'exec' | 'wait-queue' | 'wait-bus' | 'done'; instr?: number }

export type EuPhase = 'idle' | 'exec' | 'wait-queue' | 'wait-bus' | 'done'

type Stage = { kind: 'exec'; clocks: number } | { kind: 'mem' }

export interface PipeState {
  clock: number
  queue: QueueByte[]
  fetchOffset: number
  bus: BusCycle | null
  // The bus cycle that finished on the latest clock, so the view can show
  // what it just delivered.
  completed: BusCycle | null
  pc: number
  current: number | null
  stage: number
  stageRemaining: number
  stageTotal: number
  euPhase: EuPhase
  memRequest: boolean
  memDone: boolean
  tookInstr: boolean
  // Set by a jump, and kept until the first fetch from the jump target
  // lands in the queue, so the flush stays visible while the EU waits.
  flushed: boolean
  executed: number[]
  biuHistory: BiuCell[]
  euHistory: EuCell[]
  done: boolean
}

export function instrOffsets(prog: PipeProgram): number[] {
  const offsets: number[] = []
  let off = ORIGIN
  for (const ins of prog.instrs) {
    offsets.push(off)
    off += ins.bytes.length
  }
  return offsets
}

function programEnd(prog: PipeProgram): number {
  return ORIGIN + prog.instrs.reduce((n, i) => n + i.bytes.length, 0)
}

function byteAt(prog: PipeProgram, offsets: number[], offset: number): QueueByte {
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offset >= offsets[i]) return { value: prog.instrs[i].bytes[offset - offsets[i]], offset, instr: i }
  }
  throw new Error(`No byte at offset ${offset}`)
}

function stagesOf(ins: PipeInstr): Stage[] {
  const stages: Stage[] = []
  if (ins.exec > 0) stages.push({ kind: 'exec', clocks: ins.exec })
  if (ins.mem) stages.push({ kind: 'mem' })
  if (ins.post) stages.push({ kind: 'exec', clocks: ins.post })
  return stages
}

export function initialState(): PipeState {
  return {
    clock: 0,
    queue: [],
    fetchOffset: ORIGIN,
    bus: null,
    completed: null,
    pc: 0,
    current: null,
    stage: 0,
    stageRemaining: 0,
    stageTotal: 0,
    euPhase: 'idle',
    memRequest: false,
    memDone: false,
    tookInstr: false,
    flushed: false,
    executed: [],
    biuHistory: [],
    euHistory: [],
    done: false,
  }
}

// Advances the whole CPU by one clock: the BIU first (so a bus cycle that
// finishes on this clock is visible to the EU on the same clock), then the EU.
export function tick(prog: PipeProgram, prev: PipeState): PipeState {
  if (prev.done) return prev
  const offsets = instrOffsets(prog)
  const end = programEnd(prog)
  const s: PipeState = {
    ...prev,
    clock: prev.clock + 1,
    queue: [...prev.queue],
    bus: prev.bus ? { ...prev.bus, t: (prev.bus.t + 1) as BusCycle['t'] } : null,
    completed: null,
    tookInstr: false,
    executed: [...prev.executed],
    biuHistory: [...prev.biuHistory],
    euHistory: [...prev.euHistory],
  }

  // ---- BIU ----
  if (!s.bus) {
    if (s.memRequest && s.current !== null) {
      const mem = prog.instrs[s.current].mem!
      s.bus = { kind: mem.kind, t: 1, offset: mem.offset, count: 2, physical: DS_VALUE * 16 + mem.offset, stale: false }
      s.memRequest = false
    } else if (QUEUE_SIZE - s.queue.length >= 2 && s.fetchOffset < end) {
      const count = Math.min(2, end - s.fetchOffset)
      s.bus = { kind: 'fetch', t: 1, offset: s.fetchOffset, count, physical: CS_VALUE * 16 + s.fetchOffset, stale: false }
      s.fetchOffset += count
    }
  }
  s.biuHistory.push(s.bus ? { kind: s.bus.kind, t: s.bus.t, stale: s.bus.stale } : { kind: 'idle' })
  if (s.bus && s.bus.t === 4) {
    if (s.bus.kind === 'fetch') {
      if (!s.bus.stale) {
        for (let i = 0; i < s.bus.count; i++) s.queue.push(byteAt(prog, offsets, s.bus.offset + i))
        s.flushed = false
      }
    } else {
      s.memDone = true
    }
    s.completed = s.bus
    s.bus = null
  }

  // ---- EU ----
  function beginStage() {
    const stages = stagesOf(prog.instrs[s.current!])
    if (s.stage >= stages.length) {
      completeInstr()
      return
    }
    const st = stages[s.stage]
    if (st.kind === 'exec') {
      s.euPhase = 'exec'
      s.stageRemaining = st.clocks
      s.stageTotal = st.clocks
    } else {
      s.euPhase = 'wait-bus'
      s.memRequest = true
    }
  }

  function completeInstr() {
    const idx = s.current!
    s.executed.push(idx)
    const target = prog.instrs[idx].jumpTo
    if (target !== undefined) {
      s.queue = []
      s.fetchOffset = offsets[target]
      if (s.bus && s.bus.kind === 'fetch') s.bus = { ...s.bus, stale: true }
      s.pc = target
      s.flushed = true
    } else {
      s.pc = idx + 1
    }
    s.euPhase = s.pc >= prog.instrs.length ? 'done' : 'idle'
    if (s.euPhase === 'done') s.done = true
  }

  if (s.euPhase === 'idle' || s.euPhase === 'wait-queue') {
    const ins = prog.instrs[s.pc]
    const need = ins.bytes.length
    if (s.queue.length >= need && s.queue[0].offset === offsets[s.pc]) {
      s.queue.splice(0, need)
      s.current = s.pc
      s.stage = 0
      s.tookInstr = true
      beginStage()
    } else {
      s.euPhase = 'wait-queue'
      s.euHistory.push({ kind: 'wait-queue' })
      return s
    }
  }

  if (s.euPhase === 'exec') {
    s.euHistory.push({ kind: 'exec', instr: s.current! })
    s.stageRemaining--
    if (s.stageRemaining === 0) {
      s.stage++
      beginStage()
    }
  } else if (s.euPhase === 'wait-bus') {
    s.euHistory.push({ kind: 'wait-bus', instr: s.current! })
    if (s.memDone) {
      s.memDone = false
      s.stage++
      beginStage()
    }
  } else if (s.euPhase === 'done') {
    s.euHistory.push({ kind: 'done' })
  }
  return s
}

// What the same instructions would cost on a CPU with no prefetch queue
// (e.g. the 8085): every instruction is fetched, *then* executed, strictly
// one after the other, so the bus and the execution logic never overlap.
export function sequentialClocks(prog: PipeProgram): number {
  let total = 0
  let pc = 0
  let guard = 0
  while (pc < prog.instrs.length && guard++ < 1000) {
    const ins = prog.instrs[pc]
    total += Math.ceil(ins.bytes.length / 2) * 4 + ins.exec + (ins.mem ? 4 : 0) + (ins.post ?? 0)
    pc = ins.jumpTo ?? pc + 1
  }
  return total
}

export type PipelineScenario = 'overlap' | 'starve' | 'full' | 'memory' | 'jump'

export const PIPELINE_PROGRAMS: Record<PipelineScenario, PipeProgram> = {
  overlap: {
    id: 'overlap',
    title: 'Overlap',
    description:
      'Register-only code: while the EU executes one instruction, the BIU is already fetching the next ones into the queue.',
    instrs: [
      { text: 'MOV AX, 1234h', bytes: [0xb8, 0x34, 0x12], exec: 4 },
      { text: 'MOV BX, AX', bytes: [0x89, 0xc3], exec: 2 },
      { text: 'ADD AX, BX', bytes: [0x01, 0xd8], exec: 3 },
      { text: 'MOV CX, 0005h', bytes: [0xb9, 0x05, 0x00], exec: 4 },
      { text: 'INC CX', bytes: [0x41], exec: 2 },
      { text: 'ADD AX, CX', bytes: [0x01, 0xc8], exec: 3 },
      { text: 'HLT', bytes: [0xf4], exec: 2 },
    ],
  },
  starve: {
    id: 'starve',
    title: 'Queue runs empty',
    description:
      'Fast 2-byte, 2-clock moves consume 1 byte per clock, but the BIU can only deliver 2 bytes per 4 clocks -- the EU keeps waiting for bytes.',
    instrs: [
      { text: 'MOV BX, AX', bytes: [0x89, 0xc3], exec: 2 },
      { text: 'MOV CX, BX', bytes: [0x89, 0xd9], exec: 2 },
      { text: 'MOV DX, CX', bytes: [0x89, 0xca], exec: 2 },
      { text: 'MOV SI, DX', bytes: [0x89, 0xd6], exec: 2 },
      { text: 'MOV DI, SI', bytes: [0x89, 0xf7], exec: 2 },
      { text: 'MOV AX, DI', bytes: [0x89, 0xf8], exec: 2 },
      { text: 'HLT', bytes: [0xf4], exec: 2 },
    ],
  },
  full: {
    id: 'full',
    title: 'Queue fills up',
    description:
      'MUL keeps the EU busy for 70 clocks. The BIU fills all 6 queue bytes and then has nothing to do but sit idle until the EU frees space.',
    instrs: [
      { text: 'MOV AL, 7', bytes: [0xb0, 0x07], exec: 4 },
      { text: 'MOV BL, 6', bytes: [0xb3, 0x06], exec: 4 },
      { text: 'MUL BL', bytes: [0xf6, 0xe3], exec: 70 },
      { text: 'ADD AX, BX', bytes: [0x01, 0xd8], exec: 3 },
      { text: 'MOV CX, AX', bytes: [0x89, 0xc1], exec: 2 },
      { text: 'INC CX', bytes: [0x41], exec: 2 },
      { text: 'HLT', bytes: [0xf4], exec: 2 },
    ],
  },
  memory: {
    id: 'memory',
    title: 'Memory operands',
    description:
      'Instructions with a memory operand need the bus themselves: the EU asks the BIU for a data read/write, which takes priority over prefetching.',
    instrs: [
      { text: 'MOV BX, 0204h', bytes: [0xbb, 0x04, 0x02], exec: 4 },
      { text: 'MOV AX, [0200h]', bytes: [0xa1, 0x00, 0x02], exec: 6, mem: { kind: 'read', offset: 0x0200 } },
      { text: 'ADD AX, [BX]', bytes: [0x03, 0x07], exec: 7, mem: { kind: 'read', offset: 0x0204 }, post: 3 },
      { text: 'MOV [0202h], AX', bytes: [0xa3, 0x02, 0x02], exec: 6, mem: { kind: 'write', offset: 0x0202 } },
      { text: 'HLT', bytes: [0xf4], exec: 2 },
    ],
  },
  jump: {
    id: 'jump',
    title: 'Jump flushes the queue',
    description:
      'The BIU has already prefetched the bytes after JMP. When the jump executes they are useless: the queue is emptied and fetching restarts at the target.',
    instrs: [
      { text: 'MOV AX, 0001h', bytes: [0xb8, 0x01, 0x00], exec: 4 },
      { text: 'JMP SHORT TARGET', bytes: [0xeb, 0x04], exec: 7, jumpTo: 6 },
      { text: 'INC AX', bytes: [0x40], exec: 2 },
      { text: 'INC AX', bytes: [0x40], exec: 2 },
      { text: 'INC AX', bytes: [0x40], exec: 2 },
      { text: 'INC AX', bytes: [0x40], exec: 2 },
      { text: 'TARGET: MOV BX, AX', bytes: [0x89, 0xc3], exec: 2 },
      { text: 'HLT', bytes: [0xf4], exec: 2 },
    ],
  },
}
