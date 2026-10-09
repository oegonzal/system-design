/**
 * A controller composed from gates. Each gate reads the context and either
 * passes with a detail or settles a decision with a reason — and, as data,
 * what it decided on — the first to settle wins and every later one is
 * recorded as skipped. The route is the gate that always settles, typed so
 * that a composed controller can never end undecided. Same context, same
 * verdicts, always: a gate is a pure function of what it is shown.
 */
import type {
  ControllerParams,
  ControllerSummary,
  Decision,
  DecisionFacts,
  DecisionPolicy,
  DecisionStep,
  EvidenceLedger,
  QualityControlDecision,
} from '@sysdesign/contracts';

import { round1, round4 } from '../arithmetic';
import type { Controller } from '../ports';
import { buildContext, type GateContext, type Scored } from './context';

export interface Settled {
  decision: Decision;
  reason: string;
  /** What the decision rests on, recorded on its step (`DecisionStep.facts`). */
  facts?: DecisionFacts;
}

export type Verdict = { ok: true; detail: string } | ({ ok: false } & Settled);

export interface Gate {
  readonly factor: string;
  /** Declared parameters, projected into the pipeline summary. */
  readonly params?: ControllerParams;
  check(ctx: GateContext): Verdict;
}

export interface Route {
  readonly factor: string;
  readonly params?: ControllerParams;
  settle(ctx: GateContext): Settled;
}

/** The engine records the scores before any gate is consulted; no gate may take the name. */
export const SCORES_FACTOR = 'scores';

export interface ControllerParts {
  gates: readonly Gate[];
  route: Route;
}

/** A gate or route as the summary shows it: its factor, and its parameters when it declares any. */
export const projectStep = ({
  factor,
  params,
}: {
  factor: string;
  params?: ControllerParams;
}): ControllerSummary['steps'][number] =>
  params === undefined ? { factor } : { factor, params: { ...params } };

/** Refuses a malformed composition where it is declared — at module load, so at boot. */
function validateParts(id: string, parts: ControllerParts): void {
  const fail = (message: string): never => {
    throw new Error(`controller ${id}: ${message}`);
  };
  if (id.trim().length === 0) fail('needs a non-empty id');
  const factors = [...parts.gates.map((gate) => gate.factor), parts.route.factor];
  if (factors.some((factor) => factor.trim().length === 0)) fail('every factor needs a name');
  if (factors.includes(SCORES_FACTOR)) fail(`${SCORES_FACTOR} is the engine's factor`);
  if (new Set(factors).size !== factors.length) fail('factors must be unique');
}

type Record = (
  factor: string,
  outcome: DecisionStep['outcome'],
  detail: string,
  facts?: DecisionFacts,
) => void;

// BOOKMARK
/** Gates in order until one settles, every later one skipped; the route settles what no gate did. */
function consultGates(parts: ControllerParts, ctx: GateContext, record: Record): Settled {
  let settled: Settled | null = null;
  for (const gate of parts.gates) {
    if (settled) {
      record(gate.factor, 'skipped', 'not reached');
      continue;
    }
    const verdict = gate.check(ctx);
    if (verdict.ok) {
      record(gate.factor, 'passed', verdict.detail);
    } else {
      const { ok: _settled, ...decided } = verdict;
      settled = decided;
      record(gate.factor, 'decided', verdict.reason, verdict.facts);
    }
  }
  if (settled) {
    record(parts.route.factor, 'skipped', 'not reached');
    return settled;
  }
  const routed = parts.route.settle(ctx);
  record(parts.route.factor, 'decided', routed.reason, routed.facts);
  return routed;
}

const projectScores = (scored: Scored): QualityControlDecision['scores'] => ({
  dimensions: Object.fromEntries(scored.dimensions.map((entry) => [entry.dimension, entry.score])),
  overall: scored.overall,
});

export function composeController(id: string, parts: ControllerParts): Controller {
  validateParts(id, parts);
  const steps = [...parts.gates, parts.route].map(projectStep);

  // BOOKMARK
  const decide = (ledger: EvidenceLedger, policy: DecisionPolicy): QualityControlDecision => {
    const ctx = buildContext(ledger, policy);
    const trace: DecisionStep[] = [];
    const record: Record = (factor, outcome, detail, facts) => {
      trace.push({ order: trace.length + 1, factor, outcome, detail, ...(facts ? { facts } : {}) });
    };

    const assessedCount = ctx.scored.dimensions.filter((entry) => entry.score !== null).length;
    record(
      SCORES_FACTOR,
      'computed',
      `overall ${ctx.scored.overall} over ${assessedCount} assessed dimension(s)`,
    );
    const settled = consultGates(parts, ctx, record);

    return {
      finalDecision: settled.decision,
      gates: ctx.gates,
      // By key, so a reader routing on them needs no policy: which reports
      // refused, which findings blocked, which gating criteria failed.
      blocking: {
        validators: ctx.blocking.validators.map((report) => report.validatorId),
        findings: ctx.blocking.findings.map((finding) => finding.key),
        criteria: ctx.blocking.criteria.map((entry) => entry.criterionId),
      },
      scores: projectScores(ctx.scored),
      selectedRemediations: ctx.remediations,
      reason: settled.reason,
      trace: {
        steps: trace,
        dimensions: ctx.scored.dimensions,
        weightSum: round4(ctx.scored.weightSum),
        weightedTotal: round1(ctx.scored.weightedTotal),
      },
    };
  };

  return { id, summary: { id, steps }, decide };
}
