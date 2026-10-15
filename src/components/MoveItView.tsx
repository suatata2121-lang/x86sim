import { useState } from 'react'
import { assemble } from '../core/assembler'
import { Cpu } from '../core/cpu'
import type { Reg16, RegName } from '../core/types'

// "Move It" (issue #25): five small MOV/XCHG challenges on the Moving Data
// page. A student's lines go through the real assembler, so a broken rule
// comes back as the assembler's own message, then run in a throwaway Cpu
// from the card's starting registers.

interface Challenge {
  title: string
  start: Partial<Record<Reg16, number>>
  goal: Partial<Record<Reg16, number>>
  maxLines: number
  /** Extra condition on the instructions, with the text shown when it's broken. */
  rule?: { text: string; check: (destinations: string[]) => boolean }
  hint: string
}

const BYTE_REGS = new Set(['AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH'])

const CHALLENGES: Challenge[] = [
  { title: 'Copy BX into CX.', start: { BX: 0x00ab }, goal: { CX: 0x00ab, BX: 0x00ab }, maxLines: 1,
    hint: 'MOV copies from its second operand into its first.' },
  { title: 'Put 200 into DL without changing DH.', start: { DX: 0x7700 }, goal: { DX: 0x77c8 }, maxLines: 1,
    hint: 'Write only the low half of DX.' },
  { title: 'Copy the high byte of AX into BL.', start: { AX: 0x1234 }, goal: { BX: 0x0012, AX: 0x1234 }, maxLines: 1,
    hint: 'The high byte of AX is AH.' },
  { title: 'Swap AX and DX with one instruction.', start: { AX: 0x1111, DX: 0x2222 }, goal: { AX: 0x2222, DX: 0x1111 },
    maxLines: 1, hint: 'There is an instruction that swaps two registers.' },
  { title: 'Make AX = 0ABCDh using only 8-bit registers as destinations.', start: { AX: 0x0000 }, goal: { AX: 0xabcd },
    maxLines: 2, hint: 'Write AH and AL separately.',
    rule: { text: 'Every destination must be an 8-bit register.', check: (dests) => dests.every((d) => BYTE_REGS.has(d)) } },
]

const hex = (v: number) => `${v.toString(16).toUpperCase().padStart(4, '0')}h`

type Outcome =
  | { kind: 'error'; message: string }
  | { kind: 'ran'; before: Record<string, number>; after: Record<string, number>; mismatch: string | null }

function check(c: Challenge, code: string): Outcome {
  const { instructions, data, errors } = assemble(code)
  if (errors.length > 0) return { kind: 'error', message: `Line ${errors[0].line}: ${errors[0].message}` }
  if (instructions.length === 0) return { kind: 'error', message: 'Write at least one instruction.' }
  if (instructions.length > c.maxLines) {
    return { kind: 'error', message: `Use at most ${c.maxLines} instruction${c.maxLines === 1 ? '' : 's'}.` }
  }
  const dests = instructions.map((i) => (i.ops[0]?.kind === 'reg' ? i.ops[0].name : '[memory]'))
  if (c.rule && !c.rule.check(dests)) return { kind: 'error', message: c.rule.text }

  const cpu = new Cpu()
  cpu.load(instructions, data)
  for (const [reg, value] of Object.entries(c.start)) cpu.setReg(reg as RegName, value)
  const shown = [...new Set([...Object.keys(c.start), ...Object.keys(c.goal)])] as Reg16[]
  const before = Object.fromEntries(shown.map((r) => [r, cpu.getReg(r)]))
  try {
    cpu.run(1000)
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
  const after = Object.fromEntries(shown.map((r) => [r, cpu.getReg(r)]))
  const wrong = Object.entries(c.goal).find(([r, v]) => after[r] !== v)
  return {
    kind: 'ran', before, after,
    mismatch: wrong ? `Not yet: ${wrong[0]} is ${hex(after[wrong[0]])}, the goal is ${hex(wrong[1])}.` : null,
  }
}

function ChallengeCard({ n, c, solvedBefore, onSolved }: { n: number; c: Challenge; solvedBefore: boolean; onSolved: () => void }) {
  const [code, setCode] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [misses, setMisses] = useState(0)
  const solvedNow = outcome?.kind === 'ran' && !outcome.mismatch
  const solved = solvedBefore || solvedNow

  function handleCheck() {
    const result = check(c, code)
    setOutcome(result)
    if (result.kind === 'ran' && !result.mismatch) onSolved()
    else setMisses((m) => m + 1)
  }

  const regs = Object.keys({ ...c.start, ...c.goal }) as Reg16[]
  return (
    <li className={`moveit-card${solved ? ' solved' : ''}`}>
      <p className="moveit-title"><strong>{n}.</strong> {c.title} {solved && <span className="admin-badge passed">Solved!</span>}</p>
      <p className="moveit-regs">
        Start: {regs.filter((r) => r in c.start).map((r) => `${r} = ${hex(c.start[r]!)}`).join(', ')}
        {' · '}Goal: {Object.entries(c.goal).map(([r, v]) => `${r} = ${hex(v)}`).join(', ')}
        {' · '}At most {c.maxLines} line{c.maxLines === 1 ? '' : 's'}
        {c.rule && <> · {c.rule.text}</>}
      </p>
      <div className="moveit-input">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={c.maxLines}
          spellCheck={false}
          aria-label={`Your instruction(s) for challenge ${n}`}
          placeholder={c.maxLines === 1 ? 'one instruction' : 'one instruction per line'}
        />
        <button onClick={handleCheck} disabled={!code.trim()}>Check</button>
      </div>
      {outcome?.kind === 'error' && <p className="moveit-error">{outcome.message}</p>}
      {outcome?.kind === 'ran' && (
        <>
          <table className="moveit-table">
            <thead><tr><th></th>{regs.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              <tr><td>before</td>{regs.map((r) => <td key={r}>{hex(outcome.before[r])}</td>)}</tr>
              <tr>
                <td>after</td>
                {regs.map((r) => (
                  <td key={r} className={outcome.after[r] !== outcome.before[r] ? 'changed' : undefined}>{hex(outcome.after[r])}</td>
                ))}
              </tr>
            </tbody>
          </table>
          {outcome.mismatch && <p className="moveit-error">{outcome.mismatch}</p>}
        </>
      )}
      {!solved && misses >= 2 && <p className="moveit-hint">Hint: {c.hint}</p>}
    </li>
  )
}

/** `solved` holds the item ids already recorded (move-it-1 … move-it-5). */
export function MoveItView({ solved, onSolved }: { solved?: Set<string>; onSolved?: (itemId: string) => void }) {
  const [solvedHere, setSolvedHere] = useState<Set<string>>(new Set())
  const isSolved = (id: string) => !!solved?.has(id) || solvedHere.has(id)
  const all = CHALLENGES.every((_, i) => isSolved(`move-it-${i + 1}`))
  return (
    <div className="panel moveit">
      <h3>Move It</h3>
      <ol className="moveit-list">
        {CHALLENGES.map((c, i) => {
          const id = `move-it-${i + 1}`
          return (
            <ChallengeCard
              key={id}
              n={i + 1}
              c={c}
              solvedBefore={isSolved(id)}
              onSolved={() => {
                setSolvedHere((prev) => new Set(prev).add(id))
                onSolved?.(id)
              }}
            />
          )
        })}
      </ol>
      {all && <p className="quiz-score pass">All five solved. You can move on to the next item on your checklist.</p>}
    </div>
  )
}
