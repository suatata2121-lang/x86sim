// Content for the Learn tab's "Numbering Systems" section: decimal, binary, and hexadecimal
// representation, converting between bases, signed numbers (two's complement), the number
// literal syntax this simulator's own assembler (src/core/assembler.ts) implements, and
// arithmetic and logic on binary numbers. Reading content with drawn worked examples (NumVisual)
// -- no demo, unlike the Hardware section's topics.

export type Base = 2 | 8 | 10 | 16
type Op = 'AND' | 'OR' | 'XOR' | 'NOT'

/**
 * A worked example drawn by components/NumberVisual.tsx. Only the inputs live
 * here; every result (digits, carries, remainders, flags) is computed when it
 * is drawn, so an example can't show a wrong answer.
 */
export type NumVisual =
  | { kind: 'positional'; value: string; base: Base }
  | { kind: 'division'; value: number; base: Base }
  | { kind: 'nibbles'; binary: string }
  | { kind: 'digitTable' }
  | { kind: 'twos'; value: number; bits: 8 | 16 }
  | { kind: 'range'; bits: 8 | 16 }
  | { kind: 'addRules' }
  | { kind: 'column'; op: 'add' | 'sub'; a: number; b: number; bits: 8; base: 2 | 16; showFlags?: boolean }
  | { kind: 'shiftAdd'; a: number; b: number }
  | { kind: 'longDiv'; dividend: number; divisor: number }
  | { kind: 'shift'; dir: 'left' | 'right'; value: number; count: 1; bits: 8 }
  | { kind: 'bitwise'; op: Op; a: number; b?: number; bits: 8; ascii?: boolean }
  | { kind: 'truthTable'; ops: Op[] }
  | { kind: 'literal'; text: string }
  | { kind: 'register'; name: string; value: number; bits: 8 | 16 }
  /** MUL BL: AL × BL into AX. */
  | { kind: 'mul'; a: number; b: number }
  /** DIV BL: AX ÷ BL, quotient in AL and remainder in AH. */
  | { kind: 'div'; dividend: number; divisor: number }
  /** The general registers and the job each one has (Register File page). */
  | { kind: 'registerRoles' }
  /** MOV's operand rules with valid and rejected lines (Moving Data page). */
  | { kind: 'movRules' }
  /** A plain text table (comparison tables, signal tables, address maps). */
  | { kind: 'table'; head: string[]; rows: string[][] }

export interface NumberingTopic {
  id: string
  title: string
  summary: string
  /** Paragraphs, monospace blocks (strings with a newline) and drawn examples. */
  content: (string | NumVisual)[]
  notes?: string[]
}

export interface NumberingCategory {
  id: string
  title: string
  topics: NumberingTopic[]
}

