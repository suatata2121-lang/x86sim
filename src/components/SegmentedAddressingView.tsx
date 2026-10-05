// Interactive, compact illustration for the "Segmented Addressing vs This
// Simulator's Flat Model" topic. Two sliders set a segment and an offset; the
// real 8086's 20-bit physical address (segment × 16 + offset) is computed live
// next to this simulator's flat model, which only ever uses the offset.
import { useState } from 'react'

function hex(value: number, digits: number) {
  return value.toString(16).toUpperCase().padStart(digits, '0') + 'h'
}

export function SegmentedAddressingView() {
  const [segment, setSegment] = useState(0x1234)
  const [offset, setOffset] = useState(0x0056)

  const physical = segment * 16 + offset
  const overflows = physical > 0xfffff

  return (
    <div className="panel seg-interactive">
      <h3>Segment:Offset vs Flat Addressing</h3>

      <label className="seg-slider">
        <span>Segment</span>
        <input type="range" min={0} max={0xffff} value={segment} onChange={(e) => setSegment(Number(e.target.value))} />
        <code>{hex(segment, 4)}</code>
      </label>

      <label className="seg-slider">
        <span>Offset</span>
        <input type="range" min={0} max={0xffff} value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
        <code>{hex(offset, 4)}</code>
      </label>

      <div className="seg-compare">
        <div className="seg-column">
          <h4>Real 8086</h4>
          <p className="hw-eq-op">
            {hex(segment, 4)} × 16 + {hex(offset, 4)}
          </p>
          <p className="hw-eq-value">= {hex(physical & 0xfffff, 5)}</p>
          <p className="bus-lane-label">
            20-bit physical address{overflows ? ' (wraps past FFFFFh)' : ''}
          </p>
        </div>
        <div className="seg-column">
          <h4>This simulator</h4>
          <p className="hw-eq-op">offset only</p>
          <p className="hw-eq-value">= {hex(offset, 4)}</p>
          <p className="bus-lane-label">16-bit address, up to FFFFh (64KB)</p>
        </div>
      </div>

      <p className="example-description">
        Segment registers shift left 4 bits before adding, so the same physical address can be reached from
        many segment:offset pairs. This simulator has no segments, so every address is just one 16-bit offset.
      </p>
    </div>
  )
}
