// Instructor tools for running the lab week by week (#13): the module
// schedule, the "Needs help" list, comments under a test run and a
// per-student extension. Kept out of AdminView.tsx, which is the report.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../backend/client'
import { effectiveDates, isOpenNow, type ScheduleRow } from '../backend/schedule'
import { CURRICULUM } from '../curriculum'
import { LEARNING_PATH } from '../learningPath'

const ASSIGNMENT_TITLES = new Map(CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments)).map((a) => [a.id, a.title]))
const moduleName = (id: string) => {
  const i = LEARNING_PATH.findIndex((m) => m.id === id)
  return i >= 0 ? `Module ${i}: ${LEARNING_PATH[i].title}` : id
}

/** ISO -> the value a datetime-local input wants, in local time. */
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'

async function loadSchedule(): Promise<ScheduleRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('module_schedule').select('id, module_id, class_group, user_id, opens_at, due_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as ScheduleRow[]
}

// One row per module and target: update the existing one, or add it.
async function saveRow(row: Omit<ScheduleRow, 'id'>) {
  if (!supabase) return
  let q = supabase.from('module_schedule').select('id').eq('module_id', row.module_id)
  q = row.class_group ? q.eq('class_group', row.class_group) : q.is('class_group', null)
  q = row.user_id ? q.eq('user_id', row.user_id) : q.is('user_id', null)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const existing = (data ?? [])[0] as { id: number } | undefined
  const values = { ...row, updated_at: new Date().toISOString() }
  const res = existing
    ? await supabase.from('module_schedule').update(values).eq('id', existing.id)
    : await supabase.from('module_schedule').insert(values)
  if (res.error) throw new Error(res.error.message)
}

// ---------------------------------------------------------------------------
// Schedule tab
// ---------------------------------------------------------------------------

