import type { ReactNode } from 'react'
import { EXAMPLES } from '../examples'
import { CURRICULUM } from '../curriculum'
import { HARDWARE_REFERENCE } from '../hardwareReference'
import { NUMBERING_REFERENCE } from '../numberingSystems'
import { INSTRUCTION_REFERENCE } from '../instructionReference'
import {
  activeSteps, checklist, isModuleDone, predictQuestions, quizBlockers, resumeStep, unansweredPredictions, unreadConcepts,
  type AsidePanel, type ChecklistRow, type ConceptRef, type Interactive, type LearningModule, type ModuleProgressRow,
  type PathProgress, type StepId, type StoredStep,
} from '../learningPath'

export const ASSIGNMENT_TITLES = new Map(
  CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments)).map((a) => [a.id, a.title]),
)

// "Task 1 - Basic Assignment (MOV)" -> "Task 1", for the checklist's "Pass:" row.
export const TASK_NAMES = new Map(
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

/** What opening a module's items needs: the student's progress and the app's openers. */
export interface PathActions {
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
  /** Tasks passed in this browser that the server has no passed attempt for (#85). */
  unsaved?: Set<string>
  /** Modules whose Reflect step is already behind the student (#98). */
  reflected?: Set<string>
}

function isBehind(a: PathActions, m: LearningModule, step: StepId) {
  const steps = activeSteps(m)
  return steps.indexOf(step) < steps.indexOf(resumeStep(m, a.rows.get(m.id), a.progress))
}

/**
 * Opens one step of a module (an item of it with `index`). `review` is a
 * click on the module's list: going back to an earlier item must not move
 * the student's step back with it (#99).
 */
export function openPathStep(a: PathActions, m: LearningModule, step: StepId, index?: number, review = false) {
  // Never move a finished module back from 'done' just by revisiting it.
  if (!isModuleDone(m, a.progress, a.rows.get(m.id)?.step) && !(review && isBehind(a, m, step))) a.onSetStep(m.id, step)
  a.onStepOpened(m.id, step)
  if (step === 'concept') a.onOpenConcept(m.concepts[index ?? Math.max(0, m.concepts.indexOf(unreadConcepts(m, a.progress)[0]))])
  else if (step === 'observe' && m.observe) a.onOpenExample(m.observe.examples[index ?? 0], m.observe.panel, m.observe.watch, m.id)
  else if (step === 'quiz') a.onOpenQuiz(m.id)
  else if (step === 'predict') a.onOpenPredict(m.id)
  else if (step === 'reflect') a.onOpenReflect(m.id)
  else if (step === 'task') {
    const id = index !== undefined ? m.assignments[index] : m.assignments.find((x) => !a.progress.completed.has(x)) ?? m.assignments[0]
    a.onOpenAssignment(id)
  }
}

function openInteractive(a: PathActions, m: LearningModule, item: Interactive) {
  if (item.example) {
    if (!isModuleDone(m, a.progress, a.rows.get(m.id)?.step) && !isBehind(a, m, 'observe')) a.onSetStep(m.id, 'observe')
    a.onOpenExample(item.example, m.observe?.panel ?? 'registers', m.observe?.watch, m.id)
  } else {
    const ref = m.concepts.find((c) => c.id === item.topic)
    if (ref) openPathStep(a, m, 'concept', m.concepts.indexOf(ref), true)
  }
}

/** One row of a module's list. */
export interface ModuleItem {
  key: string
  label: string
  done: boolean
  locked?: boolean
  /** Why a locked row is locked. */
  lockedNote?: string
  open: () => void
  note?: ReactNode
}

/** The list key of a Learn page, an example or a task, to mark where the student is. */
export const itemKey = {
  page: (ref: ConceptRef) => `read-${ref.section}-${ref.id}`,
  example: (id: string) => `example-${id}`,
  task: (id: string) => `task-${id}`,
}

/**
 * Everything in a module, in the order of its steps (#99, #102): pages,
 * examples, interactives, Predict, each task on its own row, the quiz,
 * Reflect. Pages and examples are only recorded in quiz modules (Mark as
 * read); elsewhere they count as done once the student is past that step.
 */
export function moduleItems(a: PathActions, m: LearningModule, lockedNote = ''): ModuleItem[] {
  const { progress } = a
  const moduleDone = isModuleDone(m, progress, a.rows.get(m.id)?.step)
  const steps = activeSteps(m)
  const step = resumeStep(m, a.rows.get(m.id), progress)
  const pastStep = (s: StepId) => moduleDone || steps.indexOf(s) < steps.indexOf(step)
  const read = progress.reads.get(m.id)
  const quizPassed = progress.quizzesPassed.has(m.id)
  const blockers = m.quiz ? quizBlockers(m, progress) : 0
  const predictCount = predictQuestions(m).length
  return [
    ...m.concepts.map((c, i): ModuleItem => {
      const done = m.quiz ? !!read?.has(c.id) : pastStep('concept')
      return {
        key: itemKey.page(c),
        label: `Read: ${conceptTitle(c)}`,
        done,
        open: () => openPathStep(a, m, 'concept', i, true),
        note: m.quiz && !done ? <span className="path-unread"> · not read</span> : null,
      }
    }),
    ...(steps.includes('observe') ? m.observe?.examples ?? [] : []).map((id, i): ModuleItem => ({
      key: itemKey.example(id),
      label: `Watch: ${exampleTitle(id)}`,
      done: pastStep('observe'),
      open: () => openPathStep(a, m, 'observe', i, true),
    })),
    ...checklist(m, progress).flatMap((r): ModuleItem[] => r.kind === 'interactive'
      ? [{ key: `interactive-${r.item.id}`, label: checklistRowLabel(m, r), done: r.done, open: () => openInteractive(a, m, r.item) }]
      : []),
    ...(steps.includes('predict')
      ? [{
          key: 'predict',
          label: `Predict: ${predictCount} ${predictCount === 1 ? 'question' : 'questions'}`,
          done: unansweredPredictions(m, progress).length === 0,
          open: () => openPathStep(a, m, 'predict', undefined, true),
        }]
      : []),
    ...m.assignments.map((id, i): ModuleItem => ({
      key: itemKey.task(id),
      label: ASSIGNMENT_TITLES.get(id) ?? id,
      done: progress.completed.has(id),
      open: () => openPathStep(a, m, 'task', i, true),
      note: !progress.completed.has(id) && a.unsaved?.has(id)
        ? <span className="path-unsaved"> Passed on this computer but not saved to your account. Open the task and press Run Tests again.</span>
        : null,
    })),
    ...(m.quiz
      ? [{
          key: 'quiz',
          label: quizPassed ? 'Quiz: see your answers' : 'Quiz',
          done: quizPassed,
          locked: !quizPassed && blockers > 0,
          lockedNote,
          open: () => openPathStep(a, m, 'quiz', undefined, true),
        }]
      : []),
    ...(steps.includes('reflect')
      ? [{
          key: 'reflect',
          label: 'Reflect',
          done: !!a.reflected?.has(m.id),
          open: () => openPathStep(a, m, 'reflect', undefined, true),
        }]
      : []),
  ]
}

/**
 * A module's items as a list: ✓ done, ● the page or task open now
 * ("You are here"), ○ still to do, with the first of those marked "Up next".
 */
export function ModuleItemList({ items, hereKey }: { items: ModuleItem[]; hereKey?: string | null }) {
  const upNext = items.find((r) => !r.done && !r.locked && r.key !== hereKey)?.key
  return (
    <ul className="path-checklist">
      {items.map((r) => {
        const here = r.key === hereKey
        return (
          <li key={r.key} className={`${r.done ? 'done' : ''}${here ? ' here' : ''}`.trim() || undefined}>
            <span className="path-check" aria-hidden="true">{r.done ? '✓' : here ? '●' : r.locked ? '🔒' : '○'}</span>
            <span>
              <button className="link-button" disabled={r.locked} title={r.locked ? r.lockedNote : undefined} onClick={r.open} aria-current={here ? 'page' : undefined}>
                {r.label}
              </button>
              {here && <span className="path-tag">You are here</span>}
              {r.key === upNext && <span className="path-tag next">Up next</span>}
              {r.note}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
