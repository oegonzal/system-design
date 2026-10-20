import {
  MEMORY_ORCHESTRATOR_ID,
  type DeriveCriteriaRequest,
  type DerivedCriteriaDto,
  type IterationEvidenceDto,
  type IterationRef,
  type OrchestrationRunStartedDto,
  type PromptLibraryDocumentDto,
  type PromptLibraryEntryDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
  type QualityRunStartedDto,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import { answer } from './loop-exceptions';
import { QualityLoopClient } from './quality-loop.client';

/**
 * The studio's port over the shared client: every call is the client's, and
 * every failure is mapped once onto the studio's gateway statuses. Behind it
 * sits the HTTP adapter in production and the fake in the specs; this class
 * knows neither.
 */
export class NestQualityLoopClient extends QualityLoopClient {
  constructor(private readonly inner: LoopClient) {
    super();
  }

  health(): Promise<QualityLoopHealthDto> {
    return answer(() => this.inner.health());
  }

  deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto> {
    return answer(() => this.inner.deriveCriteria(request));
  }

  startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto> {
    return answer(() => this.inner.startRun(request));
  }

  getRun(runId: string): Promise<QualityRunDto | null> {
    return answer(() => this.inner.getRun(runId));
  }

  iterationEvidence(refs: readonly IterationRef[]): Promise<IterationEvidenceDto[]> {
    return this.inner.iterationEvidence(refs);
  }

  listPrompts(): Promise<PromptLibraryEntryDto[]> {
    return answer(() => this.inner.listPrompts());
  }

  getPrompt(id: string): Promise<PromptLibraryDocumentDto | null> {
    return answer(() => this.inner.getPrompt(id));
  }

  digestRun(runId: string): Promise<OrchestrationRunStartedDto> {
    return answer(() => this.inner.startOrchestrationFromRun(MEMORY_ORCHESTRATOR_ID, { runId }));
  }
}
