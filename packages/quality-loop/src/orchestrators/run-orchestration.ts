/**
 * The runner: one loop over a declared map of steps. It seeds the ledger from
 * the declaration, runs each step in order, skips what its upstream did not
 * deliver, records every transition through the ledger, and closes the record
 * on an error it did not expect. It knows no step by name.
 */
import type {
  OrchestrationRunDto,
  OrchestrationStepDto,
  PipelineSummary,
  QualityRunDto,
  StartOrchestrationRequest,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { ORCHESTRATION_REASONS } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { toRunDto, type RunRecord } from '../core/contracts';
import {
  pipelinesOf,
  type OrchestratorDefinition,
  type StepContext,
  type StepResult,
} from './definition';

export interface OrchestrationDeps<P> {
  ports: P;
  pipelines(): readonly PipelineSummary[];
  execute(
    request: StartQualityRunRequest,
    onOpened?: (record: RunRecord) => void,
  ): Promise<RunRecord>;
  /** Persist the record's steps at every transition. */
  flush(record: OrchestrationRunDto): Promise<void>;
  now(): string;
  warn(message: string): void;
}

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

/** What a run's steps become when it cannot go on: running → failed, pending → skipped, one reason. */
export function closeSteps(
  steps: Record<string, OrchestrationStepDto>,
  reason: string,
  note: string | null,
  at: string,
): Record<string, OrchestrationStepDto> {
  return Object.fromEntries(
    Object.entries(steps).map(([step, dto]) => [
      step,
      dto.status === 'running'
        ? { ...dto, status: 'failed', reason, note, finishedAt: at }
        : dto.status === 'pending'
          ? { ...dto, status: 'skipped', reason, note: null, finishedAt: at }
          : dto,
    ]),
  );
}

/**
 * The record's step ledger. Every transition is flushed at once, on one
 * serial chain, so writes land in order and a failed flush is logged rather
 * than thrown: the record in memory is the truth, and `close()` writes it whole.
 */
export class StepLedger {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    readonly record: OrchestrationRunDto,
    private readonly flush: (record: OrchestrationRunDto) => Promise<void>,
    private readonly now: () => string,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  begin(step: string): Promise<void> {
    return this.set(step, { status: 'running', startedAt: this.now() });
  }

  /** A child opened: appended, so a step that runs several keeps every id in the order they opened. */
  child(step: string, runId: string): Promise<void> {
    return this.set(step, { runIds: [...this.record.steps[step].runIds, runId] });
  }

  end(step: string, outcome: StepResult): Promise<void> {
    const current = this.record.steps[step];
    return this.set(step, {
      status: outcome.status,
      reason: outcome.reason ?? null,
      note: outcome.note ?? null,
      counts: outcome.counts ?? current.counts,
      report: outcome.report ?? current.report,
      ...(outcome.runIds ? { runIds: [...outcome.runIds] } : {}),
      finishedAt: this.now(),
    });
  }

  skip(step: string, reason: string, note: string | null = null): Promise<void> {
    return this.end(step, { status: 'skipped', reason, note });
  }

  /** Every flush so far, settled — the terminal write waits on it. */
  settled(): Promise<void> {
    return this.writes;
  }

  private set(step: string, patch: Partial<OrchestrationStepDto>): Promise<void> {
    this.record.steps[step] = { ...this.record.steps[step], ...patch };
    this.writes = this.writes
      .then(() => this.flush(this.record))
      .catch((error: unknown) => this.warn(`step not flushed: ${describeError(error).message}`));
    return this.writes;
  }
}

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
    steps[step.id] =
      stood === null
        ? pendingStep()
        : {
            ...pendingStep(),
            status: stood.status,
            reason: stood.reason ?? null,
            runIds: stood.runIds ? [...stood.runIds] : [],
            note: stood.note ?? null,
            counts: stood.counts ?? {},
            report: stood.report ?? null,
            finishedAt: at,
          };
  }
  return {
    orchestrationRunId: crypto.randomUUID(),
    orchestrator: definition.id,
    pipeline: request.pipeline ?? null,
    status: 'running',
    startedAt: at,
    finishedAt: null,
    request: {
      goal: request.goal,
      outputProvided: provided?.request.outputProvided ?? request.output !== undefined,
      criteriaProvided: provided?.request.criteriaProvided ?? request.criteria !== undefined,
      maxIterations,
      samples: request.samples ?? null,
    },
    context,
    steps,
    error: null,
  };
}

