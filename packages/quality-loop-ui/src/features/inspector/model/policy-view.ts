import type {
  ControllerParams,
  CriterionTrace,
  DecisionStep,
  DecisionTrace,
  PenaltyTrace,
  PipelineSummary,
  Severity,
  ValidationReport,
} from '@sysdesign/contracts';

/**
 * The declared policy beside what it actually did this iteration.
 *
 * Everything the controller used is published — `GET /pipelines` carries the
 * whole `DecisionPolicy` and the controller's declared factors with their
 * parameters, and the decision carries its own trace. Nothing here computes a
 * score or re-derives a verdict: it only puts the declaration and the outcome on
 * one row, so a reader can see which gate decided and against which number.
 *
 * Two mismatches are worth surfacing rather than smoothing over, because each
 * one means the reader is looking at something other than they think:
 *
 * - a factor the controller declares that this iteration's trace never reached
 *   (a gate downstream of the one that decided), and
 * - a factor in the trace the controller does not declare, of which `scores` is
 *   the engine's own reserved one, recorded before any gate is consulted.
 */

export interface GateRow {
  factor: string;
  /** The order the trace consulted it in; null for a declared factor never reached. */
  order: number | null;
  /** The numbers it was composed with, as declared. Null for a factor the controller does not declare. */
  params: ControllerParams | null;
  outcome: DecisionStep['outcome'] | null;
  detail: string | null;
  /** Declared, but this iteration never reached it. */
  unreached: boolean;
  /** In the trace, but not declared by the controller — `scores` is the reserved one. */
  undeclared: boolean;
}

