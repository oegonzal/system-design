import type {
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  OrchestrationRunDto,
  OrchestrationRunStartedDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityLoopHealthDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import { LoopClient } from '@sysdesign/loop-client';

import { FakeLoop } from './fake-loop';

/**
 * The fake loop behind the shared client port, for a consumer that does not
 * serve HTTP of its own: every call is the fake's answer as a promise, and
 * every error is the fake's own — the same transport-agnostic classes the
 * real HTTP client raises — so nothing here maps anything.
 */
export class FakeLoopClient extends LoopClient {
  constructor(readonly core: FakeLoop = new FakeLoop()) {
    super();
  }

  health(): Promise<QualityLoopHealthDto> {
    return this.answer(() => this.core.health());
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    return this.answer(() => this.core.deriveCriteria(request));
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return this.answer(() => this.core.startRun(request));
  }

  getRun(runId: string): Promise<QualityRunDto | null> {
    return this.answer(() => this.core.getRun(runId));
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return this.answer(() => this.core.listPrompts());
  }

  getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    return this.answer(() => this.core.getPrompt(id));
  }

  startOrchestration(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return this.answer(() => this.core.startOrchestration(orchestrator, request));
  }

  startOrchestrationFromRun(
    orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunStartedDto> {
    return this.answer(() => this.core.startOrchestrationFromRun(orchestrator, request));
  }

  getOrchestration(orchestrationRunId: string): Promise<OrchestrationRunDto | null> {
    return this.answer(() => this.core.getOrchestration(orchestrationRunId));
  }

  private answer<T>(call: () => T): Promise<T> {
    try {
      return Promise.resolve(call());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
