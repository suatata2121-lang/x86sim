// Reference data for the Learn tab's "Instruction Reference" section.
// Every mnemonic the simulator recognizes (see MNEMONICS in
// components/asmLanguage.ts) is documented here, grouped by category, with
// the exact semantics this simulator implements (src/core/cpu.ts) rather
// than generic textbook x86 behavior -- the two occasionally differ (see
// the notes on flags below).

export interface InstructionDoc {
  /** All mnemonics that resolve to this entry (aliases share one doc). */
  mnemonics: string[]
  /** e.g. "MOV dest, src" */
  syntax: string
  /** One-line summary shown in the instruction list. */
  summary: string
  /** Full explanation of what it does, specific to this simulator. */
  description: string
  /** Flags this instruction updates, or "none". */
  flags: string
  /** A small, focused code snippet demonstrating the instruction. */
  example: string
  /** What the example demonstrates / the resulting state. */
  exampleNote: string
  /** Extra caveats, gotchas, or simulator-specific limitations. */
  notes?: string[]
}

export interface InstructionCategory {
  id: string
  title: string
  instructions: InstructionDoc[]
}

export const INSTRUCTION_REFERENCE: InstructionCategory[] = [
  {
    id: 'data-transfer',
    title: 'Data Transfer',
    instructions: [
      {
        mnemonics: ['MOV'],
        syntax: 'MOV dest, src',
        summary: 'Copy a value into a register or memory location.',
        description:
          'Copies the value of src into dest without modifying src at all. dest can be a register or a memory ' +
          'location; src can be a register, an immediate number, a memory location, or a bare label. A bare label ' +
          '(or OFFSET label) as src loads that label\'s address, not the value stored there -- to load the value, ' +
          'wrap it in brackets: MOV AX, [LABEL].',
        flags: 'none',
        example:
          'MOV AX, 0F0h      ; AX = 240 (hex -- needs a leading 0 since it starts with a letter)\n' +
          'MOV BX, 240       ; BX = 240 (same value, written in decimal)\n' +
          'MOV CX, AX        ; CX = 240 (copy of AX -- AX itself is untouched)',
        exampleNote: 'AX, BX, and CX all end up holding 240.',
      },
      {
        mnemonics: ['XCHG'],
        syntax: 'XCHG op1, op2',
        summary: 'Swap two operands in a single instruction.',
        description:
          'Swaps the contents of op1 and op2. At least one of them must be a register. Where another language ' +
          'needs a third temporary variable to swap two values, XCHG does it directly, without touching memory ' +
          'or any other register.',
        flags: 'none',
        example: 'MOV BX, 10\nMOV CX, 25\nXCHG BX, CX   ; BX = 25, CX = 10',
        exampleNote: 'BX and CX end up swapped.',
      },
      {
        mnemonics: ['LEA'],
        syntax: 'LEA dest, src',
        summary: "Load an address, not the value stored there.",
        description:
          'Loads the address that src refers to into dest (a register), rather than dereferencing it. src is ' +
          'either a bracketed memory expression ([SI+4]) or a bare label. In this simulator, LEA reg, LABEL and ' +
          'MOV reg, LABEL (or MOV reg, OFFSET LABEL) all do exactly the same thing.',
        flags: 'none',
        example: "MSG DB 'HI$'\nLEA DX, MSG    ; DX = address of MSG\nMOV AH, 9\nINT 21h        ; prints \"HI\"",
        exampleNote: 'DX holds the address of MSG, which AH=09h then prints.',
      },
      {
        mnemonics: ['PUSH'],
        syntax: 'PUSH src',
        summary: "Save a 16-bit value on top of the stack.",
        description:
          'Decrements SP by 2, then writes src\'s 16-bit value to memory at [SP]. Used to save a register before ' +
          'it gets overwritten, or to stash values across a CALL.',
        flags: 'none',
        example: 'PUSH AX   ; save AX on the stack\nMOV AX, 0 ; now AX is free to reuse\nPOP AX    ; restore the original AX',
        exampleNote: "AX ends up back to whatever it held before the PUSH.",
      },
      {
        mnemonics: ['POP'],
        syntax: 'POP dest',
        summary: 'Restore the most recently pushed 16-bit value.',
        description:
          'Reads the 16-bit value at [SP] into dest, then increments SP by 2. The stack is LIFO (last in, first ' +
          'out), so POPs must undo PUSHes in reverse order.',
        flags: 'none',
        example: 'PUSH AX\nPUSH BX\nPOP BX     ; get BX back first...\nPOP AX     ; ...then AX, in reverse order',
        exampleNote: 'Popping in reverse order restores both registers correctly.',
        notes: ['POPping in the same order they were PUSHed (instead of reverse) swaps their values by mistake.'],
      },
    ],
  },
  {
    id: 'arithmetic',
    title: 'Arithmetic',
    instructions: [
      {
        mnemonics: ['ADD'],
        syntax: 'ADD dest, src',
        summary: 'dest = dest + src',
        description: 'Adds src to dest and stores the result back in dest.',
        flags: 'ZF, SF, CF',
        example: 'MOV AX, 5\nADD AX, 3   ; AX = 8',
        exampleNote: 'AX becomes 8; ZF=0 and CF=0 since the result is nonzero and fits in 16 bits.',
        notes: [
          "This simulator's ADD/SUB/CMP/INC/DEC/NEG never update OF (it's only ever changed by MUL/AND/OR/XOR/TEST/SHL/SHR). " +
            'So the signed conditional jumps (JG/JL/JGE/JLE) are only reliable when the true difference does not actually ' +
            "overflow a signed range -- for values that might, or for values that are never negative to begin with, prefer " +
            'the unsigned jumps (JA/JAE/JB/JBE).',
        ],
      },
      {
        mnemonics: ['SUB'],
        syntax: 'SUB dest, src',
        summary: 'dest = dest - src',
        description: 'Subtracts src from dest and stores the result back in dest.',
        flags: 'ZF, SF, CF',
        example: 'MOV AX, 8\nSUB AX, 3   ; AX = 5',
        exampleNote: 'AX becomes 5.',
      },
      {
        mnemonics: ['CMP'],
        syntax: 'CMP op1, op2',
        summary: 'Compare two values by subtracting, without keeping the result.',
        description:
          'Computes op1 - op2 purely to update the flags -- neither operand changes. Almost always followed by a ' +
          'conditional jump that reads those flags.',
        flags: 'ZF, SF, CF',
        example: 'CMP AX, 50\nJA ABOVE_LIMIT   ; jump taken if AX > 50 (unsigned)',
        exampleNote: 'No register changes; only the flags are affected, which JA then reads.',
      },
      {
        mnemonics: ['INC'],
        syntax: 'INC dest',
        summary: 'dest = dest + 1',
        description: 'Adds 1 to dest.',
        flags: 'ZF, SF, CF',
        example: 'MOV CX, 9\nINC CX   ; CX = 10',
        exampleNote: 'CX becomes 10.',
        notes: ['On real x86, INC/DEC leave CF unchanged -- this simulator\'s simplified model updates it like ADD/SUB do.'],
      },
      {
        mnemonics: ['DEC'],
        syntax: 'DEC dest',
        summary: 'dest = dest - 1',
        description: 'Subtracts 1 from dest.',
        flags: 'ZF, SF, CF',
        example: 'MOV CX, 1\nDEC CX   ; CX = 0, ZF = 1',
        exampleNote: 'CX becomes 0 and ZF is set, which JCXZ or JE/JZ could then act on.',
      },
      {
        mnemonics: ['MUL'],
        syntax: 'MUL src',
        summary: 'Unsigned multiply: AL or AX times src.',
        description:
          'Unsigned multiplication. If src is a byte, AL * src is stored in AX. If src is a word, AX * src is ' +
          'stored across DX:AX (DX gets the high 16 bits, AX the low 16 bits). CF and OF are both set together if ' +
          'the product does not fit back in the lower half alone (AH nonzero for a byte multiply, or DX nonzero ' +
          'for a word multiply).',
        flags: 'CF, OF',
        example: 'MOV AL, 20\nMOV BL, 6\nMUL BL     ; AX = 120, CF = 0, OF = 0 (fits in AL)',
        exampleNote: 'AX = 120 fits entirely in the low byte, so no overflow is flagged.',
      },
      {
        mnemonics: ['DIV'],
        syntax: 'DIV src',
        summary: 'Unsigned divide: AX or DX:AX by src.',
        description:
          'Unsigned division. If src is a byte, AX / src gives a quotient in AL and a remainder in AH. If src is ' +
          'a word, DX:AX / src gives a quotient in AX and a remainder in DX. Division by zero, or a quotient that ' +
          "doesn't fit back in the destination (AL or AX), raises a runtime error and stops execution -- so clear " +
          "DX before a word DIV unless a 32-bit dividend across DX:AX is intended.",
        flags: 'none',
        example: 'MOV AX, 17\nMOV BL, 5\nDIV BL    ; AL = 3 (quotient), AH = 2 (remainder)',
        exampleNote: '17 / 5 = 3 remainder 2.',
      },
      {
        mnemonics: ['NEG'],
        syntax: 'NEG dest',
        summary: "Two's-complement negation: dest = -dest.",
        description: "Replaces dest with its two's-complement negative (0 minus dest).",
        flags: 'ZF, SF, CF',
        example: 'MOV AX, 5\nNEG AX    ; AX = 0FFFBh (-5 as a 16-bit value)',
        exampleNote: 'AX now holds the bit pattern for -5.',
      },
    ],
  },
  {
    id: 'logic',
    title: 'Logic & Bit Manipulation',
    instructions: [
      {
        mnemonics: ['AND'],
        syntax: 'AND dest, src',
        summary: 'Bitwise AND -- clear unwanted bits.',
        description:
          'dest = dest & src, bit by bit. The classic use is masking: AND with a value that has 1s only in the ' +
          'bits you want to keep clears every other bit to 0.',
        flags: 'ZF, SF (CF and OF are always cleared)',
        example: 'MOV AL, 00111000b\nAND AL, 00011000b   ; AL = 00011000b -- keeps only bits 3-4',
        exampleNote: 'Only bits 3 and 4 of AL survive; every other bit is forced to 0.',
      },
      {
        mnemonics: ['OR'],
        syntax: 'OR dest, src',
        summary: 'Bitwise OR -- force bits on.',
        description: 'dest = dest | src, bit by bit. Used to set specific bits to 1 without disturbing the others.',
        flags: 'ZF, SF (CF and OF are always cleared)',
        example: 'MOV AL, 00000001b\nOR AL, 00001000b   ; AL = 00001001b',
        exampleNote: 'Bit 3 is turned on; bit 0 (already 1) is left as is.',
      },
      {
        mnemonics: ['XOR'],
        syntax: 'XOR dest, src',
        summary: 'Bitwise exclusive-OR; XOR reg, reg zeroes a register.',
        description:
          'dest = dest ^ src, bit by bit. XORing any value with itself always produces 0, so "XOR reg, reg" is a ' +
          'common idiom for clearing a register.',
        flags: 'ZF, SF (CF and OF are always cleared)',
        example: 'XOR AX, AX   ; AX = 0',
        exampleNote: 'AX is zeroed, and ZF is set because the result is 0.',
      },
      {
        mnemonics: ['NOT'],
        syntax: 'NOT dest',
        summary: 'Bitwise complement -- flips every bit.',
        description: "Replaces dest with its one's complement (every 0 becomes 1 and every 1 becomes 0). Unlike the other logic instructions, NOT does not touch any flags.",
        flags: 'none',
        example: 'MOV AL, 00001111b\nNOT AL    ; AL = 11110000b',
        exampleNote: 'Every bit of AL is inverted.',
      },
      {
        mnemonics: ['TEST'],
        syntax: 'TEST op1, op2',
        summary: 'Check bits with AND, without keeping the result.',
        description:
          'Computes op1 & op2 purely to update the flags (typically to check whether particular bits are set), ' +
          'without storing the result anywhere.',
        flags: 'ZF, SF (CF and OF are always cleared)',
        example: 'TEST AL, 00000001b\nJNZ IS_ODD   ; jump taken if bit 0 of AL is set',
        exampleNote: 'AL is unchanged; only ZF is set/cleared based on bit 0.',
      },
      {
        mnemonics: ['SHL'],
        syntax: 'SHL dest, count',
        summary: 'Shift left; equivalent to multiplying by 2^count.',
        description:
          'Shifts dest left by count bits, filling the vacated low bits with 0. The last bit shifted out of the ' +
          'top is captured in CF.',
        flags: 'CF, ZF, SF (OF is always cleared)',
        example: 'MOV AL, 00000011b\nSHL AL, 1    ; AL = 00000110b (6)',
        exampleNote: 'AL doubles from 3 to 6.',
      },
      {
        mnemonics: ['SHR'],
        syntax: 'SHR dest, count',
        summary: 'Shift right (logical); equivalent to unsigned division by 2^count.',
        description:
          'Shifts dest right by count bits, filling the vacated high bits with 0. The last bit shifted out of the ' +
          'bottom is captured in CF. Handy for reading a bit field down to bit 0 after masking it out with AND.',
        flags: 'CF, ZF, SF (OF is always cleared)',
        example: 'MOV AL, 00011000b\nSHR AL, 3    ; AL = 00000011b (3)',
        exampleNote: 'The 2-bit field that was sitting at bits 3-4 now reads as a plain number, 3.',
      },
    ],
  },
  {
    id: 'control-flow',
    title: 'Control Flow — Jumps, Loops & Calls',
    instructions: [
      {
        mnemonics: ['JMP'],
        syntax: 'JMP label',
        summary: 'Unconditional jump.',
        description: 'Always jumps execution to label -- no flags are checked.',
        flags: 'none',
        example: 'JMP SKIP\nMOV AX, 1   ; skipped\nSKIP:\nMOV BX, 2',
        exampleNote: 'AX is never touched; execution resumes at SKIP.',
      },
      {
        mnemonics: ['LOOP'],
        syntax: 'LOOP label',
        summary: 'Decrement CX, and jump back while it is nonzero.',
        description:
          'Decrements CX by 1; if CX is now nonzero, jumps to label. A compact way to repeat a block a fixed ' +
          'number of times without a separate DEC/CMP/JNE.',
        flags: 'none (only CX changes)',
        example: 'MOV CX, 5\nMOV BX, 0\nAGAIN:\n  ADD BX, 1\nLOOP AGAIN     ; runs 5 times total',
        exampleNote: 'BX ends at 5, and CX ends at 0.',
        notes: [
          'If CX starts at 0, LOOP still runs the body once (CX wraps to 0FFFFh first) instead of skipping it -- ' +
            'guard with JCXZ beforehand if CX might legitimately be 0.',
        ],
      },
      {
        mnemonics: ['CALL'],
        syntax: 'CALL label',
        summary: 'Call a subroutine, saving the return address.',
        description:
          'Pushes the address of the instruction right after the CALL onto the stack, then jumps to label -- ' +
          'typically the start of a procedure declared with PROC/ENDP.',
        flags: 'none',
        example: 'CALL AVERAGE\n; ...\nAVERAGE PROC\n  ; ...\n  RET\nAVERAGE ENDP',
        exampleNote: 'Execution jumps into AVERAGE, and RET later returns right after the CALL.',
      },
      {
        mnemonics: ['RET'],
        syntax: 'RET',
        summary: 'Return from a subroutine.',
        description:
          'Pops the return address that CALL pushed, and jumps back to it, resuming the caller right after the ' +
          'CALL. Registers used inside the procedure should be PUSHed on entry and POPed (in reverse order) ' +
          "before RET, so the caller's own register values survive the call.",
        flags: 'none',
        example: 'AVERAGE PROC\n  PUSH AX\n  PUSH CX\n  ; ... compute into BX ...\n  POP CX\n  POP AX\n  RET\nAVERAGE ENDP',
        exampleNote: "AX and CX are restored to the caller's values before returning; only BX carries the result out.",
      },
    ],
  },
  {
    id: 'conditional-jumps',
    title: 'Conditional Jumps',
    instructions: [
      {
        mnemonics: ['JE', 'JZ'],
        syntax: 'JE label   (JZ is the same instruction, just a different name)',
        summary: 'Jump if equal / if zero (ZF = 1).',
        description: 'Jumps if the Zero Flag is set -- after CMP op1, op2, this means op1 == op2.',
        flags: 'reads ZF',
        example: 'CMP AX, 10\nJE EXACTLY_TEN',
        exampleNote: 'The jump is taken only if AX is exactly 10.',
      },
      {
        mnemonics: ['JNE', 'JNZ'],
        syntax: 'JNE label   (JNZ is the same instruction)',
        summary: 'Jump if not equal / if not zero (ZF = 0).',
        description: 'Jumps if the Zero Flag is clear -- after CMP op1, op2, this means op1 != op2.',
        flags: 'reads ZF',
        example: 'CMP AX, 10\nJNE NOT_TEN',
        exampleNote: 'The jump is taken for any AX other than 10.',
      },
      {
        mnemonics: ['JG'],
        syntax: 'JG label',
        summary: 'Jump if greater (signed).',
        description: 'Jumps if op1 > op2, treating both as signed numbers (condition: ZF=0 and SF=OF).',
        flags: 'reads ZF, SF, OF',
        example: 'CMP AX, 10\nJG GREATER   ; taken if AX > 10 (signed)',
        exampleNote: 'Uses a signed comparison -- for values that are always non-negative, JA is the safer choice (see notes).',
        notes: [
          "This simulator's CMP never actually sets OF (see the ADD entry), so JG only behaves correctly when the " +
            "true signed difference doesn't overflow -8000h..7FFFh (word) or -80h..7Fh (byte). For sensor readings " +
            'or other values that are never negative, prefer the unsigned JA/JAE/JB/JBE instead.',
        ],
      },
      {
        mnemonics: ['JL'],
        syntax: 'JL label',
        summary: 'Jump if less (signed).',
        description: 'Jumps if op1 < op2, treating both as signed numbers (condition: SF != OF).',
        flags: 'reads SF, OF',
        example: 'CMP AX, 10\nJL LESS   ; taken if AX < 10 (signed)',
        exampleNote: 'Same OF caveat as JG applies here.',
      },
      {
        mnemonics: ['JGE'],
        syntax: 'JGE label',
        summary: 'Jump if greater or equal (signed).',
        description: 'Jumps if op1 >= op2, treating both as signed numbers (condition: SF = OF).',
        flags: 'reads SF, OF',
        example: 'CMP AX, 10\nJGE GE_TEN   ; taken if AX >= 10 (signed)',
        exampleNote: 'Same OF caveat as JG applies here.',
      },
      {
        mnemonics: ['JLE'],
        syntax: 'JLE label',
        summary: 'Jump if less or equal (signed).',
        description: 'Jumps if op1 <= op2, treating both as signed numbers (condition: ZF=1 or SF != OF).',
        flags: 'reads ZF, SF, OF',
        example: 'CMP AX, 10\nJLE LE_TEN   ; taken if AX <= 10 (signed)',
        exampleNote: 'Same OF caveat as JG applies here.',
      },
      {
        mnemonics: ['JA'],
        syntax: 'JA label',
        summary: 'Jump if above (unsigned).',
        description:
          'Jumps if op1 > op2, treating both as unsigned numbers (condition: CF=0 and ZF=0). The right choice ' +
          "for sensor readings, addresses, or any value that's never negative.",
        flags: 'reads CF, ZF',
        example: 'CMP TURBIDITY, LIMIT\nJA ALARM     ; taken if TURBIDITY > LIMIT (unsigned)',
        exampleNote: 'Correctly compares raw byte/word magnitudes with no signed-overflow caveat.',
      },
      {
        mnemonics: ['JAE', 'JNC'],
        syntax: 'JAE label   (JNC is the same instruction, usually read as "jump if no carry")',
        summary: 'Jump if above or equal (unsigned) / jump if no carry.',
        description:
          'Jumps if CF=0. After CMP, this means op1 >= op2 (unsigned). After an ADD/shift, it means the operation ' +
          'did not carry/shift a 1 out.',
        flags: 'reads CF',
        example: 'CMP CX, 100\nJAE GE_100   ; taken if CX >= 100 (unsigned)',
        exampleNote: 'Taken whenever CX is 100 or more.',
      },
      {
        mnemonics: ['JB', 'JC'],
        syntax: 'JB label   (JC is the same instruction, usually read as "jump if carry")',
        summary: 'Jump if below (unsigned) / jump if carry.',
        description:
          'Jumps if CF=1. After CMP, this means op1 < op2 (unsigned). After an ADD/shift, it means the operation ' +
          'carried/shifted a 1 out.',
        flags: 'reads CF',
        example: 'CMP CX, 100\nJB LESS_THAN_100   ; taken if CX < 100 (unsigned)',
        exampleNote: 'Taken whenever CX is below 100.',
      },
      {
        mnemonics: ['JBE'],
        syntax: 'JBE label',
        summary: 'Jump if below or equal (unsigned).',
        description: 'Jumps if op1 <= op2, treating both as unsigned numbers (condition: CF=1 or ZF=1).',
        flags: 'reads CF, ZF',
        example: 'CMP TURBIDITY, LIMIT\nJBE NORMAL   ; taken if TURBIDITY <= LIMIT (unsigned)',
        exampleNote: 'The complement of JA -- exactly one of JA/JBE is taken after any CMP.',
      },
      {
        mnemonics: ['JCXZ'],
        syntax: 'JCXZ label',
        summary: 'Jump if CX is zero.',
        description:
          "Jumps if CX == 0. Unlike the other conditional jumps, JCXZ doesn't look at any flag -- it tests CX " +
          "directly. Useful to skip a loop entirely when the counter might start at 0 (LOOP alone would decrement " +
          'CX to 0FFFFh first and run 65536 times instead).',
        flags: 'reads CX (not flags)',
        example: 'JCXZ SKIP_LOOP\nAGAIN:\n  ; ... loop body ...\nLOOP AGAIN\nSKIP_LOOP:',
        exampleNote: 'If CX is 0 on entry, the whole loop is skipped instead of running once.',
      },
    ],
  },
  {
    id: 'string-ops',
    title: 'String Operations',
    instructions: [
      {
        mnemonics: ['MOVSB'],
        syntax: 'MOVSB',
        summary: 'Copy one byte from [SI] to [DI].',
        description:
          'Copies the byte at [SI] to [DI], then advances both SI and DI by +1 (or -1 if DF is set via STD). ' +
          'There are no segment registers in this simulator, so SI/DI act as plain addresses into its single flat ' +
          'memory.',
        flags: 'none',
        example: 'CLD\nMOV SI, OFFSET SRC\nMOV DI, OFFSET DST\nMOVSB       ; copies one byte, SI++, DI++',
        exampleNote: 'One byte moves from SRC to DST; SI and DI both advance by one.',
        notes: ['Prefix with REP and a count in CX to repeat it: MOV CX,5 then REP MOVSB copies 5 bytes.'],
      },
      {
        mnemonics: ['STOSB'],
        syntax: 'STOSB',
        summary: 'Store AL at [DI].',
        description: 'Writes AL to [DI], then advances DI by +1 (or -1 if DF is set). Commonly repeated with REP to fill a buffer.',
        flags: 'none',
        example: "MOV AL, '*'\nMOV DI, OFFSET BUF\nMOV CX, 10\nREP STOSB    ; fills 10 bytes at BUF with '*'",
        exampleNote: "All 10 bytes starting at BUF become '*'.",
      },
      {
        mnemonics: ['LODSB'],
        syntax: 'LODSB',
        summary: 'Load the byte at [SI] into AL.',
        description:
          'Reads the byte at [SI] into AL, then advances SI by +1 (or -1 if DF is set). Rarely combined with REP, ' +
          'since a repeated LODSB would just overwrite AL each time, leaving only the last byte.',
        flags: 'none',
        example: 'MOV SI, OFFSET SRC\nLODSB      ; AL = [SRC], SI++',
        exampleNote: 'AL takes on the first byte of SRC.',
      },
      {
        mnemonics: ['CMPSB'],
        syntax: 'CMPSB',
        summary: 'Compare the bytes at [SI] and [DI].',
        description:
          'Computes [SI] - [DI] to update the flags exactly like CMP, then advances both SI and DI. Typically ' +
          'paired with REPE to find the first mismatching byte between two buffers.',
        flags: 'ZF, SF, CF',
        example: 'MOV SI, OFFSET A\nMOV DI, OFFSET B\nMOV CX, 5\nREPE CMPSB    ; stops early on the first mismatch',
        exampleNote: 'Stops as soon as A and B differ, or after 5 bytes if they never do.',
      },
      {
        mnemonics: ['SCASB'],
        syntax: 'SCASB',
        summary: 'Compare AL against the byte at [DI].',
        description:
          'Computes AL - [DI] to update the flags exactly like CMP, then advances DI. Typically paired with ' +
          'REPNE to search a buffer for a byte that matches AL.',
        flags: 'ZF, SF, CF',
        example: "MOV AL, '$'\nMOV DI, OFFSET STR\nMOV CX, 20\nREPNE SCASB   ; stops once a '$' is found",
        exampleNote: "DI ends up pointing just past the '$' (or the scan gives up after 20 bytes).",
      },
      {
        mnemonics: ['CLD'],
        syntax: 'CLD',
        summary: 'Clear the Direction Flag (DF = 0).',
        description: 'Clears DF, so the string instructions above advance SI/DI upward (+1) afterward. This is the default state.',
        flags: 'DF',
        example: 'CLD\nMOVSB   ; SI and DI both move forward',
        exampleNote: 'SI and DI increase after the MOVSB.',
      },
      {
        mnemonics: ['STD'],
        syntax: 'STD',
        summary: 'Set the Direction Flag (DF = 1).',
        description: 'Sets DF, so the string instructions above advance SI/DI downward (-1) afterward -- useful when copying a buffer backward.',
        flags: 'DF',
        example: 'STD\nMOVSB   ; SI and DI both move backward',
        exampleNote: 'SI and DI decrease after the MOVSB.',
      },
      {
        mnemonics: ['REP', 'REPE', 'REPZ', 'REPNE', 'REPNZ'],
        syntax: 'REP <string-instr>   |   REPE/REPZ <string-instr>   |   REPNE/REPNZ <string-instr>',
        summary: 'Repeat a string instruction while CX (and optionally ZF) allows.',
        description:
          'A prefix placed before MOVSB, STOSB, LODSB, CMPSB, or SCASB that repeats it while CX != 0, ' +
          'decrementing CX before each check. REPE and REPZ (the same prefix under two names) additionally stop ' +
          'early the moment ZF becomes 0 (a comparison stopped matching); REPNE and REPNZ (also the same prefix ' +
          'under two names) stop early the moment ZF becomes 1 (a match was found). Plain REP -- used with MOVSB/' +
          'STOSB/LODSB, which never touch ZF -- has no early-exit condition.',
        flags: 'whatever the repeated instruction sets',
        example: 'MOV CX, 3\nREP MOVSB   ; copies 3 bytes total, one MOVSB per CX',
        exampleNote: 'Three bytes are copied; CX reaches 0 when it stops.',
      },
    ],
  },
  {
    id: 'io-interrupts',
    title: 'I/O & Interrupts',
    instructions: [
      {
        mnemonics: ['IN'],
        syntax: 'IN AL/AX, port',
        summary: 'Read a byte or word from a hardware port.',
        description:
          'Reads a byte from port into AL, or a word from port and port+1 into AX. port can be an immediate ' +
          "number (0-255) or the value currently in DX, for ports that don't fit in an 8-bit immediate.",
        flags: 'none',
        example: 'IN AL, 41h    ; AL = current value of port 41h',
        exampleNote: "AL reflects whatever this simulator's virtual device on port 41h currently reports.",
      },
      {
        mnemonics: ['OUT'],
        syntax: 'OUT port, AL/AX',
        summary: 'Write a byte or word to a hardware port.',
        description:
          'Writes AL to port, or AX to port and port+1. In this simulator, specific ports drive virtual devices ' +
          '(e.g. port 41h is a stepper motor that expects a 4-bit coil code).',
        flags: 'none',
        example: 'MOV AL, 06h\nOUT 41h, AL   ; sends command 06h to port 41h (stepper motor)',
        exampleNote: 'Port 41h now holds 06h, which the simulated stepper motor interprets as a step command.',
      },
      {
        mnemonics: ['INT'],
        syntax: 'INT number',
        summary: 'Trigger a software interrupt (DOS services via INT 21h).',
        description:
          'Triggers a software interrupt. This simulator only implements INT 21h -- any other interrupt number ' +
          'is a no-op. Under INT 21h, the function is selected by the value in AH (see below); any AH value not ' +
          'listed there does nothing.',
        flags: 'none',
        example: "MSG DB 'HELLO$'\nMOV DX, OFFSET MSG\nMOV AH, 9\nINT 21h        ; prints \"HELLO\"\n\nMOV AH, 4Ch\nINT 21h        ; ends the program",
        exampleNote: 'The output becomes "HELLO", and the program then halts cleanly.',
        notes: [
          'AH=01h -- read one keyboard character into AL (also echoes it to the output).',
          'AH=02h -- print the single character in DL.',
          "AH=09h -- print the '$'-terminated string starting at the address in DX.",
          'AH=0Ah -- buffered line input into the buffer at DX (its first byte holds the max length).',
          'AH=4Ch -- terminate the program (how every example ends).',
        ],
      },
    ],
  },
  {
    id: 'misc',
    title: 'Miscellaneous',
    instructions: [
      {
        mnemonics: ['NOP'],
        syntax: 'NOP',
        summary: 'Do nothing for one instruction step.',
        description: 'Performs no operation. Useful as a placeholder, a breakpoint target, or to pad out timing.',
        flags: 'none',
        example: 'NOP',
        exampleNote: 'Nothing changes; execution simply moves to the next instruction.',
      },
      {
        mnemonics: ['HLT'],
        syntax: 'HLT',
        summary: 'Stop the CPU immediately.',
        description:
          'Halts execution right away -- no further instructions are stepped. Unlike INT 21h with AH=4Ch, HLT ' +
          "doesn't go through DOS; both simply stop the simulator, but HLT does it unconditionally, without " +
          'needing AH set up first.',
        flags: 'none',
        example: 'HLT',
        exampleNote: 'The simulator stops on this line.',
      },
    ],
  },
  {
    id: 'directives',
    title: 'Directives & Program Structure',
    instructions: [
      {
        mnemonics: ['DB'],
        syntax: 'LABEL DB value [, value ...]',
        summary: 'Declare one or more bytes in memory.',
        description:
          "Reserves and initializes one byte per value, optionally attached to a label. A value can be a number " +
          "or a quoted string (each character becomes one byte) -- handy for building an INT 21h/AH=09h string, " +
          "which must end with a '$'.",
        flags: 'n/a (not a CPU instruction)',
        example: "MSG DB 'HELLO$'\nFLAGS DB 0\nDIGITS DB 1, 2, 3, 4, 5",
        exampleNote: "MSG occupies 6 bytes ('H','E','L','L','O','$'); FLAGS is a single zero byte; DIGITS is 5 bytes.",
      },
      {
        mnemonics: ['DW'],
        syntax: 'LABEL DW value [, value ...]',
        summary: 'Declare one or more 16-bit words in memory.',
        description: 'Reserves and initializes one 16-bit word per value, optionally attached to a label.',
        flags: 'n/a (not a CPU instruction)',
        example: 'SNAPSHOT DW 0\nREADINGS DW 100, 200, 300',
        exampleNote: 'SNAPSHOT is a single word initialized to 0; READINGS is three consecutive words.',
      },
      {
        mnemonics: ['BYTE PTR', 'WORD PTR'],
        syntax: 'MOV BYTE PTR [addr], value   |   MOV WORD PTR [addr], value',
        summary: 'Explicitly state the operand size when it would otherwise be ambiguous.',
        description:
          "Overrides the operand size the assembler would otherwise have to guess -- needed when neither operand " +
          "makes the size obvious, such as writing a bare immediate straight into a memory address.",
        flags: 'n/a (not a CPU instruction)',
        example: 'MOV BYTE PTR [BX], 5    ; write a single byte at [BX]\nMOV WORD PTR [BX], 500  ; write a 16-bit word at [BX]',
        exampleNote: 'The first writes one byte; the second writes two bytes (500 needs a word).',
      },
      {
        mnemonics: ['OFFSET'],
        syntax: 'OFFSET label',
        summary: "Explicitly ask for a label's address (same as writing the bare label).",
        description:
          "In real MASM/TASM, OFFSET is required to get a label's address instead of its value. In this " +
          "simulator, a bare label already means its address -- OFFSET is accepted and simply stripped, kept " +
          'only for compatibility with source copied from a real assembler or textbook.',
        flags: 'n/a (not a CPU instruction)',
        example: 'MOV DX, OFFSET MSG   ; identical to: MOV DX, MSG',
        exampleNote: 'Both lines load the address of MSG into DX.',
      },
      {
        mnemonics: ['ORG'],
        syntax: 'ORG value',
        summary: 'Set the load address of what follows (no effect here).',
        description:
          "In a real assembler, ORG changes the address the next instruction/data is placed at (e.g. ORG 100h " +
          "for a .COM-style program). This simulator has one flat, always-zero-based memory with no relocation, " +
          'so ORG is recognized and accepted -- but does nothing.',
        flags: 'n/a (not a CPU instruction)',
        example: 'ORG 100h   ; accepted, but has no effect in this simulator',
        exampleNote: 'Code and data are placed exactly as if this line were not there.',
      },
      {
        mnemonics: ['PROC', 'ENDP'],
        syntax: 'NAME PROC ... NAME ENDP',
        summary: 'Mark the start and end of a procedure.',
        description:
          'NAME PROC works exactly like a label NAME: written on its own -- CALL NAME jumps there. NAME ENDP ' +
          'just marks the end of the procedure and emits nothing; it exists purely for readability and to match ' +
          'real MASM/TASM syntax.',
        flags: 'n/a (not a CPU instruction)',
        example: 'AVERAGE PROC\n  ; ...\n  RET\nAVERAGE ENDP',
        exampleNote: 'CALL AVERAGE jumps to the first instruction after "AVERAGE PROC".',
      },
      {
        mnemonics: ['.MODEL', '.STACK', '.DATA', '.CODE', '.CONST', 'ASSUME', 'END', 'DOSSEG', '@DATA'],
        syntax: '.MODEL SMALL / .STACK 100h / .DATA / .CODE / ASSUME ... / END [start]',
        summary: 'MASM/TASM boilerplate, accepted but otherwise inert.',
        description:
          'These segment/model declarations are recognized and skipped so that textbook or emu8086-style source ' +
          "can be pasted in without stripping the surrounding boilerplate first. Because this simulator has a " +
          "single flat memory space (no real segments), none of them actually change anything -- including " +
          "@DATA (MASM's symbol for the data segment address), which simply resolves to 0, and MOV DS, AX / MOV " +
          "ES, AX (loading a segment register), which is accepted but has no effect on how addresses are computed.",
        flags: 'n/a (not a CPU instruction)',
        example:
          '.MODEL SMALL\n.STACK 100h\n.DATA\n  MSG DB \'HI$\'\n.CODE\nMAIN PROC\n  MOV AX, @DATA\n  MOV DS, AX  ; accepted, no effect\n  ; ...\nMAIN ENDP\nEND MAIN',
        exampleNote: 'This whole boilerplate is accepted and ignored; only the code and data lines inside it matter.',
      },
    ],
  },
]
