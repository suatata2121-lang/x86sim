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

MOV AH, 4Ch
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
]
