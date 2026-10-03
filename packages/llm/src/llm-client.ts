import type { Overrun, SchemaIssue } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/**
 * The one seam every model call goes through. Callers never construct an SDK
 * client or read env vars; they receive an `LlmClient` and never learn what
 * backs it — today one provider, Claude Code on the subscription login.
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
  /**
   * Zod schema the response must satisfy. The model is shown it as JSON
   * Schema with every declared bound at its target; the reply is parsed to the
   * ceilings with the salvage ladder, so a size overrun is kept and recorded
   * and only a structural fault refuses.
   */
  schema: ZodType<T>;
  /**
   * The turn's expected output in tokens, thinking included: the most this
   * ask is expected to write, sized from measured turns with headroom over
   * the largest. It is the caller's sizing, not a cap the provider enforces:
   * an adapter may write a turn in several API calls, each under its own
   * per-call ceiling, so a declaration may exceed that ceiling. The call's
   * time limit derives from it, which is why a declaration below what a
   * stage writes is a timeout waiting to happen, and the record keeps it
   * beside the usage and the API calls so the three compare.
   */
  maxTokens?: number;
}

export interface LlmClient {
  /** Model id in use. Persisted for audit beside every run. */
  readonly model: string;
  /** Returns the validated object, or null on refusal, parse failure, or API error. */
  completeStructured<T>(request: StructuredRequest<T>): Promise<T | null>;
}

/**
 * One call's answer with what the seam knows about it: the faults of the
 * last refused reply when there is no value, the fields past their target
 * when there is one. `LlmClient` stays one method wide and `null` on any
 * failure; this is the same call for a caller that wants to say why — to
 * brief the next produce with what broke, or to warn about a field that was
 * kept over its bound.
 */
export interface StructuredReply<T> {
  /** The validated object, or null on refusal, parse failure, or API error. */
  value: T | null;
  /**
   * On a null value: every fault of the last reply the schema refused, in
   * the one wording `describeIssue` gives — the final attempt's, or an
   * earlier one's when the final attempt failed some other way. Empty when no
   * reply reached the schema — an API error, nothing parsed — and always
   * empty beside a value.
   */
  issues: SchemaIssue[];
  /** Beside a value: every field past its target, as the seam kept it. Empty beside null. */
  overruns: Overrun[];
}

/**
 * A client that can answer in detail. A separate capability, like
 * `LlmRecordable`, so `LlmClient` keeps its one method and every hand-rolled
 * double keeps compiling; `completeStructured` is this call's value.
 */
export interface LlmDetailed {
  completeStructuredDetailed<T>(request: StructuredRequest<T>): Promise<StructuredReply<T>>;
}

/**
 * The client as a detailed one. A client that cannot answer in detail — a
 * spec's plain fake, say — answers through `completeStructured`, with no
 * issues and no overruns: it does not know them, and the caller has a value
 * or `null` exactly as before. Total, so a caller never branches on the
 * capability.
 */
export function asDetailed(client: LlmClient): LlmDetailed {
  const candidate = client as Partial<LlmDetailed>;
  if (typeof candidate.completeStructuredDetailed === 'function') {
    return candidate as LlmDetailed;
  }
  return {
    completeStructuredDetailed: async (request) => ({
      value: await client.completeStructured(request),
      issues: [],
      overruns: [],
    }),
  };
}
