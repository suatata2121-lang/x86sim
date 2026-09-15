export type Reg16 = 'AX' | 'BX' | 'CX' | 'DX' | 'SI' | 'DI' | 'BP' | 'SP'
export type Reg8 = 'AL' | 'AH' | 'BL' | 'BH' | 'CL' | 'CH' | 'DL' | 'DH'
export type RegName = Reg16 | Reg8

// Indirect memory addressing: base (BX/BP) and index (SI/DI) are separate
// groups — one from each group can be combined at once (e.g. [BX+SI]), but
// two registers from the same group can't be used together.
export type BaseReg = 'BX' | 'BP'
export type IndexReg = 'SI' | 'DI'

export interface Flags {
  ZF: boolean
  SF: boolean
  CF: boolean
  OF: boolean
}

export type Operand =
  | { kind: 'reg'; name: RegName }
  | { kind: 'imm'; value: number }
  | { kind: 'label'; name: string }
  | { kind: 'mem'; base?: BaseReg; index?: IndexReg; label?: string; disp: number; size?: 'byte' | 'word' }

export type Mnemonic =
  | 'MOV' | 'ADD' | 'SUB' | 'INC' | 'DEC' | 'CMP'
  | 'MUL' | 'DIV' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'SHL' | 'SHR'
  | 'JMP' | 'JE' | 'JNE' | 'JG' | 'JL' | 'JGE' | 'JLE'
  | 'LOOP' | 'PUSH' | 'POP' | 'CALL' | 'RET' | 'INT' | 'NOP' | 'HLT'

export interface Instruction {
  mnemonic: Mnemonic
  ops: Operand[]
  label?: string
  line: number
  raw: string
}

// A data label defined with DB/DW: its initial bytes placed in memory, and its address.
export interface DataDeclaration {
  name: string
  address: number
  bytes: number[]
  line: number
}

export interface AssembleError {
  line: number
  message: string
  /** 1-indexed column; absent if the error's exact position in the source line is unknown. */
  column?: number
  /** How many characters from the column to highlight (length of the offending text). */
  length?: number
}

// The CPU's state while waiting for keyboard input via INT 21h AH=01/0A.
export type PendingInput =
  | { kind: 'char' }
  | { kind: 'string'; bufferAddr: number; maxLen: number }
