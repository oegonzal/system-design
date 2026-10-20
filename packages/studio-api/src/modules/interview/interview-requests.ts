import {
  bounded,
  INTERVIEW_ANSWER_BOUND,
  INTERVIEW_QUESTION_BOUND,
  INTERVIEW_QUESTIONS_BOUND,
} from '@sysdesign/contracts';
import { z } from 'zod';

export const clarifySchema = z.strictObject({
  questions: bounded.list(
    INTERVIEW_QUESTIONS_BOUND,
    bounded.text(INTERVIEW_QUESTION_BOUND, { min: 1, trim: true }),
    { min: 1 },
  ),
});

export const answerSchema = z.strictObject({
  text: bounded.text(INTERVIEW_ANSWER_BOUND, { min: 1, trim: true }),
});