export function ScheduleTab({ groups }: { groups: string[] }) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [moduleId, setModuleId] = useState(LEARNING_PATH[0].id)
  const [group, setGroup] = useState('')
  const [opens, setOpens] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  function reload() {
    loadSchedule().then(setRows).catch((e) => setError(`${e.message} -- re-run supabase/schema.sql if the table is missing.`))
  }
  useEffect(reload, [])

  // Picking a module/group that already has dates fills them in, so saving edits it.
  useEffect(() => {
    const r = rows.find((x) => x.module_id === moduleId && !x.user_id && (x.class_group ?? '') === group)
    setOpens(toLocalInput(r?.opens_at ?? null))
    setDue(toLocalInput(r?.due_at ?? null))
  }, [moduleId, group, rows])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await saveRow({ module_id: moduleId, class_group: group || null, user_id: null, opens_at: fromLocalInput(opens), due_at: fromLocalInput(due) })
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!supabase) return
    const { error: err } = await supabase.from('module_schedule').delete().eq('id', id)
    if (err) setError(err.message)
    reload()
  }

  const order = (r: ScheduleRow) => LEARNING_PATH.findIndex((m) => m.id === r.module_id)
  const groupRows = rows.filter((r) => !r.user_id).sort((a, b) => order(a) - order(b) || (a.class_group ?? '').localeCompare(b.class_group ?? ''))

  return (
    <div>
      <h3>Schedule</h3>
      <p className="example-description">
        A module opens on its date for the chosen group (or every group) and shows its due date on the students'
        learning-path card. Before it opens the card says "Opens on …" and doesn't suggest it, but the pages stay
        reachable. A student's own extension (set on their page) overrides the group's dates.
      </p>
      <div className="admin-filters schedule-form no-print">
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          {LEARNING_PATH.map((m) => <option key={m.id} value={m.id}>{moduleName(m.id)}</option>)}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label>Opens on <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} /></label>
        <label>Due <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <button className="primary" onClick={save} disabled={busy}>Save</button>
      </div>
      {error && <p className="feedback-error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Module</th><th>Group</th><th>Opens on</th><th>Due</th><th className="no-print" /></tr></thead>
          <tbody>
            {groupRows.map((r) => (
              <tr key={r.id}>
                <td>{moduleName(r.module_id)}</td>
                <td>{r.class_group || 'All groups'}</td>
                <td>{shortDate(r.opens_at)}</td>
                <td>{shortDate(r.due_at)}</td>
                <td className="no-print">
                  <button className="link-button" onClick={() => { setModuleId(r.module_id); setGroup(r.class_group ?? '') }}>Edit</button>
                  {' · '}
                  <button className="link-button" onClick={() => remove(r.id)}>Remove</button>
                </td>
              </tr>
            ))}
            {groupRows.length === 0 && <tr><td colSpan={5} className="admin-empty">No dates set: every module is open, nothing is due.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-student extension (on the student's page)
// ---------------------------------------------------------------------------

export function ExtendForStudent({ studentId, group }: { studentId: string; group: string }) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [moduleId, setModuleId] = useState(LEARNING_PATH[0].id)
  const [due, setDue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    loadSchedule().then(setRows).catch((e) => setError(e.message))
  }
  useEffect(reload, [])

  const own = rows.filter((r) => r.user_id === studentId)
  const groupDates = effectiveDates(rows.filter((r) => !r.user_id), moduleId, null, group || null)

  async function save() {
    setError(null)
    try {
      await saveRow({ module_id: moduleId, class_group: null, user_id: studentId, opens_at: groupDates?.opensAt ?? null, due_at: fromLocalInput(due) })
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove(id: number) {
    if (!supabase) return
    await supabase.from('module_schedule').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <h3>Extend for this student</h3>
      <div className="admin-filters schedule-form no-print">
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
          {LEARNING_PATH.map((m) => <option key={m.id} value={m.id}>{moduleName(m.id)}</option>)}
        </select>
        <span className="admin-meta">Group due: {shortDate(groupDates?.dueAt ?? null)}</span>
        <label>New due date <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <button onClick={save} disabled={!due}>Extend</button>
      </div>
      {error && <p className="feedback-error">{error}</p>}
      {own.length > 0 && (
        <ul className="admin-meta">
          {own.map((r) => (
            <li key={r.id}>
              {moduleName(r.module_id)}: due {shortDate(r.due_at)}{' '}
              <button className="link-button no-print" onClick={() => remove(r.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comments under a test run
// ---------------------------------------------------------------------------

interface Comment {
  id: number
  body: string
  created_at: string
}

export function AttemptComments({ attemptId }: { attemptId: number }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    if (!supabase) return
    void supabase
      .from('attempt_comments')
      .select('id, body, created_at')
      .eq('attempt_id', attemptId)
      .order('created_at')
      .then(({ data, error: err }) => {
        if (err) setError(`${err.message} -- re-run supabase/schema.sql if the table is missing.`)
        setComments((data ?? []) as Comment[])
      })
  }
  useEffect(reload, [attemptId])

  async function add() {
    if (!supabase || !body.trim()) return
    const { data: user } = await supabase.auth.getUser()
    const { error: err } = await supabase
      .from('attempt_comments')
      .insert({ attempt_id: attemptId, author_id: user.user?.id, body: body.trim() })
    if (err) {
      setError(err.message)
      return
    }
    setBody('')
    reload()
  }

  return (
    <div className="attempt-comments">
      <h3>Comments to the student</h3>
      {comments.map((c) => (
        <p key={c.id} className="attempt-comment"><span className="admin-meta">{shortDate(c.created_at)}</span> {c.body}</p>
      ))}
      <textarea rows={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="The student sees this on their learning-path card." />
      <button className="primary" onClick={add} disabled={!body.trim()}>Add comment</button>
      {error && <p className="feedback-error">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Needs help
// ---------------------------------------------------------------------------

interface HelpStudent {
  id: string
  full_name: string
  email: string
  class_group: string
  last_seen_at: string | null
}

interface HelpProgress {
  user_id: string
  assignment_id: string
  attempt_count: number
  passed: boolean
}

interface HelpRow {
  student: HelpStudent
  module: string
  reason: string
  assignmentId?: string
}

const DAY = 86_400_000

/**
 * Who to walk over to during the lab: 3+ failed test runs on an assignment
 * not passed yet; 40+ minutes of lab time since an open module opened
 * without finishing it; no visit for 7 days while a module is open.
 */
export function NeedsHelp({ students, progress, moduleDone, onOpenStudent }: {
  students: HelpStudent[]
  progress: HelpProgress[]
  /** Whether the student has finished the module, given their stored step. */
  moduleDone: (studentId: string, moduleId: string, step: string | undefined) => boolean
  onOpenStudent: (id: string) => void
}) {
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [sessions, setSessions] = useState<{ user_id: string; started_at: string; active_seconds: number }[]>([])
  const [steps, setSteps] = useState<{ user_id: string; module_id: string; step: string }[]>([])
  const [code, setCode] = useState<{ title: string; source: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    loadSchedule().then(setSchedule).catch(() => setSchedule([]))
    // Only sessions recent enough to matter for "since the module opened".
    const since = new Date(Date.now() - 120 * DAY).toISOString()
    void supabase.from('study_sessions').select('user_id, started_at, active_seconds').gte('started_at', since).limit(20000)
      .then(({ data }) => setSessions((data ?? []) as typeof sessions))
    void supabase.from('module_progress').select('user_id, module_id, step').limit(20000)
      .then(({ data }) => setSteps((data ?? []) as typeof steps))
  }, [])

  const rows = useMemo(() => {
    const out: HelpRow[] = []
    const now = Date.now()
    const assignmentModule = new Map(LEARNING_PATH.flatMap((m) => m.assignments.map((a) => [a, m.id] as const)))
    for (const s of students) {
      for (const p of progress.filter((x) => x.user_id === s.id && !x.passed && x.attempt_count >= 3)) {
        out.push({
          student: s,
          module: assignmentModule.get(p.assignment_id) ?? '',
          reason: `3+ failed test runs (${p.attempt_count}) on ${ASSIGNMENT_TITLES.get(p.assignment_id) ?? p.assignment_id}`,
          assignmentId: p.assignment_id,
        })
      }
      const open = LEARNING_PATH.filter((m) => {
        const d = effectiveDates(schedule, m.id, s.id, s.class_group || null)
        const step = steps.find((x) => x.user_id === s.id && x.module_id === m.id)?.step
        return d?.opensAt && isOpenNow(d, now) && !moduleDone(s.id, m.id, step)
      })
      for (const m of open) {
        const d = effectiveDates(schedule, m.id, s.id, s.class_group || null)
        const minutes = sessions
          .filter((x) => x.user_id === s.id && Date.parse(x.started_at) >= Date.parse(d?.opensAt as string))
          .reduce((n, x) => n + x.active_seconds, 0) / 60
        if (minutes >= 40) out.push({ student: s, module: m.id, reason: `40+ minutes without passing (${Math.round(minutes)} min)` })
      }
      if (open.length > 0 && (!s.last_seen_at || now - Date.parse(s.last_seen_at) > 7 * DAY)) {
        out.push({ student: s, module: open[0].id, reason: 'Inactive for 7 days' })
      }
    }
    return out
  }, [students, progress, schedule, sessions, steps, moduleDone])

  async function viewCode(r: HelpRow) {
    if (!supabase || !r.assignmentId) return
    const { data } = await supabase
      .from('assignment_attempts')
      .select('source')
      .eq('user_id', r.student.id)
      .eq('assignment_id', r.assignmentId)
      .order('created_at', { ascending: false })
      .limit(1)
    const source = ((data ?? [])[0] as { source: string } | undefined)?.source ?? '(no code saved)'
    setCode({ title: `${r.student.full_name || r.student.email} · ${ASSIGNMENT_TITLES.get(r.assignmentId) ?? r.assignmentId}`, source })
  }

  return (
    <div className="needs-help">
      <h3>Needs help {rows.length > 0 && <span className="admin-badge tried">{rows.length}</span>}</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Student</th><th>Group</th><th>Module</th><th>Reason</th><th className="no-print" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><button className="link-button" onClick={() => onOpenStudent(r.student.id)}>{r.student.full_name || r.student.email}</button></td>
                <td>{r.student.class_group}</td>
                <td>{r.module ? moduleName(r.module) : ''}</td>
                <td>{r.reason}</td>
                <td className="no-print">
                  {r.assignmentId && <button className="link-button" onClick={() => viewCode(r)}>Last attempt's code</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="admin-empty">Nobody right now.</td></tr>}
          </tbody>
        </table>
      </div>
      {code && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setCode(null)}>
          <div className="modal admin-code-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>{code.title}</h2>
              <button className="modal-close" onClick={() => setCode(null)} aria-label="Close">×</button>
            </div>
            <pre className="admin-code">{code.source}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
