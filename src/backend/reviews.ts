import { useEffect, useState } from 'react'
import type { ModuleProgressRow } from '../learningPath'

// When each module was finished, for review cards (#15). There is no server
// column for it, so the date is the module's last progress update if its
// step was stored as 'done', otherwise the first time this browser saw it
// done. Per browser: a review card that shows a few days early or late on
// another computer is harmless.

export const REVIEW_DAYS = [14, 28]
const DAY = 86_400_000

const key = (userId: string) => `x86sim-module-done:${userId}`

export function useModuleDoneDates(userId: string | null, doneIds: string[], rows: Map<string, ModuleProgressRow>) {
  const [dates, setDates] = useState<Record<string, string>>({})
  const signature = doneIds.join(',')

  useEffect(() => {
    if (!userId) {
      setDates({})
      return
    }
    let stored: Record<string, string> = {}
    try {
      stored = JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Record<string, string>
    } catch {
      stored = {}
    }
    let changed = false
    for (const id of doneIds) {
      const row = rows.get(id)
      const fromServer = row?.step === 'done' ? row.updated_at : null
      const best = [stored[id], fromServer].filter(Boolean).sort()[0] ?? new Date().toISOString()
      if (stored[id] !== best) {
        stored[id] = best
        changed = true
      }
    }
    if (changed) {
      try {
        localStorage.setItem(key(userId), JSON.stringify(stored))
      } catch {
        // Kept for this visit only.
      }
    }
    setDates(stored)
    // rows only refine dates already stored; the done list drives updates.
  }, [userId, signature])

  return dates
}

/** Review cards due for a module: one at 14 days, a second at 28. */
export function reviewDue(doneAt: string | undefined, reviewsSoFar: number, now = Date.now()): boolean {
  if (!doneAt) return false
  const days = (now - Date.parse(doneAt)) / DAY
  return REVIEW_DAYS.filter((d) => days >= d).length > reviewsSoFar
}
