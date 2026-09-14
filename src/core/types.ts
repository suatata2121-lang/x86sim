export type Reg16 = 'AX' | 'BX' | 'CX' | 'DX' | 'SI' | 'DI' | 'BP' | 'SP'
export type Reg8 = 'AL' | 'AH' | 'BL' | 'BH' | 'CL' | 'CH' | 'DL' | 'DH'
export type RegName = Reg16 | Reg8

// Bellek dolaylı adresleme için taban yazmacı olarak kullanılabilenler.
export type BaseReg = 'BX' | 'BP' | 'SI' | 'DI'

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
  | { kind: 'mem'; base?: BaseReg; label?: string; disp: number; size?: 'byte' | 'word' }

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

// DB/DW ile tanımlanan bir veri etiketi: belleğe yerleştirilen ilk baytlar ve adresi.
export interface DataDeclaration {
  name: string
  address: number
  bytes: number[]
  line: number
}

export interface AssembleError {
  line: number
  message: string
  /** 1-indexli sütun; hatanın kaynak satırındaki tam konumu bilinmiyorsa yoktur. */
  column?: number
  /** Sütundan itibaren kaç karakterin vurgulanacağı (hatalı metnin uzunluğu). */
  length?: number
}

// INT 21h AH=01/0A klavye girişi bekliyorken CPU'nun durumu.
export type PendingInput =
  | { kind: 'char' }
  | { kind: 'string'; bufferAddr: number; maxLen: number }
