import type { SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  describeIssue,
  modelSchema,
  parseLenient,
  type BoundPath,
  type DeclaredBound,
  type LlmReplySource,
  type ModelSchema,
  type Overrun,
  type Repair,
  type SchemaIssue,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import {
  assertCallTimePolicy,
  CALL_TIME_POLICY,
  callTimeLimitMs,
  describeCallLimit,
  watchDeadline,
  type CallTimePolicy,
} from './call-time-limit';
import { subscriptionEnv, type ClaudeQuery } from './claude-account';
import type { LlmCall, LlmCallSink, LlmRecordable } from './exchange';
import { InFlightGate } from './in-flight-gate';
import {
  backoffFor,
  classifyFailure,
  DEFAULT_RETRY_POLICY,
  retryable,
  type LlmFailureKind,
  type LlmRetryPolicy,
} from './llm-failure';
import type { LlmClient, LlmDetailed, StructuredReply, StructuredRequest } from './llm-client';

/** The `error.name` a schema miss is recorded under; its message is the schema's own complaint. */
export const SCHEMA_MISS = 'SchemaMiss';

/**
 * The `error.name` an `ok` is recorded under when its value was read from the
 * transcript of a turn that ended without a result; the message is what
 * ended the turn.
 */
export const SALVAGED = 'Salvaged';

/** The `error.name` a turn is recorded under when its stream ended with no result and no error of its own. */
export const NO_RESULT = 'NoResult';

/** The model report when no model is pinned: the subscription's own choice. */
export const SUBSCRIPTION_MODEL_LABEL = 'claude-code/subscription';

/** The `error.name` a call is recorded under when its own limit ended it. */
export const TIMED_OUT = 'Timeout';

/**
 * Output-token ceiling for one API call of the spawned turn, thinking
 * included. Sized from recorded runs: the largest turns so far wrote 40,173
 * (a canvas coach, 2026-10-02), 26,054 (an agentic-design producer,
 * 2026-09-23) and 21,122 (a canvas coach, 2026-10-01) output tokens, and at
 * the old 16,000 each was cut and resumed in a second message. A cut is not
 * lossy — the turn's text is read whole, see `TurnTranscript`, and the
 * record counts the calls in `apiCalls` — but every resume is another model
 * round trip, so a turn that routinely resumes is a declaration to revisit.
 */
export const OUTPUT_TOKEN_CEILING = 32_000;

/**
 * What a call that declares no `maxTokens` is recorded as having declared. A
 * declaration is the caller's sizing, kept beside the usage in every dump so
 * the two can be compared; the turn itself runs under `OUTPUT_TOKEN_CEILING`.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * No tools at all. `tools: []` is the SDK's own "disable every built-in
 * tool" — unlike a list of names to deny, which went stale as the CLI grew
 * new tools (ToolSearch, Workflow, Monitor, SendMessage…) and left them on
 * offer: a model that reached for one used up its single turn, and the call
 * came back `error_max_turns`. Combined with `settingSources: []` (no
 * project/user config, no MCP servers) and single-turn `default`
 * permission, the model has nothing to call and no way to be granted one.
 */
const NO_TOOLS: string[] = [];

/** The heading under which the next ask names what refused the last reply. */
export const FEEDBACK_HEADING =
  '# Your previous reply was refused — correct these and return the whole object again';

/** The heading under which the refused reply rides along, when it is small enough. */
export const PREVIOUS_REPLY_HEADING = '## The reply, as written';

/**
 * Scan `text` for balanced, string-aware top-level `{...}` objects and yield
 * each complete span. Unlike first-`{`-to-last-`}`, this survives an agent that
 * narrates, echoes the JSON Schema it was given, or quotes the current brief —
 * each of which drops extra braces into the reply. Braces inside JSON strings
 * (and their escapes) are ignored.
 */
function* braceObjects(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) yield text.slice(start, i + 1);
      }
    }
  }
}

/**
 * Every span of `text` that could be the object: each fenced block, then each
 * balanced brace span, in that order, each once — a fenced object is also a
 * brace span, and reporting it twice told a reader one miss was two.
 */
export function jsonCandidates(text: string): string[] {
  const spans: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) spans.push(m[1]);
  for (const span of braceObjects(text)) spans.push(span);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const span of spans) {
    const key = span.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(span);
  }
  return candidates;
}

/** A value the ladder accepted, with every field it kept past its target and every repair. */
interface Read<T> {
  ok: true;
  value: T;
  overruns: Overrun[];
  repairs: Repair[];
}

