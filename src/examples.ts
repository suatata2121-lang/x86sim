export interface Example {
  id: string
  title: string
  description: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    id: 'hello',
    title: 'Hello, World',
    description: 'The simplest example: defines a DB string and prints it with INT 21h AH=09.',
    source: `; Hello, World - the simplest example
MSG DB 'Hello, World!$'

MOV AH, 9
MOV DX, MSG
INT 21h

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'arithmetic',
    title: 'Arithmetic',
    description: 'Basic register arithmetic with MOV, ADD, SUB. Use "Step" to watch AX change.',
    source: `; Basic arithmetic: adds and subtracts two numbers
MOV AX, 25
MOV BX, 17
ADD AX, BX      ; AX = 42
SUB AX, 5       ; AX = 37
MOV CX, AX      ; copy the result into CX

MOV AH, 4Ch     ; exit to DOS: this overwrites AH, so AX changes from 0025h to 4C25h
INT 21h
`,
  },
  {
    id: 'counting-loop',
    title: 'Counting Loop',
    description: 'Prints the digits 1 to 5 using the LOOP instruction.',
    source: `; Prints the numbers 1 through 5
MOV CX, 5
MOV DL, '1'
COUNTLOOP:
MOV AH, 2
INT 21h
INC DL
LOOP COUNTLOOP

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'array-sum',
    title: 'Array Sum (Memory Addressing)',
    description: 'Defines a byte array and a string with DB; walks the array with [NUMS+SI] to sum it, then prints the result together with the string.',
    source: `; Sums the bytes in an array; a data-segment + memory-addressing example
MSG DB 'Result: $'
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
`,
  },
  {
    id: 'bitwise',
    title: 'Bitwise Operations',
    description: 'Applies AND, OR, XOR, NOT, SHL, SHR in sequence; use "Step" to watch AL/BL change.',
    source: `; AND/OR/XOR/NOT/SHL/SHR examples
MOV AL, 0F0h
AND AL, 0FFh    ; AL = F0h
OR AL, 0Fh      ; AL = FFh
XOR AL, 0FFh    ; AL = 00h
MOV BL, AL      ; BL = 00h (for verification)

MOV AL, 05h
SHL AL, 1       ; AL = 0Ah
SHR AL, 1       ; AL = 05h
NOT AL          ; AL = FAh

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'muldiv',
    title: 'Multiplication and Division',
    description: 'MUL computes 6*7, then DIV computes 42/5 (quotient and remainder end up in AL/AH).',
    source: `; Multiplication and division: 6*7=42, then 42/5 (quotient 8, remainder 2)
MOV AL, 6
MOV BL, 7
MUL BL          ; AX = 42

MOV BL, 5
DIV BL          ; AL = quotient (8), AH = remainder (2)

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'call-ret',
    title: 'Subroutine (CALL/RET)',
    description: 'Calls a subroutine named ADDFIVE three times with CALL, returning with RET.',
    source: `; Calls the ADDFIVE subroutine three times (CALL/RET)
MOV AX, 0
CALL ADDFIVE
CALL ADDFIVE
CALL ADDFIVE     ; AX = 15

MOV AH, 4Ch
INT 21h

ADDFIVE:
ADD AX, 5
RET
`,
  },
  {
    id: 'max-of-two',
    title: 'Finding the Maximum',
    description: 'Finds the larger of two numbers using CMP and JG; a good introduction to conditional jumps.',
    source: `; Finds the larger of two numbers (CMP + conditional jump)
MOV AX, 37
MOV BX, 52
CMP AX, BX
JG GREATER
MOV CX, BX      ; if BX is larger, CX = BX
JMP DONE
GREATER:
MOV CX, AX      ; if AX is larger, CX = AX
DONE:

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'keyboard-echo',
    title: 'Keyboard Input',
    description: 'Reads a line of up to 10 characters with INT 21h AH=0Ah, then echoes it back one character at a time with AH=02.',
    source: `; Reads a line of up to 10 characters from the keyboard, then echoes it back
BUF DB 10, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?

MOV DX, BUF
MOV AH, 0Ah
INT 21h

MOV CL, [BUF+1]   ; the actual length DOS wrote
MOV CH, 0
MOV SI, 0
PRINTLOOP:
CMP SI, CX
JE DONE
MOV DL, [BUF+2+SI]
MOV AH, 2
INT 21h
INC SI
JMP PRINTLOOP
DONE:

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'base-index',
    title: 'Base+Index Addressing',
    description: 'Accesses a table via [TABLE+BX+SI], using a base (BX/BP) and an index (SI/DI) register at the same time.',
    source: `; Base+index addressing: accesses a table via [TABLE+BX+SI]
; Think of TABLE as 3 rows x 2 columns: each row is 2 bytes
TABLE DB 10, 20, 30, 40, 50, 60

MOV BX, 4       ; start offset of row 3 (0-based: row 2)
MOV SI, 1       ; column 2 of that row
MOV AL, [TABLE+BX+SI]   ; TABLE[4+1] = TABLE[5] = 60

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'endian-store',
    title: 'Little-Endian Store',
    description: 'Stores the word 1234h in memory, then reads its two bytes back: the low byte 34h sits at the lower address.',
    source: `; Little-endian: the low byte goes to the lower address
VALUE DW 0
MOV AX, 1234h
MOV [VALUE], AX     ; memory shows 34 12, not 12 34
MOV BX, OFFSET VALUE
MOV AL, [BX]        ; AL = 34h, the low byte
MOV AH, [BX+1]      ; AH = 12h, the high byte
HLT
`,
  },
  {
    id: 'stack-trace',
    title: 'Stack Trace (PUSH / POP Bytes)',
    description: 'The lecture-slide stack example: three PUSHes and a POP, so you can watch SP move by 2 and each word land low byte first.',
    source: `; Slide example: watch SP and the stack bytes
MOV SP, 1236h
MOV AX, 24B6h
MOV DI, 85C2h
MOV DX, 5F93h
PUSH AX        ; SP = 1234h, bytes B6 24
PUSH DI        ; SP = 1232h, bytes C2 85
PUSH DX        ; SP = 1230h, bytes 93 5F
POP AX         ; AX = 5F93h, SP = 1232h
HLT
`,
  },
  {
    id: 'traffic-light',
    title: 'Virtual Device: Traffic Light',
    description: 'Cycles a virtual traffic light (port 40h) through red, red+yellow, green, yellow forever. Use "Animate" to watch it change, "Stop" to end it.',
    source: `; Cycles a virtual traffic light connected to port 40h.
; bit0 = red, bit1 = yellow, bit2 = green
MOV DX, 40h

CYCLE:
MOV AL, 1        ; red
OUT DX, AL
CALL DELAY

MOV AL, 3         ; red + yellow
OUT DX, AL
CALL DELAY

MOV AL, 4         ; green
OUT DX, AL
CALL DELAY

MOV AL, 2         ; yellow
OUT DX, AL
CALL DELAY

JMP CYCLE

DELAY:
MOV CX, 5
DELAYLOOP:
LOOP DELAYLOOP
RET
`,
  },
  {
    id: 'stepper-motor',
    title: 'Virtual Device: Stepper Motor',
    description: 'Spins a virtual stepper motor (port 41h) through three full rotations by writing a 4-step coil pattern.',
    source: `; Rotates a virtual stepper motor connected to port 41h through a
; 4-step coil sequence - each full pass through it is one 360 degree turn.
MOV DX, 41h
MOV CX, 3        ; three full rotations

TURN:
MOV AL, 03h
OUT DX, AL
MOV AL, 06h
OUT DX, AL
MOV AL, 0Ch
OUT DX, AL
MOV AL, 09h
OUT DX, AL
LOOP TURN

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'seven-segment',
    title: 'Virtual Device: 7-Segment Display',
    description: 'Counts 0 through 9 on a virtual 7-segment display (port 42h) by writing each digit\'s segment pattern.',
    source: `; Counts 0-9 on a virtual 7-segment display connected to port 42h.
; Each byte below is the standard a-g segment bit pattern for one digit.
DIGITS DB 3Fh, 06h, 5Bh, 4Fh, 66h, 6Dh, 7Dh, 07h, 7Fh, 6Fh

MOV DX, 42h
MOV CX, 10
MOV SI, 0

COUNTLOOP:
MOV AL, [DIGITS+SI]
OUT DX, AL
INC SI
CALL DELAY
LOOP COUNTLOOP

MOV AH, 4Ch
INT 21h

DELAY:
MOV BX, 3
DELAYLOOP:
DEC BX
JNE DELAYLOOP
RET
`,
  },
  {
    id: 'thermometer',
    title: 'Virtual Device: Thermometer',
    description: 'Sweeps a virtual thermometer (port 43h) from 0 to 20 degrees, one degree at a time.',
    source: `; Sweeps a virtual thermometer connected to port 43h from 0 to 20 degrees.
MOV DX, 43h
MOV AL, 0
MOV CX, 21

TEMPLOOP:
OUT DX, AL
INC AL
CALL DELAY
LOOP TEMPLOOP

MOV AH, 4Ch
INT 21h

DELAY:
MOV BX, 2
DELAYLOOP:
DEC BX
JNE DELAYLOOP
RET
`,
  },
  {
    id: 'ppi-switches',
    title: '8255: switches to display',
    description: 'Programs the 8255 (ports 80h-83h) with Port A as input and Port B as output, then keeps copying the low four switches to the BCD display. Use "Animate" and flip the switches; "Stop" ends it.',
    source: `; 8255 at 80h-83h: Port A = switches (input), Port B = display (output)
MOV AL, 90h      ; 1 00 1 0 0 0 0: I/O mode, A in (mode 0), B out, C out
OUT 83h, AL
again:
IN  AL, 80h      ; read the switches
AND AL, 0Fh      ; keep the low four
OUT 81h, AL      ; show them on the 7-segment (BCD)
JMP again
`,
  },
  {
    id: 'string-copy',
    title: 'String Copy (REP MOVSB)',
    description: 'Copies a string into a separate buffer with REP MOVSB, then prints the copy to prove the bytes were actually moved.',
    source: `; Copies a string using REP MOVSB, then prints the copy from a
; separate buffer to prove the bytes were actually moved.
SRC DB 'Copied!$'
DST DB ?, ?, ?, ?, ?, ?, ?, ?

MOV SI, SRC
MOV DI, DST
MOV CX, 8
CLD              ; DF=0: SI/DI count up
REP MOVSB

MOV DX, DST
MOV AH, 9
INT 21h

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'xchg-neg-test',
    title: 'XCHG, NEG, TEST, Unsigned Jumps',
    description: 'Swaps two registers with XCHG, negates a value with NEG, checks a bit with TEST, and compares unsigned with JA.',
    source: `; Demonstrates XCHG, NEG, TEST, and an unsigned conditional jump (JA)
MOV AX, 5
MOV BX, 250
XCHG AX, BX      ; AX=250, BX=5

CMP AX, BX
JA ABOVE         ; unsigned: 250 > 5, so this jumps
MOV CX, 0        ; (not taken)
JMP CHECKNEG
ABOVE:
MOV CX, 1        ; CX=1 confirms AX was above BX
CHECKNEG:

MOV DX, 7
NEG DX           ; DX = -7, stored as 0FFF9h (two's complement)

TEST AX, 1       ; AX (250) is even, so this sets ZF without changing AX

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'masm-boilerplate',
    title: 'MASM-Style PUSH/POP',
    description: 'A textbook-style program with .MODEL/.STACK/.DATA/.CODE segment directives, showing they assemble and run unchanged here.',
    source: `; 8086 Assembly - basic PUSH/POP example
; Compiler: MASM/TASM (16-bit)

.MODEL SMALL
.STACK 100H          ; reserve 256 bytes of stack

.DATA
    num1 DW 1234h
    num2 DW 5678h
    result DW ?

.CODE
START:
    MOV AX, @DATA
    MOV DS, AX

    ; --- save register values ---
    MOV AX, 1111h
    MOV BX, 2222h
    MOV CX, 3333h

    PUSH AX          ; AX pushed onto the stack (SP = SP - 2)
    PUSH BX          ; BX pushed
    PUSH CX          ; CX pushed

    ; clobber the registers to prove the restore works
    MOV AX, 0
    MOV BX, 0
    MOV CX, 0

    ; --- restore (LIFO: last in, first out) ---
    POP CX           ; CX = 3333h
    POP BX           ; BX = 2222h
    POP AX           ; AX = 1111h

    ; end of program
    MOV AH, 4Ch
    INT 21h

END START
`,
  },
]