/** The controller's declared ladder joined to the trace, declared order first. */
export function gateRows(
  controller: PipelineSummary['controller'] | null,
  trace: DecisionTrace | null,
): GateRow[] {
  const declared = controller?.steps ?? [];
  const steps = trace?.steps ?? [];
  const byFactor = new Map(steps.map((step) => [step.factor, step]));
  const rows: GateRow[] = declared.map((declaration) => {
    const step = byFactor.get(declaration.factor);
    return {
      factor: declaration.factor,
      order: step?.order ?? null,
      params: declaration.params ?? {},
      outcome: step?.outcome ?? null,
      detail: step?.detail ?? null,
      unreached: step === undefined,
      undeclared: false,
    };
  });
  const names = new Set(declared.map((declaration) => declaration.factor));
  const extra = steps
    .filter((step) => !names.has(step.factor))
    .map((step): GateRow => ({
      factor: step.factor,
      order: step.order,
      params: null,
      outcome: step.outcome,
      detail: step.detail,
      unreached: false,
      undeclared: true,
    }));
  // The trace's own order for the undeclared ones, which is where they happened.
  return [...extra, ...rows].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

export interface PenaltyRow extends PenaltyTrace {
  /** The multiplier this position carried: `decay ** position`. */
  decay: number;
  /** True when the per-dimension clamp is what decided these points. */
  clamped: boolean;
}

export interface DimensionRow {
  dimension: string;
  /** The weight the policy declares. */
  declaredWeight: number | null;
  /** The weight this iteration actually used; null when the dimension went unassessed. */
  weight: number | null;
  criteria: CriterionTrace[];
  base: number | null;
  penalties: PenaltyRow[];
  penaltyTotal: number;
  clampScale: number;
  maxPerDimension: number;
  score: number | null;
  /**
   * True when the penalties exceeded the base and the engine's score floor is
   * what produced the score. `base - penaltyTotal` is then NOT the score, so a
   * view must not print the subtraction as an equation.
   */
  floored: boolean;
  /**
   * Whether any criterion kind lands credit here. A dimension nothing can earn
   * credit in starts at 100 and only ever falls, so it carries weight without
   * carrying information — which the engine's own rules forbid declaring.
   */
  earnable: boolean;
  /** The finding types whose penalties land here, as the policy declares them. */
  penalisedBy: string[];
}

/** Each dimension's arithmetic as the decision recorded it, against what the policy declares. */
export function dimensionRows(
  policy: PipelineSummary['policy'] | null,
  trace: DecisionTrace | null,
): DimensionRow[] {
  const declared = policy?.dimensionWeights ?? {};
  const decay = policy?.penalties.decay ?? 1;
  const maxPerDimension = policy?.penalties.maxPerDimension ?? Infinity;
  const observed = trace?.dimensions ?? [];
  const names = [
    ...Object.keys(declared),
    ...observed.map((entry) => entry.dimension).filter((name) => !(name in declared)),
  ];
  const earns = new Set(Object.values(policy?.criterionKinds ?? {}).map((kind) => kind.dimension));
  return names.map((dimension): DimensionRow => {
    const entry = observed.find((candidate) => candidate.dimension === dimension);
    const penalties = (entry?.penalties ?? []).map((penalty): PenaltyRow => ({
      ...penalty,
      decay: decay ** penalty.position,
      clamped: penalty.points !== penalty.decayed,
    }));
    return {
      dimension,
      declaredWeight: declared[dimension] ?? null,
      weight: entry?.weight ?? null,
      criteria: entry?.criteria ?? [],
      base: entry?.base ?? null,
      penalties,
      penaltyTotal: entry?.penaltyTotal ?? 0,
      clampScale: entry?.clampScale ?? 1,
      maxPerDimension,
      score: entry?.score ?? null,
      floored:
        entry?.base != null &&
        entry.score != null &&
        entry.base - entry.penaltyTotal < entry.score - 0.05,
      earnable: earns.has(dimension),
      penalisedBy: Object.entries(policy?.findingTypes ?? {})
        .filter(([, type]) => type.dimension === dimension)
        .map(([name]) => name),
    };
  });
}

export interface ValidatorRow {
  validatorId: string;
  /** The gate as declared, or as the report carries it for one the registry does not list. */
  gate: string;
  problems: ValidationReport['problems'];
  /** True when the report exists but the pipeline's declaration does not list it. */
  injected: boolean;
  /** True when the pipeline declares it but this iteration recorded no report. */
  unreported: boolean;
}

/**
 * The declared validators beside the reports. The engine injects a schema
 * validator of its own, which appears in an iteration's reports and in no
 * pipeline's declaration — so it is labelled rather than treated as a surprise.
 */
export function validatorRows(
  pipeline: PipelineSummary | null,
  reports: readonly ValidationReport[],
): ValidatorRow[] {
  const declared = pipeline?.validators ?? [];
  const byId = new Map(reports.map((report) => [report.validatorId, report]));
  const rows = declared.map((validator): ValidatorRow => {
    const report = byId.get(validator.id);
    return {
      validatorId: validator.id,
      gate: validator.gate,
      problems: report?.problems ?? [],
      injected: false,
      unreported: report === undefined,
    };
  });
  const names = new Set(declared.map((validator) => validator.id));
  const injected = reports
    .filter((report) => !names.has(report.validatorId))
    .map((report): ValidatorRow => ({
      validatorId: report.validatorId,
      gate: report.gate,
      problems: report.problems,
      injected: true,
      unreported: false,
    }));
  return [...injected, ...rows];
}

export interface PolicyNumbers {
  acceptAt: number | null;
  rejectBelow: number | null;
  minHits: number | null;
  minAssessedShare: number | null;
  decay: number | null;
  maxPerDimension: number | null;
  blockingSeverities: readonly Severity[];
  bySeverity: Readonly<Record<string, number>> | null;
  maxIterations: number | null;
  plateauAfter: number | null;
  concurrency: number | null;
  version: string | null;
}

/** The policy's numbers, flattened for a table. Null throughout when no pipeline was available. */
export const policyNumbers = (policy: PipelineSummary['policy'] | null): PolicyNumbers => ({
  acceptAt: policy?.thresholds.acceptAt ?? null,
  rejectBelow: policy?.thresholds.rejectBelow ?? null,
  minHits: policy?.evidence.minHits ?? null,
  minAssessedShare: policy?.evidence.minAssessedShare ?? null,
  decay: policy?.penalties.decay ?? null,
  maxPerDimension: policy?.penalties.maxPerDimension ?? null,
  blockingSeverities: policy?.blockingSeverities ?? [],
  bySeverity: policy?.penalties.bySeverity ?? null,
  maxIterations: policy?.loop.maxIterations ?? null,
  plateauAfter: policy?.loop.plateauAfter ?? null,
  concurrency: policy?.loop.concurrency ?? null,
  version: policy?.version ?? null,
});