export const NUMBERING_REFERENCE: NumberingCategory[] = [
  {
    id: 'numbering-systems',
    title: 'Numbering Systems',
    topics: [
      {
        id: 'bases',
        title: 'Decimal, Binary, and Hexadecimal',
        summary: 'Why computers count in binary, and why assembly code is full of hex instead.',
        content: [
          'Any number system works the same way: pick a base (how many distinct digits it has) and read a ' +
            "number as a sum of digit × base^position, counting positions from 0 on the right. Decimal's base " +
            'is 10 (digits 0-9), so 754 means:',
          { kind: 'positional', value: '754', base: 10 },
          "A CPU is built from transistors that are cleanly either on or off -- there's no cheap, reliable way " +
            'to build hardware that distinguishes 10 different voltage levels for 10 decimal digits. Two states ' +
            'maps perfectly onto two digits, so computers use binary: base 2, digits 0 and 1 only. A single ' +
            'binary digit is a bit; group them in fours and it is a nibble; eight bits make a byte; two bytes ' +
            'make a word -- the exact register sizes this simulator works with (Reg8 = one byte, Reg16 = one word).',
          "Binary is precise but unwieldy to read and write by hand -- a 16-bit word is 16 characters long. " +
            'Hexadecimal (base 16, digits 0-9 then A-F for 10-15) fixes that: since 16 is exactly 2⁴, each hex ' +
            'digit maps to exactly one nibble, so a byte is always 2 hex digits and a word is always 4 -- far ' +
            'more compact than binary, and unlike decimal, the conversion to and from binary is pure pattern ' +
            'matching (see "Converting Between Number Systems"), not arithmetic.',
          'The full digit mapping used throughout this simulator (registers, memory dumps, DB/DW values):',
          { kind: 'digitTable' },
        ],
      },
      {
        id: 'conversions',
        title: 'Converting Between Number Systems',
        summary: 'Two methods: repeated division into any base, and reading digits back out of any base.',
        content: [
          'To convert a decimal number into any other base: repeatedly divide by the target base, writing down ' +
            'each remainder, until the quotient reaches 0. Reading the remainders from last to first gives the ' +
            'digits of the answer, most significant first.',
          'Worked example -- converting 178 (decimal) to hexadecimal (divide by 16 each time). Reading the ' +
            'remainders bottom-to-top gives B, then 2 -- so 178 decimal is 0B2h:',
          { kind: 'division', value: 178, base: 16 },
          'Going the other way -- any base back to decimal -- just applies the positional formula from ' +
            '"Decimal, Binary, and Hexadecimal" directly. 0B2h:',
          { kind: 'positional', value: 'B2', base: 16 },
          'Same formula works for binary. 10110010b:',
          { kind: 'positional', value: '10110010', base: 2 },
          'Binary and hex convert into each other without any arithmetic at all, because 16 = 2⁴: split the ' +
            'binary number into groups of 4 bits (nibbles) starting from the right, and look each nibble up in ' +
            'the table from the previous topic. 10110010b splits into 1011 and 0010 -- B and 2 -- giving 0B2h ' +
            'directly, the same answer as above, with no division required. This is why hex is the practical ' +
            "way humans read a register or memory byte: each pair of hex digits is exactly one byte's two nibbles.",
          { kind: 'nibbles', binary: '10110010' },
        ],
      },
      {
        id: 'signed-numbers',
        title: "Signed Numbers and Two's Complement",
        summary: 'A raw byte like 0FFh is ambiguous -- is it 255, or -1? The top bit decides.',
        content: [
          'A byte has 256 possible bit patterns (00h through 0FFh). Nothing about the pattern 11111111b says ' +
            'whether it means the unsigned value 255 or something else entirely -- that meaning is a convention ' +
            'the programmer (and the instructions they choose) imposes on top of the bits.',
          "The convention this simulator's CPU and real 8086 hardware both use is two's complement: the top " +
            'half of the range of bit patterns (top bit = 1) is read as negative. For a byte, that is patterns ' +
            '128..255; for a word, 32768..65535. A negative value -n is stored as the pattern for (256 - n) in ' +
            'a byte, or (65536 - n) in a word -- so -5 as a byte is 256-5 = 251 = 0FBh, and -5 as a word is ' +
            '65536-5 = 65531 = 0FFFBh (exactly what CBW produces when sign-extending AL=-5 into AX, and what ' +
            'this simulator\'s IMUL/IDIV read src as, instead of MUL/DIV\'s plain unsigned reading).',
          { kind: 'twos', value: -5, bits: 8 },
          "This construction is not arbitrary -- it's chosen specifically so ordinary binary addition still " +
            "works without any special-casing for negative numbers. Add 5 and -5 as raw bytes: 5 + 251 = 256, " +
            "which doesn't fit in 8 bits and wraps around to 0 -- exactly the mathematically correct answer, " +
            "and exactly why that wraparound sets CF (the Carry flag, see the Hardware section's flags-register " +
            "topic): the CPU doesn't know or care whether the programmer meant 5+251 (unsigned) or 5+(-5) " +
            '(signed) -- the same bit pattern and the same addition circuit serve both readings.',
          { kind: 'column', op: 'add', a: 5, b: 251, bits: 8, base: 2 },
          'Range at a glance -- top bit is the sign bit in both cases:',
          { kind: 'range', bits: 8 },
          { kind: 'range', bits: 16 },
        ],
        notes: [
          "SF (the Sign flag) is literally just the top bit of the last result -- whether that reads as " +
            "negative under the two's-complement convention -- so SF only means something once the programmer " +
            'has decided a value is signed in the first place.',
        ],
      },
      {
        id: 'literals',
        title: 'Octal and Assembly Number Literals',
        summary: "The h / b / o suffixes -- and the quirky leading-zero rule -- this simulator's own assembler implements.",
        content: [
          "Assembly source needs a way to write a number literal in whichever base is clearest for that value " +
            "-- a memory-mapped I/O port is often clearest in hex, a bitmask in binary, a loop count in plain " +
            "decimal. This simulator's assembler recognizes a suffix letter on a number token to say which base " +
            "it's written in: h for hexadecimal, b for binary, o or q for octal (base 8, digits 0-7 -- rare in " +
            'modern code, but still recognized), and a bare number with no suffix for decimal.',
          { kind: 'literal', text: '0FFh' },
          { kind: 'literal', text: '1010b' },
          { kind: 'literal', text: '17o' },
          "Hex literals have one extra wrinkle: if the first digit would be a letter (A-F), a leading 0 must be " +
            "added -- write 0FFh, not FFh. This isn't about the number's value; it's so the assembler can tell " +
            "a hex literal apart from a label. An identifier can start with a letter but never with a digit " +
            '(see the IDENTIFIER_RE this simulator\'s parser uses), so FFh alone is ambiguous with a label named ' +
            '"FFh", while 0FFh starts with a digit and can only ever be a number.',
          { kind: 'literal', text: 'FFh' },
          'Decimal literals can also be negative with a leading minus (-5), which the two\'s-complement topic ' +
            'above explains how the assembler actually stores. Binary and hex literals are always written as ' +
            'their raw unsigned bit pattern instead -- there is no "-5b" or "-5h"; write 0FBh (byte) or 0FFFBh ' +
            "(word) directly if the two's-complement pattern itself is what's meant.",
        ],
      },
      {
        id: 'add-sub',
        title: 'Addition and Subtraction',
        summary: 'Add and subtract binary and hex numbers column by column, and see where the carry and borrow go.',
        content: [
          'Binary addition works exactly like the decimal addition you learned at school, column by column from ' +
            'the right, except that a column overflows as soon as it reaches 2 instead of 10. There are only four ' +
            'cases to remember:',
          { kind: 'addRules' },
          'Here is 53 + 27 in binary. The small red digits above each column are the carries coming in from the ' +
            'column to its right:',
          { kind: 'column', op: 'add', a: 53, b: 27, bits: 8, base: 2 },
          'A register has a fixed number of bits, so a sum can be too large to fit. When 200 and 100 are added in ' +
            'AL, the true answer 300 needs nine bits. The ninth bit falls out of the register into the Carry flag ' +
            '(CF), and AL keeps only the low eight bits, 300 - 256 = 44:',
          { kind: 'column', op: 'add', a: 200, b: 100, bits: 8, base: 2 },
          'Hex addition follows the same rule with 16 as the overflow point. In 3Ah + 2Fh the right column is ' +
            'A + F = 10 + 15 = 25 = 19h, so write 9 and carry 1; the left column is then 3 + 2 + 1 = 6:',
          { kind: 'column', op: 'add', a: 0x3a, b: 0x2f, bits: 8, base: 16 },
          'Subtraction borrows instead of carrying. When a column has to compute 0 - 1, it borrows 2 from the ' +
            'column to its left (just as decimal borrows 10), so the column becomes 10b - 1 = 1 and the next ' +
            'column has 1 less to work with:',
          { kind: 'column', op: 'sub', a: 80, b: 27, bits: 8, base: 2 },
          'If the number being subtracted is larger, the borrow runs off the top of the register. The CPU then ' +
            'sets CF = 1 to say "a borrow was needed", and the bits left in the register are the two\'s complement ' +
            'of the negative answer. 27 - 80 = -53, which the byte stores as 256 - 53 = 203 = 0CBh:',
          { kind: 'column', op: 'sub', a: 27, b: 80, bits: 8, base: 2 },
          'This is why a CPU needs no separate subtraction circuit: subtracting b is the same as adding the two\'s ' +
            'complement of b. 80 - 27 gives the same bits as 80 + (-27) = 50h + 0E5h = 35h, once the carry out of ' +
            'the top is dropped.',
          'The Carry flag answers "did the unsigned result fit?". A second flag, the Overflow flag (OF), answers ' +
            'the same question for signed numbers. 7Fh + 1 = 80h fits fine as unsigned (127 + 1 = 128, CF = 0), but ' +
            'read as signed it turned +127 into -128, so OF = 1:',
          { kind: 'column', op: 'add', a: 0x7f, b: 1, bits: 8, base: 2, showFlags: true },
          'The 8086 instructions for this topic: ADD and SUB for one register\'s worth of bits; ADC and SBB, which ' +
            'also add in or subtract the Carry flag so that a sum wider than 16 bits can be done in two steps ' +
            '(Module 9); INC and DEC to add or subtract 1; and NEG to turn a value into its two\'s complement ' +
            '(0 - value).',
        ],
        notes: [
          'CF is about unsigned numbers, OF is about signed numbers. The CPU always sets both; your program decides ' +
            'which one matters.',
          'INC and DEC do not change CF, so a loop can count with INC/DEC without losing a carry from an earlier ADD.',
        ],
      },
      {
        id: 'mul-div',
        title: 'Multiplication and Division',
        summary:
          'Multiply and divide in binary, see why shifting is the fast way to multiply or divide by 2, and where ' +
          'MUL and DIV put their results.',
        content: [
          'Binary multiplication is long multiplication with only two possible digits, so each row is either a ' +
            'copy of the first number or nothing. For every 1 bit in the second number, write the first number ' +
            'shifted left by that bit\'s position, then add the rows. 13 × 5 = 1101b × 101b:',
          { kind: 'shiftAdd', a: 13, b: 5 },
          'Shifting left by one position is the same as multiplying by 2, exactly as adding a 0 to the end of a ' +
            'decimal number multiplies it by 10. SHL AL, 1 does this in a single fast instruction; the bit that ' +
            'falls off the top goes into CF:',
          { kind: 'shift', dir: 'left', value: 22, count: 1, bits: 8 },
          'Shifting right divides by 2. The bit that falls off the right end is the remainder, and it lands in CF:',
          { kind: 'shift', dir: 'right', value: 23, count: 1, bits: 8 },
          'Binary long division is decimal long division with an easier question at every step: the divisor ' +
            'either fits (write 1 and subtract) or it doesn\'t (write 0). 13 ÷ 3 = 1101b ÷ 11b:',
          { kind: 'longDiv', dividend: 13, divisor: 3 },
          'For any other multiplier the 8086 has MUL. It always multiplies by the accumulator and stores a result ' +
            'twice as wide, because the product of two 8-bit numbers can need 16 bits. MUL BL computes AX = AL × BL; ' +
            'MUL BX computes DX:AX = AX × BX. 200 × 3 = 600 does not fit in AL, so AH holds the upper byte and MUL ' +
            'sets CF and OF to say so:',
          { kind: 'mul', a: 200, b: 3 },
          'DIV works the other way round. DIV BL divides AX by BL and splits the answer in two: the quotient goes ' +
            'to AL and the remainder to AH. 100 ÷ 7 = 14 remainder 2:',
          { kind: 'div', dividend: 100, divisor: 7 },
          'DIV stops the program with an error if the divisor is 0, or if the quotient is too large for its ' +
            'register: 1000 ÷ 2 = 500 does not fit in AL, so DIV BL with AX = 1000 and BL = 2 fails with "Division ' +
            'overflow". Use the 16-bit form (DIV BX, which divides DX:AX) for larger quotients.',
          'MUL and DIV treat their operands as unsigned. IMUL and IDIV are the signed versions; they read the same ' +
            'bits as two\'s-complement numbers (see "Signed Numbers and Two\'s Complement").',
        ],
        notes: [
          'MUL and DIV take many more clock cycles than a shift. Compare SHL AL, 1 with MUL in the Profiler to see ' +
            'the difference.',
        ],
      },
      {
        id: 'logic',
        title: 'Logic Operations',
        summary: 'AND, OR, XOR and NOT work on every bit separately. Use them to clear, set, flip and test individual bits.',
        content: [
          'Logic operations don\'t carry anything from one column to the next: each bit of the result depends only ' +
            'on the two bits in the same position. The rules for one bit:',
          { kind: 'truthTable', ops: ['AND', 'OR', 'XOR', 'NOT'] },
          'AND gives 1 only where both bits are 1, so it is used to clear bits. Put a 0 in the mask where a bit ' +
            'should be cleared and a 1 where it should be kept. Keeping only the low nibble of 0B6h:',
          { kind: 'bitwise', op: 'AND', a: 0xb6, b: 0x0f, bits: 8 },
          'OR gives 1 where either bit is 1, so it is used to set bits. Setting bit 0 of 0B6h:',
          { kind: 'bitwise', op: 'OR', a: 0xb6, b: 0x01, bits: 8 },
          'XOR gives 1 where the two bits differ, so it flips the bits that are 1 in the mask and leaves the ' +
            'others alone. Flipping the high nibble of 0B6h:',
          { kind: 'bitwise', op: 'XOR', a: 0xb6, b: 0xf0, bits: 8 },
          'NOT flips every bit. NOT 0B6h is 49h; this is also the first step of two\'s complement (flip, then add 1):',
          { kind: 'bitwise', op: 'NOT', a: 0xb6, bits: 8 },
          'A practical example: in ASCII, upper- and lower-case letters differ only in bit 5. AND with 11011111b ' +
            '(0DFh) clears that bit and turns \'a\' (61h) into \'A\' (41h):',
          { kind: 'bitwise', op: 'AND', a: 0x61, b: 0xdf, bits: 8, ascii: true },
          'TEST does an AND but throws the result away and keeps only the flags. TEST AL, 00000100b sets ZF = 1 if ' +
            'bit 2 of AL is 0 and ZF = 0 if it is 1, without changing AL, which is how a program checks one bit of ' +
            'a status byte.',
          'XOR AX, AX is a common way to set a register to 0: every bit is XORed with itself, and a bit XORed with ' +
            'itself is always 0.',
        ],
        notes: ['AND, OR, XOR and TEST always clear CF and OF and set ZF and SF from the result. NOT changes no flags.'],
      },
    ],
  },
]
