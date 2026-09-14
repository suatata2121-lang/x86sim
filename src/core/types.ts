export type Reg16 = 'AX' | 'BX' | 'CX' | 'DX' | 'SI' | 'DI' | 'BP' | 'SP'
export type Reg8 = 'AL' | 'AH' | 'BL' | 'BH' | 'CL' | 'CH' | 'DL' | 'DH'
export type RegName = Reg16 | Reg8

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

export type Mnemonic =
  | 'MOV' | 'ADD' | 'SUB' | 'INC' | 'DEC' | 'CMP'
  | 'JMP' | 'JE' | 'JNE' | 'JG' | 'JL' | 'JGE' | 'JLE'
  | 'LOOP' | 'PUSH' | 'POP' | 'INT' | 'NOP' | 'HLT'

export interface Instruction {
  mnemonic: Mnemonic
  ops: Operand[]
  label?: string
  line: number
  raw: string
}

export interface AssembleError {
  line: number
  message: string
}
