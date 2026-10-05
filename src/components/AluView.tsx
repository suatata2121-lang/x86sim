// Interactive ALU: pick an operation and two byte values, and see the result
// and the flags it leaves behind. The result comes from the real simulator
// (assembled and run on a tiny program), so it always matches the Cpu.
import { useMemo, useState } from 'react'
import { assemble } from '../core/assembler'
import { Cpu } from '../core/cpu'

const OPS = ['ADD', 'SUB', 'AND', 'OR', 'XOR'] as const
type Op = (typeof OPS)[number]

const EXPLAIN: Record<Op, string> = {
  ADD: 'Adds the two bytes. A result above 255 wraps around and sets CF.',
  SUB: 'Subtracts B from A. A result below 0 wraps around and sets CF (a borrow).',
  AND: 'Keeps only the bits that are 1 in both A and B.',
  OR: 'Sets a bit whenever it is 1 in either A or B.',
  XOR: 'Sets a bit only where A and B differ. XOR of a value with itself is always 0.',
}

function hex8(v: number) {
  return v.toString(16).toUpperCase().padStart(2, '0') + 'h'
}

function bin8(v: number) {
  return v.toString(2).padStart(8, '0')
}

function run(op: Op, a: number, b: number) {
  const source = `MOV AL, ${a}\nMOV BL, ${b}\n${op} AL, BL\nHLT\n`
  const { instructions, data, errors } = assemble(source)
  if (errors.length > 0) return null
  const cpu = new Cpu()
  cpu.load(instructions, data)
  cpu.run(100)
  return {
    result: cpu.getReg('AL'),
    flags: { ZF: cpu.flags.ZF, SF: cpu.flags.SF, CF: cpu.flags.CF, PF: cpu.flags.PF, OF: cpu.flags.OF },
  }
}

export function AluView() {
  const [op, setOp] = useState<Op>('ADD')
  const [a, setA] = useState(200)
  const [b, setB] = useState(100)

  const out = useMemo(() => run(op, a, b), [op, a, b])

  return (
    <div className="panel alu-panel">
      <h3>The ALU at work</h3>
      <div className="alu-ops">
        {OPS.map((o) => (
          <button key={o} className={o === op ? 'timing-btn active' : 'timing-btn'} onClick={() => setOp(o)}>
            {o}
          </button>
        ))}
      </div>

      <label className="seg-slider">
        <span>A</span>
        <input type="range" min={0} max={255} value={a} onChange={(e) => setA(Number(e.target.value))} />
        <code>{hex8(a)} · {bin8(a)}</code>
      </label>
      <label className="seg-slider">
        <span>B</span>
        <input type="range" min={0} max={255} value={b} onChange={(e) => setB(Number(e.target.value))} />
        <code>{hex8(b)} · {bin8(b)}</code>
      </label>

      {out && (
        <>
          <div className="alu-result">
            <span className="alu-result-label">Result</span>
            <code>{hex8(out.result)}</code>
            <span>{out.result} decimal · {bin8(out.result)} binary</span>
          </div>
          <div className="flags">
            {(Object.keys(out.flags) as (keyof typeof out.flags)[]).map((f) => (
              <span key={f} className={out.flags[f] ? 'flag on' : 'flag'}>
                {f}={out.flags[f] ? 1 : 0}
              </span>
            ))}
          </div>
        </>
      )}

      <p className="example-description">{EXPLAIN[op]}</p>
      <p className="example-description">
        The result and flags come from the simulator itself. Like the rest of this simulator, OF is not updated
        by ADD, SUB, AND, OR, or XOR here, so it stays 0 for these operations.
      </p>
    </div>
  )
}
