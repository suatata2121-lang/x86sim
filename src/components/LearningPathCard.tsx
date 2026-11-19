import { useState } from 'react'
import {
  LEARNING_PATH, STEPS, activeSteps, currentModule, isModuleDone, isUnlocked, moduleStatus, nextStep, previousModule,
  quizBlockers, resumeStep, shownSteps, unansweredPredictions, unreadConcepts,
  type AsidePanel, type ConceptRef, type LearningModule, type ModuleProgressRow, type PathProgress, type StepId,
  type StoredStep,
} from '../learningPath'
import { findQuiz } from '../quizzes'
import { flashTarget, useClickLock } from './navFeedback'
import { formatDay, isOpenNow, type InstructorComment, type ModuleDates } from '../backend/schedule'
import { ASSIGNMENT_TITLES, ModuleItemList, TASK_NAMES, moduleItems, openPathStep, type PathActions } from './ModuleItems'

export { checklistRowLabel, conceptTitle } from './ModuleItems'

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
  // Continue / Next step: one click at a time, and show where it went (#102).
  const [moving, move] = useClickLock()
  // Why the last segment clicked is locked; the tooltip alone is missed on touch screens.
  const [lockedPick, setLockedPick] = useState<LearningModule | null>(null)
  const current = currentModule(rows, progress, (m) => isOpenNow(dates?.(m.id) ?? null))
  const module = LEARNING_PATH.find((m) => m.id === viewedId) ?? current
  const unlocked = (m: LearningModule) => unlockAll || isUnlocked(m, progress, rows)
  const doneCount = LEARNING_PATH.filter((m) => isModuleDone(m, progress, rows.get(m.id)?.step)).length

  const actions: PathActions = {
    rows, progress, onSetStep, onOpenConcept, onOpenExample, onOpenAssignment, onOpenQuiz, onOpenPredict, onOpenReflect,
    onStepOpened, unsaved, reflected,
  }
  const openStep = (m: LearningModule, step: StepId, index?: number) => openPathStep(actions, m, step, index)

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
      go(m, next)
    }
  }

  // Pages (concept, observe, task) are scrolled to and flashed; the other
  // steps open a dialog, which is feedback enough.
  function go(m: LearningModule, step: StepId) {
    openStep(m, step)
    if (step === 'concept' || step === 'observe' || step === 'task') flashTarget()
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
      <ModuleItemList items={moduleItems(actions, module, lockedNote)} />
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
            <button className="primary" disabled={moving} onClick={() => move(() => go(module, step))}>
              Continue: {STEPS.find((s) => s.id === step)?.label} ▶
            </button>
            {step !== 'quiz' && (step !== 'task' || module.quiz || nextStep(module, 'task') === 'reflect') && stepAfter(module, step) !== step && (
              <button
                onClick={() => move(() => advance(module, step))}
                disabled={nextLocked || moving}
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
