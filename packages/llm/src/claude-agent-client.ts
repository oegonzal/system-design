import type { SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { z, type ZodIssue, type ZodType } from 'zod';

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
import type { LlmClient, StructuredRequest } from './llm-client';

/** The `error.name` a schema miss is recorded under; its message is the schema's own complaint. */
export const SCHEMA_MISS = 'SchemaMiss';

/** The model report when no model is pinned: the subscription's own choice. */
export const SUBSCRIPTION_MODEL_LABEL = 'claude-code/subscription';

/** The `error.name` a call is recorded under when its own limit ended it. */
export const TIMED_OUT = 'Timeout';

/**
 * Output-token ceiling for one API call of the spawned turn, thinking
 * included. Sized from recorded runs: the largest turns so far wrote 26,054
 * (an agentic-design producer, 2026-09-23) and 21,122 (a canvas coach,
 * 2026-10-01) output tokens, and at the old 16,000 each was cut and resumed in
 * a second message. A cut is no longer lossy — the turn's text is read whole,
 * see `TurnTranscript` — but every resume is another model round trip.
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
 * Two kinds of schema issue are excess rather than a wrong answer, and both
 * can be undone without changing a word the model wrote. An array past its
 * `.max()` drops its trailing items — whole items, worst-last as every list
 * here asks to be ordered. An `unrecognized_keys` on a strict object is an
 * aside (a `steps_note` beside the `steps` the schema asked for) and is
 * stripped. Schema-driven, so no caller knows a cap or a key list exists.
 *
 * A string past its `.max()` is never cut: a clamp lands mid-word, and the
 * cut prose is then judged and stored as if the model had written it. An
 * overshoot is a schema miss the loop can revise or retry, and its issues are
 * recorded so the dump says which bound was crossed — a bound the model
 * routinely crosses is sized from the runs, not enforced with scissors.
 */
const isRepairable = (issue: ZodIssue): boolean =>
  issue.code === 'unrecognized_keys' ||
  (issue.code === 'too_big' && typeof issue.maximum === 'number' && issue.origin === 'array');

function repairExcess(value: unknown, issues: readonly ZodIssue[]): unknown {
  let next = value;
  for (const issue of issues) {
    const path = issue.path.filter(
      (key): key is string | number => typeof key === 'string' || typeof key === 'number',
    );
    if (issue.code === 'too_big') {
      const maximum = issue.maximum as number;
      next = updateAt(next, path, (current) =>
        Array.isArray(current) ? current.slice(0, maximum) : current,
      );
    } else if (issue.code === 'unrecognized_keys') {
      const unwanted = new Set(issue.keys);
      next = updateAt(next, path, (current) =>
        current !== null && typeof current === 'object' && !Array.isArray(current)
          ? Object.fromEntries(Object.entries(current).filter(([key]) => !unwanted.has(key)))
          : current,
      );
    }
  }
  return next;
}

function updateAt(
  value: unknown,
  path: readonly (string | number)[],
  fn: (v: unknown) => unknown,
): unknown {
  if (path.length === 0) return fn(value);
  const [head, ...rest] = path;
  if (Array.isArray(value) && typeof head === 'number') {
    const copy = [...value];
    copy[head] = updateAt(copy[head], rest, fn);
    return copy;
  }
  if (value !== null && typeof value === 'object' && typeof head === 'string') {
    const record = value as Record<string, unknown>;
    return { ...record, [head]: updateAt(record[head], rest, fn) };
  }
  return value;
}

/** Repairs can cascade (an array trimmed, then a member's key); a few rounds settle it. */
const REPAIR_ROUNDS = 3;

/** The one validated object, or why there was none — in words a dump can carry. */
export type Extraction<T> = { ok: true; value: T } | { ok: false; reason: string };

const issuePath = (issue: ZodIssue): string =>
  issue.path.map((key) => String(key)).join('.') || '(root)';

const describeIssues = (issues: readonly ZodIssue[]): string =>
  issues.map((issue) => `${issuePath(issue)}: ${issue.message}`).join('; ');

/**
 * Pull the one schema-valid JSON object out of an agent's text. Tries every
 * fenced block, then every balanced brace span, returning the first that both
 * parses AND satisfies the schema — trimming array overshoots and stripping
 * unasked-for keys on the way. A miss names what each parsed candidate got
 * wrong, or that nothing parsed at all: a reply cut before its object closed
 * reads exactly like that.
 */
export function parseStructured<T>(text: string, schema: ZodType<T>): Extraction<T> {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) candidates.push(m[1]);
  for (const span of braceObjects(text)) candidates.push(span);

  const misses: string[] = [];
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    let issues: readonly ZodIssue[] = [];
    for (let round = 0; round <= REPAIR_ROUNDS; round++) {
      const result = schema.safeParse(parsed);
      if (result.success) return { ok: true, value: result.data };
      issues = result.error.issues;
      if (issues.length === 0 || !issues.every(isRepairable)) break;
      parsed = repairExcess(parsed, issues);
    }
    misses.push(describeIssues(issues));
  }
  if (misses.length === 0) {
    return {
      ok: false,
      reason: `no complete JSON object in the reply (${candidates.length} candidate span(s), none parsed)`,
    };
  }
  return {
    ok: false,
    reason:
      misses.length === 1
        ? misses[0]
        : misses.map((miss, index) => `candidate ${index + 1}: ${miss}`).join(' | '),
  };
}

