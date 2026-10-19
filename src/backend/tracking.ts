import { useEffect } from 'react'
import { supabase } from './client'

// Records what a signed-in student does in the lab so the instructor can see
// it in the admin panel. Everything here is fire-and-forget: a failed write
// is dropped silently rather than ever getting in the way of the simulator.

const HEARTBEAT_MS = 60_000
// A visible tab with no mouse, keyboard, scroll or touch for this long stops
// counting, so a screen left open doesn't add lab time. Time up to this
// limit still counts -- reading a page is quiet too.
const IDLE_MS = 5 * 60_000
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const
const FLUSH_MS = 15_000

export type ActivityKind =
  | 'assemble'
  | 'run'
  | 'step'
  | 'animate'
  | 'open_assignment'
  | 'load_example'
  | 'path_step'
  | 'read_topic'
  | 'quiz_attempt'
  | 'interactive_done'
  | 'hint'

interface QueuedEvent {
  user_id: string
  session_id: string | null
  kind: ActivityKind
  assignment_id: string | null
  detail: Record<string, unknown>
}

let currentUserId: string | null = null
let currentSessionId: string | null = null
let queue: QueuedEvent[] = []
// Single steps are frequent, so they are counted and written as one event
// per flush instead of one row per click.
let pendingSteps = 0
let pendingStepsAssignment: string | null = null

function flush() {
  if (!supabase || !currentUserId) return
  if (pendingSteps > 0) {
    queue.push({
      user_id: currentUserId,
      session_id: currentSessionId,
      kind: 'step',
      assignment_id: pendingStepsAssignment,
      detail: { count: pendingSteps },
    })
    pendingSteps = 0
  }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  void supabase.from('activity_events').insert(batch).then(() => undefined)
}

export function trackActivity(kind: ActivityKind, assignmentId: string | null, detail: Record<string, unknown> = {}) {
  if (!supabase || !currentUserId) return
  if (kind === 'step') {
    if (pendingSteps > 0 && pendingStepsAssignment !== assignmentId) flush()
    pendingSteps++
    pendingStepsAssignment = assignmentId
    return
  }
  queue.push({ user_id: currentUserId, session_id: currentSessionId, kind, assignment_id: assignmentId, detail })
}

export function recordAttempt(attempt: {
  assignmentId: string
  passedCount: number
  totalCount: number
  assembled: boolean
  source: string
}) {
  if (!supabase || !currentUserId) return
  void supabase
    .from('assignment_attempts')
    .insert({
      user_id: currentUserId,
      assignment_id: attempt.assignmentId,
      passed_count: attempt.passedCount,
      total_count: attempt.totalCount,
      assembled: attempt.assembled,
      source: attempt.source.slice(0, 50_000),
    })
    .then(() => undefined)
}

/** Assignment ids the student has passed, from any device. */
export async function fetchCompletedAssignments(userId: string): Promise<string[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('assignment_attempts')
    .select('assignment_id')
    .eq('user_id', userId)
    .eq('passed', true)
  return [...new Set((data ?? []).map((r: { assignment_id: string }) => r.assignment_id))]
}

/** Opens a study session for the signed-in user and keeps its active time up to date. */
export function useStudySession(userId: string | null) {
  useEffect(() => {
    const client = supabase
    if (!client || !userId) return
    currentUserId = userId
    let cancelled = false
    let lastBeat = Date.now()

    client
      .from('study_sessions')
      .insert({ user_id: userId, user_agent: navigator.userAgent.slice(0, 300) })
      .select('id')
      .single()
      .then(({ data }) => {
        if (!cancelled && data) currentSessionId = (data as { id: string }).id
      })

    // Time only accrues while the tab is visible and someone is using it.
    let paused = document.visibilityState !== 'visible'
    let lastActivity = Date.now()

    function beat() {
      const now = Date.now()
      // Credit up to IDLE_MS after the last input, never the idle time beyond it.
      const seconds = Math.max(0, Math.round((Math.min(now, lastActivity + IDLE_MS) - lastBeat) / 1000))
      lastBeat = now
      if (paused || !currentSessionId || seconds === 0) return
      void client!.rpc('session_heartbeat', { p_session_id: currentSessionId, p_seconds: seconds }).then(() => undefined)
    }

    // Coming back after an idle spell: settle what is owed so far (beat()
    // credits only up to the idle limit and restarts the interval), so the
    // idle gap is never credited.
    function onActivity() {
      const now = Date.now()
      if (now - lastActivity > IDLE_MS) beat()
      lastActivity = now
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        paused = false
        lastBeat = Date.now()
        lastActivity = Date.now()
      } else {
        beat()
        paused = true
        flush()
      }
    }

    const heartbeat = window.setInterval(beat, HEARTBEAT_MS)
    const flusher = window.setInterval(flush, FLUSH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true })

    return () => {
      cancelled = true
      // Credit the time since the last beat while the session id is still set.
      beat()
      flush()
      window.clearInterval(heartbeat)
      window.clearInterval(flusher)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true })
      currentUserId = null
      currentSessionId = null
    }
  }, [userId])
}
