import { modelSchema } from '@sysdesign/contracts';

import {
  assertCallTimePolicy,
  CALL_TIME_POLICY,
  callTimeLimitMs,
  describeCallLimit,
  watchDeadline,
  type CallTimePolicy,
} from './call-time-limit';
import type { ClaudeQuery } from './claude-account';
import { askOf, AttemptOutcome, type Attempt, type Refusal } from './claude-attempt';
import { readTurn, turnOptions, type TurnRead } from './claude-turn';
import type { LlmCall, LlmCallSink, LlmRecordable } from './exchange';
import { InFlightGate } from './in-flight-gate';
import {
  backoffFor,
  classifyFailure,
  DEFAULT_RETRY_POLICY,
  retryable,
  type LlmRetryPolicy,
} from './llm-failure';
import type { LlmClient, LlmDetailed, StructuredReply, StructuredRequest } from './llm-client';
import { NO_RESULT, parseStructured, SCHEMA_MISS, TIMED_OUT } from './structured-reply';

/** The model report when no model is pinned: the subscription's own choice. */
export const SUBSCRIPTION_MODEL_LABEL = 'claude-code/subscription';

/**
 * What a call that declares no `maxTokens` is recorded as having declared. A
 * declaration is the caller's sizing, kept beside the usage in every dump so
 * the two can be compared; the turn itself runs under `OUTPUT_TOKEN_CEILING`.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Structured calls through the Claude Code subscription login — the loop's
 * one model route. The Agent SDK spawns a tool-less, settings-less,
 * single-turn agent using the credentials `claude login` stored, or the
 * `CLAUDE_CODE_OAUTH_TOKEN` a container is given; an API key in the
 * environment is withheld from it, so nothing is ever billed outside the
 * subscription.
 *
 * There is no server-side output constraint, so the schema rides in the
 * prompt as JSON Schema — every bound at its target, from `modelSchema` —
 * and `parseStructured` reads the reply on the way out over the whole turn's
 * text, keeping what the ladder keeps. A structural miss is `null`, exactly
 * the contract every caller already handles, and the recorded call says why;
 * the next attempt's ask names it.
 *
 * Implements `LlmRecordable` so a run dump captures the exchange, and
 * `LlmDetailed` so a caller can read the faults and the overruns.
 */
export class ClaudeAgentLlmClient implements LlmClient, LlmRecordable, LlmDetailed {
  readonly model: string;

  /** Only set when the caller pinned one; otherwise the CLI's default rules. */
  private readonly requestedModel: string | undefined;
  private readonly sink: LlmCallSink | null;
  /** The SDK's `query`; injectable so a spec never spawns the CLI. */
  private readonly run: ClaudeQuery | undefined;
  /** Admission to the provider. A twin shares it: it shares the transport. */
  private readonly gate: InFlightGate;
  private readonly retry: LlmRetryPolicy;
  /** Injected so a spec waits on nothing. */
  private readonly pause: (ms: number) => Promise<void>;
  /** How long a call may take, from what it declares. */
  private readonly limits: CallTimePolicy;
  /** The wall clock a limit is watched on, and how often; injected so a spec runs in milliseconds. */
  private readonly clock: { now?: () => number; tickMs?: number };

  constructor(
    options: {
      model?: string;
      sink?: LlmCallSink;
      query?: ClaudeQuery;
      gate?: InFlightGate;
      retry?: LlmRetryPolicy;
      sleep?: (ms: number) => Promise<void>;
      limits?: CallTimePolicy;
      clock?: { now?: () => number; tickMs?: number };
    } = {},
  ) {
    this.requestedModel = options.model;
    this.model = options.model ?? SUBSCRIPTION_MODEL_LABEL;
    this.sink = options.sink ?? null;
    this.run = options.query;
    this.gate = options.gate ?? new InFlightGate();
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
    this.pause =
      options.sleep ?? ((ms) => new Promise<void>((wake) => setTimeout(wake, ms).unref?.()));
    this.limits = assertCallTimePolicy(options.limits ?? CALL_TIME_POLICY);
    this.clock = options.clock ?? {};
  }

  /** The same client recording to `sink`: every capability it has, the detailed call among them, kept. */
  withRecorder(sink: LlmCallSink): ClaudeAgentLlmClient {
    return new ClaudeAgentLlmClient({
      model: this.requestedModel,
      sink,
      query: this.run,
      gate: this.gate,
      retry: this.retry,
      sleep: this.pause,
      limits: this.limits,
      clock: this.clock,
    });
  }

