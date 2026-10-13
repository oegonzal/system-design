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
  RetractedMemoryRunDto,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

/**
 * The one port onto the quality loop, for every program that asks it to
 * judge: the studio, a browser session, a document ingester. Abstract class
 * rather than an interface so it doubles as a Nest injection token where a
 * consumer uses Nest, and costs nothing where one does not. Failures are the
 * transport-agnostic errors in `loop-errors.ts`; a read of something the loop
 * does not have is `null`.
 */
export abstract class LoopClient {
  /** The loop's `GET /health` as it answered — an older build may leave out what a newer one reports. */
  abstract health(): Promise<QualityLoopHealthDto>;
  /** The derive stage alone. Throws `DerivationFailed` (with the loop's diagnostic) when the model derived nothing. */
  abstract deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto>;
  abstract startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto>;
  /** Null when the loop has no such run. */
  abstract getRun(runId: string): Promise<QualityRunDto | null>;
  abstract listPrompts(): Promise<PromptLibraryEntryDto[]>;
  /** Null when the library holds no such document. */
  abstract getPrompt(id: string): Promise<PromptLibraryDocumentDto | null>;
  /** `POST /orchestrations/:orchestrator` — start an orchestration on a goal. Answers its id. */
  abstract startOrchestration(
    orchestrator: string,
    request: StartOrchestrationRequest,
  ): Promise<OrchestrationRunStartedDto>;
  /**
   * `POST /orchestrations/:orchestrator/from-run` — start from a run that
   * already happened, standing in for the steps the orchestrator lets a
   * provided run stand in for. Nothing is re-run and nothing is judged again.
   */
  abstract startOrchestrationFromRun(
    orchestrator: string,
    request: StartOrchestrationFromRunRequest,
  ): Promise<OrchestrationRunStartedDto>;
  /** Null when the loop has no such orchestration. */
  abstract getOrchestration(orchestrationRunId: string): Promise<OrchestrationRunDto | null>;
  /** `DELETE /memory/:id` — every point a digest run stored, gone; how many went. Idempotent. */
  abstract retractMemory(digestRunId: string): Promise<RetractedMemoryRunDto>;
}
