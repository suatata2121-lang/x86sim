// What the class as a whole hasn't understood yet, and the end-of-term
// report (#16): the Funnel on the report page, the Misconceptions tab and
// the End-of-term report tab. Kept out of AdminView.tsx, which is per
// student and per assignment.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../backend/client'
import { gradeSource } from '../core/grader'
import { CURRICULUM } from '../curriculum'
import { LEARNING_PATH, STEPS, activeSteps } from '../learningPath'
import { PREDICT_QUESTIONS } from '../predictQuestions'
import { PAGE_SIZE, downloadCsv, today } from './adminUtils'

const ASSIGNMENTS = CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments))
const ASSIGNMENT_BY_ID = new Map(ASSIGNMENTS.map((a) => [a.id, a]))
const PREDICT_BY_ID = new Map(
  Object.entries(PREDICT_QUESTIONS).flatMap(([moduleId, qs]) => qs.map((q) => [q.id, { moduleId, q }] as const)),
)
const moduleNo = (id: string) => LEARNING_PATH.findIndex((m) => m.id === id)
const moduleLabel = (id: string) => (moduleNo(id) >= 0 ? `Module ${moduleNo(id)}` : id)
const pct = (x: number) => `${Math.round(x * 100)}%`

export interface InsightStudent {
  id: string
  full_name: string
  email: string
  student_no: string
  class_group: string
  total_seconds: number
  placement_score?: number | null
}

interface ProgressRow {
  user_id: string
  assignment_id: string
  attempt_count: number
  passed: boolean
  first_passed_at: string | null
}

interface StepRow {
  user_id: string
  module_id: string
  step: string
  updated_at: string
}

type ModuleDone = (studentId: string, moduleId: string, step: string | undefined) => boolean

