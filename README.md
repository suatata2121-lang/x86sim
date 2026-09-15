# x86sim

A browser-based 8086 assembly simulator inspired by [emu8086](https://emu8086-microprocessor-emulator.en.softonic.com/). Built with React + TypeScript + Vite.

**Live demo:** https://suatata2121-lang.github.io/x86sim/

## Status

Early stage. Currently working:

- An assembler (`src/core/assembler.ts`): labels, comments, `DB`/`DW` data directives, memory operands — any combination of a base (`BX`/`BP`), an index (`SI`/`DI`), a label, and a constant offset (`[BX]`, `[SI+4]`, `[MSG]`, `[BX+SI]`, `[TABLE+BX+SI+2]`, `BYTE/WORD PTR`) —, operand count/type checking, and undefined-label validation (reported at assemble time). Errors come with a line **and column**; an unknown instruction (like "MOVE") gets a "did you mean" suggestion for the closest real one.
- An 8086 CPU core (`src/core/cpu.ts`): 16/8-bit registers, flags, a flat 64K memory, data labels placed into memory, `INT 21h` support (AH=01 read character, AH=02 print character, AH=09 print `$`-terminated string, AH=0Ah read a buffered line, AH=4Ch exit)
- Supported instructions: `MOV ADD SUB INC DEC CMP MUL DIV AND OR XOR NOT SHL SHR JMP JE JNE JG JL JGE JLE LOOP PUSH POP CALL RET INT NOP HLT` (source/destination can be a register, a number, or a memory address)
- A minimal UI with step/run, register and flag views, and assemble-time + runtime error display
- A memory viewer (`src/components/MemoryView.tsx`): a 16x16 hex dump + ASCII, jump to an address/SP/data label
- Breakpoints: click a line in the editor's gutter (`src/components/CodeEditor.tsx`) to toggle one; "Run" stops right before reaching that line, and resumes on the next "Run"
- Keyboard input: `INT 21h AH=01` (single character) and `AH=0Ah` (buffered line) pause the program; an input box appears in the UI, and execution resumes once the user hits "Send" (or Enter)
- An example program library (`src/examples.ts`): 10 ready-made programs (Hello World, arithmetic, a loop, memory addressing, bitwise ops, multiplication/division, a subroutine, a conditional jump, keyboard input, base+index addressing) can be loaded into the editor via the dropdown above it
- Error locating: the offending line is highlighted red in the editor's gutter; each item in the error list includes a small line preview with a `^` marker at the exact spot

### Known limitations

- A memory operand can use at most one base (`BX` or `BP`) AND at most one index (`SI` or `DI`) register at the same time; two bases (`[BX+BP]`) or two indexes (`[SI+DI]`) together are rejected — real 8086 doesn't have those combinations either.
- When a memory operand's size can't be inferred from a register (no `BYTE`/`WORD PTR` given), it defaults to word (16-bit); unlike MASM, this doesn't raise an "operand size is ambiguous" error.
- No segment registers (`DS/ES/SS/CS`); memory is modeled as a flat 64K.
- `SHL`/`SHR` always leave `OF` as `false` for multi-bit shifts (real 8086 only defines `OF` for a 1-bit shift); `CF` is computed correctly.
- `CALL`/`RET` only work between this program's own labels (they push/pop an instruction-index, not a real memory address); good enough for nested subroutines, but doesn't model real 8086 CS:IP semantics exactly.
- `INT 21h AH=0Ah` doesn't write the trailing `0Dh` (Enter) byte into the buffer — only the entered characters and the actual length (`buffer[1]`); unlike real DOS, it uses the first byte's value (`buffer[0]`) directly as "max characters to read" (it doesn't subtract 1 for the CR).
- The column for an undefined-label error (found during a post-assembly cross-line check) is located with a simple text search on the line; if the same name appears elsewhere on that line (e.g. as part of another word), the marker can land in the wrong place.

## Roadmap

- [x] Data segment / `DB`, `DW` directives and memory addressing
- [x] Memory viewer (hex dump) UI
- [x] Missing instructions: `MUL DIV AND OR XOR NOT SHL SHR CALL RET`
- [x] `INT 21h` AH=09 (print string)
- [x] `INT 21h` AH=01/0A (keyboard input)
- [x] Breakpoint support
- [x] Better assembler error messages (column/character position)
- [x] Example program library
- [x] `[BX+SI]`-style base+index addressing

## Development

```bash
npm install
npm run dev
```

## Deployment

Every push to `main` is automatically built and published to GitHub Pages (`https://suatata2121-lang.github.io/x86sim/`) by `.github/workflows/deploy.yml`. The `base: '/x86sim/'` setting in `vite.config.ts` makes the built asset paths work under that subpath.

## Structure

```
src/
  core/
    types.ts        # shared types (Instruction, Operand, Flags, ...)
    assembler.ts     # source code -> Instruction[] converter
    cpu.ts            # CPU state and instruction execution
  components/
    RegisterView.tsx # register/flag panel
    MemoryView.tsx   # memory hex dump / navigation panel
    CodeEditor.tsx   # line-numbered editor + breakpoint gutter
  examples.ts         # built-in example program library
  App.tsx             # editor + controls + top-level flow
```
