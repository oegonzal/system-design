/**
 * The standard parts: six gates and the route the doctrine's controller has
 * always consulted, in the order `STANDARD` declares them. Each is a pure
 * reading of the context; none knows its position or its neighbours, so a
 * pipeline may compose them in another order, leave one out, or put one of
 * its own between them.
 */
import type { Gate, Route, Settled } from './compose';
import type { GateContext } from './context';

const percent = (share: number): number => Math.round(share * 100);

/** Every open blocker by name: finding keys first, then the gating criteria that failed. */
const blockerNames = (ctx: GateContext): string =>
  [
    ...ctx.blocking.findings.map((finding) => finding.key),
    ...ctx.blocking.criteria.map((entry) => entry.criterionId),
  ].join(', ');

export const artifact: Gate = {
  factor: 'artifact',
  check: (ctx) =>
    ctx.gates.artifactPresent
      ? { ok: true, detail: 'an artifact is present' }
      : { ok: false, decision: 'escalate', reason: 'no artifact to judge' },
};

export const validators: Gate = {
  factor: 'validators',
  check: (ctx) =>
    ctx.gates.validatorsPassed
      ? { ok: true, detail: 'every blocking validator passed' }
      : {
          ok: false,
          decision: 'retry',
          reason: `blocked by validator(s) ${ctx.blocking.validators.map((report) => report.validatorId).join(', ')}`,
        },
};

export const evidence: Gate = {
  factor: 'evidence',
  check: (ctx) => {
    const { criteria } = ctx.ledger;
    if (ctx.gates.evidenceSufficient) {
      return {
        ok: true,
        detail: `${percent(ctx.assessedShare)}% of ${criteria.length} criteria assessed`,
      };
    }
    const unassessed = criteria
      .filter((entry) => entry.result === 'unassessed')
      .map((entry) => entry.criterionId)
      .join(', ');
    return {
      ok: false,
      decision: 'escalate',
      reason:
        criteria.length === 0
          ? 'no criteria to judge against'
          : `only ${percent(ctx.assessedShare)}% of criteria assessed; unassessed: ${unassessed}`,
    };
  },
};

export const policyAllowed: Gate = {
  factor: 'policy-allowed',
  check: (ctx) => {
    if (ctx.gates.policyAllowed) {
      return { ok: true, detail: 'no blocking finding or failed gating criterion' };
    }
    const { findings, criteria } = ctx.blocking;
    const fixabilities = findings.map((finding) => finding.fixability);
    const named = blockerNames(ctx);
    if (fixabilities.includes('unfixable')) {
      return { ok: false, decision: 'reject', reason: `unfixable blocker: ${named}` };
    }
    if (fixabilities.includes('requires_user')) {
      return { ok: false, decision: 'escalate', reason: `a blocker needs a person: ${named}` };
    }
    if (criteria.length === 0 && fixabilities.every((f) => f === 'requires_retry')) {
      return {
        ok: false,
        decision: 'retry',
        reason: `blockers require a fresh attempt: ${named}`,
      };
    }
    return { ok: false, decision: 'revise', reason: `blockers to fix: ${named}` };
  },
};

export const acceptThreshold: Gate = {
  factor: 'accept-threshold',
  check: (ctx) => {
    const { overall } = ctx.scored;
    const { acceptAt } = ctx.policy.thresholds;
    return overall < acceptAt
      ? { ok: true, detail: `overall ${overall} below ${acceptAt}` }
      : { ok: false, decision: 'accept', reason: `overall ${overall} ≥ ${acceptAt}` };
  },
};

/** Below the floor, editing is not worth it — regenerate. */
export const rejectFloor: Gate = {
  factor: 'reject-floor',
  check: (ctx) => {
    const { overall } = ctx.scored;
    const { rejectBelow } = ctx.policy.thresholds;
    return overall >= rejectBelow
      ? { ok: true, detail: `overall ${overall} at or above the floor ${rejectBelow}` }
      : {
          ok: false,
          decision: 'retry',
          reason: `overall ${overall} below the floor ${rejectBelow}`,
        };
  },
};

/** Route by what the producer can act on. */
export const settleByRemediations = (ctx: GateContext): Settled => {
  const { remediations } = ctx;
  if (remediations.length === 0) {
    return {
      decision: 'escalate',
      reason: 'below the accept threshold with nothing the producer can act on',
    };
  }
  if (remediations.every((remediation) => remediation.action === 'retry')) {
    return {
      decision: 'retry',
      reason: `${remediations.length} remediation(s), all requiring a fresh attempt`,
    };
  }
  return { decision: 'revise', reason: `${remediations.length} remediation(s) to apply` };
};

export const byRemediations: Route = { factor: 'route', settle: settleByRemediations };
