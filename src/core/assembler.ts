import type { AssembleError, BaseReg, DataDeclaration, IndexReg, Instruction, Mnemonic, Operand, RegName } from './types'

const REGISTERS: RegName[] = [
  'AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP',
  'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
]

const BASE_REGS: BaseReg[] = ['BX', 'BP']
const INDEX_REGS: IndexReg[] = ['SI', 'DI']

const MNEMONICS: Mnemonic[] = [
  'MOV', 'ADD', 'SUB', 'INC', 'DEC', 'CMP',
  'MUL', 'DIV', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR',
  'JMP', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE',
  'LOOP', 'PUSH', 'POP', 'CALL', 'RET', 'INT', 'NOP', 'HLT',
]

const JUMP_MNEMONICS = new Set<Mnemonic>(['JMP', 'JE', 'JNE', 'JG', 'JL', 'JGE', 'JLE', 'LOOP', 'CALL'])

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function isRegister(token: string): token is RegName {
  return (REGISTERS as string[]).includes(token.toUpperCase())
}

function parseImmediate(token: string): number | null {
  const t = token.trim()
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16)
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16)
  if (/^-?[0-9]+$/.test(t)) return parseInt(t, 10)
  if (/^'.'$/.test(t)) return t.charCodeAt(1)
  return null
}

// Edit (Levenshtein) distance between two strings; used for typo suggestions.
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function suggestMnemonic(token: string): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const m of MNEMONICS) {
    const d = levenshtein(token.toUpperCase(), m)
    if (d < bestDist) {
      bestDist = d
      best = m
    }
  }
  return best !== null && bestDist > 0 && bestDist <= 2 ? best : null
}

type MemParts = { base?: BaseReg; index?: IndexReg; label?: string; disp: number }

function parseMemOperand(inner: string): MemParts | null {
  const body = inner.replace(/\s+/g, '')
  if (body.length === 0) return null

  const tokens = body.replace(/-/g, '+-').split('+').filter((t) => t.length > 0)
  if (tokens.length === 0) return null

  let base: BaseReg | undefined
  let index: IndexReg | undefined
  let label: string | undefined
  let disp = 0

  for (const rawTok of tokens) {
    const negative = rawTok.startsWith('-')
    const tok = negative ? rawTok.slice(1) : rawTok
    if (tok.length === 0) return null
    const upper = tok.toUpperCase()

    if ((BASE_REGS as string[]).includes(upper)) {
      if (negative || base) return null
      base = upper as BaseReg
      continue
    }
    if ((INDEX_REGS as string[]).includes(upper)) {
      if (negative || index) return null
      index = upper as IndexReg
      continue
    }
    const imm = parseImmediate(tok)
    if (imm !== null) {
      disp += negative ? -imm : imm
      continue
    }
    if (IDENTIFIER_RE.test(tok)) {
      if (negative || label) return null
      label = tok
      continue
    }
    return null
  }

  return { base, index, label, disp }
}

function parseOperand(token: string): Operand {
  let t = token.trim()

  let size: 'byte' | 'word' | undefined
  const sizeMatch = t.match(/^(BYTE|WORD)\s+PTR\s+(.*)$/i)
  if (sizeMatch) {
    size = sizeMatch[1].toUpperCase() === 'BYTE' ? 'byte' : 'word'
    t = sizeMatch[2].trim()
  }

  if (t.startsWith('[') && t.endsWith(']')) {
    const mem = parseMemOperand(t.slice(1, -1))
    if (mem) return { kind: 'mem', base: mem.base, index: mem.index, label: mem.label, disp: mem.disp, size }
    return { kind: 'label', name: token.trim() }
  }
  if (size) return { kind: 'label', name: token.trim() }

  if (isRegister(t)) return { kind: 'reg', name: t.toUpperCase() as RegName }
  const imm = parseImmediate(t)
  if (imm !== null) return { kind: 'imm', value: imm }
  return { kind: 'label', name: t }
}

interface TextAt {
  text: string
  /** 0-indexed position of `text` within the source line. */
  offset: number
}

// Splits comma-separated operands, tracking each one's position in the line.
function splitWithOffsets(text: string, baseOffset: number): TextAt[] {
  const result: TextAt[] = []
  let cursor = 0
  for (const part of text.split(',')) {
    const leadWs = part.length - part.trimStart().length
    result.push({ text: part.trim(), offset: baseOffset + cursor + leadWs })
    cursor += part.length + 1
  }
  return result
}

// Splits DB/DW items, ignoring commas inside quotes and preserving their positions.
function splitTopLevelWithOffsets(text: string, baseOffset: number): TextAt[] {
  const rawParts: TextAt[] = []
  let cur = ''
  let start = 0
  let quote: string | null = null
  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx]
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      cur += ch
      continue
    }
    if (ch === ',') {
      rawParts.push({ text: cur, offset: start })
      cur = ''
      start = idx + 1
      continue
    }
    cur += ch
  }
  rawParts.push({ text: cur, offset: start })

  const result: TextAt[] = []
  for (const part of rawParts) {
    const leadWs = part.text.length - part.text.trimStart().length
    const trimmed = part.text.trim()
    if (trimmed.length > 0) result.push({ text: trimmed, offset: baseOffset + part.offset + leadWs })
  }
  return result
}

