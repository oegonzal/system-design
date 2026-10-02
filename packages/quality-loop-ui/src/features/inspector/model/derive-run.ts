import type {
  CriticReport,
  EvaluationReport,
  IterationTrace,
  LensOutcome,
  QualityRunDto,
} from '@sysdesign/contracts';

import type { ActionScope, InspectorAction } from './action';
import { digest } from './signature';
import { lensCellKey, type ArtifactState, type ContractState, type LensCell } from './state';

/**
 * One snapshot of `GET /runs/:id` read out as the sequence of things that
 * happened, in the engine's declared order.
 *
 * The derivation is stateless on purpose: it never sees the previous snapshot,
 * so it cannot be fooled into reporting a change that did not happen. The
 * timeline is what decides which of these actions it has already seen, by key.
 *
 * Keys are identity-only for everything the contract calls final — "an
 * iteration once recorded is final" — and carry a digest of their payload for
 * the two things that legitimately move while a run is open: the run's
 * standing, and (in `derive-orchestration`) a step's ledger row.
 */

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** How the rubric came to be, which is also which contract action announces it. */
const contractSourceOf = (run: QualityRunDto): NonNullable<ContractState['source']> =>
  run.request.adoptedFrom !== null
    ? 'adopted'
    : run.request.criteriaProvided
      ? 'provided'
      : 'derived';

const CONTRACT_TYPE = {
  derived: 'contract/derived',
  provided: 'contract/provided',
  adopted: 'contract/adopted',
} as const;

/** Which artifact action an iteration's mode calls for. A produced artifact covers every produce mode. */
const ARTIFACT_TYPE = {
  initial: 'artifact/produced',
  revise: 'artifact/produced',
  retry: 'artifact/produced',
  provided: 'artifact/provided',
  adopted: 'artifact/adopted',
} as const;

const artifactOf = (iteration: IterationTrace): ArtifactState => ({
  mode: iteration.mode,
  rendered: iteration.rendered,
  locations: iteration.locations,
  value: iteration.artifact,
});

/** A lens outcome as one cell, from whichever half of the outcome is present. */
function cellOf(
  outcome: LensOutcome<CriticReport> | LensOutcome<EvaluationReport>,
  kind: LensCell['kind'],
  iteration: number,
): LensCell {
  if (outcome.report !== null) {
    const report = outcome.report;
    const lens = 'criticId' in report ? report.criticId : report.evaluatorId;
    return { lens, kind, sample: report.sample, iteration, report, diagnostic: null };
  }
  // A lens that produced nothing names itself as the diagnostic's stage.
  const { stage, sample } = outcome.diagnostic;
  return { lens: stage, kind, sample, iteration, report: null, diagnostic: outcome.diagnostic };
}

const lensLabel = (cell: LensCell): string => {
  const at = cell.sample === null ? '' : ` sample ${cell.sample}`;
  if (cell.diagnostic !== null) return `${cell.lens}${at}: ${cell.diagnostic.reason}`;
  if (cell.report !== null && 'findings' in cell.report) {
    return `${cell.lens}${at} reported ${plural(cell.report.findings.length, 'finding')}`;
  }
  if (cell.report !== null) {
    const verdict =
      cell.report.advisoryVerdict === null ? '' : ` (advises ${cell.report.advisoryVerdict})`;
    return `${cell.lens}${at} judged ${plural(cell.report.results.length, 'criterion', 'criteria')}${verdict}`;
  }
  /* c8 ignore next -- a LensOutcome is one half or the other, never neither */
  return cell.lens;
};

export interface DeriveRunOptions {
  /** The orchestration and step this run is a child of, when it is one. */
  scope?: Pick<ActionScope, 'orchestrationRunId' | 'stepId'>;
}

