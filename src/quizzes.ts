// Multiple-choice quizzes that close a learning-path module (issue #20). The
// first option of every question is the correct one; QuizDialog shuffles
// them. The answer key is public along with the rest of the repo -- the quiz
// is there to make students check themselves, not to be cheat-proof.

export interface QuizQuestion {
  id: string
  /** Concept id (a Learn page) the question comes from, linked as "Review". */
  topic: string
  question: string
  /** Correct answer first. */
  options: string[]
  /** Shown only after a passing attempt, so retakes aren't answer lookups. */
  explanation: string
}

export interface Quiz {
  id: string
  title: string
  intro: string
  /** Shown on the module card until every topic is read; the count left follows it. */
  lockedNote: string
  /** Questions drawn per attempt. */
  questionCount: number
  /** Minimum drawn from each topic; the rest are picked at random. */
  perTopic: number
  passCount: number
  /** Shown under the score on a pass. */
  passNote: string
  questions: QuizQuestion[]
}

export const QUIZZES: Quiz[] = [
  {
    id: 'm0',
    title: 'Module 0 Quiz: Number Systems',
    intro:
      '10 questions from the seven Number Systems topics. You need 7 correct answers to pass and unlock Module 1. ' +
      'You can retake the quiz as many times as you need.',
    lockedNote: 'Read all seven Number Systems topics to unlock the quiz.',
    questionCount: 10,
    // At least one question from every topic that has questions in the pool (#22).
    perTopic: 1,
    passCount: 7,
    passNote: 'Module 1 is now unlocked.',
    questions: [
      {
        id: 'q1', topic: 'bases',
        question: 'What is the decimal value of 10110b?',
        options: ['22', '26', '11', '44'],
        explanation: '10110b = 16 + 4 + 2 = 22.',
      },
      {
        id: 'q2', topic: 'bases',
        question: 'Why is one byte always exactly two hexadecimal digits?',
        options: [
          'Each hex digit stands for exactly 4 bits (16 = 2⁴)',
          'Hex digits use the letters A-F',
          'The CPU stores numbers in hex internally',
          'A byte can never be larger than 99',
        ],
        explanation: '16 = 2⁴, so one hex digit is one nibble and a byte is two nibbles.',
      },
      {
        id: 'q3', topic: 'bases',
        question: 'What is the largest value an unsigned byte can hold?',
        options: ['0FFh (255)', '100h (256)', '7Fh (127)', '0FFFFh (65535)'],
        explanation: 'Eight bits all set to 1 is 11111111b = 0FFh = 255.',
      },
      {
        id: 'q4', topic: 'conversions',
        question: 'What is 200 (decimal) in hexadecimal?',
        options: ['0C8h', '0C2h', '8Ch', '0B8h'],
        explanation: '200 ÷ 16 = 12 r 8, 12 ÷ 16 = 0 r 12 (C). Read bottom to top: C8h, written 0C8h.',
      },
      {
        id: 'q5', topic: 'conversions',
        question: 'What is 0A7h in binary?',
        options: ['10100111b', '10101110b', '01111010b', '10100101b'],
        explanation: 'Each hex digit becomes one nibble: A = 1010, 7 = 0111.',
      },
      {
        id: 'q6', topic: 'conversions',
        question: 'What is 3Ch in decimal?',
        options: ['60', '312', '48', '63'],
        explanation: '3 × 16 + 12 = 60.',
      },
      {
        id: 'q7', topic: 'conversions',
        question: 'What is 45 (decimal) in binary?',
        options: ['101101b', '110101b', '101011b', '100101b'],
        explanation: '45 = 32 + 8 + 4 + 1 = 101101b.',
      },
      {
        id: 'q8', topic: 'signed-numbers',
        question: "How is -1 stored in a byte using two's complement?",
        options: ['0FFh', '81h', '01h', '80h'],
        explanation: '-1 is stored as 256 - 1 = 255 = 0FFh.',
      },
      {
        id: 'q9', topic: 'signed-numbers',
        question: 'Read as a signed byte, what value does 0F6h represent?',
        options: ['-10', '-9', '246', '-118'],
        explanation: '0F6h = 246; the top bit is 1, so it is 246 - 256 = -10.',
      },
      {
        id: 'q10', topic: 'signed-numbers',
        question: 'What range of values can a signed byte hold?',
        options: ['-128 to 127', '-127 to 127', '-128 to 128', '0 to 255'],
        explanation: 'Patterns 0..127 are positive; 128..255 are read as -128..-1.',
      },
      {
        id: 'q11', topic: 'signed-numbers',
        question: 'How is -3 stored in a 16-bit word?',
        options: ['0FFFDh', '0FDh', '8003h', '0FFFCh'],
        explanation: '65536 - 3 = 65533 = 0FFFDh. 0FDh is -3 as a byte, not a word.',
      },
      {
        id: 'q12', topic: 'signed-numbers',
        question: 'The CPU adds the bytes 70h and 90h. What is the 8-bit result?',
        options: ['00h, and the Carry flag is set', '100h', '0E0h', '00h, and the Carry flag is clear'],
        explanation: '112 + 144 = 256, which does not fit in 8 bits: the result wraps to 00h and CF is set.',
      },
      {
        id: 'q13', topic: 'literals',
        question: "Which literal does this simulator's assembler accept for the hexadecimal value FF?",
        options: ['0FFh', 'FFh', 'FF', '-1h'],
        explanation: 'A hex literal that starts with a letter needs a leading 0, otherwise it looks like a label.',
      },
      {
        id: 'q14', topic: 'literals',
        question: 'What decimal value does the literal 1010b stand for?',
        options: ['10', '1010', '4112', '520'],
        explanation: 'The b suffix means binary: 8 + 2 = 10.',
      },
      {
        id: 'q15', topic: 'literals',
        question: 'What decimal value does the literal 17o stand for?',
        options: ['15', '17', '23', '7'],
        explanation: 'The o suffix means octal (base 8): 1 × 8 + 7 = 15.',
      },
    ],
  },
]

export function findQuiz(id: string): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id)
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface DrawnQuestion extends QuizQuestion {
  /** The options in the order shown. */
  shuffled: string[]
}

/** One attempt's questions: `perTopic` from every topic, the rest at random, all in random order. */
export function drawQuestions(quiz: Quiz): DrawnQuestion[] {
  const topics = [...new Set(quiz.questions.map((q) => q.topic))]
  const picked = topics.flatMap((t) => shuffle(quiz.questions.filter((q) => q.topic === t)).slice(0, quiz.perTopic))
  const rest = shuffle(quiz.questions.filter((q) => !picked.includes(q)))
  const drawn = [...picked, ...rest].slice(0, quiz.questionCount)
  return shuffle(drawn).map((q) => ({ ...q, shuffled: shuffle(q.options) }))
}

export interface QuizAnswer {
  question_id: string
  chosen: string
  correct: boolean
}
