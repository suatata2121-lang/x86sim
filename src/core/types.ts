// DS/ES/SS/CS are accepted for source compatibility with real 8086/MASM
// code (so e.g. "MOV DS, AX" from a textbook program assembles and runs)
// but are otherwise inert: this simulator has no segmentation, so their
// value never affects how an address is computed.
export type Reg16 = 'AX' | 'BX' | 'CX' | 'DX' | 'SI' | 'DI' | 'BP' | 'SP' | 'DS' | 'ES' | 'SS' | 'CS'
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
  /** Direction flag: false = SI/DI count up during string ops, true = count down. */
  DF: boolean
  /** Parity flag: true if the low byte of the result has an even number of set bits. */
  PF: boolean
  /** Auxiliary carry: a carry/borrow into or out of bit 3 (the low nibble) -- only meaningful as
   *  input to AAA/AAS/AAM/AAD/DAA/DAS, which use it to detect a BCD-digit carry that the result's
   *  low nibble alone can miss (e.g. 9+8=17=0x11, whose low nibble is 1, not >9). */
  AF: boolean
  /** Interrupt-enable flag, set/cleared by STI/CLI. Tracked but inert -- this simulator has no
   *  hardware-interrupt mechanism for it to gate, the same treatment segment registers get. */
  IF: boolean
}

export type Operand =
  | { kind: 'reg'; name: RegName }
  | { kind: 'imm'; value: number }
  | { kind: 'label'; name: string }
  | { kind: 'mem'; base?: BaseReg; index?: IndexReg; label?: string; disp: number; size?: 'byte' | 'word' }

export type Mnemonic =
  | 'MOV' | 'ADD' | 'SUB' | 'INC' | 'DEC' | 'CMP'
  | 'MUL' | 'DIV' | 'AND' | 'OR' | 'XOR' | 'NOT' | 'SHL' | 'SHR'
  | 'XCHG' | 'NEG' | 'TEST' | 'LEA'
  | 'JMP' | 'JE' | 'JNE' | 'JG' | 'JL' | 'JGE' | 'JLE' | 'JA' | 'JAE' | 'JB' | 'JBE' | 'JCXZ'
  | 'JS' | 'JNS' | 'JO' | 'JNO' | 'JP' | 'JNP'
  | 'LOOP' | 'LOOPE' | 'LOOPNE' | 'PUSH' | 'POP' | 'CALL' | 'RET' | 'IN' | 'OUT' | 'INT' | 'NOP' | 'HLT'
  | 'MOVSB' | 'STOSB' | 'LODSB' | 'CMPSB' | 'SCASB' | 'CLD' | 'STD'
  | 'MOVSW' | 'STOSW' | 'LODSW' | 'CMPSW' | 'SCASW'
  | 'ADC' | 'SBB' | 'ROL' | 'ROR' | 'RCL' | 'RCR' | 'IMUL' | 'IDIV'
  | 'CBW' | 'CWD' | 'STC' | 'CLC' | 'CMC' | 'STI' | 'CLI'
  | 'PUSHF' | 'POPF' | 'LAHF' | 'SAHF' | 'XLATB'
  | 'AAA' | 'AAS' | 'AAM' | 'AAD' | 'DAA' | 'DAS'

// A REP/REPE/REPNE prefix on a string instruction (MOVSB/STOSB/LODSB/CMPSB/SCASB).
export type RepPrefix = 'REP' | 'REPE' | 'REPNE'

export interface Instruction {
  mnemonic: Mnemonic
  ops: Operand[]
  label?: string
  rep?: RepPrefix
  line: number
  raw: string
}

// A data label defined with DB/DW: its initial bytes placed in memory, and its address.
export interface DataDeclaration {
  name: string
  address: number
  bytes: number[]
  /** Element size of the declaring directive (DB = byte, DW = word) -- used to flag e.g. "MOV AX, byteVar" as an operand-size mismatch. */
  width: 'byte' | 'word'
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
