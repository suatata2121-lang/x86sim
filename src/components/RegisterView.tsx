import { useRef } from 'react'
import type { Flags, Reg16 } from '../core/types'

const REG_ORDER: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'DS', 'ES', 'SS', 'CS']

// Only AX/BX/CX/DX split into an independently-addressable high/low 8-bit
// pair (AH/AL, BH/BL, CH/CL, DH/DL) -- SI/DI/BP/SP/DS/ES/SS/CS are always
// accessed as a full 16-bit word.
const HALF_REGS: Partial<Record<Reg16, [string, string]>> = {
  AX: ['AH', 'AL'],
  BX: ['BH', 'BL'],
  CX: ['CH', 'CL'],
  DX: ['DH', 'DL'],
}

function hex(value: number) {
  return value.toString(16).toUpperCase().padStart(4, '0')
}

function hexByte(value: number) {
  return value.toString(16).toUpperCase().padStart(2, '0')
}

function binary(value: number) {
  const bits = (value & 0xffff).toString(2).padStart(16, '0')
  return `${bits.slice(0, 8)} ${bits.slice(8)}`
}

// FLAGS is itself a 16-bit CPU register, just like AX or IP -- each flag is
// one bit at a fixed position (matching real 8086 bit numbering) rather than
// a separate storage location. This simulator only models CF/PF/AF/ZF/SF/IF/DF/OF,
// so every other bit (including TF and the reserved ones) is always 0 here.
const FLAG_BITS: { name: keyof Flags; bit: number }[] = [
  { name: 'CF', bit: 0 },
  { name: 'PF', bit: 2 },
  { name: 'AF', bit: 4 },
  { name: 'ZF', bit: 6 },
  { name: 'SF', bit: 7 },
  { name: 'IF', bit: 9 },
  { name: 'DF', bit: 10 },
  { name: 'OF', bit: 11 },
]

const FLAG_CHIPS: (keyof Flags)[] = ['ZF', 'SF', 'CF', 'OF', 'DF', 'PF', 'AF', 'IF']

function flagsWord(flags: Flags) {
  return FLAG_BITS.reduce((v, { name, bit }) => (flags[name] ? v | (1 << bit) : v), 0)
}

interface Change {
  regs: Set<Reg16>
  /** Which 8-bit half changed, for AX-DX. */
  halves: Set<string>
  flags: Set<keyof Flags>
}

const NO_CHANGE: Change = { regs: new Set(), halves: new Set(), flags: new Set() }

function diff(before: { regs: Record<Reg16, number>; flags: Flags }, regs: Record<Reg16, number>, flags: Flags): Change {
  const change: Change = { regs: new Set(), halves: new Set(), flags: new Set() }
  for (const name of REG_ORDER) {
    if (before.regs[name] === regs[name]) continue
    change.regs.add(name)
    const halves = HALF_REGS[name]
    if (halves) {
      const bits = before.regs[name] ^ regs[name]
      if ((bits >> 8) & 0xff) change.halves.add(halves[0])
      if (bits & 0xff) change.halves.add(halves[1])
    }
  }
  for (const { name } of FLAG_BITS) if (before.flags[name] !== flags[name]) change.flags.add(name)
  return change
}

/**
 * `stepKey` is the CPU's step count: whenever it moves, whatever differs from
 * the values shown at the previous key stays highlighted until the next step,
 * so a student sees what the last instruction changed without hunting for
 * it in the table. A key of 0 (just loaded or reset) highlights nothing.
 */
export function RegisterView({ regs, flags, stepKey }: { regs: Record<Reg16, number>; flags: Flags; stepKey?: number }) {
  const fw = flagsWord(flags)
  const last = useRef<{ key: number | undefined; regs: Record<Reg16, number>; flags: Flags; change: Change }>({
    key: stepKey, regs, flags, change: NO_CHANGE,
  })
  if (stepKey !== last.current.key) {
    const change = stepKey ? diff(last.current, regs, flags) : NO_CHANGE
    last.current = { key: stepKey, regs, flags, change }
  }
  const { change } = last.current

  return (
    <div className="panel">
      <h3>Registers</h3>
      <table className="reg-table">
        <thead>
          <tr>
            <th></th>
            <th>Hex</th>
            <th>Decimal</th>
            <th>Binary</th>
            <th>8-bit halves</th>
          </tr>
        </thead>
        <tbody>
          {REG_ORDER.map((name) => {
            const halves = HALF_REGS[name]
            return (
              <tr key={name} className={change.regs.has(name) ? 'reg-changed' : undefined}>
                <td>{name}</td>
                <td>{hex(regs[name])}h</td>
                <td>{regs[name]}</td>
                <td className="reg-binary">{binary(regs[name])}</td>
                <td className="reg-halves">
                  {halves ? (
                    <>
                      <span className={change.halves.has(halves[0]) ? 'reg-half-changed' : undefined}>
                        {halves[0]}={hexByte((regs[name] >> 8) & 0xff)}h
                      </span>
                      {'  '}
                      <span className={change.halves.has(halves[1]) ? 'reg-half-changed' : undefined}>
                        {halves[1]}={hexByte(regs[name] & 0xff)}h
                      </span>
                    </>
                  ) : '—'}
                </td>
              </tr>
            )
          })}
          <tr className={`reg-flags-row${change.flags.size ? ' reg-changed' : ''}`}>
            <td>FLAGS</td>
            <td>{hex(fw)}h</td>
            <td>{fw}</td>
            <td className="reg-binary">{binary(fw)}</td>
            <td className="reg-halves">—</td>
          </tr>
        </tbody>
      </table>
      <h3>Flags</h3>
      <div className="flags">
        {FLAG_CHIPS.map((name) => (
          <span key={name} className={`flag${flags[name] ? ' on' : ''}${change.flags.has(name) ? ' changed' : ''}`}>
            {name}={flags[name] ? 1 : 0}
          </span>
        ))}
      </div>
    </div>
  )
}
