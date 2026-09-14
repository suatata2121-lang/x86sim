import { useMemo, useRef, useState } from 'react'
import { assemble } from './core/assembler'
import { Cpu } from './core/cpu'
import type { AssembleError, Flags, Reg16 } from './core/types'
import { RegisterView } from './components/RegisterView'
import './App.css'

const SAMPLE = `; AX'e 5, BX'e 3 yaz, topla ve sonucu 3 kez '*' basarak göster
MOV AX, 5
MOV BX, 3
ADD AX, BX
MOV CX, 3
START:
MOV DL, 2Ah
MOV AH, 2
INT 21h
LOOP START
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
    const { instructions, errors } = assemble(source)
    setErrors(errors)
    if (errors.length > 0) {
      setAssembled(false)
      return
    }
    cpuRef.current.load(instructions)
    setAssembled(true)
    syncState()
  }

  function handleStep() {
    cpuRef.current.step()
    syncState()
  }

  function handleRun() {
    cpuRef.current.run()
    syncState()
  }

  function handleReset() {
    cpuRef.current.reset()
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
          <div className="panel">
            <h3>Çıktı</h3>
            <pre className="output">{output || '(henüz çıktı yok)'}</pre>
          </div>
        </section>
        <aside>
          <RegisterView regs={regs} flags={flags} />
        </aside>
      </main>
    </div>
  )
}
