import type { CSSProperties, ReactNode } from 'react'
import { assemble } from '../core/assembler'
import type { Base, NumVisual } from '../numberingSystems'

// Draws the worked examples on the Numbering Systems pages (issue #22).
// Each block gets only its inputs from numberingSystems.ts; every digit,
// carry, remainder and flag shown here is computed, so the pictures can't
// disagree with the arithmetic. Colour only backs up meaning: every number
// also carries its base as a subscript or suffix, and each block has a
// legend of just the colours it uses.

const BASE_COLOR: Record<Base, string> = { 2: 'var(--num-bin)', 8: 'var(--num-oct)', 10: 'var(--num-dec)', 16: 'var(--num-hex)' }
const BASE_NAME: Record<Base, string> = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hexadecimal' }
const SUB: Record<Base, string> = { 2: '₂', 8: '₈', 10: '₁₀', 16: '₁₆' }
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

const sup = (n: number) => String(n).split('').map((d) => SUPERSCRIPT[Number(d)]).join('')
const digitChar = (d: number) => d.toString(16).toUpperCase()
const pad = (s: string, width: number) => s.padStart(width, '0')
const bin = (v: number, bits: number) => pad((v >>> 0).toString(2), bits).slice(-bits)

/** The value as this simulator's assembler writes it: 2Ch, 0CBh (leading 0 before a letter). */
export function hexLiteral(v: number, digits = 2): string {
  const h = pad(v.toString(16).toUpperCase(), digits)
  return `${/^[A-F]/.test(h) ? '0' : ''}${h}h`
}

type LegendItem = [color: string, label: string]

function Block({ legend, children, className }: { legend: LegendItem[]; children: ReactNode; className?: string }) {
  return (
    <figure className={`nv-block${className ? ` ${className}` : ''}`}>
      <div className="nv-scroll">{children}</div>
      {legend.length > 0 && (
        <figcaption className="nv-legend">
          {legend.map(([color, label]) => (
            <span key={label}><i className="nv-swatch" style={{ background: color }} />{label}</span>
          ))}
        </figcaption>
      )}
    </figure>
  )
}

function Num({ children, base, strong }: { children: ReactNode; base: Base; strong?: boolean }) {
  return (
    <span className={`nv-num${strong ? ' strong' : ''}`} style={{ color: BASE_COLOR[base] }}>
      {children}<sub className="nv-sub">{SUB[base]}</sub>
    </span>
  )
}

/** A literal like 0FFh: its h suffix already names the base, so no subscript. */
function Hex({ children }: { children: ReactNode }) {
  return <span className="nv-num" style={{ color: BASE_COLOR[16] }}>{children}</span>
}

function Chip({ children, kind = 'flag' }: { children: ReactNode; kind?: 'flag' | 'carry' }) {
  return <span className={`nv-chip ${kind}`}>{children}</span>
}

interface CellProps {
  children?: ReactNode
  color?: string
  faint?: boolean
  mark?: boolean
  sign?: boolean
  bg?: string
  className?: string
}

function Cell({ children, color, faint, mark, sign, bg, className }: CellProps) {
  const style: CSSProperties = {}
  if (color) style.color = color
  if (bg) style.background = bg
  const cls = ['nv-cell', faint && 'faint', mark && 'mark', sign && 'sign', className].filter(Boolean).join(' ')
  return <span className={cls} style={style}>{children}</span>
}

/** A row of bits; `changed` indexes (from the left) get highlighted. */
function BitRow({ bits, changed, signBit, faintZeros, maskBg }: {
  bits: string
  changed?: Set<number>
  signBit?: boolean
  faintZeros?: boolean
  maskBg?: boolean
}) {
  return (
    <>
      {bits.split('').map((b, i) => (
        <Cell
          key={i}
          color={BASE_COLOR[2]}
          mark={changed?.has(i)}
          sign={signBit && i === 0}
          faint={faintZeros && b === '0'}
          bg={maskBg ? (Math.floor(i / 4) % 2 ? 'var(--num-nibble-b)' : 'var(--num-nibble-a)') : undefined}
        >
          {b}
        </Cell>
      ))}
    </>
  )
}

const changedBits = (before: string, after: string) =>
  new Set(after.split('').flatMap((b, i) => (b !== before[i] ? [i] : [])))

// ------------------------------------------------------------ the blocks --

