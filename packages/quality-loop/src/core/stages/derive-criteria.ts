/**
 * The task contract's criteria: what the pipeline declares for every goal of
 * its kind (`task.fixedCriteria`), then what this goal adds — one structured
 * extraction, classified into the pipeline's kinds, into the room the fixed
 * ones leave. Ids are assigned here, positionally over the whole, so the
 * model never authors an identifier and the policy can price a kind without
 * trusting a name. A statement past the task's bound is kept as written and
 * reported as an overrun, never a reason to lose the rubric; only a reply the
 * schema refuses outright — a wrong kind, an empty statement — leaves the
 * stage `llm-failed`, never judging against part of one.
 */
import { modelSchema, overrunsOf, type Overrun, type SuccessCriterion } from '@sysdesign/contracts';
import { asDetailed, type LlmClient } from '@sysdesign/llm';

import { criterionLengthBound, type TaskSpec } from '../contracts';
import type { StageSpec } from '../pipeline';
import type { CriteriaDeriver } from '../ports';
import {
  fixedCriteriaSection,
  goalSection,
  joinSections,
  kindsSection,
  systemPrompt,
} from './prompting';
import { criteriaSchema, enumTuple } from './schemas';
import { CRITERIA_STAGE, failedDiagnostic, stageDiagnostic } from './shared';

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
        overruns: [],
      };
    }

    const fixed = task.fixedCriteria ?? [];
    // Boot refuses a pipeline whose fixed criteria leave no room, so this is ≥ 1.
    const room = task.maxCriteria - fixed.length;
    const goalText = goalSection(goal);
    const fixedSection = fixedCriteriaSection(fixed);
    const reply = await asDetailed(llm).completeStructuredDetailed({
      system: systemPrompt('criteria', spec.persona),
      user: joinSections(
        kindsSection(task.criterionKinds),
        ...(fixedSection === null ? [] : [fixedSection]),
        goalText.text,
      ),
      schema: criteriaSchema(kinds, room, criterionLengthBound(task)),
      maxTokens: spec.maxTokens,
      effort: spec.effort,
    });
    if (reply.value === null) {
      return {
        criteria: null,
        diagnostic: failedDiagnostic(CRITERIA_STAGE, null, reply),
        overruns: [],
      };
    }

    return {
      criteria: [
        ...fixed.map((item) => ({ kind: item.kind, statement: item.statement })),
        ...reply.value.criteria.slice(0, room),
      ].map((item, index) => ({
        id: `c${index + 1}`,
        kind: item.kind,
        statement: item.statement.trim(),
      })),
      diagnostic: goalText.clipped
        ? stageDiagnostic(CRITERIA_STAGE, 'token-clipped', 'goal exceeded the prompt budget')
        : null,
      overruns: reply.overruns,
    };
  };
}

/**
 * A supplied rubric measured the way a derived one is: against the deriver's
 * own schema, so every statement past the length the deriver is asked for is
 * an overrun alike. Past the longest the deriver can return it was refused
 * before the run started (`rubricProblems`); within it, it is kept and
 * recorded.
 */
export function rubricOverruns<T>(
  criteria: readonly SuccessCriterion[],
  task: TaskSpec<T>,
): Overrun[] {
  const kinds = enumTuple(Object.keys(task.criterionKinds));
  if (!kinds) return [];
  const { bounds } = modelSchema(
    criteriaSchema(kinds, task.maxCriteria, criterionLengthBound(task)),
  );
  return overrunsOf({ criteria }, bounds);
}
