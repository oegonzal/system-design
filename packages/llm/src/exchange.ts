import { modelSchema } from '@sysdesign/contracts';
import type {
  LlmExchangeOutcome,
  LlmReplySource,
  Overrun,
  Repair,
  SchemaIssue,
} from '@sysdesign/contracts';

import {
  asDetailed,
  type LlmClient,
  type LlmDetailed,
  type StructuredReply,
  type StructuredRequest,
} from './llm-client';

/**
 * What the seam's reading of one reply kept, changed or refused — the
 * salvage ladder's report, beside the value it produced. Recorded whenever a
 * reply was parsed at all; null on a call that never had text to read.
 */
export interface LlmSalvage {
  /** Every field past its target, with how it was handled: accepted, kept over the ceiling, cut, trimmed. */
  overruns: Overrun[];
  /** What the parse changed on the way to the value — keys stripped, lists trimmed — never a word of prose. */
  repairs: Repair[];
  /** The faults of a miss, in the one wording every reader uses; empty on an `ok`. */
  issues: SchemaIssue[];
  /**
   * Where the value was read from: the turn's result, or the transcript of a
   * turn whose ending left no result to read. Null when there was no value.
   */
  from: LlmReplySource | null;
  /** True when this attempt's ask named the previous attempt's faults. */
  feedback: boolean;
}

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
   * schema's complaint on a `schema-miss` — which fault refused it, or that
   * no object parsed at all. Null on `ok`, except an `ok` read from the
   * transcript of a turn that ended without a result: then what ended the
   * turn, under the name `Salvaged`.
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
  /**
   * The salvage ladder's report on this reply. Optional so a hand-rolled
   * literal keeps compiling and reads as a call that salvaged nothing.
   */
  salvage?: LlmSalvage | null;
  /**
   * API calls the turn took: one, or more when the per-call output ceiling
   * made it resume — so a declaration a turn outgrows is visible in its
   * record. Null when the turn never ran; optional as `salvage` is.
   */
  apiCalls?: number | null;
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
  /** Who made the call, as the recorder's owner names it: a stage, or one lens's sample. */
  scope: string;
  /** 1-based within a scope, so two calls from one pass stay distinguishable. */
  ordinal: number;
}

/**
 * `null` for a client with no record of its own to offer. Prefer
 * `recorderFor`, which is total: this is the capability check behind it.
 */
export function asRecordable(client: LlmClient): LlmRecordable | null {
  const candidate = client as Partial<LlmRecordable>;
  return typeof candidate.withRecorder === 'function' ? (candidate as LlmRecordable) : null;
}

/**
 * Every client records. Whichever adapter is serving, a run dump holds the
 * prompt that was sent, the answer that came back and what became of it —
 * because changing the provider is meant to change the model call and nothing
 * else about the process around it.
 *
 * An adapter that knows more about its own turn says so by implementing
 * `LlmRecordable`: the usage its provider reported, the raw text of a turn
 * that took several API calls, why the turn ended. One that does not is
 * wrapped here and records what the port itself can see, which is the prompt,
 * the schema, how long it took and whether an object came back. Less detail,
 * never no record — a dump with nothing in it is indistinguishable from a
 * stage that never ran, and that cost an investigation.
 */
export function recorderFor(client: LlmClient): LlmRecordable {
  return (
    asRecordable(client) ?? {
      withRecorder: (sink) => new PortRecordingLlmClient(client, sink),
    }
  );
}

/**
 * What the seam itself can witness of a call, for an adapter that reports
 * nothing of its own. It delegates through `asDetailed`, so a client that can
 * say why a reply was refused still has its faults recorded.
 */
class PortRecordingLlmClient implements LlmClient, LlmDetailed {
  readonly model: string;

  constructor(
    private readonly inner: LlmClient,
    private readonly sink: LlmCallSink,
  ) {
    this.model = inner.model;
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    return (await this.completeStructuredDetailed(request)).value;
  }

  async completeStructuredDetailed<T>(request: StructuredRequest<T>): Promise<StructuredReply<T>> {
    const startedAt = new Date().toISOString();
    const began = Date.now();
    const record = (
      outcome: LlmExchangeOutcome,
      response: unknown,
      error: LlmCall['error'],
    ): void => {
      this.sink({
        model: this.model,
        system: request.system,
        user: request.user,
        schema: modelSchema(request.schema).json,
        maxTokens: request.maxTokens ?? 0,
        startedAt,
        durationMs: Date.now() - began,
        outcome,
        stopReason: null,
        usage: null,
        requestId: null,
        // The port never shows the text, only what was made of it.
        text: null,
        response,
        error,
      });
    };
    try {
      const reply = await asDetailed(this.inner).completeStructuredDetailed(request);
      if (reply.value === null) {
        record('schema-miss', null, {
          name: 'NoValue',
          message:
            reply.issues.length > 0
              ? reply.issues.map((issue) => `${issue.at}: ${issue.message}`).join('; ')
              : 'the client returned no value and no faults',
        });
      } else {
        record('ok', reply.value, null);
      }
      return reply;
    } catch (cause) {
      record('error', null, {
        name: cause instanceof Error ? cause.name : 'Error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }
  }
}
