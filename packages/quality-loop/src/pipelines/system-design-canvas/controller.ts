/**
 * The canvas pipeline's controller: the standard gates and route, with one
 * rule of its own — it never decides `retry`. A retry tells the producer to
 * start over from the goal, which is right for an artifact the loop wrote and
 * wrong for a canvas a person drew: the coach's job is to improve the
 * author's design, never to replace it with one of its own, and a submission
 * judged once should read as "revise", not as "start again". So a blocker
 * that would call for a fresh attempt, a score under the floor, and a route
 * whose remediations all say retry each settle as `revise` instead. Composed
 * here, beside the definition, the way the doctrine says a pipeline with a
 * rule of its own composes it.
 */
import {
  acceptThreshold,
  artifact,
  byRemediations,
  composeController,
  evidence,
  policyAllowed,
  rejectFloor,
  validators,
  type Gate,
  type Route,
} from '../../core/controllers';
import type { Controller } from '../../core/ports';

/** The same check, with `retry` read as `revise`. */
const neverRetry = (gate: Gate): Gate => ({
  factor: gate.factor,
  check: (ctx) => {
    const outcome = gate.check(ctx);
    return !outcome.ok && outcome.decision === 'retry'
      ? { ...outcome, decision: 'revise', reason: `${outcome.reason} (revised, never restarted)` }
      : outcome;
  },
});

const reviseRoute: Route = {
  factor: byRemediations.factor,
  settle: (ctx) => {
    const settled = byRemediations.settle(ctx);
    return settled.decision === 'retry'
      ? { decision: 'revise', reason: `${settled.reason} — applied as a revision` }
      : settled;
  },
};

export const REVISE_ONLY: Controller = composeController('revise-only', {
  gates: [
    artifact,
    neverRetry(validators),
    evidence,
    neverRetry(policyAllowed),
    acceptThreshold,
    neverRetry(rejectFloor),
  ],
  route: reviseRoute,
});
