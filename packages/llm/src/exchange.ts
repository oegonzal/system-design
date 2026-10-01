import type { LlmExchangeOutcome } from '@sysdesign/contracts';

import type { LlmClient } from './llm-client';

/**
 * What actually happened on one call to the model.
 *
 * `LlmClient` promises one method and `null` on any failure — that narrowness
 * is deliberate, and this does not widen it. But the narrowness means a caller
 * cannot tell a refusal from a schema miss from an API error, and never sees
 * the prompt it sent beside the answer it got. Both facts live inside the
 * adapter and die there.
 *
 * So recording is a SEPARATE capability an adapter may offer. `LlmClient` stays
 * one method wide, and every hand-rolled test double keeps compiling without
 * implementing it.
 */
export interface LlmCall {
  model: string;
  system: string;
  user: string;
  /**
   * The response schema as JSON Schema. Never the Zod instance — that is a live
   * object graph, and stringifying it yields junk.
   */
  schema: unknown;
  maxTokens: number;
  startedAt: string;
  durationMs: number;
  /**
   * The distinction the port erases. `refusal` and `schema-miss` both came back
   * from a well-formed response; `error` never reached one.
   */
  outcome: LlmExchangeOutcome;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  requestId: string | null;
  /** The raw text blocks of the whole turn, joined — what the model actually wrote. */
  text: string | null;
  /** The validated object, or null. */
  response: unknown;
  /**
   * Why there is no response: the provider's reason on an `error`, the
   * schema's complaint on a `schema-miss` — which bound was crossed, or that
   * no object parsed at all. Null on `ok`.
   */
  error: { name: string; message: string } | null;
  /**
   * Which try this was within one `completeStructured` call, 1-based. One call
   * may record several attempts; they share a scope and are told apart by this.
   * Optional so a hand-rolled literal keeps compiling and reads as a single try.
   */
  attempt?: number;
  /**
   * Milliseconds this call waited for admission to the provider, kept out of
   * `durationMs` on purpose: a queue is not work, and charging it to the call
   * would make a busy process look like a slow model.
   */
  queuedMs?: number;
}

export type LlmCallSink = (call: LlmCall) => void;

/**
 * An adapter that can hand back a twin of itself reporting every call it makes.
 * The twin shares the underlying transport, so deriving one is cheap enough to
 * do per run.
 *
 * Note what is NOT here: who called. The adapter genuinely does not know, and
 * inventing a `label` for callers to pass would be a second copy of an
 * attribution the orchestrator already holds. Whoever owns the sink stamps it.
 */
export interface LlmRecordable {
  withRecorder(sink: LlmCallSink): LlmClient;
}

/** One call, attributed. What a run dump stores. */
export interface LlmExchange extends LlmCall {
  /** An eval pass id (`llm.critic`), or `prompt.enrich`. */
  scope: string;
  /** 1-based within a scope, so two calls from one pass stay distinguishable. */
  ordinal: number;
}

/**
 * `null` for a client that cannot record — a spec's plain fake, say — so a
 * caller records nothing rather than guessing at a call.
 */
export function asRecordable(client: LlmClient): LlmRecordable | null {
  const candidate = client as Partial<LlmRecordable>;
  return typeof candidate.withRecorder === 'function' ? (candidate as LlmRecordable) : null;
}
