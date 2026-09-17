import { useState, type ReactNode } from 'react'
import { CURRICULUM, type Assignment, type Stage, type Task } from '../curriculum'
import { INSTRUCTION_REFERENCE, type InstructionCategory, type InstructionDoc } from '../instructionReference'

function progressOf(assignments: Assignment[], completedIds: Set<string>) {
  return { done: assignments.filter((a) => completedIds.has(a.id)).length, total: assignments.length }
}

type LearnSection = 'curriculum' | 'reference'

// Navigation state is lifted out of the rendered panels so the clickable
// lists (LearnSidebar, shown under the Learn tab) and their explanations
// (LearnDetail, shown above the code editor) can stay in sync while living
// in two different places in the layout.
export interface LearnNav {
  section: LearnSection
  setSection: (s: LearnSection) => void
  stageId: string | null
  setStageId: (id: string | null) => void
  taskId: string | null
  setTaskId: (id: string | null) => void
  categoryId: string | null
  setCategoryId: (id: string | null) => void
  mnemonic: string | null
  setMnemonic: (m: string | null) => void
}

export function useLearnNav(): LearnNav {
  const [section, setSection] = useState<LearnSection>('curriculum')
  const [stageId, setStageId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  return { section, setSection, stageId, setStageId, taskId, setTaskId, categoryId, setCategoryId, mnemonic, setMnemonic }
}

function LearnAccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="learn-accordion-section">
      <button
        className={isOpen ? 'learn-accordion-header active' : 'learn-accordion-header'}
        onClick={onToggle}
      >
        {title}
        <span className="learn-accordion-caret">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="learn-accordion-body">{children}</div>}
    </div>
  )
}

