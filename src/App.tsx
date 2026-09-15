import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { assemble } from './core/assembler'
import { Cpu } from './core/cpu'
import type { AssembleError, Flags, PendingInput, Reg16 } from './core/types'
import { RegisterView } from './components/RegisterView'
import { MemoryView } from './components/MemoryView'
import { CodeEditor } from './components/CodeEditor'
import { DevicesView } from './components/Devices'
import { EXAMPLES } from './examples'
import './App.css'

const DEFAULT_EXAMPLE_ID = 'array-sum'
const ANIMATE_INTERVAL_MS = 150
const THEME_STORAGE_KEY = 'x86sim-theme'

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

export default function App() {
  const initialExample = EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID)!
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(initialExample.title, initialExample.source)])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)
  const [selectedExampleId, setSelectedExampleId] = useState(DEFAULT_EXAMPLE_ID)
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
    setCpuGeneration((g) => g + 1)
    syncState()
  }

  function handleStep() {
    try {
      cpuRef.current.step()
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

  function handleRun() {
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

  function handleNewTab() {
    stopAnimation()
    const tab = makeTab('Untitled', '; New program\n')
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
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
    try {
      cpuRef.current.provideInput(inputValue)
      setInputValue('')
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

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
          <div className="toolbar">
            <button onClick={handleAssemble} disabled={isAnimating}>Assemble</button>
            <button onClick={handleStep} disabled={!canRun}>Step</button>
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
        </section>
        <aside>
          <RegisterView regs={regs} flags={flags} />
          <DevicesView key={cpuGeneration} ports={cpuRef.current.ports} />
          <MemoryView memory={cpuRef.current.memory} dataLabels={cpuRef.current.dataLabels} sp={regs.SP} />
        </aside>
      </main>
    </div>
  )
}
