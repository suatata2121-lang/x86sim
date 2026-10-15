import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../backend/client'
import { CURRICULUM, type Assignment } from '../curriculum'
import {
  LEARNING_PATH, STEPS, checklist, moduleStatus, type ChecklistRow, type LearningModule, type ModuleProgressRow,
  type PathProgress,
} from '../learningPath'
import { QUIZZES, type QuizAnswer } from '../quizzes'
import { checklistRowLabel, conceptTitle } from './LearningPathCard'
import { KIND_LABELS, type FeedbackKind } from './FeedbackDialog'

// Instructor-only panel: who is using the lab, how long, and how far each
// student got through the curriculum. Row-level security on the database is
// what actually restricts this data to admins; this component only renders it.

const PAGE_SIZE = 1000
// The inbox refreshes itself so new messages show up during a lab session.
const FEEDBACK_REFRESH_MS = 30_000

interface StudentSummary {
  id: string
  email: string
  full_name: string
  student_no: string
  class_group: string
  role: 'student' | 'admin'
  created_at: string
  last_seen_at: string | null
  total_seconds: number
  session_count: number
  attempt_count: number
  completed_count: number
  event_count: number
}

interface Progress {
  user_id: string
  assignment_id: string
  attempt_count: number
  best_passed: number
  total_count: number
  passed: boolean
  first_passed_at: string | null
  last_attempt_at: string
}

interface Attempt {
  id: number
  assignment_id: string
  passed_count: number
  total_count: number
  assembled: boolean
  passed: boolean
  source: string
  created_at: string
}

interface ActivityEvent {
  id: number
  kind: string
  assignment_id: string | null
  detail: Record<string, unknown>
  created_at: string
}

interface StudySession {
  id: string
  started_at: string
  last_seen_at: string
  active_seconds: number
}

interface QuizAttempt {
  id: number
  user_id: string
  module_id: string
  score: number
  total: number
  passed: boolean
  answers: QuizAnswer[]
  created_at: string
}

/** A row of the question pool; admins can read it, students can't (answers stay server-side). */
interface QuizQuestion {
  id: string
  module_id: string
  topic_id: string
  question: string
  active: boolean
}

interface ConceptRead {
  user_id?: string
  module_id: string
  concept_id: string
  read_at: string
}

interface InteractiveRun {
  user_id?: string
  module_id: string
  item_id: string
  done_at: string
}

const QUIZ_MODULES = LEARNING_PATH.filter((m) => m.quiz)

function groupIds<T>(rows: T[], module: (r: T) => string, id: (r: T) => string) {
  const byModule = new Map<string, Set<string>>()
  for (const r of rows) byModule.set(module(r), (byModule.get(module(r)) ?? new Set()).add(id(r)))
  return byModule
}

/** One student's checklist state, from rows already filtered to that student. */
function progressOf(passedIds: Set<string>, attempts: QuizAttempt[], reads: ConceptRead[], runs: InteractiveRun[]): PathProgress {
  return {
    completed: passedIds,
    quizzesPassed: new Set(attempts.filter((q) => q.passed).map((q) => q.module_id)),
    reads: groupIds(reads, (r) => r.module_id, (r) => r.concept_id),
    interactives: groupIds(runs, (r) => r.module_id, (r) => r.item_id),
  }
}

type FeedbackStatus = 'new' | 'seen' | 'done'

interface FeedbackItem {
  id: number
  kind: FeedbackKind
  message: string
  reply_email: string | null
  code: string | null
  context: { tab?: string; assignment?: string | null; section?: string }
  status: FeedbackStatus
  created_at: string
  profiles: { full_name: string; student_no: string; class_group: string; email: string } | null
}

const ASSIGNMENTS: { assignment: Assignment; stageTitle: string; taskTitle: string }[] = CURRICULUM.flatMap((stage) =>
  stage.tasks.flatMap((task) =>
    task.assignments.map((assignment) => ({ assignment, stageTitle: stage.title, taskTitle: task.title })),
  ),
)
const ASSIGNMENT_TITLES = new Map(ASSIGNMENTS.map((a) => [a.assignment.id, a.assignment.title]))

