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
          'The diagram below is the same Data Bus view used elsewhere in this simulator. Press Step and watch ' +
            'which box lights up: REG for a register-to-register move, ALU for an arithmetic operation, and a ' +
            'pulse toward MEMORY when an instruction reads or writes a memory operand.',
        ],
        demo: {
          visual: 'databus',
          source:
            'RESULT DW 0\n' +
            'MOV AX, 5        ; reg: load an immediate into a register\n' +
            'MOV BX, AX       ; reg: register-to-register move\n' +
            'ADD AX, BX       ; alu: the ALU computes AX + BX\n' +
            'MOV [RESULT], AX ; mem-write: the result is written out to memory\n' +
            'MOV CX, [RESULT] ; mem-read: and read back into another register\n' +
            'HLT\n',
        },
      },
      {
        id: 'register-file',
        title: 'Register File',
        summary: 'The small set of fast storage locations inside the CPU itself.',
        content: [
          'AX, BX, CX, DX, SI, DI, BP, and SP are the general-purpose 16-bit registers this simulator models ' +
            '(DS/ES/SS/CS also exist but this simulator has no real segmentation, so they stay 0 -- see ' +
            '"Segmented Addressing" below). AX-DX can also be addressed as two independent 8-bit halves each ' +
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
          'Notice the ALU box lights up for every one of these instructions below, never the MEMORY box -- all ' +
            'of them work purely on registers and immediates.',
        ],
        demo: {
          visual: 'databus',
          source:
            'MOV AX, 12\n' +
            'MOV BX, 5\n' +
            'ADD AX, BX\n' +
            'SUB AX, BX\n' +
            'AND AX, 0Fh\n' +
            'OR AX, 30h\n' +
            'XOR AX, AX\n' +
            'NOT BX\n' +
            'INC BX\n' +
            'DEC BX\n' +
            'HLT\n',
        },
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
          'FLAGS itself is not five separate switches -- it\'s one more 16-bit register, exactly like AX or IP, ' +
            'and each flag is just one bit within it at a fixed position: CF is bit 0, ZF is bit 6, SF is bit 7, ' +
            'DF is bit 10, and OF is bit 11. The FLAGS row below shows that same register as a whole -- watch ' +
            'its hex/decimal/binary value change as the individual flag bits below it flip between 0 and 1.',
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
          'A real 8086 also has PF, AF, TF, and IF bits (plus a permanently-set reserved bit 1) packed into the ' +
            'same FLAGS register -- this simulator doesn\'t model them, so those bits always read as 0 here.',
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
          'Besides memory, the 8086 has a completely separate 256-port I/O address space, reached only through ' +
            'IN and OUT. OUT writes a byte from AL (or a word from AX) to a port; IN reads one back. Real ' +
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
