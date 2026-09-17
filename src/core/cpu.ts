import type { DataDeclaration, Flags, Instruction, Mnemonic, Operand, PendingInput, Reg16, Reg8, RegName } from './types'
import { instructionCycles } from './cycles'

const REG16: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'DS', 'ES', 'SS', 'CS']

const REG8_PARENT: Record<Reg8, { parent: Reg16; high: boolean }> = {
  AH: { parent: 'AX', high: true }, AL: { parent: 'AX', high: false },
  BH: { parent: 'BX', high: true }, BL: { parent: 'BX', high: false },
  CH: { parent: 'CX', high: true }, CL: { parent: 'CX', high: false },
  DH: { parent: 'DX', high: true }, DL: { parent: 'DX', high: false },
}

const MEMORY_SIZE = 0x10000
const INITIAL_SP = 0xfffe

export interface MnemonicProfile {
  count: number
  cycles: number
}

// Everything step()/run()/provideInput() can mutate — i.e. everything needed
// to fully rewind the Cpu to an earlier point via restore(). Deliberately
// excludes instructions/data/labels/dataLabels: those are set once by load()
// and never change during execution, so there's nothing to snapshot there.
export interface CpuSnapshot {
  regs: Record<Reg16, number>
  flags: Flags
  memory: Uint8Array
  ports: Uint8Array
  ip: number
  halted: boolean
  hitBreakpoint: boolean
  waitingForInput: PendingInput | null
  output: string[]
  steps: number
  lastInstruction: Instruction | null
  cycles: number
  profile: Map<Mnemonic, MnemonicProfile>
  peakStackBytes: number
  memoryWrites: Set<number>
}

export class Cpu {
  regs: Record<Reg16, number> = { AX: 0, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: INITIAL_SP, DS: 0, ES: 0, SS: 0, CS: 0 }
  flags: Flags = { ZF: false, SF: false, CF: false, OF: false, DF: false }
  memory = new Uint8Array(MEMORY_SIZE)
  // Virtual I/O ports for IN/OUT, driving the virtual device views (traffic
  // light, stepper motor, 7-segment display, thermometer — see Devices.tsx).
  ports = new Uint8Array(256)
  instructions: Instruction[] = []
  data: DataDeclaration[] = []
  labels = new Map<string, number>()
  dataLabels = new Map<string, { address: number; length: number }>()
  ip = 0
  halted = false
  hitBreakpoint = false
  waitingForInput: PendingInput | null = null
  output: string[] = []
  steps = 0
  // Profiler state (see ProfilerView.tsx): idealized total clock cycles spent,
  // a per-mnemonic breakdown of that cost, the deepest the stack has grown
  // (in bytes below the initial SP), and the distinct memory addresses
  // written outside the declared .DATA segment (PUSH/CALL stack writes don't
  // count here — they're covered by peakStackBytes instead).
  cycles = 0
  profile = new Map<Mnemonic, MnemonicProfile>()
  peakStackBytes = 0
  memoryWrites = new Set<number>()
  // The instruction step() most recently fetched (set even if it threw or is
  // still waiting on keyboard input) — lets the UI show what the CPU is/was
  // doing without re-deriving it from ip, which may already point elsewhere.
  lastInstruction: Instruction | null = null
  // Visualization-only instrumentation for the Address/Data/Control bus demo
  // (BusArchitectureView): the literal address/value a memory or port access
  // most recently carried. Not part of CpuSnapshot -- purely cosmetic, so a
  // stale value after Step Back is harmless (the next step overwrites it).
  lastAddress: number | null = null
  lastMemValue: number | null = null
  lastPort: number | null = null
  lastPortValue: number | null = null

  load(instructions: Instruction[], data: DataDeclaration[] = []) {
    this.instructions = instructions
    this.data = data
    this.labels.clear()
    instructions.forEach((instr, idx) => {
      if (instr.label) this.labels.set(instr.label, idx)
    })
    this.dataLabels.clear()
    for (const d of data) this.dataLabels.set(d.name, { address: d.address, length: d.bytes.length })
    this.reset()
  }

