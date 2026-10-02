/**
 * The task contract's criteria come from the goal itself: one structured
 * extraction, classified into the pipeline's kinds. Ids are assigned here,
 * positionally, so the model never authors an identifier and the policy can
 * price a kind without trusting a name. A reply with any statement past the
 * task's bound is a schema miss: the rubric is refused whole, never cut, and
 * the stage reports `llm-failed` rather than judging against part of one.
 */
import type { LlmClient } from '@sysdesign/llm';

import { criterionLengthBound, type TaskSpec } from '../contracts';
import type { StageSpec } from '../pipeline';
import type { CriteriaDeriver } from '../ports';
import { goalSection, joinSections, kindsSection, systemPrompt } from './prompting';
import { criteriaSchema, enumTuple } from './schemas';
import { CRITERIA_STAGE, stageDiagnostic } from './shared';

export function createCriteriaDeriver<T>(
  task: TaskSpec<T>,
  spec: StageSpec,
  llm: LlmClient,
): CriteriaDeriver {
  return async (goal) => {
    const kinds = enumTuple(Object.keys(task.criterionKinds));
    if (!kinds) {
      return {
        criteria: null,
        diagnostic: stageDiagnostic(CRITERIA_STAGE, 'not-applicable', 'no criterion kinds'),
      };
    }

    const goalText = goalSection(goal);
    const response = await llm.completeStructured({
      system: systemPrompt('criteria', spec.persona),
      user: joinSections(kindsSection(task.criterionKinds), goalText.text),
      schema: criteriaSchema(kinds, task.maxCriteria, criterionLengthBound(task)),
      maxTokens: spec.maxTokens,
    });
    if (response === null) {
      return { criteria: null, diagnostic: stageDiagnostic(CRITERIA_STAGE, 'llm-failed') };
    }

    return {
      criteria: response.criteria.slice(0, task.maxCriteria).map((item, index) => ({
        id: `c${index + 1}`,
        kind: item.kind,
        statement: item.statement.trim(),
      })),
      diagnostic: goalText.clipped
        ? stageDiagnostic(CRITERIA_STAGE, 'token-clipped', 'goal exceeded the prompt budget')
        : null,
    };
  };
}
