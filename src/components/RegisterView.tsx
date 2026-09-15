import type { Flags, Reg16 } from '../core/types'

const REG_ORDER: Reg16[] = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP', 'SP']

function hex(value: number) {
  return value.toString(16).toUpperCase().padStart(4, '0')
}

export function RegisterView({ regs, flags }: { regs: Record<Reg16, number>; flags: Flags }) {
  return (
    <div className="panel">
      <h3>Registers</h3>
      <table className="reg-table">
        <tbody>
          {REG_ORDER.map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{hex(regs[name])}h</td>
              <td>{regs[name]}</td>
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