  reset() {
    this.regs = { AX: 0, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: INITIAL_SP, DS: 0, ES: 0, SS: 0, CS: 0 }
    this.flags = { ZF: false, SF: false, CF: false, OF: false, DF: false }
    this.memory.fill(0)
    this.ports.fill(0)
    for (const d of this.data) {
      for (let i = 0; i < d.bytes.length; i++) this.memory[(d.address + i) & 0xffff] = d.bytes[i]
    }
    this.ip = 0
    this.halted = false
    this.hitBreakpoint = false
    this.waitingForInput = null
    this.output = []
    this.steps = 0
    this.lastInstruction = null
    this.cycles = 0
    this.profile.clear()
    this.peakStackBytes = 0
    this.memoryWrites.clear()
  }

  // Captures everything step()/run()/provideInput() can mutate, for the
  // Step Back UI feature — restore() later rewinds to exactly this point.
  snapshot(): CpuSnapshot {
    return {
      regs: { ...this.regs },
      flags: { ...this.flags },
      memory: this.memory.slice(),
      ports: this.ports.slice(),
      ip: this.ip,
      halted: this.halted,
      hitBreakpoint: this.hitBreakpoint,
      waitingForInput: this.waitingForInput ? { ...this.waitingForInput } : null,
      output: [...this.output],
      steps: this.steps,
      lastInstruction: this.lastInstruction,
      cycles: this.cycles,
      profile: new Map([...this.profile].map(([m, p]) => [m, { ...p }])),
      peakStackBytes: this.peakStackBytes,
      memoryWrites: new Set(this.memoryWrites),
    }
  }

  restore(snap: CpuSnapshot) {
    this.regs = { ...snap.regs }
    this.flags = { ...snap.flags }
    this.memory.set(snap.memory)
    this.ports.set(snap.ports)
    this.ip = snap.ip
    this.halted = snap.halted
    this.hitBreakpoint = snap.hitBreakpoint
    this.waitingForInput = snap.waitingForInput ? { ...snap.waitingForInput } : null
    this.output = [...snap.output]
    this.steps = snap.steps
    this.lastInstruction = snap.lastInstruction
    this.cycles = snap.cycles
    this.profile = new Map([...snap.profile].map(([m, p]) => [m, { ...p }]))
    this.peakStackBytes = snap.peakStackBytes
    this.memoryWrites = new Set(snap.memoryWrites)
  }

  private trackWrite(addr: number) {
    this.memoryWrites.add(addr & 0xffff)
  }

  private recordCycles(mnemonic: Mnemonic, cost: number) {
    this.cycles += cost
    const entry = this.profile.get(mnemonic)
    if (entry) { entry.count += 1; entry.cycles += cost }
    else this.profile.set(mnemonic, { count: 1, cycles: cost })
    this.peakStackBytes = Math.max(this.peakStackBytes, Math.max(0, INITIAL_SP - this.regs.SP))
  }

  private isReg8(name: RegName): name is Reg8 {
    return name in REG8_PARENT
  }

  getReg(name: RegName): number {
    if (this.isReg8(name)) {
      const { parent, high } = REG8_PARENT[name]
      const word = this.regs[parent]
      return high ? (word >> 8) & 0xff : word & 0xff
    }
    return this.regs[name as Reg16] & 0xffff
  }

  setReg(name: RegName, value: number) {
    if (this.isReg8(name)) {
      const { parent, high } = REG8_PARENT[name]
      const v = value & 0xff
      const word = this.regs[parent]
      this.regs[parent] = high ? (word & 0x00ff) | (v << 8) : (word & 0xff00) | v
      return
    }
    this.regs[name as Reg16] = value & 0xffff
  }

  private operandSize(op: Operand): 'byte' | 'word' | undefined {
    if (op.kind === 'reg') return REG16.includes(op.name as Reg16) ? 'word' : 'byte'
    if (op.kind === 'mem') return op.size
    return undefined
  }

  private effectiveAddress(op: Operand & { kind: 'mem' }): number {
    let addr = op.disp
    if (op.base) addr += this.getReg(op.base)
    if (op.index) addr += this.getReg(op.index)
    if (op.label) {
      const info = this.dataLabels.get(op.label)
      if (!info) throw new Error(`Undefined data label: ${op.label}`)
      addr += info.address
    }
    return addr & 0xffff
  }

  private readMem(op: Operand & { kind: 'mem' }, isWord: boolean): number {
    const addr = this.effectiveAddress(op)
    const value = !isWord ? this.memory[addr] : this.memory[addr] | (this.memory[(addr + 1) & 0xffff] << 8)
    this.lastAddress = addr
    this.lastMemValue = value
    return value
  }