/** Every row of a filtered query, a page at a time (fetchAll has no filters). */
async function fetchWhere<T>(table: string, columns: string, filter: (q: any) => any): Promise<T[]> {
  if (!supabase) return []
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await filter(supabase.from(table).select(columns)).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

// ---------------------------------------------------------------------------
// Funnel (report page)
// ---------------------------------------------------------------------------

export function Funnel({ studentIds, moduleDone }: { studentIds: Set<string>; moduleDone: ModuleDone }) {
  const [rows, setRows] = useState<StepRow[]>([])
  const [moduleId, setModuleId] = useState(LEARNING_PATH[1]?.id ?? LEARNING_PATH[0].id)

  useEffect(() => {
    fetchWhere<StepRow>('module_progress', 'user_id, module_id, step, updated_at', (q) => q).then(setRows).catch(() => setRows([]))
  }, [])

  const module = LEARNING_PATH.find((m) => m.id === moduleId) ?? LEARNING_PATH[0]
  const steps = activeSteps(module)
  const labels = [...steps.map((s) => STEPS.find((x) => x.id === s)?.label ?? s), 'Done']
  // How far each student got: the index of their stored step, or past the
  // end once the module counts as done.
  const counts = useMemo(() => {
    const reached = labels.map(() => 0)
    for (const r of rows.filter((x) => x.module_id === module.id && studentIds.has(x.user_id))) {
      const i = moduleDone(r.user_id, module.id, r.step) ? steps.length : Math.max(0, steps.indexOf(r.step as never))
      for (let k = 0; k <= i; k++) reached[k]++
    }
    return reached
  }, [rows, module, studentIds, moduleDone])
  const drops = counts.slice(1).map((c, i) => counts[i] - c)
  const worst = drops.length ? drops.indexOf(Math.max(...drops)) : -1
  const top = Math.max(1, counts[0])

  return (
    <div className="funnel">
      <h3>Funnel</h3>
      <div className="admin-filters no-print">
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          {LEARNING_PATH.map((m, i) => <option key={m.id} value={m.id}>Module {i}: {m.title}</option>)}
        </select>
      </div>
      <ol className="funnel-steps">
        {labels.map((label, i) => (
          <li key={label} className={worst >= 0 && drops[worst] > 0 && i === worst + 1 ? 'biggest-drop' : undefined}>
            <span className="funnel-label">{label}</span>
            <span className="funnel-bar"><span style={{ width: `${(counts[i] / top) * 100}%` }} /></span>
            <span className="funnel-count">{counts[i]}</span>
            {i > 0 && drops[i - 1] > 0 && <span className="admin-meta"> −{drops[i - 1]}</span>}
          </li>
        ))}
      </ol>
      {worst >= 0 && drops[worst] > 0 && (
        <p className="admin-meta">Biggest drop: {labels[worst]} → {labels[worst + 1]} ({drops[worst]} students).</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Misconceptions tab
// ---------------------------------------------------------------------------

interface PredictionRow {
  user_id: string
  question_id: string
  answer: string
  correct: boolean
}

interface AttemptRow {
  user_id: string
  assignment_id: string
  source: string
  created_at: string
}

interface ReflectionRow {
  user_id: string
  module_id: string
  body: string
  created_at: string
}

// Test cases are re-run on the stored code, because attempts only keep the
// passed/total count. The newest attempts are enough to see the pattern.
const REGRADE_LIMIT = 1500

export function MisconceptionsTab({ students, groups }: { students: InsightStudent[]; groups: string[] }) {
  const [group, setGroup] = useState('')
  const [predictions, setPredictions] = useState<PredictionRow[]>([])
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [reflections, setReflections] = useState<ReflectionRow[]>([])
  const [testStats, setTestStats] = useState<Map<string, { assignment: string; test: string; runs: number; fails: number; user: string }[]>>(new Map())
  const [graded, setGraded] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    fetchWhere<PredictionRow>('predictions', 'user_id, question_id, answer, correct', (q) => q).then(setPredictions).catch((e) => setError(e.message))
    fetchWhere<ReflectionRow>('reflections', 'user_id, module_id, body, created_at', (q) => q.order('created_at', { ascending: false }))
      .then(setReflections).catch(() => setReflections([]))
    void supabase.from('assignment_attempts').select('user_id, assignment_id, source, created_at')
      .order('created_at', { ascending: false }).limit(REGRADE_LIMIT)
      .then(({ data }) => setAttempts((data ?? []) as AttemptRow[]))
  }, [])

  // Regrade in small slices so the page stays responsive.
  useEffect(() => {
    let cancelled = false
    const perTest = new Map<string, { assignment: string; test: string; runs: number; fails: number; user: string }[]>()
    let i = 0
    function slice() {
      if (cancelled) return
      for (const end = Math.min(attempts.length, i + 40); i < end; i++) {
        const a = attempts[i]
        const assignment = ASSIGNMENT_BY_ID.get(a.assignment_id)
        if (!assignment) continue
        const report = gradeSource(a.source, assignment.testCases, assignment.sourceRules)
        if (!report.assembled) continue
        for (const r of report.results) {
          const key = `${a.assignment_id}|${r.name}`
          const list = perTest.get(key) ?? []
          list.push({ assignment: a.assignment_id, test: r.name, runs: 1, fails: r.passed ? 0 : 1, user: a.user_id })
          perTest.set(key, list)
        }
      }
      setGraded(i)
      if (i < attempts.length) setTimeout(slice, 0)
      else setTestStats(perTest)
    }
    slice()
    return () => {
      cancelled = true
    }
  }, [attempts])

  const inGroup = useMemo(() => new Set(students.filter((s) => !group || s.class_group === group).map((s) => s.id)), [students, group])

  const predictRows = useMemo(() => {
    const byQ = new Map<string, PredictionRow[]>()
    for (const p of predictions.filter((x) => inGroup.has(x.user_id))) byQ.set(p.question_id, [...(byQ.get(p.question_id) ?? []), p])
    return [...byQ.entries()]
      .map(([id, rs]) => {
        const wrong = rs.filter((r) => !r.correct)
        const counts = new Map<string, number>()
        for (const w of wrong) counts.set(w.answer.trim(), (counts.get(w.answer.trim()) ?? 0) + 1)
        return {
          id,
          answers: rs.length,
          correctRate: (rs.length - wrong.length) / rs.length,
          common: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
        }
      })
      .sort((a, b) => a.correctRate - b.correctRate || b.answers - a.answers)
  }, [predictions, inGroup])

  const testRows = useMemo(() => [...testStats.values()]
    .map((list) => {
      const mine = list.filter((x) => inGroup.has(x.user))
      const runs = mine.length
      const fails = mine.reduce((n, x) => n + x.fails, 0)
      return { assignment: list[0].assignment, test: list[0].test, runs, failRate: runs ? fails / runs : 0 }
    })
    .filter((r) => r.runs > 0 && r.failRate > 0 && !r.test.startsWith('Rule:'))
    .sort((a, b) => b.failRate - a.failRate || b.runs - a.runs)
    .slice(0, 25), [testStats, inGroup])

  const reflectionsByModule = useMemo(() => {
    const byModule = new Map<string, ReflectionRow[]>()
    for (const r of reflections.filter((x) => inGroup.has(x.user_id))) byModule.set(r.module_id, [...(byModule.get(r.module_id) ?? []), r])
    return [...byModule.entries()].sort((a, b) => moduleNo(a[0]) - moduleNo(b[0]))
  }, [reflections, inGroup])

  const name = (id: string) => {
    const s = students.find((x) => x.id === id)
    return s ? s.full_name || s.email : ''
  }

  return (
    <div>
      <h3>Misconceptions</h3>
      <div className="admin-filters no-print">
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      {error && <p className="feedback-error">{error} -- re-run supabase/schema.sql if a table is missing.</p>}

      <h3>Predict questions</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Module</th><th>Question</th><th>Correct rate</th><th>Answers</th><th>Most common wrong answer</th></tr></thead>
          <tbody>
            {predictRows.map((r) => {
              const p = PREDICT_BY_ID.get(r.id)
              return (
                <tr key={r.id}>
                  <td>{p ? moduleLabel(p.moduleId) : ''}</td>
                  <td>{p ? p.q.question : r.id}{p?.q.code && <code className="admin-meta"> ({p.q.code.split('\n').join(' / ')})</code>}</td>
                  <td>{pct(r.correctRate)}</td>
                  <td>{r.answers}</td>
                  <td><code>{r.common}</code></td>
                </tr>
              )
            })}
            {predictRows.length === 0 && <tr><td colSpan={5} className="admin-empty">No Predict answers yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Test cases that fail most</h3>
      <p className="admin-meta">
        From the {attempts.length} newest test runs, re-run on their saved code
        {graded < attempts.length ? ` (checking… ${graded}/${attempts.length})` : ''}.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Assignment</th><th>Test</th><th>Fail rate</th><th>Runs</th></tr></thead>
          <tbody>
            {testRows.map((r) => (
              <tr key={`${r.assignment}|${r.test}`}>
                <td>{ASSIGNMENT_BY_ID.get(r.assignment)?.title ?? r.assignment}</td>
                <td>{r.test}</td>
                <td>{pct(r.failRate)}</td>
                <td>{r.runs}</td>
              </tr>
            ))}
            {testRows.length === 0 && graded >= attempts.length && <tr><td colSpan={4} className="admin-empty">No failing tests.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Reflections</h3>
      {reflectionsByModule.length === 0 && <p className="admin-empty">No reflections yet.</p>}
      {reflectionsByModule.map(([moduleId, rs]) => (
        <div key={moduleId}>
          <h4>{moduleLabel(moduleId)}: {LEARNING_PATH.find((m) => m.id === moduleId)?.title}</h4>
          <ul className="reflection-list">
            {rs.map((r, i) => (
              <li key={i}>
                “{r.body}” <span className="admin-meta">— {name(r.user_id)}, {new Date(r.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// End-of-term report
// ---------------------------------------------------------------------------

interface EventRow {
  user_id: string
  session_id: string | null
  kind: string
  assignment_id: string | null
  detail: Record<string, unknown>
}

interface SessionRow {
  id: string
  user_id: string
  active_seconds: number
}

interface QuizRow {
  user_id: string
  module_id: string
  passed: boolean
  created_at: string
}

interface Cell {
  completed: string
  testRuns: number
  highestHint: number
  accuracy: string
  minutes: number
}

export function EndOfTermReport({ students, groups, progress, quizAttempts, moduleDone }: {
  students: InsightStudent[]
  groups: string[]
  progress: ProgressRow[]
  quizAttempts: QuizRow[]
  moduleDone: ModuleDone
}) {
  const [group, setGroup] = useState('')
  const [steps, setSteps] = useState<StepRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [predictions, setPredictions] = useState<(PredictionRow & { module_id: string; source: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchWhere<StepRow>('module_progress', 'user_id, module_id, step, updated_at', (q) => q).catch(() => []),
      fetchWhere<EventRow>('activity_events', 'user_id, session_id, kind, assignment_id, detail', (q) => q.in('kind', ['hint', 'path_step'])).catch(() => []),
      fetchWhere<SessionRow>('study_sessions', 'id, user_id, active_seconds', (q) => q).catch(() => []),
      fetchWhere<PredictionRow & { module_id: string; source: string }>('predictions', 'user_id, module_id, question_id, answer, correct, source', (q) => q).catch(() => []),
    ]).then(([st, ev, se, pr]) => {
      setSteps(st)
      setEvents(ev)
      setSessions(se)
      setPredictions(pr)
      setLoading(false)
    })
  }, [])

  const shown = students.filter((s) => !group || s.class_group === group)

  // Active minutes per module are estimated: a lab session's time is split
  // evenly over the modules whose steps the student opened in it. Sessions
  // with no learning-path step opened count only in the student's total.
  const minutesByStudentModule = useMemo(() => {
    const modulesBySession = new Map<string, Set<string>>()
    for (const e of events.filter((x) => x.kind === 'path_step' && x.session_id)) {
      const m = String(e.detail.module ?? '')
      if (m) modulesBySession.set(e.session_id as string, (modulesBySession.get(e.session_id as string) ?? new Set()).add(m))
    }
    const out = new Map<string, number>()
    for (const s of sessions) {
      const mods = modulesBySession.get(s.id)
      if (!mods) continue
      for (const m of mods) out.set(`${s.user_id}|${m}`, (out.get(`${s.user_id}|${m}`) ?? 0) + s.active_seconds / 60 / mods.size)
    }
    return out
  }, [events, sessions])

  function cell(studentId: string, moduleId: string): Cell {
    const m = LEARNING_PATH.find((x) => x.id === moduleId)!
    const row = steps.find((x) => x.user_id === studentId && x.module_id === moduleId)
    const mine = progress.filter((p) => p.user_id === studentId && m.assignments.includes(p.assignment_id))
    let completed = ''
    if (moduleDone(studentId, moduleId, row?.step)) {
      // The last thing that finished it: a quiz pass, the last assignment passed, or the stored 'done' step.
      const dates = [
        ...quizAttempts.filter((q) => q.user_id === studentId && q.module_id === moduleId && q.passed).map((q) => q.created_at).slice(0, 1),
        ...mine.map((p) => p.first_passed_at).filter((d): d is string => !!d),
        ...(row?.step === 'done' ? [row.updated_at] : []),
      ].sort()
      completed = (dates[dates.length - 1] ?? '').slice(0, 10)
    }
    const hints = events.filter((e) => e.kind === 'hint' && e.user_id === studentId && m.assignments.includes(e.assignment_id ?? ''))
    const preds = predictions.filter((p) => p.user_id === studentId && p.module_id === moduleId && p.source === 'predict')
    return {
      completed,
      testRuns: mine.reduce((n, p) => n + p.attempt_count, 0),
      highestHint: Math.max(0, ...hints.map((h) => Number(h.detail.level) || 0)),
      accuracy: preds.length ? pct(preds.filter((p) => p.correct).length / preds.length) : '',
      minutes: Math.round(minutesByStudentModule.get(`${studentId}|${moduleId}`) ?? 0),
    }
  }

  const cellText = (c: Cell) => [
    c.completed ? `✓ ${c.completed}` : '',
    c.testRuns ? `${c.testRuns} runs` : '',
    c.highestHint ? `hint ${c.highestHint}` : '',
    c.accuracy ? `predict ${c.accuracy}` : '',
    c.minutes ? `${c.minutes} min` : '',
  ].filter(Boolean).join(' · ')

  function exportCsv() {
    const header = ['Full name', 'Student no', 'Group', 'Placement', 'Active minutes']
    LEARNING_PATH.forEach((_, i) => {
      for (const col of ['Completed', 'Test runs', 'Highest hint', 'Prediction accuracy', 'Active minutes']) header.push(`Module ${i} ${col}`)
    })
    downloadCsv(`x86sim-end-of-term-${today()}.csv`, header, shown.map((s) => {
      const row: (string | number)[] = [
        s.full_name, s.student_no, s.class_group,
        s.placement_score == null ? '' : `${s.placement_score}/8`,
        Math.round(s.total_seconds / 60),
      ]
      for (const m of LEARNING_PATH) {
        const c = cell(s.id, m.id)
        row.push(c.completed, c.testRuns, c.highestHint || '', c.accuracy, c.minutes || '')
      }
      return row
    }))
  }

  return (
    <div className="end-of-term">
      <div className="admin-header">
        <h3>End-of-term report</h3>
        <div className="admin-actions no-print">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={exportCsv} disabled={loading}>⬇ End-of-term CSV</button>
          <button onClick={() => window.print()} disabled={loading}>🖨 Print / PDF</button>
        </div>
      </div>
      <p className="admin-meta">
        Each cell: completed date · test runs · highest hint opened · Predict accuracy · active minutes. Active minutes
        per module are an estimate (a session's time is split over the modules opened in it); the student's total is
        exact.
      </p>
      {loading ? <p className="status">Loading…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table end-of-term-table">
            <thead>
              <tr>
                <th>Student</th><th>Group</th><th>Placement</th><th>Active minutes</th>
                {LEARNING_PATH.map((m, i) => <th key={m.id} title={m.title}>M{i}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td>{s.full_name || s.email}<div className="admin-meta">{s.student_no}</div></td>
                  <td>{s.class_group}</td>
                  <td>{s.placement_score == null ? '–' : `${s.placement_score}/8`}</td>
                  <td>{Math.round(s.total_seconds / 60)}</td>
                  {LEARNING_PATH.map((m) => <td key={m.id} className="end-of-term-cell">{cellText(cell(s.id, m.id))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