/** Every action one snapshot of a quality run accounts for, in declared order. */
export function deriveRun(
  run: QualityRunDto,
  { scope = {} }: DeriveRunOptions = {},
): InspectorAction[] {
  const runId = run.runId;
  const at = (iteration?: number): ActionScope =>
    iteration === undefined ? { ...scope, runId } : { ...scope, runId, iteration };
  const actions: InspectorAction[] = [
    {
      type: 'run/opened',
      key: `run/opened#${runId}`,
      label: `Run opened — ${run.pipeline}`,
      scope: at(),
      at: run.startedAt,
      run: {
        runId,
        pipeline: run.pipeline,
        startedAt: run.startedAt,
        llm: run.llm,
        request: run.request,
      },
    },
  ];

  const trace = run.trace;
  if (trace !== null) {
    const source = contractSourceOf(run);
    actions.push({
      type: CONTRACT_TYPE[source],
      key: `contract#${runId}`,
      label: `Rubric ${source} — ${plural(trace.contract.criteria.length, 'criterion', 'criteria')}`,
      scope: at(),
      contract: {
        goal: trace.contract.goal,
        criteria: [...trace.contract.criteria],
        source,
        pipelineVersion: trace.pipeline.version,
      },
    });

    for (const iteration of trace.iterations) {
      const n = iteration.iteration;
      actions.push({
        type: 'iteration/began',
        key: `iteration/began#${runId}#${n}`,
        label: `Iteration ${n} began — ${iteration.mode}`,
        scope: at(n),
        iteration: n,
        mode: iteration.mode,
      });

      if (iteration.artifact === null && iteration.rendered === null) {
        actions.push({
          type: 'artifact/absent',
          key: `artifact#${runId}#${n}`,
          label: 'No artifact to judge',
          scope: at(n),
        });
      } else {
        actions.push({
          type: ARTIFACT_TYPE[iteration.mode],
          key: `artifact#${runId}#${n}`,
          label: `Artifact ${iteration.mode === 'provided' || iteration.mode === 'adopted' ? iteration.mode : 'produced'} — ${plural(iteration.locations.length, 'location')}`,
          scope: at(n),
          artifact: artifactOf(iteration),
        });
      }

      // Emitted even when empty. An iteration with no artifact records no
      // validation at all, and skipping the action then left the PREVIOUS
      // iteration's reports standing as though they were this one's — the
      // validators table said "no report" for nothing and showed stale problems
      // as current. An empty list is a fact about this iteration, so it is one.
      actions.push({
        type: 'validation/ran',
        key: `validation#${runId}#${n}`,
        label:
          iteration.validation.length === 0
            ? 'No validator ran'
            : `Validators ran — ${plural(iteration.validation.length, 'report')}`,
        scope: at(n),
        reports: iteration.validation,
      });

      iteration.critics.forEach((outcome, index) => {
        const cell = cellOf(outcome, 'critic', n);
        actions.push({
          type: 'critic/reported',
          key: `critic#${runId}#${n}#${index}`,
          label: lensLabel(cell),
          scope: at(n),
          cellKey: lensCellKey(cell.lens, cell.sample),
          cell,
        });
      });

      iteration.evaluators.forEach((outcome, index) => {
        const cell = cellOf(outcome, 'evaluator', n);
        actions.push({
          type: 'evaluator/reported',
          key: `evaluator#${runId}#${n}#${index}`,
          label: lensLabel(cell),
          scope: at(n),
          cellKey: lensCellKey(cell.lens, cell.sample),
          cell,
        });
      });

      const { criteria, findings, discarded } = iteration.ledger;
      actions.push({
        type: 'ledger/normalised',
        key: `ledger#${runId}#${n}`,
        label: `Evidence normalised — ${plural(criteria.length, 'criterion', 'criteria')}, ${plural(findings.length, 'finding')} confirmed, ${discarded.length} discarded`,
        scope: at(n),
        ledger: iteration.ledger,
      });

      actions.push({
        type: 'decision/decided',
        key: `decision#${runId}#${n}`,
        label: `Decision: ${iteration.decision.finalDecision} — overall ${iteration.decision.scores.overall}`,
        scope: at(n),
        decision: iteration.decision,
        remediations: iteration.remediations,
      });

      actions.push({
        type: 'iteration/ended',
        key: `iteration/ended#${runId}#${n}`,
        label: `Iteration ${n} ended`,
        scope: at(n),
        iteration: n,
        durationMs: iteration.durationMs,
      });
    }
  }

  const standing = {
    status: run.status,
    finishedAt: run.finishedAt,
    bestIteration: trace?.bestIteration ?? null,
    finalDecision: trace?.finalDecision ?? null,
    stopReason: trace?.stopReason ?? null,
    lessons: trace === null ? [] : [...trace.lessons],
  };
  actions.push({
    type: 'run/standing',
    // The standing moves while the run is open, so each observation of it is
    // its own action rather than an edit of the one before.
    key: `run/standing#${runId}#${digest(standing)}`,
    label: `Standing: ${standing.finalDecision ?? standing.status}${standing.stopReason === null ? '' : ` (${standing.stopReason})`}`,
    scope: at(),
    at: run.finishedAt,
    standing,
  });

  if (run.error !== null) {
    actions.push({
      type: 'run/failed',
      key: `run/failed#${runId}`,
      label: `Run failed — ${run.error.name}`,
      scope: at(),
      error: run.error,
    });
  }

  for (const exchange of run.exchanges) {
    actions.push({
      type: 'exchange/recorded',
      key: `exchange#${runId}#${exchange.scope}#${exchange.ordinal}`,
      label: `Model call ${exchange.scope} #${exchange.ordinal} — ${exchange.outcome}${exchange.errorName == null ? '' : ` (${exchange.errorName})`}`,
      scope: at(),
      at: exchange.startedAt,
      exchange: { ...exchange, runId },
    });
  }

  return actions;
}