  private writeMem(op: Operand & { kind: 'mem' }, value: number, isWord: boolean) {
    const addr = this.effectiveAddress(op)
    this.memory[addr] = value & 0xff
    this.trackWrite(addr)
    if (isWord) {
      this.memory[(addr + 1) & 0xffff] = (value >> 8) & 0xff
      this.trackWrite(addr + 1)
    }
    this.lastAddress = addr
    this.lastMemValue = value & (isWord ? 0xffff : 0xff)
  }

  private readOperand(op: Operand, isWord: boolean): number {
    switch (op.kind) {
      case 'reg': return this.getReg(op.name)
      case 'imm': return op.value
      case 'mem': return this.readMem(op, isWord)
      case 'label': {
        const info = this.dataLabels.get(op.name)
        if (info) return info.address
        const idx = this.labels.get(op.name)
        if (idx !== undefined) return idx
        throw new Error(`Undefined label: ${op.name}`)
      }
    }
  }

  private writeOperand(op: Operand, value: number, isWord: boolean) {
    if (op.kind === 'reg') { this.setReg(op.name, isWord ? value & 0xffff : value & 0xff); return }
    if (op.kind === 'mem') { this.writeMem(op, value, isWord); return }
    throw new Error('Destination must be a register or memory address')
  }

  private setArithFlags(result: number, isWord: boolean) {
    const mask = isWord ? 0xffff : 0xff
    const signBit = isWord ? 0x8000 : 0x80
    this.flags.ZF = (result & mask) === 0
    this.flags.SF = (result & signBit) !== 0
    this.flags.CF = result < 0 || result > mask
  }

  private setLogicalFlags(result: number, isWord: boolean) {
    const mask = isWord ? 0xffff : 0xff
    const signBit = isWord ? 0x8000 : 0x80
    this.flags.ZF = (result & mask) === 0
    this.flags.SF = (result & signBit) !== 0
    this.flags.CF = false
    this.flags.OF = false
  }

  private jumpToLabel(op: Operand) {
    if (op.kind === 'label') {
      const idx = this.labels.get(op.name)
      if (idx === undefined) throw new Error(`Undefined label: ${op.name}`)
      this.ip = idx
      return
    }
    throw new Error('Jump target must be a label')
  }

  // Byte string ops (MOVSB/STOSB/LODSB/CMPSB/SCASB): operate implicitly on
  // memory[SI]/memory[DI], advancing SI and/or DI by +1 (DF=0) or -1 (DF=1)
  // afterward. No segment registers, so SI/DI are used as absolute addresses.
  private execStringOp(mnemonic: 'MOVSB' | 'STOSB' | 'LODSB' | 'CMPSB' | 'SCASB') {
    switch (mnemonic) {
      case 'MOVSB':
        this.memory[this.regs.DI & 0xffff] = this.memory[this.regs.SI & 0xffff]
        this.trackWrite(this.regs.DI)
        break
      case 'STOSB':
        this.memory[this.regs.DI & 0xffff] = this.getReg('AL')
        this.trackWrite(this.regs.DI)
        break
      case 'LODSB':
        this.setReg('AL', this.memory[this.regs.SI & 0xffff])
        break
      case 'CMPSB':
        this.setArithFlags(this.memory[this.regs.SI & 0xffff] - this.memory[this.regs.DI & 0xffff], false)
        break
      case 'SCASB':
        this.setArithFlags(this.getReg('AL') - this.memory[this.regs.DI & 0xffff], false)
        break
    }
    const delta = this.flags.DF ? -1 : 1
    if (mnemonic === 'MOVSB' || mnemonic === 'CMPSB') this.regs.SI = (this.regs.SI + delta) & 0xffff
    if (mnemonic === 'MOVSB' || mnemonic === 'STOSB' || mnemonic === 'CMPSB' || mnemonic === 'SCASB') {
      this.regs.DI = (this.regs.DI + delta) & 0xffff
    }
    if (mnemonic === 'LODSB') this.regs.SI = (this.regs.SI + delta) & 0xffff
  }

