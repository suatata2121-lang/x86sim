import { useEffect, useState } from 'react'
import { supabase } from './client'
import { trackActivity } from './tracking'

// The hint ladder's state per assignment: how many Run Tests failed and how
// many hint steps are open. Kept in localStorage for everyone; for a
// signed-in student the server copy (failed attempts, 'hint' events) also
// counts, so the ladder follows them to another computer.

export const HINT_AFTER_FAILS = 3

interface HintState {
  fails: number
  level: number
}

const storageKey = (userId: string | null, assignmentId: string) => `x86sim-hints:${userId ?? 'guest'}:${assignmentId}`

function loadLocal(userId: string | null, assignmentId: string): HintState {
  try {
    const raw = localStorage.getItem(storageKey(userId, assignmentId))
    const v = raw ? (JSON.parse(raw) as Partial<HintState>) : {}
    return { fails: Number(v.fails) || 0, level: Math.min(3, Number(v.level) || 0) }
  } catch {
    return { fails: 0, level: 0 }
  }
}

function saveLocal(userId: string | null, assignmentId: string, state: HintState) {
  try {
    localStorage.setItem(storageKey(userId, assignmentId), JSON.stringify(state))
  } catch {
    // Not kept past this page; the ladder still works now.
  }
}

async function loadServer(userId: string, assignmentId: string): Promise<HintState | null> {
  if (!supabase) return null
  const [fails, hints] = await Promise.all([
    supabase
      .from('assignment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .eq('passed', false),
    supabase
      .from('activity_events')
      .select('detail')
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .eq('kind', 'hint'),
  ])
  if (fails.error || hints.error) return null
  const level = Math.max(0, ...(hints.data ?? []).map((r: { detail: { level?: number } }) => Number(r.detail?.level) || 0))
  return { fails: fails.count ?? 0, level: Math.min(3, level) }
}

export function useHintLadder(userId: string | null, assignmentId: string | null) {
  const [state, setState] = useState<HintState>({ fails: 0, level: 0 })

  useEffect(() => {
    if (!assignmentId) return
    const local = loadLocal(userId, assignmentId)
    setState(local)
    if (!userId) return
    let cancelled = false
    void loadServer(userId, assignmentId).then((server) => {
      if (cancelled || !server) return
      const merged = { fails: Math.max(local.fails, server.fails), level: Math.max(local.level, server.level) }
      setState(merged)
      saveLocal(userId, assignmentId, merged)
    })
    return () => {
      cancelled = true
    }
  }, [userId, assignmentId])

  function update(next: HintState) {
    if (!assignmentId) return
    setState(next)
    saveLocal(userId, assignmentId, next)
  }

  return {
    ...state,
    available: state.fails >= HINT_AFTER_FAILS || state.level > 0,
    recordFailedRun() {
      update({ ...state, fails: state.fails + 1 })
    },
    revealNext() {
      if (!assignmentId || state.level >= 3) return
      const level = state.level + 1
      update({ ...state, level })
      trackActivity('hint', assignmentId, { level })
    },
  }
}
