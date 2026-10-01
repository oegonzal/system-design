import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  DeriveCriteriaRequest,
  DerivedCriteriaDto,
  LlmModelDto,
  PromptLibraryDocumentDto,
  PromptLibraryEntryDto,
  QualityRunDto,
  QualityRunStartedDto,
  StartQualityRunRequest,
} from '@sysdesign/contracts';

/** What `GET /health` answers: liveness and which model backs the loop — a booted loop always names one. */
export interface QualityLoopHealth {
  status: string;
  llm: LlmModelDto;
}

/**
 * The statuses every adapter of this port raises when the loop cannot answer
 * — unreachable (503), too slow (504), or answering with an error (502) — as
 * distinct from a run or document it does not have, which is `null`.
 */
export const LOOP_UNAVAILABLE_STATUSES: ReadonlySet<number> = new Set([
  HttpStatus.BAD_GATEWAY,
  HttpStatus.SERVICE_UNAVAILABLE,
  HttpStatus.GATEWAY_TIMEOUT,
]);

/** Whether an error is the loop failing to answer — what a read may survive by saying it does not know. */
export const isLoopUnavailable = (error: unknown): boolean =>
  error instanceof HttpException && LOOP_UNAVAILABLE_STATUSES.has(error.getStatus());

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
  /** The derive stage alone. Throws 503 (with the loop's diagnostic) when the model derived nothing. */
  abstract deriveCriteria(request: DeriveCriteriaRequest): Promise<DerivedCriteriaDto>;
  abstract startRun(request: StartQualityRunRequest): Promise<QualityRunStartedDto>;
  /** Null when the loop has no such run. */
  abstract getRun(runId: string): Promise<QualityRunDto | null>;
  abstract listPrompts(): Promise<PromptLibraryEntryDto[]>;
  /** Null when the library holds no such document. */
  abstract getPrompt(id: string): Promise<PromptLibraryDocumentDto | null>;
}
