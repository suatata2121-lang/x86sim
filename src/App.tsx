import { useEffect, useRef, useState, type MouseEvent } from 'react'
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
import { LearnSidebar, LearnDetail, useLearnNav } from './components/LearnView'
import { EXAMPLES } from './examples'
import { CURRICULUM, type Assignment } from './curriculum'
import { gradeSource, type GradeReport } from './core/grader'
import './App.css'

const DEFAULT_EXAMPLE_ID = 'array-sum'
const ANIMATE_INTERVAL_MS = 150
const MAX_STEP_HISTORY = 200
const THEME_STORAGE_KEY = 'x86sim-theme'
const COMPLETED_ASSIGNMENTS_KEY = 'x86sim-completed-assignments'
const ALL_ASSIGNMENTS: Assignment[] = CURRICULUM.flatMap((s) => s.tasks.flatMap((t) => t.assignments))
const BLANK_SOURCE = '; Write your code here.\n; Need inspiration? Check the Examples or Learn tabs on the left.\n\n'

type SourceMode = 'new' | 'examples' | 'learn'

type AsideTab = 'registers' | 'stack' | 'devices' | 'databus' | 'memory' | 'profiler'
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
  const animTimerRef = useRef<number | null>(null)
  const stepHistoryRef = useRef<CpuSnapshot[]>([])
  const [canStepBack, setCanStepBack] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const source = activeTab.source
  const breakpoints = activeTab.breakpoints
  const canRun = assembled && !halted && !waitingForInput && !isAnimating

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

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

  function handleAssemble() {
    stopAnimation()
    const { instructions, data, errors } = assemble(source)
    setErrors(errors)
    if (errors.length > 0) {
      setAssembled(false)
      return
    }
    cpuRef.current.load(instructions, data)
    setAssembled(true)
    setRuntimeError(null)
    clearHistory()
    setCpuGeneration((g) => g + 1)
    syncState()
  }

  function handleStep() {
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
    stopAnimation()
    const example = EXAMPLES.find((e) => e.id === selectedExampleId)
    if (!example) return
    const tab = makeTab(example.title, example.source)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    resetExecutionState()
  }

  function handleSelectAssignment(assignment: Assignment) {
    stopAnimation()
    const tab = makeTab(assignment.title, assignment.starterSource)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setActiveAssignmentId(assignment.id)
    resetExecutionState()
  }

  // Grades the editor's current source against the active assignment's test
  // cases. Runs in its own throwaway Cpu instances (see grader.ts) so it
  // never touches cpuRef — the manual Step/Run/Animate session is untouched.
  function handleRunTests() {
    const assignment = ALL_ASSIGNMENTS.find((a) => a.id === activeAssignmentId)
    if (!assignment) return
    const report = gradeSource(source, assignment.testCases)
    setGradeReport(report)
    if (report.assembled && report.totalCount > 0 && report.passedCount === report.totalCount) {
      setCompletedAssignments((prev) => (prev.has(assignment.id) ? prev : new Set(prev).add(assignment.id)))
    }
  }

  function handleNewTab() {
    stopAnimation()
    const tab = makeTab('Untitled', BLANK_SOURCE)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setMode('new')
    resetExecutionState()
  }

  function handleSwitchTab(id: string) {
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

  return (
    <div className="app">
      <header>
        <div>
          <h1>x86sim</h1>
          <p>A browser-based 8086 assembly simulator inspired by emu8086.</p>
        </div>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>
      <main>
        <section className="editor-panel">
          {!hardwareMode && (
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
                <button className={mode === 'new' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('new')}>New</button>
                <button className={mode === 'examples' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('examples')}>Examples</button>
                <button className={mode === 'learn' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('learn')}>Learn</button>
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
              {mode === 'learn' && (
                <LearnDetail
                  nav={learnNav}
                  activeAssignmentId={activeAssignmentId}
                  completedIds={completedAssignments}
                />
              )}
              {!hardwareMode && (
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
          {!hardwareMode && (
            <>
              <div className="toolbar">
                <button onClick={handleAssemble} disabled={isAnimating}>Assemble</button>
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
                <pre className="output">{output || '(no output yet)'}</pre>
              </div>
              {gradeReport && <GraderView report={gradeReport} />}
            </>
          )}
        </section>
        {!hardwareMode && (
        <aside>
          <div className="mode-tabs aside-tabs">
            {ASIDE_TABS.map((t) => (
              <button
                key={t.id}
                className={asideTab === t.id ? 'mode-tab active' : 'mode-tab'}
                onClick={() => setAsideTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {asideTab === 'registers' && <RegisterView regs={regs} flags={flags} />}
          {asideTab === 'databus' && (
            <DataBusView
              key={`bus-${cpuGeneration}`}
              lastInstruction={cpuRef.current.lastInstruction}
              steps={cpuRef.current.steps}
            />
          )}
          {asideTab === 'stack' && (
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
          {asideTab === 'devices' && <DevicesView key={`devices-${cpuGeneration}`} ports={cpuRef.current.ports} />}
          {asideTab === 'memory' && (
            <MemoryView memory={cpuRef.current.memory} dataLabels={cpuRef.current.dataLabels} sp={regs.SP} />
          )}
          {asideTab === 'profiler' && (
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
    </div>
  )
}
