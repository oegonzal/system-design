import type { ZodType } from 'zod';

/**
 * The one seam every LLM feature goes through — prompt enrichment in the API,
 * the design critic in the eval worker. Callers never construct an SDK client
 * or read env vars; they receive an `LlmClient` and behave identically
 * whether it is the real thing or the no-op.
 *
 * The contract is deliberately narrow: one structured call, `null` on any
 * failure. Every caller must already have a deterministic answer it is
 * improving on, so "the model was unavailable / refused / returned junk" is
 * never an error path — it is the deterministic path.
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
  /** False for the no-op client — callers may skip prompt assembly entirely. */
  readonly enabled: boolean;
  /** Model id in use, or null when disabled. Persisted for audit (e.g. evaluation.criticModel). */
  readonly model: string | null;
  /** Returns the validated object, or null on refusal, parse failure, or API error. */
  completeStructured<T>(request: StructuredRequest<T>): Promise<T | null>;
}
