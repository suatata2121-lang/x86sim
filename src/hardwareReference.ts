// Content for the Learn tab's "Hardware" section: how the 8086 actually works
// internally (CPU Internal Architecture), how it talks to memory (Memory & Bus
// Architecture), how the stack/call mechanism works (Stack & Call Mechanism),
// and how it talks to the outside world (I/O Ports & Interrupts). A later
// "Support Chips" category documents the classic 8086 support-chip set
// (8284/8282/8283/8288/8259/8253/8254/8255/8251/8237) as static reference --
// this simulator doesn't model those chips, so they carry no demo.
//
// Each demo's `source` is a small, self-contained program run in its own Cpu
// instance by HardwarePlayground (components/HardwarePlayground.tsx) -- fully
// independent of whatever the user has open in the main editor tabs.

import type { HardwareVisual } from './components/HardwarePlayground'
import type { PipelineScenario } from './core/biuEu'

export interface HardwareTopic {
  id: string
  title: string
  summary: string
  content: string[]
  demo?: { source: string; visual: HardwareVisual }
  // A purely illustrative diagram for topics with nothing to actually step
  // through in this simulator (e.g. segment:offset math this simulator never
  // performs) -- rendered instead of a demo, never alongside one.
  staticDiagram?: 'segmented-addressing'
  // An interactive bus-cycle timing diagram (components/TimingDiagramView.tsx).
  timing?: boolean
  // A purpose-built interactive view instead of a Cpu demo: 'fde' is the three-phase
  // stepper (FetchDecodeExecuteView), 'alu' is the live ALU explorer (AluView).
  interactive?: 'fde' | 'alu'
  // A clock-by-clock BIU/EU pipeline simulation (components/BiuEuView.tsx,
  // core/biuEu.ts) instead of a Cpu demo -- the main Cpu runs whole
  // instructions atomically and has no notion of bus cycles or the prefetch
  // queue. More than one scenario gets a picker above the simulation.
  pipeline?: PipelineScenario[]
  notes?: string[]
}

export interface HardwareCategory {
  id: string
  title: string
  topics: HardwareTopic[]
}

