/**
 * The orchestration record's shape as the runner writes it: every declared
 * step pending when the run opens — or already settled, where a provided run
 * stands in — and every unfinished step closed with one reason when the run
 * cannot go on.
 */
import type {
  OrchestrationRunDto,
  OrchestrationStepDto,
  QualityRunDto,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';

import type { OrchestratorDefinition, StepResult } from './definition';

export const pendingStep = (): OrchestrationStepDto => ({
  status: 'pending',
  reason: null,
  runIds: [],
  note: null,
  counts: {},
  report: null,
  startedAt: null,
  finishedAt: null,
});

/** A step's ledger entry as a result settles it, finished at `at` and never started: a stand-in never ran. */
export const settledStep = (outcome: StepResult, at: string): OrchestrationStepDto => ({
  ...pendingStep(),
  status: outcome.status,
  reason: outcome.reason ?? null,
  runIds: outcome.runIds ? [...outcome.runIds] : [],
  note: outcome.note ?? null,
  counts: outcome.counts ?? {},
  report: outcome.report ?? null,
  finishedAt: at,
});

/** What one step becomes when the run cannot go on: running → failed, pending → skipped, settled → as it was. */
const closedStep = (
  dto: OrchestrationStepDto,
  reason: string,
  note: string | null,
  at: string,
): OrchestrationStepDto => {
  if (dto.status === 'running') return { ...dto, status: 'failed', reason, note, finishedAt: at };
  if (dto.status === 'pending')
    return { ...dto, status: 'skipped', reason, note: null, finishedAt: at };
  return dto;
};

/** Every step closed with one reason; the note rides only on what was running. */
export function closeSteps(
  steps: Record<string, OrchestrationStepDto>,
  reason: string,
  note: string | null,
  at: string,
): Record<string, OrchestrationStepDto> {
  return Object.fromEntries(
    Object.entries(steps).map(([step, dto]) => [step, closedStep(dto, reason, note, at)]),
  );
}

/** The request as the record keeps it: the bare goal, what was provided, the budget, the samples. */
const requestSummary = (
  request: StartOrchestrationRequest,
  provided: QualityRunDto | null,
  maxIterations: number,
): OrchestrationRunDto['request'] => ({
  goal: request.goal,
  outputProvided: provided?.request.outputProvided ?? request.output !== undefined,
  criteriaProvided: provided?.request.criteriaProvided ?? request.criteria !== undefined,
  // An orchestration composes its own children; none adopts an iteration.
  adoptedFrom: null,
  maxIterations,
  samples: request.samples ?? null,
});

/** The record as it opens: every declared step pending, or standing in for a provided run. */
export function openRecord<O extends object, P>(
  definition: OrchestratorDefinition<O, P>,
  request: StartOrchestrationRequest,
  provided: QualityRunDto | null,
  context: Record<string, unknown>,
  maxIterations: number,
  now: () => string,
): OrchestrationRunDto {
  const at = now();
  const steps: Record<string, OrchestrationStepDto> = {};
  for (const step of definition.steps) {
    const stood = provided !== null && step.provided ? step.provided(provided) : null;
    steps[step.id] = stood === null ? pendingStep() : settledStep(stood, at);
  }
  return {
    orchestrationRunId: crypto.randomUUID(),
    orchestrator: definition.id,
    pipeline: request.pipeline ?? null,
    status: 'running',
    startedAt: at,
    finishedAt: null,
    request: requestSummary(request, provided, maxIterations),
    openedBy: request.openedBy ?? null,
    context,
    steps,
    error: null,
  };
}
