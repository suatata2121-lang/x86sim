import { useEffect, useRef, useState } from 'react'
import { assemble } from '../core/assembler'
import { Cpu } from '../core/cpu'
import type { Flags, Instruction, Reg16 } from '../core/types'
import { RegisterView } from './RegisterView'
import { DataBusView } from './DataBusView'
import { BusArchitectureView } from './BusArchitectureView'
import { StackView } from './StackView'
import { DevicesView } from './Devices'

const PLAY_INTERVAL_MS = 600

export type HardwareVisual = 'registers' | 'databus' | 'busdetail' | 'stack' | 'devices'

// A small, self-contained playground: its own Cpu instance running a canned
// program, independent of whatever the user has open in the main editor tabs.
// Reuses the exact same visualization components the main app uses, just fed
// from this local state instead of App.tsx's.
export function HardwarePlayground({
  source,
  visual,
  autoplay,
}: {
  source: string
  visual: HardwareVisual
  autoplay?: boolean
}) {
  const cpuRef = useRef(new Cpu())
  const [regs, setRegs] = useState<Record<Reg16, number>>(cpuRef.current.regs)
  const [flags, setFlags] = useState<Flags>(cpuRef.current.flags)
  const [steps, setSteps] = useState(0)
  const [lastInstruction, setLastInstruction] = useState<Instruction | null>(null)
  const [lastAddress, setLastAddress] = useState<number | null>(null)
  const [lastMemValue, setLastMemValue] = useState<number | null>(null)
  const [lastPort, setLastPort] = useState<number | null>(null)
  const [lastPortValue, setLastPortValue] = useState<number | null>(null)
  const [halted, setHalted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [generation, setGeneration] = useState(0)
  const timerRef = useRef<number | null>(null)

  function sync() {
    const cpu = cpuRef.current
    setRegs({ ...cpu.regs })
    setFlags({ ...cpu.flags })
    setSteps(cpu.steps)
    setLastInstruction(cpu.lastInstruction)
    setLastAddress(cpu.lastAddress)
    setLastMemValue(cpu.lastMemValue)
    setLastPort(cpu.lastPort)
    setLastPortValue(cpu.lastPortValue)
    setHalted(cpu.halted)
  }

  function stop() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsPlaying(false)
  }

  function load() {
    stop()
    const { instructions, data } = assemble(source)
    const cpu = new Cpu()
    cpu.load(instructions, data)
    cpuRef.current = cpu
    setGeneration((g) => g + 1)
    sync()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load()
    if (autoplay) play()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  function step() {
    if (cpuRef.current.halted) return
    cpuRef.current.step()
    sync()
  }

  function play() {
    if (cpuRef.current.halted || timerRef.current !== null) return
    setIsPlaying(true)
    timerRef.current = window.setInterval(() => {
      const cpu = cpuRef.current
      cpu.step()
      sync()
      if (cpu.halted) stop()
    }, PLAY_INTERVAL_MS)
  }

  function reset() {
    load()
  }

  const currentLine = cpuRef.current.instructions[cpuRef.current.ip]?.line ?? null
  const lines = source.split('\n')

  return (
    <div className="hw-playground">
      <div className="hw-playground-controls">
        <button onClick={step} disabled={halted || isPlaying}>Step</button>
        {isPlaying ? (
          <button onClick={stop}>Pause</button>
        ) : (
          <button onClick={play} disabled={halted}>Play</button>
        )}
        <button onClick={reset}>Reset</button>
        <span className="hw-playground-status">{halted ? 'Halted' : `Step ${steps}`}</span>
      </div>
      <div className="hw-playground-visual">
        {visual === 'registers' && <RegisterView regs={regs} flags={flags} />}
        {visual === 'databus' && (
          <DataBusView key={`bus-${generation}`} lastInstruction={lastInstruction} steps={steps} />
        )}
        {visual === 'busdetail' && (
          <BusArchitectureView
            key={`busdetail-${generation}`}
            lastInstruction={lastInstruction}
            steps={steps}
            lastAddress={lastAddress}
            lastMemValue={lastMemValue}
            lastPort={lastPort}
            lastPortValue={lastPortValue}
          />
        )}
        {visual === 'stack' && (
          <StackView
            key={`stack-${generation}`}
            memory={cpuRef.current.memory}
            data={cpuRef.current.data}
            sp={regs.SP}
            bp={regs.BP}
            lastInstructionMnemonic={lastInstruction?.mnemonic ?? null}
            steps={steps}
          />
        )}
        {visual === 'devices' && <DevicesView key={`devices-${generation}`} ports={cpuRef.current.ports} />}
      </div>
      <pre className="hw-playground-source">
        {lines.map((line, idx) => (
          <div key={idx} className={currentLine === idx + 1 ? 'hw-playground-line current' : 'hw-playground-line'}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
