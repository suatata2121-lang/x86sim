import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { assemble } from './core/assembler'
import { Cpu, type CpuSnapshot } from './core/cpu'
import type { AssembleError, Flags, PendingInput, Reg16 } from './core/types'
import { RegisterView } from './components/RegisterView'
import { MemoryView } from './components/MemoryView'
import { CodeEditor } from './components/CodeEditor'
import { DevicesView } from './components/Devices'
import { DataBusView } from './components/DataBusView'
import { StackView } from './components/StackView'
import { ProfilerView } from './components/ProfilerView'
import { GraderView } from './components/GraderView'
import { FeedbackDialog } from './components/FeedbackDialog'
import { AccountDialog } from './components/AccountDialog'
import { HintLadder } from './components/HintLadder'
import { useHintLadder } from './backend/hints'
import { useChallenges } from './backend/challenges'
import { ChallengePanel } from './components/ChallengePanel'
import { ReviewCard } from './components/ReviewCard'
import { reviewDue, useModuleDoneDates } from './backend/reviews'
import { effectiveDates, useInstructorFeedback, useSchedule } from './backend/schedule'
import { AdminView } from './components/AdminView'
import { LearnSidebar, LearnDetail, useLearnNav } from './components/LearnView'
import { LearningPathCard, conceptTitle } from './components/LearningPathCard'
import { QuizDialog } from './components/QuizDialog'
import { ObserveView } from './components/ObserveView'
import { EXAMPLES } from './examples'
import { CURRICULUM, type Assignment } from './curriculum'
import { HARDWARE_REFERENCE } from './hardwareReference'
import { NUMBERING_REFERENCE } from './numberingSystems'
import {
  LEARNING_PATH, STEPS, currentModule, interactiveParts, isModuleDone, moduleForPage, nextStep, predictQuestions,
  quizBlockers, unreadConcepts, type AsidePanel, type ConceptRef, type PathProgress,
} from './learningPath'
import { PredictDialog } from './components/PredictDialog'
import { PlacementDialog, Tour } from './components/Onboarding'
import { PLACEMENT_PASS } from './placement'
import { findQuiz } from './quizzes'
import { gradeSource, type GradeReport } from './core/grader'
import { backendEnabled } from './backend/client'
import { useAuth } from './backend/auth'
import { fetchCompletedAssignments, recordAttempt, trackActivity, useStudySession } from './backend/tracking'
import { useModuleProgress } from './backend/moduleProgress'
import './App.css'

const DEFAULT_EXAMPLE_ID = 'array-sum'
const ANIMATE_INTERVAL_MS = 150
const MAX_STEP_HISTORY = 200
const THEME_STORAGE_KEY = 'x86sim-theme'
const COMPLETED_ASSIGNMENTS_KEY = 'x86sim-completed-assignments'
const PATH_CARD_HIDDEN_KEY = 'x86sim-path-card-hidden'
const ALL_ASSIGNMENTS: Assignment[] = CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments))
const BLANK_SOURCE = '; Write your code here.\n; Need inspiration? Check the Examples or Learn tabs on the left.\n\n'

type SourceMode = 'new' | 'examples' | 'learn'

type AsideTab = AsidePanel
const ASIDE_TABS: { id: AsideTab; label: string }[] = [
  { id: 'registers', label: 'Registers' },
  { id: 'stack', label: 'Stack' },
  { id: 'devices', label: 'Devices' },
  { id: 'databus', label: 'Data Bus' },
  { id: 'memory', label: 'Memory' },
  { id: 'profiler', label: 'Profiler' },
]

interface Tab {
  id: string
  title: string
  source: string
  breakpoints: Set<number>
}

let nextTabId = 1
function newTabId() {
  return `tab-${nextTabId++}`
}

function makeTab(title: string, source: string): Tab {
  return { id: newTabId(), title, source, breakpoints: new Set() }
}

