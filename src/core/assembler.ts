import type { AssembleError, BaseReg, DataDeclaration, Instruction, Mnemonic, Operand, RegName } from './types'

const REGISTERS: RegName[] = [
  'AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP',
  'AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH',
]

const BASE_REGS: BaseReg[] = ['BX', 'BP', 'SI', 'DI']

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

type MemParts = { base?: BaseReg; label?: string; disp: number }

function parseMemOperand(inner: string): MemParts | null {
  const body = inner.replace(/\s+/g, '')
  if (body.length === 0) return null

  const tokens = body.replace(/-/g, '+-').split('+').filter((t) => t.length > 0)
  if (tokens.length === 0) return null

  let base: BaseReg | undefined
  let label: string | undefined
  let disp = 0

  for (const rawTok of tokens) {
    const negative = rawTok.startsWith('-')
    const tok = negative ? rawTok.slice(1) : rawTok
    if (tok.length === 0) return null

    if ((BASE_REGS as string[]).includes(tok.toUpperCase())) {
      if (negative || base) return null
      base = tok.toUpperCase() as BaseReg
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

  return { base, label, disp }
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
    if (mem) return { kind: 'mem', base: mem.base, label: mem.label, disp: mem.disp, size }
    return { kind: 'label', name: token.trim() }
  }
  if (size) return { kind: 'label', name: token.trim() }

  if (isRegister(t)) return { kind: 'reg', name: t.toUpperCase() as RegName }
  const imm = parseImmediate(t)
  if (imm !== null) return { kind: 'imm', value: imm }
  return { kind: 'label', name: t }
}

// Virgülle ayrılmış öğeleri, tırnak içindeki virgülleri yok sayarak böler.
function splitTopLevel(text: string): string[] {
  const items: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of text) {
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
      items.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim().length > 0) items.push(cur.trim())
  return items
}

function parseDbItems(text: string, lineNo: number, errors: AssembleError[]): number[] | null {
  const items = splitTopLevel(text)
  if (items.length === 0) {
    errors.push({ line: lineNo, message: 'DB en az bir değer bekliyor' })
    return null
  }
  const bytes: number[] = []
  for (const item of items) {
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
      errors.push({ line: lineNo, message: `Geçersiz DB değeri: "${item}"` })
      return null
    }
    bytes.push(imm & 0xff)
  }
  return bytes
}

function parseDwItems(text: string, lineNo: number, errors: AssembleError[]): number[] | null {
  const items = splitTopLevel(text)
  if (items.length === 0) {
    errors.push({ line: lineNo, message: 'DW en az bir değer bekliyor' })
    return null
  }
  const bytes: number[] = []
  for (const item of items) {
    if (item === '?') {
      bytes.push(0, 0)
      continue
    }
    const imm = parseImmediate(item)
    if (imm === null || imm < -32768 || imm > 65535) {
      errors.push({ line: lineNo, message: `Geçersiz DW değeri: "${item}"` })
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
  reg: 'yazmaç',
  imm: 'sayı',
  label: 'etiket',
  mem: 'bellek adresi',
}

function describeOperand(op: Operand): string {
  if (op.kind === 'reg') return op.name
  if (op.kind === 'label') return op.name
  if (op.kind === 'imm') return String(op.value)
  return `[${op.base ?? ''}${op.label ?? ''}${op.disp ? (op.disp > 0 ? '+' : '') + op.disp : ''}]`
}

function validateOperands(mnemonic: Mnemonic, opsText: string, ops: Operand[], lineNo: number, errors: AssembleError[]): boolean {
  const spec = OPERAND_SPECS[mnemonic] ?? []
  if (ops.length !== spec.length) {
    errors.push({
      line: lineNo,
      message: `${mnemonic} komutu ${spec.length} işlenen bekliyor, ${ops.length} bulundu: "${opsText}"`,
    })
    return false
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!spec[i].includes(op.kind)) {
      const expected = spec[i].map((k) => OPERAND_KIND_LABEL[k]).join(' veya ')
      errors.push({
        line: lineNo,
        message: `${mnemonic} komutunun ${i + 1}. işleneni geçersiz: "${describeOperand(op)}" (${expected} bekleniyor)`,
      })
      return false
    }
    if (op.kind === 'label' && !IDENTIFIER_RE.test(op.name)) {
      errors.push({ line: lineNo, message: `Geçersiz işlenen sözdizimi: "${op.name}"` })
      return false
    }
  }
  if (ops.length === 2 && ops[0].kind === 'mem' && ops[1].kind === 'mem') {
    errors.push({ line: lineNo, message: `${mnemonic}: iki bellek işleneni aynı anda kullanılamaz` })
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
    let raw = lines[i]

    const commentIdx = raw.indexOf(';')
    if (commentIdx >= 0) raw = raw.slice(0, commentIdx)
    raw = raw.trim()
    if (raw.length === 0) continue

    const dataMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):?\s+(DB|DW)\s+(.*)$/i)
    if (dataMatch) {
      const [, name, directive, itemsText] = dataMatch
      if (declaredLabels.has(name)) {
        errors.push({ line: lineNo, message: `Etiket zaten tanımlı: ${name}` })
        continue
      }
      const bytes = directive.toUpperCase() === 'DB'
        ? parseDbItems(itemsText, lineNo, errors)
        : parseDwItems(itemsText, lineNo, errors)
      if (bytes === null) continue
      declaredLabels.add(name)
      data.push({ name, address: dataCursor, bytes, line: lineNo })
      dataCursor += bytes.length
      continue
    }

    let label: string | undefined
    const labelMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (labelMatch) {
      const name = labelMatch[1]
      raw = labelMatch[2].trim()
      if (declaredLabels.has(name)) {
        errors.push({ line: lineNo, message: `Etiket zaten tanımlı: ${name}` })
      } else {
        declaredLabels.add(name)
        label = name
      }
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

    if (!validateOperands(mnemonic, opsText, ops, lineNo, errors)) continue

    instructions.push({ mnemonic, ops, label, line: lineNo, raw: lines[i].trim() })
  }

  const codeLabelNames = new Set(instructions.filter((instr) => instr.label).map((instr) => instr.label!))
  const dataLabelNames = new Set(data.map((d) => d.name))

  for (const instr of instructions) {
    for (const op of instr.ops) {
      if (op.kind === 'label') {
        if (JUMP_MNEMONICS.has(instr.mnemonic)) {
          if (!codeLabelNames.has(op.name)) errors.push({ line: instr.line, message: `Tanımsız etiket: ${op.name}` })
        } else if (!dataLabelNames.has(op.name)) {
          errors.push({ line: instr.line, message: `Tanımsız veri etiketi: ${op.name}` })
        }
      }
      if (op.kind === 'mem' && op.label && !dataLabelNames.has(op.label)) {
        errors.push({ line: instr.line, message: `Tanımsız veri etiketi: ${op.label}` })
      }
    }
  }

  return { instructions, data, errors }
}