function Positional({ value, base }: { value: string; base: Base }) {
  const digits = value.toUpperCase().split('')
  const n = digits.length
  const parts = digits.map((d, i) => {
    const dv = parseInt(d, 16)
    const weight = base ** (n - 1 - i)
    return { d, dv, power: n - 1 - i, product: dv * weight }
  })
  const total = parts.reduce((s, p) => s + p.product, 0)
  const nonZero = parts.filter((p) => p.dv !== 0)
  return (
    <Block legend={base === 10 ? [[BASE_COLOR[10], 'decimal']] : [[BASE_COLOR[base], `${BASE_NAME[base]} digit`], ['var(--num-dec)', 'decimal value']]}>
      <div className="nv-title"><Num base={base} strong>{value.toUpperCase()}</Num></div>
      <div className="nv-grid" style={{ gridTemplateColumns: `auto repeat(${n}, minmax(${n > 4 ? 2 : 3.2}rem, auto))` }}>
        <span className="nv-rowlabel">digit</span>
        {parts.map((p, i) => <Cell key={i} className="box" color={BASE_COLOR[base]} faint={p.dv === 0}>{p.d}</Cell>)}
        <span className="nv-rowlabel">weight</span>
        {parts.map((p, i) => <Cell key={i} faint={p.dv === 0}>{base}{sup(p.power)}</Cell>)}
        <span className="nv-rowlabel">digit × weight</span>
        {parts.map((p, i) => <Cell key={i} color="var(--num-dec)" faint={p.dv === 0}>{p.product}</Cell>)}
      </div>
      <div className="nv-total">
        {nonZero.map((p) => p.product).join(' + ')} = <Num base={10} strong>{total}</Num>
      </div>
    </Block>
  )
}

function Division({ value, base }: { value: number; base: Base }) {
  const rows: { n: number; q: number; r: number }[] = []
  let n = value
  do {
    rows.push({ n, q: Math.floor(n / base), r: n % base })
    n = Math.floor(n / base)
  } while (n > 0)
  const result = rows.map((r) => digitChar(r.r)).reverse().join('')
  return (
    <Block legend={[['var(--num-dec)', 'decimal'], [BASE_COLOR[base], `remainder = ${BASE_NAME[base]} digit`]]}>
      <div className="nv-division">
        <div className="nv-div-rows">
          {rows.map((r, i) => (
            <div key={i} className="nv-div-row">
              <Num base={10}>{r.n}</Num> ÷ {base} = <Num base={10}>{r.q}</Num> r <Chip kind="flag">{r.r}{r.r > 9 ? ` = ${digitChar(r.r)}` : ''}</Chip>
            </div>
          ))}
        </div>
        <div className="nv-upward" aria-label="read the remainders upward">
          <span className="nv-arrow">↑</span>
          <span>read upward</span>
        </div>
        <div className="nv-result"><Num base={base} strong>{result}</Num></div>
      </div>
    </Block>
  )
}

function Nibbles({ binary }: { binary: string }) {
  const padded = pad(binary, Math.ceil(binary.length / 4) * 4)
  const groups = padded.match(/.{4}/g) ?? []
  const hex = groups.map((g) => digitChar(parseInt(g, 2))).join('')
  return (
    <Block legend={[[BASE_COLOR[2], 'binary (one nibble per shade)'], [BASE_COLOR[16], 'hex digit']]}>
      <div className="nv-nibbles">
        {groups.map((g, i) => (
          <div key={i} className="nv-nibble" style={{ background: i % 2 ? 'var(--num-nibble-b)' : 'var(--num-nibble-a)' }}>
            <span style={{ color: BASE_COLOR[2] }}>{g}</span>
            <span className="nv-nibble-hex" style={{ color: BASE_COLOR[16] }}>{digitChar(parseInt(g, 2))}</span>
          </div>
        ))}
        <div className="nv-result">
          <Num base={2}>{binary}</Num> = <Num base={16} strong>{hex}</Num> = {hexLiteral(parseInt(binary, 2))}
        </div>
      </div>
    </Block>
  )
}

