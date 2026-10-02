import type {
  OrchestrationRunDto,
  OrchestrationStepDto,
  QualityRunDto,
} from '@sysdesign/contracts';

import type { InspectorAction } from './action';
import { deriveRun } from './derive-run';
import { digest } from './signature';
import type { StepRow, StepState } from './state';

/**
 * One snapshot of an orchestration run read out as actions, with each child
 * quality run's own actions nested under the step that opened it.
 *
 * The nesting is what makes "how is everything talking to each other" legible:
 * the rail reads orchestration → step → child run → iteration, and every action
 * carries the scope it belongs to, so no view has to work out where it is.
 *
 * A step's own row and the children it opened are separate actions on purpose.
 * They change for different reasons — counts tick up as work lands, a child
 * appears the moment it opens — and keeping them apart means each is a mutation
 * a reader can point at, rather than one blurred row.
 *
 * Opening the record seeds every declared step as pending. The step ids and
 * their order are the orchestrator's own declaration and never change, so the
 * action stays final — and the column is complete from the first snapshot, which
 * is what lets a reader see the step that has not run yet rather than only the
 * ones that have.
 */

const STEP_TYPE = {
  running: 'step/started',
  complete: 'step/completed',
  skipped: 'step/skipped',
  failed: 'step/failed',
} as const;

const STEP_VERB = {
  running: 'started',
  complete: 'completed',
  skipped: 'skipped',
  failed: 'failed',
} as const;

/** A declared step before anything has happened to it. */
const pendingOf = (stepId: string): StepState => ({
  stepId,
  status: 'pending',
  reason: null,
  note: null,
  counts: {},
  report: null,
  startedAt: null,
  finishedAt: null,
  runIds: [],
});

const rowOf = (stepId: string, step: OrchestrationStepDto): StepRow => ({
  stepId,
  status: step.status,
  reason: step.reason,
  note: step.note,
  counts: step.counts,
  report: step.report,
  startedAt: step.startedAt,
  finishedAt: step.finishedAt,
});

const countsLabel = (counts: Record<string, number>): string => {
  const entries = Object.entries(counts);
  return entries.length === 0
    ? ''
    : ` — ${entries.map(([name, value]) => `${name} ${value}`).join(', ')}`;
};

export interface DeriveOrchestrationOptions {
  /**
   * The child quality runs already fetched, by id. A child that has not been
   * fetched still shows as opened; only its own actions are missing.
   */
  children?: Readonly<Record<string, QualityRunDto>>;
}

/** Every action one snapshot of an orchestration accounts for, in declared step order. */
export function deriveOrchestration(
  run: OrchestrationRunDto,
  { children = {} }: DeriveOrchestrationOptions = {},
): InspectorAction[] {
  const id = run.orchestrationRunId;
  const actions: InspectorAction[] = [
    {
      type: 'orchestration/opened',
      key: `orchestration/opened#${id}`,
      label: `Orchestration opened — ${run.orchestrator}${run.pipeline === null ? '' : ` → ${run.pipeline}`}`,
      scope: { orchestrationRunId: id },
      at: run.startedAt,
      orchestration: {
        orchestrationRunId: id,
        orchestrator: run.orchestrator,
        pipeline: run.pipeline,
        startedAt: run.startedAt,
        // The three fields that move are set by `orchestration/finished`, so the
        // action that opens the record is written once and never corrected.
        finishedAt: null,
        status: 'running',
        context: run.context,
        // The declared ids, in declared order: immutable, so this action is
        // written once and the column is whole from the start.
        steps: Object.fromEntries(Object.keys(run.steps).map((id) => [id, pendingOf(id)])),
        error: null,
      },
    },
  ];

  for (const [stepId, step] of Object.entries(run.steps)) {
    // A pending step has not done anything yet; there is nothing to report.
    if (step.status === 'pending') continue;
    const row = rowOf(stepId, step);
    actions.push({
      type: STEP_TYPE[step.status],
      // A step's row moves while the orchestration is open, so each observation
      // of it is its own action rather than an edit of the one before.
      key: `step#${id}#${stepId}#${digest(row)}`,
      label: `Step ${stepId} ${STEP_VERB[step.status]}${step.reason === null ? '' : ` (${step.reason})`}${countsLabel(step.counts)}`,
      scope: { orchestrationRunId: id, stepId },
      at: step.finishedAt ?? step.startedAt,
      step: row,
    });

    for (const runId of step.runIds) {
      actions.push({
        type: 'step/opened-run',
        key: `step/opened-run#${id}#${stepId}#${runId}`,
        label: `Step ${stepId} opened run ${runId}`,
        scope: { orchestrationRunId: id, stepId, runId },
        stepId,
        runId,
      });
      const child = children[runId];
      if (child !== undefined) {
        actions.push(...deriveRun(child, { scope: { orchestrationRunId: id, stepId } }));
      }
    }
  }

  if (run.status !== 'running') {
    actions.push({
      type: 'orchestration/finished',
      key: `orchestration/finished#${id}`,
      label: `Orchestration ${run.status}${run.error === null ? '' : ` — ${run.error.name}`}`,
      scope: { orchestrationRunId: id },
      at: run.finishedAt,
      status: run.status,
      finishedAt: run.finishedAt,
      error: run.error,
    });
  }

  return actions;
}
