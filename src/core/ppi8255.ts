// A simulated 8255 Programmable Peripheral Interface (issue #37) at ports
// 80h-83h: Port A, Port B, Port C and the write-only control register, as
// selected by A1/A0 on a real board. Only Mode 0 is simulated -- a Mode 1/2
// control word is stored and decoded, but the ports keep behaving as Mode 0.
// The switches wired to the input ports are the device side, not chip state:
// RESET and Step Back leave them where the student put them.

export const PPI_BASE = 0x80
export const PPI_PORT_A = PPI_BASE
export const PPI_PORT_B = PPI_BASE + 1
export const PPI_PORT_C = PPI_BASE + 2
export const PPI_CONTROL = PPI_BASE + 3

/** The control word after RESET: I/O mode, every port an input. */
export const PPI_RESET_WORD = 0x9b

export interface PpiConfig {
  aIn: boolean
  bIn: boolean
  cUpperIn: boolean
  cLowerIn: boolean
  /** 0, 1 or 2 (D6 D5 = 1x means mode 2). */
  aMode: 0 | 1 | 2
  bMode: 0 | 1
}

/** Decodes an I/O-mode control word (D7 = 1). */
export function decodeControlWord(word: number): PpiConfig {
  return {
    aMode: word & 0x40 ? 2 : word & 0x20 ? 1 : 0,
    aIn: (word & 0x10) !== 0,
    cUpperIn: (word & 0x08) !== 0,
    bMode: word & 0x04 ? 1 : 0,
    bIn: (word & 0x02) !== 0,
    cLowerIn: (word & 0x01) !== 0,
  }
}

const dir = (input: boolean) => (input ? 'in' : 'out')

/** "A: out, mode 0 · B: in, mode 0 · C upper: out · C lower: in" */
export function describeControlWord(word: number): string {
  const c = decodeControlWord(word)
  return `A: ${dir(c.aIn)}, mode ${c.aMode} · B: ${dir(c.bIn)}, mode ${c.bMode} · ` +
    `C upper: ${dir(c.cUpperIn)} · C lower: ${dir(c.cLowerIn)}`
}

/** What a BSR control word (D7 = 0) does: which Port C bit, set or reset. */
export function decodeBsrWord(word: number): { bit: number; set: boolean } {
  return { bit: (word >> 1) & 0x07, set: (word & 0x01) !== 0 }
}

/** Everything a program can change, for Cpu snapshots (Step Back). */
export interface PpiState {
  control: number
  latchA: number
  latchB: number
  latchC: number
  portCWrites: number
  modeWords: number
}

export class Ppi8255 {
  control = PPI_RESET_WORD
  latchA = 0
  latchB = 0
  latchC = 0
  /** Switches on Port A / Port C, read when that port (or half) is an input. */
  switchesA = 0
  switchesC = 0
  // What the program did, so a task can insist on BSR words only.
  portCWrites = 0
  modeWords = 0

  static handles(port: number) {
    return port >= PPI_BASE && port <= PPI_CONTROL
  }

  get config(): PpiConfig {
    return decodeControlWord(this.control)
  }

  /** The Port C bits that are inputs, from the two halves' directions. */
  private get cInputMask() {
    const c = this.config
    return (c.cUpperIn ? 0xf0 : 0) | (c.cLowerIn ? 0x0f : 0)
  }

  reset() {
    this.control = PPI_RESET_WORD
    this.latchA = 0
    this.latchB = 0
    this.latchC = 0
    this.portCWrites = 0
    this.modeWords = 0
  }

  write(port: number, value: number) {
    const v = value & 0xff
    const c = this.config
    switch (port) {
      case PPI_PORT_A: if (!c.aIn) this.latchA = v; break
      case PPI_PORT_B: if (!c.bIn) this.latchB = v; break
      case PPI_PORT_C: {
        this.portCWrites++
        const inputs = this.cInputMask
        this.latchC = (this.latchC & inputs) | (v & ~inputs & 0xff)
        break
      }
      case PPI_CONTROL:
        if (v & 0x80) {
          // Setting a mode clears every output latch, as on the real chip.
          this.modeWords++
          this.control = v
          this.latchA = 0
          this.latchB = 0
          this.latchC = 0
        } else {
          const { bit, set } = decodeBsrWord(v)
          this.latchC = set ? this.latchC | (1 << bit) : this.latchC & ~(1 << bit)
        }
        break
    }
  }

  read(port: number): number {
    const c = this.config
    switch (port) {
      case PPI_PORT_A: return c.aIn ? this.switchesA : this.latchA
      case PPI_PORT_B: return c.bIn ? 0 : this.latchB
      case PPI_PORT_C: {
        const inputs = this.cInputMask
        return (this.switchesC & inputs) | (this.latchC & ~inputs & 0xff)
      }
      default: return 0xff // the control register is write-only
    }
  }

  state(): PpiState {
    const { control, latchA, latchB, latchC, portCWrites, modeWords } = this
    return { control, latchA, latchB, latchC, portCWrites, modeWords }
  }

  restore(s: PpiState) {
    Object.assign(this, s)
  }
}
