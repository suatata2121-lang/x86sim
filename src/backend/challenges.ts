import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'
import { trackActivity } from './tracking'

// Cycle challenges a student has completed (#15): 'challenge' activity
// events, one per assignment. No effect on grading; shown as a badge.
const eligibleKey = (userId: string | null) => `x86sim-challenges-eligible:${userId ?? 'guest'}`

function loadEligible(userId: string | null): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(eligibleKey(userId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function useChallenges(userId: string | null) {
  const [done, setDone] = useState<Set<string>>(new Set())
  // Assignments passed within two runs: the challenge stays offered there even
  // if an attempt to make the program faster fails a test along the way.
  const [eligible, setEligible] = useState<Set<string>>(() => loadEligible(userId))

  useEffect(() => {
    setDone(new Set())
    setEligible(loadEligible(userId))
    if (!supabase || !userId) return
    let cancelled = false
    void supabase
      .from('activity_events')
      .select('assignment_id')
      .eq('user_id', userId)
      .eq('kind', 'challenge')
      .then(({ data }) => {
        if (!cancelled) setDone(new Set((data ?? []).map((r: { assignment_id: string | null }) => r.assignment_id ?? '').filter(Boolean)))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const complete = useCallback((assignmentId: string, cycles: number, limit: number) => {
    setDone((prev) => {
      if (prev.has(assignmentId)) return prev
      trackActivity('challenge', assignmentId, { cycles, limit })
      return new Set(prev).add(assignmentId)
    })
  }, [])

  const markEligible = useCallback((assignmentId: string) => {
    setEligible((prev) => {
      if (prev.has(assignmentId)) return prev
      const next = new Set(prev).add(assignmentId)
      try {
        localStorage.setItem(eligibleKey(userId), JSON.stringify([...next]))
      } catch {
        // Offered for this visit only.
      }
      return next
    })
  }, [userId])

  return { done, eligible, complete, markEligible }
}
