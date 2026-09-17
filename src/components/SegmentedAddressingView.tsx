// A static, purely illustrative diagram for the "Segmented Addressing vs
// This Simulator's Flat Model" topic -- there's nothing to step through here
// (this simulator never actually does this math), so unlike the other
// Hardware topics this has no Cpu/HardwarePlayground behind it at all, just
// a worked example of the arithmetic a real 8086 performs on every memory
// access, contrasted with the single 16-bit offset this simulator uses.
//
// Laid out as a single centered column (rather than side-by-side boxes) so
// it never depends on precise horizontal spacing -- only generous vertical
// gaps, which stay safe at any width the panel is stretched to.
const CX = 150
const BOX_W = 110

function Box({ y, wide, cpu }: { y: number; wide?: boolean; cpu?: boolean }) {
  const w = wide ? 140 : BOX_W
  const x = CX - w / 2
  return <rect x={x} y={y} width={w} height="40" rx="6" className={cpu ? 'bus-box bus-box-cpu' : 'bus-box'} />
}

export function SegmentedAddressingView() {
  return (
    <div className="panel">
      <h3>Segment:Offset vs Flat Addressing</h3>
      <svg viewBox="0 0 300 585" className="bus-diagram seg-diagram">
        <text x={CX} y="14" className="bus-label bus-label-title seg-center">REAL 8086:</text>
        <text x={CX} y="28" className="bus-label bus-label-title seg-center">SEGMENT × 16 + OFFSET</text>

        <text x={CX} y="44" className="bus-lane-label seg-center">SEGMENT</text>
        <Box y={50} />
        <text x={CX} y="75" className="hw-eq-value">1234h</text>

        <text x={CX} y="112" className="hw-eq-op">× 16</text>
        <text x={CX} y="126" className="bus-lane-label seg-center">(shift left 4 bits)</text>

        <text x={CX} y="142" className="bus-lane-label seg-center">SHIFTED</text>
        <Box y={148} />
        <text x={CX} y="173" className="hw-eq-value">12340h</text>

        <text x={CX} y="206" className="hw-eq-op">+</text>

        <text x={CX} y="222" className="bus-lane-label seg-center">OFFSET</text>
        <Box y={228} />
        <text x={CX} y="253" className="hw-eq-value">0056h</text>

        <line x1={CX - 55} y1="282" x2={CX + 55} y2="282" className="bus-line" />

        <text x={CX} y="300" className="hw-eq-op">=</text>

        <Box y={306} wide cpu />
        <text x={CX} y="331" className="hw-eq-value">12396h</text>
        <text x={CX} y="358" className="bus-lane-label seg-center">20-bit physical address</text>
        <text x={CX} y="370" className="bus-lane-label seg-center">up to FFFFFh (1MB)</text>

        <text x={CX} y="404" className="bus-label bus-label-title seg-center">THIS SIMULATOR:</text>
        <text x={CX} y="418" className="bus-label bus-label-title seg-center">FLAT MODEL (no segment)</text>

        <text x={CX} y="434" className="bus-lane-label seg-center">OFFSET</text>
        <Box y={440} />
        <text x={CX} y="465" className="hw-eq-value">0056h</text>

        <text x={CX} y="498" className="hw-eq-op">=</text>

        <text x={CX} y="514" className="bus-lane-label seg-center">ADDRESS</text>
        <Box y={520} cpu />
        <text x={CX} y="545" className="hw-eq-value">0056h</text>
        <text x={CX} y="572" className="bus-lane-label seg-center">16-bit address, up to FFFFh (64KB)</text>
      </svg>
    </div>
  )
}
