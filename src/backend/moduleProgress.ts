import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'
import type { ModuleProgressRow, StoredStep } from '../learningPath'

// The signed-in student's position in each learning-path module, kept in
// module_progress so it follows them across devices. Updates are applied
// locally first; a failed write only costs the server copy, never the UI.

export function useModuleProgress(userId: string | null) {
  const [rows, setRows] = useState<Map<string, ModuleProgressRow>>(new Map())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setRows(new Map())
    setLoaded(false)
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('module_progress')
      .select('module_id, step, updated_at')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled) return
        setRows(new Map(((data ?? []) as ModuleProgressRow[]).map((r) => [r.module_id, r])))
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const setStep = useCallback((moduleId: string, step: StoredStep) => {
    if (!supabase || !userId) return
    const row: ModuleProgressRow = { module_id: moduleId, step, updated_at: new Date().toISOString() }
    setRows((prev) => new Map(prev).set(moduleId, row))
    void supabase
      .from('module_progress')
      .upsert({ user_id: userId, ...row })
      .then(() => undefined)
  }, [userId])

  return { rows, loaded, setStep }
}
