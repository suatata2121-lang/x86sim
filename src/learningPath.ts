// The weekly learning path shown to signed-in students: 11 modules, each
// tying a concept page to an example program that makes it visible and to
// the curriculum assignments that practise it. Modules only reference
// existing content by id (Learn pages, EXAMPLES, CURRICULUM) -- nothing is
// copied here.

export type AsidePanel = 'registers' | 'stack' | 'devices' | 'databus' | 'memory' | 'profiler'

export type ConceptRef =
  | { section: 'hardware'; id: string }
  | { section: 'numbering'; id: string }
  | { section: 'reference'; id: string } // an Instruction Reference category

export interface LearningModule {
  id: string
  title: string
  summary: string
  concepts: ConceptRef[]
  observe?: { examples: string[]; panel: AsidePanel }
  assignments: string[]
  /** The steps this module shows, in order; the five standard ones when absent. */
  steps?: StepId[]
  /** Quiz (src/quizzes.ts) that closes the module; it opens once every concept is marked as read. */
  quiz?: string
  /** Modules that must be done before this one can be opened. */
  requires?: string[]
}

export type StepId = 'concept' | 'observe' | 'predict' | 'task' | 'quiz' | 'reflect'
/** What module_progress.step holds: the step the student is on, or 'done'. */
export type StoredStep = StepId | 'done'

export const STEPS: { id: StepId; label: string; comingSoon?: boolean }[] = [
  { id: 'concept', label: 'Concept' },
  { id: 'observe', label: 'Observe' },
  // Placeholders until #11 (Predict) and #16 (Reflect) land; Continue skips them.
  { id: 'predict', label: 'Predict', comingSoon: true },
  { id: 'task', label: 'Task' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'reflect', label: 'Reflect', comingSoon: true },
]

const STANDARD_STEPS: StepId[] = ['concept', 'observe', 'predict', 'task', 'reflect']

/** The steps a module's card shows, placeholders included. */
export function shownSteps(module: LearningModule) {
  return STEPS.filter((s) => (module.steps ?? STANDARD_STEPS).includes(s.id))
}

const hw = (id: string): ConceptRef => ({ section: 'hardware', id })
const num = (id: string): ConceptRef => ({ section: 'numbering', id })

export const LEARNING_PATH: LearningModule[] = [
  {
    id: 'm0',
    title: 'Number Systems',
    summary: 'Read and convert the binary, hexadecimal and signed numbers every later module is written in, and do arithmetic and logic on them.',
    concepts: [
      num('bases'), num('conversions'), num('signed-numbers'), num('literals'),
      num('add-sub'), num('mul-div'), num('logic'),
    ],
    assignments: [],
    // Read every topic, then pass the quiz (issue #20); no program to run yet.
    steps: ['concept', 'quiz'],
    quiz: 'm0',
  },
  {
    id: 'm1',
    title: 'The CPU and Its Registers',
    summary: 'See how the CPU fetches, decodes and executes instructions that move data between registers.',
    requires: ['m0'],
    concepts: [hw('fetch-decode-execute'), hw('register-file')],
    observe: { examples: ['arithmetic'], panel: 'registers' },
    assignments: ['t1-sensor-registers', 't2-swap-readings'],
  },
  {
    id: 'm2',
    title: 'Memory and the Bus',
    summary: 'Follow data as it travels between the CPU and memory over the address and data buses.',
    requires: ['m0'],
    concepts: [hw('bus-types'), hw('address-demux'), hw('segmented-addressing')],
    observe: { examples: ['array-sum', 'base-index'], panel: 'memory' },
    assignments: ['t3-snapshot'],
  },
  {
    id: 'm3',
    title: 'The ALU and Flags',
    summary: 'Use arithmetic and logic instructions and read the flags they leave behind to make decisions.',
    requires: ['m0'],
    concepts: [hw('alu-operations'), hw('flags-register')],
    observe: { examples: ['bitwise', 'xchg-neg-test'], panel: 'registers' },
    assignments: ['t4-turbidity-normal', 't4-turbidity-alarm', 't5-status-bits'],
  },
  {
    id: 'm4',
    title: 'Loops and the Instruction Queue',
    summary: 'Write loops and see how the prefetch queue and jumps affect how long they take.',
    requires: ['m0'],
    concepts: [hw('prefetch-queue'), hw('pipeline-stalls')],
    observe: { examples: ['counting-loop', 'max-of-two'], panel: 'profiler' },
    assignments: ['t6-route-sum'],
  },
  {
    id: 'm5',
    title: 'The Stack and Subroutines',
    summary: 'Call subroutines and watch PUSH, POP, CALL and RET move the stack pointer.',
    requires: ['m0'],
    concepts: [hw('push-pop'), hw('call-ret')],
    observe: { examples: ['call-ret', 'masm-boilerplate'], panel: 'stack' },
    assignments: ['t7-average-proc'],
  },
  {
    id: 'm6',
    title: 'BIU/EU and Bus Timing',
    summary: 'Split the 8086 into its bus and execution units and follow a bus cycle clock by clock.',
    requires: ['m0'],
    concepts: [hw('biu-eu'), hw('bus-timing'), hw('control-signals')],
    observe: { examples: ['array-sum'], panel: 'databus' },
    assignments: [],
  },
  {
    id: 'm7',
    title: 'I/O Ports and Devices',
    summary: 'Drive real-world devices such as a traffic light and a stepper motor through I/O ports.',
    requires: ['m0'],
    concepts: [hw('io-ports')],
    observe: { examples: ['traffic-light', 'stepper-motor', 'seven-segment', 'thermometer'], panel: 'devices' },
    assignments: ['t8-stepper-command'],
  },
  {
    id: 'm8',
    title: 'Interrupts and Sharing the Bus',
    summary: 'Use software interrupts for input and output and see how other devices borrow the bus.',
    requires: ['m0'],
    concepts: [hw('software-vs-hardware-interrupts'), hw('bus-request-grant'), hw('lock-signal')],
    observe: { examples: ['keyboard-echo'], panel: 'registers' },
    assignments: ['t9-print-status'],
  },
  {
    id: 'm9',
    title: 'Signed and Multi-Word Arithmetic',
    summary: 'Handle negative numbers and values wider than 16 bits with carries, borrows and signed division.',
    requires: ['m0'],
    concepts: [num('signed-numbers')],
    observe: { examples: ['muldiv'], panel: 'registers' },
    assignments: ['t10-32bit-increment', 't11-negative-average', 't12-tally-correction'],
  },
  {
    id: 'm10',
    title: 'Rotation, Saved Flags and String Copies',
    summary: 'Rotate bits, preserve flags across calls and copy blocks of memory with string instructions.',
    requires: ['m0'],
    concepts: [{ section: 'reference', id: 'string-ops' }],
    observe: { examples: ['string-copy'], panel: 'memory' },
    assignments: ['t13-rotate-indicator', 't14-preserve-carry', 't15-copy-samples'],
  },
]