  /** One answer, or null once the attempts the policy allows are spent: the detailed call's value. */
  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    return (await this.completeStructuredDetailed(request)).value;
  }

  /**
   * One answer with what the seam knows about it, or the faults of the final
   * miss once the attempts the policy allows are spent.
   *
   * A retry happens here, immediately, inside the call its caller is already
   * awaiting — never gathered up and re-run later. That matters upstream: a
   * lens sample is one call and must stay one outcome, because the loop counts
   * agreement across a lens's own samples, so a retry that arrived as an extra
   * sample would inflate what agreement means.
   *
   * Each attempt takes its own permit and gives it back, so a wait for a
   * strained provider is spent queueing rather than holding a slot shut. Each
   * is recorded in its own right, so the rate of first-attempt failures stays
   * exactly as visible as it was before there was a second attempt. A reply
   * the schema refused is carried to the next ask, which names what broke; an
   * attempt that failed some other way leaves the last refusal standing, so
   * the fault is still named when the model next reads the ask — and when
   * the attempts run out, it is the faults the caller is handed.
   */
  async completeStructuredDetailed<T>(request: StructuredRequest<T>): Promise<StructuredReply<T>> {
    let previous: Refusal | null = null;
    for (let attempt = 1; ; attempt += 1) {
      const { reply, kind, refusal } = await this.gate.run(({ queuedMs }) =>
        this.callOnce(request, queuedMs, attempt, previous),
      );
      previous = refusal ?? previous;
      if (kind === null) return reply;
      if (!retryable(kind, attempt, this.retry)) {
        return { ...reply, issues: previous?.issues ?? [] };
      }
      const pause = backoffFor(kind, attempt, this.retry);
      if (pause > 0) await this.pause(pause);
    }
  }

  /**
   * One attempt, from the ask to what it comes to: the schema shown, the turn
   * run under the call's limit, its result read — or, when the turn ended
   * without one, what it streamed — and the outcome recorded once.
   */
  private async callOnce<T>(
    request: StructuredRequest<T>,
    queuedMs: number,
    attempt: number,
    previous: Refusal | null,
  ): Promise<Attempt<T>> {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const refused =
      this.retry.feedback.issues && previous !== null && previous.issues.length > 0
        ? previous
        : null;
    const outcome = new AttemptOutcome<T>({
      model: this.model,
      sink: this.sink,
      request,
      maxTokens,
      attempt,
      queuedMs,
      feedback: refused !== null,
    });

    // The limit this call runs under, from what it declares. Our abort is a
    // fact this adapter knows first-hand, so whether it fired is read from the
    // signal — never from the name of whatever the SDK threw afterwards, which
    // is a plain `Error` ("process aborted by user") and read as a broken pipe.
    const abort = new AbortController();
    const timedOut = (cause?: string): NonNullable<LlmCall['error']> => ({
      name: TIMED_OUT,
      message: `no answer within ${describeCallLimit(maxTokens, this.limits)}${cause ? `: ${cause}` : ''}`,
    });

    try {
      // Inside the try: an unconvertible schema must yield null, not reject —
      // the LlmClient contract is "null on any failure".
      const shown = modelSchema(request.schema);
      outcome.shown = shown;
      const prompt = askOf(request.user, shown, refused, this.retry.feedback);
      const query = this.run ?? (await import('@anthropic-ai/claude-agent-sdk')).query;

      // A hard backstop: interrupt() is cooperative and cannot end a wedged
      // subprocess, so an AbortController drives the SDK's real kill path at
      // the limit — and the call stops waiting a grace later whether or not
      // the stream has ended, so it never outlives its limit by more.
      const deadline = watchDeadline({
        limitMs: callTimeLimitMs(maxTokens, this.limits),
        graceMs: this.limits.graceMs,
        onLimit: () => abort.abort(),
        now: this.clock.now,
        tickMs: this.clock.tickMs,
      });

      let read: TurnRead;
      try {
        const turn = query({
          prompt,
          options: turnOptions({
            system: request.system,
            model: this.requestedModel,
            thinkingBudget: request.thinkingBudget,
            abort,
          }),
        });
        const reading = readTurn(turn, outcome.transcript);
        const settled = await Promise.race([reading, deadline.abandoned.then(() => null)]);
        if (settled === null) {
          // Past the limit and its grace, and the stream still open: whatever
          // it would say now is no answer. Its late settling is swallowed.
          reading.catch(() => undefined);
          turn.close?.();
          return outcome.settle({
            error: timedOut('the turn did not end after its abort'),
            kind: 'timeout',
            usage: null,
            stopReason: null,
          });
        }
        read = settled;
      } finally {
        deadline.stop();
      }
      const { resultText, stopReason, failure, assistantError, usage } = read;

      if (resultText === null) {
        // `failure.name` is whichever closed vocabulary spoke: the assistant's
        // error when there was one, else the result's subtype — unless our
        // own abort is what ended the turn.
        const aborted = abort.signal.aborted;
        const ended = failure ?? {
          name: NO_RESULT,
          message: 'the turn ended without a result',
        };
        return outcome.settle({
          error: aborted ? timedOut(ended.message) : ended,
          kind: classifyFailure({
            aborted,
            assistantError: failure?.name ?? null,
            resultSubtype: failure?.name ?? null,
          }),
          usage,
          stopReason,
        });
      }
      // The whole turn first; `result` alone only when the turn streamed no
      // text of its own, or what it streamed does not hold the answer.
      const written = outcome.transcript.text || resultText;
      let extraction = parseStructured(written, request.schema, shown.bounds);
      if (!extraction.ok && written !== resultText) {
        const fromResult = parseStructured(resultText, request.schema, shown.bounds);
        if (fromResult.ok) extraction = fromResult;
      }
      if (extraction.ok) {
        return outcome.answered(extraction, written, 'result', { error: null, usage, stopReason });
      }
      // A reply the model truncated is not the same failure as a reply that
      // broke the schema, and only one of them is worth re-asking in the same
      // breath; the assistant's own `max_output_tokens` says which.
      return outcome.missed(
        extraction,
        written,
        classifyFailure({ assistantError, schemaMiss: true }),
        {
          outcome: 'schema-miss',
          error: { name: SCHEMA_MISS, message: extraction.reason },
          usage,
          stopReason,
        },
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const aborted = abort.signal.aborted;
      return outcome.settle({
        error: aborted ? timedOut(err.message) : { name: err.name, message: err.message },
        kind: classifyFailure({ noResult: true, aborted }),
        usage: null,
        stopReason: null,
      });
    }
  }
}
