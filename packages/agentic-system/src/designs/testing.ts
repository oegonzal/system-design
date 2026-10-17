import {
  fakeRun,
  type OrchestrationRunStartedDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type StartOrchestrationFromRunRequest,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import { LoopClient } from '@sysdesign/loop-client';

import type { DesignEventSink } from './ports';
import type { MemoryDesignCycle } from './cycle';

const notUsed = (method: string): never => {
  throw new Error(`FakeLoopClient.${method} is not used in this spec`);
};

/** A loop that records the coach run it was asked for and answers it finished. */
export class FakeLoopClient extends LoopClient {
  readonly runs: StartQualityRunRequest[] = [];
  readonly fromRun: StartOrchestrationFromRunRequest[] = [];
  constructor(
    private readonly runId = 'coach-run-1',
    private readonly orchestrationRunId = 'learn-run-1',
  ) {
    super();
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
    return Promise.resolve(fakeRun('memory-architecture', null, { runId }));
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
  getOrchestration(): Promise<never> {
    return Promise.resolve(notUsed('getOrchestration'));
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
