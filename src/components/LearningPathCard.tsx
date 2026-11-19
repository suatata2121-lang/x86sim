import { useState, type ReactNode } from 'react'
import { EXAMPLES } from '../examples'
import { CURRICULUM } from '../curriculum'
import { HARDWARE_REFERENCE } from '../hardwareReference'
import { NUMBERING_REFERENCE } from '../numberingSystems'
import { INSTRUCTION_REFERENCE } from '../instructionReference'
import {
  LEARNING_PATH, STEPS, activeSteps, checklist, currentModule, isModuleDone, isUnlocked, moduleStatus, nextStep, previousModule,
  quizBlockers, resumeStep, shownSteps, unansweredPredictions, unreadConcepts, type ChecklistRow,
  type AsidePanel, type ConceptRef, type Interactive, type LearningModule, type ModuleProgressRow, type PathProgress, type StepId,
  type StoredStep,
} from '../learningPath'
import { findQuiz } from '../quizzes'
import { formatDay, isOpenNow, type InstructorComment, type ModuleDates } from '../backend/schedule'

const ASSIGNMENT_TITLES = new Map(
  CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments)).map((a) => [a.id, a.title]),
)

// "Task 1 - Basic Assignment (MOV)" -> "Task 1", for the checklist's "Pass:" row.
const TASK_NAMES = new Map(
  CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments.map((a) => [a.id, t.title.split(' - ')[0]] as const))),
)

export function conceptTitle(ref: ConceptRef): string {
  if (ref.section === 'hardware') {
    return HARDWARE_REFERENCE.flatMap((c) => c.topics).find((t) => t.id === ref.id)?.title ?? ref.id
  }
  if (ref.section === 'numbering') {
    return NUMBERING_REFERENCE.flatMap((c) => c.topics).find((t) => t.id === ref.id)?.title ?? ref.id
  }
  return INSTRUCTION_REFERENCE.find((c) => c.id === ref.id)?.title ?? ref.id
}

/** A checklist row as the card and the admin report show it. */
export function checklistRowLabel(m: LearningModule, r: ChecklistRow): string {
  if (r.kind === 'read') return `Read: ${conceptTitle(r.concept)}`
  if (r.kind === 'interactive') return r.item.label.replace('{n}', String(r.partsDone))
  if (r.kind === 'tasks') return `Pass: ${m.assignments.map((id) => TASK_NAMES.get(id) ?? id).join(' and ')}`
  return 'Quiz'
}

const exampleTitle = (id: string) => EXAMPLES.find((e) => e.id === id)?.title ?? id

/** One row of the module's list on the card. */
interface ListItem {
  key: string
  label: string
  done: boolean
  locked?: boolean
  open: () => void
  note?: ReactNode
}

const STATUS_LABELS = { done: 'done', 'in-progress': 'in progress', 'not-started': 'not started' }

interface Props {
  rows: Map<string, ModuleProgressRow>
  progress: PathProgress
  onSetStep: (moduleId: string, step: StoredStep) => void
  onOpenConcept: (ref: ConceptRef) => void
  /** moduleId says which module's Observe step asked, so its viewer settings apply. */
  onOpenExample: (exampleId: string, panel: AsidePanel, watch: string | undefined, moduleId: string) => void
  onOpenAssignment: (assignmentId: string) => void
  onOpenQuiz: (moduleId: string) => void
  onOpenPredict: (moduleId: string) => void
  onOpenReflect: (moduleId: string) => void
  onStepOpened: (moduleId: string, step: StepId) => void
  onHide: () => void
  /** When a module opens and is due for this student (#13); null when it has no schedule. */
  dates?: (moduleId: string) => ModuleDates | null
  /** Cycle challenges completed (#15), shown as a badge. */
  challengeCount?: number
  /** Instructor comments on the student's test runs not dismissed yet. */
  feedback?: { comments: InstructorComment[]; onDismiss: () => void }
  /** Shown as a single line instead of the card (while the Observe viewer is open). */
  collapsed?: string
  onExpand?: () => void
  onCollapse?: () => void
  /** Admins can open every module to check content, whatever their own progress. */
  unlockAll?: boolean
  /** Tasks passed in this browser that the server has no passed attempt for (#85). */
  unsaved?: Set<string>
  /** Modules whose Reflect step is already behind the student (#98). */
  reflected?: Set<string>
}

