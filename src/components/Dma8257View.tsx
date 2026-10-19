// Block diagram of the 8257 DMA controller (issue #38). Illustration only:
// the simulator has no DMA (see core/biuEu.ts), so nothing here runs.
import { Box } from './Ppi8255Views'

const CHANNELS = [0, 1, 2, 3]

export function Dma8257Diagram() {
  return (
    <div className="panel mb-arch">
      <figure className="mb-arch-fig ppi-block-fig">
        <svg viewBox="0 0 420 225" role="img" aria-label="8257 block diagram: data bus buffer, read/write logic and control logic with mode register on an internal bus, four channels with DRQ and DACK lines, and a priority resolver">
          <Box x={10} y={12} w={115} h={42} title="Data bus buffer" sub="D7–D0" className="mb-cpu" />
          <Box x={10} y={72} w={115} h={50} title="Read/write logic" sub="IOR̅ IOW̅ A0–A7 CS̅ CLK" className="mb-cpu" />
          {/* Four lines of text, so laid out by hand instead of with Box. */}
          <rect className="mb-box mb-cpu" x={10} y={140} width={115} height={78} rx={5} />
          <text className="mb-label" x={67} y={157}>Control logic</text>
          <text className="mb-small" x={67} y={170}>& mode register</text>
          <text className="mb-small" x={67} y={192}>HRQ HLDA AEN ADSTB</text>
          <text className="mb-small" x={67} y={206}>MEMR̅ MEMW̅ TC MARK</text>
          <line className="mb-bus" x1={145} y1={22} x2={145} y2={198} />
          <line className="mb-bus" x1={125} y1={33} x2={145} y2={33} />
          <line className="mb-bus" x1={125} y1={97} x2={145} y2={97} />
          <line className="mb-bus" x1={125} y1={179} x2={145} y2={179} />
          {CHANNELS.map((n) => {
            const y = 8 + n * 54
            return (
              <g key={n}>
                <line className="mb-bus" x1={145} y1={y + 21} x2={165} y2={y + 21} />
                <Box x={165} y={y} w={120} h={42} title={`Channel ${n}`} sub={`DRQ${n} in · DACK̅${n} out`} className="mb-mem" />
                <line className="mb-bus mb-bus-alt" x1={285} y1={y + 21} x2={310} y2={112} />
              </g>
            )
          })}
          <Box x={310} y={80} w={100} h={64} title="Priority" sub="resolver" className="mb-mem-alt" />
        </svg>
        <figcaption>8257: four channels on the internal bus, each with its own request (DRQ) and acknowledge (DACK̅)</figcaption>
      </figure>
    </div>
  )
}