/** No value: why, in words a dump can carry, and the faults the next ask is told. */
interface Miss {
  ok: false;
  reason: string;
  issues: SchemaIssue[];
}

/** The one validated object with what the parse kept, or why there was none. */
export type Extraction<T> = Read<T> | Miss;

const structuralFaults = (issues: readonly SchemaIssue[]): number =>
  issues.filter((issue) => !issue.soft).length;

/**
 * Of several candidates that missed, the faults of the one that came
 * closest — the fewest structural faults, the first on a tie — which is the
 * one the next ask is told about. A soft fault is kept by the parse, so it
 * never makes a candidate further away.
 */
export function closestMiss(misses: readonly (readonly SchemaIssue[])[]): SchemaIssue[] {
  let closest: readonly SchemaIssue[] = [];
  let distance = Number.POSITIVE_INFINITY;
  for (const issues of misses) {
    const faults = structuralFaults(issues);
    if (faults < distance) {
      closest = issues;
      distance = faults;
    }
  }
  return [...closest];
}

const describeMiss = (issues: readonly SchemaIssue[]): string =>
  issues.map(describeIssue).join('; ');

/**
 * Pull the one JSON object out of an agent's text. Tries every fenced block,
 * then every balanced brace span, returning the first that both parses AND
 * the salvage ladder accepts — a text past its bound kept whole or cut with
 * a marker, a list past its ceiling trimmed, an unasked-for key stripped,
 * every one of them recorded. A miss is structural: it names what each
 * parsed candidate got wrong in the one wording the next ask repeats, or
 * says that nothing parsed at all — a reply cut before its object closed
 * reads exactly like that. `bounds` are the schema's own declarations; a
 * caller that built the model schema already hands them over.
 */
export function parseStructured<T>(
  text: string,
  schema: ZodType<T>,
  bounds?: Readonly<Record<BoundPath, DeclaredBound>>,
): Extraction<T> {
  const candidates = jsonCandidates(text);
  const index = bounds ?? modelSchema(schema).bounds;
  const misses: SchemaIssue[][] = [];
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = parseLenient(schema, parsed, index);
    if (result.ok) {
      return { ok: true, value: result.value, overruns: result.overruns, repairs: result.repairs };
    }
    misses.push(result.issues);
  }
  if (misses.length === 0) {
    return {
      ok: false,
      reason: `no complete JSON object in the reply (${candidates.length} candidate span(s), none parsed)`,
      issues: [],
    };
  }
  return {
    ok: false,
    reason:
      misses.length === 1
        ? describeMiss(misses[0])
        : misses.map((miss, index) => `candidate ${index + 1}: ${describeMiss(miss)}`).join(' | '),
    issues: closestMiss(misses),
  };
}

/** `parseStructured` for a caller that only needs the object: `null` is the port's deterministic path. */
export function extractStructured<T>(text: string, schema: ZodType<T>): T | null {
  const extraction = parseStructured(text, schema);
  return extraction.ok ? extraction.value : null;
}

/**
 * What one turn wrote, and how many API calls it took. The CLI streams a
 * turn as several assistant messages — one per content block, and when a
 * reply runs past the output cap it resumes it in a further API call
 * mid-thought — while the closing `result` repeats only the last message's
 * text. A long answer read from `result` alone is its tail: no opening
 * brace, nothing to parse. So every top-level text block is kept in arrival
 * order and read as one; a message the CLI retracts (it names it in a later
 * message's `supersedes`) is dropped. The blocks of one API call share their
 * `message.id`, so the distinct ids are the calls.
 */
class TurnTranscript {
  private readonly texts = new Map<string, string>();
  private readonly calls = new Set<string>();

  add(message: SDKAssistantMessage): void {
    this.calls.add(message.message.id);
    if (message.parent_tool_use_id) return;
    for (const retracted of message.supersedes ?? []) this.texts.delete(retracted);
    const text = message.message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    if (text.length > 0) this.texts.set(message.uuid ?? `#${this.texts.size}`, text);
  }

  get text(): string {
    return [...this.texts.values()].join('');
  }

  get apiCalls(): number {
    return this.calls.size;
  }
}

/** A reply the schema refused, carried to the next attempt so the ask can name what broke. */
interface Refusal {
  issues: SchemaIssue[];
  text: string;
}

/** What one attempt came to: the reply, whether it is worth asking again, and what the next ask is told. */
interface Attempt<T> {
  reply: StructuredReply<T>;
  kind: LlmFailureKind | null;
  refusal: Refusal | null;
}

