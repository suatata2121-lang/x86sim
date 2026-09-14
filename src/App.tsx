import { useMemo, useRef, useState } from 'react'
import { assemble } from './core/assembler'
import { Cpu } from './core/cpu'
import type { AssembleError, Flags, Reg16 } from './core/types'
import { RegisterView } from './components/RegisterView'
import { MemoryView } from './components/MemoryView'
import './App.css'

const SAMPLE = `; Bir dizideki baytları toplar; veri segmenti + bellek adresleme örneği
MSG DB 'Sonuc: $'
NUMS DB 10, 20, 30, 40, 5

MOV AH, 9
MOV DX, MSG
INT 21h

MOV CX, 5
MOV SI, 0
MOV AX, 0
SUMLOOP:
MOV BL, [NUMS+SI]
MOV BH, 0
ADD AX, BX
INC SI
LOOP SUMLOOP

MOV AH, 4Ch
INT 21h
`

export default function App() {
  const [source, setSource] = useState(SAMPLE)
  const [errors, setErrors] = useState<AssembleError[]>([])
  const cpuRef = useRef(new Cpu())
  const [regs, setRegs] = useState<Record<Reg16, number>>(cpuRef.current.regs)
  const [flags, setFlags] = useState<Flags>(cpuRef.current.flags)
  const [output, setOutput] = useState('')
  const [halted, setHalted] = useState(false)
  const [assembled, setAssembled] = useState(false)
  const [currentLine, setCurrentLine] = useState<number | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const canRun = assembled && !halted

  function syncState() {
    const cpu = cpuRef.current
    setRegs({ ...cpu.regs })
    setFlags({ ...cpu.flags })
    setOutput(cpu.output.join(''))
    setHalted(cpu.halted)
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
      cpuRef.current.run()
      setRuntimeError(null)
    } catch (e) {
      setRuntimeError(e instanceof Error ? e.message : String(e))
    }
    syncState()
  }

  function handleReset() {
    cpuRef.current.reset()
    setRuntimeError(null)
    syncState()
  }

  const lineCount = useMemo(() => source.split('\n').length, [source])

  return (
    <div className="app">
      <header>
        <h1>x86sim</h1>
        <p>Tarayıcı tabanlı, emu8086'dan ilham alan 8086 assembly simülatörü.</p>
      </header>
      <main>
        <section className="editor-panel">
          <textarea
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={Math.max(16, lineCount + 1)}
          />
          <div className="toolbar">
            <button onClick={handleAssemble}>Derle</button>
            <button onClick={handleStep} disabled={!canRun}>Adım</button>
            <button onClick={handleRun} disabled={!canRun}>Çalıştır</button>
            <button onClick={handleReset} disabled={!assembled}>Sıfırla</button>
          </div>
          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((e, i) => (
                <li key={i}>Satır {e.line}: {e.message}</li>
              ))}
            </ul>
          )}
          {assembled && (
            <p className="status">
              {halted ? 'Program durdu.' : `Sıradaki satır: ${currentLine ?? '-'}`}
            </p>
          )}
          {runtimeError && <p className="status error">Çalışma zamanı hatası: {runtimeError}</p>}
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
