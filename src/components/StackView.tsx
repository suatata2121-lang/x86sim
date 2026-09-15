import { useMemo } from 'react'
import type { DataDeclaration } from '../core/types'
import { bandHeight, computeSegments } from '../core/segments'

const DATA_MIN = 16
const DATA_MAX = 70
const DATA_DIVISOR = 6
const STACK_MIN = 16
const STACK_MAX = 110
const STACK_DIVISOR = 2
const FREE_MIN = 24
const FREE_TARGET_TOTAL = 160

const BAR_WIDTH = 90
const LABEL_WIDTH = 70
const TOTAL_WIDTH = BAR_WIDTH + LABEL_WIDTH * 2
const BAR_X = LABEL_WIDTH

function hex(n: number) {
  return n.toString(16).toUpperCase().padStart(4, '0') + 'h'
}

export function StackView({
  memory,
  data,
  sp,
  bp,
  lastInstructionMnemonic,
  steps,
}: {
  memory: Uint8Array
  data: DataDeclaration[]
  sp: number
  bp: number
  lastInstructionMnemonic: string | null
  steps: number
}) {
  const seg = useMemo(() => computeSegments(data, sp), [data, sp])
  const dataBytes = seg.dataEnd - seg.dataStart
  const stackBytes = seg.stackEnd - seg.stackStart

  const dataH = bandHeight(dataBytes, DATA_MIN, DATA_MAX, DATA_DIVISOR)
  const stackH = bandHeight(stackBytes, STACK_MIN, STACK_MAX, STACK_DIVISOR)
  const freeH = Math.max(FREE_MIN, FREE_TARGET_TOTAL - dataH - stackH)

  const dataY = 0
  const freeY = dataH
  const stackY = dataH + freeH
  const totalH = dataH + freeH + stackH

  const isPush = lastInstructionMnemonic === 'PUSH' || lastInstructionMnemonic === 'CALL'
  const isPop = lastInstructionMnemonic === 'POP' || lastInstructionMnemonic === 'RET'

  const bpInStack = stackBytes > 0 && bp >= seg.stackStart && bp < seg.stackEnd
  const bpFraction = stackBytes > 0 ? (seg.stackEnd - bp) / stackBytes : 0
  const bpY = stackY + Math.min(stackH, Math.max(0, bpFraction * stackH))

  const hasTopWord = sp <= 0xfffe
  const topWord = hasTopWord ? memory[sp] | (memory[(sp + 1) & 0xffff] << 8) : null

  return (
    <div className="panel">
      <h3>Stack / Heap / Data</h3>
      <svg viewBox={`0 0 ${TOTAL_WIDTH} ${totalH + 16}`} className="stack-diagram">
        {dataH > 0 && (
          <>
            <rect x={BAR_X} y={dataY} width={BAR_WIDTH} height={dataH} className="seg-band seg-data" />
            <text x={BAR_X - 4} y={dataY + 11} className="seg-label seg-label-end">0000h</text>
            <text x={BAR_X + BAR_WIDTH + 4} y={dataY + dataH / 2 + 3} className="seg-label">DATA</text>
          </>
        )}

        <rect x={BAR_X} y={freeY} width={BAR_WIDTH} height={freeH} className="seg-band seg-free" />
        {dataH > 0 && (
          <text x={BAR_X - 4} y={freeY + 10} className="seg-label seg-label-end">{hex(seg.dataEnd)}</text>
        )}
        <text x={BAR_X + BAR_WIDTH + 4} y={freeY + freeH / 2 + 3} className="seg-label">FREE</text>

        <rect x={BAR_X} y={stackY} width={BAR_WIDTH} height={stackH} className="seg-band seg-stack" />
        <text x={BAR_X - 4} y={stackY + 10} className="seg-label seg-label-end seg-label-sp">SP {hex(sp)}</text>
        <text x={BAR_X + BAR_WIDTH + 4} y={stackY + stackH / 2 + 3} className="seg-label">STACK</text>
        <text x={BAR_X - 4} y={totalH + 12} className="seg-label seg-label-end">FFFFh</text>

        {bpInStack && (
          <>
            <line x1={BAR_X - 2} y1={bpY} x2={BAR_X + BAR_WIDTH + 2} y2={bpY} className="seg-bp-line" />
            <text x={BAR_X + BAR_WIDTH + 4} y={bpY - 3} className="seg-label seg-label-bp">BP {hex(bp)}</text>
          </>
        )}

        {isPush && (
          <circle key={`push-${steps}`} cx={BAR_X + BAR_WIDTH / 2} cy={stackY} r="5" className="seg-flash seg-flash-push" />
        )}
        {isPop && (
          <circle key={`pop-${steps}`} cx={BAR_X + BAR_WIDTH / 2} cy={stackY} r="5" className="seg-flash seg-flash-pop" />
        )}
      </svg>
      <p className="status stack-detail">
        {topWord !== null ? `Top of stack (word @ SP): ${hex(topWord)}` : 'Stack empty'}
      </p>
    </div>
  )
}
