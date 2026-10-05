// Interactive 8086 bus-cycle timing diagram (minimum mode). The cycle type
// picks which signals are asserted in each T state; the stepper highlights one
// T state at a time and explains what the processor does in it. Values follow
// the Microprocessors course slides (Question 1 and 2 timing analysis).
import { useState } from 'react'

type CycleKind = 'mem-read' | 'mem-write' | 'io-read' | 'io-write'

// Level rows: true = high, false = low (active-low signals are drawn low while asserted).
// Text rows: a label per T state.
type Row =
  | { name: string; kind: 'level'; values: boolean[] }
  | { name: string; kind: 'text'; values: string[] }

const CYCLES: Record<CycleKind, { title: string; rows: Row[]; captions: string[] }> = {
  'mem-read': {
    title: 'Memory Read (minimum mode)',
    rows: [
      { name: 'ALE', kind: 'level', values: [true, false, false, false] },
      { name: 'M/IO̅', kind: 'level', values: [true, true, true, true] },
      { name: 'AD15–AD0', kind: 'text', values: ['Address', 'Hi-Z', 'Data in', 'Hi-Z'] },
      { name: 'A19–S3', kind: 'text', values: ['Address', 'Status', 'Status', 'Status'] },
      { name: 'DT/R̅', kind: 'level', values: [false, false, false, false] },
      { name: 'RD̅', kind: 'level', values: [true, false, false, true] },
      { name: 'DEN̅', kind: 'level', values: [true, false, false, true] },
    ],
    captions: [
      'T1 – The 20-bit address goes onto A19–A16 and AD15–AD0 with BHE̅. ALE pulses high so external latches capture it on its falling edge. DT/R̅ goes low: the transceivers face the receive direction.',
      'T2 – AD15–AD0 float (high-Z) so memory can drive them: the bus turns around from address output to data input. The upper lines carry status. RD̅ and DEN̅ go low.',
      'T3 – READY is sampled. If it is low, wait states (Tw) are inserted. Memory places the data on AD15–AD0.',
      'T4 – The CPU reads the data at the start of T4. RD̅ and DEN̅ return high and the bus is released for the next cycle.',
    ],
  },
  'mem-write': {
    title: 'Memory Write (minimum mode)',
    rows: [
      { name: 'ALE', kind: 'level', values: [true, false, false, false] },
      { name: 'M/IO̅', kind: 'level', values: [true, true, true, true] },
      { name: 'AD15–AD0', kind: 'text', values: ['Address', 'Data out', 'Data out', 'Hi-Z'] },
      { name: 'A19–S3', kind: 'text', values: ['Address', 'Status', 'Status', 'Status'] },
      { name: 'DT/R̅', kind: 'level', values: [true, true, true, true] },
      { name: 'WR̅', kind: 'level', values: [true, false, false, true] },
      { name: 'DEN̅', kind: 'level', values: [true, false, false, true] },
    ],
    captions: [
      'T1 – Identical to a read: the address is output and latched via ALE. DT/R̅ goes high, so the transceivers face the transmit direction.',
      'T2 – This is where the processor starts driving the data onto AD15–AD0. WR̅ and DEN̅ go low to enable the transceivers.',
      'T3 – READY is sampled and wait states are inserted if needed. Memory uses this time to store the data.',
      'T4 – WR̅ returns high. Its rising edge is where memory typically latches the data. The CPU holds the data a little longer (hold time), then releases the bus and DEN̅ goes high.',
    ],
  },
  'io-read': {
    title: 'I/O Read (minimum mode)',
    rows: [
      { name: 'ALE', kind: 'level', values: [true, false, false, false] },
      { name: 'M/IO̅', kind: 'level', values: [false, false, false, false] },
      { name: 'AD15–AD0', kind: 'text', values: ['Port', 'Hi-Z', 'Data in', 'Hi-Z'] },
      { name: 'DT/R̅', kind: 'level', values: [false, false, false, false] },
      { name: 'RD̅', kind: 'level', values: [true, false, false, true] },
      { name: 'DEN̅', kind: 'level', values: [true, false, false, true] },
    ],
    captions: [
      'T1 – The port number goes out on AD15–AD0 (the upper lines carry zeros for an 8-bit port). M/IO̅ is low: this is an I/O cycle, not a memory one. ALE latches the port number.',
      'T2 – AD lines float so the device can drive the data. RD̅ goes low to start the read.',
      'T3 – READY is sampled. The addressed port drives its byte or word onto AD15–AD0.',
      'T4 – The CPU reads the value at the start of T4. RD̅ and DEN̅ go high and the bus is released.',
    ],
  },
  'io-write': {
    title: 'I/O Write (minimum mode)',
    rows: [
      { name: 'ALE', kind: 'level', values: [true, false, false, false] },
      { name: 'M/IO̅', kind: 'level', values: [false, false, false, false] },
      { name: 'AD15–AD0', kind: 'text', values: ['Port', 'Data out', 'Data out', 'Hi-Z'] },
      { name: 'DT/R̅', kind: 'level', values: [true, true, true, true] },
      { name: 'WR̅', kind: 'level', values: [true, false, false, true] },
      { name: 'DEN̅', kind: 'level', values: [true, false, false, true] },
    ],
    captions: [
      'T1 – The port number is output and latched via ALE. M/IO̅ is low, marking an I/O cycle. DT/R̅ is high for transmit.',
      'T2 – The data is driven onto AD15–AD0. WR̅ and DEN̅ go low.',
      'T3 – READY is sampled and wait states are inserted if the device is slow. The port accepts the data.',
      'T4 – WR̅ returns high, DEN̅ goes high, and the bus is released.',
    ],
  },
}

