import type {
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  LlmAvailabilityDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

/** What `GET /health` answers: liveness and which model backs the loop. */
export interface QualityLoopHealth {
  status: string;
  llm: LlmAvailabilityDto;
}

/**
 * The studio's port onto the quality loop — the only thing in this API that
 * knows there is a grader. Every judgement about a design, every rubric and
 * every drafted prompt comes through here; the studio itself validates
 * structure and stores what comes back. Abstract class rather than an
 * interface so it doubles as the Nest injection token: the HTTP adapter is
 * bound in production and a fake in the specs, and nothing else changes.
 */
export abstract class QualityLoopClient {
  abstract health(): Promise<QualityLoopHealth>;
  /** The derive stage alone. Throws 503 (with the availability) when no model backs the loop. */
  abstract deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto>;
  abstract startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto>;
  /** Null when the loop has no such run. */
  abstract getRun(runId: string): Promise<QualityRunDto | null>;
  abstract listPrompts(): Promise<PromptLibraryEntryDto[]>;
  /** Null when the library holds no such document. */
  abstract getPrompt(id: string): Promise<PromptLibraryDocumentDto | null>;
}
