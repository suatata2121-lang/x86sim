import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './client'

// My Notes (#71): one note per learning-path module. Signed-in students keep
// them in public.student_notes, which only they can read; without an account
// (or without the backend) they stay in this browser's localStorage.
export const MAX_NOTE_CHARS = 20000

const localKey = 'x86sim-notes'

function loadLocal(): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(localKey) ?? '{}') as Record<string, string>))
  } catch {
    return new Map()
  }
}

function saveLocal(notes: Map<string, string>) {
  try {
    localStorage.setItem(localKey, JSON.stringify(Object.fromEntries(notes)))
  } catch {
    // Kept for this visit only (private mode, blocked site data).
  }
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function useNotes(userId: string | null) {
  const [notes, setNotes] = useState<Map<string, string>>(() => (userId ? new Map() : loadLocal()))
  const [loaded, setLoaded] = useState(!userId)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // Bodies typed but not stored yet, per module; flushed one second after the last keystroke.
  const pending = useRef(new Map<string, string>())
  const timer = useRef<number | null>(null)

  useEffect(() => {
    pending.current.clear()
    setSaveState('idle')
    if (!supabase || !userId) {
      setNotes(loadLocal())
      setLoaded(true)
      return
    }
    setNotes(new Map())
    setLoaded(false)
    let cancelled = false
    void supabase
      .from('student_notes')
      .select('module_id, body')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled) return
        setNotes(new Map((data ?? []).map((r: { module_id: string; body: string }) => [r.module_id, r.body])))
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const flush = useCallback(async () => {
    timer.current = null
    const batch = [...pending.current]
    pending.current.clear()
    if (batch.length === 0) return
    if (!supabase || !userId) {
      setNotes((prev) => {
        saveLocal(prev)
        return prev
      })
      setSaveState('saved')
      return
    }
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('student_notes')
      .upsert(batch.map(([module_id, body]) => ({ user_id: userId, module_id, body, updated_at: now })))
    if (error) {
      // Try again with the next edit.
      for (const [m, b] of batch) if (!pending.current.has(m)) pending.current.set(m, b)
      setSaveState('error')
    } else if (pending.current.size === 0) {
      setSaveState('saved')
    }
  }, [userId])

  const setNote = useCallback((moduleId: string, body: string) => {
    const text = body.slice(0, MAX_NOTE_CHARS)
    setNotes((prev) => new Map(prev).set(moduleId, text))
    pending.current.set(moduleId, text)
    setSaveState('saving')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 1000)
  }, [flush])

  // Leaving the page within the second after typing: store it now.
  useEffect(() => {
    const onHide = () => {
      if (pending.current.size > 0) void flush()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flush])

  return { notes, loaded, saveState, setNote }
}