function loadCompletedAssignments(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COMPLETED_ASSIGNMENTS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab('Untitled', BLANK_SOURCE)])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)
  const [mode, setMode] = useState<SourceMode>('new')
  const [asideTab, setAsideTab] = useState<AsideTab>('registers')
  const [selectedExampleId, setSelectedExampleId] = useState(DEFAULT_EXAMPLE_ID)
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null)
  const [completedAssignments, setCompletedAssignments] = useState<Set<string>>(loadCompletedAssignments)
  const learnNav = useLearnNav()
  const [gradeReport, setGradeReport] = useState<GradeReport | null>(null)
  const [errors, setErrors] = useState<AssembleError[]>([])
  const cpuRef = useRef(new Cpu())
  const [regs, setRegs] = useState<Record<Reg16, number>>(cpuRef.current.regs)
  const [flags, setFlags] = useState<Flags>(cpuRef.current.flags)
  const [output, setOutput] = useState('')
  const [halted, setHalted] = useState(false)
  const [assembled, setAssembled] = useState(false)
  const [currentLine, setCurrentLine] = useState<number | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [hitBreakpoint, setHitBreakpoint] = useState(false)
  const [waitingForInput, setWaitingForInput] = useState<PendingInput | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [cpuGeneration, setCpuGeneration] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (
    window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  ))
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const auth = useAuth()
  const userId = auth.session?.user.id ?? null
  const hintLadder = useHintLadder(userId, activeAssignmentId)
  const challenges = useChallenges(userId)
  const scheduleRows = useSchedule(userId)
  const instructorFeedback = useInstructorFeedback(userId)
  useStudySession(userId)
  const moduleProgress = useModuleProgress(userId)
  const pathProgress: PathProgress = useMemo(
    () => ({
      completed: completedAssignments,
      // A placement score of 6+ (when the student chose to skip ahead) counts as passing Module 0's quiz.
      quizzesPassed: auth.profile?.placement_credit ? new Set(moduleProgress.quizzesPassed).add('m0') : moduleProgress.quizzesPassed,
      reads: moduleProgress.reads,
      interactives: moduleProgress.interactives,
      predicted: moduleProgress.predicted,
    }),
    [
      completedAssignments, moduleProgress.quizzesPassed, moduleProgress.reads, moduleProgress.interactives,
      moduleProgress.predicted, auth.profile?.placement_credit,
    ],
  )
  // Every interactive item done, whichever module recorded it (for the ✓ on Learn pages).
  const interactivesDone = useMemo(
    () => new Set([...moduleProgress.interactives.values()].flatMap((ids) => [...ids])),
    [moduleProgress.interactives],
  )
  // The "What to watch" note of an example opened from a module's Observe step.
  // The Observe step's "What to watch" box above the editor: the module's
  // watch line and guide list, and the button that moves on to its next step.
  const [watchNote, setWatchNote] = useState<{ title: string; text?: string; guide?: string[]; moduleId?: string } | null>(null)
  // The one-screen Observe viewer (#27), opened from a module whose Observe
  // panel is the registers; it replaces the editor, toolbar and side panel.
  const [observe, setObserve] = useState<{ moduleId: string; exampleId: string } | null>(null)
  const [observeCardOpen, setObserveCardOpen] = useState(false)
  const [quizModuleId, setQuizModuleId] = useState<string | null>(null)
  const [predictModuleId, setPredictModuleId] = useState<string | null>(null)
  // Review cards (#15): a finished module's question comes back after 14 and
  // 28 days. The card is frozen once answered so its result stays on screen.
  const doneModuleIds = useMemo(
    () => LEARNING_PATH.filter((m) => isModuleDone(m, pathProgress, moduleProgress.rows.get(m.id)?.step)).map((m) => m.id),
    [pathProgress, moduleProgress.rows],
  )
  const doneDates = useModuleDoneDates(userId, doneModuleIds, moduleProgress.rows)
  const [answeredReview, setAnsweredReview] = useState<{ moduleId: string; questionId: string } | null>(null)
  const reviewModule = LEARNING_PATH.find(
    (m) => doneModuleIds.includes(m.id) && predictQuestions(m).length > 0 &&
      reviewDue(doneDates[m.id], moduleProgress.reviewCounts.get(m.id) ?? 0),
  )
  const reviewCard = (() => {
    if (answeredReview) {
      const m = LEARNING_PATH.find((x) => x.id === answeredReview.moduleId)
      const q = m && predictQuestions(m).find((x) => x.id === answeredReview.questionId)
      return m && q ? { module: m, question: q, answered: true } : null
    }
    if (!reviewModule) return null
    const qs = predictQuestions(reviewModule)
    const wrong = moduleProgress.wrongPredicted.get(reviewModule.id)
    const count = moduleProgress.reviewCounts.get(reviewModule.id) ?? 0
    return { module: reviewModule, question: qs.find((q) => wrong?.has(q.id)) ?? qs[count % qs.length], answered: false }
  })()

  // First sign-in (#14): the tour, then the placement quiz. Only for a
  // student whose profile says it hasn't been done (null, not undefined:
  // undefined means the column doesn't exist yet).
  const [onboarding, setOnboarding] = useState<'tour' | 'placement' | null>(null)
  const onboardingStarted = useRef(false)
  const needsOnboarding = backendEnabled && auth.profile?.role === 'student' && auth.profile.onboarded_at === null
  const [pathCardHidden, setPathCardHidden] = useState(() => window.localStorage.getItem(PATH_CARD_HIDDEN_KEY) === '1')
  const animTimerRef = useRef<number | null>(null)
  const stepHistoryRef = useRef<CpuSnapshot[]>([])
  const [canStepBack, setCanStepBack] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const source = activeTab.source
  const breakpoints = activeTab.breakpoints
  // Step, Run and Animate assemble first when the code is new or edited
  // (#27), so they only wait on a running program, not on the Assemble button.
  const assembledSourceRef = useRef<string | null>(null)
  const needsAssemble = !assembled || assembledSourceRef.current !== source
  const canRun = (needsAssemble || !halted) && !waitingForInput && !isAnimating

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  // Progress made on another device (or before clearing the browser) comes
  // back from the server once the student signs in.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchCompletedAssignments(userId).then((ids) => {
      if (cancelled || ids.length === 0) return
      setCompletedAssignments((prev) => new Set([...prev, ...ids]))
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!auth.isAdmin) setAdminOpen(false)
  }, [auth.isAdmin])

  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) window.clearInterval(animTimerRef.current)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPLETED_ASSIGNMENTS_KEY, JSON.stringify([...completedAssignments]))
    } catch {
      // ignore (e.g. private browsing with storage disabled)
    }
  }, [completedAssignments])

  // Records one undo point before an action (Step, one Animate tick, or a
  // whole Run) mutates the Cpu, so Step Back can later rewind past it. Capped
  // at MAX_STEP_HISTORY entries (each snapshot copies the 64KB memory array,
  // so this is bounded rather than growing for the life of a long session).
  function pushHistory() {
    const history = stepHistoryRef.current
    history.push(cpuRef.current.snapshot())
    if (history.length > MAX_STEP_HISTORY) history.shift()
    setCanStepBack(true)
  }

  function clearHistory() {
    stepHistoryRef.current = []
    setCanStepBack(false)
  }

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  function updateTab(id: string, patch: Partial<Tab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function stopAnimation() {
    if (animTimerRef.current !== null) {
      window.clearInterval(animTimerRef.current)
      animTimerRef.current = null
    }
    setIsAnimating(false)
  }

  function handleAnimate() {
    if (!ensureAssembled()) return
    trackActivity('animate', activeAssignmentId)
    setIsAnimating(true)
    animTimerRef.current = window.setInterval(() => {
      const cpu = cpuRef.current
      pushHistory()
      try {
        cpu.step()
        setRuntimeError(null)
      } catch (e) {
        setRuntimeError(e instanceof Error ? e.message : String(e))
        stopAnimation()
        syncState()
        return
      }
      const line = cpu.instructions[cpu.ip]?.line
      if (cpu.halted || cpu.waitingForInput || (breakpoints.size > 0 && line !== undefined && breakpoints.has(line))) {
        stopAnimation()
      }
      syncState()
    }, ANIMATE_INTERVAL_MS)
  }

  function toggleBreakpoint(line: number) {
    const next = new Set(activeTab.breakpoints)
    if (next.has(line)) next.delete(line)
    else next.add(line)
    updateTab(activeTabId, { breakpoints: next })
  }

  function syncState() {
    const cpu = cpuRef.current
    setRegs({ ...cpu.regs })
    setFlags({ ...cpu.flags })
    setOutput(cpu.output.join(''))
    setHalted(cpu.halted)
    // An unedited example run to its exit counts for a module's Observe item.
    if (cpu.halted && cpu.steps > 0) {
      const example = EXAMPLES.find((e) => e.source === activeTab.source)
      if (example) markInteractiveDone(`example-${example.id}`)
    }
    setHitBreakpoint(cpu.hitBreakpoint)
    setWaitingForInput(cpu.waitingForInput)
    const instr = cpu.instructions[cpu.ip]
    setCurrentLine(instr ? instr.line : null)
  }

  // Starts a fresh execution session for whatever tab is now active: a new
  // Cpu (so no stale registers/memory/ports leak across tabs), cleared
  // errors/output, and a bumped cpuGeneration so the devices panel (which
  // keeps its own per-run state, like the stepper motor's angle) remounts.
  function resetExecutionState() {
    cpuRef.current = new Cpu()
    setErrors([])
    setAssembled(false)
    setRuntimeError(null)
    setInputValue('')
    setGradeReport(null)
    clearHistory()
    setCpuGeneration((g) => g + 1)
    syncState()
  }

  /** Returns whether the program assembled. */
  function handleAssemble(): boolean {
    stopAnimation()
    const { instructions, data, errors } = assemble(source)
    trackActivity('assemble', activeAssignmentId, { errors: errors.length })
    setErrors(errors)
    if (errors.length > 0) {
      setAssembled(false)
      assembledSourceRef.current = null
      return false
    }
    cpuRef.current.load(instructions, data)
    assembledSourceRef.current = source
    setAssembled(true)
    setRuntimeError(null)
    clearHistory()
    setCpuGeneration((g) => g + 1)
    syncState()
    return true
  }

  function ensureAssembled(): boolean {
    return !needsAssemble || handleAssemble()
  }

  function handleStep() {
    if (!ensureAssembled()) return
    trackActivity('step', activeAssignmentId)
    pushHistory()
    try {
      cpuRef.current.step()
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

  // Rewinds to the undo point recorded just before the last Step, Animate
  // tick, or Run — see pushHistory().
  function handleStepBack() {
    const prev = stepHistoryRef.current.pop()
    if (!prev) return
    cpuRef.current.restore(prev)
    setRuntimeError(null)
    setCanStepBack(stepHistoryRef.current.length > 0)
    syncState()
  }

  function handleRun() {
    if (!ensureAssembled()) return
    trackActivity('run', activeAssignmentId)
    pushHistory()
    try {
      cpuRef.current.run(100000, breakpoints)
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

  function handleReset() {
    stopAnimation()
    cpuRef.current.reset()
    setRuntimeError(null)
    setInputValue('')
    clearHistory()
    setCpuGeneration((g) => g + 1)
    syncState()
  }

  function handleLoadExample() {
    setObserve(null)
    loadExample(selectedExampleId)
  }

  function loadExample(exampleId: string) {
    stopAnimation()
    const example = EXAMPLES.find((e) => e.id === exampleId)
    if (!example) return
    trackActivity('load_example', null, { example: example.id })
    const tab = makeTab(example.title, example.source)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    resetExecutionState()
  }

  function handleSelectAssignment(assignment: Assignment) {
    trackActivity('open_assignment', assignment.id)
    stopAnimation()
    const tab = makeTab(assignment.title, assignment.starterSource)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setActiveAssignmentId(assignment.id)
    resetExecutionState()
  }

  function setPathCardHiddenPersist(hidden: boolean) {
    setPathCardHidden(hidden)
    try {
      window.localStorage.setItem(PATH_CARD_HIDDEN_KEY, hidden ? '1' : '0')
    } catch {
      // ignore (e.g. private browsing with storage disabled)
    }
  }

  // The learning path's Concept step: the matching page in the Learn tab.
  function openConcept(ref: ConceptRef) {
    setObserve(null)
    setMode('learn')
    learnNav.setSection(ref.section)
    if (ref.section === 'reference') {
      learnNav.setCategoryId(ref.id)
      learnNav.setMnemonic(null)
    } else if (ref.section === 'hardware') {
      learnNav.setHwCategoryId(HARDWARE_REFERENCE.find((c) => c.topics.some((t) => t.id === ref.id))?.id ?? null)
      learnNav.setHwTopicId(ref.id)
    } else {
      learnNav.setNumCategoryId(NUMBERING_REFERENCE.find((c) => c.topics.some((t) => t.id === ref.id))?.id ?? null)
      learnNav.setNumTopicId(ref.id)
    }
  }

  // A quiz module's quiz (issues #20, #25). The card and the last "Mark as
  // read" only offer it once the rest of the checklist is done; this checks
  // again, and quiz_draw checks once more on the server.
  function openQuiz(moduleId: string) {
    const m = LEARNING_PATH.find((x) => x.id === moduleId)
    if (m?.quiz && quizBlockers(m, pathProgress) === 0) setQuizModuleId(moduleId)
  }

  // An interactive item finished (a stepper reached its end, a demo halted,
  // a challenge was solved, an example ran to its exit). Recorded for every
  // module that lists it, for signed-in students only.
  function markInteractiveDone(itemId: string) {
    if (!auth.session) return
    for (const m of LEARNING_PATH) {
      if (m.interactives?.some((i) => interactiveParts(i).includes(itemId))) moduleProgress.markInteractive(m.id, itemId)
    }
  }

  // "Mark as read" at the end of a Learn page that belongs to a quiz module.
  // Only signed-in students see it; it records the read and moves on to the
  // next unread topic, or the quiz after the last one.
  function topicFooter(ref: ConceptRef) {
    if (!auth.session || !moduleProgress.loaded) return null
    const m = LEARNING_PATH.find((x) => x.quiz && x.concepts.some((c) => c.section === ref.section && c.id === ref.id))
    if (!m) return null
    const unread = unreadConcepts(m, pathProgress)
    const isRead = !unread.some((c) => c.id === ref.id)
    const nextUnread = unread.find((c) => c.id !== ref.id)
    const done = isModuleDone(m, pathProgress, moduleProgress.rows.get(m.id)?.step)
    // Whether reading this page is the last thing the quiz is waiting for
    // (modules with interactives or tasks may still have other items open).
    const quizReady = !done && quizBlockers(m, pathProgress) - (isRead ? 0 : 1) === 0

    function goOn() {
      if (nextUnread) {
        openConcept(nextUnread)
        requestAnimationFrame(() => document.querySelector('.learn-detail-panel')?.scrollIntoView({ block: 'start' }))
      } else if (quizReady) {
        moduleProgress.setStep(m!.id, 'quiz')
        setQuizModuleId(m!.id)
      }
    }

    return (
      <div className="read-footer">
        {isRead ? (
          <>
            <span className="read-done">✓ Marked as read</span>
            {nextUnread
              ? <button className="link-button" onClick={goOn}>Next unread topic: {conceptTitle(nextUnread)} →</button>
              : quizReady && <button className="link-button" onClick={goOn}>Take the quiz →</button>}
          </>
        ) : (
          <button
            className="primary"
            onClick={() => {
              moduleProgress.markRead(m.id, ref.id)
              goOn()
            }}
          >
            {nextUnread ? 'Mark as read → next topic' : quizReady ? 'Mark as read → take the quiz' : 'Mark as read'}
          </button>
        )}
      </div>
    )
  }

  // Observe: the example in its own tab with the panel that shows the effect.
  // Pressing Continue again returns to that tab instead of stacking copies,
  // as long as the student hasn't edited it.
  // A module's Observe step: the one-screen viewer when the module watches
  // registers, otherwise the example in the editor with its note.
  function openObserveStep(exampleId: string, panel: AsidePanel, watch: string | undefined, moduleId: string) {
    if (panel !== 'registers') {
      openExample(exampleId, panel, watch, moduleId)
      return
    }
    setMode('examples')
    setSelectedExampleId(exampleId)
    setWatchNote(null)
    setObserveCardOpen(false)
    setObserve({ moduleId, exampleId })
  }

  function openExample(exampleId: string, panel: AsidePanel, watch?: string, moduleId?: string) {
    setObserve(null)
    setMode('examples')
    setSelectedExampleId(exampleId)
    setAsideTab(panel)
    const example = EXAMPLES.find((e) => e.id === exampleId)
    const guide = LEARNING_PATH.find((m) => m.id === moduleId)?.observe?.guide
    setWatchNote(example && (watch || guide) ? { title: example.title, text: watch, guide, moduleId } : null)
    const existing = example && tabs.find((t) => t.title === example.title && t.source === example.source)
    if (existing) handleSwitchTab(existing.id)
    else loadExample(exampleId)
  }

  // A Predict question's snippet in its own tab, with HLT so Run stops at the end.
  function openSnippet(code: string) {
    setObserve(null)
    stopAnimation()
    const tab = makeTab('Predict: try it', `${code}\nHLT\n`)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setActiveAssignmentId(null)
    resetExecutionState()
  }

  // "Done watching": leaves Observe for the module's next step.
  function finishObserve(moduleId: string) {
    const m = LEARNING_PATH.find((x) => x.id === moduleId)
    if (!m) return
    setObserve(null)
    setWatchNote(null)
    const next = nextStep(m, 'observe')
    moduleProgress.setStep(m.id, next)
    if (next === 'predict') setPredictModuleId(m.id)
    else if (next === 'task') openAssignment(m.assignments.find((a) => !completedAssignments.has(a)) ?? m.assignments[0])
    else if (next === 'quiz') openQuiz(m.id)
  }

  function doneWatchingLabel(moduleId: string) {
    const m = LEARNING_PATH.find((x) => x.id === moduleId)
    const next = m ? nextStep(m, 'observe') : 'done'
    return next === 'done' ? 'Done watching: finish module ✓' : `Done watching → ${STEPS.find((s) => s.id === next)?.label ?? next}`
  }

  // The tour runs on the Hello World example with the Registers panel open.
  useEffect(() => {
    if (!needsOnboarding || onboardingStarted.current) return
    onboardingStarted.current = true
    setMode('examples')
    setSelectedExampleId('hello')
    setAsideTab('registers')
    loadExample('hello')
    setOnboarding('tour')
    // loadExample is a fresh closure every render; start once.
  }, [needsOnboarding])

  function finishPlacement(score: number | null, credit: boolean) {
    setOnboarding(null)
    void auth.completeOnboarding(score, credit)
    if (credit && score !== null && score >= PLACEMENT_PASS) moduleProgress.setStep('m0', 'done')
  }

  // Leaves the Predict step for the next one (or finishes the module).
  function finishPredict(moduleId: string) {
    setPredictModuleId(null)
    const m = LEARNING_PATH.find((x) => x.id === moduleId)
    if (!m) return
    const next = nextStep(m, 'predict')
    moduleProgress.setStep(m.id, next)
    if (next === 'task') {
      openAssignment(m.assignments.find((a) => !completedAssignments.has(a)) ?? m.assignments[0])
    } else if (next === 'quiz') {
      openQuiz(m.id)
    }
  }

  // Task: the assignment, with its stage/task scenario shown in Learn.
  function openAssignment(assignmentId: string) {
    setObserve(null)
    for (const stage of CURRICULUM) {
      for (const task of stage.tasks) {
        const assignment = task.assignments.find((a) => a.id === assignmentId)
        if (!assignment) continue
        setMode('learn')
        learnNav.setSection('curriculum')
        learnNav.setStageId(stage.id)
        learnNav.setTaskId(task.id)
        handleSelectAssignment(assignment)
        return
      }
    }
  }

  // Grades the editor's current source against the active assignment's test
  // cases. Runs in its own throwaway Cpu instances (see grader.ts) so it
  // never touches cpuRef — the manual Step/Run/Animate session is untouched.
  function handleRunTests() {
    const assignment = ALL_ASSIGNMENTS.find((a) => a.id === activeAssignmentId)
    if (!assignment) return
    const report = gradeSource(source, assignment.testCases, assignment.sourceRules)
    setGradeReport(report)
    if (!report.assembled || report.passedCount < report.totalCount) hintLadder.recordFailedRun()
    else if (assignment.challengeCycles && hintLadder.fails <= 1) challenges.markEligible(assignment.id)
    recordAttempt({
      assignmentId: assignment.id,
      passedCount: report.passedCount,
      totalCount: report.totalCount,
      assembled: report.assembled,
      source,
    })
    if (report.assembled && report.totalCount > 0 && report.passedCount === report.totalCount) {
      setCompletedAssignments((prev) => (prev.has(assignment.id) ? prev : new Set(prev).add(assignment.id)))
    }
  }

  function handleNewTab() {
    setObserve(null)
    stopAnimation()
    const tab = makeTab('Untitled', BLANK_SOURCE)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setMode('new')
    resetExecutionState()
  }

  function handleSwitchTab(id: string) {
    setObserve(null)
    if (id === activeTabId) return
    stopAnimation()
    setActiveTabId(id)
    resetExecutionState()
  }

  function handleCloseTab(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (tabs.length === 1) return
    const idx = tabs.findIndex((t) => t.id === id)
    const remaining = tabs.filter((t) => t.id !== id)
    setTabs(remaining)
    if (id === activeTabId) {
      stopAnimation()
      setActiveTabId(remaining[Math.max(0, idx - 1)].id)
      resetExecutionState()
    }
  }

  function handleSubmitInput() {
    pushHistory()
    try {
      cpuRef.current.provideInput(inputValue)
      setInputValue('')
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

  // The Hardware section's demos are fully self-contained (their own isolated
  // Cpu, their own read-only source view, their own controls) -- none of the
  // main editor/toolbar/output/aside inspects or affects them, so hide that
  // whole code-writing UI while it's open and let the Hardware content use
  // the freed-up space instead.
  const hardwareMode = mode === 'learn' && learnNav.section === 'hardware'

  // A learning-path module can also leave out tools its pages don't need
  // (Module 0 is reading only). The Numbering Systems overview counts as its
  // first topic's page.
  const pageRef: ConceptRef | null =
    mode !== 'learn' ? null
      : learnNav.section === 'numbering'
        ? { section: 'numbering', id: learnNav.numTopicId ?? NUMBERING_REFERENCE[0].topics[0].id }
        : learnNav.section === 'hardware' && learnNav.hwTopicId ? { section: 'hardware', id: learnNav.hwTopicId }
          : learnNav.section === 'reference' && learnNav.categoryId ? { section: 'reference', id: learnNav.categoryId }
            : null
  const studentModule = auth.session && moduleProgress.loaded ? currentModule(moduleProgress.rows, pathProgress) : null
  const pageTools = pageRef ? moduleForPage(pageRef, studentModule)?.tools : undefined
  const showEditor = !observe && !hardwareMode && (!pageTools || pageTools.includes('editor'))
  const showRun = !observe && !hardwareMode && (!pageTools || pageTools.includes('run'))
  const asideTabs = observe || hardwareMode ? [] : ASIDE_TABS.filter((t) => !pageTools || pageTools.includes(t.id))
  const observeModule = observe ? LEARNING_PATH.find((m) => m.id === observe.moduleId) ?? null : null
  const observeExample = observe ? EXAMPLES.find((e) => e.id === observe.exampleId) ?? null : null
  const shownAsideTab = asideTabs.some((t) => t.id === asideTab) ? asideTab : asideTabs[0]?.id

  return (
    <div className="app">
      <header>
        <div>
          <h1>x86sim</h1>
          <p>A browser-based 8086 assembly simulator inspired by emu8086.</p>
        </div>
        <div className="header-actions">
          {backendEnabled && auth.ready && (auth.session ? (
            <>
              {pathCardHidden && !adminOpen && (
                <button className="theme-toggle" onClick={() => setPathCardHiddenPersist(false)}>🧭 Learning path</button>
              )}
              {auth.isAdmin && (
                <button className="theme-toggle" onClick={() => setAdminOpen((o) => !o)}>
                  {adminOpen ? '💻 Simulator' : '📊 Admin panel'}
                </button>
              )}
              <span className="account-name" title={auth.session.user.email}>
                👤 {auth.profile?.full_name || auth.session.user.email}
              </span>
              <button className="theme-toggle" onClick={() => auth.signOut()}>Sign out</button>
            </>
          ) : (
            <button className="theme-toggle" onClick={() => setAccountOpen(true)}>👤 Sign in</button>
          ))}
          <button className="theme-toggle" onClick={() => setFeedbackOpen(true)} title="Report a bug or suggest an improvement">
            💬 Feedback
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>
      {quizModuleId && (() => {
        const quiz = findQuiz(quizModuleId)
        const module = LEARNING_PATH.find((m) => m.id === quizModuleId)
        const nextModule = module && LEARNING_PATH[LEARNING_PATH.indexOf(module) + 1]
        if (!quiz || !module) return null
        return (
          <QuizDialog
            quiz={quiz}
            topicTitle={(topic) => conceptTitle(module.concepts.find((c) => c.id === topic) ?? { section: 'numbering', id: topic })}
            draw={() => moduleProgress.drawQuiz(module.id)}
            submit={async (answers) => {
              const r = await moduleProgress.submitQuiz(module.id, answers)
              if (r.passed) moduleProgress.setStep(module.id, 'done')
              return r
            }}
            onReview={(topic) => {
              setQuizModuleId(null)
              const ref = module.concepts.find((c) => c.id === topic)
              if (ref) openConcept(ref)
            }}
            onClose={() => setQuizModuleId(null)}
            storageKey={userId ? `quiz-attempt:${module.id}:${userId}` : undefined}
            next={nextModule && { label: `Next module: ${nextModule.title} →`, onClick: () => setQuizModuleId(null) }}
          />
        )
      })()}
      {onboarding === 'tour' && <Tour onDone={() => setOnboarding('placement')} />}
      {onboarding === 'placement' && <PlacementDialog onFinish={finishPlacement} />}
      {predictModuleId && (() => {
        const module = LEARNING_PATH.find((m) => m.id === predictModuleId)
        if (!module) return null
        const next = nextStep(module, 'predict')
        return (
          <PredictDialog
            title={module.title}
            questions={predictQuestions(module)}
            answered={moduleProgress.predicted.get(module.id) ?? new Set()}
            onAnswer={(qid, answer, correct) => moduleProgress.recordPrediction(module.id, qid, answer, correct)}
            onTryInEditor={(code) => {
              setPredictModuleId(null)
              openSnippet(code)
            }}
            onClose={() => setPredictModuleId(null)}
            next={{
              label: next === 'done' ? 'Finish module ✓' : `Continue: ${STEPS.find((s) => s.id === next)?.label ?? next} ▶`,
              onClick: () => finishPredict(module.id),
            }}
          />
        )
      })()}
      {feedbackOpen && (
        <FeedbackDialog
          onClose={() => setFeedbackOpen(false)}
          currentSource={source}
          context={{ tab: activeTab.title, assignment: activeAssignmentId, section: mode === 'learn' ? `learn/${learnNav.section}` : mode }}
        />
      )}
      {(accountOpen || auth.passwordRecovery || auth.linkExpired) && (
        <AccountDialog
          initialView={auth.passwordRecovery ? 'newpassword' : auth.linkExpired ? 'reset' : 'signin'}
          initialError={
            auth.linkExpired && !auth.passwordRecovery
              ? 'This reset link has expired or was already used. Enter your email to get a new one, or use the 6-digit code from the email.'
              : undefined
          }
          onClose={() => {
            setAccountOpen(false)
            auth.dismissPasswordRecovery()
          }}
        />
      )}
      {backendEnabled && auth.ready && !auth.session && (
        <p className="account-banner no-print">
          Taking the lab course?{' '}
          <button className="link-button" onClick={() => setAccountOpen(true)}>Sign in or create an account</button>{' '}
          so your work and progress are saved.
        </p>
      )}
      {adminOpen && auth.isAdmin ? <AdminView onClose={() => setAdminOpen(false)} /> : (
      <main>
        <section className="editor-panel">
          {backendEnabled && auth.session && moduleProgress.loaded && !pathCardHidden && (
            <LearningPathCard
              rows={moduleProgress.rows}
              progress={pathProgress}
              onSetStep={moduleProgress.setStep}
              onOpenConcept={openConcept}
              onOpenExample={openObserveStep}
              onOpenAssignment={openAssignment}
              onOpenQuiz={openQuiz}
              onOpenPredict={setPredictModuleId}
              dates={(moduleId) => effectiveDates(scheduleRows, moduleId, userId, auth.profile?.class_group || null)}
              feedback={{ comments: instructorFeedback.unread, onDismiss: instructorFeedback.dismiss }}
              challengeCount={challenges.done.size}
              onStepOpened={(moduleId, step) => trackActivity('path_step', null, { module: moduleId, step })}
              onHide={() => setPathCardHiddenPersist(true)}
              collapsed={observeModule && observeExample && !observeCardOpen
                ? `Module ${LEARNING_PATH.indexOf(observeModule)} · Observe · ${observeExample.title}`
                : undefined}
              onExpand={() => setObserveCardOpen(true)}
              onCollapse={observe ? () => setObserveCardOpen(false) : undefined}
            />
          )}
          {backendEnabled && auth.session && moduleProgress.loaded && !observe && reviewCard && (
            <ReviewCard
              key={`${reviewCard.module.id}-${reviewCard.question.id}`}
              title={reviewCard.module.title}
              question={reviewCard.question}
              answered={reviewCard.answered}
              onAnswer={(answer, correct) => {
                setAnsweredReview({ moduleId: reviewCard.module.id, questionId: reviewCard.question.id })
                moduleProgress.recordPrediction(reviewCard.module.id, reviewCard.question.id, answer, correct, 'review')
              }}
              onDone={() => setAnsweredReview(null)}
            />
          )}
          {showEditor && (
            <div className="tabs-bar">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={tab.id === activeTabId ? 'tab active' : 'tab'}
                  onClick={() => handleSwitchTab(tab.id)}
                >
                  <span className="tab-title">{tab.title}</span>
                  {tabs.length > 1 && (
                    <button
                      className="tab-close"
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      title="Close tab"
                      aria-label={`Close ${tab.title}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button className="tab-new" onClick={handleNewTab} title="New tab">+</button>
            </div>
          )}
          <div className="editor-row">
            <div className="mode-sidebar">
              <div className="mode-tabs mode-tabs-vertical">
                <button className={mode === 'new' ? 'mode-tab active' : 'mode-tab'} onClick={() => { setObserve(null); setMode('new') }}>New</button>
                <button className={mode === 'examples' ? 'mode-tab active' : 'mode-tab'} onClick={() => { setObserve(null); setMode('examples') }}>Examples</button>
                <button className={mode === 'learn' ? 'mode-tab active' : 'mode-tab'} onClick={() => { setObserve(null); setMode('learn') }}>Learn</button>
              </div>
              {mode === 'new' && (
                <div className="mode-panel">
                  <p className="example-description">Start from a blank file, or pick one from Examples or Learn.</p>
                  <button onClick={handleNewTab} disabled={isAnimating}>New blank tab</button>
                </div>
              )}
              {mode === 'examples' && (
                <div className="mode-panel">
                  <div className="examples-bar">
                    <select
                      value={selectedExampleId}
                      onChange={(e) => setSelectedExampleId(e.target.value)}
                    >
                      {EXAMPLES.map((ex) => (
                        <option key={ex.id} value={ex.id}>{ex.title}</option>
                      ))}
                    </select>
                    <button onClick={handleLoadExample} disabled={isAnimating}>Load in new tab</button>
                  </div>
                  <p className="example-description">
                    {EXAMPLES.find((e) => e.id === selectedExampleId)?.description}
                  </p>
                </div>
              )}
              {mode === 'learn' && (
                <LearnSidebar
                  nav={learnNav}
                  activeAssignmentId={activeAssignmentId}
                  completedIds={completedAssignments}
                  onSelectAssignment={handleSelectAssignment}
                />
              )}
            </div>
            <div className="editor-col">
              {observeModule && observeExample && (
                <ObserveView
                  key={observeExample.id}
                  title={observeExample.title}
                  source={observeExample.source}
                  summary={observeModule.observe?.watch}
                  guide={observeModule.observe?.guide}
                  next={auth.session ? { label: doneWatchingLabel(observeModule.id), onClick: () => finishObserve(observeModule.id) } : undefined}
                  registers={observeModule.observe?.registers}
                  callouts={observeModule.observe?.callouts?.[observeExample.id]}
                  onDone={() => markInteractiveDone(`example-${observeExample.id}`)}
                  onOpenInEditor={() => openExample(observeExample.id, 'registers')}
                />
              )}
              {mode === 'learn' && (
                <LearnDetail
                  nav={learnNav}
                  activeAssignmentId={activeAssignmentId}
                  completedIds={completedAssignments}
                  topicFooter={backendEnabled ? topicFooter : undefined}
                  interactivesDone={interactivesDone}
                  onInteractiveDone={markInteractiveDone}
                />
              )}
              {watchNote && mode === 'examples' && activeTab.title === watchNote.title && (
                <div className="panel watch-note">
                  <div className="path-header">
                    <h3>What to watch</h3>
                    <button className="modal-close" onClick={() => setWatchNote(null)} aria-label="Hide">×</button>
                  </div>
                  {watchNote.text && <p className="example-description">{watchNote.text}</p>}
                  {watchNote.guide && <ul className="watch-guide">{watchNote.guide.map((g) => <li key={g}>{g}</li>)}</ul>}
                  {watchNote.moduleId && auth.session && (
                    <button className="primary" onClick={() => finishObserve(watchNote.moduleId as string)}>
                      {doneWatchingLabel(watchNote.moduleId)}
                    </button>
                  )}
                </div>
              )}
              {showEditor && (
                <CodeEditor
                  key={activeTabId}
                  value={source}
                  onChange={(v) => updateTab(activeTabId, { source: v })}
                  breakpoints={breakpoints}
                  onToggleBreakpoint={toggleBreakpoint}
                  currentLine={currentLine}
                  errorLines={new Set(errors.map((e) => e.line))}
                  theme={theme}
                />
              )}
            </div>
          </div>
          {showRun && (
            <>
              <div className="toolbar">
                <button onClick={() => handleAssemble()} disabled={isAnimating}>Assemble</button>
                <button onClick={handleRunTests} disabled={isAnimating || !activeAssignmentId}>Run Tests</button>
                <button onClick={handleStepBack} disabled={!canStepBack || isAnimating} title="Undo the last Step/Animate tick/Run">⏪ Step Back</button>
                <button onClick={handleStep} disabled={!canRun}>Step ▶</button>
                <button onClick={handleRun} disabled={!canRun}>Run</button>
                {isAnimating
                  ? <button onClick={stopAnimation}>⏹ Stop</button>
                  : <button onClick={handleAnimate} disabled={!canRun}>▶ Animate</button>}
                <button onClick={handleReset} disabled={!assembled || isAnimating}>Reset</button>
                {breakpoints.size > 0 && (
                  <button onClick={() => updateTab(activeTabId, { breakpoints: new Set() })} disabled={isAnimating}>
                    Clear breakpoints
                  </button>
                )}
              </div>
              {activeAssignmentId && (
                <p className="status">
                  Testing against: {ALL_ASSIGNMENTS.find((a) => a.id === activeAssignmentId)?.title}
                  {completedAssignments.has(activeAssignmentId) ? ' ✓ completed' : ''}
                </p>
              )}
              {errors.length > 0 && (
                <ul className="errors">
                  {errors.map((e, i) => {
                    const lineText = source.split('\n')[e.line - 1] ?? ''
                    return (
                      <li key={i}>
                        <div>
                          Line {e.line}{e.column ? `, Column ${e.column}` : ''}: {e.message}
                        </div>
                        {e.column && (
                          <pre className="error-preview">
                            {lineText + '\n' + ' '.repeat(e.column - 1) + '^'.repeat(Math.max(1, e.length ?? 1))}
                          </pre>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {assembled && (
                <p className="status">
                  {halted
                    ? 'Program halted.'
                    : hitBreakpoint
                      ? `⏸ Paused at breakpoint: line ${currentLine ?? '-'}`
                      : `Next line: ${currentLine ?? '-'}`}
                </p>
              )}
              {runtimeError && <p className="status error">Runtime error: {runtimeError}</p>}
              {waitingForInput && (
                <div className="panel input-request">
                  <h3>Waiting for keyboard input</h3>
                  <p className="status">
                    {waitingForInput.kind === 'char'
                      ? 'The program is reading a character (INT 21h, AH=01h).'
                      : `The program is reading a line of up to ${waitingForInput.maxLen} characters (INT 21h, AH=0Ah).`}
                  </p>
                  <div className="input-request-row">
                    <input
                      autoFocus
                      className="input-request-field"
                      value={inputValue}
                      maxLength={waitingForInput.kind === 'string' ? waitingForInput.maxLen : 1}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitInput() }}
                    />
                    <button onClick={handleSubmitInput}>Send</button>
                  </div>
                </div>
              )}
              <div className="panel">
                <h3>Output</h3>
                {output ? (
                  <pre className="output">{output}</pre>
                ) : assembled && halted ? (
                  // Most tasks print nothing: say the run finished and where the result is,
                  // so an empty panel doesn't read as "my program didn't run" (#41).
                  <p className="output output-empty">
                    The program finished without printing anything. Its results are in the registers and memory.
                    Check the Registers panel, or press Run Tests to grade your work.
                  </p>
                ) : (
                  <pre className="output">(no output yet)</pre>
                )}
              </div>
              {gradeReport && <GraderView report={gradeReport} />}
              {(() => {
                // The challenge appears once the assignment is passed within two runs (or was completed before).
                const a = ALL_ASSIGNMENTS.find((x) => x.id === activeAssignmentId)
                if (!a?.challengeCycles || !gradeReport) return null
                const passed = gradeReport.assembled && gradeReport.totalCount > 0 && gradeReport.passedCount === gradeReport.totalCount
                const before = challenges.done.has(a.id)
                if (!before && !challenges.eligible.has(a.id) && !(passed && hintLadder.fails <= 1)) return null
                return (
                  <ChallengePanel
                    limit={a.challengeCycles}
                    cycles={gradeReport.results.reduce((n, r) => n + r.cycles, 0)}
                    passed={passed}
                    completedBefore={before}
                    onComplete={() => challenges.complete(a.id, gradeReport.results.reduce((n, r) => n + r.cycles, 0), a.challengeCycles as number)}
                  />
                )
              })()}
              {activeAssignmentId && hintLadder.available && (
                <HintLadder
                  hints={ALL_ASSIGNMENTS.find((a) => a.id === activeAssignmentId)?.hints ?? ['', '', '']}
                  level={hintLadder.level}
                  onReveal={hintLadder.revealNext}
                />
              )}
            </>
          )}
        </section>
        {asideTabs.length > 0 && (
        <aside className={shownAsideTab === 'registers' ? 'aside-compact' : undefined}>
          <div className="mode-tabs aside-tabs">
            {asideTabs.map((t) => (
              <button
                key={t.id}
                className={shownAsideTab === t.id ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setAsideTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {shownAsideTab === 'registers' && <RegisterView regs={regs} flags={flags} stepKey={cpuRef.current.steps} />}
          {shownAsideTab === 'databus' && (
            <DataBusView
              key={`bus-${cpuGeneration}`}
              lastInstruction={cpuRef.current.lastInstruction}
              steps={cpuRef.current.steps}
            />
          )}
          {shownAsideTab === 'stack' && (
            <StackView
              key={`stack-${cpuGeneration}`}
              memory={cpuRef.current.memory}
              data={cpuRef.current.data}
              sp={regs.SP}
              bp={regs.BP}
              lastInstructionMnemonic={cpuRef.current.lastInstruction?.mnemonic ?? null}
              steps={cpuRef.current.steps}
            />
          )}
          {shownAsideTab === 'devices' && <DevicesView key={`devices-${cpuGeneration}`} ports={cpuRef.current.ports} ppi={cpuRef.current.ppi} />}
          {shownAsideTab === 'memory' && (
            <MemoryView memory={cpuRef.current.memory} dataLabels={cpuRef.current.dataLabels} sp={regs.SP} />
          )}
          {shownAsideTab === 'profiler' && (
            <ProfilerView
              cycles={cpuRef.current.cycles}
              profile={cpuRef.current.profile}
              steps={cpuRef.current.steps}
              peakStackBytes={cpuRef.current.peakStackBytes}
              memoryWrites={cpuRef.current.memoryWrites}
              data={cpuRef.current.data}
              instructionCount={cpuRef.current.instructions.length}
            />
          )}
        </aside>
        )}
      </main>
      )}
      <footer className="app-footer">
        <p>
          Developed by Dr. Murat Adnan TAMER as part of the Microprocessors course at Haliç
          University, Faculty of Engineering. Open source, released under the MIT License.
        </p>
      </footer>
    </div>
  )
}
