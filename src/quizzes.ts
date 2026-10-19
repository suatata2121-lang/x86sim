// Multiple-choice quizzes that close a learning-path module (issue #20).
// Only the texts around a quiz live here. The questions and their answers
// are in the Supabase table quiz_questions, loaded from a private seed file:
// this repo is public, so an answer key here would be readable by every
// student. The server draws an attempt (quiz_draw) and grades it
// (quiz_submit); see supabase/schema.sql.

export interface Quiz {
  id: string
  title: string
  intro: string
  /** Shown on the module card until every topic is read; the count left follows it. */
  lockedNote: string
  /** Correct answers needed to pass, for the texts; quiz_settings.pass_count is what counts. */
  passCount: number
  /** Shown under the score on a pass. */
  passNote: string
}

export const QUIZZES: Quiz[] = [
  {
    id: 'm0',
    title: 'Module 0 Quiz: Number Systems',
    intro:
      '10 questions from the seven Number Systems topics. You need 7 correct answers to pass and unlock Module 1. ' +
      'You can retake the quiz as many times as you need.',
    lockedNote: 'Read all seven Number Systems topics to unlock the quiz.',
    passCount: 7,
    passNote: 'Module 1 is now unlocked.',
  },
  {
    id: 'm1',
    title: 'Module 1 Quiz: The CPU and Its Registers',
    intro:
      '10 questions on the fetch-decode-execute cycle, registers and moving data. Some questions show a short ' +
      'program: work out the result in your head, as if you were pressing Step. You need 7 correct answers to pass ' +
      'and finish the module. You can retake the quiz as many times as you need.',
    lockedNote: 'Finish every item on the checklist above to unlock the quiz.',
    passCount: 7,
    passNote: 'Module 2 is now unlocked.',
  },
  {
    id: 'm12',
    title: 'Quiz: Segments, Addressing Modes and Byte Order',
    intro:
      '10 questions on segment:offset addresses, addressing modes and default segments, and byte order. You need 7 ' +
      'correct answers to pass and finish the module. You can retake the quiz as many times as you need.',
    lockedNote: 'Finish every item on the checklist above to unlock the quiz.',
    passCount: 7,
    passNote: 'You have finished the segments and addressing module.',
  },
  {
    id: 'm13',
    title: 'Quiz: Interrupts and the 8259 PIC',
    intro:
      '10 questions on interrupt types and priority, the vector table, the interrupt sequence and the 8259. You ' +
      'need 7 correct answers to pass and finish the module. You can retake the quiz as many times as you need.',
    lockedNote: 'Finish every item on the checklist above to unlock the quiz.',
    passCount: 7,
    passNote: 'You have finished the interrupts module.',
  },
  {
    id: 'm11',
    title: 'Quiz: The 8255 Programmable Peripheral Interface',
    intro:
      '10 questions on port selection, control words and modes, and BSR. You need 7 correct answers to pass and ' +
      'finish the module. You can retake the quiz as many times as you need.',
    lockedNote: 'Finish every item on the checklist above to unlock the quiz.',
    passCount: 7,
    passNote: 'You have finished the 8255 module.',
  },
]

export function findQuiz(id: string): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id)
}

/** One question of an attempt as quiz_draw returns it: options shuffled, no answer. */
export interface DrawnQuestion {
  id: string
  /** Concept id (a Learn page) the question comes from, linked as "Review". */
  topic: string
  question: string
  /** A short program shown under the question, if it has one. */
  code?: string | null
  options: string[]
}

/** One answer as stored in quiz_attempts.answers. */
export interface QuizAnswer {
  question_id: string
  chosen: string
  correct: boolean
}

/** quiz_submit's reply. `answer` and `explanation` are only sent on a pass. */
export interface QuizResult {
  score: number
  total: number
  passed: boolean
  answers: (QuizAnswer & { answer?: string; explanation?: string })[]
}