  step() {
    if (this.halted || this.waitingForInput) return
    if (this.ip < 0 || this.ip >= this.instructions.length) {
      this.halted = true
      return
    }
    const instr = this.instructions[this.ip]
    this.lastInstruction = instr
    const [op1, op2] = instr.ops
    const isWord = (op1 && this.operandSize(op1)) === 'byte' || (op2 && this.operandSize(op2)) === 'byte'
      ? false
      : true
    let nextIp = this.ip + 1
    let repIterations: number | undefined
    let shiftCount: number | undefined

    switch (instr.mnemonic) {
      case 'NOP': break
      case 'MOV': this.writeOperand(op1, this.readOperand(op2, isWord), isWord); break
      case 'ADD': {
        const result = this.readOperand(op1, isWord) + this.readOperand(op2, isWord)
        this.writeOperand(op1, result, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'SUB': {
        const result = this.readOperand(op1, isWord) - this.readOperand(op2, isWord)
        this.writeOperand(op1, result, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'CMP': {
        const result = this.readOperand(op1, isWord) - this.readOperand(op2, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'INC': {
        const result = this.readOperand(op1, isWord) + 1
        this.writeOperand(op1, result, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'DEC': {
        const result = this.readOperand(op1, isWord) - 1
        this.writeOperand(op1, result, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'MUL': {
        const value = this.readOperand(op1, isWord)
        if (isWord) {
          const product = this.getReg('AX') * value
          this.regs.AX = product & 0xffff
          this.regs.DX = Math.floor(product / 0x10000) & 0xffff
          const overflow = this.regs.DX !== 0
          this.flags.CF = overflow
          this.flags.OF = overflow
        } else {
          const product = this.getReg('AL') * value
          this.setReg('AX', product & 0xffff)
          const overflow = (product & 0xff00) !== 0
          this.flags.CF = overflow
          this.flags.OF = overflow
        }
        break
      }
      case 'DIV': {
        const value = this.readOperand(op1, isWord)
        if (value === 0) throw new Error('Division by zero (DIV)')
        if (isWord) {
          const dividend = this.regs.DX * 0x10000 + this.regs.AX
          const quotient = Math.floor(dividend / value)
          if (quotient > 0xffff) throw new Error('Division overflow (DIV): result does not fit in a 16-bit register')
          this.regs.AX = quotient & 0xffff
          this.regs.DX = (dividend % value) & 0xffff
        } else {
          const dividend = this.getReg('AX')
          const quotient = Math.floor(dividend / value)
          if (quotient > 0xff) throw new Error('Division overflow (DIV): result does not fit in an 8-bit register')
          this.setReg('AL', quotient & 0xff)
          this.setReg('AH', (dividend % value) & 0xff)
        }
        break
      }
      case 'AND': {
        const result = this.readOperand(op1, isWord) & this.readOperand(op2, isWord)
        this.writeOperand(op1, result, isWord)
        this.setLogicalFlags(result, isWord)
        break
      }
      case 'OR': {
        const result = this.readOperand(op1, isWord) | this.readOperand(op2, isWord)
        this.writeOperand(op1, result, isWord)
        this.setLogicalFlags(result, isWord)
        break
      }
      case 'XOR': {
        const result = this.readOperand(op1, isWord) ^ this.readOperand(op2, isWord)
        this.writeOperand(op1, result, isWord)
        this.setLogicalFlags(result, isWord)
        break
      }
      case 'NOT': {
        const result = ~this.readOperand(op1, isWord)
        this.writeOperand(op1, result, isWord)
        break
      }
      case 'XCHG': {
        const a = this.readOperand(op1, isWord)
        const b = this.readOperand(op2, isWord)
        this.writeOperand(op1, b, isWord)
        this.writeOperand(op2, a, isWord)
        break
      }
      case 'NEG': {
        const result = -this.readOperand(op1, isWord)
        this.writeOperand(op1, result, isWord)
        this.setArithFlags(result, isWord)
        break
      }
      case 'TEST': {
        const result = this.readOperand(op1, isWord) & this.readOperand(op2, isWord)
        this.setLogicalFlags(result, isWord)
        break
      }
      case 'LEA': {
        // Loads the address op2 refers to, never the value stored there --
        // op2.kind==='mem' computes it from base/index/disp like a normal
        // memory access would, and 'label' already resolves to an address
        // (see readOperand), so no special-casing is needed there.
        const addr = op2.kind === 'mem' ? this.effectiveAddress(op2) : this.readOperand(op2, true)
        this.writeOperand(op1, addr, true)
        break
      }
      case 'SHL': {
        const size = isWord ? 16 : 8
        const mask = isWord ? 0xffff : 0xff
        const value = this.readOperand(op1, isWord)
        const count = Math.min(this.readOperand(op2, false), 31)
        shiftCount = count
        const result = count === 0 ? value : (value << count) & mask
        if (count > 0) this.flags.CF = count <= size && ((value >> (size - count)) & 1) === 1
        this.writeOperand(op1, result, isWord)
        this.flags.ZF = (result & mask) === 0
        this.flags.SF = (result & (isWord ? 0x8000 : 0x80)) !== 0
        this.flags.OF = false
        break
      }
      case 'SHR': {
        const mask = isWord ? 0xffff : 0xff
        const value = this.readOperand(op1, isWord)
        const count = Math.min(this.readOperand(op2, false), 31)
        shiftCount = count
        const result = count === 0 ? value : (value >>> count) & mask
        if (count > 0) this.flags.CF = ((value >> (count - 1)) & 1) === 1
        this.writeOperand(op1, result, isWord)
        this.flags.ZF = (result & mask) === 0
        this.flags.SF = (result & (isWord ? 0x8000 : 0x80)) !== 0
        this.flags.OF = false
        break
      }
      case 'CALL': {
        const returnIdx = this.ip + 1
        const sp = (this.regs.SP - 2) & 0xffff
        this.regs.SP = sp
        this.memory[sp] = returnIdx & 0xff
        this.memory[(sp + 1) & 0xffff] = (returnIdx >> 8) & 0xff
        this.jumpToLabel(op1)
        nextIp = this.ip
        break
      }
      case 'RET': {
        const sp = this.regs.SP
        const idx = this.memory[sp] | (this.memory[(sp + 1) & 0xffff] << 8)
        this.regs.SP = (sp + 2) & 0xffff
        nextIp = idx
        break
      }
      case 'JMP': this.jumpToLabel(op1); nextIp = this.ip; break
      case 'JE': if (this.flags.ZF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JNE': if (!this.flags.ZF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JG': if (!this.flags.ZF && this.flags.SF === this.flags.OF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JL': if (this.flags.SF !== this.flags.OF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JGE': if (this.flags.SF === this.flags.OF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JLE': if (this.flags.ZF || this.flags.SF !== this.flags.OF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JA': if (!this.flags.CF && !this.flags.ZF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JAE': if (!this.flags.CF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JB': if (this.flags.CF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JBE': if (this.flags.CF || this.flags.ZF) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'JCXZ': if (this.getReg('CX') === 0) { this.jumpToLabel(op1); nextIp = this.ip }; break
      case 'LOOP': {
        const cx = (this.getReg('CX') - 1) & 0xffff
        this.setReg('CX', cx)
        if (cx !== 0) { this.jumpToLabel(op1); nextIp = this.ip }
        break
      }
      case 'PUSH': {
        const sp = (this.regs.SP - 2) & 0xffff
        this.regs.SP = sp
        const value = this.readOperand(op1, true)
        this.memory[sp] = value & 0xff
        this.memory[(sp + 1) & 0xffff] = (value >> 8) & 0xff
        break
      }
      case 'POP': {
        const sp = this.regs.SP
        const value = this.memory[sp] | (this.memory[(sp + 1) & 0xffff] << 8)
        this.writeOperand(op1, value, true)
        this.regs.SP = (sp + 2) & 0xffff
        break
      }
      case 'IN': {
        if (op1.kind !== 'reg') break
        const isWordIn = op1.name === 'AX'
        const port = op2.kind === 'imm' ? op2.value : this.getReg('DX')
        const value = isWordIn
          ? this.ports[port & 0xff] | (this.ports[(port + 1) & 0xff] << 8)
          : this.ports[port & 0xff]
        this.setReg(op1.name, value)
        this.lastPort = port & 0xff
        this.lastPortValue = value
        break
      }
      case 'OUT': {
        if (op2.kind !== 'reg') break
        const isWordOut = op2.name === 'AX'
        const port = op1.kind === 'imm' ? op1.value : this.getReg('DX')
        const value = this.getReg(op2.name)
        this.ports[port & 0xff] = value & 0xff
        if (isWordOut) this.ports[(port + 1) & 0xff] = (value >> 8) & 0xff
        this.lastPort = port & 0xff
        this.lastPortValue = value
        break
      }
      case 'MOVSB': case 'STOSB': case 'LODSB': case 'CMPSB': case 'SCASB': {
        if (instr.rep) {
          let iterations = 0
          while (this.getReg('CX') !== 0 && iterations < 0x10000) {
            this.execStringOp(instr.mnemonic)
            this.setReg('CX', (this.getReg('CX') - 1) & 0xffff)
            iterations++
            if (instr.rep === 'REPE' && !this.flags.ZF) break
            if (instr.rep === 'REPNE' && this.flags.ZF) break
          }
          repIterations = iterations
        } else {
          this.execStringOp(instr.mnemonic)
        }
        break
      }
      case 'CLD': this.flags.DF = false; break
      case 'STD': this.flags.DF = true; break
      case 'INT': this.handleInterrupt(this.readOperand(op1, true)); break
      case 'HLT': this.halted = true; break
    }

    // AH=01/0A requested keyboard input: stop without completing this instruction
    // (without advancing ip); it will be completed and ip advanced once
    // provideInput() is called.
    if (this.waitingForInput) return

    const taken = nextIp !== this.ip + 1
    this.recordCycles(instr.mnemonic, instructionCycles(instr, op1, op2, isWord, { taken, repCount: repIterations, shiftCount }))

    this.ip = nextIp
    this.steps += 1
    if (this.ip >= this.instructions.length) this.halted = true
  }

  private handleInterrupt(number: number) {
    if (number !== 0x21) return
    const ah = this.getReg('AH')
    if (ah === 0x02) {
      this.output.push(String.fromCharCode(this.getReg('DL')))
    } else if (ah === 0x09) {
      let addr = this.getReg('DX')
      let s = ''
      while (this.memory[addr] !== 0x24 && s.length < 0xffff) {
        s += String.fromCharCode(this.memory[addr])
        addr = (addr + 1) & 0xffff
      }
      this.output.push(s)
    } else if (ah === 0x01) {
      this.waitingForInput = { kind: 'char' }
    } else if (ah === 0x0a) {
      const bufferAddr = this.getReg('DX')
      this.waitingForInput = { kind: 'string', bufferAddr, maxLen: this.memory[bufferAddr] }
    } else if (ah === 0x4c) {
      this.halted = true
    }
  }

  // Completes an INT that entered a waiting state via AH=01/0A, using the
  // user-supplied text: writes it to AL or to the buffer in memory, then
  // finishes the instruction (advancing ip) so execution can continue.
  provideInput(text: string) {
    const req = this.waitingForInput
    if (!req) return

    if (req.kind === 'char') {
      const ch = text.length > 0 ? text[0] : '\r'
      this.setReg('AL', ch.charCodeAt(0) & 0xff)
      this.output.push(ch)
    } else {
      const trimmed = text.slice(0, req.maxLen)
      this.memory[(req.bufferAddr + 1) & 0xffff] = trimmed.length & 0xff
      this.trackWrite(req.bufferAddr + 1)
      for (let i = 0; i < trimmed.length; i++) {
        this.memory[(req.bufferAddr + 2 + i) & 0xffff] = trimmed.charCodeAt(i) & 0xff
        this.trackWrite(req.bufferAddr + 2 + i)
      }
      this.output.push(trimmed + '\n')
    }

    this.waitingForInput = null
    this.recordCycles('INT', 51)
    this.ip += 1
    this.steps += 1
    if (this.ip >= this.instructions.length) this.halted = true
  }

  // breakpoints: line numbers in the source file. Stops BEFORE executing an
  // instruction on that line (single-stepping skips this check). On resume,
  // the first instruction always runs so it doesn't immediately re-break on
  // the line it's already stopped at.
  run(maxSteps = 100000, breakpoints?: Set<number>) {
    this.hitBreakpoint = false
    let first = true
    while (!this.halted && !this.waitingForInput && this.steps < maxSteps) {
      if (!first && breakpoints && breakpoints.size > 0) {
        const instr = this.instructions[this.ip]
        if (instr && breakpoints.has(instr.line)) {
          this.hitBreakpoint = true
          break
        }
      }
      this.step()
      first = false
    }
  }
}