export const HARDWARE_REFERENCE: HardwareCategory[] = [
  {
    id: 'cpu-internals',
    title: 'CPU Internal Architecture',
    topics: [
      {
        id: 'fetch-decode-execute',
        title: 'Fetch-Decode-Execute Cycle',
        summary: 'How the CPU turns one line of assembly into a change in its state.',
        content: [
          'Every instruction goes through the same three phases: fetch (read the instruction at IP from ' +
            'memory), decode (figure out the mnemonic and operands), and execute (actually do it -- move a ' +
            'value, compute something in the ALU, or read/write memory). IP then advances to the next ' +
            'instruction and the cycle repeats.',
          'Step through the three phases below for one instruction, ADD AX, BX. Fetch brings the bytes in, decode ' +
            'works out what they mean and which operands they use, and execute does the work. Each phase only ' +
            'hands its result to the next one.',
        ],
        interactive: 'fde',
      },
      {
        id: 'biu-eu',
        title: 'BIU & EU: The 8086\'s Two Units',
        summary: 'The 8086 is split into a Bus Interface Unit and an Execution Unit that work at the same time.',
        content: [
          'Inside the 8086 there are really two processors cooperating. The Bus Interface Unit (BIU) does ' +
            'everything that involves the outside world: it holds the segment registers (CS, DS, SS, ES) and IP, ' +
            'computes 20-bit physical addresses with its own address adder (Σ: segment × 10h + offset), runs ' +
            'bus cycles, and keeps a 6-byte instruction queue topped up with the next bytes of code.',
          'The Execution Unit (EU) never touches the bus. It takes instruction bytes from the front of the ' +
            'queue, decodes them in its control unit, and executes them using the general registers (AX-DX, SP, ' +
            'BP, SI, DI), the ALU, and FLAGS. When an instruction needs a value from memory, the EU computes the ' +
            'offset and asks the BIU to do the actual read or write.',
          'Because the two units are independent, fetching and executing overlap: while the EU is busy with one ' +
            'instruction, the BIU is already fetching the next ones. This is a simple form of pipelining, and it ' +
            'is why the 8086 is faster than a CPU like the 8085 that strictly fetches, then executes.',
          'Every bus cycle takes 4 clocks, T1-T4: T1 puts the address on the bus, T2-T3 give the memory time to ' +
            'respond, and T4 completes the transfer. With a 16-bit data bus, one code fetch brings in 2 bytes. ' +
            'Press Clock +1 a few times and watch both timeline rows fill in at the same time. Colors link each ' +
            'instruction\'s bytes in the listing, the queue, and the EU row.',
        ],
        pipeline: ['overlap'],
        notes: [
          'Clock counts are the best-case figures from Intel\'s 8086 timing table, and the model leaves out ' +
            'wait states and odd-address penalties. It is meant to show the overlap, not to be cycle-exact.',
          'The rest of this simulator runs each instruction as one atomic step and has no BIU/EU split -- ' +
            'this view is a separate model built just for these topics.',
        ],
      },
      {
        id: 'prefetch-queue',
        title: 'The 6-Byte Instruction Queue',
        summary: 'How the queue lets the BIU work ahead of the EU, and what happens when it runs empty or full.',
        content: [
          'The BIU starts a new code fetch whenever at least 2 of the 6 queue bytes are free and the bus is not ' +
            'needed for anything else. Each fetch costs 4 clocks and delivers 2 bytes, so the BIU can supply at ' +
            'most one byte every 2 clocks.',
          '"Queue runs empty": when the EU executes short, fast instructions (2-byte register moves that take ' +
            'only 2 clocks), it consumes bytes faster than the BIU can bring them in. The queue drains and the EU ' +
            'has to wait for bytes (red cells in the EU row). Overlap still helps, just less.',
          '"Queue fills up": during a slow instruction such as MUL (about 70 clocks), the BIU fills all 6 ' +
            'bytes and then has nothing left to do -- it sits idle in Ti states until the EU takes the next ' +
            'instruction and frees space. The following instructions then start immediately, because their ' +
            'bytes are already waiting in the queue.',
        ],
        pipeline: ['starve', 'full'],
        notes: [
          'The 8088 (used in the original IBM PC) has the same EU but an 8-bit external data bus and only a ' +
            '4-byte queue, so each fetch brings 1 byte and the "queue runs empty" case happens far more often.',
        ],
      },
      {
        id: 'pipeline-stalls',
        title: 'When the Overlap Breaks: Memory Operands & Jumps',
        summary: 'Memory operands compete with prefetching for the bus, and jumps throw prefetched bytes away.',
        content: [
          '"Memory operands": there is only one bus. When an instruction like MOV AX, [0200h] needs data, the EU ' +
            'computes the offset and requests a data bus cycle. That request has priority over prefetching, but ' +
            'a fetch already in progress cannot be interrupted, so the EU may have to wait for it to finish before ' +
            'its own 4-clock read or write even starts. Watch the Σ adder switch from CS to DS for these cycles.',
          '"Jump flushes the queue": the BIU always fetches the bytes that follow the current instruction, ' +
            'because it does not know a jump is coming. When JMP executes, those bytes are useless. The queue is ' +
            'emptied, the BIU restarts fetching at the target address, and the EU has to wait until the first ' +
            'target instruction arrives. That refill is why taken jumps, CALL, RET, and LOOP are relatively slow ' +
            'on the 8086 -- and why a conditional jump that is not taken is cheap.',
        ],
        pipeline: ['memory', 'jump'],
      },
      {
        id: 'register-file',
        title: 'Register File',
        summary: 'The small set of fast storage locations inside the CPU itself.',
        content: [
          'AX, BX, CX, DX, SI, DI, BP, and SP are the general-purpose 16-bit registers this simulator models ' +
            '(DS/ES/SS/CS also exist and accept values so MASM-style boilerplate runs, but this simulator has no ' +
            'real segmentation, so they never take part in an address calculation -- see "Segmented Addressing" below). AX-DX can also be addressed as two independent 8-bit halves each ' +
            '(AH/AL, BH/BL, CH/CL, DH/DL) -- SI, DI, BP, and SP cannot, they are only ever a full 16-bit word.',
          'Reading or writing a register is effectively instant compared to a memory access -- there is no bus ' +
            'transaction involved, which is exactly why registers exist: they are the CPU\'s own scratch space.',
          'Watch the "8-bit halves" column below: AX is built entirely out of two separate byte-sized writes ' +
            '(AH then AL), and writing BL alone only changes BX\'s low byte, leaving BH untouched. SI has no ' +
            'such column entry -- it can\'t be split.',
        ],
        demo: {
          visual: 'registers',
          source:
            'MOV AH, 12h    ; write only AX\'s high byte\n' +
            'MOV AL, 34h    ; write only AX\'s low byte -- together they make AX = 1234h\n' +
            'MOV BX, 0AB00h ; a normal 16-bit load\n' +
            'MOV BL, 99h    ; overwrite just BX\'s low byte -- BH stays ABh, only BL changes\n' +
            'MOV DX, 400    ; a 16-bit decimal load, for contrast\n' +
            'MOV SI, 500    ; SI has no 8-bit halves -- always a full 16-bit register\n' +
            'HLT\n',
        },
      },
      {
        id: 'alu-operations',
        title: 'ALU Operations',
        summary: 'The circuit that actually does arithmetic and bitwise logic.',
        content: [
          'The Arithmetic Logic Unit takes one or two register/immediate values, computes a result (ADD, SUB, ' +
            'AND, OR, XOR, NOT, INC, DEC, and the rest), and writes that result back to a register while also ' +
            'updating the flags register based on what came out.',
          'Pick an operation and move the A and B sliders below. The result and flags come straight from the ' +
            'simulator, so you can see how carries, borrows, and the bitwise operations change them. Operations ' +
            'like these work only on registers and immediates, never on memory.',
        ],
        interactive: 'alu',
      },
      {
        id: 'flags-register',
        title: 'Flags Register',
        summary: 'One-bit results the ALU leaves behind for later decisions.',
        content: [
          'Alongside its main result, the ALU sets a handful of status flags: ZF (the result was zero), SF ' +
            '(the result was negative, i.e. its top bit is set), CF (an unsigned carry/borrow happened), and ' +
            'OF (a signed overflow happened). CMP is just a subtraction that keeps the flags but throws the ' +
            'result away.',
          'Conditional jumps (JE, JG, JA, ...) read these flags rather than repeating the comparison -- that\'s ' +
            'the whole point of separating "compute" from "decide."',
          'FLAGS itself is not a set of separate switches -- it\'s one more 16-bit register, exactly like AX or ' +
            'IP, and each flag is just one bit within it at a fixed position: CF is bit 0, PF is bit 2, AF is bit 4, ' +
            'ZF is bit 6, SF is bit 7, IF is bit 9, DF is bit 10, and OF is bit 11. The FLAGS row below shows that ' +
            'same register as a whole -- watch its hex/decimal/binary value change as the individual flag bits ' +
            'below it flip between 0 and 1.',
        ],
        demo: {
          visual: 'registers',
          source:
            'MOV AX, 10\n' +
            'CMP AX, 10   ; equal -> ZF = 1\n' +
            'MOV BX, 5\n' +
            'CMP AX, BX   ; AX > BX (unsigned) -> CF = 0, ZF = 0\n' +
            'CMP BX, AX   ; BX < AX (unsigned) -> CF = 1, SF = 1 (the result is negative)\n' +
            'STD          ; DF = 1 -- string instructions would now count addresses down\n' +
            'CLD          ; DF = 0 -- back to counting up, the default\n' +
            'HLT\n',
        },
        notes: [
          'This simulator\'s ADD/SUB/CMP/INC/DEC/NEG never actually update OF -- see the Instruction Reference ' +
            'entries for JG/JL/JGE/JLE for why that matters for signed comparisons.',
          'PF (parity of the low result byte), AF (carry out of the low nibble, used by the BCD-adjust ' +
            'instructions), and IF (the interrupt-enable flag, set by STI and cleared by CLI) are modeled here too. ' +
            'The one bit this simulator still leaves out is TF (the single-step trap flag), so it always reads 0; ' +
            'a real 8086 also keeps reserved bit 1 permanently set, which is not shown either.',
        ],
      },
    ],
  },
  {
    id: 'bus-memory',
    title: 'Memory & Bus Architecture',
    topics: [
      {
        id: 'bus-types',
        title: 'Address Bus vs Data Bus vs Control Bus',
        summary: 'How the CPU actually talks to memory over wires.',
        content: [
          'A real 8086 has three logically separate buses running between the CPU and everything else: the ' +
            'address bus (the CPU says which memory cell or I/O port it wants -- 20 bits wide for memory on a ' +
            'real 8086), the data bus (the actual bytes travel here, 16 bits wide), and the control bus ' +
            '(signals that say what kind of transfer this is and which direction the data bus is being used).',
          'This simulator names four of those control signals after their real 8086 equivalents: MEMR/MEMW ' +
            '(memory read/write) and IOR/IOW (I/O port read/write) -- exactly one of the four is asserted for ' +
            'any single bus transaction, and it is that signal, not the address alone, that tells the rest of ' +
            'the system whether the address on the bus should be read as a memory location or a port number.',
          'Watch all three lanes together below: the ADDRESS lane shows the literal address or port number, ' +
            'the DATA lane shows the literal byte/word value and which way it travelled, and the CONTROL lane ' +
            'shows which signal fired. Instructions that never touch memory or a port (register-to-register ' +
            'moves, ALU ops, jumps) leave all three lanes idle -- they never reach the external bus at all.',
        ],
        demo: {
          visual: 'busdetail',
          source:
            'VALUE DW 0\n' +
            'MOV AX, 1234h\n' +
            'MOV [VALUE], AX   ; MEMW: address = VALUE, data = 1234h, leaving the CPU\n' +
            'MOV BX, [VALUE]   ; MEMR: same address, data comes back in\n' +
            'ADD BX, 1         ; an internal ALU op -- the external bus stays idle\n' +
            'MOV AL, 06h\n' +
            'OUT 41h, AL       ; IOW: address = port 41h, data = 06h, leaving the CPU\n' +
            'IN AL, 41h        ; IOR: same port, data comes back in\n' +
            'HLT\n',
        },
      },
      {
        id: 'bus-timing',
        title: 'Memory & I/O Bus Cycles (Timing)',
        summary: 'What each clock state T1-T4 does on the 8086 bus, for memory and I/O reads and writes.',
        content: [
          'The 8086 multiplexes its address and data onto the same 16 lines AD15-AD0 (plus A19-A16 shared with ' +
            'status). In T1 the CPU puts the address there and pulses ALE high; an external latch such as the 8282 ' +
            'captures it on ALE\'s falling edge. That is the demultiplexing step: after T1 the same pins carry data, ' +
            'and the latch is what keeps the address stable for the memory or port being accessed.',
          'Pick a bus cycle below and step through T1-T4. Active-low control signals (RD̅, WR̅, DEN̅) are drawn low ' +
            'while they are asserted. M/IO̅ tells memory and I/O apart, and DT/R̅ sets the direction of the data ' +
            'transceivers. A write starts driving data in T2, while a read leaves the bus floating in T2 so memory ' +
            'can drive it instead.',
          'READY is sampled in T3. If it is low, the CPU inserts wait states (Tw) until the device is ready.',
        ],
        timing: true,
        notes: [
          'Minimum mode is shown here. In maximum mode an 8288 bus controller generates the read/write strobes ' +
            '(MRDC̅, MWTC̅, IORC̅, IOWC̅) from the CPU\'s status lines S2̅-S0̅, so the CPU itself never drives RD̅/WR̅.',
        ],
      },
      {
        id: 'control-signals',
        title: 'Control Signals & Minimum vs Maximum Mode',
        summary: 'The pins that tell memory and I/O what a bus cycle is for, and how the MN/MX̅ pin changes who generates them.',
        content: [
          'Control signals decide when data is read or written and which kind of transfer is happening. ' +
            'The most important ones are M/IO̅ (memory or I/O cycle), RD̅ and WR̅ (read or write strobe), ALE ' +
            '(address latch enable), DEN̅ and DT/R̅ (data transceiver enable and direction), READY (the device ' +
            'says it is ready to finish the cycle), and INTA̅ (interrupt acknowledge).',
          'The MN/MX̅ pin selects the operating mode at power-up. MN/MX̅ tied high is minimum mode: a single ' +
            'processor system where the 8086 generates all of these signals itself. MN/MX̅ tied low is maximum ' +
            'mode, for multiprocessor systems: the 8086 instead outputs the status lines S2̅-S0̅, and an 8288 bus ' +
            'controller decodes them into the actual command strobes (MRDC̅, MWTC̅, AMWC̅, IORC̅, IOWC̅) plus ALE, ' +
            'DEN, and DT/R.',
          'Maximum mode lets several processors share one bus safely, because the 8288 is the only chip that drives ' +
            'the command lines. Its advanced write strobe AMWC̅ asserts one clock earlier than the normal MWTC̅, ' +
            'giving slower memories a wider write pulse.',
        ],
        notes: [
          'The control-line names here follow the Microprocessors course slides. The 8086 pin list also contains ' +
            'RESET, NMI, INTR, TEST̅, and HOLD/HLDA (minimum mode) or RQ/GT̅ (maximum mode), covered in the next topics.',
        ],
      },
      {
        id: 'bus-request-grant',
        title: 'Bus Request & Bus Grant',
        summary: 'How another bus master borrows the bus, and how the CPU hands it over cleanly.',
        content: [
          'Sometimes another device needs the bus itself, for example a DMA controller moving data straight to ' +
            'memory. It asks for the bus, and the CPU hands it over only at a safe point: the CPU finishes the ' +
            'bus cycle it is in, then floats its address, data, and control lines so the other device can drive them.',
          'In minimum mode the handshake uses HOLD (request, input) and HLDA (acknowledge, output). In maximum mode ' +
            'it uses the request/grant pins RQ/GT̅0 and RQ/GT̅1: a master pulses its request line, the 8086 answers ' +
            'on the matching grant line once the bus is free, and the master then sends the release pulse back ' +
            'when it is finished.',
          'The CPU does not lose its place while the bus is borrowed: its registers, flags, and instruction queue ' +
            'stay intact, and it resumes the next bus cycle as soon as the bus is returned.',
        ],
      },
      {
        id: 'lock-signal',
        title: 'The LOCK Signal',
        summary: 'A promise that the current bus transaction cannot be interrupted by another bus master.',
        content: [
          'The LOCK̅ output is asserted (low) while the 8086 runs an instruction prefixed with the LOCK prefix, and ' +
            'during bus cycles that must not be split, such as the two memory accesses of a read-modify-write ' +
            'sequence (for example XCHG with a memory operand) and interrupt acknowledgement.',
          'While LOCK̅ is low, bus request/grant is not honored: another master has to wait until the locked ' +
            'sequence has finished, so no other processor can read a semaphore between the read and write halves.',
          'This simulator is single-processor and has no other bus masters, so LOCK has no visible effect here; it is ' +
            'documented for completeness and for the multiprocessor systems covered by maximum mode.',
        ],
      },
      {
        id: 'segmented-addressing',
        title: 'Segmented Addressing vs This Simulator\'s Flat Model',
        summary: 'Why real 8086 addresses need two registers, and why this simulator only needs one.',
        content: [
          'The 8086\'s registers are only 16 bits wide, which can only address 64KB directly -- but the address ' +
            'bus is 20 bits wide, reaching 1MB. Real 8086 code bridges that gap with segment:offset addressing: ' +
            'a segment register (CS, DS, SS, or ES) is shifted left 4 bits and added to a 16-bit offset to form ' +
            'the real 20-bit address. That\'s why MASM/TASM source declares .DATA/.CODE segments and loads DS ' +
            'from @DATA before touching any variable.',
          'This simulator has no such gap to bridge: memory is a single flat 64KB space, addressed directly by ' +
            'a 16-bit offset. The segment registers (DS/ES/SS/CS) still exist so MASM/TASM boilerplate like ' +
            '"MOV AX, @DATA" / "MOV DS, AX" can be pasted in without errors, but they are never added into an ' +
            'address calculation -- they simply stay 0 and do nothing.',
        ],
        staticDiagram: 'segmented-addressing',
        notes: [
          'See the Directives & Program Structure category in Instruction Reference for exactly which MASM/TASM ' +
            'segment boilerplate is accepted.',
        ],
      },
    ],
  },
  {
    id: 'stack-calls',
    title: 'Stack & Call Mechanism',
    topics: [
      {
        id: 'push-pop',
        title: 'PUSH / POP',
        summary: 'A last-in-first-out scratch area in memory, one register-sized value at a time.',
        content: [
          'PUSH decrements SP by 2 and writes a 16-bit value to memory there; POP reads it back and increments ' +
            'SP by 2. Because it\'s LIFO, the last value pushed is always the first one popped -- push AX then ' +
            'BX, and popping gives you BX back before AX.',
          'Watch the STACK band grow downward (toward lower addresses) on each PUSH below, then shrink back up ' +
            'on each POP.',
        ],
        demo: {
          visual: 'stack',
          source:
            'MOV AX, 111\n' +
            'MOV BX, 222\n' +
            'PUSH AX\n' +
            'PUSH BX\n' +
            'POP AX   ; LIFO: AX now gets 222 (what BX pushed)\n' +
            'POP BX   ; BX now gets 111 (what AX pushed)\n' +
            'HLT\n',
        },
      },
      {
        id: 'call-ret',
        title: 'CALL / RET and the Return Address',
        summary: 'How a subroutine finds its way back to whoever called it.',
        content: [
          'CALL pushes the address of the instruction right after it onto the stack, then jumps to the target ' +
            'label. RET pops that same address and jumps back to it. That return address lives on the exact ' +
            'same stack your own PUSH/POP instructions use -- which is why a subroutine that PUSHes something ' +
            'without a matching POP before RET will pop the wrong thing (the corrupted "return address") and ' +
            'crash.',
          'Below, GREET is called (its return address is pushed invisibly), then PUSHes and POPs AX itself ' +
            'before RETurning -- watch the stack grow twice and shrink twice.',
        ],
        demo: {
          visual: 'stack',
          source:
            'MOV AX, 999\n' +
            'CALL GREET\n' +
            'HLT\n' +
            '\n' +
            'GREET PROC\n' +
            '  PUSH AX\n' +
            '  MOV AX, 42\n' +
            '  POP AX\n' +
            '  RET\n' +
            'GREET ENDP\n',
        },
      },
    ],
  },
  {
    id: 'io-interrupts',
    title: 'I/O Ports & Interrupts',
    topics: [
      {
        id: 'io-ports',
        title: 'IN / OUT and Ports',
        summary: 'A separate address space, just for talking to hardware.',
        content: [
          'Besides memory, the 8086 has a completely separate I/O address space of 64K ports (16-bit port ' +
            'numbers, passed in DX), reached only through IN and OUT. A port number written directly in the ' +
            'instruction is only 8 bits wide, so it can reach ports 0-255 only -- higher ports must go through DX. OUT writes a byte from AL (or a word from AX) to a port; IN reads one back. Real ' +
            'hardware -- a keyboard controller, a disk controller, a sound chip -- sits behind these ports ' +
            'instead of at a memory address.',
          'This simulator wires a few ports to virtual devices you can watch react live: port 40h is a traffic ' +
            'light, 41h a stepper motor, 42h a seven-segment display, and 43h a thermometer.',
        ],
        demo: {
          visual: 'devices',
          source:
            'MOV AL, 04h\n' +
            'OUT 40h, AL   ; traffic light: bit 2 = green\n' +
            'MOV AL, 06h\n' +
            'OUT 41h, AL   ; stepper motor: one step command\n' +
            'MOV AL, 7Fh\n' +
            'OUT 42h, AL   ; seven-segment: light up segments a-g\n' +
            'MOV AL, 25\n' +
            'OUT 43h, AL   ; thermometer: 25 degrees\n' +
            'HLT\n',
        },
      },
      {
        id: 'software-vs-hardware-interrupts',
        title: 'Software Interrupts (INT 21h) vs Real Hardware Interrupts',
        summary: 'INT is a request the CPU makes of itself; a real interrupt is hardware demanding attention.',
        content: [
          'On a real 8086, an interrupt (software INT, or hardware via the 8259 PIC below) makes the CPU look ' +
            'up a 4-byte far pointer in the Interrupt Vector Table at the very start of memory (segment 0000h, ' +
            'offset = interrupt number x 4), then jumps there -- that\'s how DOS, the BIOS, and every hardware ' +
            'device handler get invoked.',
          'This simulator models only the one interrupt real DOS programs use constantly: INT 21h. Instead of a ' +
            'full 256-entry vector table, Cpu.handleInterrupt just switches on the value in AH -- 01h reads a ' +
            'key, 02h prints a character, 09h prints a $-terminated string, 0Ah reads a line, and 4Ch halts the ' +
            'program. See the I/O & Interrupts category in Instruction Reference for the full table.',
          'A real hardware interrupt (a key pressed, a timer tick from the 8253/8254 below) isn\'t requested by ' +
            'the running program at all -- it arrives asynchronously from outside, is prioritized by the 8259 ' +
            'PIC, and interrupts whatever the CPU happened to be doing. This simulator has no asynchronous ' +
            'events, so every interrupt here is one your own code triggered on purpose with INT.',
        ],
      },
    ],
  },
]
