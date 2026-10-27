import { useState } from 'react'
import { DATA_START } from '../core/assembler'

const ROWS = 16
const COLS = 16
const PAGE_SIZE = ROWS * COLS

type SegName = 'CS' | 'DS' | 'SS' | 'ES'

// Addresses are shown as 5-digit physical addresses, like on the real 8086
// (admin notes 27.10.2026); a jump can also be typed as a logical address,
// segment:offset, where the segment is hex or a segment register.
function parseNumber(t: string): number | null {
  if (/^[0-9a-f]+h$/i.test(t)) return parseInt(t.slice(0, -1), 16)
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16)
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10)
  return null
}

type Jump = { physical: number; logical: string | null } | { error: string }

function parseAddress(text: string, segments: Record<SegName, number>): Jump {
  const t = text.trim()
  const m = t.match(/^([^:]+):([^:]+)$/)
  if (m) {
    const segText = m[1].trim().toUpperCase()
    // A logical address is written in hex, with or without the h.
    const hexOrH = (x: string) => (/^[0-9a-f]+$/i.test(x) ? parseInt(x, 16) : parseNumber(x))
    const seg = segText in segments ? segments[segText as SegName] : hexOrH(m[1].trim())
    const off = hexOrH(m[2].trim())
    if (seg === null || off === null || seg > 0xffff || off > 0xffff) {
      return { error: `"${t}" is not a logical address: write segment:offset in hex, e.g. 0000:0100 or DS:0100.` }
    }
    const physical = seg * 16 + off
    return { physical, logical: `${toHex(seg, 4)}:${toHex(off, 4)}` }
  }
  const physical = parseNumber(t)
  if (physical === null) return { error: `Invalid address: "${t}"` }
  return { physical, logical: null }
}

function toHex(n: number, digits: number) {
  return n.toString(16).toUpperCase().padStart(digits, '0')
}

function toAscii(byte: number) {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

export function MemoryView({
  memory,
  dataLabels,
  sp,
  segments,
}: {
  memory: Uint8Array
  dataLabels: Map<string, { address: number; length: number }>
  sp: number
  /** CS/DS/SS/ES, for jumps like DS:0100. */
  segments: Record<SegName, number>
}) {
  // Open on the program's data, above the interrupt vector table.
  const [base, setBase] = useState(DATA_START)
  const [jumpText, setJumpText] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)
  // "0000:0100 = physical 00100h" after a logical jump, so the conversion is visible.
  const [jumpNote, setJumpNote] = useState<string | null>(null)

  function clampBase(addr: number) {
    return Math.max(0, Math.min(addr, 0x10000 - PAGE_SIZE))
  }

  function gotoAddress(addr: number) {
    setBase(clampBase(Math.floor(addr / COLS) * COLS))
  }

  function handleJump() {
    const jump = parseAddress(jumpText, segments)
    setJumpNote(null)
    if ('error' in jump) {
      setJumpError(jump.error)
      return
    }
    if (jump.physical > 0xffff) {
      setJumpError(`${toHex(jump.physical, 5)}h is outside this simulator's memory, which is a flat 64 KB (00000h to 0FFFFh).`)
      return
    }
    setJumpError(null)
    if (jump.logical) setJumpNote(`${jump.logical} = physical ${toHex(jump.physical, 5)}h`)
    gotoAddress(jump.physical)
  }

  const labelAt = (addr: number) => {
    for (const [name, info] of dataLabels) {
      if (addr >= info.address && addr < info.address + info.length) return name
    }
    return null
  }

  const rows = Array.from({ length: ROWS }, (_, r) => base + r * COLS)

  return (
    <div className="panel">
      <h3>Memory</h3>
      <div className="mem-toolbar">
        <button onClick={() => setBase(clampBase(base - PAGE_SIZE))}>◀ Prev</button>
        <button onClick={() => setBase(clampBase(base + PAGE_SIZE))}>Next ▶</button>
        <button onClick={() => gotoAddress(sp)}>Go to SP</button>
        <input
          className="mem-jump-input"
          placeholder="00100h or 0000:0100"
          title="A physical address (00100h) or a logical one, segment:offset (0000:0100 or DS:0100)"
          value={jumpText}
          onChange={(e) => { setJumpText(e.target.value); setJumpError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleJump() }}
        />
        <button onClick={handleJump}>Go</button>
      </div>
      {jumpError && <p className="status error">{jumpError}</p>}
      {jumpNote && !jumpError && <p className="status">{jumpNote}</p>}
      {dataLabels.size > 0 && (
        <div className="mem-labels">
          {[...dataLabels.entries()].map(([name, info]) => (
            <button key={name} className="mem-label-btn" onClick={() => gotoAddress(info.address)}>
              {name} @ {toHex(info.address, 5)}h
            </button>
          ))}
        </div>
      )}
      <div className="mem-table-wrap">
        <table className="mem-table">
          <thead>
            <tr>
              <th>Address</th>
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c}>{toHex(c, 1)}</th>
              ))}
              <th>ASCII</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rowAddr) => (
              <tr key={rowAddr}>
                <td className="mem-addr">{toHex(rowAddr, 5)}h</td>
                {Array.from({ length: COLS }, (_, c) => {
                  const addr = rowAddr + c
                  const label = labelAt(addr)
                  const classes = ['mem-byte']
                  if (addr === sp) classes.push('mem-sp')
                  if (label) classes.push('mem-data')
                  return (
                    <td
                      key={c}
                      className={classes.join(' ')}
                      // Memory is flat (segment 0), so 0000:offset names the same byte.
                      title={`Physical ${toHex(addr, 5)}h · logical 0000:${toHex(addr, 4)}${label ? ` · ${label}` : ''}`}
                    >
                      {toHex(memory[addr], 2)}
                    </td>
                  )
                })}
                <td className="mem-ascii">
                  {Array.from({ length: COLS }, (_, c) => toAscii(memory[rowAddr + c])).join('')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
