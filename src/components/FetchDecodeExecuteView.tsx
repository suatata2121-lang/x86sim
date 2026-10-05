// Step-by-step view of one instruction going through the fetch-decode-execute
// cycle. One fixed example (ADD AX, BX) so the focus stays on what each phase
// does rather than on the program. The addresses and values are illustrative.
import { useState } from 'react'

const STAGES = [
  {
    name: 'Fetch',
    where: 'BIU reads the bytes at CS:IP from memory into the instruction queue, then the instruction is handed to the EU.',
    state: [
      ['IP', '0100h  (points at the instruction)'],
      ['Memory at 0100h', 'ADD AX, BX'],
      ['Instruction register', 'ADD AX, BX'],
    ],
  },
  {
    name: 'Decode',
    where: 'The control unit reads the opcode, works out that this is an addition, and finds both operands: AX as the destination and BX as the source.',
    state: [
      ['Operation', 'ADD (arithmetic)'],
      ['Destination', 'AX'],
      ['Source', 'BX'],
    ],
  },
  {
    name: 'Execute',
    where: 'The ALU adds AX and BX, writes the sum back to AX, and updates the flags. IP moves on to the next instruction.',
    state: [
      ['AX before', '5'],
      ['BX', '3'],
      ['AX after', '8   (ZF=0, SF=0, CF=0)'],
      ['IP', '0103h  (the next instruction)'],
    ],
  },
]

export function FetchDecodeExecuteView() {
  const [stage, setStage] = useState(0)
  const current = STAGES[stage]

  return (
    <div className="panel fde-panel">
      <h3>One instruction, three phases</h3>
      <div className="fde-stages">
        {STAGES.map((s, i) => (
          <button
            key={s.name}
            className={i === stage ? 'fde-stage active' : i < stage ? 'fde-stage done' : 'fde-stage'}
            onClick={() => setStage(i)}
          >
            {i + 1}. {s.name}
          </button>
        ))}
      </div>

      <p className="example-description fde-where">{current.where}</p>

      <table className="fde-state">
        <tbody>
          {current.state.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fde-controls">
        <button onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0}>◀ Back</button>
        <button onClick={() => setStage((s) => Math.min(STAGES.length - 1, s + 1))} disabled={stage === STAGES.length - 1}>
          Next ▶
        </button>
      </div>
      <p className="example-description">
        The cycle repeats for every instruction: fetch the next one, decode it, execute it. The addresses and
        values here are illustrative.
      </p>
    </div>
  )
}