function parseDbItems(text: string, lineNo: number, baseOffset: number, errors: AssembleError[]): number[] | null {
  const items = splitTopLevelWithOffsets(text, baseOffset)
  if (items.length === 0) {
    errors.push({ line: lineNo, message: 'DB expects at least one value', column: baseOffset + 1 })
    return null
  }
  const bytes: number[] = []
  for (const { text: item, offset } of items) {
    const strMatch = item.match(/^'([^']*)'$|^"([^"]*)"$/)
    if (strMatch) {
      const s = strMatch[1] ?? strMatch[2]
      for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff)
      continue
    }
    if (item === '?') {
      bytes.push(0)
      continue
    }
    const imm = parseImmediate(item)
    if (imm === null || imm < -128 || imm > 255) {
      errors.push({ line: lineNo, message: `Invalid DB value: "${item}"`, column: offset + 1, length: item.length })
      return null
    }
    bytes.push(imm & 0xff)
  }
  return bytes
}

function parseDwItems(text: string, lineNo: number, baseOffset: number, errors: AssembleError[]): number[] | null {
  const items = splitTopLevelWithOffsets(text, baseOffset)
  if (items.length === 0) {
    errors.push({ line: lineNo, message: 'DW expects at least one value', column: baseOffset + 1 })
    return null
  }
  const bytes: number[] = []
  for (const { text: item, offset } of items) {
    if (item === '?') {
      bytes.push(0, 0)
      continue
    }
    const imm = parseImmediate(item)
    if (imm === null || imm < -32768 || imm > 65535) {
      errors.push({ line: lineNo, message: `Invalid DW value: "${item}"`, column: offset + 1, length: item.length })
      return null
    }
    const v = imm & 0xffff
    bytes.push(v & 0xff, (v >> 8) & 0xff)
  }
  return bytes
}

const OPERAND_SPECS: Partial<Record<Mnemonic, Array<Operand['kind'][]>>> = {
  MOV: [['reg', 'mem'], ['reg', 'imm', 'mem', 'label']],
  ADD: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  SUB: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  CMP: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  INC: [['reg', 'mem']],
  DEC: [['reg', 'mem']],
  MUL: [['reg', 'mem']],
  DIV: [['reg', 'mem']],
  AND: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  OR: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  XOR: [['reg', 'mem'], ['reg', 'imm', 'mem']],
  NOT: [['reg', 'mem']],
  SHL: [['reg', 'mem'], ['reg', 'imm']],
  SHR: [['reg', 'mem'], ['reg', 'imm']],
  PUSH: [['reg', 'mem']],
  POP: [['reg', 'mem']],
  CALL: [['label']],
  RET: [],
  JMP: [['label']],
  JE: [['label']],
  JNE: [['label']],
  JG: [['label']],
  JL: [['label']],
  JGE: [['label']],
  JLE: [['label']],
  LOOP: [['label']],
  INT: [['imm']],
  NOP: [],
  HLT: [],
}

const OPERAND_KIND_LABEL: Record<Operand['kind'], string> = {
  reg: 'register',
  imm: 'number',
  label: 'label',
  mem: 'memory address',
}

function describeOperand(op: Operand): string {
  if (op.kind === 'reg') return op.name
  if (op.kind === 'label') return op.name
  if (op.kind === 'imm') return String(op.value)
  const parts: string[] = []
  if (op.label) parts.push(op.label)
  if (op.base) parts.push(op.base)
  if (op.index) parts.push(op.index)
  let inner = parts.join('+')
  if (op.disp) inner += (op.disp > 0 ? '+' : '') + op.disp
  return `[${inner}]`
}

function validateOperands(
  mnemonic: Mnemonic,
  opsText: string,
  ops: Operand[],
  opEntries: TextAt[],
  lineNo: number,
  mnemonicCol: number,
  mnemonicLen: number,
  errors: AssembleError[],
): boolean {
  const spec = OPERAND_SPECS[mnemonic] ?? []
  if (ops.length !== spec.length) {
    errors.push({
      line: lineNo,
      message: `${mnemonic} expects ${spec.length} operand(s), found ${ops.length}: "${opsText}"`,
      column: mnemonicCol,
      length: mnemonicLen,
    })
    return false
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const entry = opEntries[i]
    if (!spec[i].includes(op.kind)) {
      const expected = spec[i].map((k) => OPERAND_KIND_LABEL[k]).join(' or ')
      errors.push({
        line: lineNo,
        message: `Operand ${i + 1} of ${mnemonic} is invalid: "${describeOperand(op)}" (expected ${expected})`,
        column: entry.offset + 1,
        length: entry.text.length,
      })
      return false
    }
    if (op.kind === 'label' && !IDENTIFIER_RE.test(op.name)) {
      errors.push({
        line: lineNo,
        message: `Invalid operand syntax: "${op.name}"`,
        column: entry.offset + 1,
        length: entry.text.length,
      })
      return false
    }
  }
  if (ops.length === 2 && ops[0].kind === 'mem' && ops[1].kind === 'mem') {
    errors.push({
      line: lineNo,
      message: `${mnemonic}: cannot use two memory operands at the same time`,
      column: mnemonicCol,
      length: mnemonicLen,
    })
    return false
  }
  return true
}

