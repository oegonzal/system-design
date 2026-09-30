/**
 * The only zod that faces a model, built per request: every reference field is
 * a `z.enum` over the ids that exist for THIS artifact and THIS contract, so a
 * lens cannot cite what is not there. Nothing here is a number — the model
 * picks categories and ordinals; the policy owns every figure.
 */
import { z } from 'zod';

import {
  AXIS_FACTOR_LEVELS,
  CRITERION_RESULTS,
  DECISIONS,
  FIXABILITIES,
  SEVERITIES,
  CRITERION_STATEMENT_MAX_LENGTH,
} from '@sysdesign/contracts';

export type EnumTuple = [string, ...string[]];

/** Non-empty tuple for `z.enum`, or null when there is nothing to lock to. */
export function enumTuple(ids: readonly string[]): EnumTuple | null {
  return ids.length === 0 ? null : (ids as EnumTuple);
}

/** An id list locked to what exists, degrading to an empty list rather than an invented enum. */
const refs = (ids: readonly string[], max: number, description: string) => {
  const tuple = enumTuple(ids);
  return (tuple ? z.array(z.enum(tuple)).max(max) : z.array(z.string()).max(0)).describe(
    description,
  );
};

const STATEMENT_MAX = CRITERION_STATEMENT_MAX_LENGTH;
const RATIONALE_MAX = 600;
/** How many artifact parts one finding may point at. */
const MAX_LOCATION_REFS = 8;
/** How many criteria one finding may weaken. */
const MAX_CRITERION_REFS = 4;
/** How many artifact parts one result may cite as evidence. */
const MAX_EVIDENCE_REFS = 6;

export function criteriaSchema(kinds: EnumTuple, maxCriteria: number) {
  return z.strictObject({
    criteria: z
      .array(
        z.strictObject({
          kind: z.enum(kinds),
          statement: z
            .string()
            .min(1)
            .max(STATEMENT_MAX)
            .describe(
              'One checkable sentence, in the goal’s own terms. Never invent a requirement.',
            ),
        }),
      )
      .max(maxCriteria)
      .describe('Every distinct requirement the goal states, most important first.'),
  });
}
export type CriteriaResponse = z.infer<ReturnType<typeof criteriaSchema>>;

export function findingsSchema(
  findingTypes: EnumTuple,
  criterionIds: readonly string[],
  locationIds: readonly string[],
  maxFindings: number,
) {
  return z.strictObject({
    findings: z
      .array(
        z.strictObject({
          type: z.enum(findingTypes),
          severity: z
            .enum(SEVERITIES)
            .describe('How badly this hurts the artifact against the goal.'),
          confidence: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe('How sure you are this is a real defect, not a matter of taste.'),
          fixability: z
            .enum(FIXABILITIES)
            .describe(
              'fixable_local: edit the artifact. requires_retry: start over. requires_user: a person must decide. unfixable: no version of this artifact can satisfy the goal.',
            ),
          locationRefs: refs(
            locationIds,
            MAX_LOCATION_REFS,
            'Ids of the artifact parts this concerns. Empty only if artifact-wide.',
          ),
          criterionIds: refs(
            criterionIds,
            MAX_CRITERION_REFS,
            'The success criteria this defect weakens. Empty only if cross-cutting.',
          ),
          rationale: z
            .string()
            .min(1)
            .max(RATIONALE_MAX)
            .describe('What is wrong, where, and what would fix it — one or two sentences.'),
        }),
      )
      .max(maxFindings)
      .describe('Distinct defects only, worst first. Never restate a known validation problem.'),
  });
}
export type FindingsResponse = z.infer<ReturnType<typeof findingsSchema>>;

export function evaluationSchema(
  criterionIds: EnumTuple,
  locationIds: readonly string[],
  maxResults: number,
) {
  return z.strictObject({
    results: z
      .array(
        z.strictObject({
          criterionId: z.enum(criterionIds),
          result: z
            .enum(CRITERION_RESULTS)
            .describe(
              'pass: fully satisfied. partial: addressed but incomplete. fail: unmet. not_applicable: the criterion cannot apply to this artifact.',
            ),
          confidence: z.enum(AXIS_FACTOR_LEVELS),
          locationRefs: refs(
            locationIds,
            MAX_EVIDENCE_REFS,
            'Ids of the artifact parts that are your evidence.',
          ),
          rationale: z.string().max(RATIONALE_MAX).describe('Why, in one sentence.'),
        }),
      )
      .max(maxResults)
      .describe('Exactly one result per listed criterion, in the listed order.'),
    advisoryVerdict: z
      .enum(DECISIONS)
      .nullable()
      .describe('Your overall recommendation. Advisory only: the policy decides.'),
  });
}
export type EvaluationResponse = z.infer<ReturnType<typeof evaluationSchema>>;
