/**
 * The harness the orchestrator specs share: a registry entry, deps over a
 * scripted `execute` that keep every flushed snapshot, a step context over
 * fake ports, and one call that opens a record and runs a definition against
 * it. Pure helpers only — no vitest imports.
 */
import type {
  GoalSource,
  OrchestrationRunDto,
  PipelineSummary,
  QualityRunDto,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';

import type { OrchestratorDefinition, StepContext } from './definition';
import { openRecord } from './record';
import { runOrchestration, type OrchestrationDeps } from './run-orchestration';

/** A registered pipeline as an orchestrator reads it: its id, a description, its goal source, its accept bar. */
export const summaryOf = (
  id: string,
  acceptAt = 80,
  goalSource: GoalSource = 'brief',
): PipelineSummary =>
  ({
    id,
    description: `${id} grades`,
    goalSource,
    policy: { thresholds: { acceptAt } },
  }) as PipelineSummary;

export type FakeDeps<P> = OrchestrationDeps<P> & {
  /** Every record the runner flushed, as it stood at that moment. */
  flushed: OrchestrationRunDto[];
};

/** Deps over a scripted `execute`: one tiny pipeline registered, a fixed clock, a silent warn. */
export function orchestrationDeps<P>(
  ports: P,
  execute: OrchestrationDeps<P>['execute'],
  overrides: Partial<OrchestrationDeps<P>> = {},
): FakeDeps<P> {
  const flushed: OrchestrationRunDto[] = [];
  return {
    flushed,
    ports,
    pipelines: () => [summaryOf('tiny')],
    execute,
    flush: (record) => {
      flushed.push(structuredClone(record));
      return Promise.resolve();
    },
    now: () => 'now',
    warn: () => undefined,
    ...overrides,
  };
}

/** A record opened for the request and run to the end; what the runner left behind. */
export async function performed<O extends object, P>(
  definition: OrchestratorDefinition<O, P>,
  request: StartOrchestrationRequest,
  deps: OrchestrationDeps<P>,
  options: { provided?: QualityRunDto | null; context?: Record<string, unknown> } = {},
): Promise<OrchestrationRunDto> {
  const provided = options.provided ?? null;
  const record = openRecord(definition, request, provided, options.context ?? {}, 1, deps.now);
  await runOrchestration(definition, record, request, provided, deps);
  return record;
}

/** A step context over the ports and `execute` given; one tiny pipeline declared, an accept bar of 80. */
export function fakeStepContext<O extends object, P>(
  ports: P,
  execute: StepContext<O, P>['execute'],
  overrides: Partial<StepContext<O, P>> = {},
): StepContext<O, P> {
  return {
    request: { pipeline: 'tiny', goal: 'g' },
    context: {},
    outputs: {},
    ports,
    pipelines: ['tiny'],
    registry: [],
    acceptAtOf: () => 80,
    execute,
    ...overrides,
  };
}