export type ModuleStatus = 'done' | 'in-progress' | 'not-started'

/** What a student has earned, as recorded on the server -- never set by clicking through steps. */
export interface PathProgress {
  /** Curriculum assignments passed. */
  completed: Set<string>
  /** Modules whose quiz has a passing attempt. */
  quizzesPassed: Set<string>
  /** Module id -> concept ids marked as read. */
  reads: Map<string, Set<string>>
}

/** The steps Continue walks through, in order: no placeholders, no Task without assignments. */
export function activeSteps(module: LearningModule): StepId[] {
  if (module.steps) return module.steps.filter((id) => !STEPS.find((s) => s.id === id)?.comingSoon)
  return module.assignments.length > 0 ? ['concept', 'observe', 'task'] : ['concept', 'observe']
}

// A module with a quiz is done only once the quiz is passed, and one with
// assignments only when every one is passed (both come from graded attempts,
// not from the step the student is on). Modules with neither close once the
// student finishes Observe, until Predict (#11) exists.
export function isModuleDone(module: LearningModule, progress: PathProgress, step: StoredStep | undefined): boolean {
  if (module.quiz) return progress.quizzesPassed.has(module.id)
  return module.assignments.length > 0 ? module.assignments.every((id) => progress.completed.has(id)) : step === 'done'
}

export function moduleStatus(module: LearningModule, progress: PathProgress, step: StoredStep | undefined): ModuleStatus {
  if (isModuleDone(module, progress, step)) return 'done'
  if (step !== undefined || module.assignments.some((id) => progress.completed.has(id)) || progress.reads.get(module.id)?.size) {
    return 'in-progress'
  }
  return 'not-started'
}

/** Concepts not yet marked as read; a module's quiz stays shut until this is empty. */
export function unreadConcepts(module: LearningModule, progress: PathProgress): ConceptRef[] {
  const read = progress.reads.get(module.id)
  return module.concepts.filter((c) => !read?.has(c.id))
}

/** Whether every module this one requires is done. */
export function isUnlocked(module: LearningModule, progress: PathProgress, rows: Map<string, ModuleProgressRow>): boolean {
  return (module.requires ?? []).every((id) => {
    const required = LEARNING_PATH.find((m) => m.id === id)
    return !required || isModuleDone(required, progress, rows.get(id)?.step)
  })
}

/** The step after `step`; past the last one 'done', but only for modules with no assignment or quiz to close them. */
export function nextStep(module: LearningModule, step: StepId): StoredStep {
  const steps = activeSteps(module)
  const i = steps.indexOf(step)
  if (i >= 0 && i < steps.length - 1) return steps[i + 1]
  return module.quiz ? 'quiz' : module.assignments.length > 0 ? 'task' : 'done'
}

export interface ModuleProgressRow {
  module_id: string
  step: StoredStep
  updated_at: string
}

/**
 * The module the Continue card should offer: the one the student touched last,
 * unless it is finished, in which case the first unfinished, unlocked module after it.
 * Null once every module is done.
 */
export function currentModule(rows: Map<string, ModuleProgressRow>, progress: PathProgress): LearningModule | null {
  const done = (m: LearningModule) => isModuleDone(m, progress, rows.get(m.id)?.step)
  let latest: ModuleProgressRow | null = null
  for (const row of rows.values()) {
    if (!latest || row.updated_at > latest.updated_at) latest = row
  }
  const start = Math.max(0, LEARNING_PATH.findIndex((m) => m.id === latest?.module_id))
  const ordered = [...LEARNING_PATH.slice(start), ...LEARNING_PATH.slice(0, start)]
  return ordered.find((m) => !done(m) && isUnlocked(m, progress, rows)) ?? null
}

/**
 * The step to resume a module on: its stored step, or Concept if never opened.
 * A quiz module stays on Concept until every topic is read, and one stored as
 * 'done' before it had a quiz (m0 used to close after Observe) starts over.
 */
export function resumeStep(module: LearningModule, row: ModuleProgressRow | undefined, progress: PathProgress): StepId {
  const step = !row || row.step === 'done' ? 'concept' : row.step
  if (!activeSteps(module).includes(step)) return 'concept'
  return step === 'quiz' && unreadConcepts(module, progress).length > 0 ? 'concept' : step
}