const moduleLabel = (id: string) => {
  const i = LEARNING_PATH.findIndex((m) => m.id === id)
  return i >= 0 ? `Module ${i}` : id
}

function topicTitle(moduleId: string, conceptId: string): string {
  const ref = LEARNING_PATH.find((m) => m.id === moduleId)?.concepts.find((c) => c.id === conceptId)
  return ref ? conceptTitle(ref) : conceptId
}

// Supabase caps a single select at 1000 rows, so page through bigger tables.
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  if (!supabase) return []
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '-'
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // The BOM makes Excel open UTF-8 (Turkish characters) correctly.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function AdminView({ onClose }: { onClose: () => void }) {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [allReads, setAllReads] = useState<ConceptRead[]>([])
  const [allRuns, setAllRuns] = useState<InteractiveRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAll<StudentSummary>('student_summary', '*'),
      fetchAll<Progress>('assignment_progress', '*'),
      // Until schema.sql is re-run the table doesn't exist; the rest of the report still loads.
      fetchAll<QuizAttempt>('quiz_attempts', 'id, user_id, module_id, score, total, passed, answers, created_at').catch(() => []),
      fetchAll<QuizQuestion>('quiz_questions', 'id, module_id, topic_id, question, active').catch(() => []),
      fetchAll<ConceptRead>('concept_reads', 'user_id, module_id, concept_id, read_at').catch(() => []),
      fetchAll<InteractiveRun>('interactive_runs', 'user_id, module_id, item_id, done_at').catch(() => []),
    ])
      .then(([s, p, q, qq, cr, ir]) => {
        if (cancelled) return
        setStudents(s.filter((row) => row.role === 'student'))
        setProgress(p)
        setQuizAttempts(q)
        setQuizQuestions(qq)
        setAllReads(cr)
        setAllRuns(ir)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const groups = useMemo(() => [...new Set(students.map((s) => s.class_group).filter(Boolean))].sort(), [students])

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    return students
      .filter((s) => !group || s.class_group === group)
      .filter((s) => !q || [s.full_name, s.student_no, s.email].some((v) => v.toLocaleLowerCase('tr').includes(q)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'))
  }, [students, search, group])

  const visibleIds = useMemo(() => new Set(visible.map((s) => s.id)), [visible])

  const perAssignment = useMemo(
    () =>
      ASSIGNMENTS.map(({ assignment, taskTitle }) => {
        const rows = progress.filter((p) => p.assignment_id === assignment.id && visibleIds.has(p.user_id))
        const passed = rows.filter((r) => r.passed).length
        const attempts = rows.reduce((n, r) => n + r.attempt_count, 0)
        return { assignment, taskTitle, tried: rows.length, passed, attempts }
      }),
    [progress, visibleIds],
  )

  // Per quiz: who passed, how many tries it takes, and which questions are missed most.
  const perQuiz = useMemo(
    () =>
      QUIZZES.map((quiz) => {
        const rows = quizAttempts.filter((a) => a.module_id === quiz.id && visibleIds.has(a.user_id))
        const triedBy = new Set(rows.map((a) => a.user_id))
        const passedBy = new Set(rows.filter((a) => a.passed).map((a) => a.user_id))
        // Retired questions (active = false) still show if someone was asked them.
        const questions = quizQuestions
          .filter((q) => q.module_id === quiz.id)
          .map((q) => {
            const answers = rows.flatMap((a) => a.answers.filter((x) => x.question_id === q.id))
            const wrong = answers.filter((x) => !x.correct).length
            return { question: q, asked: answers.length, wrong, rate: answers.length ? wrong / answers.length : 0 }
          })
          .filter((q) => q.question.active || q.asked > 0)
          .sort((a, b) => b.rate - a.rate || b.asked - a.asked)
        // Where students get stuck: how many finished each checklist row.
        const module = LEARNING_PATH.find((m) => m.id === quiz.id)
        const rowCounts: { label: string; done: number }[] = []
        if (module) {
          for (const sid of visibleIds) {
            const passedIds = new Set(progress.filter((p) => p.user_id === sid && p.passed).map((p) => p.assignment_id))
            const list = checklist(module, progressOf(
              passedIds,
              quizAttempts.filter((a) => a.user_id === sid),
              allReads.filter((r) => r.user_id === sid),
              allRuns.filter((r) => r.user_id === sid),
            ))
            list.forEach((r, i) => {
              // Without the student's own "(n/5)" counter.
              rowCounts[i] ??= { label: checklistRowLabel(module, r).replace(/\s*\(\d+\/\d+\)$/, ''), done: 0 }
              if (r.done) rowCounts[i].done++
            })
          }
        }
        return { quiz, attempts: rows.length, tried: triedBy.size, passed: passedBy.size, questions, rowCounts }
      }),
    [quizAttempts, quizQuestions, visibleIds, progress, allReads, allRuns],
  )

  const selected = students.find((s) => s.id === selectedId) ?? null

  function exportStudents() {
    downloadCsv(
      `x86sim-students-${today()}.csv`,
      ['Full name', 'Student no', 'Group', 'Email', 'Active minutes', 'Visits', 'Assignments passed', `Of ${ASSIGNMENTS.length}`, 'Test runs', 'Registered', 'Last seen'],
      visible.map((s) => [
        s.full_name, s.student_no, s.class_group, s.email,
        Math.round(s.total_seconds / 60), s.session_count, s.completed_count, ASSIGNMENTS.length,
        s.attempt_count, formatDate(s.created_at), formatDate(s.last_seen_at),
      ]),
    )
  }

  function exportGradebook() {
    const byKey = new Map(progress.map((p) => [`${p.user_id}|${p.assignment_id}`, p]))
    downloadCsv(
      `x86sim-gradebook-${today()}.csv`,
      ['Full name', 'Student no', 'Group', ...ASSIGNMENTS.map((a) => a.assignment.title)],
      visible.map((s) => [
        s.full_name, s.student_no, s.class_group,
        ...ASSIGNMENTS.map(({ assignment }) => {
          const p = byKey.get(`${s.id}|${assignment.id}`)
          if (!p) return ''
          return p.passed ? 'passed' : `${p.best_passed}/${p.total_count}`
        }),
      ]),
    )
  }

  if (selected) {
    return (
      <StudentDetail
        student={selected}
        progress={progress.filter((p) => p.user_id === selected.id)}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  const totalSeconds = visible.reduce((n, s) => n + s.total_seconds, 0)
  const activeLastWeek = visible.filter((s) => s.last_seen_at && Date.now() - Date.parse(s.last_seen_at) < 7 * 86400_000).length

  return (
    <div className="admin">
      <div className="admin-header">
        <h2>Lab report</h2>
        <div className="admin-actions no-print">
          <button onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>↻ Refresh</button>
          <button onClick={exportStudents} disabled={loading}>⬇ Students CSV</button>
          <button onClick={exportGradebook} disabled={loading}>⬇ Gradebook CSV</button>
          <button onClick={() => window.print()} disabled={loading}>🖨 Print / PDF</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>

      <FeedbackInbox />

      <h3>Students</h3>
      <div className="admin-filters no-print">
        <input placeholder="Search name, number or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {error && <p className="feedback-error">Couldn't load the report: {error}</p>}
      {loading ? (
        <p className="status">Loading…</p>
      ) : (
        <>
          <div className="admin-stats">
            <div><strong>{visible.length}</strong><span>students</span></div>
            <div><strong>{activeLastWeek}</strong><span>active in the last 7 days</span></div>
            <div><strong>{formatDuration(totalSeconds)}</strong><span>total lab time</span></div>
            <div>
              <strong>{visible.length ? (visible.reduce((n, s) => n + s.completed_count, 0) / visible.length).toFixed(1) : '0'}</strong>
              <span>avg. assignments passed (of {ASSIGNMENTS.length})</span>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th><th>Student no</th><th>Group</th><th>Lab time</th><th>Visits</th>
                  <th>Passed</th><th>Test runs</th><th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)} className="admin-row-link">
                    <td>{s.full_name || s.email}</td>
                    <td>{s.student_no}</td>
                    <td>{s.class_group}</td>
                    <td>{formatDuration(s.total_seconds)}</td>
                    <td>{s.session_count}</td>
                    <td>
                      <ProgressBar value={s.completed_count} max={ASSIGNMENTS.length} />
                    </td>
                    <td>{s.attempt_count}</td>
                    <td>{formatDate(s.last_seen_at)}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="admin-empty">No students yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {perQuiz.map(({ quiz, attempts, tried, passed, questions, rowCounts }) => (
            <div key={quiz.id}>
              <h3>{quiz.title}</h3>
              <div className="admin-stats">
                <div>
                  <strong>{passed} / {visible.length}</strong>
                  <span>passed ({visible.length ? Math.round((100 * passed) / visible.length) : 0}%)</span>
                </div>
                <div><strong>{tried}</strong><span>took the quiz</span></div>
                <div><strong>{tried ? (attempts / tried).toFixed(1) : '0'}</strong><span>avg. attempts per student who took it</span></div>
              </div>
              {rowCounts.length > 0 && (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Checklist item</th><th>Students who finished it</th></tr></thead>
                    <tbody>
                      {rowCounts.map((r) => (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          <td><ProgressBar value={r.done} max={visible.length} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Most missed questions</th><th>Topic</th><th>Asked</th><th>Wrong</th></tr></thead>
                  <tbody>
                    {questions.map(({ question, asked, wrong, rate }) => (
                      <tr key={question.id}>
                        <td>{question.question}</td>
                        <td>{topicTitle(quiz.id, question.topic_id)}</td>
                        <td>{asked}</td>
                        <td>{asked ? `${Math.round(rate * 100)}% (${wrong})` : '-'}</td>
                      </tr>
                    ))}
                    {questions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="admin-empty">
                          No questions loaded yet: run the question seed files in the Supabase SQL editor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <h3>Assignments</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Task</th><th>Assignment</th><th>Tried</th><th>Passed</th><th>Test runs</th></tr>
              </thead>
              <tbody>
                {perAssignment.map((a) => (
                  <tr key={a.assignment.id}>
                    <td>{a.taskTitle}</td>
                    <td>{a.assignment.title}</td>
                    <td>{a.tried}</td>
                    <td><ProgressBar value={a.passed} max={visible.length} /></td>
                    <td>{a.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function FeedbackInbox() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [openCode, setOpenCode] = useState<FeedbackItem | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) return
      const { data, error } = await supabase
        .from('feedback')
        .select('id, kind, message, reply_email, code, context, status, created_at, profiles(full_name, student_no, class_group, email)')
        .order('created_at', { ascending: false })
        .limit(500)
      if (cancelled) return
      setError(error ? error.message : null)
      if (data) setItems(data as unknown as FeedbackItem[])
    }
    void load()
    const timer = window.setInterval(load, FEEDBACK_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!openCode) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenCode(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openCode])

  async function setStatus(item: FeedbackItem, status: FeedbackStatus) {
    if (!supabase) return
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)))
    const { error } = await supabase.from('feedback').update({ status }).eq('id', item.id)
    if (error) setError(error.message)
  }

  const from = (i: FeedbackItem) =>
    i.profiles ? `${i.profiles.full_name || i.profiles.email}${i.profiles.student_no ? ` (${i.profiles.student_no})` : ''}` : i.reply_email || 'Anonymous'
  const where = (i: FeedbackItem) =>
    [i.context.tab, i.context.assignment ? ASSIGNMENT_TITLES.get(i.context.assignment) ?? i.context.assignment : null]
      .filter(Boolean).join(' · ')

  function exportFeedback() {
    downloadCsv(
      `x86sim-feedback-${today()}.csv`,
      ['Time', 'From', 'Group', 'Type', 'Status', 'Message', 'Where', 'Code'],
      items.map((i) => [
        formatDate(i.created_at), from(i), i.profiles?.class_group ?? '', KIND_LABELS[i.kind], i.status,
        i.message, where(i), i.code ?? '',
      ]),
    )
  }

  const newCount = items.filter((i) => i.status === 'new').length
  const shown = showAll ? items : items.filter((i) => i.status !== 'done')

  return (
    <>
      <div className="admin-header">
        <h3>Feedback {newCount > 0 && <span className="admin-badge tried">{newCount} new</span>}</h3>
        <div className="admin-actions no-print">
          <label className="feedback-checkbox">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show done
          </label>
          <button onClick={exportFeedback} disabled={items.length === 0}>⬇ Feedback CSV</button>
        </div>
      </div>
      {error && <p className="feedback-error">Couldn't load feedback: {error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Time</th><th>From</th><th>Type</th><th>Message</th><th>Where</th><th className="no-print">Status</th></tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className={i.status === 'new' ? 'feedback-row-new' : undefined}>
                <td>{formatDate(i.created_at)}</td>
                <td>{from(i)}</td>
                <td>{KIND_LABELS[i.kind]}</td>
                <td className="feedback-message">
                  {i.message}
                  {i.code && <> <button className="link-button no-print" onClick={() => setOpenCode(i)}>View code</button></>}
                </td>
                <td>{where(i) || '-'}</td>
                <td className="no-print">
                  <div className="feedback-status">
                    {i.status === 'new' && <button onClick={() => setStatus(i, 'seen')}>Seen</button>}
                    {i.status !== 'done'
                      ? <button onClick={() => setStatus(i, 'done')}>Done ✓</button>
                      : <button onClick={() => setStatus(i, 'seen')}>Reopen</button>}
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">{items.length ? 'Nothing open.' : 'No feedback yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openCode && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpenCode(null)}>
          <div className="modal admin-code-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>{from(openCode)}</h2>
              <button className="modal-close" onClick={() => setOpenCode(null)} aria-label="Close">×</button>
            </div>
            <p className="admin-meta">{formatDate(openCode.created_at)} · {where(openCode) || '-'}</p>
            <pre className="admin-code">{openCode.code}</pre>
          </div>
        </div>
      )}
    </>
  )
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <span className="admin-progress" title={`${pct}%`}>
      <span className="admin-progress-track"><span style={{ width: `${pct}%` }} /></span>
      {value}/{max}
    </span>
  )
}

function StudentDetail({ student, progress, onBack }: { student: StudentSummary; progress: Progress[]; onBack: () => void }) {
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [pathRows, setPathRows] = useState<ModuleProgressRow[]>([])
  const [reads, setReads] = useState<ConceptRead[]>([])
  const [runs, setRuns] = useState<InteractiveRun[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [openAttempt, setOpenAttempt] = useState<Attempt | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('assignment_attempts').select('*').eq('user_id', student.id).order('created_at', { ascending: false }).limit(500),
      supabase.from('activity_events').select('id, kind, assignment_id, detail, created_at').eq('user_id', student.id).order('created_at', { ascending: false }).limit(300),
      supabase.from('study_sessions').select('id, started_at, last_seen_at, active_seconds').eq('user_id', student.id).order('started_at', { ascending: false }).limit(200),
      supabase.from('module_progress').select('module_id, step, updated_at').eq('user_id', student.id),
      supabase.from('concept_reads').select('module_id, concept_id, read_at').eq('user_id', student.id).order('read_at'),
      supabase.from('quiz_attempts').select('*').eq('user_id', student.id).order('created_at', { ascending: false }),
      supabase.from('interactive_runs').select('module_id, item_id, done_at').eq('user_id', student.id),
    ]).then(([a, e, s, m, r, q, ir]) => {
      const err = a.error ?? e.error ?? s.error ?? m.error ?? r.error ?? q.error ?? ir.error
      if (err) setError(err.message)
      setAttempts((a.data ?? []) as Attempt[])
      setEvents((e.data ?? []) as ActivityEvent[])
      setSessions((s.data ?? []) as StudySession[])
      setPathRows((m.data ?? []) as ModuleProgressRow[])
      setReads((r.data ?? []) as ConceptRead[])
      setQuizAttempts((q.data ?? []) as QuizAttempt[])
      setRuns((ir.data ?? []) as InteractiveRun[])
    })
  }, [student.id])

  useEffect(() => {
    if (!openAttempt) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenAttempt(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openAttempt])

  const byAssignment = new Map(progress.map((p) => [p.assignment_id, p]))
  const passedIds = new Set(progress.filter((p) => p.passed).map((p) => p.assignment_id))
  const byModule = new Map(pathRows.map((r) => [r.module_id, r]))
  const pathProgress = progressOf(passedIds, quizAttempts, reads, runs)

  // When a checklist row was finished, as far as the data says.
  function rowDate(m: LearningModule, r: ChecklistRow): string | null {
    if (r.kind === 'read') return reads.find((x) => x.module_id === m.id && x.concept_id === r.concept.id)?.read_at ?? null
    if (r.kind === 'interactive') {
      const ids = r.item.parts ?? [r.item.id]
      const dates = runs.filter((x) => x.module_id === m.id && ids.includes(x.item_id)).map((x) => x.done_at).sort()
      return r.done ? dates[dates.length - 1] ?? null : null
    }
    if (r.kind === 'tasks') {
      const dates = m.assignments.map((id) => byAssignment.get(id)?.first_passed_at ?? null)
      return dates.every(Boolean) ? (dates as string[]).sort()[dates.length - 1] : null
    }
    return quizAttempts.filter((q) => q.module_id === m.id && q.passed).map((q) => q.created_at).sort()[0] ?? null
  }

  function exportAttempts() {
    downloadCsv(
      `x86sim-${student.student_no || student.id}-attempts-${today()}.csv`,
      ['Time', 'Assignment', 'Assembled', 'Passed tests', 'Total tests', 'Passed', 'Source'],
      attempts.map((a) => [
        formatDate(a.created_at), ASSIGNMENT_TITLES.get(a.assignment_id) ?? a.assignment_id,
        a.assembled ? 'yes' : 'no', a.passed_count, a.total_count, a.passed ? 'yes' : 'no', a.source,
      ]),
    )
  }

  return (
    <div className="admin">
      <div className="admin-header">
        <h2>{student.full_name || student.email}</h2>
        <div className="admin-actions no-print">
          <button onClick={exportAttempts}>⬇ Attempts CSV</button>
          <button onClick={() => window.print()}>🖨 Print / PDF</button>
          <button onClick={onBack}>← All students</button>
        </div>
      </div>
      <p className="admin-meta">
        {student.student_no && <>No: {student.student_no} · </>}
        {student.class_group && <>Group: {student.class_group} · </>}
        {student.email} · Registered {formatDate(student.created_at)} · Last seen {formatDate(student.last_seen_at)}
      </p>

      {error && <p className="feedback-error">{error}</p>}

      <div className="admin-stats">
        <div><strong>{formatDuration(student.total_seconds)}</strong><span>lab time</span></div>
        <div><strong>{student.session_count}</strong><span>visits</span></div>
        <div><strong>{student.completed_count}/{ASSIGNMENTS.length}</strong><span>assignments passed</span></div>
        <div><strong>{student.attempt_count}</strong><span>test runs</span></div>
      </div>

      <h3>Learning path</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Module</th><th>Status</th><th>Current step</th><th>Assignments passed</th><th>Last opened</th></tr>
          </thead>
          <tbody>
            {LEARNING_PATH.map((m, i) => {
              const row = byModule.get(m.id)
              const status = moduleStatus(m, pathProgress, row?.step)
              return (
                <tr key={m.id}>
                  <td>{i}. {m.title}</td>
                  <td>
                    <span className={`admin-badge ${status === 'done' ? 'passed' : status === 'in-progress' ? 'tried' : ''}`}>
                      {status === 'done' ? 'Done' : status === 'in-progress' ? 'In progress' : 'Not started'}
                    </span>
                  </td>
                  <td>{status === 'done' || !row ? '-' : STEPS.find((s) => s.id === row.step)?.label ?? row.step}</td>
                  <td>{m.assignments.length > 0 ? `${m.assignments.filter((id) => passedIds.has(id)).length}/${m.assignments.length}` : '-'}</td>
                  <td>{formatDate(row?.updated_at ?? null)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>Module checklists</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Module</th><th>Item</th><th>Done</th></tr></thead>
          <tbody>
            {QUIZ_MODULES.flatMap((m) =>
              checklist(m, pathProgress).map((r, i) => {
                const date = rowDate(m, r)
                return (
                  <tr key={`${m.id}-${i}`}>
                    <td>{moduleLabel(m.id)}</td>
                    <td>{checklistRowLabel(m, r)}</td>
                    <td>
                      {r.done
                        ? <span className="admin-badge passed">{date ? formatDate(date) : 'Done'}</span>
                        : 'not yet'}
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>

      <h3>Quiz attempts</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Time</th><th>Quiz</th><th>Score</th><th>Result</th></tr></thead>
          <tbody>
            {quizAttempts.map((q) => (
              <tr key={q.id}>
                <td>{formatDate(q.created_at)}</td>
                <td>{moduleLabel(q.module_id)}</td>
                <td>{q.score}/{q.total}</td>
                <td><span className={`admin-badge ${q.passed ? 'passed' : 'tried'}`}>{q.passed ? 'Passed' : 'Failed'}</span></td>
              </tr>
            ))}
            {quizAttempts.length === 0 && <tr><td colSpan={4} className="admin-empty">No quiz attempts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Curriculum progress</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Task</th><th>Assignment</th><th>Status</th><th>Best score</th><th>Test runs</th><th>First passed</th></tr>
          </thead>
          <tbody>
            {ASSIGNMENTS.map(({ assignment, taskTitle }) => {
              const p = byAssignment.get(assignment.id)
              return (
                <tr key={assignment.id}>
                  <td>{taskTitle}</td>
                  <td>{assignment.title}</td>
                  <td>
                    <span className={`admin-badge ${p?.passed ? 'passed' : p ? 'tried' : ''}`}>
                      {p?.passed ? 'Passed' : p ? 'In progress' : 'Not started'}
                    </span>
                  </td>
                  <td>{p ? `${p.best_passed}/${p.total_count}` : '-'}</td>
                  <td>{p?.attempt_count ?? 0}</td>
                  <td>{formatDate(p?.first_passed_at ?? null)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>Test runs</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Time</th><th>Assignment</th><th>Result</th><th className="no-print">Code</th></tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td>{formatDate(a.created_at)}</td>
                <td>{ASSIGNMENT_TITLES.get(a.assignment_id) ?? a.assignment_id}</td>
                <td>{a.assembled ? `${a.passed_count}/${a.total_count}${a.passed ? ' ✓' : ''}` : 'Assemble error'}</td>
                <td className="no-print"><button className="link-button" onClick={() => setOpenAttempt(a)}>View</button></td>
              </tr>
            ))}
            {attempts.length === 0 && <tr><td colSpan={4} className="admin-empty">No test runs yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Recent activity</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Time</th><th>Action</th><th>Assignment</th><th>Detail</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.created_at)}</td>
                <td>{e.kind.replace('_', ' ')}</td>
                <td>{e.assignment_id ? ASSIGNMENT_TITLES.get(e.assignment_id) ?? e.assignment_id : ''}</td>
                <td>{Object.entries(e.detail).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={4} className="admin-empty">No activity yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Visits</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Started</th><th>Last seen</th><th>Active time</th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.started_at)}</td>
                <td>{formatDate(s.last_seen_at)}</td>
                <td>{formatDuration(s.active_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openAttempt && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpenAttempt(null)}>
          <div className="modal admin-code-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>{ASSIGNMENT_TITLES.get(openAttempt.assignment_id) ?? openAttempt.assignment_id}</h2>
              <button className="modal-close" onClick={() => setOpenAttempt(null)} aria-label="Close">×</button>
            </div>
            <p className="admin-meta">
              {formatDate(openAttempt.created_at)} ·{' '}
              {openAttempt.assembled ? `${openAttempt.passed_count}/${openAttempt.total_count} tests passed` : 'Did not assemble'}
            </p>
            <pre className="admin-code">{openAttempt.source}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
