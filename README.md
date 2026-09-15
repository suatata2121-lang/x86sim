# x86sim

A browser-based 8086 assembly simulator inspired by [emu8086](https://emu8086-microprocessor-emulator.en.softonic.com/). Built with React + TypeScript + Vite.

**Live demo:** https://suatata2121-lang.github.io/x86sim/

## Status

Early stage. Currently working:

- An assembler (`src/core/assembler.ts`): labels, comments, `DB`/`DW` data directives, memory operands — any combination of a base (`BX`/`BP`), an index (`SI`/`DI`), a label, and a constant offset (`[BX]`, `[SI+4]`, `[MSG]`, `[BX+SI]`, `[TABLE+BX+SI+2]`, `BYTE/WORD PTR`) —, operand count/type checking, and undefined-label validation (reported at assemble time). Errors come with a line **and column**; an unknown instruction (like "MOVE") gets a "did you mean" suggestion for the closest real one.
- An 8086 CPU core (`src/core/cpu.ts`): 16/8-bit registers, flags (`ZF SF CF OF DF`), a flat 64K memory, data labels placed into memory, `INT 21h` support (AH=01 read character, AH=02 print character, AH=09 print `$`-terminated string, AH=0Ah read a buffered line, AH=4Ch exit)
- Supported instructions: `MOV ADD SUB INC DEC CMP MUL DIV AND OR XOR NOT SHL SHR XCHG NEG TEST JMP JE JNE JG JL JGE JLE JA JAE JB JBE JCXZ LOOP PUSH POP CALL RET IN OUT MOVSB STOSB LODSB CMPSB SCASB CLD STD INT NOP HLT`, plus the `REP`/`REPE`/`REPNE` prefixes on the string instructions (source/destination can be a register, a number, or a memory address)
- A CodeMirror 6 editor (`src/components/CodeEditor.tsx`, `src/components/asmLanguage.ts`) with real syntax highlighting for this assembly dialect (mnemonics, registers, directives, labels, numbers, strings, comments), undo/redo, and bracket matching — replacing the earlier plain `<textarea>`
- Virtual device control: `IN`/`OUT` read and write a 256-entry virtual I/O port space (`Cpu.ports`), wired up to four animated devices in the sidebar (`src/components/Devices.tsx`) — a traffic light, a stepper motor, a 7-segment display, and a thermometer (see **Virtual devices** below). A new **▶ Animate** mode steps the program automatically at a fixed pace (instead of instantly, like "Run") so you can actually watch a device change over time; **⏹ Stop** ends it early.
- A memory viewer (`src/components/MemoryView.tsx`): a 16x16 hex dump + ASCII, jump to an address/SP/data label
- Breakpoints: click a line in the editor's gutter to toggle one (shown as a red dot); "Run" stops right before reaching that line, and resumes on the next "Run"
- Keyboard input: `INT 21h AH=01` (single character) and `AH=0Ah` (buffered line) pause the program; an input box appears in the UI, and execution resumes once the user hits "Send" (or Enter)
- `JA`/`JAE`/`JB`/`JBE` (unsigned conditional jumps, using `CF`/`ZF`) alongside the existing signed `JG`/`JL`/`JGE`/`JLE`; `JCXZ` (jump if `CX` is zero); `XCHG`, `NEG`, `TEST`
- Byte string instructions `MOVSB`/`STOSB`/`LODSB`/`CMPSB`/`SCASB`, optionally prefixed with `REP`/`REPE`/`REPNE` to repeat while `CX != 0` (and, for `REPE`/`REPNE`, while `ZF` keeps matching); `CLD`/`STD` set the direction `SI`/`DI` move in
- An example program library (`src/examples.ts`): 16 ready-made programs (Hello World, arithmetic, a loop, memory addressing, bitwise ops, multiplication/division, a subroutine, a conditional jump, keyboard input, base+index addressing, one per virtual device, a `REP MOVSB` string copy, and `XCHG`/`NEG`/`TEST`/unsigned-jump) can be loaded into the editor via the dropdown above it
- Error locating: the offending line is highlighted red in the editor's gutter; each item in the error list includes a small line preview with a `^` marker at the exact spot

### Virtual devices

Four fixed I/O ports, each driving a small animated view in the sidebar. Write with `OUT` to change a device's state; `IN` reads back whatever was last written to a port.

| Device | Port | Value |
| --- | --- | --- |
| Traffic light | `40h` | bit0 = red, bit1 = yellow, bit2 = green (any combination can be lit at once) |
| Stepper motor | `41h` | low nibble = one step of the 4-value coil sequence `03h, 06h, 0Ch, 09h`; each new value in that sequence rotates the dial 90°, forward or backward depending on which direction is closer |
| 7-segment display | `42h` | bits 0-6 = segments a-g (standard codes: `0`=`3Fh`, `1`=`06h`, `2`=`5Bh`, `3`=`4Fh`, `4`=`66h`, `5`=`6Dh`, `6`=`7Dh`, `7`=`07h`, `8`=`7Fh`, `9`=`6Fh`) |
| Thermometer | `43h` | value 0-99 = displayed °C (an output gauge, not a live sensor) |

`IN`/`OUT` follow real 8086 syntax and restrictions: the register operand must be `AL` (byte) or `AX` (word, spanning two consecutive ports), and the port must be either an immediate 0-255 or the `DX` register — e.g. `OUT 40h, AL`, `MOV DX, 41h` / `OUT DX, AL`, `IN AL, 42h`.

### Known limitations

- A memory operand can use at most one base (`BX` or `BP`) AND at most one index (`SI` or `DI`) register at the same time; two bases (`[BX+BP]`) or two indexes (`[SI+DI]`) together are rejected — real 8086 doesn't have those combinations either.
- When a memory operand's size can't be inferred from a register (no `BYTE`/`WORD PTR` given), it defaults to word (16-bit); unlike MASM, this doesn't raise an "operand size is ambiguous" error.
- No segment registers (`DS/ES/SS/CS`); memory is modeled as a flat 64K.
- `SHL`/`SHR` always leave `OF` as `false` for multi-bit shifts (real 8086 only defines `OF` for a 1-bit shift); `CF` is computed correctly.
- `CALL`/`RET` only work between this program's own labels (they push/pop an instruction-index, not a real memory address); good enough for nested subroutines, but doesn't model real 8086 CS:IP semantics exactly.
- `INT 21h AH=0Ah` doesn't write the trailing `0Dh` (Enter) byte into the buffer — only the entered characters and the actual length (`buffer[1]`); unlike real DOS, it uses the first byte's value (`buffer[0]`) directly as "max characters to read" (it doesn't subtract 1 for the CR).
- The column for an undefined-label error (found during a post-assembly cross-line check) is located with a simple text search on the line; if the same name appears elsewhere on that line (e.g. as part of another word), the marker can land in the wrong place.
- Only 4 fixed virtual devices exist, at fixed ports; there's no way to attach a device to an arbitrary port or add a new device type from the UI.
- `IN` always returns whatever was last written with `OUT` (or `0` if nothing has been written yet) — none of the four devices act as a live sensor feeding independent data back to the program.
- Only the byte forms of the string instructions exist (`MOVSB` etc.); there's no `MOVSW`/`STOSW`/`LODSW`/`CMPSW`/`SCASW`. `REP`-prefixed string instructions run their entire loop within a single "Step", rather than stopping after each iteration.
- The editor's syntax highlighting is a small hand-written tokenizer (`src/components/asmLanguage.ts`), not a full parser — it colors things by lexical pattern (is this word a known mnemonic/register/directive?) rather than validating structure, so it can occasionally color a token in a way that doesn't match how the assembler will actually interpret that line. Breakpoint/error-line highlighting is recomputed from the plain source text on every keystroke rather than tracked as live document positions, so it's simple but doesn't shift a breakpoint's line if you insert lines above it before re-assembling.
- Adding CodeMirror grew the production JS bundle substantially (~190KB gzipped); it isn't code-split, so the whole editor loads up front.

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
- [x] Virtual device control (`IN`/`OUT`): traffic light, stepper motor, 7-segment display, thermometer
- [x] More instructions: `XCHG NEG TEST JA JAE JB JBE JCXZ`, byte string ops (`MOVSB STOSB LODSB CMPSB SCASB`) with `REP`/`REPE`/`REPNE`, `CLD`/`STD`
- [x] A modern code editor (CodeMirror 6) with real syntax highlighting, replacing the plain textarea
- [ ] UI: light/dark theme toggle, multi-file/tabbed editing
- [ ] Data-bus animations showing register/memory/ALU data flow as each instruction executes

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
    CodeEditor.tsx   # CodeMirror 6 editor: breakpoint gutter, current-line/error-line highlighting
    asmLanguage.ts   # hand-written CodeMirror tokenizer for this assembly dialect
    Devices.tsx      # virtual I/O device views (traffic light, motor, 7-seg, thermometer)
  examples.ts         # built-in example program library
  App.tsx             # editor + controls + top-level flow
```