function CurriculumNav({
  nav,
  activeAssignmentId,
  completedIds,
  onSelectAssignment,
}: {
  nav: LearnNav
  activeAssignmentId: string | null
  completedIds: Set<string>
  onSelectAssignment: (assignment: Assignment) => void
}) {
  const stage: Stage | null = CURRICULUM.find((s) => s.id === nav.stageId) ?? null
  const task: Task | null = stage?.tasks.find((t) => t.id === nav.taskId) ?? null

  // Stage list (top level of the curriculum)
  if (!stage) {
    return (
      <ul className="learn-list">
        {CURRICULUM.map((s) => {
          const p = progressOf(s.tasks.flatMap((t) => t.assignments), completedIds)
          return (
            <li key={s.id}>
              <button className="learn-item" onClick={() => nav.setStageId(s.id)}>
                <span className="learn-item-title">{s.title}</span>
                <span className="learn-item-progress">{p.done}/{p.total}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  // Task list (within a stage)
  if (!task) {
    return (
      <>
        <button className="learn-back" onClick={() => nav.setStageId(null)}>← Stages</button>
        <h4 className="learn-stage-title">{stage.title}</h4>
        <ul className="learn-list">
          {stage.tasks.map((t) => {
            const p = progressOf(t.assignments, completedIds)
            return (
              <li key={t.id}>
                <button className="learn-item" onClick={() => nav.setTaskId(t.id)}>
                  <span className="learn-item-title">{t.title}</span>
                  <span className="learn-item-progress">{p.done}/{p.total}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  // Assignment list (within a task)
  return (
    <>
      <button className="learn-back" onClick={() => nav.setTaskId(null)}>← {stage.title}</button>
      <h4 className="learn-stage-title">{task.title}</h4>
      <ul className="learn-lesson-list">
        {task.assignments.map((a) => {
          const isActive = a.id === activeAssignmentId
          const isDone = completedIds.has(a.id)
          return (
            <li key={a.id}>
              <button
                className={`learn-lesson${isActive ? ' active' : ''}${isDone ? ' completed' : ''}`}
                onClick={() => onSelectAssignment(a)}
              >
                <span className="learn-lesson-check">{isDone ? '✓' : '○'}</span>
                {a.title}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function ReferenceNav({ nav }: { nav: LearnNav }) {
  const category: InstructionCategory | null = INSTRUCTION_REFERENCE.find((c) => c.id === nav.categoryId) ?? null

  // Category list (top level of the reference)
  if (!category) {
    return (
      <ul className="learn-list">
        {INSTRUCTION_REFERENCE.map((c) => (
          <li key={c.id}>
            <button className="learn-item" onClick={() => nav.setCategoryId(c.id)}>
              <span className="learn-item-title">{c.title}</span>
              <span className="learn-item-progress">{c.instructions.length}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  // Instruction list (within a category)
  return (
    <>
      <button
        className="learn-back"
        onClick={() => { nav.setCategoryId(null); nav.setMnemonic(null) }}
      >
        ← Categories
      </button>
      <h4 className="learn-stage-title">{category.title}</h4>
      <ul className="learn-lesson-list">
        {category.instructions.map((i) => {
          const isActive = i.mnemonics.includes(nav.mnemonic ?? '')
          return (
            <li key={i.mnemonics.join('/')}>
              <button
                className={isActive ? 'learn-lesson active' : 'learn-lesson'}
                onClick={() => nav.setMnemonic(i.mnemonics[0])}
              >
                {i.mnemonics.join(' / ')}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sidebar: shown under the Learn tab (narrow column). Only navigation --
// two stacked accordion sections (Instruction Reference on top, Curriculum
// below), each expanding to show its own back button and clickable list.
// ---------------------------------------------------------------------------

export function LearnSidebar({
  nav,
  activeAssignmentId,
  completedIds,
  onSelectAssignment,
}: {
  nav: LearnNav
  activeAssignmentId: string | null
  completedIds: Set<string>
  onSelectAssignment: (assignment: Assignment) => void
}) {
  return (
    <div className="mode-panel learn-panel">
      <LearnAccordionSection
        title="Instruction Reference"
        isOpen={nav.section === 'reference'}
        onToggle={() => nav.setSection('reference')}
      >
        <ReferenceNav nav={nav} />
      </LearnAccordionSection>
      <LearnAccordionSection
        title="Curriculum"
        isOpen={nav.section === 'curriculum'}
        onToggle={() => nav.setSection('curriculum')}
      >
        <CurriculumNav
          nav={nav}
          activeAssignmentId={activeAssignmentId}
          completedIds={completedIds}
          onSelectAssignment={onSelectAssignment}
        />
      </LearnAccordionSection>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail: shown above the code editor (wide column). Explanations only --
// no clickable navigation, just the text/example for whatever is selected.
// ---------------------------------------------------------------------------

export function LearnDetail({
  nav,
  activeAssignmentId,
  completedIds,
}: {
  nav: LearnNav
  activeAssignmentId: string | null
  completedIds: Set<string>
}) {
  const stage: Stage | null = CURRICULUM.find((s) => s.id === nav.stageId) ?? null
  const task: Task | null = stage?.tasks.find((t) => t.id === nav.taskId) ?? null
  const category: InstructionCategory | null = INSTRUCTION_REFERENCE.find((c) => c.id === nav.categoryId) ?? null
  const instruction: InstructionDoc | null = category?.instructions.find((i) => i.mnemonics.includes(nav.mnemonic ?? '')) ?? null

  if (nav.section === 'reference') {
    if (!category) {
      return (
        <div className="mode-panel learn-detail-panel">
          <p className="example-description">
            Every instruction and directive this simulator understands, grouped by category, with its exact
            behavior and a short example. Pick a category on the left to get started.
          </p>
        </div>
      )
    }

    if (!instruction) {
      return (
        <div className="mode-panel learn-detail-panel">
          <h4 className="learn-stage-title">{category.title}</h4>
          <p className="example-description">Pick an instruction on the left to see its syntax, flags, and an example.</p>
        </div>
      )
    }

    return (
      <div className="mode-panel learn-detail-panel">
        <h4 className="learn-stage-title">{instruction.mnemonics.join(' / ')}</h4>
        <p className="example-description">{instruction.summary}</p>
        <code className="instr-syntax">{instruction.syntax}</code>
        <p className="example-description">{instruction.description}</p>
        <p className="instr-flags"><strong>Flags:</strong> {instruction.flags}</p>
        <pre className="instr-example">{instruction.example}</pre>
        <p className="instr-example-note">{instruction.exampleNote}</p>
        {instruction.notes && (
          <ul className="instr-notes">
            {instruction.notes.map((n, idx) => <li key={idx}>{n}</li>)}
          </ul>
        )}
      </div>
    )
  }

  if (!stage) {
    const allAssignments = CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments))
    const overall = progressOf(allAssignments, completedIds)
    return (
      <div className="mode-panel learn-detail-panel">
        <p className="example-description">
          A 4-stage lab curriculum, simple to complex. {overall.done} / {overall.total} assignments completed. Pick
          a stage on the left to get started.
        </p>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="mode-panel learn-detail-panel">
        <h4 className="learn-stage-title">{stage.title}</h4>
        <p className="example-description">{stage.summary}</p>
      </div>
    )
  }

  const activeAssignment = task.assignments.find((a) => a.id === activeAssignmentId) ?? null
  return (
    <div className="mode-panel learn-detail-panel">
      <h4 className="learn-stage-title">{task.title}</h4>
      <p className="example-description">{task.scenario}</p>
      <p className="example-description learn-concept">
        {activeAssignment ? activeAssignment.concept : 'Pick an assignment on the left to load it into the editor.'}
      </p>
    </div>
  )
}