function DigitTable() {
  const half = (from: number) => Array.from({ length: 8 }, (_, i) => from + i)
  return (
    <Block legend={[[BASE_COLOR[10], 'decimal'], [BASE_COLOR[2], 'binary'], [BASE_COLOR[16], 'hex']]}>
      <div className="nv-digit-tables">
        {[0, 8].map((from) => (
          <table key={from} className="nv-table">
            <thead>
              <tr>
                <th style={{ color: BASE_COLOR[10] }}>Decimal{SUB[10]}</th>
                <th style={{ color: BASE_COLOR[2] }}>Binary{SUB[2]}</th>
                <th style={{ color: BASE_COLOR[16] }}>Hex{SUB[16]}</th>
              </tr>
            </thead>
            <tbody>
              {half(from).map((v) => (
                <tr key={v}>
                  <td style={{ color: BASE_COLOR[10] }}>{v}</td>
                  <td style={{ color: BASE_COLOR[2] }}>{bin(v, 4)}</td>
                  <td style={{ color: BASE_COLOR[16] }}>{digitChar(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </Block>
  )
}

function Twos({ value, bits }: { value: number; bits: 8 | 16 }) {
  const mask = 2 ** bits - 1
  const abs = bin(Math.abs(value), bits)
  const flipped = bin(~Math.abs(value) & mask, bits)
  const plusOne = bin((value + 2 ** bits) & mask, bits)
  const stored = (value + 2 ** bits) & mask
  const steps: { label: ReactNode; bits: string; changed?: Set<number> }[] = [
    { label: <>|{value}| = {Math.abs(value)} in binary</>, bits: abs },
    { label: 'flip every bit (NOT)', bits: flipped, changed: changedBits(abs, flipped) },
    { label: 'add 1', bits: plusOne, changed: changedBits(flipped, plusOne) },
  ]
  return (
    <Block legend={[[BASE_COLOR[2], 'binary'], ['var(--num-carry)', 'sign bit'], ['var(--accent-text)', 'bits changed by this step'], [BASE_COLOR[16], 'hex']]}>
      <div className="nv-grid" style={{ gridTemplateColumns: `auto repeat(${bits}, 1.35rem)` }}>
        {steps.map((s, i) => (
          <Row key={i} label={s.label}>
            <BitRow bits={s.bits} changed={s.changed} signBit />
          </Row>
        ))}
      </div>
      <div className="nv-total">
        {value} is stored as <Num base={2}>{plusOne}</Num> = <Num base={16} strong>{hexLiteral(stored, bits / 4).replace(/h$/, '')}</Num> ({hexLiteral(stored, bits / 4)}, {stored} unsigned)
      </div>
    </Block>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="nv-rowlabel">{label}</span>
      {children}
    </>
  )
}

function Range({ bits }: { bits: 8 | 16 }) {
  const half = 2 ** (bits - 1)
  const digits = bits / 4
  return (
    <Block legend={[['var(--num-dec)', 'decimal'], [BASE_COLOR[16], 'hex'], ['var(--num-carry)', 'sign bit / negative reading']]}>
      <div className="nv-title">{bits === 8 ? 'Byte (8-bit)' : 'Word (16-bit)'}</div>
      <div className="nv-range">
        <div className="nv-range-half">
          <span className="nv-range-sign">sign bit 0</span>
          <span><Hex>{hexLiteral(0, digits)}</Hex> … <Hex>{hexLiteral(half - 1, digits)}</Hex></span>
          <span><Num base={10}>0</Num> … <Num base={10}>{half - 1}</Num></span>
          <span className="nv-range-reading">positive</span>
        </div>
        <div className="nv-range-half neg">
          <span className="nv-range-sign">sign bit 1</span>
          <span><Hex>{hexLiteral(half, digits)}</Hex> … <Hex>{hexLiteral(2 * half - 1, digits)}</Hex></span>
          <span><Num base={10}>{half}</Num> … <Num base={10}>{2 * half - 1}</Num> unsigned</span>
          <span className="nv-range-reading"><Num base={10}>{-half}</Num> … <Num base={10}>-1</Num> signed</span>
        </div>
      </div>
    </Block>
  )
}

function AddRules() {
  const cases: [number[], string][] = [[[0, 0], ''], [[0, 1], ''], [[1, 1], 'write 0, carry 1'], [[1, 1, 1], 'write 1, carry 1']]
  return (
    <Block legend={[[BASE_COLOR[2], 'binary digit'], ['var(--num-carry)', 'carry to the next column']]}>
      <table className="nv-table nv-rules">
        <tbody>
          {cases.map(([ins, note]) => {
            const s = ins.reduce((a, b) => a + b, 0)
            return (
              <tr key={ins.join('+')}>
                <td style={{ color: BASE_COLOR[2] }}>{ins.join(' + ')}</td>
                <td>=</td>
                <td>
                  {s >= 2 && <span style={{ color: 'var(--num-carry)' }}>1</span>}
                  <span style={{ color: BASE_COLOR[2] }}>{s % 2}</span>
                  <sub className="nv-sub">{SUB[2]}</sub>
                </td>
                <td className="nv-note">{note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Block>
  )
}

function digitsOf(v: number, base: Base, width: number): number[] {
  // Least significant first.
  return Array.from({ length: width }, (_, i) => Math.floor(v / base ** i) % base)
}

function Column({ op, a, b, bits, base, showFlags }: { op: 'add' | 'sub'; a: number; b: number; bits: 8; base: 2 | 16; showFlags?: boolean }) {
  const width = base === 2 ? bits : bits / 4
  const mask = 2 ** bits - 1
  const sign = 2 ** (bits - 1)
  const da = digitsOf(a, base, width)
  const db = digitsOf(b, base, width)
  const res: number[] = []
  // Per column: the carry that came in from the right (add), or whether this
  // column gave 1 to the column on its right (sub) -- both are written above it.
  const marks: number[] = []
  let c = 0
  for (let i = 0; i < width; i++) {
    marks.push(c)
    let s = op === 'add' ? da[i] + db[i] + c : da[i] - db[i] - c
    if (op === 'add') {
      c = s >= base ? 1 : 0
      s %= base
    } else {
      c = s < 0 ? 1 : 0
      if (s < 0) s += base
    }
    res.push(s)
  }
  const cf = c === 1
  const raw = op === 'add' ? a + b : a - b
  const kept = raw & mask
  const of = op === 'add' ? ((a ^ kept) & (b ^ kept) & sign) !== 0 : ((a ^ b) & (a ^ kept) & sign) !== 0
  const color = BASE_COLOR[base]
  const cols = `auto 1.35rem repeat(${width}, 1.35rem)`
  const lsbFirst = (arr: number[]) => [...arr].reverse()
  const sym = op === 'add' ? '+' : '−'
  const literal = (v: number) => (base === 16 ? hexLiteral(v) : `${bin(v, bits)}b`)

  return (
    <Block
      legend={[
        [color, `${BASE_NAME[base]} digit`],
        ['var(--num-carry)', op === 'add' ? 'carry into the column' : 'borrow (this column gives 1)'],
        ...(cf || showFlags ? [['var(--num-flag)', 'flag'] as LegendItem] : []),
        ['var(--num-dec)', 'decimal check'],
      ]}
    >
      <div className="nv-grid nv-column" style={{ gridTemplateColumns: cols }}>
        <span className="nv-rowlabel">{op === 'add' ? 'carry' : 'borrow'}</span>
        <Cell className="nv-small" color="var(--num-carry)">{cf ? '1' : ''}</Cell>
        {lsbFirst(marks).map((m, i) => (
          <Cell key={i} className="nv-small" color="var(--num-carry)">{m ? '1' : ''}</Cell>
        ))}
        <span className="nv-rowlabel" />
        <Cell />
        {lsbFirst(da).map((d, i) => <Cell key={i} color={color}>{digitChar(d)}</Cell>)}
        <span className="nv-rowlabel" />
        <Cell>{sym}</Cell>
        {lsbFirst(db).map((d, i) => <Cell key={i} color={color}>{digitChar(d)}</Cell>)}
        <span className="nv-rowlabel" />
        <span className="nv-rule" style={{ gridColumn: `2 / span ${width + 1}` }} />
        <span className="nv-rowlabel">{`${base === 2 ? bits : bits / 4}-${base === 2 ? 'bit' : 'digit'} result`}</span>
        <Cell className={cf && op === 'add' ? 'out' : ''} color="var(--num-carry)">{cf && op === 'add' ? '1' : ''}</Cell>
        {lsbFirst(res).map((d, i) => <Cell key={i} color={color} className="strong">{digitChar(d)}</Cell>)}
      </div>
      <div className="nv-total">
        {(cf || showFlags) && <Chip>CF = {cf ? 1 : 0}</Chip>}
        {showFlags && <Chip>OF = {of ? 1 : 0}</Chip>}
        {cf && op === 'add' && <> the ninth bit falls into CF; kept in AL: <Num base={16} strong>{hexLiteral(kept).replace(/h$/, '')}</Num> ({kept})</>}
        {cf && op === 'sub' && <> a borrow ran off the top; kept in AL: <Num base={16} strong>{hexLiteral(kept).replace(/h$/, '')}</Num> ({kept} unsigned, {kept - 256} signed)</>}
      </div>
      {showFlags && <div className="nv-total"><Register name="AL" value={kept} bits={8} /></div>}
      <div className="nv-check">
        <Num base={10}>{a}</Num> {sym} <Num base={10}>{b}</Num> = <Num base={10}>{raw}</Num>
        {kept !== raw && <> → AL keeps {raw < 0 ? `256 − ${-raw}` : `${raw} − 256`} = <Num base={10}>{kept}</Num></>}
        {base === 16 && <> ({literal(a)} {sym} {literal(b)} = {literal(kept)})</>}
      </div>
    </Block>
  )
}

function ShiftAdd({ a, b }: { a: number; b: number }) {
  const product = a * b
  const width = product.toString(2).length
  const bBits = b.toString(2).length
  const rows = Array.from({ length: bBits }, (_, j) => ({ j, on: ((b >> j) & 1) === 1 }))
  const cols = `auto repeat(${width}, 1.35rem)`
  const right = (s: string) => s.padStart(width, ' ').split('')
  return (
    <Block legend={[[BASE_COLOR[2], 'binary'], ['var(--num-dec)', 'decimal']]}>
      <div className="nv-title"><Num base={2}>{a.toString(2)}</Num> × <Num base={2}>{b.toString(2)}</Num> (<Num base={10}>{a}</Num> × <Num base={10}>{b}</Num>)</div>
      <div className="nv-grid" style={{ gridTemplateColumns: cols }}>
        {rows.map(({ j, on }) => (
          <Row key={j} label={on ? `bit ${j} = 1: shift left ${j}` : `bit ${j} = 0`}>
            {right(on ? (a << j).toString(2) : '0').map((ch, i) => (
              <Cell key={i} color={BASE_COLOR[2]} faint={!on}>{ch.trim()}</Cell>
            ))}
          </Row>
        ))}
        <span className="nv-rowlabel" />
        <span className="nv-rule" style={{ gridColumn: `2 / span ${width}` }} />
        <Row label="sum">
          {right(product.toString(2)).map((ch, i) => <Cell key={i} color={BASE_COLOR[2]} className="strong">{ch.trim()}</Cell>)}
        </Row>
      </div>
      <div className="nv-total">= <Num base={2} strong>{product.toString(2)}</Num> = <Num base={10} strong>{product}</Num></div>
    </Block>
  )
}

function LongDiv({ dividend, divisor }: { dividend: number; divisor: number }) {
  const bits = dividend.toString(2)
  const d = divisor.toString(2)
  let rem = 0
  const steps = bits.split('').map((bit) => {
    rem = rem * 2 + Number(bit)
    const fits = rem >= divisor
    const before = rem
    if (fits) rem -= divisor
    return { bit, before, fits, after: rem }
  })
  const quotient = Math.floor(dividend / divisor)
  return (
    <Block legend={[[BASE_COLOR[2], 'binary'], ['var(--accent-text)', 'quotient bit'], ['var(--num-dec)', 'decimal']]}>
      <div className="nv-title">
        <Num base={2}>{bits}</Num> ÷ <Num base={2}>{d}</Num> (<Num base={10}>{dividend}</Num> ÷ <Num base={10}>{divisor}</Num>)
      </div>
      <div className="nv-grid" style={{ gridTemplateColumns: `auto repeat(${bits.length}, 1.35rem)` }}>
        <Row label="quotient">
          {steps.map((s, i) => <Cell key={i} mark color="var(--accent-text)">{s.fits ? '1' : '0'}</Cell>)}
        </Row>
        <Row label="dividend">
          {steps.map((s, i) => <Cell key={i} color={BASE_COLOR[2]}>{s.bit}</Cell>)}
        </Row>
      </div>
      <table className="nv-table nv-steps">
        <thead><tr><th>bring down</th><th>so far</th><th>does {d}₂ fit?</th><th>left over</th></tr></thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i}>
              <td style={{ color: BASE_COLOR[2] }}>{s.bit}</td>
              <td style={{ color: BASE_COLOR[2] }}>{s.before.toString(2)}</td>
              <td>{s.fits ? <>yes → write <b>1</b>, subtract</> : <>no → write <b>0</b></>}</td>
              <td style={{ color: BASE_COLOR[2] }}>{s.after.toString(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nv-total">
        quotient <Num base={2} strong>{quotient.toString(2)}</Num> = <Num base={10}>{quotient}</Num>, remainder{' '}
        <Chip kind="carry">{(dividend % divisor).toString(2)}{SUB[2]} = {dividend % divisor}</Chip>
      </div>
    </Block>
  )
}

function Shift({ dir, value, count, bits }: { dir: 'left' | 'right'; value: number; count: 1; bits: 8 }) {
  const mask = 2 ** bits - 1
  const before = bin(value, bits)
  const result = dir === 'left' ? (value << count) & mask : value >> count
  const after = bin(result, bits)
  const cf = dir === 'left' ? before[0] : before[bits - 1]
  const cfCell = <span className="nv-cf-box"><small>CF</small>{cf}</span>
  return (
    <Block legend={[[BASE_COLOR[2], 'binary'], ['var(--num-flag)', 'Carry flag'], ['var(--num-dec)', 'decimal']]}>
      <div className="nv-shift">
        <div className="nv-shift-rows">
          <div className="nv-shift-row">
            <span className="nv-rowlabel">before</span>
            {before.split('').map((b, i) => (
              <Cell key={i} color={BASE_COLOR[2]} mark={(dir === 'left' && i === 0) || (dir === 'right' && i === bits - 1)}>{b}</Cell>
            ))}
          </div>
          <div className="nv-shift-row">
            <span className="nv-rowlabel">{dir === 'left' ? 'SHL 1' : 'SHR 1'}</span>
            {after.split('').map((b, i) => (
              <Cell key={i} color={BASE_COLOR[2]} faint={(dir === 'left' && i === bits - 1) || (dir === 'right' && i === 0)}>{b}</Cell>
            ))}
          </div>
        </div>
        <div className={`nv-shift-cf ${dir}`}>
          <span className="nv-arrow">{dir === 'left' ? '↖' : '↗'}</span>
          {cfCell}
        </div>
      </div>
      <div className="nv-check">
        <Num base={10}>{value}</Num> → <Num base={10}>{result}</Num>
        {dir === 'left' ? <>  (× 2), <Chip>CF = {cf}</Chip></> : <>, <Chip>CF = {cf}</Chip> (÷ 2, remainder {cf})</>}
        {' '}· the faint 0 is the bit shifted in
      </div>
    </Block>
  )
}

function Bitwise({ op, a, b, bits, ascii }: { op: 'AND' | 'OR' | 'XOR' | 'NOT'; a: number; b?: number; bits: 8; ascii?: boolean }) {
  const mask = 2 ** bits - 1
  const m = b ?? 0
  const result = op === 'AND' ? a & m : op === 'OR' ? a | m : op === 'XOR' ? a ^ m : ~a & mask
  const ra = bin(a, bits)
  const rr = bin(result, bits)
  // Only the value and the result are characters; the mask is just bits.
  const tail = (v: number, isChar = false) => (
    <span className="nv-tail">
      = <Num base={16}>{hexLiteral(v).replace(/h$/, '')}</Num>
      {ascii && isChar && <> '{String.fromCharCode(v)}'</>}
    </span>
  )
  return (
    <Block legend={[[BASE_COLOR[2], 'binary'], ...(b !== undefined ? [['var(--num-nibble-b)', 'mask'] as LegendItem] : []), ['var(--accent-text)', 'bit changed by the operation'], [BASE_COLOR[16], 'hex']]}>
      <div className="nv-grid" style={{ gridTemplateColumns: `auto repeat(${bits}, 1.35rem) auto` }}>
        <Row label={op === 'NOT' ? 'NOT' : ''}>
          <BitRow bits={ra} />
          {tail(a, true)}
        </Row>
        {b !== undefined && (
          <Row label={op}>
            <BitRow bits={bin(m, bits)} maskBg />
            {tail(m)}
          </Row>
        )}
        <span className="nv-rowlabel" />
        <span className="nv-rule" style={{ gridColumn: `2 / span ${bits}` }} />
        <span />
        <Row label="result">
          <BitRow bits={rr} changed={changedBits(ra, rr)} />
          {tail(result, true)}
        </Row>
      </div>
    </Block>
  )
}

function TruthTable({ ops }: { ops: ('AND' | 'OR' | 'XOR' | 'NOT')[] }) {
  const binary = ops.filter((o) => o !== 'NOT')
  const f = (op: string, x: number, y: number) => (op === 'AND' ? x & y : op === 'OR' ? x | y : x ^ y)
  const one = (v: number) => <td className={v ? 'nv-one' : ''}>{v}</td>
  return (
    <Block legend={[['var(--accent-text)', 'result 1']]}>
      <div className="nv-digit-tables">
        <table className="nv-table nv-truth">
          <thead><tr><th>A</th><th>B</th>{binary.map((o) => <th key={o}>A {o} B</th>)}</tr></thead>
          <tbody>
            {[[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => (
              <tr key={`${x}${y}`}><td>{x}</td><td>{y}</td>{binary.map((o) => <td key={o} className={f(o, x, y) ? 'nv-one' : ''}>{f(o, x, y)}</td>)}</tr>
            ))}
          </tbody>
        </table>
        {ops.includes('NOT') && (
          <table className="nv-table nv-truth">
            <thead><tr><th>A</th><th>NOT A</th></tr></thead>
            <tbody>
              {[0, 1].map((x) => <tr key={x}><td>{x}</td>{one(1 - x)}</tr>)}
            </tbody>
          </table>
        )}
      </div>
    </Block>
  )
}

const SUFFIX: Record<string, { base: Base; name: string }> = {
  h: { base: 16, name: 'hex' }, b: { base: 2, name: 'binary' }, o: { base: 8, name: 'octal' }, q: { base: 8, name: 'octal' },
}

function Literal({ text }: { text: string }) {
  const last = text.slice(-1).toLowerCase()
  const suffix = SUFFIX[last]
  const body = suffix ? text.slice(0, -1) : text
  const base: Base = suffix?.base ?? 10
  // Only the assembler's rule: a number must start with a digit, otherwise it is read as a label.
  const invalid = !/^[0-9]/.test(text)
  const leadingZero = base === 16 && body.length > 1 && body[0] === '0' && /[A-F]/i.test(body[1])
  const digits = leadingZero ? body.slice(1) : body
  const value = parseInt(body, base)
  return (
    <Block
      className={invalid ? 'nv-invalid' : undefined}
      legend={[
        [BASE_COLOR[base], `${BASE_NAME[base]} digits and suffix`],
        ...(leadingZero ? [['var(--text-dim)', 'leading 0'] as LegendItem] : []),
        ...(invalid ? [['var(--num-carry)', 'not a number'] as LegendItem] : []),
      ]}
    >
      <div className="nv-literal">
        {leadingZero && (
          <span className="nv-lit-part">
            <span className="nv-lit-text" style={{ color: 'var(--text-dim)' }}>0</span>
            <small>needed because {digits[0].toUpperCase()} is a letter</small>
          </span>
        )}
        <span className="nv-lit-part">
          <span className="nv-lit-text" style={{ color: BASE_COLOR[base] }}>{digits}</span>
          <small>{BASE_NAME[base]} digits</small>
        </span>
        {suffix && (
          <span className="nv-lit-part">
            <span className="nv-lit-text strong" style={{ color: BASE_COLOR[base] }}>{last}</span>
            <small>{last} = {suffix.name}</small>
          </span>
        )}
        <span className="nv-lit-value">
          {invalid
            ? <>starts with a letter, so the assembler reads it as a <b>label</b>, not a number</>
            : <>= <Num base={10} strong>{value}</Num></>}
        </span>
      </div>
    </Block>
  )
}

/** A box like the simulator's register panel: name, hex, binary by nibble, decimal. */
export function Register({ name, value, bits, note }: { name: string; value: number; bits: 8 | 16; note?: string }) {
  const b = bin(value, bits).match(/.{4}/g)?.join(' ')
  return (
    <span className="nv-register">
      <span className="nv-reg-name">{name}</span>
      <span style={{ color: BASE_COLOR[16] }}>{hexLiteral(value, bits / 4)}</span>
      <span style={{ color: BASE_COLOR[2] }}>{b}<sub className="nv-sub">{SUB[2]}</sub></span>
      <span style={{ color: BASE_COLOR[10] }}>{value}<sub className="nv-sub">{SUB[10]}</sub></span>
      {note && <span className="nv-reg-note">{note}</span>}
    </span>
  )
}

const REGISTER_LEGEND: LegendItem[] = [[BASE_COLOR[16], 'hex'], [BASE_COLOR[2], 'binary'], [BASE_COLOR[10], 'decimal']]

function Mul({ a, b }: { a: number; b: number }) {
  const product = a * b
  const high = product >> 8
  const overflow = high !== 0
  return (
    <Block legend={[...REGISTER_LEGEND, ['var(--num-flag)', 'flag']]}>
      <div className="nv-op-row">
        <Register name="AL" value={a} bits={8} /> <span className="nv-op">×</span> <Register name="BL" value={b} bits={8} />
        <span className="nv-op">→</span> <Register name="AX" value={product} bits={16} />
      </div>
      <div className="nv-total">
        AH = {hexLiteral(high)}, AL = {hexLiteral(product & 0xff)} · <Chip>CF = {overflow ? 1 : 0}</Chip> <Chip>OF = {overflow ? 1 : 0}</Chip>
        {overflow ? ' (the product needed AH)' : ' (the product fit in AL)'}
      </div>
    </Block>
  )
}

function Div({ dividend, divisor }: { dividend: number; divisor: number }) {
  const q = Math.floor(dividend / divisor)
  const r = dividend % divisor
  return (
    <Block legend={REGISTER_LEGEND}>
      <div className="nv-op-row">
        <Register name="AX" value={dividend} bits={16} /> <span className="nv-op">÷</span> <Register name="BL" value={divisor} bits={8} />
        <span className="nv-op">→</span>
        <Register name="AL" value={q} bits={8} note="quotient" /> <Register name="AH" value={r} bits={8} note="remainder" />
      </div>
    </Block>
  )
}

export function NumberVisual({ visual: v }: { visual: NumVisual }) {
  switch (v.kind) {
    case 'positional': return <Positional {...v} />
    case 'division': return <Division {...v} />
    case 'nibbles': return <Nibbles {...v} />
    case 'digitTable': return <DigitTable />
    case 'twos': return <Twos {...v} />
    case 'range': return <Range {...v} />
    case 'addRules': return <AddRules />
    case 'column': return <Column {...v} />
    case 'shiftAdd': return <ShiftAdd {...v} />
    case 'longDiv': return <LongDiv {...v} />
    case 'shift': return <Shift {...v} />
    case 'bitwise': return <Bitwise {...v} />
    case 'truthTable': return <TruthTable {...v} />
    case 'literal': return <Literal {...v} />
    case 'register': return <Block legend={REGISTER_LEGEND}><Register {...v} /></Block>
    case 'mul': return <Mul {...v} />
    case 'div': return <Div {...v} />
    case 'registerRoles': return <RegisterRoles />
    case 'movRules': return <MovRules />
  }
}

const REGISTER_ROLES: [string, string, string][] = [
  ['AX', 'Accumulator', 'The default operand of MUL, DIV, IN and OUT.'],
  ['BX', 'Base', 'Can hold a memory address: MOV AL, [BX].'],
  ['CX', 'Count', 'The counter for LOOP; CL holds the shift count.'],
  ['DX', 'Data', 'The port number for IN/OUT; the upper half of a 32-bit MUL or DIV result.'],
  ['SI', 'Source Index', 'The address of source data, e.g. in string copies.'],
  ['DI', 'Destination Index', 'The address of destination data.'],
  ['BP', 'Base Pointer', 'The address of data on the stack, such as subroutine parameters.'],
  ['SP', 'Stack Pointer', "The top of the stack. PUSH, POP, CALL and RET change it -- don't use it for ordinary data."],
]

function RegisterRoles() {
  return (
    <Block legend={[]}>
      <table className="nv-table nv-roles">
        <thead><tr><th>Register</th><th>Name</th><th>Its special job</th></tr></thead>
        <tbody>
          {REGISTER_ROLES.map(([reg, name, job]) => (
            <tr key={reg}>
              <td><span className="nv-reg-chip">{reg}</span></td>
              <td>{name}</td>
              <td>{job}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  )
}

const MOV_RULES: { rule: string; ok: string[]; bad: string[] }[] = [
  { rule: 'Both operands must be the same size.', ok: ['MOV AL, BL'], bad: ['MOV AX, BL'] },
  { rule: 'At most one operand can be in memory. Copy through a register instead.', ok: ['MOV AX, [Y]', 'MOV [X], AX'], bad: ['MOV [X], [Y]'] },
  { rule: "The destination can't be a number.", ok: [], bad: ['MOV 5, AX'] },
  { rule: 'Segment registers are special.', ok: [], bad: ['MOV CS, AX', 'MOV DS, 5'] },
]

// The message shown next to a rejected line is whatever this simulator's
// assembler really says about it, so the box can't drift from the assembler.
function assemblerMessage(line: string): string | null {
  const { errors } = assemble(`X DW 0
Y DW 0
${line}`)
  return errors[0]?.message ?? null
}

function MovRules() {
  return (
    <Block legend={[['var(--success-text)', 'accepted'], ['var(--num-carry)', 'rejected by the assembler']]}>
      <ol className="nv-rules-list">
        {MOV_RULES.map(({ rule, ok, bad }) => (
          <li key={rule}>
            <p className="nv-rule-text">{rule}</p>
            {ok.length > 0 && (
              <p className="nv-ok"><span aria-label="accepted">✓</span> <code>{ok.join(' then ')}</code></p>
            )}
            {bad.map((line) => (
              <p key={line} className="nv-bad">
                <span aria-label="rejected">✗</span> <code>{line}</code>
                <span className="nv-bad-msg"> → {assemblerMessage(line) ?? '(accepted)'}</span>
              </p>
            ))}
          </li>
        ))}
      </ol>
    </Block>
  )
}
