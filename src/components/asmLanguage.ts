import { StreamLanguage } from '@codemirror/language'
import type { StringStream } from '@codemirror/language'

const MNEMONICS = new Set([
  'MOV', 'ADD', 'SUB', 'INC', 'DEC', 'CMP',
  'MUL', 'DIV', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR',
  'XCHG', 'NEG', 'TEST',
  'JMP', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE', 'JA', 'JAE', 'JB', 'JBE', 'JCXZ',
  'LOOP', 'PUSH', 'POP', 'CALL', 'RET', 'IN', 'OUT', 'INT', 'NOP', 'HLT',
  'MOVSB', 'STOSB', 'LODSB', 'CMPSB', 'SCASB', 'CLD', 'STD',
  'REP', 'REPE', 'REPZ', 'REPNE', 'REPNZ',
])

const REGISTERS = new Set([
  'AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'DS', 'ES', 'SS', 'CS',
  'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
])

const DIRECTIVES = new Set([
  'DB', 'DW', 'BYTE', 'WORD', 'PTR',
  'MODEL', 'STACK', 'DATA', 'CODE', 'CONST', 'DOSSEG', 'STARTUP',
  'ASSUME', 'END', 'PROC', 'ENDP',
])

// The raw tokenizer, exported separately from the StreamLanguage wrapper so
// it can be unit-tested directly against a real StringStream without going
// through the full Lezer/CodeMirror rendering pipeline.
export function asmToken(stream: StringStream): string | null {
  if (stream.eatSpace()) return null
  if (stream.match(';')) {
    stream.skipToEnd()
    return 'comment'
  }
  if (stream.match(/^'(?:[^'\\]|\\.)*'/) || stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'
  // A bare identifier immediately followed by ':' is a label definition.
  if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?=:)/)) return 'def'
  if (stream.match(/^0x[0-9a-fA-F]+/i)) return 'number'
  if (stream.match(/^[0-9][0-9a-fA-F]*h\b/i)) return 'number'
  if (stream.match(/^-?[0-9]+\b/)) return 'number'

  const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)
  if (word) {
    const upper = (word as RegExpMatchArray)[0].toUpperCase()
    if (MNEMONICS.has(upper)) return 'keyword'
    if (REGISTERS.has(upper)) return 'atom'
    if (DIRECTIVES.has(upper)) return 'meta'
    return 'variable'
  }

  stream.next()
  return null
}

export const asmLanguage = StreamLanguage.define({ token: asmToken })
