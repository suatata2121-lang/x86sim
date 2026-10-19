// The weekly learning path shown to signed-in students: 11 modules, each
// tying a concept page to an example program that makes it visible and to
// the curriculum assignments that practise it. Modules only reference
// existing content by id (Learn pages, EXAMPLES, CURRICULUM) -- nothing is
// copied here.

import type { Reg16 } from './core/types'
import type { PredictQuestion } from './core/predict'
import { PREDICT_QUESTIONS } from './predictQuestions'

export type AsidePanel = 'registers' | 'stack' | 'devices' | 'databus' | 'memory' | 'profiler'

export interface ObserveSpec {
  examples: string[]
  panel: AsidePanel
  /**
   * What to look for. Modules whose panel is 'registers' open the compact
   * one-screen viewer (ObserveView), which shows this as a line under its
   * title; others show it in a box above the editor.
   */
  watch?: string
  /** Two or three things to look at, shown as a list with the example (#10). */
  guide?: string[]
  /** Registers the compact viewer shows; AX, BX, CX, DX when absent. */
  registers?: Reg16[]
  /** Example id -> source line -> the "What happened" text after that line runs. */
  callouts?: Record<string, Record<number, string>>
}

/**
 * The lab tools a module's pages show: 'editor' (the code tabs), 'run' (the
 * toolbar, output and test results) and each side panel by name.
 */
export type ModuleTool = 'editor' | 'run' | AsidePanel

export type ConceptRef =
  | { section: 'hardware'; id: string }
  | { section: 'numbering'; id: string }
  | { section: 'reference'; id: string } // an Instruction Reference category

/**
 * Something on a module's checklist that the student has to do, not just
 * read (issue #25): step through an interactive view, run a demo or an
 * example to the end, solve challenges. Each completion is recorded in
 * interactive_runs under the item's id, or under each of its `parts` (the
 * row is done when all of them are).
 */
export interface Interactive {
  id: string
  /** Shown on the checklist; {n} is replaced by the number of parts done. */
  label: string
  /** The Learn page (a concept of the module) where it lives. */
  topic?: string
  /** An example (examples.ts) run in the main simulator; its id is `example-<id>`. */
  example?: string
  parts?: string[]
}

export interface LearningModule {
  id: string
  title: string
  summary: string
  concepts: ConceptRef[]
  observe?: ObserveSpec
  assignments: string[]
  /** The steps this module shows, in order; the five standard ones when absent. */
  steps?: StepId[]
  /**
   * Quiz (src/quizzes.ts) that closes the module. It opens once everything
   * else on the module's checklist is done: every concept read, every
   * interactive done and every assignment passed.
   */
  quiz?: string
  interactives?: Interactive[]
  /** Modules that must be done before this one can be opened. */
  requires?: string[]
  /** Tools shown next to this module's Learn pages; all of them when absent. */
  tools?: ModuleTool[]
}

export type StepId = 'concept' | 'observe' | 'predict' | 'task' | 'quiz' | 'reflect'
/** What module_progress.step holds: the step the student is on, or 'done'. */
export type StoredStep = StepId | 'done'

