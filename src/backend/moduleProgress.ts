import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'
import { trackActivity } from './tracking'
import type { ModuleProgressRow, StoredStep } from '../learningPath'
import type { QuizAnswer } from '../quizzes'

// The signed-in student's position in each learning-path module, kept in
// module_progress so it follows them across devices, plus the topics they
// marked as read (concept_reads) and which module quizzes they passed
// (quiz_attempts). Updates are applied locally first; a failed write only
// costs the server copy, never the UI.

export function useModuleProgress(userId: string | null) {
  const [rows, setRows] = useState<Map<string, ModuleProgressRow>>(new Map())
  const [reads, setReads] = useState<Map<string, Set<string>>>(new Map())
  const [quizzesPassed, setQuizzesPassed] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setRows(new Map())
    setReads(new Map())
    setQuizzesPassed(new Set())
    setLoaded(false)
    if (!supabase || !userId) return
    let cancelled = false
    Promise.all([
      supabase.from('module_progress').select('module_id, step, updated_at').eq('user_id', userId),
      supabase.from('concept_reads').select('module_id, concept_id').eq('user_id', userId),
      supabase.from('quiz_attempts').select('module_id').eq('user_id', userId).eq('passed', true),
    ]).then(([progress, conceptReads, passes]) => {
      if (cancelled) return
      setRows(new Map(((progress.data ?? []) as ModuleProgressRow[]).map((r) => [r.module_id, r])))
      const byModule = new Map<string, Set<string>>()
      for (const r of (conceptReads.data ?? []) as { module_id: string; concept_id: string }[]) {
        byModule.set(r.module_id, (byModule.get(r.module_id) ?? new Set()).add(r.concept_id))
      }
      setReads(byModule)
      setQuizzesPassed(new Set(((passes.data ?? []) as { module_id: string }[]).map((r) => r.module_id)))
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

  const markRead = useCallback((moduleId: string, conceptId: string) => {
    if (!supabase || !userId) return
    setReads((prev) => new Map(prev).set(moduleId, new Set(prev.get(moduleId)).add(conceptId)))
    trackActivity('read_topic', null, { module: moduleId, topic: conceptId })
    void supabase
      .from('concept_reads')
      .upsert({ user_id: userId, module_id: moduleId, concept_id: conceptId }, { ignoreDuplicates: true })
      .then(() => undefined)
  }, [userId])

  const recordQuizAttempt = useCallback((moduleId: string, attempt: { score: number; total: number; passed: boolean; answers: QuizAnswer[] }) => {
    if (!supabase || !userId) return
    if (attempt.passed) setQuizzesPassed((prev) => new Set(prev).add(moduleId))
    trackActivity('quiz_attempt', null, { module: moduleId, score: `${attempt.score}/${attempt.total}`, passed: attempt.passed })
    void supabase
      .from('quiz_attempts')
      .insert({ user_id: userId, module_id: moduleId, ...attempt })
      .then(() => undefined)
  }, [userId])

  return { rows, reads, quizzesPassed, loaded, setStep, markRead, recordQuizAttempt }
}
