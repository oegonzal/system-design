import type {
  OrchestrationRunDto,
  OrchestrationRunStartedDto,
  OrchestrationStepDto,
  QualityRunDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';

export interface FakeOrchestrationDeps {
  prefix: () => string;
  now: () => string;
  runOf: (runId: string) => QualityRunDto | null;
}

/**
 * The loop's orchestrations as the fake records them. An orchestration starts
 * `running` with no steps and settles when a spec says so — with the steps it
 * describes — because the programs that start one only fire it and read it
 * back; no step is simulated. A start from a run records the run id, so a
 * spec can assert what was handed over.
 */
export class FakeOrchestrations {
  readonly records = new Map<string, OrchestrationRunDto>();
  readonly startRequests: { orchestrator: string; request: StartOrchestrationRequest }[] = [];
  /** Run ids handed to an orchestrator from-run, in order — what the studio asked to have digested. */
  readonly digested: string[] = [];
  private sequence = 0;

  constructor(private readonly deps: FakeOrchestrationDeps) {}

  reset(): void {
    this.records.clear();
    this.startRequests.length = 0;
    this.digested.length = 0;
    this.sequence = 0;
  }

  start(orchestrator: string, request: StartOrchestrationRequest): OrchestrationRunStartedDto {
    this.startRequests.push({ orchestrator, request });
    const orchestrationRunId = `${this.deps.prefix()}-orchestration-${++this.sequence}`;
    return this.open(orchestrationRunId, orchestrator, request.pipeline ?? null, {
      goal: request.goal,
      outputProvided: request.output !== undefined,
      criteriaProvided: request.criteria !== undefined,
      adoptedFrom: request.adopt ?? null,
      maxIterations: request.maxIterations ?? 1,
      samples: request.samples ?? null,
    });
  }

  startFromRun(
    orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): OrchestrationRunStartedDto {
    const run = this.deps.runOf(request.runId);
    if (run === null) throw new LoopRefused(404, `run ${request.runId} not found`);
    this.digested.push(request.runId);
    const orchestrationRunId = `${this.deps.prefix()}-digest-${this.digested.length}`;
    return this.open(orchestrationRunId, orchestrator, run.pipeline, {
      ...run.request,
      samples: request.samples ?? null,
    });
  }

  get(orchestrationRunId: string): OrchestrationRunDto | null {
    return this.records.get(orchestrationRunId) ?? null;
  }

  /** Settle an orchestration with the steps a spec describes; it fails when any step did. */
  complete(
    orchestrationRunId: string,
    steps: Record<string, Partial<OrchestrationStepDto>> = {},
  ): void {
    const record = this.require(orchestrationRunId);
    const at = this.deps.now();
    record.steps = Object.fromEntries(
      Object.entries(steps).map(([id, step]) => [
        id,
        {
          status: 'complete',
          reason: null,
          runIds: [],
          note: null,
          counts: {},
          report: null,
          startedAt: at,
          finishedAt: at,
          ...step,
        } satisfies OrchestrationStepDto,
      ]),
    );
    const failed = Object.values(record.steps).some((step) => step.status === 'failed');
    record.status = failed ? 'failed' : 'complete';
    record.finishedAt = at;
  }

  fail(orchestrationRunId: string, message: string): void {
    const record = this.require(orchestrationRunId);
    record.status = 'failed';
    record.finishedAt = this.deps.now();
    record.error = { name: 'Error', message, stack: null };
  }

  private open(
    orchestrationRunId: string,
    orchestrator: string,
    pipeline: string | null,
    request: OrchestrationRunDto['request'],
  ): OrchestrationRunStartedDto {
    this.records.set(orchestrationRunId, {
      orchestrationRunId,
      orchestrator,
      pipeline,
      status: 'running',
      startedAt: this.deps.now(),
      finishedAt: null,
      request,
      context: {},
      steps: {},
      error: null,
    });
    return { orchestrationRunId, status: 'running' };
  }

  private require(orchestrationRunId: string): OrchestrationRunDto {
    const record = this.records.get(orchestrationRunId);
    if (!record) throw new Error(`fake quality loop has no orchestration ${orchestrationRunId}`);
    return record;
  }
}