/** How a turn ended without a result to read, in the words the record keeps. */
interface Ending {
  error: NonNullable<LlmCall['error']>;
  kind: LlmFailureKind;
  usage: LlmCall['usage'];
  stopReason: string | null;
}

/**
 * The section the next ask gains after `# Output format` when the last reply
 * was refused: one line per fault, and the reply as written when it fits.
 */
function feedbackSection(previous: Refusal, policy: LlmRetryPolicy['feedback']): string[] {
  const lines = [FEEDBACK_HEADING, ...previous.issues.map((issue) => `- ${describeIssue(issue)}`)];
  if (previous.text.length <= policy.replyMaxChars) {
    lines.push('', PREVIOUS_REPLY_HEADING, previous.text);
  }
  return lines;
}

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

  withRecorder(sink: LlmCallSink): LlmClient {
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

  private async callOnce<T>(
    request: StructuredRequest<T>,
    queuedMs: number,
    attempt: number,
    previous: Refusal | null,
  ): Promise<Attempt<T>> {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const startedAt = new Date();
    const started = Date.now();
    const feedback = this.retry.feedback.issues && previous !== null && previous.issues.length > 0;
    /** The schema as the model sees it, once converted; null until then. */
    let shown: ModelSchema | null = null;
    // Owned here, not by the read: whatever ends the turn, what it streamed
    // before the end is still in hand to be read.
    const transcript = new TurnTranscript();

    const record = (
      call: Pick<
        LlmCall,
        'outcome' | 'text' | 'response' | 'error' | 'usage' | 'stopReason' | 'salvage' | 'apiCalls'
      >,
    ): void => {
      this.sink?.({
        model: this.model,
        system: request.system,
        user: request.user,
        schema: shown?.json ?? null,
        maxTokens,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - started,
        requestId: null,
        attempt,
        queuedMs,
        ...call,
      });
    };
    /** A value read: recorded `ok` with what the ladder kept, and nothing left to ask. */
    const answered = (
      read: Read<T>,
      text: string,
      from: LlmReplySource,
      ended: Pick<LlmCall, 'error' | 'usage' | 'stopReason'>,
    ): Attempt<T> => {
      record({
        outcome: 'ok',
        text,
        response: read.value,
        ...ended,
        salvage: { overruns: read.overruns, repairs: read.repairs, issues: [], from, feedback },
        apiCalls: transcript.apiCalls,
      });
      return {
        reply: { value: read.value, issues: [], overruns: read.overruns },
        kind: null,
        refusal: null,
      };
    };
    /**
     * No value: recorded with the faults of the miss when a reply was parsed
     * at all, and carried to the next ask when it had faults to name.
     */
    const missed = (
      miss: Miss | null,
      text: string,
      kind: LlmFailureKind,
      ended: Pick<LlmCall, 'outcome' | 'error' | 'usage' | 'stopReason'>,
    ): Attempt<T> => {
      record({
        text: text || null,
        response: null,
        ...ended,
        salvage:
          miss === null
            ? null
            : { overruns: [], repairs: [], issues: miss.issues, from: null, feedback },
        apiCalls: transcript.apiCalls,
      });
      return {
        reply: { value: null, issues: miss?.issues ?? [], overruns: [] },
        kind,
        refusal: miss !== null && miss.issues.length > 0 ? { issues: miss.issues, text } : null,
      };
    };

    // The limit this call runs under, from what it declares. Our abort is a
    // fact this adapter knows first-hand, so whether it fired is read from the
    // signal — never from the name of whatever the SDK threw afterwards, which
    // is a plain `Error` ("process aborted by user") and read as a broken pipe.
    const abort = new AbortController();
    const timedOut = (cause?: string): NonNullable<LlmCall['error']> => ({
      name: TIMED_OUT,
      message: `no answer within ${describeCallLimit(maxTokens, this.limits)}${cause ? `: ${cause}` : ''}`,
    });

    /**
     * A turn that ended without a result to read — our limit, the provider's
     * error, a broken pipe — is still read: what it streamed before the end
     * may hold the whole object, and then the call answers `ok`, read from
     * the transcript, with what ended the turn kept under `Salvaged`.
     * Otherwise the ending is the record, with the partial text beside it.
     */
    const settle = ({ error, kind, usage, stopReason }: Ending): Attempt<T> => {
      const text = transcript.text;
      const extraction =
        text.length > 0 && shown !== null
          ? parseStructured(text, request.schema, shown.bounds)
          : null;
      if (extraction?.ok) {
        const salvaged = { name: SALVAGED, message: `${error.name}: ${error.message}` };
        return answered(extraction, text, 'transcript', { error: salvaged, usage, stopReason });
      }
      return missed(extraction, text, kind, { outcome: 'error', error, usage, stopReason });
    };

    try {
      // Inside the try: an unconvertible schema must yield null, not reject —
      // the LlmClient contract is "null on any failure".
      shown = modelSchema(request.schema);
      const sections = [
        request.user,
        '',
        '# Output format',
        'Respond with ONLY one JSON object — no prose before or after, no markdown',
        'fence. It must validate against this JSON Schema:',
        JSON.stringify(shown.json),
      ];
      if (feedback && previous !== null) {
        sections.push('', ...feedbackSection(previous, this.retry.feedback));
      }
      const prompt = sections.join('\n');

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
          options: {
            systemPrompt: request.system,
            ...(this.requestedModel ? { model: this.requestedModel } : {}),
            maxTurns: 1,
            tools: NO_TOOLS,
            permissionMode: 'default',
            // No project/user settings, skills or MCP servers leak into a
            // scoring-adjacent call; nothing about this run is persisted to disk.
            settingSources: [],
            persistSession: false,
            abortController: abort,
            // `env` REPLACES the subprocess environment, so spread the current
            // one and only raise the output cap — the login credentials the SDK
            // reads live in process.env / the config dir and must be preserved.
            env: {
              ...subscriptionEnv(process.env),
              CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(OUTPUT_TOKEN_CEILING),
            },
          },
        });
        const reading = readTurn(turn, transcript);
        const settled = await Promise.race([reading, deadline.abandoned.then(() => null)]);
        if (settled === null) {
          // Past the limit and its grace, and the stream still open: whatever
          // it would say now is no answer. Its late settling is swallowed.
          reading.catch(() => undefined);
          turn.close?.();
          return settle({
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
        return settle({
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
      const written = transcript.text || resultText;
      let extraction = parseStructured(written, request.schema, shown.bounds);
      if (!extraction.ok && written !== resultText) {
        const fromResult = parseStructured(resultText, request.schema, shown.bounds);
        if (fromResult.ok) extraction = fromResult;
      }
      if (extraction.ok) {
        return answered(extraction, written, 'result', { error: null, usage, stopReason });
      }
      // A reply the model truncated is not the same failure as a reply that
      // broke the schema, and only one of them is worth re-asking in the same
      // breath; the assistant's own `max_output_tokens` says which.
      return missed(extraction, written, classifyFailure({ assistantError, schemaMiss: true }), {
        outcome: 'schema-miss',
        error: { name: SCHEMA_MISS, message: extraction.reason },
        usage,
        stopReason,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const aborted = abort.signal.aborted;
      return settle({
        error: aborted ? timedOut(err.message) : { name: err.name, message: err.message },
        kind: classifyFailure({ noResult: true, aborted }),
        usage: null,
        stopReason: null,
      });
    }
  }
}

/** What one turn said, read to its end; its text is in the transcript the caller owns. */
interface TurnRead {
  resultText: string | null;
  stopReason: string | null;
  /**
   * A turn that ended on an API error (an expired token, a rate limit) still
   * arrives as a result: the CLI's own reason, kept for the record.
   */
  failure: LlmCall['error'];
  assistantError: string | null;
  usage: LlmCall['usage'];
}

/**
 * Read a turn's messages to the end, feeding every assistant message to the
 * caller's transcript as it arrives — so what was streamed is in hand even
 * when the read never returns. It rejects only when the stream broke before
 * a result arrived: the CLI exits non-zero after an error result and the SDK
 * rethrows that exit, but the result already carries the reason worth
 * recording.
 */
async function readTurn(
  turn: AsyncIterable<SDKMessage>,
  transcript: TurnTranscript,
): Promise<TurnRead> {
  const read: TurnRead = {
    resultText: null,
    stopReason: null,
    failure: null,
    assistantError: null,
    usage: null,
  };
  let sawResult = false;
  try {
    for await (const message of turn) {
      if (message.type === 'assistant') {
        transcript.add(message);
        if (message.error) read.assistantError = message.error;
      }
      if (message.type === 'result') {
        sawResult = true;
        read.stopReason = message.stop_reason ?? null;
        if (message.subtype === 'success' && !message.is_error) read.resultText = message.result;
        else
          read.failure = {
            name: read.assistantError ?? message.subtype,
            message:
              message.subtype === 'success'
                ? message.result
                : message.errors.join('; ') || message.subtype,
          };
        const u = (message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        if (u) {
          read.usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
        }
      }
    }
  } catch (error) {
    if (!sawResult) throw error;
  }
  return read;
}
