/**
 * The exact checks on a prompt draft: the parts a prompt cannot be graded
 * without. It warns rather than blocks — a draft with no data, interface or
 * decision rows is still a prompt the lenses can judge, and they are told what
 * it lacks — and never reads prose: a row is missing when the list is empty,
 * not when it is weak. A scale table is not asked for: load figures belong
 * only where load shaped the system, and the lenses judge that, not a count.
 */
import type { DesignPromptDraft, ValidationProblem } from '@sysdesign/contracts';

import { artifactValidator, problem } from '../../core/contracts';
import type { Validator } from '../../core/ports';

export const SHAPE_VALIDATOR_ID = 'shape';

/** Every gap in a draft is worth telling the lenses about, never blocking on. */
const gap = (message: string, locationRefs: string[] = []): ValidationProblem =>
  problem('medium', message, locationRefs);

const blank = (text: string): boolean => text.trim().length === 0;

function shape(draft: DesignPromptDraft): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  if (blank(draft.title)) problems.push(gap('the prompt has no title', ['title']));
  if (blank(draft.scenario)) problems.push(gap('the prompt has no scenario', ['scenario']));
  if (draft.functionalRequirements.length === 0) {
    problems.push(gap('the prompt states no functional requirement'));
  }
  if (draft.nonFunctionalRequirements.length === 0) {
    problems.push(gap('the prompt states no quality target'));
  }
  if (
    draft.domainAndData.length === 0 &&
    draft.interfaces.length === 0 &&
    draft.decisions.length === 0
  ) {
    problems.push(gap('the prompt states no data, no interface and no decision to make'));
  }
  draft.scale.forEach((row, index) => {
    if (blank(row.target)) {
      problems.push(gap(`scale row ${index + 1} has no target figure`, [`scale.${index + 1}`]));
    }
  });
  return problems;
}

export const shapeValidator: Validator<DesignPromptDraft> = artifactValidator(
  SHAPE_VALIDATOR_ID,
  'warn',
  shape,
);