/** Which of a step's declared pipelines a call to `execute` runs; a throw here fails the step as `errored`. */
function chosen(step: string, declared: readonly string[], named: string | undefined): string {
  if (declared.length === 0) throw new Error(`step ${step} declares no pipeline to run`);
  if (named !== undefined) {
    if (!declared.includes(named))
      throw new Error(`step ${step} may not run ${named}: not declared`);
    return named;
  }
  if (declared.length === 1) return declared[0];
  throw new Error(`step ${step} declares ${declared.length} pipelines; name one`);
}

/**
 * Run the steps against an opened record, mutating it. Never throws: an error
 * the steps did not expect closes the record as failed with every step
 * explained. The caller persists the record when this resolves.
 */
export async function runOrchestration<O extends object, P>(
  definition: OrchestratorDefinition<O, P>,
  record: OrchestrationRunDto,
  request: StartOrchestrationRequest,
  provided: QualityRunDto | null,
  deps: OrchestrationDeps<P>,
): Promise<void> {
  const ledger = new StepLedger(record, deps.flush, deps.now, deps.warn);
  const allowed = new Set<string>([...ORCHESTRATION_REASONS, ...definition.reasons]);
  const outputs: Partial<O> = {};
  const registry = deps.pipelines();
  const acceptAtOf = (id: string): number | null =>
    registry.find((summary) => summary.id === id)?.policy.thresholds.acceptAt ?? null;

  // A provided run's outputs are known before anything runs.
  if (provided !== null) {
    for (const step of definition.steps) {
      const stood = step.provided?.(provided);
      if (stood?.output !== undefined) {
        (outputs as Record<string, unknown>)[step.id] = stood.output;
      }
    }
  }

  try {
    for (const step of definition.steps) {
      if (record.steps[step.id].status !== 'pending') continue;

      const blocked = (step.needs ?? []).find((need) => outputs[need] === undefined);
      if (blocked !== undefined) {
        const upstream = record.steps[blocked].status;
        await ledger.skip(
          step.id,
          upstream === 'failed' ? 'upstream-failed' : 'upstream-skipped',
          blocked,
        );
        continue;
      }

      const declared = pipelinesOf(step, request, outputs);
      const missing = declared.find((id) => !registry.some((summary) => summary.id === id));
      if (missing !== undefined) {
        await ledger.skip(step.id, 'pipeline-unavailable', missing);
        continue;
      }

      await ledger.begin(step.id);
      const ctx: StepContext<O, P> = {
        request,
        context: record.context,
        outputs,
        ports: deps.ports,
        pipelines: declared,
        registry,
        acceptAtOf,
        execute: async (input, pipeline) => {
          const child = await deps.execute(
            { ...input, pipeline: chosen(step.id, declared, pipeline) },
            (opened) => {
              void ledger.child(step.id, opened.runId);
            },
          );
          return toRunDto(child);
        },
      };
      const result = await step.run(ctx);
      if (result.reason && !allowed.has(result.reason)) {
        await ledger.end(step.id, {
          status: 'failed',
          reason: 'errored',
          note: `step ${step.id} gave an undeclared reason: ${result.reason}`,
        });
        continue;
      }
      await ledger.end(step.id, result);
      if (result.output !== undefined) {
        (outputs as Record<string, unknown>)[step.id] = result.output;
      }
      if (result.status === 'failed' && result.error) record.error = result.error;
    }
    record.status = record.error === null ? 'complete' : 'failed';
  } catch (error) {
    record.error = describeError(error);
    record.status = 'failed';
    record.steps = closeSteps(record.steps, 'errored', record.error.message, deps.now());
    deps.warn(`failed: ${record.error.message}`);
  } finally {
    record.finishedAt = deps.now();
    await ledger.settled();
  }
}
