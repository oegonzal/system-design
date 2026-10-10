/**
 * The runner: one loop over a declared map of steps. It seeds the ledger from
 * the declaration, runs each step in order, skips what its upstream did not
 * deliver, records every transition through the ledger, and closes the record
 * on an error it did not expect. It knows no step by name.
 */
import type {
  OrchestrationRunDto,
  PipelineSummary,
  QualityRunDto,
  StartOrchestrationRequest,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { openedAs, ORCHESTRATION_REASONS } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import { toRunDto, type RunRecord } from '../../core/contracts';
import {
  pipelinesOf,
  type OrchestratorDefinition,
  type OrchestratorStep,
  type StepContext,
  type StepResult,
} from './definition';
import { StepLedger } from './ledger';
import { closeSteps } from './record';

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

/** A provided run's outputs are known before anything runs: every stand-in that yields one seeds the map. */
function seedProvidedOutputs<O extends object, P>(
  definition: OrchestratorDefinition<O, P>,
  provided: QualityRunDto,
  outputs: Partial<O>,
): void {
  for (const step of definition.steps) {
    const stood = step.provided?.(provided);
    if (stood?.output !== undefined) {
      (outputs as Record<string, unknown>)[step.id] = stood.output;
    }
  }
}

/** The upstream step this one needs that delivered nothing, if any. */
const blockedBy = <O extends object, P>(
  step: OrchestratorStep<O, P>,
  outputs: Partial<O>,
): string | undefined => (step.needs ?? []).find((need) => outputs[need] === undefined);

/** A declared pipeline the registry does not hold, if any. */
const missingPipeline = (
  declared: readonly string[],
  registry: readonly PipelineSummary[],
): string | undefined => declared.find((id) => !registry.some((summary) => summary.id === id));

/** A registered pipeline's own accept bar; null when it is not registered. */
const acceptBarIn =
  (registry: readonly PipelineSummary[]) =>
  (id: string): number | null =>
    registry.find((summary) => summary.id === id)?.policy.thresholds.acceptAt ?? null;

/** Everything one run's steps share: the request, the record, the outputs so far, the registry, the deps and the ledger. */
interface Running<O extends object, P> {
  request: StartOrchestrationRequest;
  record: OrchestrationRunDto;
  outputs: Partial<O>;
  registry: readonly PipelineSummary[];
  deps: OrchestrationDeps<P>;
  ledger: StepLedger;
}

/**
 * What a step is shown, and the one way it may run a pipeline: through the
 * runner, against its declared list, with the child id recorded as soon as
 * it opens.
 */
function stepContextFor<O extends object, P>(
  step: OrchestratorStep<O, P>,
  declared: readonly string[],
  running: Running<O, P>,
): StepContext<O, P> {
  const { request, record, outputs, registry, deps, ledger } = running;
  return {
    request,
    context: record.context,
    outputs,
    ports: deps.ports,
    pipelines: declared,
    registry,
    acceptAtOf: acceptBarIn(registry),
    execute: async (input, pipeline) => {
      const { criteria, ...rest } = input;
      // Every run a step opens is opened by whoever opened the orchestration.
      const child = await deps.execute(
        openedAs<StartQualityRunRequest>(
          {
            ...rest,
            ...(criteria === undefined ? {} : { criteria: [...criteria] }),
            pipeline: chosen(step.id, declared, pipeline),
          },
          record.openedBy,
        ),
        (opened) => {
          void ledger.child(step.id, opened.runId);
        },
      );
      return toRunDto(child);
    },
  };
}

/** A reason the orchestrator never declared fails the step as errored, naming the reason it gave. */
const undeclaredReason = <O extends object, P>(
  step: OrchestratorStep<O, P>,
  result: StepResult,
  allowed: ReadonlySet<string>,
): StepResult | null =>
  result.reason && !allowed.has(result.reason)
    ? {
        status: 'failed',
        reason: 'errored',
        note: `step ${step.id} gave an undeclared reason: ${result.reason}`,
      }
    : null;

/** An error the steps did not expect: the record fails, every step is explained, the warning is logged. */
function closeOnError<P>(
  record: OrchestrationRunDto,
  error: unknown,
  deps: OrchestrationDeps<P>,
): void {
  record.error = describeError(error);
  record.status = 'failed';
  record.steps = closeSteps(record.steps, 'errored', record.error.message, deps.now());
  deps.warn(`failed: ${record.error.message}`);
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
  const running: Running<O, P> = { request, record, outputs, registry, deps, ledger };
  if (provided !== null) seedProvidedOutputs(definition, provided, outputs);

  try {
    for (const step of definition.steps) {
      if (record.steps[step.id].status !== 'pending') continue;

      const blocked = blockedBy(step, outputs);
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
      const missing = missingPipeline(declared, registry);
      if (missing !== undefined) {
        await ledger.skip(step.id, 'pipeline-unavailable', missing);
        continue;
      }

      await ledger.begin(step.id);
      const result = await step.run(stepContextFor(step, declared, running));
      const refused = undeclaredReason(step, result, allowed);
      if (refused !== null) {
        await ledger.end(step.id, refused);
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
    closeOnError(record, error, deps);
  } finally {
    record.finishedAt = deps.now();
    await ledger.settled();
  }
}
