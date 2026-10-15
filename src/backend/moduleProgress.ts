import { useCallback, useEffect, useState } from 'react'
import { supabase } from './client'
import { trackActivity } from './tracking'
import type { ModuleProgressRow, StoredStep } from '../learningPath'
import type { DrawnQuestion, QuizResult } from '../quizzes'

// The signed-in student's position in each learning-path module, kept in
// module_progress so it follows them across devices, plus the topics they
// marked as read (concept_reads) and which module quizzes they passed
// (quiz_attempts, written only by the quiz_submit function). Updates are applied locally first; a failed write only
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

  // Questions and grading are server-side (quiz_draw / quiz_submit in
  // schema.sql) so the answer key never reaches the browser.
  const drawQuiz = useCallback(async (moduleId: string): Promise<DrawnQuestion[]> => {
    if (!supabase) throw new Error('Accounts are not available')
    const { data, error } = await supabase.rpc('quiz_draw', { p_module: moduleId })
    if (error) throw new Error(error.message)
    return (data ?? []) as DrawnQuestion[]
  }, [])

  const submitQuiz = useCallback(async (moduleId: string, answers: { question_id: string; chosen: string }[]): Promise<QuizResult> => {
    if (!supabase) throw new Error('Accounts are not available')
    const { data, error } = await supabase.rpc('quiz_submit', { p_module: moduleId, p_answers: answers })
    if (error) throw new Error(error.message)
    const result = data as QuizResult
    if (result.passed) setQuizzesPassed((prev) => new Set(prev).add(moduleId))
    trackActivity('quiz_attempt', null, { module: moduleId, score: `${result.score}/${result.total}`, passed: result.passed })
    return result
  }, [])

  return { rows, reads, quizzesPassed, loaded, setStep, markRead, drawQuiz, submitQuiz }
}
