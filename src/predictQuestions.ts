// The Predict step's questions per learning-path module (issue #11). 'run'
// questions carry no answer: it is computed by running the code (see
// core/predict.ts). Ids are stable because answers are stored against them
// (predictions table), so add new questions with new ids and never renumber.
import type { PredictQuestion } from './core/predict'

export const PREDICT_QUESTIONS: Record<string, PredictQuestion[]> = {
  m1: [
    { id: 'm1-p1', kind: 'run', code: 'MOV AX, 25\nMOV BX, 17\nADD AX, BX', question: 'What is AX in decimal?', target: { reg: 'AX' } },
    { id: 'm1-p2', kind: 'run', code: 'MOV BX, 10\nMOV CX, 25\nXCHG BX, CX', question: 'What is BX?', target: { reg: 'BX' } },
    { id: 'm1-p3', kind: 'run', code: 'MOV AX, 0F0h\nMOV CX, AX\nMOV AX, 1', question: 'What is CX in decimal?', target: { reg: 'CX' } },
  ],
  m2: [
    { id: 'm2-p1', kind: 'run', code: 'NUMS DB 10, 20, 30\nMOV SI, 2\nMOV BL, [NUMS+SI]', question: 'What is BL in decimal?', target: { reg: 'BL' } },
    {
      id: 'm2-p2', kind: 'choice', question: 'Which instruction reads memory over the data bus?',
      options: ['MOV AX, BX', 'MOV AL, [SI]', 'INC CX'], answer: 1,
    },
  ],
  m12: [
    {
      id: 'm12-p1', kind: 'run', code: 'MOV AX, 1234h\nMOV [0100h], AX',
      question: 'Which byte is at address 0100h? (answer in hex)', target: { mem: 0x0100 },
    },
    {
      id: 'm12-p2', kind: 'choice',
      question: 'DS = 2000h, BX = 0020h, SI = 0010h. Which physical address does MOV AX, [BX+SI] read?',
      options: ['20030h', '00030h', '20300h', '02030h'], answer: 0,
    },
    {
      id: 'm12-p3', kind: 'choice', question: 'Which segment register does MOV AX, [BP+4] use?',
      options: ['DS', 'SS, because BP is in the operand', 'ES', 'CS'], answer: 1,
    },
    {
      id: 'm12-p4', kind: 'choice', question: 'CS = 1980h, IP = 78FEh. Where is the next instruction?',
      options: ['210FEh', '0927Eh', '7A960h', '19800h'], answer: 0,
    },
  ],
  m3: [
    { id: 'm3-p1', kind: 'run', code: 'MOV AL, 0Fh\nAND AL, 0F0h', question: 'What is ZF? (0/1)', target: { flag: 'ZF' } },
    { id: 'm3-p2', kind: 'run', code: 'MOV AX, 5\nCMP AX, 7', question: 'What is CF? (0/1)', target: { flag: 'CF' } },
    { id: 'm3-p3', kind: 'run', code: 'MOV AL, 81h\nTEST AL, 80h', question: 'What is AL in hex?', target: { reg: 'AL' } },
  ],
  m4: [
    { id: 'm4-p1', kind: 'run', code: 'MOV CX, 4\nMOV AX, 0\nL1:\nADD AX, 3\nLOOP L1', question: 'What is AX in decimal?', target: { reg: 'AX' } },
    {
      id: 'm4-p2', kind: 'choice', question: 'Why does a taken jump cost extra cycles on the 8086?',
      options: [
        'The instruction queue is emptied and must be refilled',
        'The ALU has to recompute the flags',
        'The return address is pushed on the stack',
      ],
      answer: 0,
    },
  ],
  m5: [
    { id: 'm5-p1', kind: 'run', code: 'MOV AX, 1\nMOV BX, 2\nPUSH AX\nPUSH BX', question: 'SP starts at FFFEh. What is SP now, in hex?', target: { reg: 'SP' } },
    { id: 'm5-p2', kind: 'run', code: 'MOV AX, 1\nMOV BX, 2\nPUSH AX\nPUSH BX\nPOP AX', question: 'What is AX?', target: { reg: 'AX' } },
    {
      id: 'm5-p3', kind: 'choice', question: 'What does CALL push onto the stack?',
      options: ['The address of the instruction after CALL', 'The address of the subroutine', 'The value of AX'], answer: 0,
    },
    // Slide stack examples (#49).
    { id: 'm5-p4', kind: 'run', code: 'MOV SP, 1456h\nMOV AX, 2174h\nPUSH AX', question: 'SP = 1456h. What is SP after PUSH AX, in hex?', target: { reg: 'SP' } },
    {
      id: 'm5-p5', kind: 'run', code: 'MOV SP, 1456h\nMOV AX, 2174h\nPUSH AX',
      question: 'Same code: which byte is at SS:1454h? (answer in hex)', target: { mem: 0x1454 },
    },
    {
      id: 'm5-p6', kind: 'choice', code: 'POP CX\nPOP DX\nPOP BX',
      question: 'SP = 18FAh and the stack holds 23 14 6B 2C 91 F6 from 18FAh upward. After these lines, which is right?',
      options: [
        'CX = 1423h, DX = 2C6Bh, BX = F691h, SP = 1900h',
        'CX = 2314h, DX = 6B2Ch, BX = 91F6h, SP = 1900h',
        'CX = F691h, DX = 2C6Bh, BX = 1423h, SP = 1900h',
        'CX = 1423h, DX = 2C6Bh, BX = F691h, SP = 18F4h',
      ],
      answer: 0,
    },
    {
      id: 'm5-p7', kind: 'run', code: 'MOV SP, 1236h\nMOV AX, 24B6h\nMOV DI, 85C2h\nMOV DX, 5F93h\nPUSH AX\nPUSH DI\nPUSH DX\nPOP AX',
      question: 'What is AX at the end, in hex?', target: { reg: 'AX' },
    },
    {
      id: 'm5-p8', kind: 'run', code: 'MOV SP, 1236h\nMOV AX, 24B6h\nMOV DI, 85C2h\nMOV DX, 5F93h\nPUSH AX\nPUSH DI\nPUSH DX\nPOP AX',
      question: 'Same code: what is SP at the end, in hex?', target: { reg: 'SP' },
    },
  ],
  m6: [
    { id: 'm6-p1', kind: 'choice', question: 'Which unit fetches instruction bytes into the queue?', options: ['BIU', 'EU', 'ALU'], answer: 0 },
    {
      id: 'm6-p2', kind: 'choice', question: 'In which T-state of a memory read does the address appear on AD0–AD15?',
      options: ['T1', 'T2', 'T3', 'T4'], answer: 0,
    },
    {
      id: 'm6-p3', kind: 'choice', question: 'Which signal tells the external latch to capture the address?',
      options: ['ALE', 'RD', 'M/IO', 'READY'], answer: 0,
    },
  ],
  m7: [
    { id: 'm7-p1', kind: 'run', code: 'MOV AL, 5\nOUT 41h, AL', question: 'Which port now holds 5? (answer in hex)', target: { portWith: 5 } },
    { id: 'm7-p2', kind: 'choice', question: 'Which instruction reads a value from a device?', options: ['IN', 'OUT', 'MOV'], answer: 0 },
  ],
  m11: [
    {
      id: 'm11-p1', kind: 'choice', code: 'MOV AL, 8Bh\nOUT 83h, AL', question: 'After these lines, which ports are inputs?',
      options: ['Port B, Port C upper and Port C lower', 'Only Port A', 'Port A and Port C upper', 'All three ports'], answer: 0,
    },
    {
      id: 'm11-p2', kind: 'choice',
      question: 'What control word makes Port A input (mode 1), Port B output (mode 0), C upper input, C lower output?',
      options: ['98h', 'B8h', 'B9h', 'D8h'], answer: 1,
    },
    {
      id: 'm11-p3', kind: 'choice', code: 'MOV AL, 07h\nOUT 83h, AL', question: 'What happens?',
      options: ['It is a BSR word: PC3 is set to 1', 'Port A receives 07h', 'Ports A, B and C become outputs', 'PC7 is reset to 0'],
      answer: 0,
    },
    {
      id: 'm11-p4', kind: 'run', code: 'MOV AL, 80h\nOUT 83h, AL\nMOV AL, 5Ah\nOUT 81h, AL\nMOV AL, 0\nIN AL, 81h',
      question: 'Port B is an output. What does IN AL, 81h return here? (answer in hex)', target: { reg: 'AL' },
    },
  ],
  m8: [
    { id: 'm8-p1', kind: 'run', code: 'MOV AH, 2\nMOV DL, 41h\nINT 21h', question: 'What character appears in Output?', target: { output: true } },
    { id: 'm8-p2', kind: 'choice', question: 'INT 21h is a … interrupt.', options: ['software', 'hardware'], answer: 0 },
    {
      id: 'm8-p3', kind: 'choice', question: 'What does LOCK guarantee?',
      options: [
        'No other bus master takes the bus during the next instruction',
        'Interrupts are disabled forever',
        'The instruction queue is frozen',
      ],
      answer: 0,
    },
  ],
  m9: [
    { id: 'm9-p1', kind: 'run', code: 'MOV AL, 6\nMOV BL, 7\nMUL BL', question: 'What is AX in decimal?', target: { reg: 'AX' } },
    { id: 'm9-p2', kind: 'run', code: 'MOV AX, 0FFFFh\nADD AX, 1', question: 'What is CF? (0/1)', target: { flag: 'CF' } },
    { id: 'm9-p3', kind: 'run', code: 'MOV AX, 42\nMOV BL, 5\nDIV BL', question: 'What is AH (the remainder)?', target: { reg: 'AH' } },
  ],
  m10: [
    { id: 'm10-p1', kind: 'run', code: 'MOV AL, 81h\nROL AL, 1', question: 'What is AL in hex?', target: { reg: 'AL' } },
    { id: 'm10-p2', kind: 'run', code: 'STC\nPUSHF\nCLC\nPOPF', question: 'What is CF? (0/1)', target: { flag: 'CF' } },
  ],
}
