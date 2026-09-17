import type { TestCase } from './core/grader'

// Every assignment ends its starter code with the standard DOS-exit sequence
// (MOV AH,4Ch / INT 21h). That sequence overwrites AH — and therefore the
// upper half of AX — right before the program halts. So no assignment's test
// cases ever check AX or AH; the task always asks for the result in a
// different register (BX/CX/DX/...) or in memory/ports/output, which survive
// the halt sequence intact.

export interface Assignment {
  id: string
  title: string
  /** A short teaching note shown above the starter code, before the task. */
  concept: string
  starterSource: string
  testCases: TestCase[]
}

export interface Task {
  id: string
  /** e.g. "Task 1 - Basic Assignment (MOV)" */
  title: string
  /** The real-world scenario framing shown above the assignment list. */
  scenario: string
  assignments: Assignment[]
}

export interface Stage {
  id: string
  /** e.g. "Stage 1: Introduction to CPU Architecture & Data Movement" */
  title: string
  summary: string
  tasks: Task[]
}

export const CURRICULUM: Stage[] = [
  {
    id: 'stage-1',
    title: 'Stage 1: Introduction to CPU Architecture & Data Movement',
    summary: 'Students should grasp the basic building blocks of hardware and how data moves through it.',
    tasks: [
      {
        id: 'task-1-mov',
        title: 'Task 1 - Basic Assignment (MOV)',
        scenario: 'Loading reference values assumed to be read from a sensor (e.g. a 16-bit temperature reading) into registers.',
        assignments: [
          {
            id: 't1-sensor-registers',
            title: 'Loading a Temperature Reading into Registers',
            concept:
              'MOV copies a constant or another register\'s value into a register without touching the source at ' +
              'all. The same 16-bit value can be written as hex (0F0h) or decimal (240) — both represent the same ' +
              'bits, just a different notation.',
            starterSource: `; Task 1: Basic Assignment (MOV)
; The raw value read from a temperature sensor is 240 (hex: 0F0h).
; Load this value into AX as HEX, and the same value into BX as DECIMAL.
; Then copy AX into CX (MOV doesn't touch its source -- AX should stay unchanged).

; TODO: write your code here

MOV AH, 4Ch
INT 21h
`,
            testCases: [
              { name: 'BX = 240 (decimal)', expect: { regs: { BX: 240 } } },
              { name: 'CX = copy of AX = 240 (if AX was loaded correctly via hex)', expect: { regs: { CX: 240 } } },
            ],
          },
        ],
      },
      {
        id: 'task-2-xchg',
        title: 'Task 2 - Data Swap (XCHG)',
        scenario: 'Swapping the data between two registers directly, without using a third variable or memory location.',
        assignments: [
          {
            id: 't2-swap-readings',
            title: 'Swapping the Old and New Reading',
            concept:
              'In most languages, swapping two variables needs a third temporary variable. XCHG does this in a ' +
              'single instruction, without memory or an extra register.',
            starterSource: `; Task 2: Data Swap (XCHG)
; BX holds the old sensor reading (10), CX holds the new one (25).
; Swap the contents of BX and CX using XCHG -- don't use any other
; register or memory location.
MOV BX, 10
MOV CX, 25

; TODO: swap BX and CX with XCHG

MOV AH, 4Ch
INT 21h
`,
            testCases: [
              { name: 'BX = 25 (new reading), CX = 10 (old reading)', expect: { regs: { BX: 25, CX: 10 } } },
            ],
          },
        ],
      },
      {
        id: 'task-3-memory',
        title: 'Task 3 - Memory Access',
        scenario: 'Writing a register\'s value directly to a specific address in memory (RAM), then reading it back into another register.',
        assignments: [
          {
            id: 't3-snapshot',
            title: 'Backing Up a Register Value to Memory',
            concept:
              'A single labeled memory location (declared with DW/DB) can be thought of as a one-element array: ' +
              'you can write to that address with [LABEL], and read the same address back into another register.',
            starterSource: `; Task 3: Memory Access
; AX holds a temperature reading (500). Write this value directly to the
; SNAPSHOT location in memory, then read SNAPSHOT back into BX.
SNAPSHOT DW 0
MOV AX, 500

; TODO: write AX to SNAPSHOT, then read SNAPSHOT into BX

MOV AH, 4Ch
INT 21h
`,
            testCases: [
              {
                name: 'SNAPSHOT written to memory, BX read back',
                expect: { memory: [{ label: 'SNAPSHOT', size: 'word', equals: 500 }], regs: { BX: 500 } },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'stage-2',
    title: 'Stage 2: Arithmetic, Logic, and Control Flow',
    summary: 'This stage builds ALU (Arithmetic Logic Unit) usage and the program\'s ability to make decisions.',
    tasks: [
      {
        id: 'task-4-cmp-jumps',
        title: 'Task 4 - Threshold Check (CMP & Jumps)',
        scenario:
          'Comparing data read from two different addresses (e.g. water quality or turbidity levels). If the ' +
          'reading is at or below the set limit, continue the normal flow (JBE); if it\'s above, jump to an ' +
          '"alarm" labeled routine (JA).',
        assignments: [
          {
            id: 't4-turbidity-normal',
            title: 'Turbidity Check — Normal Range',
            concept:
              'CMP subtracts two values but discards the result, only updating the flags. JA/JBE read those flags ' +
              'as unsigned numbers — the right choice for sensor readings, which are always non-negative.',
            starterSource: `; Task 4: Threshold Check (CMP & Jumps)
; TURBIDITY (the current reading) and LIMIT (the threshold) are defined
; in memory. If TURBIDITY is greater than LIMIT (JA), write 1 (alarm) to
; DX; otherwise (JBE) write 0 (normal) to DX.
TURBIDITY DB 30
LIMIT DB 50
MOV DX, 99   ; sentinel: your code must actually set this to 0 or 1

; TODO: compare TURBIDITY to LIMIT, then set DX accordingly

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'TURBIDITY(30) <= LIMIT(50) -> DX = 0 (normal)', expect: { regs: { DX: 0 } } }],
          },
          {
            id: 't4-turbidity-alarm',
            title: 'Turbidity Check — Alarm Range',
            concept:
              'We test the same logic with a reading that exceeds the threshold — both branches of the code ' +
              '(normal and alarm) need to be verified separately.',
            starterSource: `; Task 4: Threshold Check (CMP & Jumps)
; This time TURBIDITY exceeds LIMIT. Apply the same logic: if TURBIDITY
; is greater than LIMIT (JA), write 1 (alarm) to DX; otherwise (JBE)
; write 0 (normal) to DX.
TURBIDITY DB 75
LIMIT DB 50
MOV DX, 99   ; sentinel: your code must actually set this to 0 or 1

; TODO: compare TURBIDITY to LIMIT, then set DX accordingly

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'TURBIDITY(75) > LIMIT(50) -> DX = 1 (alarm)', expect: { regs: { DX: 1 } } }],
          },
        ],
      },
      {
        id: 'task-5-bitmask',
        title: 'Task 5 - Bit Masking (AND, OR, XOR, SHL, SHR)',
        scenario: 'Isolating and reading only bits 3 and 4 of the status flags coming from a communication module (e.g. NMEA data packets).',
        assignments: [
          {
            id: 't5-status-bits',
            title: 'Extracting a Bit Field from NMEA Status Flags',
            concept:
              'AND with a mask keeps only the wanted bits "alive" and zeroes out the rest. SHR then shifts those ' +
              'bits down to bit 0, so they read as a plain number.',
            starterSource: `; Task 5: Bit Masking (AND, OR, XOR, SHL, SHR)
; STATUS is an 8-bit status flag from a communication module: 00111000b (38h).
; Extract bits 3 and 4 (a 2-bit field) into AL as a plain number (0-3):
; first mask with 00011000b (18h), then shift right by 3.
STATUS DB 38h

; TODO: read STATUS, mask with 18h, shift right by 3, result in AL

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'AL = (STATUS & 18h) >> 3 = 3', expect: { regs: { AL: 3 } } }],
          },
        ],
      },
    ],
  },
  {
    id: 'stage-3',
    title: 'Stage 3: Loops, Stack, and Subroutines',
    summary: 'The level where code becomes modular and repetitive operations get optimized.',
    tasks: [
      {
        id: 'task-6-loop-arrays',
        title: 'Task 6 - Array Operations (LOOP & Index Registers)',
        scenario:
          'Reading 10 consecutive data points laid out in memory (e.g. sequential coordinate readings along a ' +
          'route) in a loop using SI and DI (Source/Destination Index), and summing them.',
        assignments: [
          {
            id: 't6-route-sum',
            title: 'Summing Route Coordinates',
            concept:
              'An array is just consecutive cells in memory. Starting SI at 0 and incrementing it by 1 each pass, ' +
              '[LABEL+SI] reaches successive elements of the array; LOOP repeats this until CX reaches zero.',
            starterSource: `; Task 6: Array Operations (LOOP & Index Registers)
; READINGS holds 10 consecutive coordinate readings along a route.
; Index them all with SI and sum them in a LOOP, writing the result to BX.
; (Use BX, not AX -- MOV AH,4Ch below overwrites AX's high byte.)
READINGS DB 5, 10, 15, 20, 25, 30, 35, 40, 45, 50

; TODO: sum READINGS[0..9] into BX

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'Sum(5..50, 10 elements) = 275', expect: { regs: { BX: 275 } } }],
          },
        ],
      },
      {
        id: 'task-7-call-stack',
        title: 'Task 7 - Subroutines (CALL/RET) and the Stack (PUSH/POP)',
        scenario:
          'Modularizing the averaging operation as a separate PROC (procedure). Developing PUSH/POP routines so ' +
          'the current register values aren\'t corrupted when the main program calls this procedure.',
        assignments: [
          {
            id: 't7-average-proc',
            title: 'An Averaging Procedure',
            concept:
              'CALL automatically pushes the return address onto the stack when jumping to a procedure; RET pops ' +
              'it back and resumes. But the registers you use inside the procedure can clash with the caller\'s ' +
              'registers — PUSH them on entry, and POP them back (right before RET) on exit.',
            starterSource: `; Task 7: Subroutines (CALL/RET) and the Stack (PUSH/POP)
; The AVERAGE procedure must write the integer average (sum/10) of
; READINGS (the same 10 values from Task 6) into BX -- but it must NOT
; disturb the caller's AX or CX.
; main loads AX=999 and CX=888 (sentinels) before the call; after the
; call, both must still be 999 and 888 (if PUSH/POP were done right).
READINGS DB 5, 10, 15, 20, 25, 30, 35, 40, 45, 50

MOV AX, 999
MOV CX, 888
CALL AVERAGE
MOV DI, AX   ; capture AX's post-call value (for grading) -- provided
MOV DX, CX   ; capture CX's post-call value (for grading) -- provided

MOV AH, 4Ch
INT 21h

AVERAGE PROC
  ; TODO: PUSH AX and CX, compute sum/10 into BX, POP AX and CX, RET
  RET
AVERAGE ENDP
`,
            testCases: [
              {
                name: 'BX = 27 (average), AX/CX preserved across the call (via DI/DX)',
                expect: { regs: { BX: 27, DI: 999, DX: 888 } },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'stage-4',
    title: 'Stage 4: Hardware Communication and Advanced I/O',
    summary: 'The final stage, where assembly interacts directly with the outside world.',
    tasks: [
      {
        id: 'task-8-io-ports',
        title: 'Task 8 - Port Control (IN / OUT)',
        scenario: 'Sending bit patterns via OUT that set direction and speed on an autonomous motor driver.',
        assignments: [
          {
            id: 't8-stepper-command',
            title: 'Sending a Command to the Stepper Motor',
            concept:
              'OUT writes a byte from AL/AX directly to a hardware port. In this simulator, port 41h drives the ' +
              'virtual stepper motor; it expects a 4-bit coil code (0110b = 06h is one valid step).',
            starterSource: `; Task 8: Port Control (IN / OUT)
; The stepper motor takes commands via port 41h. The code 0110b (06h) is
; one step command. Load this value into AL and OUT it to port 41h.

; TODO: load 06h into AL, OUT it to port 41h

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'Port 41h = 06h (step command)', expect: { ports: [{ port: 0x41, equals: 0x06 }] } }],
          },
        ],
      },
      {
        id: 'task-9-interrupts',
        title: 'Task 9 - Interrupts',
        scenario:
          'Printing system status to the screen as text using software interrupts like INT 21h. (This simulator ' +
          'supports INT 21h/DOS interrupts; hardware interrupts and INT 10h/BIOS are not modeled.)',
        assignments: [
          {
            id: 't9-print-status',
            title: 'Printing System Status to the Screen',
            concept:
              'INT 21h requests a service from DOS based on the function number in AH. AH=09h prints the string ' +
              'starting at the address DX points to, up to the "$" character.',
            starterSource: `; Task 9: Interrupts
; Print STATUS_MSG to the screen with INT 21h, AH=09h. The output must be
; exactly "SYSTEM OK" (the $ is a string terminator and isn't printed).
STATUS_MSG DB 'SYSTEM OK$'

; TODO: load STATUS_MSG into DX, AH=9, INT 21h

MOV AH, 4Ch
INT 21h
`,
            testCases: [{ name: 'Output = "SYSTEM OK"', expect: { output: { equals: 'SYSTEM OK' } } }],
          },
        ],
      },
    ],
  },
]
