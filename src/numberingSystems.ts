// Content for the Learn tab's "Numbering Systems" section: decimal, binary, and hexadecimal
// representation, converting between bases, signed numbers (two's complement), and the number
// literal syntax this simulator's own assembler (src/core/assembler.ts) implements. Reading
// content only -- no demo, unlike the Hardware section's topics, since there's no CPU instruction
// sequence that "runs" a base conversion; the numbers here are pre-CPU, structural knowledge.

export interface NumberingTopic {
  id: string
  title: string
  summary: string
  content: string[]
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
            'is 10 (digits 0-9), so 754 means 7×10² + 5×10¹ + 4×10⁰ = 700 + 50 + 4.',
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
          '  Decimal   Binary   Hex        Decimal   Binary   Hex\n' +
            '  0         0000     0          8         1000     8\n' +
            '  1         0001     1          9         1001     9\n' +
            '  2         0010     2          10        1010     A\n' +
            '  3         0011     3          11        1011     B\n' +
            '  4         0100     4          12        1100     C\n' +
            '  5         0101     5          13        1101     D\n' +
            '  6         0110     6          14        1110     E\n' +
            '  7         0111     7          15        1111     F',
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
          'Worked example -- converting 178 (decimal) to hexadecimal (divide by 16 each time):\n' +
            '  178 ÷ 16 = 11 remainder 2\n' +
            '   11 ÷ 16 =  0 remainder 11 (B)\n' +
            'Reading the remainders bottom-to-top: B, then 2 -- so 178 decimal is 0B2h.',
          'Going the other way -- any base back to decimal -- just applies the positional formula from ' +
            '"Decimal, Binary, and Hexadecimal" directly: 0B2h = 11×16¹ + 2×16⁰ = 176 + 2 = 178. Same formula ' +
            'works for binary: 10110010b = 1×2⁷ + 0×2⁶ + 1×2⁵ + 1×2⁴ + 0×2³ + 0×2² + 1×2¹ + 0×2⁰ = 128+32+16+2 = 178.',
          'Binary and hex convert into each other without any arithmetic at all, because 16 = 2⁴: split the ' +
            'binary number into groups of 4 bits (nibbles) starting from the right, and look each nibble up in ' +
            'the table from the previous topic. 10110010b splits into 1011 and 0010 -- B and 2 -- giving 0B2h ' +
            'directly, the same answer as above, with no division required. This is why hex is the practical ' +
            "way humans read a register or memory byte: each pair of hex digits is exactly one byte's two nibbles.",
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
          "This construction is not arbitrary -- it's chosen specifically so ordinary binary addition still " +
            "works without any special-casing for negative numbers. Add 5 and -5 as raw bytes: 5 + 251 = 256, " +
            "which doesn't fit in 8 bits and wraps around to 0 -- exactly the mathematically correct answer, " +
            "and exactly why that wraparound sets CF (the Carry flag, see the Hardware section's flags-register " +
            "topic): the CPU doesn't know or care whether the programmer meant 5+251 (unsigned) or 5+(-5) " +
            '(signed) -- the same bit pattern and the same addition circuit serve both readings.',
          'Range at a glance -- top bit is the sign bit in both cases:\n' +
            '  Byte (8-bit):  0..127 positive, 128..255 read as -128..-1\n' +
            '  Word (16-bit): 0..32767 positive, 32768..65535 read as -32768..-1',
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
          "Hex literals have one extra wrinkle: if the first digit would be a letter (A-F), a leading 0 must be " +
            "added -- write 0FFh, not FFh. This isn't about the number's value; it's so the assembler can tell " +
            "a hex literal apart from a label. An identifier can start with a letter but never with a digit " +
            '(see the IDENTIFIER_RE this simulator\'s parser uses), so FFh alone is ambiguous with a label named ' +
            '"FFh", while 0FFh starts with a digit and can only ever be a number.',
          'Decimal literals can also be negative with a leading minus (-5), which the two\'s-complement topic ' +
            'above explains how the assembler actually stores. Binary and hex literals are always written as ' +
            'their raw unsigned bit pattern instead -- there is no "-5b" or "-5h"; write 0FBh (byte) or 0FFFBh ' +
            "(word) directly if the two's-complement pattern itself is what's meant.",
        ],
      },
    ],
  },
]
