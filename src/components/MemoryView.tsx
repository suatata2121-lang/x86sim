import { useState } from 'react'

const ROWS = 16
const COLS = 16
const PAGE_SIZE = ROWS * COLS

function parseAddress(text: string): number | null {
  const t = text.trim()
  if (/^[0-9a-f]+h$/i.test(t)) return parseInt(t.slice(0, -1), 16) & 0xffff
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16) & 0xffff
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10) & 0xffff
  return null
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
}: {
  memory: Uint8Array
  dataLabels: Map<string, { address: number; length: number }>
  sp: number
}) {
  const [base, setBase] = useState(0)
  const [jumpText, setJumpText] = useState('')
  const [jumpError, setJumpError] = useState(false)

  function clampBase(addr: number) {
    return Math.max(0, Math.min(addr, 0x10000 - PAGE_SIZE))
  }

  function gotoAddress(addr: number) {
    setBase(clampBase(Math.floor(addr / COLS) * COLS))
  }

  function handleJump() {
    const addr = parseAddress(jumpText)
    if (addr === null) {
      setJumpError(true)
      return
    }
    setJumpError(false)
    gotoAddress(addr)
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
      <h3>Bellek</h3>
      <div className="mem-toolbar">
        <button onClick={() => setBase(clampBase(base - PAGE_SIZE))}>◀ Önceki</button>
        <button onClick={() => setBase(clampBase(base + PAGE_SIZE))}>Sonraki ▶</button>
        <button onClick={() => gotoAddress(sp)}>SP'ye git</button>
        <input
          className="mem-jump-input"
          placeholder="adres (örn. 100h)"
          value={jumpText}
          onChange={(e) => { setJumpText(e.target.value); setJumpError(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleJump() }}
        />
        <button onClick={handleJump}>Git</button>
      </div>
      {jumpError && <p className="status error">Geçersiz adres: "{jumpText}"</p>}
      {dataLabels.size > 0 && (
        <div className="mem-labels">
          {[...dataLabels.entries()].map(([name, info]) => (
            <button key={name} className="mem-label-btn" onClick={() => gotoAddress(info.address)}>
              {name} @ {toHex(info.address, 4)}h
            </button>
          ))}
        </div>
      )}
      <div className="mem-table-wrap">
        <table className="mem-table">
          <thead>
            <tr>
              <th>Adres</th>
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c}>{toHex(c, 1)}</th>
              ))}
              <th>ASCII</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rowAddr) => (
              <tr key={rowAddr}>
                <td className="mem-addr">{toHex(rowAddr, 4)}h</td>
                {Array.from({ length: COLS }, (_, c) => {
                  const addr = rowAddr + c
                  const label = labelAt(addr)
                  const classes = ['mem-byte']
                  if (addr === sp) classes.push('mem-sp')
                  if (label) classes.push('mem-data')
                  return (
                    <td key={c} className={classes.join(' ')} title={label ?? undefined}>
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
