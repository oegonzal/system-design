/**
 * The browser-step pipeline's controller: the standard gates and route, with
 * one rule of its own — every decision but `accept` is `escalate`. A plan is
 * never revised in place: the page it was planned against is what the
 * session has in front of it right now, and by the time a revision landed the
 * page may have moved. So the session re-observes and opens a new run, with
 * the faulted plan in that goal's recent actions — a fresh observation beats
 * a blind revise at the same cost. The loop therefore stops after one
 * iteration with the stop reading `escalated`, and `finalDecision === 'accept'`
 * is the one executable signal the session reads. Composed here, beside the
 * definition, the way the doctrine says a pipeline with a rule of its own
 * composes it.
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

const HANDED_BACK = 'handed back: the page is re-observed and a new plan opened';

/** The same check, with every settled decision but accept read as escalate. */
const handBack = (gate: Gate): Gate => ({
  factor: gate.factor,
  check: (ctx) => {
    const outcome = gate.check(ctx);
    return !outcome.ok && outcome.decision !== 'accept' && outcome.decision !== 'escalate'
      ? { ...outcome, decision: 'escalate', reason: `${outcome.reason} (${HANDED_BACK})` }
      : outcome;
  },
});

/** The route never accepts, so whatever it settles is handed back. */
const handBackRoute: Route = {
  factor: byRemediations.factor,
  settle: (ctx) => {
    const settled = byRemediations.settle(ctx);
    return settled.decision === 'escalate'
      ? settled
      : { ...settled, decision: 'escalate', reason: `${settled.reason} — ${HANDED_BACK}` };
  },
};

export const HAND_BACK: Controller = composeController('hand-back', {
  gates: [artifact, validators, evidence, policyAllowed, acceptThreshold, rejectFloor].map(
    handBack,
  ),
  route: handBackRoute,
});
