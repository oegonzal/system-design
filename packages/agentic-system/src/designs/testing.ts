import { randomUUID } from 'node:crypto';

import {
  fakeRun,
  type OrchestrationRunDto,
  type OrchestrationRunStartedDto,
  type OrchestrationStepDto,
  type QualityLoopHealthDto,
  type QualityRunReadDto,
  type QualityRunStartedDto,
  type QualityRunStatus,
  type StartOrchestrationFromRunRequest,
  type StartOrchestrationRequest,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import { LoopClient } from '@sysdesign/loop-client';

import type { DesignEventSink } from './ports';
import type { MemoryDesignCycle } from './cycle';

const notUsed = (method: string): never => {
  throw new Error(`FakeLoopClient.${method} is not used in this spec`);
};

/** How a fake's runs and orchestrations end: complete unless a spec says otherwise. */
export interface FakeSettling {
  run: QualityRunStatus;
  orchestration: QualityRunStatus;
}

/** What a fake loop is scripted with; every part has a quiet default. */
export interface FakeLoopOptions {
  /** The runs that hold an artifact in their iteration, by id — a memory strategy a space is made from. */
  artifacts?: ReadonlyMap<string, unknown>;
  settled?: Partial<FakeSettling>;
  /** The steps an orchestration started on a goal settles with, by step id: each complete unless the script says more. */
  steps?: Readonly<Record<string, Partial<OrchestrationStepDto>>>;
}

/**
 * A loop that records the coach run and the orchestrations it was asked for,
 * and answers each already settled — complete, unless a spec names another
 * ending in `settled`. A run named in `artifacts` holds that artifact in its
 * iteration, and any other holds none. An orchestration handed a finished run
 * is the cycle's learn step; one started on a goal — a memory space's digest —
 * is answered with the goal and budget it was started on and the steps a spec
 * scripted.
 */
export class FakeLoopClient extends LoopClient {
  readonly runs: StartQualityRunRequest[] = [];
  readonly fromRun: StartOrchestrationFromRunRequest[] = [];
  /** The orchestrations started on a goal, by the id each was answered with. */
  readonly started = new Map<
    string,
    { orchestrator: string; request: StartOrchestrationRequest }
  >();
  private readonly runId = 'coach-run-1';
  private readonly orchestrationRunId = 'learn-run-1';
  private readonly artifacts: ReadonlyMap<string, unknown>;
  private readonly settled: FakeSettling;
  private readonly steps: Readonly<Record<string, Partial<OrchestrationStepDto>>>;

  constructor(options: FakeLoopOptions = {}) {
    super();
    this.artifacts = options.artifacts ?? new Map();
    this.settled = { run: 'complete', orchestration: 'complete', ...options.settled };
    this.steps = options.steps ?? {};
  }
  iterationEvidence(): never {
    return notUsed('iterationEvidence');
  }
  health(): Promise<QualityLoopHealthDto> {
    return Promise.resolve({
      status: 'ok',
      llm: { model: 'fake' },
      heartbeat: { heartbeatEveryMs: 1_000, staleAfterMs: 600_000 },
    });
  }
  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    this.runs.push(request);
    return Promise.resolve({ runId: this.runId, status: 'running' });
  }
  getRun(runId: string): Promise<QualityRunReadDto | null> {
    return Promise.resolve(
      fakeRun('memory-architecture', this.artifacts.get(runId) ?? null, {
        runId,
        status: this.settled.run,
      }),
    );
  }
  startOrchestrationFromRun(
    _orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunStartedDto> {
    this.fromRun.push(request);
    return Promise.resolve({ orchestrationRunId: this.orchestrationRunId, status: 'running' });
  }
  deriveCriteria(): Promise<never> {
    return Promise.resolve(notUsed('deriveCriteria'));
  }
  listPrompts(): Promise<never> {
    return Promise.resolve(notUsed('listPrompts'));
  }
  getPrompt(): Promise<never> {
    return Promise.resolve(notUsed('getPrompt'));
  }
  startOrchestration(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): Promise<OrchestrationRunStartedDto> {
    const orchestrationRunId = randomUUID();
    this.started.set(orchestrationRunId, { orchestrator, request });
    return Promise.resolve({ orchestrationRunId, status: 'running' });
  }
  getOrchestration(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    const run = fakeRun('memory-architecture', null, { runId: this.runId });
    const started = this.started.get(orchestrationRunId);
    return Promise.resolve({
      orchestrationRunId,
      orchestrator: started?.orchestrator ?? 'memory-design',
      pipeline: started === undefined ? 'memory-architecture' : null,
      status: this.settled.orchestration,
      startedAt: run.startedAt,
      finishedAt: run.startedAt,
      request: {
        ...run.request,
        goal: started?.request.goal ?? run.request.goal,
        maxIterations: started?.request.maxIterations ?? run.request.maxIterations,
        samples: null,
      },
      openedBy: null,
      context: {},
      steps: started === undefined ? {} : this.scriptedSteps(run.startedAt),
      error: null,
    });
  }
  retractMemory(): Promise<never> {
    return Promise.resolve(notUsed('retractMemory'));
  }

  /** The scripted steps as the record holds them: each complete at `at`, unless the script says more. */
  private scriptedSteps(at: string): Record<string, OrchestrationStepDto> {
    return Object.fromEntries(
      Object.entries(this.steps).map(([id, step]): [string, OrchestrationStepDto] => [
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
        },
      ]),
    );
  }
}

/** A sink that records the cycles announced, so a spec can assert the lifecycle it emitted. */
export class FakeEventSink implements DesignEventSink {
  readonly emitted: MemoryDesignCycle[] = [];
  emit(cycle: MemoryDesignCycle): Promise<void> {
    this.emitted.push(cycle);
    return Promise.resolve();
  }
}
