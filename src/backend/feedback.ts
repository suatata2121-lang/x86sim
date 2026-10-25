import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'
import type { FeedbackKind } from '../components/FeedbackDialog'

// A student's own feedback with the instructor's replies and status changes
// (#64). Notices are shown on the site only: checked on load, when the tab
// gets focus again and every few minutes while it stays open.

export type FeedbackStatus = 'new' | 'seen' | 'done'

export const STATUS_LABELS: Record<FeedbackStatus, string> = { new: 'New', seen: 'Seen', done: 'Done' }

export interface FeedbackMessage {
  id: number
  feedback_id: number
  author_id: string | null
  body: string
  created_at: string
}

export interface MyFeedback {
  id: number
  kind: FeedbackKind
  message: string
  status: FeedbackStatus
  created_at: string
  status_changed_at: string | null
  student_read_at: string | null
  feedback_messages: FeedbackMessage[]
}

const REFRESH_MS = 3 * 60_000
export const MAX_REPLY_CHARS = 5000

const time = (iso: string | null) => (iso ? Date.parse(iso) : 0)

/** What is new for the student on this feedback since they last opened it, as notice texts. */
export function unreadNotices(item: MyFeedback, userId: string): string[] {
  const readAt = time(item.student_read_at)
  const notices: string[] = []
  if (item.feedback_messages.some((m) => m.author_id !== userId && time(m.created_at) > readAt)) {
    notices.push('The instructor replied to your feedback.')
  }
  if (item.status !== 'new' && time(item.status_changed_at) > readAt) {
    notices.push(item.status === 'done' ? 'Your feedback has been marked as done.' : 'The instructor has seen your feedback.')
  }
  return notices
}

export function useMyFeedback(userId: string | null) {
  const [items, setItems] = useState<MyFeedback[]>([])

  const reload = useCallback(async () => {
    if (!supabase || !userId) return
    const { data } = await supabase
      .from('feedback')
      .select('id, kind, message, status, created_at, status_changed_at, student_read_at, feedback_messages(id, feedback_id, author_id, body, created_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'feedback_messages', ascending: true })
      .limit(100)
    // Before schema.sql adds the columns the query fails; keep the list empty.
    if (data) setItems(data as unknown as MyFeedback[])
  }, [userId])

  useEffect(() => {
    setItems([])
    if (!supabase || !userId) return
    void reload()
    function onFocus() {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const timer = window.setInterval(onFocus, REFRESH_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      window.clearInterval(timer)
    }
  }, [userId, reload])

  const unread = userId ? items.filter((i) => unreadNotices(i, userId).length > 0) : []

  async function markRead(ids: number[]) {
    if (!supabase || ids.length === 0) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, student_read_at: now } : i)))
    await Promise.all(ids.map((id) => supabase!.rpc('mark_feedback_read', { p_id: id })))
  }

  async function reply(feedbackId: number, body: string) {
    if (!supabase || !userId) return
    const { error } = await supabase
      .from('feedback_messages')
      .insert({ feedback_id: feedbackId, author_id: userId, body: body.slice(0, MAX_REPLY_CHARS) })
    if (error) throw error
    await reload()
  }

  return { items, unread, reload, markRead, reply }
}

export type MyFeedbackState = ReturnType<typeof useMyFeedback>
