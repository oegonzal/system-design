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
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { ORCHESTRATION_REASONS } from '@sysdesign/contracts';

import type { RunInput } from '../core/run-pipeline';

export interface StepResult<V = unknown> {
  status: 'complete' | 'skipped' | 'failed';
  /** One of the runner's reasons or the orchestrator's declared ones; anything else fails the step. */
  reason?: string | null;
  note?: string | null;
  counts?: Record<string, number>;
  /** The child runs, when the step ran them; the runner also records each as it opens. */
  runIds?: readonly string[];
  /** What the step reports beyond counts — the orchestrator's own shape. */
  report?: Record<string, unknown>;
  /** A failure that ends the whole run as failed, not only this step. */
  error?: RunErrorDto | null;
  /** What later steps may consume. A step that yields nothing blocks the steps that need it. */
  output?: V;
}

export interface StepContext<O extends object, P> {
  request: StartOrchestrationRequest;
  /** What the orchestrator observed at open — its own shape. */
  context: Record<string, unknown>;
  /** What earlier steps produced, by step id. */
  outputs: Partial<O>;
  ports: P;
  /** The pipelines this step declared, resolved for this run; `execute` may run only these. */
  pipelines: readonly string[];
  /** Every registered pipeline's summary, read once when the run opened. */
  registry: readonly PipelineSummary[];
  /**
   * Run one of this step's declared pipelines — the only one when one is
   * declared, else the one named. The runner records the child id as soon as
   * it opens.
   */
  execute(input: RunInput, pipeline?: string): Promise<QualityRunDto>;
  /** A registered pipeline's own accept bar; null when it is not registered. */
  acceptAtOf(pipeline: string): number | null;
}

/** One registered pipeline, or several a step may choose between. */
export type PipelineChoice = string | readonly string[];

/** A choice made at run time, from the request and what earlier steps produced. */
export type PipelineChooser<O extends object> = (
  request: StartOrchestrationRequest,
  outputs: Partial<O>,
) => PipelineChoice | undefined;

export interface OrchestratorStep<O extends object, P> {
  id: keyof O & string;
  /** Steps whose output this one consumes; without it the step is skipped, naming the one that blocked. */
  needs?: readonly (keyof O & string)[];
  /**
   * The registered pipeline(s) this step may run — a name, a list of names,
   * or a choice made from the request and what ran before. Declared, so the
   * map reads as data and a step can never run a pipeline it did not name.
   */
  pipeline?: PipelineChoice | PipelineChooser<O>;
  /** When a run is handed in instead of produced, this stands in for running the step. */
  provided?: (run: QualityRunDto) => StepResult<O[keyof O]>;
  run(ctx: StepContext<O, P>): Promise<StepResult<O[keyof O]>>;
}

export interface OrchestratorDefinition<O extends object = Record<string, unknown>, P = unknown> {
  id: string;
  version: string;
  description: string;
  /** Whether the request names a target pipeline: required when true, refused when false. */
  takesTarget: boolean;
  /** Reasons its steps may give beyond the runner's own. Closed, so a client maps tones and never prose. */
  reasons: readonly string[];
  /** The request as the record and every step should see it — a goal stripped of what a previous run appended, say. */
  normalize?: (request: StartOrchestrationRequest) => StartOrchestrationRequest;
  /** A request the orchestrator will not run, and why; null when acceptable. Checked before a row exists. */
  refuse?: (
    request: StartOrchestrationRequest,
    pipelines: readonly PipelineSummary[],
  ) => string | null;
  /** What the run observed at open, recorded on the row for every step to read. */
  context(ports: P): Promise<Record<string, unknown>>;
  steps: readonly OrchestratorStep<O, P>[];
}

export const describeOrchestratorId = (
  definition: OrchestratorDefinition<Record<string, unknown>, unknown>,
): string => `${definition.id}@${definition.version}`;

/** The pipelines a step declared, resolved for one run; empty when it runs none. */
export function pipelinesOf<O extends object, P>(
  step: OrchestratorStep<O, P>,
  request: StartOrchestrationRequest,
  outputs: Partial<O>,
): readonly string[] {
  const choice =
    typeof step.pipeline === 'function' ? step.pipeline(request, outputs) : step.pipeline;
  if (choice === undefined) return [];
  return typeof choice === 'string' ? [choice] : choice;
}

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
    if (Array.isArray(step.pipeline)) {
      if (step.pipeline.length === 0) fail(`step ${step.id} declares an empty list of pipelines`);
      if (new Set(step.pipeline).size !== step.pipeline.length) {
        fail(`step ${step.id} declares a pipeline twice`);
      }
    }
    seen.add(step.id);
  }
  for (const reason of definition.reasons) {
    if ((ORCHESTRATION_REASONS as readonly string[]).includes(reason)) {
      fail(`reason ${reason} belongs to the runner and may not be redeclared`);
    }
  }
}
