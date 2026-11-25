import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'

// Highlights on Learn pages (#91). Signed-in students keep them in
// public.student_highlights, which only they can read (not even admins);
// without an account they stay in this browser's localStorage. A highlight
// is found again by its text and up to 30 characters on either side, so a
// page whose text changed simply doesn't show it.

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'pink'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export interface StudentHighlight {
  id: string
  module_id: string
  /** The page: `${section}:${id}` of its ConceptRef. */
  concept_id: string
  text: string
  prefix: string
  suffix: string
  color: HighlightColor
  created_at: string
}

export type NewHighlight = Omit<StudentHighlight, 'id' | 'created_at'>

const localKey = 'x86sim-highlights'
const MAX_TEXT = 2000

function loadLocal(): StudentHighlight[] {
  try {
    return JSON.parse(localStorage.getItem(localKey) ?? '[]') as StudentHighlight[]
  } catch {
    return []
  }
}

function saveLocal(items: StudentHighlight[]) {
  try {
    localStorage.setItem(localKey, JSON.stringify(items))
  } catch {
    // Kept for this visit only.
  }
}

export function useHighlights(userId: string | null) {
  const [items, setItems] = useState<StudentHighlight[]>(() => (userId ? [] : loadLocal()))

  useEffect(() => {
    if (!supabase || !userId) {
      setItems(loadLocal())
      return
    }
    setItems([])
    let cancelled = false
    void supabase
      .from('student_highlights')
      .select('id, module_id, concept_id, text, prefix, suffix, color, created_at')
      .eq('user_id', userId)
      .order('created_at')
      .then(({ data }) => {
        // A missing table (schema not re-run yet) just shows no highlights.
        if (cancelled || !data) return
        setItems((data as (StudentHighlight & { id: number })[]).map((r) => ({ ...r, id: String(r.id) })))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const add = useCallback((h: NewHighlight) => {
    const row = { ...h, text: h.text.slice(0, MAX_TEXT), prefix: h.prefix.slice(-30), suffix: h.suffix.slice(0, 30) }
    const temp: StudentHighlight = { ...row, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, created_at: new Date().toISOString() }
    if (!supabase || !userId) {
      setItems((prev) => {
        const next = [...prev, temp]
        saveLocal(next)
        return next
      })
      return
    }
    setItems((prev) => [...prev, temp])
    void supabase
      .from('student_highlights')
      .insert({ user_id: userId, ...row })
      .select('id, created_at')
      .single()
      .then(({ data, error }) => {
        // Not saved: take it off again rather than show something that won't come back.
        if (error || !data) setItems((prev) => prev.filter((x) => x.id !== temp.id))
        else {
          const saved = data as { id: number; created_at: string }
          setItems((prev) => prev.map((x) => (x.id === temp.id ? { ...x, id: String(saved.id), created_at: saved.created_at } : x)))
        }
      })
  }, [userId])

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id)
      if (!supabase || !userId) saveLocal(next)
      return next
    })
    if (supabase && userId && !id.startsWith('local-')) {
      void supabase.from('student_highlights').delete().eq('id', Number(id)).then(() => undefined)
    }
  }, [userId])

  return { items, add, remove }
}
