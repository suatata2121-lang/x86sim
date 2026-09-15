import type { DataDeclaration } from './types'

export const MEMORY_TOP = 0x10000

export interface MemorySegments {
  dataStart: number
  dataEnd: number
  freeStart: number
  freeEnd: number
  stackStart: number
  stackEnd: number
}

// Derives simple Data / Free ("heap") / Stack segment boundaries from the
// program's declared data and the current stack pointer. This simulator has
// no real heap allocator (no malloc-equivalent instruction), so "free" is
// just whatever memory sits between the end of static data and the current
// top of stack — clamped so a stack that has grown down into the data area
// (a real stack-overflow bug in the user's program) never renders as a
// negative-width free region.
export function computeSegments(data: DataDeclaration[], sp: number): MemorySegments {
  const dataEnd = data.reduce((max, d) => Math.max(max, d.address + d.bytes.length), 0)
  const stackStart = Math.min(Math.max(sp, dataEnd), MEMORY_TOP)
  return {
    dataStart: 0,
    dataEnd,
    freeStart: dataEnd,
    freeEnd: stackStart,
    stackStart,
    stackEnd: MEMORY_TOP,
  }
}

// Maps a byte count to a display height in a fixed, deliberately non-linear
// ("not to scale") way: 0 for an empty segment, otherwise at least `min` and
// at most `max`, growing slowly with size in between. Real memory maps are
// never drawn to scale either — data/stack are tiny slivers next to tens of
// thousands of free bytes — this keeps every segment visible and legible.
export function bandHeight(bytes: number, min: number, max: number, divisor: number): number {
  if (bytes <= 0) return 0
  return Math.min(max, min + bytes / divisor)
}
