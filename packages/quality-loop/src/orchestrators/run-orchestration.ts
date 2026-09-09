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
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { ORCHESTRATION_REASONS } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { toRunDto, type RunRecord } from '../core/contracts';
import type { OrchestratorDefinition, StepContext, StepResult } from './definition';

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
  runId: null,
  note: null,
  counts: {},
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

  child(step: string, runId: string): Promise<void> {
    return this.set(step, { runId });
  }

  end(step: string, outcome: StepResult): Promise<void> {
    return this.set(step, {
      status: outcome.status,
      reason: outcome.reason ?? null,
      note: outcome.note ?? null,
      counts: outcome.counts ?? this.record.steps[step].counts,
      ...(outcome.runId ? { runId: outcome.runId } : {}),
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
  request: StartQualityRunRequest,
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
            runId: stood.runId ?? null,
            note: stood.note ?? null,
            counts: stood.counts ?? {},
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
      maxIterations,
    },
    context,
    steps,
    error: null,
  };
}

/**
 * Run the steps against an opened record, mutating it. Never throws: an error
 * the steps did not expect closes the record as failed with every step
 * explained. The caller persists the record when this resolves.
 */
export async function runOrchestration<O extends object, P>(
  definition: OrchestratorDefinition<O, P>,
  record: OrchestrationRunDto,
  request: StartQualityRunRequest,
  provided: QualityRunDto | null,
  deps: OrchestrationDeps<P>,
): Promise<void> {
  const ledger = new StepLedger(record, deps.flush, deps.now, deps.warn);
  const allowed = new Set<string>([...ORCHESTRATION_REASONS, ...definition.reasons]);
  const outputs: Partial<O> = {};
  const summaries = deps.pipelines();
  const acceptAtOf = (id: string): number | null =>
    summaries.find((summary) => summary.id === id)?.policy.thresholds.acceptAt ?? null;

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

      const pipeline = typeof step.pipeline === 'function' ? step.pipeline(request) : step.pipeline;
      if (pipeline !== undefined && !summaries.some((summary) => summary.id === pipeline)) {
        await ledger.skip(step.id, 'pipeline-unavailable', pipeline);
        continue;
      }

      await ledger.begin(step.id);
      const ctx: StepContext<O, P> = {
        request,
        context: record.context,
        outputs,
        ports: deps.ports,
        acceptAtOf,
        execute: async (input) => {
          if (pipeline === undefined)
            throw new Error(`step ${step.id} declares no pipeline to run`);
          const child = await deps.execute({ ...input, pipeline }, (opened) => {
            void ledger.child(step.id, opened.runId);
          });
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
