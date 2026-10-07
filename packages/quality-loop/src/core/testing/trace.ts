/**
 * Builders for what a run leaves behind — ledgers, decisions, traces and the
 * run records around them — for specs that read runs rather than decide them.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  EvidenceLedger,
  QualityControlDecision,
  QualityRunDto,
  RunTrace,
  SuccessCriterion,
} from '@sysdesign/contracts';

import type { RunRecord } from '../contracts';

/** A settled criterion result, for controller specs. */
export const evidence = (overrides: Partial<CriterionEvidence> = {}): CriterionEvidence => ({
  criterionId: 'c1',
  kind: 'must',
  result: 'pass',
  hits: 1,
  confidence: 'high',
  locationRefs: ['text'],
  ...overrides,
});

/** A confirmed finding, for controller specs. */
export const confirmed = (overrides: Partial<ConfirmedFinding> = {}): ConfirmedFinding => ({
  key: 'gap|text',
  type: 'gap',
  severity: 'medium',
  confidence: 'high',
  fixability: 'fixable_local',
  locationRefs: ['text'],
  criterionIds: [],
  hits: 1,
  lenses: ['critic.tiny'],
  rationale: null,
  reconciledTo: null,
  ...overrides,
});

/** A ledger with sensible defaults, for controller specs. */
export const ledger = (overrides: Partial<EvidenceLedger> = {}): EvidenceLedger => ({
  artifactPresent: true,
  validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
  criteria: [],
  findings: [],
  discarded: [],
  diagnostics: [],
  ...overrides,
});

/** A decision with every gate open and the scores given, for specs that read runs rather than decide them. */
export const decision = (
  overrides: Partial<QualityControlDecision> = {},
): QualityControlDecision => ({
  finalDecision: 'accept',
  gates: {
    artifactPresent: true,
    validatorsPassed: true,
    evidenceSufficient: true,
    policyAllowed: true,
  },
  blocking: { validators: [], findings: [], criteria: [] },
  scores: { dimensions: {}, overall: 80 },
  selectedRemediations: [],
  reason: 'spec',
  trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 80 },
  ...overrides,
});

/**
 * A trace of `iterations` alike iterations around one decision and ledger,
 * the last one crowned. The iteration's validation is the ledger's, as the
 * engine writes it: one set of reports, recorded in both places.
 */
export function traceOf<T = unknown>(
  overrides: {
    artifact?: T | null;
    decision?: QualityControlDecision;
    ledger?: EvidenceLedger;
    stopReason?: RunTrace['stopReason'];
    iterations?: number;
    goal?: string;
    /** The rubric the run was judged against; none unless given — an unjudged run, to `admission`. */
    criteria?: SuccessCriterion[];
  } = {},
): RunTrace<T> {
  const judged = overrides.decision ?? decision();
  const evidence = overrides.ledger ?? ledger();
  const count = overrides.iterations ?? 1;
  return {
    pipeline: { id: 'tiny', version: '0.0.1' },
    contract: { goal: overrides.goal ?? 'g', criteria: overrides.criteria ?? [] },
    iterations: Array.from({ length: count }, (_, index) => ({
      iteration: index + 1,
      mode: index === 0 ? 'initial' : 'revise',
      artifact: overrides.artifact ?? null,
      locations: [],
      rendered: null,
      validation: evidence.validation,
      critics: [],
      evaluators: [],
      ledger: evidence,
      decision: judged,
      remediations: [],
      durationMs: 0,
    })),
    bestIteration: count,
    finalDecision: judged.finalDecision,
    stopReason: overrides.stopReason ?? 'accepted',
    lessons: [],
  };
}

/** A finished run as the service reports it, around a trace; no trace means it failed. */
export const runDto = (
  runId: string,
  trace: RunTrace | null,
  overrides: Partial<QualityRunDto> = {},
): QualityRunDto => ({
  runId,
  pipeline: 'tiny',
  status: trace === null ? 'failed' : 'complete',
  startedAt: '2026-09-22T00:00:00.000Z',
  finishedAt: '2026-09-22T00:01:00.000Z',
  heartbeatAt: '2026-09-22T00:01:00.000Z',
  llm: { model: 'test-model' },
  request: {
    goal: trace?.contract.goal ?? 'g',
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  recall: null,
  trace,
  exchanges: [],
  error: trace === null ? { name: 'Boom', message: 'the model went away', stack: null } : null,
  ...overrides,
});

/** A finished run as `RunsService.execute` resolves it: the dto plus what the dump records. */
export const runRecord = (
  runId: string,
  trace: RunTrace | null,
  overrides: Partial<QualityRunDto> = {},
): RunRecord => ({
  ...runDto(runId, trace, overrides),
  exchanges: [],
  git: { branch: 'spec', headSha: 'spec' },
});
