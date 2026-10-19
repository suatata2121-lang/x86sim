import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'

// When each learning-path module opens and is due (#13). A row applies to
// every group (class_group null), to one group, or to one student (user_id,
// an extension); the most specific row wins. With no rows at all a module
// is simply open with no due date, as before.

export interface ScheduleRow {
  id: number
  module_id: string
  class_group: string | null
  user_id: string | null
  opens_at: string | null
  due_at: string | null
}

export interface ModuleDates {
  opensAt: string | null
  dueAt: string | null
}

/** The row that applies to this student: their own, else their group's, else everyone's. */
export function effectiveDates(rows: ScheduleRow[], moduleId: string, userId: string | null, group: string | null): ModuleDates | null {
  const forModule = rows.filter((r) => r.module_id === moduleId)
  const row =
    forModule.find((r) => userId && r.user_id === userId) ??
    forModule.find((r) => !r.user_id && group && r.class_group === group) ??
    forModule.find((r) => !r.user_id && !r.class_group)
  return row ? { opensAt: row.opens_at, dueAt: row.due_at } : null
}

export const isOpenNow = (d: ModuleDates | null, now = Date.now()) => !d?.opensAt || Date.parse(d.opensAt) <= now

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The schedule rows this student can see (RLS: everyone's and their own). */
export function useSchedule(userId: string | null) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  useEffect(() => {
    setRows([])
    if (!supabase || !userId) return
    let cancelled = false
    void supabase
      .from('module_schedule')
      .select('id, module_id, class_group, user_id, opens_at, due_at')
      .then(({ data }) => {
        // A missing table (schema not re-run yet) means no schedule.
        if (!cancelled) setRows((data ?? []) as ScheduleRow[])
      })
    return () => {
      cancelled = true
    }
  }, [userId])
  return rows
}

export interface InstructorComment {
  id: number
  body: string
  created_at: string
  assignment_id: string | null
}

const seenKey = (userId: string) => `x86sim-feedback-seen:${userId}`

/**
 * Comments the instructor wrote under this student's test runs that the
 * student hasn't dismissed yet. "Seen" is kept per browser: a comment that
 * shows up again on another computer is harmless.
 */
export function useInstructorFeedback(userId: string | null) {
  const [comments, setComments] = useState<InstructorComment[]>([])
  const [seenUpTo, setSeenUpTo] = useState(0)

  useEffect(() => {
    setComments([])
    if (!userId) return
    try {
      setSeenUpTo(Number(localStorage.getItem(seenKey(userId))) || 0)
    } catch {
      setSeenUpTo(0)
    }
    if (!supabase) return
    let cancelled = false
    void supabase
      .from('attempt_comments')
      .select('id, body, created_at, assignment_attempts(assignment_id)')
      .order('id', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as unknown as { id: number; body: string; created_at: string; assignment_attempts: { assignment_id: string } | null }[]
        setComments(rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at, assignment_id: r.assignment_attempts?.assignment_id ?? null })))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const dismiss = useCallback(() => {
    if (!userId || comments.length === 0) return
    const top = Math.max(...comments.map((c) => c.id))
    setSeenUpTo(top)
    try {
      localStorage.setItem(seenKey(userId), String(top))
    } catch {
      // Shown again next time; nothing else depends on it.
    }
  }, [userId, comments])

  return { unread: comments.filter((c) => c.id > seenUpTo), dismiss }
}
