import { useSyncExternalStore } from 'react'

// How register values are written (issue #29). One choice for the whole
// page: every register panel reads it from here, so switching it in one
// panel updates the others, and it is remembered in localStorage.

export type RegFormat = 'hex' | 'bin' | 'unsigned' | 'signed'

const STORAGE_KEY = 'x86sim.regFormat'
const FORMATS: { id: RegFormat; label: string; title?: string }[] = [
  { id: 'hex', label: 'Hex' },
  { id: 'bin', label: 'Bin' },
  { id: 'unsigned', label: 'Unsigned' },
  { id: 'signed', label: 'Signed', title: "Two's complement: 16-bit registers -32768…32767, 8-bit halves -128…127" },
]

function load(): RegFormat {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return FORMATS.some((f) => f.id === v) ? (v as RegFormat) : 'hex'
  } catch {
    return 'hex'
  }
}

let current: RegFormat = load()
const listeners = new Set<() => void>()

function setFormat(fmt: RegFormat) {
  current = fmt
  try {
    window.localStorage.setItem(STORAGE_KEY, fmt)
  } catch {
    // ignore (e.g. private browsing with storage disabled)
  }
  listeners.forEach((l) => l())
}

export function useRegisterFormat(): [RegFormat, (fmt: RegFormat) => void] {
  const fmt = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => current,
  )
  return [fmt, setFormat]
}

const bits = (v: number, n: number) => (v >>> 0).toString(2).padStart(n, '0').slice(-n)

/** A 16-bit register value. `plain` registers (segments, FLAGS) show hex when Signed is picked. */
export function formatWord(value: number, fmt: RegFormat, plain = false): string {
  const v = value & 0xffff
  if (fmt === 'bin') return `${bits(v >> 8, 8)} ${bits(v, 8)}b`
  if (fmt === 'unsigned') return String(v)
  if (fmt === 'signed' && !plain) return String(v >= 0x8000 ? v - 0x10000 : v)
  return `${v.toString(16).toUpperCase().padStart(4, '0')}h`
}

/** An 8-bit half (AH, AL, ...). */
export function formatByte(value: number, fmt: RegFormat): string {
  const v = value & 0xff
  if (fmt === 'bin') return `${bits(v, 8)}b`
  if (fmt === 'unsigned') return String(v)
  if (fmt === 'signed') return String(v >= 0x80 ? v - 0x100 : v)
  return `${v.toString(16).toUpperCase().padStart(2, '0')}h`
}

/** All four readings at once, for a value cell's hover text. */
export function allFormatsWord(value: number): string {
  return (['hex', 'bin', 'unsigned', 'signed'] as const)
    .map((f) => formatWord(value, f).replace(' ', ''))
    .join(' · ')
}

export function allFormatsByte(value: number): string {
  return (['hex', 'bin', 'unsigned', 'signed'] as const).map((f) => formatByte(value, f)).join(' · ')
}

/** The Hex | Bin | Unsigned | Signed switch shown on each register panel. */
export function RegisterFormatPicker() {
  const [fmt, set] = useRegisterFormat()
  return (
    <div className="reg-format" role="radiogroup" aria-label="Register display format" title="Register display format">
      {FORMATS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={fmt === f.id}
          className={fmt === f.id ? 'mode-tab active' : 'mode-tab'}
          title={f.title}
          onClick={() => set(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
