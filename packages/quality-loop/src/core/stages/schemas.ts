/**
 * The only zod that faces a model, built per request: every reference field is
 * a `z.enum` over the ids that exist for THIS artifact and THIS contract, so a
 * lens cannot cite what is not there. Nothing here is a number — the model
 * picks categories and ordinals; the policy owns every figure. Every bound is
 * declared through `bounded`: the model is asked for the target, a reply a
 * little over is kept, and a list over is trimmed by whole items.
 */
import { z } from 'zod';

import {
  AXIS_FACTOR_LEVELS,
  bound,
  bounded,
  CRITERION_RESULTS,
  DECISIONS,
  exact,
  FIXABILITIES,
  SEVERITIES,
  type Bound,
} from '@sysdesign/contracts';

export type EnumTuple = [string, ...string[]];

/** Non-empty tuple for `z.enum`, or null when there is nothing to lock to. */
export function enumTuple(ids: readonly string[]): EnumTuple | null {
  return ids.length === 0 ? null : (ids as EnumTuple);
}

/** The list a lens may cite nothing into, when nothing exists: exact, so an invented id is a fault. */
const NO_REFS = exact(0);

/** An id list locked to what exists, degrading to an empty list rather than an invented enum. */
const refs = (ids: readonly string[], b: Bound, description: string) => {
  const tuple = enumTuple(ids);
  return tuple
    ? bounded.list(b, z.enum(tuple), { description })
    : bounded.list(NO_REFS, z.string(), { description });
};

/*
 * Every lens bound sits at or above the 99th percentile any lens has
 * measurably written, and its ceiling above the longest (`measured.json`
 * beside this file, refreshed by `pnpm measure:bounds`): past the ceiling a
 * rationale is kept and recorded and a list trimmed, never a lost sample.
 */
export const RATIONALE_BOUND = bound(900);
/** How many artifact parts one finding may point at. */
const LOCATION_REFS_BOUND = bound(10, 'list');
/** How many criteria one finding may weaken. */
const CRITERION_REFS_BOUND = bound(6, 'list');
/** How many artifact parts one result may cite as evidence. */
const EVIDENCE_REFS_BOUND = bound(10, 'list');

/**
 * The deriver's answer: at most `maxCriteria` — the engine's own cap, so a
 * list over it is trimmed to it — each statement asked within the task's
 * bound (`criterionLengthBound`), stated to the model in words as well as in
 * the schema.
 */
export function criteriaSchema(kinds: EnumTuple, maxCriteria: number, statementBound: Bound) {
  return z.strictObject({
    criteria: bounded.list(
      exact(maxCriteria),
      z.strictObject({
        kind: z.enum(kinds),
        statement: bounded.text(statementBound, {
          min: 1,
          description: `One checkable sentence, in the goal’s own terms, within ${statementBound.target} characters. Never invent a requirement.`,
        }),
      }),
      { description: 'Every distinct requirement the goal states, most important first.' },
    ),
  });
}

export function findingsSchema(
  findingTypes: EnumTuple,
  criterionIds: readonly string[],
  locationIds: readonly string[],
  maxFindings: number,
) {
  return z.strictObject({
    findings: bounded.list(
      exact(maxFindings),
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
          LOCATION_REFS_BOUND,
          'Ids of the artifact parts this concerns. Empty only if artifact-wide.',
        ),
        criterionIds: refs(
          criterionIds,
          CRITERION_REFS_BOUND,
          'The success criteria this defect weakens. Empty only if cross-cutting.',
        ),
        rationale: bounded.text(RATIONALE_BOUND, {
          min: 1,
          description: 'What is wrong, where, and what would fix it — one or two sentences.',
        }),
      }),
      {
        description:
          'Distinct defects only, worst first. Never restate a known validation problem.',
      },
    ),
  });
}

/**
 * The evaluator's answer: one result for every criterion it judges — the list
 * is asked for at exactly that size and refused below it, so a reply that
 * stops short is a structural fault the seam asks again, never a verdict on
 * half the checklist.
 */
export function evaluationSchema(criterionIds: EnumTuple, locationIds: readonly string[]) {
  return z.strictObject({
    results: bounded.list(
      exact(criterionIds.length),
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
          EVIDENCE_REFS_BOUND,
          'Ids of the artifact parts that are your evidence.',
        ),
        rationale: bounded.text(RATIONALE_BOUND, { description: 'Why, in one sentence.' }),
      }),
      {
        min: criterionIds.length,
        description: 'Exactly one result per listed criterion, in the listed order.',
      },
    ),
    advisoryVerdict: z
      .enum(DECISIONS)
      .nullable()
      .describe('Your overall recommendation. Advisory only: the policy decides.'),
  });
}