export const STEPS: { id: StepId; label: string; comingSoon?: boolean }[] = [
  { id: 'concept', label: 'Concept' },
  { id: 'observe', label: 'Observe' },
  { id: 'predict', label: 'Predict' },
  { id: 'task', label: 'Task' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'reflect', label: 'Reflect' },
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
    // Reading only: no code to write or run, so the pages get the full width.
    tools: [],
  },
  {
    id: 'm1',
    title: 'The CPU and Its Registers',
    summary: 'See how the CPU fetches, decodes and executes instructions that move data between registers.',
    requires: ['m0'],
    concepts: [hw('fetch-decode-execute'), hw('register-file'), hw('data-movement')],
    observe: {
      examples: ['arithmetic'],
      panel: 'registers',
      watch: 'Press Step one line at a time. Before each Step, guess what the next line will change.',
      guide: [
        'Before each Step, say out loud which register will change.',
        'After ADD AX, BX, check that AX is 42 in decimal and 002Ah in hex.',
        'MOV CX, AX copies: AX keeps its value.',
      ],
      registers: ['AX', 'BX', 'CX'],
      // Line numbers in the arithmetic example's source (examples.ts), checked by running it.
      callouts: {
        arithmetic: {
          2: 'MOV AX, 25: AX 0000h → 0019h (25 in hex is 19h).',
          3: 'MOV BX, 17: BX 0000h → 0011h. AX is untouched.',
          4: 'ADD AX, BX: AX 0019h → 002Ah (25 + 17 = 42). BX stays 0011h -- only the destination changes.',
          5: 'SUB AX, 5: AX 002Ah → 0025h (42 - 5 = 37).',
          6: 'MOV CX, AX: CX 0000h → 0025h. MOV copies, so AX keeps 0025h.',
          8: 'MOV AH, 4Ch: only the high byte of AX changes, 0025h → 4C25h. AL still holds 25h (37).',
          9: 'INT 21h with AH = 4Ch ends the program and returns to DOS.',
        },
      },
    },
    assignments: ['t1-sensor-registers', 't2-swap-readings'],
    // Issue #25: read, try every interactive, pass both tasks, then the quiz.
    steps: ['concept', 'observe', 'task', 'quiz'],
    quiz: 'm1',
    interactives: [
      { id: 'fde-program', label: 'Try: step through the fetch-decode-execute program', topic: 'fetch-decode-execute' },
      { id: 'register-file-demo', label: 'Run: the Register File demo to the end', topic: 'register-file' },
      {
        id: 'move-it',
        label: 'Solve: the Moving Data challenges ({n}/5)',
        topic: 'data-movement',
        parts: ['move-it-1', 'move-it-2', 'move-it-3', 'move-it-4', 'move-it-5'],
      },
      { id: 'example-arithmetic', label: 'Observe: run the Arithmetic example to the end', example: 'arithmetic' },
    ],
  },
  {
    id: 'm2',
    title: 'Memory and the Bus',
    summary: 'Follow data as it travels between the CPU and memory over the address and data buses.',
    requires: ['m1'],
    concepts: [
      hw('von-neumann-harvard'), hw('bus-types'), hw('address-demux'), hw('segmented-addressing'),
      hw('memory-banking'), hw('memory-interfacing'),
    ],
    observe: {
      examples: ['array-sum', 'base-index'],
      panel: 'memory',
      guide: [
        'Open Memory and jump to the NUMS label: these are the bytes the loop reads.',
        'On MOV BL, [NUMS+SI] the Data Bus panel shows a memory read. Instructions that only use registers never touch the bus.',
      ],
    },
    assignments: ['t3-snapshot'],
    interactives: [
      {
        id: 'bank-selector',
        label: 'Try: all four cases in the Bank Selector ({n}/4)',
        topic: 'memory-banking',
        parts: ['bank-even-byte', 'bank-odd-byte', 'bank-even-word', 'bank-odd-word'],
      },
      { id: 'memory-interfacing-figure', label: 'Step: the memory interfacing figure to the end', topic: 'memory-interfacing' },
    ],
  },
  {
    // A new id rather than renumbering: stored progress of m3-m10 keeps its module.
    id: 'm12',
    title: 'Segments, Addressing Modes and Byte Order',
    summary:
      'Turn segment:offset pairs into physical addresses, work out where each addressing mode points, and read ' +
      'multi-byte values byte by byte.',
    requires: ['m2'],
    concepts: [hw('program-segments'), hw('addressing-modes'), hw('byte-order')],
    observe: {
      examples: ['endian-store', 'base-index'],
      panel: 'memory',
      watch: 'Watch the memory panel: which byte of AX lands at the lower address?',
    },
    assignments: ['t19-store-little-endian', 't20-network-order', 't21-table-lookup'],
    steps: ['concept', 'observe', 'predict', 'task', 'quiz', 'reflect'],
    quiz: 'm12',
    interactives: [
      {
        id: 'seg-practice',
        label: 'Practice: five segment questions right ({n}/5)',
        topic: 'program-segments',
        parts: ['seg-practice-1', 'seg-practice-2', 'seg-practice-3', 'seg-practice-4', 'seg-practice-5'],
      },
      {
        id: 'ea-presets',
        label: 'Run: the four Effective Address Calculator presets ({n}/4)',
        topic: 'addressing-modes',
        parts: ['ea-preset-1', 'ea-preset-2', 'ea-preset-3', 'ea-preset-4'],
      },
      {
        id: 'byte-layout',
        label: 'Try: the byte layout both ways ({n}/2)',
        topic: 'byte-order',
        parts: ['byte-layout-value', 'byte-layout-dump'],
      },
    ],
  },
  {
    id: 'm3',
    title: 'The ALU and Flags',
    summary: 'Use arithmetic and logic instructions and read the flags they leave behind to make decisions.',
    requires: ['m0'],
    concepts: [hw('alu-operations'), hw('flags-register')],
    observe: {
      examples: ['bitwise', 'xchg-neg-test'],
      panel: 'registers',
      guide: [
        'Watch ZF and SF after every AND, OR, XOR and TEST.',
        'TEST changes the flags but not the register: compare it with AND.',
      ],
    },
    assignments: ['t4-turbidity-normal', 't4-turbidity-alarm', 't5-status-bits'],
  },
  {
    id: 'm4',
    title: 'Loops and the Instruction Queue',
    summary: 'Write loops and see how the prefetch queue and jumps affect how long they take.',
    requires: ['m0'],
    concepts: [hw('prefetch-queue'), hw('pipeline-stalls')],
    observe: {
      examples: ['counting-loop', 'max-of-two'],
      panel: 'profiler',
      guide: [
        'Run once and note the total cycles.',
        'In the Profiler, compare the cost of the jump instruction with a MOV: a taken jump empties the instruction queue.',
      ],
    },
    assignments: ['t6-route-sum'],
  },
  {
    id: 'm5',
    title: 'The Stack and Subroutines',
    summary: 'Call subroutines and watch PUSH, POP, CALL and RET move the stack pointer.',
    requires: ['m0'],
    concepts: [hw('push-pop'), hw('call-ret')],
    observe: {
      examples: ['call-ret', 'masm-boilerplate', 'stack-trace'],
      panel: 'stack',
      guide: [
        'Step onto CALL and watch SP drop by 2: the return address is now on the stack.',
        'On RET, SP goes back up and execution continues on the line after CALL.',
      ],
    },
    assignments: ['t7-average-proc'],
    interactives: [
      { id: 'push-pop-figure', label: 'Step: PUSH and POP byte by byte to the end', topic: 'push-pop' },
    ],
  },
  {
    id: 'm6',
    title: 'BIU/EU and Bus Timing',
    summary: 'Split the 8086 into its bus and execution units and follow a bus cycle clock by clock.',
    requires: ['m0'],
    concepts: [hw('biu-eu'), hw('bus-timing'), hw('control-signals')],
    observe: {
      examples: ['array-sum'],
      panel: 'databus',
      guide: [
        'Step through MOV BL, [NUMS+SI] and see the memory read it causes.',
        'Compare it with the timing diagram on the Bus Cycles page: in T1 the address goes out on the bus, in T3 the data comes back.',
      ],
    },
    assignments: [],
  },
  {
    id: 'm7',
    title: 'I/O Ports and Devices',
    summary: 'Drive real-world devices such as a traffic light and a stepper motor through I/O ports.',
    requires: ['m0'],
    concepts: [hw('io-ports'), hw('io-mapping')],
    observe: {
      examples: ['traffic-light', 'stepper-motor', 'seven-segment', 'thermometer'],
      panel: 'devices',
      guide: [
        'Use Animate, not Run, so you can see each OUT change the device.',
        'Match the port number in each OUT with the device that reacts.',
      ],
    },
    assignments: ['t8-stepper-command'],
    interactives: [
      { id: 'io-mapping-figure', label: 'Step: the isolated vs memory-mapped figure to the end', topic: 'io-mapping' },
    ],
  },
  {
    // A new id rather than renumbering: stored progress of m8-m10 keeps its module.
    id: 'm11',
    title: 'The 8255 Programmable Peripheral Interface',
    summary: "Program the 8255's three ports with a control word, read switches and drive a display through it.",
    requires: ['m7'],
    concepts: [hw('ppi-8255-overview'), hw('ppi-8255-control-word'), hw('ppi-8255-bsr')],
    observe: {
      examples: ['ppi-switches'],
      panel: 'devices',
      watch: "Flip the switches on Port A and watch the value appear on Port B's display.",
    },
    assignments: ['t16-ppi-config', 't17-switch-count', 't18-bsr-alarm'],
    steps: ['concept', 'observe', 'predict', 'task', 'quiz', 'reflect'],
    quiz: 'm11',
    interactives: [
      {
        id: 'ppi-control-word',
        label: 'Build: three different control words ({n}/3)',
        topic: 'ppi-8255-control-word',
        parts: ['ppi-cw-1', 'ppi-cw-2', 'ppi-cw-3'],
      },
      {
        id: 'ppi-bsr',
        label: 'Try: set and reset a Port C bit with BSR ({n}/2)',
        topic: 'ppi-8255-bsr',
        parts: ['ppi-bsr-set', 'ppi-bsr-reset'],
      },
    ],
  },
  {
    id: 'm8',
    title: 'Interrupts and Sharing the Bus',
    summary: 'Use software interrupts for input and output and see how other devices borrow the bus.',
    requires: ['m0'],
    concepts: [hw('software-vs-hardware-interrupts'), hw('bus-request-grant'), hw('dma-8257'), hw('lock-signal')],
    observe: {
      examples: ['keyboard-echo'],
      panel: 'memory',
      guide: [
        'The program stops at INT 21h AH=0Ah until you type a line and press Enter: a software interrupt asking DOS for input.',
        'Open Memory at BUF: DOS wrote the number of characters into BUF+1 and the characters after it.',
      ],
    },
    assignments: ['t9-print-status'],
    interactives: [
      { id: 'dma-8257-figure', label: 'Step: the DMA transfer figure to the end', topic: 'dma-8257' },
    ],
  },
  {
    // A new id rather than renumbering: stored progress of m9 and later keeps its module.
    id: 'm13',
    title: 'Interrupts and the 8259 PIC',
    summary:
      "Find an interrupt's vector, follow what the CPU saves and restores, and see how the 8259 decides which " +
      'device gets served.',
    requires: ['m8'],
    concepts: [hw('interrupt-types'), hw('interrupt-vector-table'), hw('interrupt-sequence'), hw('pic-8259')],
    observe: {
      examples: ['keyboard-echo', 'int21-demo'],
      panel: 'registers',
      watch: 'Each INT 21h does a different job depending on AH. Watch AH before every INT.',
    },
    assignments: ['t22-pic-mask', 't23-ivt-entry', 't24-isr-address'],
    steps: ['concept', 'observe', 'predict', 'task', 'quiz', 'reflect'],
    quiz: 'm13',
    interactives: [
      {
        id: 'ivt-calc',
        label: 'Try: the IVT calculator with three different types ({n}/3)',
        topic: 'interrupt-vector-table',
        parts: ['ivt-calc-1', 'ivt-calc-2', 'ivt-calc-3'],
      },
      { id: 'interrupt-sequence-figure', label: 'Step: the interrupt sequence figure to the end', topic: 'interrupt-sequence' },
      {
        id: 'pic-playground',
        label: 'Try: serve, mask and end a request in the PIC playground ({n}/3)',
        topic: 'pic-8259',
        parts: ['pic-served', 'pic-masked', 'pic-eoi'],
      },
    ],
  },
  {
    id: 'm9',
    title: 'Signed and Multi-Word Arithmetic',
    summary: 'Handle negative numbers and values wider than 16 bits with carries, borrows and signed division.',
    requires: ['m0'],
    concepts: [num('signed-numbers')],
    observe: {
      examples: ['muldiv'],
      panel: 'registers',
      guide: [
        'After MUL BL, the 8-bit × 8-bit result fills all of AX, not just AL.',
        'After DIV BL, AL holds the quotient (8) and AH the remainder (2).',
      ],
    },
    assignments: ['t10-32bit-increment', 't11-negative-average', 't12-tally-correction'],
  },
  {
    id: 'm10',
    title: 'Rotation, Saved Flags and String Copies',
    summary: 'Rotate bits, preserve flags across calls and copy blocks of memory with string instructions.',
    requires: ['m0'],
    concepts: [{ section: 'reference', id: 'string-ops' }],
    observe: {
      examples: ['string-copy'],
      panel: 'memory',
      guide: [
        'Open Memory at the destination label and watch it fill one byte per repetition.',
        'CX counts down and SI/DI count up while REP repeats MOVSB.',
      ],
    },
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
  /** Module id -> interactive item ids done (interactive_runs). */
  interactives: Map<string, Set<string>>
  /** Module id -> Predict question ids answered, right or wrong (predictions). */
  predicted: Map<string, Set<string>>
}

