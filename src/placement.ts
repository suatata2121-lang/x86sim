// The placement quiz after the first-sign-in tour (#14). 6 of 8 lets a
// student start at Module 1; 'run' answers come from the simulator.
import type { PredictQuestion } from './core/predict'

export const PLACEMENT_PASS = 6

export const PLACEMENT_QUESTIONS: PredictQuestion[] = [
  { id: 'pl-1', kind: 'run', code: 'MOV AL, 0B5h', question: 'What is AL in decimal?', target: { reg: 'AL' } },
  { id: 'pl-2', kind: 'run', code: 'MOV AL, 0\nSUB AL, 3', question: 'What is AL in hex?', target: { reg: 'AL' } },
  { id: 'pl-3', kind: 'choice', question: 'What is 1010b in decimal?', options: ['8', '10', '12', '2'], answer: 1 },
  { id: 'pl-4', kind: 'choice', question: 'How many bits does a hex digit represent?', options: ['2', '3', '4', '8'], answer: 2 },
  {
    id: 'pl-5', kind: 'choice', question: 'What does a register hold?',
    options: ['A value the CPU is working on right now', 'A file on the disk', 'A line of source code'], answer: 0,
  },
  { id: 'pl-6', kind: 'run', code: 'MOV BX, 7\nMOV CX, BX', question: 'What is BX after this code?', target: { reg: 'BX' } },
  { id: 'pl-7', kind: 'choice', question: 'After CMP AX, AX, what is ZF?', options: ['0', '1'], answer: 1 },
  {
    id: 'pl-8', kind: 'choice', question: 'Which register does the 8086 use as a loop counter for LOOP?',
    options: ['AX', 'BX', 'CX', 'DX'], answer: 2,
  },
]
