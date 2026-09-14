import type { AssembleError, Instruction, Mnemonic, Operand, RegName } from './types'

const REGISTERS: RegName[] = [
  'AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP',
  'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
]

const MNEMONICS: Mnemonic[] = [
  'MOV', 'ADD', 'SUB', 'INC', 'DEC', 'CMP',
  'JMP', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE',
  'LOOP', 'PUSH', 'POP', 'INT', 'NOP', 'HLT',
]

function isRegister(token: string): token is RegName {
  return (REGISTERS as string[]).includes(token.toUpperCase())
}

function parseImmediate(token: string): number | null {
  const t = token.trim()
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16)
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16)
  if (/^-?[0-9]+$/.test(t)) return parseInt(t, 10)
  return null
}

function parseOperand(token: string): Operand {
  const t = token.trim()
  if (isRegister(t)) return { kind: 'reg', name: t.toUpperCase() as RegName }
  const imm = parseImmediate(t)
  if (imm !== null) return { kind: 'imm', value: imm }
  return { kind: 'label', name: t }
}

export function assemble(source: string): { instructions: Instruction[]; errors: AssembleError[] } {
  const instructions: Instruction[] = []
  const errors: AssembleError[] = []
  const lines = source.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    let raw = lines[i]

    const commentIdx = raw.indexOf(';')
    if (commentIdx >= 0) raw = raw.slice(0, commentIdx)
    raw = raw.trim()
    if (raw.length === 0) continue

    let label: string | undefined
    const labelMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (labelMatch) {
      label = labelMatch[1]
      raw = labelMatch[2].trim()
      if (raw.length === 0) {
        instructions.push({ mnemonic: 'NOP', ops: [], label, line: lineNo, raw: lines[i].trim() })
        continue
      }
    }

    const parts = raw.split(/\s+/)
    const mnemonicToken = parts[0].toUpperCase()
    if (!MNEMONICS.includes(mnemonicToken as Mnemonic)) {
      errors.push({ line: lineNo, message: `Bilinmeyen komut: ${parts[0]}` })
      continue
    }
    const mnemonic = mnemonicToken as Mnemonic
    const opsText = raw.slice(parts[0].length).trim()
    const ops = opsText.length > 0 ? opsText.split(',').map((o) => parseOperand(o)) : []

    instructions.push({ mnemonic, ops, label, line: lineNo, raw: lines[i].trim() })
  }

  return { instructions, errors }
}