export function assemble(source: string): { instructions: Instruction[]; data: DataDeclaration[]; errors: AssembleError[] } {
  const instructions: Instruction[] = []
  const data: DataDeclaration[] = []
  const errors: AssembleError[] = []
  const declaredLabels = new Set<string>()
  let dataCursor = 0
  const lines = source.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const originalLine = lines[i]

    let work = originalLine
    const commentIdx = work.indexOf(';')
    if (commentIdx >= 0) work = work.slice(0, commentIdx)

    let offset = work.length - work.trimStart().length
    work = work.trim()
    if (work.length === 0) continue

    const dataMatch = work.match(/^([A-Za-z_][A-Za-z0-9_]*):?\s+(DB|DW)\s+(.*)$/i)
    if (dataMatch) {
      const [, name, directive, itemsText] = dataMatch
      const nameCol = offset + 1
      if (declaredLabels.has(name)) {
        errors.push({ line: lineNo, message: `Label already defined: ${name}`, column: nameCol, length: name.length })
        continue
      }
      const itemsOffset = offset + (dataMatch[0].length - itemsText.length)
      const bytes = directive.toUpperCase() === 'DB'
        ? parseDbItems(itemsText, lineNo, itemsOffset, errors)
        : parseDwItems(itemsText, lineNo, itemsOffset, errors)
      if (bytes === null) continue
      declaredLabels.add(name)
      data.push({ name, address: dataCursor, bytes, line: lineNo })
      dataCursor += bytes.length
      continue
    }

    let label: string | undefined
    const labelMatch = work.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (labelMatch) {
      const name = labelMatch[1]
      const nameCol = offset + 1
      offset += labelMatch[0].length - labelMatch[2].length
      work = labelMatch[2].replace(/\s+$/, '')
      if (declaredLabels.has(name)) {
        errors.push({ line: lineNo, message: `Label already defined: ${name}`, column: nameCol, length: name.length })
      } else {
        declaredLabels.add(name)
        label = name
      }
      if (work.length === 0) {
        instructions.push({ mnemonic: 'NOP', ops: [], label, line: lineNo, raw: originalLine.trim() })
        continue
      }
    }

    const parts = work.split(/\s+/)
    const mnemonicToken = parts[0].toUpperCase()
    if (!MNEMONICS.includes(mnemonicToken as Mnemonic)) {
      const suggestion = suggestMnemonic(mnemonicToken)
      const message = suggestion
        ? `Unknown instruction: "${parts[0]}". Did you mean "${suggestion}"?`
        : `Unknown instruction: "${parts[0]}"`
      errors.push({ line: lineNo, message, column: offset + 1, length: parts[0].length })
      continue
    }
    const mnemonic = mnemonicToken as Mnemonic
    const afterMnemonic = work.slice(parts[0].length)
    const opsLeadWs = afterMnemonic.length - afterMnemonic.trimStart().length
    const opsText = afterMnemonic.trim()
    const opsOffset = offset + parts[0].length + opsLeadWs
    const opEntries = opsText.length > 0 ? splitWithOffsets(opsText, opsOffset) : []
    const ops = opEntries.map((e) => parseOperand(e.text))

    if (!validateOperands(mnemonic, opsText, ops, opEntries, lineNo, offset + 1, mnemonic.length, errors)) continue

    instructions.push({ mnemonic, ops, label, line: lineNo, raw: originalLine.trim() })
  }

  const codeLabelNames = new Set(instructions.filter((instr) => instr.label).map((instr) => instr.label!))
  const dataLabelNames = new Set(data.map((d) => d.name))

  function findColumn(lineNo: number, name: string): number | undefined {
    const idx = lines[lineNo - 1]?.indexOf(name)
    return idx !== undefined && idx >= 0 ? idx + 1 : undefined
  }

  for (const instr of instructions) {
    for (const op of instr.ops) {
      if (op.kind === 'label') {
        if (JUMP_MNEMONICS.has(instr.mnemonic)) {
          if (!codeLabelNames.has(op.name)) {
            errors.push({ line: instr.line, message: `Undefined label: ${op.name}`, column: findColumn(instr.line, op.name), length: op.name.length })
          }
        } else if (!dataLabelNames.has(op.name)) {
          errors.push({ line: instr.line, message: `Undefined data label: ${op.name}`, column: findColumn(instr.line, op.name), length: op.name.length })
        }
      }
      if (op.kind === 'mem' && op.label && !dataLabelNames.has(op.label)) {
        errors.push({ line: instr.line, message: `Undefined data label: ${op.label}`, column: findColumn(instr.line, op.label), length: op.label.length })
      }
    }
  }

  return { instructions, data, errors }
}
