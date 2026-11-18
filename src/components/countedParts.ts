import { useState } from 'react'

/**
 * Progress for an "n of m" interactive whose parts are interchangeable
 * (any right answer counts, not a specific one). Each new success records the
 * first part not yet recorded, either earlier (`done`, from the server) or in
 * this visit. Recording by "nth success in this visit" instead would rewrite
 * the same parts after a reload and never reach the last one.
 */
export function useCountedParts(parts: string[], done: Set<string> | undefined, onDone?: (partId: string) => void) {
  const [here, setHere] = useState<Set<string>>(new Set())
  const has = (p: string) => here.has(p) || !!done?.has(p)
  const count = parts.filter(has).length

  function record() {
    const p = parts.find((x) => !has(x))
    if (!p) return
    setHere((s) => new Set(s).add(p))
    onDone?.(p)
  }

  return { count, complete: count >= parts.length, record }
}
