import {
  fakeRun,
  type OrchestrationRunDto,
  type OrchestrationRunStartedDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type QualityRunStatus,
  type StartOrchestrationFromRunRequest,
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

/**
 * A loop that records the coach run and the orchestration it was asked for,
 * and answers each already settled — complete, unless a spec names another
 * ending in `settled`. A run named in `artifacts` holds that artifact in its
 * iteration — a memory strategy a space is made from — and any other holds none.
 */
export class FakeLoopClient extends LoopClient {
  readonly runs: StartQualityRunRequest[] = [];
  readonly fromRun: StartOrchestrationFromRunRequest[] = [];
  private readonly runId = 'coach-run-1';
  private readonly orchestrationRunId = 'learn-run-1';
  private readonly artifacts: ReadonlyMap<string, unknown>;
  private readonly settled: FakeSettling;

  constructor(
    options: { artifacts?: ReadonlyMap<string, unknown>; settled?: Partial<FakeSettling> } = {},
  ) {
    super();
    this.artifacts = options.artifacts ?? new Map();
    this.settled = { run: 'complete', orchestration: 'complete', ...options.settled };
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
  getRun(runId: string): Promise<QualityRunDto | null> {
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
  startOrchestration(): Promise<never> {
    return Promise.resolve(notUsed('startOrchestration'));
  }
  getOrchestration(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    const run = fakeRun('memory-architecture', null, { runId: this.runId });
    return Promise.resolve({
      orchestrationRunId,
      orchestrator: 'memory-design',
      pipeline: 'memory-architecture',
      status: this.settled.orchestration,
      startedAt: run.startedAt,
      finishedAt: run.startedAt,
      request: { ...run.request, samples: null },
      openedBy: null,
      context: {},
      steps: {},
      error: null,
    });
  }
  retractMemory(): Promise<never> {
    return Promise.resolve(notUsed('retractMemory'));
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
