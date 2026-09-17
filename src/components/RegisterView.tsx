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
// a separate storage location. This simulator only models CF/ZF/SF/DF/OF, so
// every other bit (including the reserved ones) is always 0 here.
const FLAG_BITS: { name: keyof Flags; bit: number }[] = [
  { name: 'CF', bit: 0 },
  { name: 'ZF', bit: 6 },
  { name: 'SF', bit: 7 },
  { name: 'DF', bit: 10 },
  { name: 'OF', bit: 11 },
]

function flagsWord(flags: Flags) {
  return FLAG_BITS.reduce((v, { name, bit }) => (flags[name] ? v | (1 << bit) : v), 0)
}

export function RegisterView({ regs, flags }: { regs: Record<Reg16, number>; flags: Flags }) {
  const fw = flagsWord(flags)
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
              <tr key={name}>
                <td>{name}</td>
                <td>{hex(regs[name])}h</td>
                <td>{regs[name]}</td>
                <td className="reg-binary">{binary(regs[name])}</td>
                <td className="reg-halves">
                  {halves
                    ? `${halves[0]}=${hexByte((regs[name] >> 8) & 0xff)}h  ${halves[1]}=${hexByte(regs[name] & 0xff)}h`
                    : '—'}
                </td>
              </tr>
            )
          })}
          <tr className="reg-flags-row">
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
        <span className={flags.ZF ? 'flag on' : 'flag'}>ZF={flags.ZF ? 1 : 0}</span>
        <span className={flags.SF ? 'flag on' : 'flag'}>SF={flags.SF ? 1 : 0}</span>
        <span className={flags.CF ? 'flag on' : 'flag'}>CF={flags.CF ? 1 : 0}</span>
        <span className={flags.OF ? 'flag on' : 'flag'}>OF={flags.OF ? 1 : 0}</span>
        <span className={flags.DF ? 'flag on' : 'flag'}>DF={flags.DF ? 1 : 0}</span>
      </div>
    </div>
  )
}
