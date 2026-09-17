import type { DataDeclaration, Mnemonic } from '../core/types'
import type { MnemonicProfile } from '../core/cpu'

export function ProfilerView({
  cycles,
  profile,
  steps,
  peakStackBytes,
  memoryWrites,
  data,
  instructionCount,
}: {
  cycles: number
  profile: Map<Mnemonic, MnemonicProfile>
  steps: number
  peakStackBytes: number
  memoryWrites: Set<number>
  data: DataDeclaration[]
  instructionCount: number
}) {
  const dataBytes = data.reduce((max, d) => Math.max(max, d.address + d.bytes.length), 0)
  const extraWrites = [...memoryWrites].filter((addr) => addr >= dataBytes).length

  const rows = [...profile.entries()].sort((a, b) => b[1].cycles - a[1].cycles)
  const maxRowCycles = rows.length > 0 ? rows[0][1].cycles : 0

  return (
    <div className="panel">
      <h3>Profiler</h3>
      <table className="reg-table">
        <tbody>
          <tr>
            <td>Clock cycles</td>
            <td>{cycles.toLocaleString()}</td>
          </tr>
          <tr>
            <td>Instructions executed</td>
            <td>{steps.toLocaleString()}</td>
          </tr>
          <tr>
            <td>Avg cycles / instruction</td>
            <td>{steps > 0 ? (cycles / steps).toFixed(1) : '-'}</td>
          </tr>
        </tbody>
      </table>

      {rows.length > 0 && (
        <table className="mem-table profiler-breakdown">
          <thead>
            <tr>
              <th>Op</th>
              <th>Count</th>
              <th>Cycles</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([mnemonic, entry]) => (
              <tr key={mnemonic}>
                <td className="mem-addr">{mnemonic}</td>
                <td>{entry.count}</td>
                <td>{entry.cycles.toLocaleString()}</td>
                <td>
                  <div
                    className="profiler-bar"
                    style={{ width: `${maxRowCycles > 0 ? (entry.cycles / maxRowCycles) * 100 : 0}%` }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Memory footprint</h3>
      <table className="reg-table">
        <tbody>
          <tr>
            <td>Code (instructions)</td>
            <td>{instructionCount}</td>
          </tr>
          <tr>
            <td>Data segment (declared)</td>
            <td>{dataBytes} bytes</td>
          </tr>
          <tr>
            <td>Stack (peak this run)</td>
            <td>{peakStackBytes} bytes</td>
          </tr>
          <tr>
            <td>Writes beyond declared data</td>
            <td>{extraWrites} bytes</td>
          </tr>
        </tbody>
      </table>
      {extraWrites > 0 && (
        <p className="status">
          The program wrote to {extraWrites} byte{extraWrites === 1 ? '' : 's'} outside its declared DB/DW data —
          check for an array write past its bound or an undeclared buffer.
        </p>
      )}
      <p className="status">
        Cycle counts are idealized 8086 timings (no bus/wait-state or prefetch-queue effects) — useful to compare
        programs, not a cycle-accurate hardware model.
      </p>
    </div>
  )
}