const T_LABELS = ['T1', 'T2', 'T3', 'T4']

export function TimingDiagramView() {
  const [kind, setKind] = useState<CycleKind>('mem-read')
  const [t, setT] = useState(0)
  const cycle = CYCLES[kind]

  function pick(next: CycleKind) {
    setKind(next)
    setT(0)
  }

  return (
    <div className="panel timing-panel">
      <h3>{cycle.title}</h3>
      <div className="timing-picker">
        {(Object.keys(CYCLES) as CycleKind[]).map((k) => (
          <button key={k} className={k === kind ? 'timing-btn active' : 'timing-btn'} onClick={() => pick(k)}>
            {CYCLES[k].title.split(' (')[0]}
          </button>
        ))}
      </div>

      <table className="timing-table">
        <thead>
          <tr>
            <th>Signal</th>
            {T_LABELS.map((label, i) => (
              <th key={label} className={i === t ? 'timing-col-active' : undefined}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CLK</td>
            {T_LABELS.map((label, i) => (
              <td key={label} className={i === t ? 'timing-col-active' : undefined}>
                <span className={i <= t ? 'timing-clk on' : 'timing-clk'}>{i % 2 === 0 ? '⎍' : '⎴'}</span>
              </td>
            ))}
          </tr>
          {cycle.rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              {T_LABELS.map((label, i) => {
                const active = i === t
                if (row.kind === 'level') {
                  const high = row.values[i]
                  return (
                    <td key={label} className={active ? 'timing-col-active' : undefined}>
                      <span className={high ? 'timing-level high' : 'timing-level low'}>{high ? '▔' : '▁'}</span>
                    </td>
                  )
                }
                return (
                  <td key={label} className={active ? 'timing-col-active' : undefined}>
                    <span className="timing-text">{row.values[i]}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="timing-controls">
        <button onClick={() => setT((x) => Math.max(0, x - 1))} disabled={t === 0}>◀ Back</button>
        <span>{T_LABELS[t]}</span>
        <button onClick={() => setT((x) => Math.min(3, x + 1))} disabled={t === 3}>Next ▶</button>
      </div>
      <p className="example-description timing-caption">{cycle.captions[t]}</p>
      <p className="example-description">
        Active-low signals (names ending in ̅) are asserted, that is drawn low, while the bus cycle needs them.
      </p>
    </div>
  )
}
