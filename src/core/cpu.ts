import type { DataDeclaration, Flags, Instruction, Operand, PendingInput, Reg16, Reg8, RegName } from './types'

const REG16: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP']

const REG8_PARENT: Record<Reg8, { parent: Reg16; high: boolean }> = {
  AH: { parent: 'AX', high: true }, AL: { parent: 'AX', high: false },
  BH: { parent: 'BX', high: true }, BL: { parent: 'BX', high: false },
  CH: { parent: 'CX', high: true }, CL: { parent: 'CX', high: false },
  DH: { parent: 'DX', high: true }, DL: { parent: 'DX', high: false },
}

const MEMORY_SIZE = 0x10000
const INITIAL_SP = 0xfffe

export class Cpu {
  regs: Record<Reg16, number> = { AX: 0, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: INITIAL_SP }
  flags: Flags = { ZF: false, SF: false, CF: false, OF: false }
  memory = new Uint8Array(MEMORY_SIZE)
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
    this.regs = { AX: 0, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: INITIAL_SP }
    this.flags = { ZF: false, SF: false, CF: false, OF: false }
    this.memory.fill(0)
    for (const d of this.data) {
      for (let i = 0; i < d.bytes.length; i++) this.memory[(d.address + i) & 0xffff] = d.bytes[i]
    }
    this.ip = 0
    this.halted = false
    this.hitBreakpoint = false
    this.waitingForInput = null
    this.output = []
    this.steps = 0
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
    if (op.label) {
      const info = this.dataLabels.get(op.label)
      if (!info) throw new Error(`Tanımsız veri etiketi: ${op.label}`)
      addr += info.address
    }
    return addr & 0xffff
  }

  private readMem(op: Operand & { kind: 'mem' }, isWord: boolean): number {
    const addr = this.effectiveAddress(op)
    if (!isWord) return this.memory[addr]
    return this.memory[addr] | (this.memory[(addr + 1) & 0xffff] << 8)
  }

  private writeMem(op: Operand & { kind: 'mem' }, value: number, isWord: boolean) {
    const addr = this.effectiveAddress(op)
    this.memory[addr] = value & 0xff
    if (isWord) this.memory[(addr + 1) & 0xffff] = (value >> 8) & 0xff
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
        throw new Error(`Tanımsız etiket: ${op.name}`)
      }
    }
  }

  private writeOperand(op: Operand, value: number, isWord: boolean) {
    if (op.kind === 'reg') { this.setReg(op.name, isWord ? value & 0xffff : value & 0xff); return }
    if (op.kind === 'mem') { this.writeMem(op, value, isWord); return }
    throw new Error('Hedef bir yazmaç veya bellek adresi olmalı')
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
      if (idx === undefined) throw new Error(`Tanımsız etiket: ${op.name}`)
      this.ip = idx
      return
    }
    throw new Error('Atlama hedefi bir etiket olmalı')
  }

  step() {
    if (this.halted || this.waitingForInput) return
    if (this.ip < 0 || this.ip >= this.instructions.length) {
      this.halted = true
      return
    }
    const instr = this.instructions[this.ip]
    const [op1, op2] = instr.ops
    const isWord = (op1 && this.operandSize(op1)) === 'byte' || (op2 && this.operandSize(op2)) === 'byte'
      ? false
      : true
    let nextIp = this.ip + 1

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
        if (value === 0) throw new Error('Sıfıra bölme hatası (DIV)')
        if (isWord) {
          const dividend = this.regs.DX * 0x10000 + this.regs.AX
          const quotient = Math.floor(dividend / value)
          if (quotient > 0xffff) throw new Error('Bölme taşması (DIV): sonuç 16 bit yazmaca sığmıyor')
          this.regs.AX = quotient & 0xffff
          this.regs.DX = (dividend % value) & 0xffff
        } else {
          const dividend = this.getReg('AX')
          const quotient = Math.floor(dividend / value)
          if (quotient > 0xff) throw new Error('Bölme taşması (DIV): sonuç 8 bit yazmaca sığmıyor')
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
      case 'SHL': {
        const size = isWord ? 16 : 8
        const mask = isWord ? 0xffff : 0xff
        const value = this.readOperand(op1, isWord)
        const count = Math.min(this.readOperand(op2, false), 31)
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
      case 'INT': this.handleInterrupt(this.readOperand(op1, true)); break
      case 'HLT': this.halted = true; break
    }

    // AH=01/0A klavye girişi istedi: bu komutu tamamlamadan (ip'yi ilerletmeden)
    // dur; provideInput() çağrıldığında tamamlanıp ip ilerletilecek.
    if (this.waitingForInput) return

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

  // AH=01/0A ile beklemeye giren bir INT'i, kullanıcının sağladığı metinle
  // tamamlar: AL'ye ya da bellekteki tampona yazar, ardından komutu bitirip
  // (ip'yi ilerletip) yürütmenin devam edebilmesini sağlar.
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
      for (let i = 0; i < trimmed.length; i++) {
        this.memory[(req.bufferAddr + 2 + i) & 0xffff] = trimmed.charCodeAt(i) & 0xff
      }
      this.output.push(trimmed + '\n')
    }

    this.waitingForInput = null
    this.ip += 1
    this.steps += 1
    if (this.ip >= this.instructions.length) this.halted = true
  }

  // breakpoints: kaynak dosyasındaki satır numaraları. O satıra gelen bir komutu
  // ÇALIŞTIRMADAN ÖNCE durur (adım adım çalıştırma bu kontrolü es geçer). Devam
  // ederken, o an durulan satırın kendisinde tekrar durmamak için ilk komut her
  // zaman çalıştırılır.
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
