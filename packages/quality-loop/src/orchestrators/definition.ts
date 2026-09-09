/**
 * An orchestrator is data: which registered pipelines run, in what order,
 * what each step needs from the ones before it, and the closed reasons its
 * steps may give. The only code a step brings is an adapter that turns
 * upstream outputs into a run and reads the run back — the codecs already
 * live beside the pipelines. One generic runner executes any of them.
 */
import type {
  PipelineSummary,
  QualityRunDto,
  RunErrorDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { ORCHESTRATION_REASONS } from '@sysdesign/contracts';

import type { RunInput } from '../core/run-pipeline';

export interface StepResult<V = unknown> {
  status: 'complete' | 'skipped' | 'failed';
  /** One of the runner's reasons or the orchestrator's declared ones; anything else fails the step. */
  reason?: string | null;
  note?: string | null;
  counts?: Record<string, number>;
  /** The child run, when the step ran one; the runner also records it as the child opens. */
  runId?: string | null;
  /** A failure that ends the whole run as failed, not only this step. */
  error?: RunErrorDto | null;
  /** What later steps may consume. A step that yields nothing blocks the steps that need it. */
  output?: V;
}

export interface StepContext<O extends object, P> {
  request: StartQualityRunRequest;
  /** What the orchestrator observed at open — its own shape. */
  context: Record<string, unknown>;
  /** What earlier steps produced, by step id. */
  outputs: Partial<O>;
  ports: P;
  /** Run this step's declared pipeline; the runner records the child id as soon as it opens. */
  execute(input: RunInput): Promise<QualityRunDto>;
  /** A registered pipeline's own accept bar; null when it is not registered. */
  acceptAtOf(pipeline: string): number | null;
}

export interface OrchestratorStep<O extends object, P> {
  id: keyof O & string;
  /** Steps whose output this one consumes; without it the step is skipped, naming the one that blocked. */
  needs?: readonly (keyof O & string)[];
  /** The registered pipeline this step runs, when it runs one — declared, so the map reads as data. */
  pipeline?: string | ((request: StartQualityRunRequest) => string);
  /** When a run is handed in instead of produced, this stands in for running the step. */
  provided?: (run: QualityRunDto) => StepResult<O[keyof O]>;
  run(ctx: StepContext<O, P>): Promise<StepResult<O[keyof O]>>;
}

export interface OrchestratorDefinition<O extends object = Record<string, unknown>, P = unknown> {
  id: string;
  version: string;
  description: string;
  /** Reasons its steps may give beyond the runner's own. Closed, so a client maps tones and never prose. */
  reasons: readonly string[];
  /** The request as the record and every step should see it — a goal stripped of what a previous run appended, say. */
  normalize?: (request: StartQualityRunRequest) => StartQualityRunRequest;
  /** A request the orchestrator will not run, and why; null when acceptable. Checked before a row exists. */
  refuse?: (
    request: StartQualityRunRequest,
    pipelines: readonly PipelineSummary[],
  ) => string | null;
  /** What the run observed at open, recorded on the row for every step to read. */
  context(ports: P): Promise<Record<string, unknown>>;
  steps: readonly OrchestratorStep<O, P>[];
}

export const describeOrchestratorId = (
  definition: OrchestratorDefinition<Record<string, unknown>, unknown>,
): string => `${definition.id}@${definition.version}`;

/**
 * Fails fast on a malformed orchestrator — at boot, never mid-run. Structure
 * only: whether a declared pipeline is registered is a deployment fact, and a
 * step whose pipeline is missing is skipped `pipeline-unavailable` at run time
 * rather than keeping the whole service from starting.
 */
export function validateOrchestrator(
  definition: OrchestratorDefinition<Record<string, unknown>, unknown>,
): void {
  const name = describeOrchestratorId(definition);
  const fail = (message: string): never => {
    throw new Error(`orchestrator ${name}: ${message}`);
  };
  if (definition.steps.length === 0) fail('declares no steps');
  const seen = new Set<string>();
  for (const step of definition.steps) {
    if (step.id.length === 0) fail('a step has an empty id');
    if (seen.has(step.id)) fail(`step ${step.id} is declared twice`);
    for (const need of step.needs ?? []) {
      if (!seen.has(need)) fail(`step ${step.id} needs ${need}, which does not run before it`);
    }
    seen.add(step.id);
  }
  for (const reason of definition.reasons) {
    if ((ORCHESTRATION_REASONS as readonly string[]).includes(reason)) {
      fail(`reason ${reason} belongs to the runner and may not be redeclared`);
    }
  }
}
