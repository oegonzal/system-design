/**
 * A controller composed from gates. Each gate reads the context and either
 * passes with a detail or settles a decision with a reason; the first to
 * settle wins and every later one is recorded as skipped. The route is the
 * gate that always settles, typed so that a composed controller can never
 * end undecided. Same context, same verdicts, always: a gate is a pure
 * function of what it is shown.
 */
import type {
  ControllerParams,
  Decision,
  DecisionPolicy,
  DecisionStep,
  EvidenceLedger,
  QualityControlDecision,
} from '@sysdesign/contracts';

import type { Controller } from '../ports';
import { buildContext, round1, type GateContext } from './context';

export type Verdict =
  { ok: true; detail: string } | { ok: false; decision: Decision; reason: string };

export interface Settled {
  decision: Decision;
  reason: string;
}

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

export function composeController(id: string, parts: ControllerParts): Controller {
  validateParts(id, parts);
  const steps = [...parts.gates, parts.route].map(({ factor, params }) =>
    params === undefined ? { factor } : { factor, params: { ...params } },
  );

  const decide = (ledger: EvidenceLedger, policy: DecisionPolicy): QualityControlDecision => {
    const ctx = buildContext(ledger, policy);
    const trace: DecisionStep[] = [];
    const record = (factor: string, outcome: DecisionStep['outcome'], detail: string): void => {
      trace.push({ order: trace.length + 1, factor, outcome, detail });
    };

    const assessedCount = ctx.scored.dimensions.filter((entry) => entry.score !== null).length;
    record(
      SCORES_FACTOR,
      'computed',
      `overall ${ctx.scored.overall} over ${assessedCount} assessed dimension(s)`,
    );

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
        settled = { decision: verdict.decision, reason: verdict.reason };
        record(gate.factor, 'decided', verdict.reason);
      }
    }
    if (settled) {
      record(parts.route.factor, 'skipped', 'not reached');
    } else {
      settled = parts.route.settle(ctx);
      record(parts.route.factor, 'decided', settled.reason);
    }

    return {
      finalDecision: settled.decision,
      gates: ctx.gates,
      scores: {
        dimensions: Object.fromEntries(
          ctx.scored.dimensions.map((entry) => [entry.dimension, entry.score]),
        ),
        overall: ctx.scored.overall,
      },
      selectedRemediations: ctx.remediations,
      reason: settled.reason,
      trace: {
        steps: trace,
        dimensions: ctx.scored.dimensions,
        weightSum: round1(ctx.scored.weightSum * 1000) / 1000,
        weightedTotal: round1(ctx.scored.weightedTotal),
      },
    };
  };

  return { id, summary: { id, steps }, decide };
}