// The "Continue" home for signed-in students (issue #9): the module they are
// on, its steps, and an 11-segment bar of the whole path. Modules can be
// picked from the bar in any order once unlocked; they unlock strictly in
// order, each when the one before it is done (#74). A module that closes with a quiz
// also shows its checklist (#25): what to read, try, pass, then the quiz.
export function LearningPathCard({
  rows, progress, onSetStep, onOpenConcept, onOpenExample, onOpenAssignment, onOpenQuiz, onOpenPredict, onOpenReflect,
  onStepOpened, onHide,
  dates, challengeCount = 0, feedback, collapsed, onExpand, onCollapse, unlockAll = false, unsaved, reflected,
}: Props) {
  const { completed } = progress
  // A module picked from the bar that is already done stays on screen until
  // the student moves on; otherwise the card follows currentModule().
  const [viewedId, setViewedId] = useState<string | null>(null)
  // Why the last segment clicked is locked; the tooltip alone is missed on touch screens.
  const [lockedPick, setLockedPick] = useState<LearningModule | null>(null)
  const current = currentModule(rows, progress, (m) => isOpenNow(dates?.(m.id) ?? null))
  const module = LEARNING_PATH.find((m) => m.id === viewedId) ?? current
  const unlocked = (m: LearningModule) => unlockAll || isUnlocked(m, progress, rows)
  const doneCount = LEARNING_PATH.filter((m) => isModuleDone(m, progress, rows.get(m.id)?.step)).length

  // `review` is a click on the module's list: going back to an earlier item
  // must not move the student's step back with it (#99).
  function openStep(m: LearningModule, step: StepId, index?: number, review = false) {
    // Never move a finished module back from 'done' just by revisiting it.
    if (!isModuleDone(m, progress, rows.get(m.id)?.step) && !(review && isBehind(m, step))) onSetStep(m.id, step)
    onStepOpened(m.id, step)
    if (step === 'concept') onOpenConcept(m.concepts[index ?? Math.max(0, m.concepts.indexOf(unreadConcepts(m, progress)[0]))])
    else if (step === 'observe' && m.observe) onOpenExample(m.observe.examples[index ?? 0], m.observe.panel, m.observe.watch, m.id)
    else if (step === 'quiz') onOpenQuiz(m.id)
    else if (step === 'predict') onOpenPredict(m.id)
    else if (step === 'reflect') onOpenReflect(m.id)
    else if (step === 'task') {
      const id = index !== undefined ? m.assignments[index] : m.assignments.find((a) => !completed.has(a)) ?? m.assignments[0]
      onOpenAssignment(id)
    }
  }

  function isBehind(m: LearningModule, step: StepId) {
    const steps = activeSteps(m)
    return steps.indexOf(step) < steps.indexOf(resumeStep(m, rows.get(m.id), progress))
  }

  function pickModule(m: LearningModule) {
    if (!unlocked(m)) {
      setLockedPick(m)
      return
    }
    setLockedPick(null)
    setViewedId(m.id)
    if (!isModuleDone(m, progress, rows.get(m.id)?.step)) onSetStep(m.id, resumeStep(m, rows.get(m.id), progress))
  }

  function lockedTitle(m: LearningModule) {
    const previous = previousModule(m)
    return previous ? `Finish ${previous.title} to open this module.` : ''
  }

  function openInteractive(m: LearningModule, item: Interactive) {
    if (item.example) {
      if (!isModuleDone(m, progress, rows.get(m.id)?.step) && !isBehind(m, 'observe')) onSetStep(m.id, 'observe')
      onOpenExample(item.example, m.observe?.panel ?? 'registers', m.observe?.watch, m.id)
    } else {
      const ref = m.concepts.find((c) => c.id === item.topic)
      if (ref) openStep(m, 'concept', m.concepts.indexOf(ref), true)
    }
  }

  // The step "Next step" goes to: Reflect is passed over once written (#98).
  // Past the last step a module with an open task comes back to Task, so
  // from Task that can be the step itself.
  function stepAfter(m: LearningModule, step: StepId): StoredStep {
    const next = nextStep(m, step)
    return next === 'reflect' && reflected?.has(m.id) ? nextStep(m, 'reflect') : next
  }

  function advance(m: LearningModule, step: StepId) {
    const next = stepAfter(m, step)
    if (next === step) return
    if (next === 'done') {
      onSetStep(m.id, next)
      setViewedId(null)
    } else {
      openStep(m, next)
    }
  }

  // "Opens on …" before the opening date; then "Due …", or "Overdue" once it
  // has passed. The lock is soft: an unopened module can still be picked.
  function dateNote(m: LearningModule, done: boolean): string | null {
    const d = dates?.(m.id)
    if (!d) return null
    if (!isOpenNow(d)) return `Opens on ${formatDay(d.opensAt as string)}`
    if (d.dueAt && !done) return Date.parse(d.dueAt) < Date.now() ? 'Overdue' : `Due ${formatDay(d.dueAt)}`
    return null
  }

  const feedbackBox = feedback && feedback.comments.length > 0 && (
    <div className="path-feedback">
      <strong>New feedback from your instructor</strong>
      <ul>
        {feedback.comments.map((c) => (
          <li key={c.id}>
            {c.assignment_id && <span className="path-feedback-on">{ASSIGNMENT_TITLES.get(c.assignment_id) ?? c.assignment_id}: </span>}
            {c.body}
          </li>
        ))}
      </ul>
      <button onClick={feedback.onDismiss}>Got it</button>
    </div>
  )

  const bar = (
    <div className="path-bar" role="list" aria-label="Learning path modules">
      {LEARNING_PATH.map((m, i) => {
        const status = moduleStatus(m, progress, rows.get(m.id)?.step)
        const locked = !unlocked(m)
        return (
          <button
            key={m.id}
            role="listitem"
            className={`path-segment ${locked ? 'locked' : status}${m.id === module?.id ? ' current' : ''}`}
            title={locked
              ? `${i}. ${m.title} -- ${lockedTitle(m)}`
              : `${i}. ${m.title} (${STATUS_LABELS[status]})${dateNote(m, status === 'done') ? ` · ${dateNote(m, status === 'done')}` : ''}`}
            aria-label={`Module ${i}: ${m.title}, ${locked ? 'locked' : STATUS_LABELS[status]}`}
            aria-disabled={locked}
            onClick={() => pickModule(m)}
          >
            {locked ? `🔒${i}` : i}
          </button>
        )
      })}
      {lockedPick && !unlocked(lockedPick) && (
        <p className="path-note path-locked-note" role="status">
          🔒 Module {LEARNING_PATH.indexOf(lockedPick)}: {lockedTitle(lockedPick)}
        </p>
      )}
    </div>
  )

  if (collapsed) {
    return (
      <div className="path-collapsed">
        <span>{collapsed}</span>
        <button onClick={onExpand}>Show card</button>
      </div>
    )
  }

  if (!module) {
    return (
      <div className="panel path-card">
        <div className="path-header">
          <h3>Learning path</h3>
          <button className="modal-close" onClick={onHide} aria-label="Hide learning path">×</button>
        </div>
        <p className="example-description">All {LEARNING_PATH.length} modules are done. Well done!</p>
        {bar}
      </div>
    )
  }

  const index = LEARNING_PATH.indexOf(module)
  const row = rows.get(module.id)
  const moduleDone = isModuleDone(module, progress, row?.step)
  const step = resumeStep(module, row, progress)
  const steps = activeSteps(module)
  const isLastStep = steps[steps.length - 1] === step
  const blockers = module.quiz ? quizBlockers(module, progress) : 0
  const readsLeft = module.quiz ? unreadConcepts(module, progress).length : 0
  const lockedNote = `${(module.quiz && findQuiz(module.quiz)?.lockedNote) ?? ''} ${blockers} left.`
  // The step after this one is a quiz that isn't open yet, or Predict still has open questions.
  const predictLeft = step === 'predict' ? unansweredPredictions(module, progress).length : 0
  const nextLocked = (nextStep(module, step) === 'quiz' && blockers > 0) || predictLeft > 0
  // Reflect is written but the module is still open: name each task the
  // server has no passed attempt for, rather than sending the student round
  // Task -> Reflect again (#98).
  const missingTasks = !moduleDone && !module.quiz && reflected?.has(module.id)
    ? module.assignments.filter((id) => !completed.has(id))
    : []

  // Every module lists the same things in the same order (#99): pages,
  // examples, interactives, each task on its own row, then the quiz. Pages
  // and examples are only recorded in quiz modules (Mark as read); elsewhere
  // they count as done once the student is past that step.
  const pastStep = (s: StepId) => moduleDone || steps.indexOf(s) < steps.indexOf(step)
  const read = progress.reads.get(module.id)
  const quizPassed = progress.quizzesPassed.has(module.id)
  const items: ListItem[] = [
    ...module.concepts.map((c, i): ListItem => {
      const done = module.quiz ? !!read?.has(c.id) : pastStep('concept')
      return {
        key: `read-${c.section}-${c.id}`,
        label: `Read: ${conceptTitle(c)}`,
        done,
        open: () => openStep(module, 'concept', i, true),
        note: module.quiz && !done ? <span className="path-unread"> · not read</span> : null,
      }
    }),
    ...(steps.includes('observe') ? module.observe?.examples ?? [] : []).map((id, i): ListItem => ({
      key: `example-${id}`,
      label: `Watch: ${exampleTitle(id)}`,
      done: pastStep('observe'),
      open: () => openStep(module, 'observe', i, true),
    })),
    ...checklist(module, progress).flatMap((r): ListItem[] => r.kind === 'interactive'
      ? [{ key: `interactive-${r.item.id}`, label: checklistRowLabel(module, r), done: r.done, open: () => openInteractive(module, r.item) }]
      : []),
    ...module.assignments.map((id, i): ListItem => ({
      key: `task-${id}`,
      label: ASSIGNMENT_TITLES.get(id) ?? id,
      done: completed.has(id),
      open: () => openStep(module, 'task', i, true),
      note: !completed.has(id) && unsaved?.has(id)
        ? <span className="path-unsaved"> Passed on this computer but not saved to your account. Open the task and press Run Tests again.</span>
        : null,
    })),
    ...(module.quiz
      ? [{
          key: 'quiz',
          label: quizPassed ? 'Quiz: see your answers' : 'Quiz',
          done: quizPassed,
          locked: !quizPassed && blockers > 0,
          open: () => openStep(module, 'quiz', undefined, true),
        }]
      : []),
  ]

  return (
    <div className="panel path-card">
      <div className="path-header">
        <h3>
          <span className="path-module-no">Module {index}</span> {module.title}
          {moduleDone && <span className="admin-badge passed">Done</span>}
          {dateNote(module, moduleDone) && (
            <span className={`path-date${dateNote(module, moduleDone) === 'Overdue' ? ' overdue' : ''}`}>{dateNote(module, moduleDone)}</span>
          )}
        </h3>
        {onCollapse && <button onClick={onCollapse}>Collapse</button>}
        <button className="modal-close" onClick={onHide} aria-label="Hide learning path" title="Hide (reopen from the header)">×</button>
      </div>
      {feedbackBox}
      <p className="example-description">{module.summary}</p>

      <ol className="path-steps">
        {shownSteps(module).map((s) => {
          const quizLocked = s.id === 'quiz' && blockers > 0 && !progress.quizzesPassed.has(module.id)
          const available = steps.includes(s.id) && !quizLocked
          const passed = moduleDone || steps.indexOf(s.id) < steps.indexOf(step)
          return (
            <li key={s.id}>
              <button
                className={`path-step${s.id === step && !moduleDone ? ' active' : ''}${available && passed ? ' passed' : ''}`}
                disabled={!available}
                title={
                  s.comingSoon ? 'Coming soon'
                    : quizLocked ? lockedNote
                      : !available ? 'This module has no assignment' : undefined
                }
                onClick={() => openStep(module, s.id)}
              >
                {s.label}{s.comingSoon && <span className="path-soon"> · soon</span>}
              </button>
            </li>
          )
        })}
      </ol>

      {moduleDone && <h4 className="path-review-title">Review this module</h4>}
      <ul className="path-checklist">
        {items.map((r) => (
          <li key={r.key} className={r.done ? 'done' : undefined}>
            <span className="path-check" aria-hidden="true">{r.done ? '✓' : r.locked ? '🔒' : '○'}</span>
            <button className="link-button" disabled={r.locked} title={r.locked ? lockedNote : undefined} onClick={r.open}>{r.label}</button>
            {r.note}
          </li>
        ))}
      </ul>
      {missingTasks.map((id) => (
        <p key={id} className="path-note">
          <button className="link-button" onClick={() => openStep(module, 'task', module.assignments.indexOf(id))}>
            {TASK_NAMES.get(id) ?? id}
          </button>{' '}
          isn't saved as passed yet. Open it and press Run Tests.
        </p>
      ))}
      {!moduleDone && module.quiz && blockers > 0 && (
        <p className="path-note">
          {lockedNote}{readsLeft > 0 && <> Use <em>Mark as read</em> at the end of each page.</>}
        </p>
      )}

      <div className="path-actions">
        {moduleDone ? (
          current && current.id !== module.id
            ? <button className="primary" onClick={() => setViewedId(null)}>Next module: {current.title} →</button>
            : null
        ) : (
          <>
            <button className="primary" onClick={() => openStep(module, step)}>
              Continue: {STEPS.find((s) => s.id === step)?.label} ▶
            </button>
            {step !== 'quiz' && (step !== 'task' || module.quiz || nextStep(module, 'task') === 'reflect') && stepAfter(module, step) !== step && (
              <button
                onClick={() => advance(module, step)}
                disabled={nextLocked}
                title={predictLeft > 0 ? 'Answer every Predict question first' : nextLocked ? 'Finish the checklist first' : undefined}
              >
                {isLastStep ? 'Finish module ✓' : 'Next step →'}
                {predictLeft > 0 && ` (${predictLeft} ${predictLeft === 1 ? 'question' : 'questions'} left)`}
                {nextLocked && predictLeft === 0 && (blockers === readsLeft
                  ? ` (${readsLeft} ${readsLeft === 1 ? 'topic' : 'topics'} left)`
                  : ` (${blockers} ${blockers === 1 ? 'item' : 'items'} left)`)}
              </button>
            )}
          </>
        )}
        <span className="path-count">
          {doneCount} / {LEARNING_PATH.length} modules done
          {challengeCount > 0 && <span className="path-badge" title="Cycle challenges completed"> · 🏅 {challengeCount}</span>}
        </span>
      </div>

      {bar}
    </div>
  )
}
