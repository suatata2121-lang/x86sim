import type { Flags, Reg16 } from '../core/types'

const REG_ORDER: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP', 'DS', 'ES', 'SS', 'CS']

function hex(value: number) {
  return value.toString(16).toUpperCase().padStart(4, '0')
}

function binary(value: number) {
  const bits = (value & 0xffff).toString(2).padStart(16, '0')
  return `${bits.slice(0, 8)} ${bits.slice(8)}`
}

export function RegisterView({ regs, flags }: { regs: Record<Reg16, number>; flags: Flags }) {
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
          </tr>
        </thead>
        <tbody>
          {REG_ORDER.map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{hex(regs[name])}h</td>
              <td>{regs[name]}</td>
              <td className="reg-binary">{binary(regs[name])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Flags</h3>
      <div className="flags">
        <span className={flags.ZF ? 'flag on' : 'flag'}>ZF</span>
        <span className={flags.SF ? 'flag on' : 'flag'}>SF</span>
        <span className={flags.CF ? 'flag on' : 'flag'}>CF</span>
        <span className={flags.OF ? 'flag on' : 'flag'}>OF</span>
        <span className={flags.DF ? 'flag on' : 'flag'}>DF</span>
      </div>
    </div>
  )
}
