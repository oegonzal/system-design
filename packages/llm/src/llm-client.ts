import type { ZodType } from 'zod';

/**
 * The one seam every model call goes through. Callers never construct an SDK
 * client or read env vars; they receive an `LlmClient` and behave identically
 * on either provider route.
 *
 * The contract is deliberately narrow: one structured call, `null` on any
 * failure — a refusal, a parse miss, an API error. A caller records that as
 * `llm-failed` and carries on honestly; it never invents an answer. A process
 * that would call a model and has no provider does not boot, so there is no
 * "disabled" client to branch on.
 */
export interface StructuredRequest<T> {
  /** System prompt — role, constraints, tone. */
  system: string;
  /** The task input. */
  user: string;
  /** Zod schema the response must satisfy (enforced via structured outputs). */
  schema: ZodType<T>;
  /** Response token ceiling. Callers know how big their answer should be. */
  maxTokens?: number;
}

export interface LlmClient {
  /** Model id in use. Persisted for audit beside every run. */
  readonly model: string;
  /** Returns the validated object, or null on refusal, parse failure, or API error. */
  completeStructured<T>(request: StructuredRequest<T>): Promise<T | null>;
}