/** Predict questions not answered yet; the Predict step moves on once this is empty. */
export function unansweredPredictions(module: LearningModule, progress: PathProgress): PredictQuestion[] {
  const done = progress.predicted.get(module.id)
  return predictQuestions(module).filter((q) => !done?.has(q.id))
}

/** The module's Predict questions (predictQuestions.ts); none means no Predict step. */
export const predictQuestions = (module: LearningModule): PredictQuestion[] => PREDICT_QUESTIONS[module.id] ?? []

/**
 * The steps Continue walks through, in order: no placeholders, no Predict
 * without questions, no Task without assignments.
 */
export function activeSteps(module: LearningModule): StepId[] {
  const hasPredict = predictQuestions(module).length > 0
  if (module.steps) {
    return module.steps.filter((id) => !STEPS.find((s) => s.id === id)?.comingSoon && (id !== 'predict' || hasPredict))
  }
  return [
    'concept', 'observe',
    ...(hasPredict ? ['predict' as const] : []),
    ...(module.assignments.length > 0 ? ['task' as const] : []),
    'reflect',
  ]
}

// A module with a quiz is done once the quiz and every assignment are
// passed, and one with only assignments when they are (both come from graded
// attempts, not from the step the student is on). Modules with neither close
// once the student finishes Observe, until Predict (#11) exists.
export function isModuleDone(module: LearningModule, progress: PathProgress, step: StoredStep | undefined): boolean {
  const tasksPassed = module.assignments.every((id) => progress.completed.has(id))
  if (module.quiz) return progress.quizzesPassed.has(module.id) && tasksPassed
  return module.assignments.length > 0 ? tasksPassed : step === 'done'
}

