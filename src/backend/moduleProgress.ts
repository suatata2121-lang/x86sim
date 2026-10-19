import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './client'
import { trackActivity } from './tracking'
import type { ModuleProgressRow, StoredStep } from '../learningPath'
import type { DrawnQuestion, QuizResult } from '../quizzes'

// The signed-in student's position in each learning-path module, kept in
// module_progress so it follows them across devices, plus the topics they
// marked as read (concept_reads), the interactive items they finished
// (interactive_runs), the Predict questions they answered (predictions) and
// which module quizzes they passed (quiz_attempts, written only by the
// quiz_submit function). Updates are applied locally
// first; a failed write only costs the server copy, never the UI.

function groupByModule(rows: { module_id: string; id: string }[]) {
  const byModule = new Map<string, Set<string>>()
  for (const r of rows) byModule.set(r.module_id, (byModule.get(r.module_id) ?? new Set()).add(r.id))
  return byModule
}

export function useModuleProgress(userId: string | null) {
  const [rows, setRows] = useState<Map<string, ModuleProgressRow>>(new Map())
  const [reads, setReads] = useState<Map<string, Set<string>>>(new Map())
  const [quizzesPassed, setQuizzesPassed] = useState<Set<string>>(new Set())
  const [interactives, setInteractives] = useState<Map<string, Set<string>>>(new Map())
  const [predicted, setPredicted] = useState<Map<string, Set<string>>>(new Map())
  // For review cards (#15): questions ever answered wrong, and how many
  // review cards each module has had.
  const [wrongPredicted, setWrongPredicted] = useState<Map<string, Set<string>>>(new Map())
  const [reviewCounts, setReviewCounts] = useState<Map<string, number>>(new Map())
  // The same set, readable synchronously, so a repeat completion writes nothing.
  const interactivesRef = useRef(interactives)
  interactivesRef.current = interactives
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setRows(new Map())
    setReads(new Map())
    setQuizzesPassed(new Set())
    setInteractives(new Map())
    setPredicted(new Map())
    setWrongPredicted(new Map())
    setReviewCounts(new Map())
    setLoaded(false)
    if (!supabase || !userId) return
    let cancelled = false
    Promise.all([
      supabase.from('module_progress').select('module_id, step, updated_at').eq('user_id', userId),
      supabase.from('concept_reads').select('module_id, concept_id').eq('user_id', userId),
      supabase.from('quiz_attempts').select('module_id').eq('user_id', userId).eq('passed', true),
      supabase.from('interactive_runs').select('module_id, item_id').eq('user_id', userId),
      supabase.from('predictions').select('module_id, question_id, correct, source').eq('user_id', userId),
    ]).then(([progress, conceptReads, passes, runs, predictions]) => {
      if (cancelled) return
      setRows(new Map(((progress.data ?? []) as ModuleProgressRow[]).map((r) => [r.module_id, r])))
      setReads(groupByModule(((conceptReads.data ?? []) as { module_id: string; concept_id: string }[])
        .map((r) => ({ module_id: r.module_id, id: r.concept_id }))))
      setInteractives(groupByModule(((runs.data ?? []) as { module_id: string; item_id: string }[])
        .map((r) => ({ module_id: r.module_id, id: r.item_id }))))
      setQuizzesPassed(new Set(((passes.data ?? []) as { module_id: string }[]).map((r) => r.module_id)))
      // An error here (e.g. the predictions table not created yet) just means
      // nothing answered so far; the step still works and records locally.
      const preds = (predictions.data ?? []) as { module_id: string; question_id: string; correct: boolean; source: string }[]
      setPredicted(groupByModule(preds.filter((r) => r.source === 'predict').map((r) => ({ module_id: r.module_id, id: r.question_id }))))
      setWrongPredicted(groupByModule(preds.filter((r) => !r.correct).map((r) => ({ module_id: r.module_id, id: r.question_id }))))
      const counts = new Map<string, number>()
      for (const r of preds.filter((x) => x.source === 'review')) counts.set(r.module_id, (counts.get(r.module_id) ?? 0) + 1)
      setReviewCounts(counts)
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

  // Called whenever an interactive item finishes; only the first time per
  // module is written.
  const markInteractive = useCallback((moduleId: string, itemId: string) => {
    if (!supabase || !userId) return
    if (interactivesRef.current.get(moduleId)?.has(itemId)) return
    const next = new Map(interactivesRef.current).set(moduleId, new Set(interactivesRef.current.get(moduleId)).add(itemId))
    interactivesRef.current = next
    setInteractives(next)
    trackActivity('interactive_done', null, { module: moduleId, item: itemId })
    void supabase
      .from('interactive_runs')
      .upsert({ user_id: userId, module_id: moduleId, item_id: itemId }, { ignoreDuplicates: true })
      .then(() => undefined)
  }, [userId])

  // Every Check on a Predict question is stored, right or wrong, so the
  // instructor sees which ideas don't stick yet.
  const recordPrediction = useCallback((
    moduleId: string, questionId: string, answer: string, correct: boolean, source: 'predict' | 'review' = 'predict',
  ) => {
    if (source === 'predict') setPredicted((prev) => new Map(prev).set(moduleId, new Set(prev.get(moduleId)).add(questionId)))
    else setReviewCounts((prev) => new Map(prev).set(moduleId, (prev.get(moduleId) ?? 0) + 1))
    if (!correct) setWrongPredicted((prev) => new Map(prev).set(moduleId, new Set(prev.get(moduleId)).add(questionId)))
    if (!supabase || !userId) return
    void supabase
      .from('predictions')
      .insert({ user_id: userId, module_id: moduleId, question_id: questionId, answer: answer.slice(0, 200), correct, source })
      .then(() => undefined)
  }, [userId])

  // The optional one-sentence reflection at the end of a module (#16).
  const saveReflection = useCallback(async (moduleId: string, body: string) => {
    if (!supabase || !userId) return
    await supabase.from('reflections').insert({ user_id: userId, module_id: moduleId, body: body.slice(0, 500) })
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

  return {
    rows, reads, quizzesPassed, interactives, predicted, wrongPredicted, reviewCounts, loaded,
    setStep, markRead, markInteractive, recordPrediction, saveReflection, drawQuiz, submitQuiz,
  }
}
