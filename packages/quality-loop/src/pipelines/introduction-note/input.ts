import {
  introductionIndexSchema,
  readFencedIndex,
  type IntroductionIndex,
} from '@sysdesign/contracts';

/**
 * What a note's goal carries for the validators: the program the note must
 * name and the offers it may make, written by the composer as the goal's
 * fenced index and read back here — never from prose.
 */
export const readIntroductionIndex = (goal: string): IntroductionIndex | null =>
  readFencedIndex(goal, introductionIndexSchema);

/** The four fixed rules, and room for one the goal may add. */
export const MAX_CRITERIA = 5;