export function moduleStatus(module: LearningModule, progress: PathProgress, step: StoredStep | undefined): ModuleStatus {
  if (isModuleDone(module, progress, step)) return 'done'
  if (
    step !== undefined || module.assignments.some((id) => progress.completed.has(id)) ||
    progress.reads.get(module.id)?.size || progress.interactives.get(module.id)?.size
  ) {
    return 'in-progress'
  }
  return 'not-started'
}

/** Concepts not yet marked as read; a module's quiz stays shut until this is empty. */
export function unreadConcepts(module: LearningModule, progress: PathProgress): ConceptRef[] {
  const read = progress.reads.get(module.id)
  return module.concepts.filter((c) => !read?.has(c.id))
}

/** The item ids an interactive is recorded under: its parts, or itself. */
export const interactiveParts = (item: Interactive) => item.parts ?? [item.id]

export function partsDone(module: LearningModule, item: Interactive, progress: PathProgress): number {
  const done = progress.interactives.get(module.id)
  return interactiveParts(item).filter((p) => done?.has(p)).length
}

export type ChecklistRow =
  | { kind: 'read'; concept: ConceptRef; done: boolean }
  | { kind: 'interactive'; item: Interactive; done: boolean; partsDone: number }
  | { kind: 'tasks'; done: boolean }
  | { kind: 'quiz'; done: boolean }

