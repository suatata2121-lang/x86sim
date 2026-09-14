import { useRef, useState } from 'react'
import { assemble } from './core/assembler'
import { Cpu } from './core/cpu'
import type { AssembleError, Flags, PendingInput, Reg16 } from './core/types'
import { RegisterView } from './components/RegisterView'
import { MemoryView } from './components/MemoryView'
import { CodeEditor } from './components/CodeEditor'
import { EXAMPLES } from './examples'
import './App.css'

const DEFAULT_EXAMPLE_ID = 'array-sum'

export default function App() {
  const [source, setSource] = useState(EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID)!.source)
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
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const [hitBreakpoint, setHitBreakpoint] = useState(false)
  const [waitingForInput, setWaitingForInput] = useState<PendingInput | null>(null)
  const [inputValue, setInputValue] = useState('')

  const canRun = assembled && !halted && !waitingForInput

  function toggleBreakpoint(line: number) {
    setBreakpoints((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
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

  function handleAssemble() {
    const { instructions, data, errors } = assemble(source)
    setErrors(errors)
    if (errors.length > 0) {
      setAssembled(false)
      return
    }
    cpuRef.current.load(instructions, data)
    setAssembled(true)
    setRuntimeError(null)
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
    cpuRef.current.reset()
    setRuntimeError(null)
    setInputValue('')
    syncState()
  }

  function handleLoadExample() {
    const example = EXAMPLES.find((e) => e.id === selectedExampleId)
    if (!example) return
    setSource(example.source)
    setErrors([])
    setAssembled(false)
    setRuntimeError(null)
    setBreakpoints(new Set())
    setInputValue('')
    cpuRef.current = new Cpu()
    syncState()
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
        <h1>x86sim</h1>
        <p>Tarayıcı tabanlı, emu8086'dan ilham alan 8086 assembly simülatörü.</p>
      </header>
      <main>
        <section className="editor-panel">
          <div className="examples-bar">
            <select
              value={selectedExampleId}
              onChange={(e) => setSelectedExampleId(e.target.value)}
            >
              {EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.title}</option>
              ))}
            </select>
            <button onClick={handleLoadExample}>Yükle</button>
          </div>
          <p className="example-description">
            {EXAMPLES.find((e) => e.id === selectedExampleId)?.description}
          </p>
          <CodeEditor
            value={source}
            onChange={setSource}
            breakpoints={breakpoints}
            onToggleBreakpoint={toggleBreakpoint}
            currentLine={currentLine}
            errorLines={new Set(errors.map((e) => e.line))}
          />
          <div className="toolbar">
            <button onClick={handleAssemble}>Derle</button>
            <button onClick={handleStep} disabled={!canRun}>Adım</button>
            <button onClick={handleRun} disabled={!canRun}>Çalıştır</button>
            <button onClick={handleReset} disabled={!assembled}>Sıfırla</button>
            {breakpoints.size > 0 && (
              <button onClick={() => setBreakpoints(new Set())}>Kesme noktalarını temizle</button>
            )}
          </div>
          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((e, i) => {
                const lineText = source.split('\n')[e.line - 1] ?? ''
                return (
                  <li key={i}>
                    <div>
                      Satır {e.line}{e.column ? `, Sütun ${e.column}` : ''}: {e.message}
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
                ? 'Program durdu.'
                : hitBreakpoint
                  ? `⏸ Kesme noktasında durduruldu: satır ${currentLine ?? '-'}`
                  : `Sıradaki satır: ${currentLine ?? '-'}`}
            </p>
          )}
          {runtimeError && <p className="status error">Çalışma zamanı hatası: {runtimeError}</p>}
          {waitingForInput && (
            <div className="panel input-request">
              <h3>Klavye girişi bekleniyor</h3>
              <p className="status">
                {waitingForInput.kind === 'char'
                  ? 'Program bir karakter okuyor (INT 21h, AH=01h).'
                  : `Program en fazla ${waitingForInput.maxLen} karakterlik bir satır okuyor (INT 21h, AH=0Ah).`}
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
                <button onClick={handleSubmitInput}>Gönder</button>
              </div>
            </div>
          )}
          <div className="panel">
            <h3>Çıktı</h3>
            <pre className="output">{output || '(henüz çıktı yok)'}</pre>
          </div>
        </section>
        <aside>
          <RegisterView regs={regs} flags={flags} />
          <MemoryView memory={cpuRef.current.memory} dataLabels={cpuRef.current.dataLabels} sp={regs.SP} />
        </aside>
      </main>
    </div>
  )
}
