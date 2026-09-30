/**
 * The exact checks on a prompt draft: the parts a prompt cannot be graded
 * without. It warns rather than blocks — a draft with no scale table is still
 * a prompt the lenses can judge, and they are told what it lacks — and never
 * reads prose: a target is missing when the string is blank, not when it is
 * weak.
 */
import type { DesignPromptDraft, ValidationProblem } from '@sysdesign/contracts';

import type { TaskContract } from '../../core/contracts';
import type { Validator } from '../../core/ports';

export const SHAPE_VALIDATOR_ID = 'shape';

const problem = (message: string, locationRefs: string[] = []): ValidationProblem => ({
  severity: 'medium',
  locationRefs,
  message,
});

const blank = (text: string): boolean => text.trim().length === 0;

function shape(draft: DesignPromptDraft): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  if (blank(draft.title)) problems.push(problem('the prompt has no title', ['title']));
  if (blank(draft.scenario)) problems.push(problem('the prompt has no scenario', ['scenario']));
  if (draft.functionalRequirements.length === 0) {
    problems.push(problem('the prompt states no functional requirement'));
  }
  if (draft.nonFunctionalRequirements.length === 0) {
    problems.push(problem('the prompt states no quality target'));
  }
  if (draft.scale.length === 0) problems.push(problem('the prompt states no scale target'));
  draft.nonFunctionalRequirements.forEach((row, index) => {
    if (blank(row.target)) {
      problems.push(
        problem(`quality target ${index + 1} has no target figure`, [`nfr.${index + 1}`]),
      );
    }
  });
  draft.scale.forEach((row, index) => {
    if (blank(row.target)) {
      problems.push(problem(`scale row ${index + 1} has no target figure`, [`scale.${index + 1}`]));
    }
  });
  return problems;
}

export const shapeValidator: Validator<DesignPromptDraft> = {
  id: SHAPE_VALIDATOR_ID,
  gate: 'warn',
  validate: (artifact, contract: TaskContract<DesignPromptDraft>) => {
    // An ill-formed artifact is the schema validator's to report, once.
    const parsed = contract.output.schema.safeParse(artifact);
    return {
      validatorId: SHAPE_VALIDATOR_ID,
      gate: 'warn',
      problems: parsed.success ? shape(parsed.data) : [],
    };
  },
};
