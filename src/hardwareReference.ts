// Content for the Learn tab's "Hardware" section: how the 8086 actually works
// internally (CPU Internal Architecture), how it talks to memory (Memory & Bus
// Architecture), how the stack/call mechanism works (Stack & Call Mechanism),
// and how it talks to the outside world (I/O Ports & Interrupts). The
// "Support Chips" category covers the 8255 PPI, which the simulator models
// at ports 80h-83h (core/ppi8255.ts); the rest of the classic support-chip
// set (8284/8282/8283/8288/8259/8253/8254/8251/8237) is not simulated.
//
// Each demo's `source` is a small, self-contained program run in its own Cpu
// instance by HardwarePlayground (components/HardwarePlayground.tsx) -- fully
// independent of whatever the user has open in the main editor tabs.

import type { HardwareVisual } from './components/HardwarePlayground'
import type { FigureSpec } from './components/FigureStepper'
import type { PipelineScenario } from './core/biuEu'
import type { NumVisual } from './numberingSystems'

export interface HardwareTopic {
  id: string
  title: string
  summary: string
  /** Paragraphs and drawn blocks (components/NumberVisual.tsx). */
  content: (string | NumVisual)[]
  demo?: { source: string; visual: HardwareVisual }
  // A purely illustrative diagram for topics with nothing to actually step
  // through in this simulator (e.g. segment:offset math this simulator never
  // performs) -- rendered instead of a demo, never alongside one.
  staticDiagram?: 'segmented-addressing' | 'von-neumann-harvard' | 'ppi-8255'
  // An interactive bus-cycle timing diagram (components/TimingDiagramView.tsx).
  timing?: boolean
  // A purpose-built interactive view instead of a Cpu demo: 'fde' is the
  // fetch-decode-execute stepper (FetchDecodeExecuteView), 'alu' is the live
  // ALU explorer (AluView), 'move-it' the MOV/XCHG challenges (MoveItView),
  // 'bank-selector' the BHE̅/A0 bank view and 'chip-check' the "which chip
  // answers?" questions (MemoryBusViews), 'ppi-control-word' and 'ppi-bsr'
  // the 8255 word builders (Ppi8255Views).
  interactive?: 'fde' | 'alu' | 'move-it' | 'bank-selector' | 'chip-check' | 'ppi-control-word' | 'ppi-bsr'
  // A step-through figure built from data (components/FigureStepper.tsx).
  figure?: FigureSpec
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
        summary: 'How the CPU turns one instruction in memory into a change in its registers.',
        content: [
          'Every instruction goes through the same three phases. Fetch: the Bus Interface Unit (BIU) reads the ' +
            "instruction's bytes from memory at the address in IP, and IP moves past them. Decode: the control unit " +
            'reads the opcode and works out which operation this is and which operands it uses. Execute: the work ' +
            'is done -- the ALU computes a result, a register is written, or a value is read from or written to ' +
            'memory. Then the cycle starts again at the new IP.',
          'An instruction in memory is not text. The assembler turns each line into machine-code bytes, and those ' +
            'bytes are what the CPU fetches. Instructions have different lengths: MOV AX, 5 takes 3 bytes, ADD AX, BX ' +
            'only 2. That is why IP jumps forward by the length of each instruction rather than by 1.',
          'Step through the short program below, stored from address 0100h. For each instruction, watch which part ' +
            'of the CPU is working (lit up in the diagram), which memory bytes are read, and how IP and the registers ' +
            'change. The last instruction writes AX to memory: a word is stored low byte first, so 0008h becomes the ' +
            'bytes 08h, 00h -- and the address 0200h inside the instruction is stored the same way, as 00 02.',
        ],
        interactive: 'fde',
        notes: [
          'The real 8086 overlaps these phases: the BIU fetches the next bytes while the EU is still executing the ' +
            'current instruction (see "BIU & EU: The 8086\'s Two Units"). Here they are shown one after another so ' +
            'each phase is easy to follow.',
          'The main simulator runs one line at a time and highlights the current line instead of showing IP as a ' +
            'byte address.',
        ],
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
        summary: 'The small set of fast storage locations inside the CPU, and what each one is for.',
        content: [
          "Registers are the CPU's own storage. Reading or writing one needs no bus cycle, so it is far faster than " +
            'a memory access -- that is why programs load values into registers, work on them there, and write the ' +
            'results back to memory only when needed.',
          'The 8086 has eight general-purpose 16-bit registers. Any of them can hold any value, but each one also has ' +
            'a job that some instructions expect it to do:',
          { kind: 'registerRoles' },
          'AX, BX, CX and DX can also be used as two independent 8-bit registers: AH is the high byte of AX and AL ' +
            'the low byte, and the same for BH/BL, CH/CL and DH/DL. Writing one half never touches the other. SI, DI, ' +
            'BP and SP cannot be split.',
          { kind: 'register', name: 'AX', value: 0x1234, bits: 16 },
          'Two more registers are not for data. IP holds the address of the next instruction (see ' +
            '"Fetch-Decode-Execute Cycle"); programs never write it with MOV, only jumps and calls change it. FLAGS ' +
            'holds one-bit results of the last ALU operation, such as "the result was zero" (Module 3). DS, ES, SS ' +
            'and CS are segment registers; this simulator accepts them so MASM-style programs run, but it has no ' +
            'real segmentation (see "Segmented Addressing").',
          'Press Step below and watch the highlighted row: MOV AH, 12h and MOV AL, 34h build AX = 1234h one byte at ' +
            'a time, and MOV BL, 99h changes only the low byte of BX while BH stays ABh. SI has no halves column -- ' +
            'it is always a full 16-bit register.',
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
        id: 'data-movement',
        title: 'Moving Data: MOV and XCHG',
        summary: 'Copy values between registers and memory, swap them, and learn the rules the assembler checks.',
        content: [
          'Most instructions in a program just move data. MOV dest, src copies src into dest. The source is never ' +
            'changed, and whatever dest held before is lost.',
          'The source can be a number (an immediate), a register or a memory location. The destination can be a ' +
            'register or a memory location. The assembler checks four rules:',
          { kind: 'movRules' },
          'Writing an 8-bit register changes only that half. MOV AL, 7 leaves AH as it was, so only the low byte of ' +
            'AX changes. This matters at the end of every program: MOV AH, 4Ch, the first half of the exit-to-DOS ' +
            'sequence, overwrites the high byte of AX.',
          'XCHG op1, op2 swaps two operands in one instruction. Without it a swap needs a third register: ' +
            'MOV DX, AX / MOV AX, BX / MOV BX, DX. The same size rule applies, and at least one operand must be a ' +
            'register.',
          'Try the five challenges below. Each starts from the register values shown. Write the instruction(s) that ' +
            'reach the goal and press Check.',
        ],
        interactive: 'move-it',
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
        id: 'von-neumann-harvard',
        title: 'Von Neumann vs Harvard Architecture',
        summary: 'Why the 8086 fetches instructions and reads data over the same bus, and what a Harvard machine does differently.',
        content: [
          'The 8086 is a Von Neumann machine. It follows the stored-program concept: the program is just bytes in ' +
            'memory, kept in the same memory as the data it works on. There is one memory and one bus between it and ' +
            'the CPU, and the CPU works through fetch → decode → execute one step after another.',
          'A Harvard machine keeps instructions and data in separate memories, each with its own bus. It can fetch ' +
            'the next instruction and read or write data at the same time.',
          'Look back at the Fetch-Decode-Execute topic: the fetch and the data access of MOV AX, [BX] use the same ' +
            'bus, one after the other. On a Harvard machine they could overlap.',
          {
            kind: 'table',
            head: ['', 'Von Neumann', 'Harvard'],
            rows: [
              ['Memory', 'One memory for instructions and data', 'Separate instruction and data memories'],
              ['Buses', 'One shared bus', 'One bus per memory'],
              ['Fetch and data access', 'One after the other', 'At the same time'],
              ['Strengths', 'Simpler, cheaper, flexible for general-purpose computing', 'Faster (parallel access), predictable timing, good for real-time and embedded work'],
              ['Weaknesses', 'The shared bus is a bottleneck (the "Von Neumann bottleneck"); code and data in one memory make code-injection attacks possible', 'More complex and more expensive, less flexible'],
              ['Examples', 'Intel x86 family (8086, 80286, 80386 …), the CPUs in PCs, laptops and servers', 'Microcontrollers (PIC, AVR, ARM Cortex-M), DSPs (TI TMS320), automotive and IoT controllers'],
            ],
          },
        ],
        staticDiagram: 'von-neumann-harvard',
        notes: [
          'The 8086 hides part of the Von Neumann bottleneck with its prefetch queue: the BIU fetches the next ' +
            'instructions while the EU is still executing (Module 4, "The 6-Byte Instruction Queue").',
        ],
      },
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
        id: 'address-demux',
        title: 'Address/Data Demultiplexing',
        summary: 'The same 16 pins carry an address first and data later, so a latch has to hold the address.',
        content: [
          'To save pins, the 8086 shares AD15-AD0 between address and data. The step-through figure below shows what ' +
            'each clock does with those pins. The demultiplexing circuit is an external latch such as the 8282.',
        ],
        figure: {
          title: 'Splitting the shared AD lines',
          steps: [
            {
              name: 'T1: address',
              where: 'The CPU puts the address on AD15-AD0 and pulses ALE high. The latch is transparent, so it follows the address lines.',
              state: [['AD15-AD0', 'address'], ['ALE', 'high'], ['8282 latch', 'transparent, following AD']],
            },
            {
              name: 'Latch closes',
              where: 'ALE falls. The latch captures the address and keeps it on its own outputs, freeing the AD pins for the next clock.',
              state: [['AD15-AD0', 'address (still driven)'], ['ALE', 'low'], ['8282 latch', 'holding the address']],
            },
            {
              name: 'T2-T3: data',
              where: 'AD15-AD0 switch to data. The latched outputs still show the address to the memory chip, so memory and data share the wires without confusion.',
              state: [['AD15-AD0', 'data'], ['Latch outputs', 'address, held'], ['Memory', 'reads at the address']],
            },
          ],
        },
      },
      {
        id: 'memory-banking',
        title: 'Memory Banking: BHE̅ and A0',
        summary: 'How the 16-bit data bus is split into an even and an odd bank, and why a word at an odd address costs two bus cycles.',
        content: [
          'The 8086 addresses 1 MB (A19–A0) but moves 16 bits at a time. The memory is therefore built as two 512 KB ' +
            'banks side by side. The even (low) bank holds 00000h, 00002h … FFFFEh and is wired to D7–D0. The odd ' +
            '(high) bank holds 00001h, 00003h … FFFFFh and is wired to D15–D8.',
          'Two signals choose the bank. The even bank is selected when A0 = 0. The odd bank is selected when BHE̅ ' +
            '(Bus High Enable, active low) = 0. Each bank only sees A19–A1, so one row holds one even and one odd byte.',
          {
            kind: 'table',
            head: ['BHE̅', 'A0', 'Function', 'Data lines', 'Bus cycles'],
            rows: [
              ['0', '0', 'Word at even address (both banks)', 'D15–D0', '1'],
              ['1', '0', 'Byte at even address (low bank)', 'D7–D0', '1'],
              ['0', '1', 'Byte at odd address (high bank)', 'D15–D8', '1'],
              ['1', '1', 'No bank enabled', '–', '–'],
              ['0, then 1', '1, then 0', 'Word at odd address', 'D15–D8, then D7–D0', '2'],
            ],
          },
          'A word at an odd address does not fit in one row: its low byte is in the odd bank at the address, its high ' +
            'byte in the even bank one row up. The 8086 needs two bus cycles: first the odd byte (A0 = 1, BHE̅ = 0, ' +
            'on D15–D8), then the even byte at address + 1 (A0 = 0, BHE̅ = 1, on D7–D0).',
          'Type an address below and switch between Byte and Word. Try all four cases: even byte, odd byte, even ' +
            'word and odd word.',
        ],
        interactive: 'bank-selector',
        notes: [
          'Tip: keep word variables at even addresses (EVEN or ALIGN 2 in MASM) so every word access takes one bus cycle.',
          'This simulator\'s memory is flat and does not charge the extra cycle for an odd word; the bank selector ' +
            'shows what the real 8086 bus does.',
        ],
      },
      {
        id: 'memory-interfacing',
        title: 'Memory Interfacing & Address Decoding',
        summary: 'How EPROM and RAM chips are wired to the 8086 and how address decoding picks the right chip.',
        content: [
          'A memory chip has four kinds of lines: address lines (which cell inside the chip), data lines (the byte ' +
            'itself), control lines (read or write) and a chip select (is this chip being addressed at all?). ' +
            'Interfacing means connecting each kind to the right 8086 signals.',
          'The example design: an 8086 in minimum mode with 64 KB of EPROM built from two 32 KB chips and 128 KB of ' +
            'RAM built from two 64 KB chips. Chips come in pairs because of the two memory banks: one chip of each ' +
            'pair is the even (low-byte) chip, the other the odd (high-byte) chip.',
          {
            kind: 'table',
            head: ['Chip', 'Fixed high bits', 'Range', 'A0'],
            rows: [
              ['EPROM 1 (low byte)', 'A19–A16 = 1111', 'F0000h–FFFFEh', '0'],
              ['EPROM 2 (high byte)', 'A19–A16 = 1111', 'F0001h–FFFFFh', '1'],
              ['RAM 1 (low byte)', 'A19–A17 = 000', '00000h–1FFFEh', '0'],
              ['RAM 2 (high byte)', 'A19–A17 = 000', '00001h–1FFFFh', '1'],
            ],
          },
          'Each chip gets A15–A1 (EPROM) or A16–A1 (RAM) on its own address pins; data D7–D0 goes to the even chips ' +
            'and D15–D8 to the odd chips. On the system side, three 8282 latches hold A19–A0 and BHE̅, two 8286 ' +
            'transceivers buffer D15–D0, and a 74138 decoder turns M/IO̅, RD̅ and WR̅ into MEMR̅, MEMW̅, IOR̅ and IOW̅.',
          'Step through the design below, then check yourself with the three questions after it.',
        ],
        figure: {
          title: 'Wiring 64 KB EPROM and 128 KB RAM to the 8086',
          steps: [
            {
              name: 'Four kinds of lines',
              where: 'Every memory chip is connected through address, data, control and chip-select lines.',
              state: [
                ['Address', 'which cell inside the chip'],
                ['Data', 'the byte read or written'],
                ['Control', 'OE̅ (read), WE̅ (write)'],
                ['Chip select', 'CS̅: this chip, or not'],
              ],
            },
            {
              name: 'Chips per pair',
              where: 'The 16-bit bus is two banks, so each memory is a pair: one even chip on D7–D0, one odd chip on D15–D8.',
              state: [
                ['EPROM 64 KB', '2 × 32 KB: EPROM 1 (even), EPROM 2 (odd)'],
                ['RAM 128 KB', '2 × 64 KB: RAM 1 (even), RAM 2 (odd)'],
              ],
            },
            {
              name: 'Address lines',
              where: 'Count the address lines each memory spans. A0 does the bank selection, so each chip gets the lines above it.',
              state: [
                ['64 KB EPROM', '2¹⁶ → 16 lines (A15–A0); chips get A15–A1'],
                ['128 KB RAM', '2¹⁷ → 17 lines (A16–A0); chips get A16–A1'],
                ['Fixed high bits', 'EPROM: A19–A16 · RAM: A19–A17'],
              ],
            },
            {
              name: 'Address map',
              where: 'The EPROM sits at the top of memory (the 8086 starts at FFFF0h after reset), the RAM at the bottom. A0 splits each range into even and odd.',
              state: [
                ['EPROM 1 / 2', 'F0000h–FFFFFh (A19–A16 = 1111), A0 = 0 / 1'],
                ['RAM 1 / 2', '00000h–1FFFFh (A19–A17 = 000), A0 = 0 / 1'],
              ],
            },
            {
              name: 'Chip select',
              where: 'A NAND of the fixed high bits (inverted where the bit must be 0) goes low only inside the range. ORing it with A0 or BHE̅ picks the even or odd chip. Every CS̅ is active low.',
              state: [
                ['EPROM range', 'NAND(A19, A18, A17, A16)'],
                ['RAM range', 'NAND(A19̅, A18̅, A17̅)'],
                ['Even chip CS̅', 'range OR A0'],
                ['Odd chip CS̅', 'range OR BHE̅'],
              ],
            },
            {
              name: 'Control',
              where: 'MEMR̅ drives every chip\'s output enable. Only the RAM can be written, so only the RAM chips get MEMW̅.',
              state: [
                ['MEMR̅', '→ OE̅ of all four chips'],
                ['MEMW̅', '→ WE̅ of RAM 1 and RAM 2 only'],
                ['EPROM', 'read-only: no WE̅'],
              ],
            },
          ],
        },
        interactive: 'chip-check',
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
        figure: {
          title: 'Who generates the bus signals?',
          steps: [
            {
              name: 'Minimum mode',
              where: 'MN/MX̅ is tied high. The 8086 itself outputs every control signal it needs. This suits a single-processor system with a few memory chips.',
              state: [
                ['MN/MX̅', 'high (minimum)'],
                ['Generated by', 'the 8086 directly'],
                ['Command pins', 'M/IO̅, RD̅, WR̅, ALE, DEN̅, DT/R̅'],
              ],
            },
            {
              name: 'Maximum mode',
              where: 'MN/MX̅ is tied low. The 8086 outputs status lines S2̅-S0̅ instead, and the 8288 bus controller decodes them into the command strobes.',
              state: [
                ['MN/MX̅', 'low (maximum)'],
                ['8086 outputs', 'S2̅ S1̅ S0̅ (status code)'],
                ['8288 outputs', 'MRDC̅, MWTC̅, AMWC̅, IORC̅, IOWC̅, ALE, DEN, DT/R'],
              ],
            },
            {
              name: 'Why it matters',
              where: 'Several processors can share one bus. Only the 8288 drives the command lines, so two CPUs can never fight over them.',
              state: [
                ['Shared bus', 'several masters'],
                ['Command lines', 'driven by one 8288 at a time'],
                ['Early write', 'AMWC̅ asserts one clock before MWTC̅'],
              ],
            },
          ],
        },
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
        figure: {
          title: 'Borrowing the bus, step by step',
          steps: [
            {
              name: 'CPU runs',
              where: 'The CPU owns the bus and runs its bus cycles as usual.',
              state: [['Bus owner', 'CPU'], ['HOLD / RQ̅', 'inactive'], ['HLDA / GT̅', 'inactive']],
            },
            {
              name: 'Request',
              where: 'Another master (for example a DMA controller) asks for the bus: HOLD in minimum mode, RQ̅/GT̅ in maximum mode.',
              state: [['Bus owner', 'CPU (still)'], ['HOLD / RQ̅', 'asserted by master'], ['HLDA / GT̅', 'not yet']],
            },
            {
              name: 'CPU finishes',
              where: 'The 8086 completes the bus cycle it is in. It does not take a new one.',
              state: [['Bus owner', 'CPU, finishing its cycle'], ['HOLD / RQ̅', 'asserted'], ['HLDA / GT̅', 'not yet']],
            },
            {
              name: 'Grant',
              where: 'The CPU floats its address, data, and control lines, then acknowledges with HLDA (minimum) or GT̅ (maximum).',
              state: [['Bus owner', 'master'], ['HOLD / RQ̅', 'asserted'], ['HLDA / GT̅', 'asserted by CPU']],
            },
            {
              name: 'Release',
              where: 'The master finishes and drops its request. The CPU drops its acknowledge and resumes the next bus cycle exactly where it left off.',
              state: [['Bus owner', 'CPU again'], ['HOLD / RQ̅', 'released'], ['HLDA / GT̅', 'released']],
            },
          ],
        },
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
        figure: {
          title: 'LOCK holds the bus',
          steps: [
            {
              name: 'Normal',
              where: 'No LOCK is in effect. A bus request is granted as soon as the CPU finishes its current cycle.',
              state: [['LOCK̅', 'high (not locked)'], ['Request', 'granted at the next safe point']],
            },
            {
              name: 'LOCK starts',
              where: 'The LOCK prefix, or an instruction that must not be split such as XCHG with a memory operand, drives LOCK̅ low for its bus cycles.',
              state: [['LOCK̅', 'low (locked)'], ['Request', 'accepted but not yet granted']],
            },
            {
              name: 'Request waits',
              where: 'Another master requests the bus during the locked read-modify-write. The grant is withheld, so the other processor cannot touch the memory word halfway through.',
              state: [['LOCK̅', 'low'], ['Request', 'waiting'], ['Grant', 'withheld']],
            },
            {
              name: 'Unlock',
              where: 'The locked sequence ends, LOCK̅ returns high, and the pending request is granted.',
              state: [['LOCK̅', 'high again'], ['Request', 'granted']],
            },
          ],
        },
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
        id: 'io-mapping',
        title: 'Isolated I/O vs Memory-Mapped I/O',
        summary: 'Two ways to give a device an address: its own port space, or a slice of the memory space.',
        content: [
          'Isolated I/O (also called I/O-mapped I/O) gives I/O devices their own address space, separate from ' +
            'memory. Only IN and OUT reach it. The port is an 8-bit immediate (0–FFh) or a 16-bit number in DX ' +
            '(0–FFFFh, 65,536 ports). Memory and I/O addresses never overlap, and data moves only between AL/AX ' +
            'and the port.',
          {
            kind: 'code',
            text:
              "MOV DX, 03F8h   ; COM1 port address\n" +
              "MOV AL, 'A'\n" +
              "OUT DX, AL      ; send 'A' to the serial port",
          },
          'Advantages: the whole 1 MB stays available for memory, decoding is simpler (16 address lines), and ' +
            'memory and I/O are clearly separated. Disadvantages: only the special instructions IN and OUT work, ' +
            'there are fewer addresses, and only AL or AX can hold the data.',
          'Memory-mapped I/O gives devices addresses inside the memory space. They are reached with ordinary ' +
            'memory instructions, exactly like a variable.',
          {
            kind: 'code',
            text:
              'MOV AX, [1234h]   ; read a memory-mapped device\n' +
              'MOV [1234h], AX   ; write to it',
          },
          'Advantages: any instruction and addressing mode works (ADD, AND, TEST, string instructions …) with any ' +
            'register, and there are many more device addresses. Disadvantages: the devices use up memory space, ' +
            'and full 20-line decoding is more complex and more expensive.',
          {
            kind: 'table',
            head: ['', 'Memory-mapped I/O', 'Isolated I/O'],
            rows: [
              ['Address lines', 'A19–A0 (20 bits)', 'A15–A0 (8 or 16 bits)'],
              ['Address range', '1 MB', '64K ports'],
              ['Control signals', 'MEMR̅, MEMW̅', 'IOR̅, IOW̅'],
              ['Instructions', 'Any memory instruction', 'Only IN and OUT'],
              ['Data register', 'Any register', 'Only AL / AX'],
              ['Decoding', 'More complex, more expensive', 'Simpler, cheaper'],
            ],
          },
          'Step through the figure below: the same "write 41h to a device" done both ways. The M/IO̅ pin is what ' +
            'tells the rest of the system which address space the address on the bus belongs to.',
        ],
        figure: {
          title: 'Write 41h to a device, two ways',
          steps: [
            {
              name: 'Isolated: OUT 80h, AL',
              where: 'AL holds 41h. OUT puts the port number on the address bus and drives M/IO̅ low, so memory ignores the cycle and the I/O decoder answers.',
              state: [
                ['Instruction', 'OUT 80h, AL'],
                ['Address bus', '0080h (port, A15–A0)'],
                ['Data bus', '41h from AL'],
                ['M/IO̅', '0 (I/O cycle)'],
                ['Strobe', 'IOW̅ active'],
              ],
            },
            {
              name: 'Memory-mapped: MOV [8000h], AL',
              where: 'The same byte goes to a device that sits at memory address 8000h. It is an ordinary memory write: M/IO̅ is high and MEMW̅ fires.',
              state: [
                ['Instruction', 'MOV [8000h], AL'],
                ['Address bus', '08000h (memory, A19–A0)'],
                ['Data bus', '41h from AL'],
                ['M/IO̅', '1 (memory cycle)'],
                ['Strobe', 'MEMW̅ active'],
              ],
            },
            {
              name: 'Compare',
              where: 'Same data, same bus wires. Only M/IO̅ and the strobe differ, and with memory-mapped I/O any instruction (ADD [8000h], AL, TEST, MOVSB …) could have done the write.',
              state: [
                ['Isolated', 'IN/OUT only, AL/AX, IOR̅/IOW̅'],
                ['Memory-mapped', 'any instruction, any register, MEMR̅/MEMW̅'],
              ],
            },
          ],
        },
        notes: [
          'Lecture tables also list IN EAX, INSB/INSW/INSD and OUTSB/OUTSW/OUTSD: those came with the 80186 and ' +
            '80386; the 8086 has only IN and OUT with AL or AX.',
          'This simulator implements the full 64K port space: OUT DX, AL with DX = 8000h really writes port 8000h.',
        ],
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
  {
    id: 'support-chips',
    title: 'Support Chips',
    topics: [
      {
        id: 'ppi-8255-overview',
        title: 'The 8255 PPI: Ports and Block Diagram',
        summary: 'A programmable chip that gives the 8086 three 8-bit I/O ports.',
        content: [
          'The 8255 is a programmable peripheral interface designed for the 8085/8086 to add I/O lines. It has ' +
            'three 8-bit bidirectional ports (A, B, C). Port C can be used as two 4-bit halves. It has three I/O ' +
            'modes -- Mode 0 simple I/O, Mode 1 strobed (handshake) I/O, Mode 2 bidirectional handshake I/O -- and ' +
            'a Bit Set/Reset (BSR) mode that changes a single bit of Port C.',
          'Inside, the data bus buffer connects the chip to D7–D0, and the read/write logic decodes RD̅, WR̅, A1, ' +
            'A0, RESET and CS̅. Group A control drives Port A and PC7–PC4; Group B control drives Port B and PC3–PC0.',
          'A1 and A0 pick one of four registers. In this simulator the 8255 is wired at ports 80h–83h:',
          {
            kind: 'table',
            head: ['CS̅', 'A1', 'A0', 'Selected', 'Port (this simulator)'],
            rows: [
              ['0', '0', '0', 'Port A', '80h'],
              ['0', '0', '1', 'Port B', '81h'],
              ['0', '1', '0', 'Port C', '82h'],
              ['0', '1', '1', 'Control register', '83h'],
              ['1', 'x', 'x', '8255 not selected', '–'],
            ],
          },
          'RESET puts all ports into input mode (control word 9Bh). The control register is write-only: reading ' +
            'port 83h gives FFh here.',
          'In the lecture slides the 8255 sits at 8000h–8003h and is reached through DX (MOV DX, 8003h / OUT DX, AL); ' +
            'the address depends only on how the chip-select is decoded on the board.',
        ],
        staticDiagram: 'ppi-8255',
        notes: [
          'Open the Devices panel to see the simulated 8255: switches on its input ports, LEDs on its output ports ' +
            'and a BCD 7-segment digit on PB3–PB0, like the 4511 on the lecture board.',
        ],
      },
      {
        id: 'ppi-8255-control-word',
        title: '8255 Control Word and Modes',
        summary: 'One byte written to the control register sets the direction and mode of every port.',
        content: [
          'Writing a byte with D7 = 1 to the control register sets the I/O mode. Every output latch is cleared to 0 ' +
            'when a new mode is set.',
          {
            kind: 'table',
            head: ['Bit', 'Meaning'],
            rows: [
              ['D7', '1 = I/O mode (0 = BSR word, see the next topic)'],
              ['D6 D5', 'Port A mode: 00 = mode 0, 01 = mode 1, 1x = mode 2'],
              ['D4', 'Port A: 1 = input, 0 = output'],
              ['D3', 'Port C upper (PC7–PC4): 1 = input, 0 = output'],
              ['D2', 'Port B mode: 0 = mode 0, 1 = mode 1'],
              ['D1', 'Port B: 1 = input, 0 = output'],
              ['D0', 'Port C lower (PC3–PC0): 1 = input, 0 = output'],
            ],
          },
          {
            kind: 'table',
            head: ['Port', 'Mode 0', 'Mode 1', 'Mode 2', 'BSR'],
            rows: [
              ['A', 'yes', 'yes', 'yes', 'no'],
              ['B', 'yes', 'yes', 'no', 'no'],
              ['C', 'yes', 'handshake lines', 'handshake lines', 'yes'],
            ],
          },
          'Mode 0: outputs are latched, inputs are not, no interrupts. Mode 1: Port A and Port B each use three ' +
            'Port C lines for the handshake; inputs and outputs are latched and interrupts are supported. Mode 2: ' +
            'Port A only, bidirectional, using five Port C lines; interrupts are supported.',
          'Example 1 -- Port A input (mode 1), Port B output (mode 0), C upper input, C lower output: ' +
            '1 01 1 1 0 0 0 = B8h.',
          { kind: 'code', text: 'MOV AL, 0B8h\nOUT 83h, AL' },
          'Example 2 -- A output (mode 0), B input (mode 0), C upper output, C lower input: 83h. Then send 55h to ' +
            'Port A, read Port B and set PC3 with a BSR word:',
          {
            kind: 'code',
            text:
              'MOV AL, 83h     ; 1000 0011\n' +
              'OUT 83h, AL\n' +
              'MOV AL, 55h\n' +
              'OUT 80h, AL     ; Port A = 0101 0101\n' +
              'IN  AL, 81h     ; read Port B\n' +
              'MOV AL, 07h     ; BSR: 0 000 011 1 -> set PC3\n' +
              'OUT 83h, AL',
          },
          'Build a few control words below, then check them against the tables: click the bits, or type a value ' +
            'such as 83h to see what it configures.',
        ],
        interactive: 'ppi-control-word',
        notes: [
          'This simulator only runs Mode 0. A Mode 1 or Mode 2 word is accepted and decoded, but the ports keep ' +
            'behaving as in Mode 0 and the Devices panel says so.',
        ],
      },
      {
        id: 'ppi-8255-bsr',
        title: 'Bit Set/Reset (BSR) Mode',
        summary: 'Turn one Port C bit on or off without touching the other seven.',
        content: [
          'A control word with D7 = 0 is a Bit Set/Reset word. It does not change any port\'s mode; it sets or ' +
            'resets exactly one bit of Port C. D6–D4 are don\'t care, D3–D1 select the bit (000 = PC0 … 111 = PC7) ' +
            'and D0 says what to do with it: 1 = set, 0 = reset.',
          {
            kind: 'table',
            head: ['Word', 'Binary', 'Effect'],
            rows: [
              ['07h', '0 000 011 1', 'set PC3'],
              ['06h', '0 000 011 0', 'reset PC3'],
              ['0Bh', '0 000 101 1', 'set PC5'],
              ['0Fh', '0 000 111 1', 'set PC7'],
            ],
          },
          'Writing Port C directly (OUT 82h, AL) replaces all eight bits at once. A BSR word changes one bit, so ' +
            'separate devices on Port C -- an alarm LED here, a relay there -- can be switched without reading ' +
            'Port C first.',
          'Build BSR words below and send them: watch only the selected Port C bit change.',
        ],
        interactive: 'ppi-bsr',
        notes: ['BSR words only touch Port C. Ports A and B have no bit set/reset.'],
      },
    ],
  },
]