/**
 * What a quiz module asks for, in order: read every concept, do every
 * interactive, pass the assignments, pass the quiz. quiz_draw checks the same
 * list on the server (quiz_settings.required_*).
 */
export function checklist(module: LearningModule, progress: PathProgress): ChecklistRow[] {
  const read = progress.reads.get(module.id)
  return [
    ...module.concepts.map((c): ChecklistRow => ({ kind: 'read', concept: c, done: !!read?.has(c.id) })),
    ...(module.interactives ?? []).map((item): ChecklistRow => {
      const n = partsDone(module, item, progress)
      return { kind: 'interactive', item, done: n === interactiveParts(item).length, partsDone: n }
    }),
    ...(module.assignments.length > 0
      ? [{ kind: 'tasks', done: module.assignments.every((id) => progress.completed.has(id)) } as ChecklistRow]
      : []),
    ...(module.quiz ? [{ kind: 'quiz', done: progress.quizzesPassed.has(module.id) } as ChecklistRow] : []),
  ]
}

/** How many checklist items still stand between the student and the module's quiz. */
export function quizBlockers(module: LearningModule, progress: PathProgress): number {
  return checklist(module, progress).filter((r) => r.kind !== 'quiz' && !r.done).length
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
export function currentModule(
  rows: Map<string, ModuleProgressRow>,
  progress: PathProgress,
  /** Modules the instructor has opened (#13); one not open yet is offered only if nothing else is left. */
  isOpen: (m: LearningModule) => boolean = () => true,
): LearningModule | null {
  const done = (m: LearningModule) => isModuleDone(m, progress, rows.get(m.id)?.step)
  let latest: ModuleProgressRow | null = null
  for (const row of rows.values()) {
    if (!latest || row.updated_at > latest.updated_at) latest = row
  }
  const start = Math.max(0, LEARNING_PATH.findIndex((m) => m.id === latest?.module_id))
  const ordered = [...LEARNING_PATH.slice(start), ...LEARNING_PATH.slice(0, start)]
  const candidates = ordered.filter((m) => !done(m) && isUnlocked(m, progress, rows))
  return candidates.find(isOpen) ?? candidates[0] ?? null
}

/**
 * The step to resume a module on: its stored step, or Concept if never opened.
 * A locked quiz sends the student back to the step before it, and a module
 * stored as 'done' before it had a quiz (m0 used to close after Observe)
 * starts over.
 */
export function resumeStep(module: LearningModule, row: ModuleProgressRow | undefined, progress: PathProgress): StepId {
  const step = !row || row.step === 'done' ? 'concept' : row.step
  const steps = activeSteps(module)
  if (!steps.includes(step)) return 'concept'
  return step === 'quiz' && quizBlockers(module, progress) > 0 ? steps[Math.max(0, steps.indexOf('quiz') - 1)] : step
}

/**
 * The module whose tools apply to an open Learn page: the student's current
 * module if the page is one of its concepts (a page can belong to several,
 * e.g. signed numbers in m0 and m9), otherwise the first module that has it.
 */
export function moduleForPage(ref: ConceptRef, current: LearningModule | null): LearningModule | null {
  const has = (m: LearningModule) => m.concepts.some((c) => c.section === ref.section && c.id === ref.id)
  return current && has(current) ? current : LEARNING_PATH.find(has) ?? null
}