/** `parseStructured` for a caller that only needs the object: `null` is the port's deterministic path. */
export function extractStructured<T>(text: string, schema: ZodType<T>): T | null {
  const extraction = parseStructured(text, schema);
  return extraction.ok ? extraction.value : null;
}

/**
 * What one turn wrote. The CLI streams a turn as several assistant messages —
 * one per content block, and when a reply runs past the output cap it resumes
 * it in a further API call mid-thought — while the closing `result` repeats
 * only the last message's text. A long answer read from `result` alone is its
 * tail: no opening brace, nothing to parse. So every top-level text block is
 * kept in arrival order and read as one; a message the CLI retracts (it names
 * it in a later message's `supersedes`) is dropped.
 */
class TurnTranscript {
  private readonly texts = new Map<string, string>();

  add(message: SDKAssistantMessage): void {
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
 * prompt as JSON Schema and `parseStructured` enforces it on the way out over
 * the whole turn's text — a miss is `null`, exactly the contract every caller
 * already handles, and the recorded call says why.
 *
 * Implements `LlmRecordable` so a run dump captures the exchange.
 */
export class ClaudeAgentLlmClient implements LlmClient, LlmRecordable {
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

  /**
   * One answer, or null once the attempts the policy allows are spent.
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
   * exactly as visible as it was before there was a second attempt.
   */
  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    for (let attempt = 1; ; attempt += 1) {
      const { value, kind } = await this.gate.run(({ queuedMs }) =>
        this.callOnce(request, queuedMs, attempt),
      );
      if (kind === null) return value;
      if (!retryable(kind, attempt, this.retry)) return null;
      const pause = backoffFor(kind, attempt, this.retry);
      if (pause > 0) await this.pause(pause);
    }
  }

  private async callOnce<T>(
    request: StructuredRequest<T>,
    queuedMs: number,
    attempt: number,
  ): Promise<{ value: T | null; kind: LlmFailureKind | null }> {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const startedAt = new Date();
    const started = Date.now();
    let jsonSchema = '';

    let kind: LlmFailureKind | null = null;
    const record = (
      call: Pick<LlmCall, 'outcome' | 'text' | 'response' | 'error' | 'usage' | 'stopReason'>,
    ): void => {
      this.sink?.({
        model: this.model,
        system: request.system,
        user: request.user,
        schema: jsonSchema ? safeJson(jsonSchema) : null,
        maxTokens,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - started,
        requestId: null,
        attempt,
        queuedMs,
        ...call,
      });
    };

    // The limit this call runs under, from what it declares. Our abort is a
    // fact this adapter knows first-hand, so whether it fired is read from the
    // signal — never from the name of whatever the SDK threw afterwards, which
    // is a plain `Error` ("process aborted by user") and read as a broken pipe.
    const abort = new AbortController();
    const timedOut = (cause?: string): LlmCall['error'] => ({
      name: TIMED_OUT,
      message: `no answer within ${describeCallLimit(maxTokens, this.limits)}${cause ? `: ${cause}` : ''}`,
    });

    try {
      // Inside the try: an unconvertible schema must yield null, not reject —
      // the LlmClient contract is "null on any failure".
      jsonSchema = JSON.stringify(z.toJSONSchema(request.schema));
      const prompt = [
        request.user,
        '',
        '# Output format',
        'Respond with ONLY one JSON object — no prose before or after, no markdown',
        'fence. It must validate against this JSON Schema:',
        jsonSchema,
      ].join('\n');

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

      const reading = readTurn(turn);
      let read: TurnRead;
      try {
        const settled = await Promise.race([reading, deadline.abandoned.then(() => null)]);
        if (settled === null) {
          // Past the limit and its grace, and the stream still open: whatever
          // it would say now is no answer. Its late settling is swallowed.
          reading.catch(() => undefined);
          turn.close?.();
          kind = 'timeout';
          record({
            outcome: 'error',
            text: null,
            response: null,
            error: timedOut('the turn did not end after its abort'),
            usage: null,
            stopReason: null,
          });
          return { value: null, kind };
        }
        read = settled;
      } finally {
        deadline.stop();
      }
      const { transcript, resultText, stopReason, failure, assistantError, usage } = read;

      if (resultText === null) {
        // `failure.name` is whichever closed vocabulary spoke: the assistant's
        // error when there was one, else the result's subtype — unless our
        // own abort is what ended the turn.
        const aborted = abort.signal.aborted;
        kind = classifyFailure({
          aborted,
          assistantError: failure?.name ?? null,
          resultSubtype: failure?.name ?? null,
        });
        record({
          outcome: 'error',
          text: null,
          response: null,
          error: aborted ? timedOut(failure?.message) : failure,
          usage,
          stopReason,
        });
        return { value: null, kind };
      }
      // The whole turn first; `result` alone only when the turn streamed no
      // text of its own, or what it streamed does not hold the answer.
      const written = transcript.text || resultText;
      let extraction = parseStructured(written, request.schema);
      if (!extraction.ok && written !== resultText) {
        const fromResult = parseStructured(resultText, request.schema);
        if (fromResult.ok) extraction = fromResult;
      }
      if (!extraction.ok) {
        // A reply the model truncated is not the same failure as a reply that
        // simply broke a bound, and only one of them is worth re-asking in the
        // same breath; the assistant's own `max_output_tokens` says which.
        kind = classifyFailure({ assistantError, schemaMiss: true });
      }
      record(
        extraction.ok
          ? {
              outcome: 'ok',
              text: written,
              response: extraction.value,
              error: null,
              usage,
              stopReason,
            }
          : {
              outcome: 'schema-miss',
              text: written,
              response: null,
              error: { name: SCHEMA_MISS, message: extraction.reason },
              usage,
              stopReason,
            },
      );
      return { value: extraction.ok ? extraction.value : null, kind };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const aborted = abort.signal.aborted;
      kind = classifyFailure({ noResult: true, aborted });
      record({
        outcome: 'error',
        text: null,
        response: null,
        error: aborted ? timedOut(err.message) : { name: err.name, message: err.message },
        usage: null,
        stopReason: null,
      });
      return { value: null, kind };
    }
  }
}

/** What one turn said, read to its end. */
interface TurnRead {
  transcript: TurnTranscript;
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
 * Read a turn's messages to the end. It rejects only when the stream broke
 * before a result arrived: the CLI exits non-zero after an error result and
 * the SDK rethrows that exit, but the result already carries the reason worth
 * recording.
 */
async function readTurn(turn: AsyncIterable<SDKMessage>): Promise<TurnRead> {
  const read: TurnRead = {
    transcript: new TurnTranscript(),
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
        read.transcript.add(message);
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

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
