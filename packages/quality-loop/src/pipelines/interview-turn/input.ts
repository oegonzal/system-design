import { interviewIndexSchema, readFencedIndex, type InterviewIndex } from '@sysdesign/contracts';

/**
 * What a turn's goal carries for the validators: the items the interviewer
 * must address and the criterion ids a reply may disclose, written by the
 * studio as the goal's fenced index and read back here — never from prose.
 */
export const readInterviewIndex = (goal: string): InterviewIndex | null =>
  readFencedIndex(goal, interviewIndexSchema);

/** The three fixed rules, and room for one the notes may add. */
export const MAX_CRITERIA = 4;
