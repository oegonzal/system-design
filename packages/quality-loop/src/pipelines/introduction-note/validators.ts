/**
 * The exact checks on an introduction note: what the goal's index says
 * against what the note does. `references` blocks — a note about another
 * program, or making an offer the sender never listed, cannot be trusted by
 * any lens. Nothing here reads prose: the program and the offers are in the
 * index the composer wrote.
 */
import type {
  IntroductionIndex,
  IntroductionNoteOutput,
  ValidationProblem,
} from '@sysdesign/contracts';

import {
  indexedValidator,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { readIntroductionIndex } from './input';

const references: IndexedRule<IntroductionNoteOutput, IntroductionIndex> = (note, index) => {
  const problems: ValidationProblem[] = [];
  if (note.programReference.piid !== index.piid) {
    problems.push(
      problem(
        'critical',
        `the note names ${note.programReference.piid}, not the program ${index.piid}`,
        ['program'],
      ),
    );
  }
  const listed = new Set(index.offerIds);
  const made = new Set<string>();
  note.offerLines.forEach((offer, at) => {
    const location = `offer.${at + 1}`;
    if (!listed.has(offer.offerId)) {
      problems.push(
        problem('critical', `${location} makes ${offer.offerId}, which the goal does not list`, [
          location,
        ]),
      );
    } else if (made.has(offer.offerId)) {
      problems.push(
        problem('critical', `${location} makes ${offer.offerId} a second time`, [location]),
      );
    }
    made.add(offer.offerId);
  });
  return problems;
};

export const referencesValidator: Validator<IntroductionNoteOutput> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIntroductionIndex,
  references,
  [problem('critical', 'the goal carries no introduction index')],
);
