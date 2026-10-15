import { useState } from 'react'
import { EXAMPLES } from '../examples'
import { CURRICULUM } from '../curriculum'
import { HARDWARE_REFERENCE } from '../hardwareReference'
import { NUMBERING_REFERENCE } from '../numberingSystems'
import { INSTRUCTION_REFERENCE } from '../instructionReference'
import {
  LEARNING_PATH, STEPS, activeSteps, checklist, currentModule, isModuleDone, isUnlocked, moduleStatus, nextStep,
  quizBlockers, resumeStep, shownSteps, unreadConcepts, type ChecklistRow,
  type AsidePanel, type ConceptRef, type LearningModule, type ModuleProgressRow, type PathProgress, type StepId,
  type StoredStep,
} from '../learningPath'
import { findQuiz } from '../quizzes'

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
  onStepOpened: (moduleId: string, step: StepId) => void
  onHide: () => void
  /** Shown as a single line instead of the card (while the Observe viewer is open). */
  collapsed?: string
  onExpand?: () => void
  onCollapse?: () => void
}

// The "Continue" home for signed-in students (issue #9): the module they are
// on, its steps, and an 11-segment bar of the whole path. Modules can be
// picked from the bar in any order, except ones whose `requires` aren't done
// yet (Module 0's quiz gates the rest, #20). A module that closes with a quiz
// also shows its checklist (#25): what to read, try, pass, then the quiz.
export function LearningPathCard({
  rows, progress, onSetStep, onOpenConcept, onOpenExample, onOpenAssignment, onOpenQuiz, onStepOpened, onHide,
  collapsed, onExpand, onCollapse,
}: Props) {
  const { completed } = progress
  // A module picked from the bar that is already done stays on screen until
  // the student moves on; otherwise the card follows currentModule().
  const [viewedId, setViewedId] = useState<string | null>(null)
  const current = currentModule(rows, progress)
  const module = LEARNING_PATH.find((m) => m.id === viewedId) ?? current
  const doneCount = LEARNING_PATH.filter((m) => isModuleDone(m, progress, rows.get(m.id)?.step)).length

  function openStep(m: LearningModule, step: StepId, index?: number) {
    // Never move a finished module back from 'done' just by revisiting it.
    if (!isModuleDone(m, progress, rows.get(m.id)?.step)) onSetStep(m.id, step)
    onStepOpened(m.id, step)
    if (step === 'concept') onOpenConcept(m.concepts[index ?? Math.max(0, m.concepts.indexOf(unreadConcepts(m, progress)[0]))])
    else if (step === 'observe' && m.observe) onOpenExample(m.observe.examples[index ?? 0], m.observe.panel, m.observe.watch, m.id)
    else if (step === 'quiz') onOpenQuiz(m.id)
    else if (step === 'task') {
      const id = index !== undefined ? m.assignments[index] : m.assignments.find((a) => !completed.has(a)) ?? m.assignments[0]
      onOpenAssignment(id)
    }
  }

  function pickModule(m: LearningModule) {
    if (!isUnlocked(m, progress, rows)) return
    setViewedId(m.id)
    if (!isModuleDone(m, progress, rows.get(m.id)?.step)) onSetStep(m.id, resumeStep(m, rows.get(m.id), progress))
  }

  function lockedTitle(m: LearningModule) {
    const missing = LEARNING_PATH.find((r) => m.requires?.includes(r.id) && !isModuleDone(r, progress, rows.get(r.id)?.step))
    if (!missing) return ''
    const i = LEARNING_PATH.indexOf(missing)
    return missing.quiz ? `Pass the Module ${i} quiz to unlock` : `Finish Module ${i} to unlock`
  }

  function openRow(m: LearningModule, r: ChecklistRow) {
    if (r.kind === 'read') openStep(m, 'concept', m.concepts.indexOf(r.concept))
    else if (r.kind === 'tasks') openStep(m, 'task')
    else if (r.kind === 'quiz') openStep(m, 'quiz')
    else if (r.item.example) {
      onSetStep(m.id, 'observe')
      onOpenExample(r.item.example, m.observe?.panel ?? 'registers', m.observe?.watch, m.id)
    } else {
      const ref = m.concepts.find((c) => c.id === r.item.topic)
      if (ref) openStep(m, 'concept', m.concepts.indexOf(ref))
    }
  }

  function advance(m: LearningModule, step: StepId) {
    const next = nextStep(m, step)
    if (next === 'done') {
      onSetStep(m.id, next)
      setViewedId(null)
    } else {
      openStep(m, next)
    }
  }

  const bar = (
    <div className="path-bar" role="list" aria-label="Learning path modules">
      {LEARNING_PATH.map((m, i) => {
        const status = moduleStatus(m, progress, rows.get(m.id)?.step)
        const locked = !isUnlocked(m, progress, rows)
        return (
          <button
            key={m.id}
            role="listitem"
            className={`path-segment ${locked ? 'locked' : status}${m.id === module?.id ? ' current' : ''}`}
            title={locked ? `${i}. ${m.title} -- ${lockedTitle(m)}` : `${i}. ${m.title} (${STATUS_LABELS[status]})`}
            aria-label={`Module ${i}: ${m.title}, ${locked ? 'locked' : STATUS_LABELS[status]}`}
            aria-disabled={locked}
            onClick={() => pickModule(m)}
          >
            {locked ? `🔒${i}` : i}
          </button>
        )
      })}
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
  // Quiz modules: the rest of the checklist has to be done before the quiz opens.
  const rowsToDo = module.quiz ? checklist(module, progress) : []
  const blockers = module.quiz ? quizBlockers(module, progress) : 0
  const readsLeft = module.quiz ? unreadConcepts(module, progress).length : 0
  const lockedNote = `${(module.quiz && findQuiz(module.quiz)?.lockedNote) ?? ''} ${blockers} left.`
  // The step after this one is a quiz that isn't open yet.
  const nextLocked = nextStep(module, step) === 'quiz' && blockers > 0

  return (
    <div className="panel path-card">
      <div className="path-header">
        <h3>
          <span className="path-module-no">Module {index}</span> {module.title}
          {moduleDone && <span className="admin-badge passed">Done</span>}
        </h3>
        {onCollapse && <button onClick={onCollapse}>Collapse</button>}
        <button className="modal-close" onClick={onHide} aria-label="Hide learning path" title="Hide (reopen from the header)">×</button>
      </div>
      <p className="example-description">{module.summary}</p>

      <ol className="path-steps">
        {shownSteps(module).map((s) => {
          const quizLocked = s.id === 'quiz' && blockers > 0
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

      {module.quiz && (
        <ul className="path-checklist">
          {rowsToDo.map((r, i) => {
            const locked = r.kind === 'quiz' && blockers > 0
            return (
              <li key={i} className={r.done ? 'done' : undefined}>
                <span className="path-check" aria-hidden="true">{r.done ? '✓' : locked ? '🔒' : '○'}</span>
                <button className="link-button" disabled={locked} onClick={() => openRow(module, r)}>{checklistRowLabel(module, r)}</button>
                {!r.done && r.kind === 'read' && <span className="path-unread"> · not read</span>}
              </li>
            )
          })}
        </ul>
      )}
      {!moduleDone && !module.quiz && (
        <ul className="path-items">
          {step === 'concept' && module.concepts.map((c, i) => (
            <li key={c.id}>
              <button className="link-button" onClick={() => openStep(module, 'concept', i)}>{conceptTitle(c)}</button>
            </li>
          ))}
          {step === 'observe' && module.observe?.examples.map((id, i) => (
            <li key={id}><button className="link-button" onClick={() => openStep(module, 'observe', i)}>{exampleTitle(id)}</button></li>
          ))}
          {step === 'task' && module.assignments.map((id, i) => (
            <li key={id}>
              <button className="link-button" onClick={() => openStep(module, 'task', i)}>{ASSIGNMENT_TITLES.get(id) ?? id}</button>
              {completed.has(id) && ' ✓'}
            </li>
          ))}
        </ul>
      )}
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
            {step !== 'quiz' && (step !== 'task' || module.quiz) && (
              <button
                onClick={() => advance(module, step)}
                disabled={nextLocked}
                title={nextLocked ? 'Finish the checklist first' : undefined}
              >
                {isLastStep ? 'Finish module ✓' : 'Next step →'}
                {nextLocked && (blockers === readsLeft
                  ? ` (${readsLeft} ${readsLeft === 1 ? 'topic' : 'topics'} left)`
                  : ` (${blockers} ${blockers === 1 ? 'item' : 'items'} left)`)}
              </button>
            )}
          </>
        )}
        <span className="path-count">{doneCount} / {LEARNING_PATH.length} modules done</span>
      </div>

      {bar}
    </div>
  )
}
