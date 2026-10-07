import { modelSchema, type SchemaIssue } from '@sysdesign/contracts';

import { CALL_TIME_POLICY, callTimeLimitMs, type CallTimePolicy } from './call-time-limit';
import type { LlmCall, LlmCallSink, LlmRecordable } from './exchange';
import { InFlightGate } from './in-flight-gate';
import type { LlmClient, LlmDetailed, StructuredReply, StructuredRequest } from './llm-client';
import {
  backoffFor,
  classifyFailure,
  DEFAULT_RETRY_POLICY,
  retryable,
  type LlmFailureKind,
  type LlmRetryPolicy,
} from './llm-failure';
import type { LlmApi } from './llm-config';
import { strictJsonSchema } from './strict-schema';
import {
  FEEDBACK_HEADING,
  parseStructured,
  PREVIOUS_REPLY_HEADING,
  SCHEMA_MISS,
  TIMED_OUT,
} from './structured-reply';

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);

/**
 * Any endpoint that speaks one of OpenAI's shapes, over plain `fetch`.
 *
 * One adapter serves several endpoints because they are the same shape: OpenAI
 * itself, and a local server that answers at the same paths. What separates
 * them is configuration — a base URL, whether a key is wanted, and which of
 * the two APIs they are asked through — so separating them in code would be
 * copies of this file differing by a string.
 *
 * Which API is a DECLARED fact (`api` on the configuration), never something
 * inferred from the URL: the two differ in how the ask is written and how the
 * reply is read, and no endpoint is guaranteed to serve both. `API_SHAPES`
 * holds that difference and nothing else does, so the call path below is the
 * same whichever one is in force.
 *
 * The schema reaches the model as a strict JSON Schema either way, so a reply
 * that does not match it is the endpoint's problem rather than ours. It is
 * still read back through the same salvage ladder the other provider's replies
 * go through: strict is a guarantee about the shape, not about the sizes, and a
 * server that honours the field only loosely must not read differently from one
 * that honours it exactly.
 */
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_COMPATIBLE_DEFAULT_MODEL = 'gpt-4o-mini';
/** What the response format calls the schema; the endpoint requires a name and never shows it to the model. */
export const SCHEMA_NAME = 'reply';

/** What one attempt asks for, in the terms both APIs share. */
export interface Ask {
  readonly model: string;
  readonly system: string;
  readonly user: string;
  readonly schema: Record<string, unknown>;
  readonly strict: boolean;
  readonly maxTokens: number;
  /** Retain the exchange in the provider's own logs; undefined leaves its default. */
  readonly store: boolean | undefined;
}

/** What one reply came back with, in the terms the recorder keeps. */
export interface Completion {
  readonly text: string;
  readonly stopReason: string | null;
  readonly usage: { inputTokens: number; outputTokens: number };
  /** The provider's own id for the exchange — what a dump is read beside its logs by. */
  readonly requestId: string | null;
}

/** One OpenAI shape: where it lives, how an ask is written for it, how a reply is read back. */
export interface ApiShape {
  readonly path: string;
  body(ask: Ask): Record<string, unknown>;
  read(payload: unknown): Completion;
}

/** `store` is sent only when the configuration said so, so an endpoint with no such field never sees it. */
const stored = (store: boolean | undefined): Record<string, boolean> =>
  store === undefined ? {} : { store };

export const API_SHAPES: Readonly<Record<LlmApi, ApiShape>> = {
  chat: {
    path: '/chat/completions',
    body: (ask) => ({
      model: ask.model,
      max_completion_tokens: ask.maxTokens,
      messages: [
        { role: 'system', content: ask.system },
        { role: 'user', content: ask.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: ask.schema, strict: ask.strict },
      },
      ...stored(ask.store),
    }),
    read: (payload) => {
      const reply = payload as {
        id?: string;
        choices?: { message?: { content?: string | null }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: reply.choices?.[0]?.message?.content ?? '',
        stopReason: reply.choices?.[0]?.finish_reason ?? null,
        usage: {
          inputTokens: reply.usage?.prompt_tokens ?? 0,
          outputTokens: reply.usage?.completion_tokens ?? 0,
        },
        requestId: reply.id ?? null,
      };
    },
  },
  responses: {
    path: '/responses',
    body: (ask) => ({
      model: ask.model,
      instructions: ask.system,
      input: [{ role: 'user', content: ask.user }],
      max_output_tokens: ask.maxTokens,
      // Flattened beside the format, not nested under a `json_schema` key the
      // way chat completions wants it — the one place the two shapes look alike
      // and are not.
      text: {
        format: {
          type: 'json_schema',
          name: SCHEMA_NAME,
          schema: ask.schema,
          strict: ask.strict,
        },
      },
      ...stored(ask.store),
    }),
    read: (payload) => {
      const reply = payload as {
        id?: string;
        status?: string;
        incomplete_details?: { reason?: string } | null;
        output?: { type?: string; content?: { type?: string; text?: string }[] }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      // The message is FOUND, never indexed: a reasoning model puts a reasoning
      // item ahead of it, so `output[0]` is the answer only sometimes — and
      // reading position 0 would return nothing exactly on the models whose
      // answers cost the most.
      const message = reply.output?.find((item) => item.type === 'message');
      const text = message?.content?.find((part) => part.type === 'output_text')?.text ?? '';
      return {
        text,
        // `incomplete_details.reason` is this shape's `finish_reason` — it is
        // what says a reply was cut at the token ceiling; `status` covers the
        // rest.
        stopReason: reply.incomplete_details?.reason ?? reply.status ?? null,
        usage: {
          inputTokens: reply.usage?.input_tokens ?? 0,
          outputTokens: reply.usage?.output_tokens ?? 0,
        },
        requestId: reply.id ?? null,
      };
    },
  },
};

/** The transport, injected so a spec never reaches the network. It carries whichever shape is declared. */
export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleOptions {
  model?: string;
  baseUrl?: string;
  /** Absent where the endpoint wants none — a local server, typically. */
  apiKey?: string | null;
  /** Which of OpenAI's shapes this endpoint is asked through; `chat` is what every one of them serves. */
  api?: LlmApi;
  /** Ask the endpoint to retain the exchange for its own logs; absent leaves its default. */
  store?: boolean;
  /** Ask the endpoint to guarantee the schema. Off for a server that refuses the field. */
  strict?: boolean;
  gate?: InFlightGate;
  retry?: LlmRetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  limits?: CallTimePolicy;
  fetch?: HttpTransport;
  sink?: LlmCallSink;
}

/** What one attempt came back with: a value, or the fault that stopped it. */
interface Attempt<T> {
  reply: StructuredReply<T>;
  failure: LlmFailureKind | null;
  issues: SchemaIssue[];
}

/**
 * What an HTTP status means in the seam's own failure vocabulary. The other
 * provider is an SDK and says these in words, so `classifyFailure` reads
 * words; an endpoint says them in a number, and the number is just as closed a
 * vocabulary. Anything unlisted falls to its class — a server fault is worth
 * another attempt, a request fault is not.
 */
export const STATUS_FAILURES: Readonly<Record<number, LlmFailureKind>> = {
  400: 'invalid-request',
  401: 'auth',
  403: 'auth',
  404: 'invalid-request',
  413: 'invalid-request',
  422: 'invalid-request',
  429: 'rate-limited',
};

export const failureForStatus = (status: number): LlmFailureKind =>
  STATUS_FAILURES[status] ??
  (status >= 500 ? 'overloaded' : status >= 400 ? 'invalid-request' : 'unknown');

const DEFAULT_MAX_TOKENS = 4096;

export class OpenAiCompatibleLlmClient implements LlmClient, LlmDetailed, LlmRecordable {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly shape: ApiShape;
  private readonly store: boolean | undefined;
  private readonly strict: boolean;
  private readonly gate: InFlightGate;
  private readonly retry: LlmRetryPolicy;
  private readonly pause: (ms: number) => Promise<void>;
  private readonly limits: CallTimePolicy;
  private readonly send: HttpTransport;
  private readonly sink: LlmCallSink | null;
  private readonly options: OpenAiCompatibleOptions;

  constructor(options: OpenAiCompatibleOptions = {}) {
    this.model = options.model ?? OPENAI_COMPATIBLE_DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? null;
    this.shape = API_SHAPES[options.api ?? 'chat'];
    this.store = options.store;
    this.strict = options.strict ?? true;
    this.gate = options.gate ?? new InFlightGate();
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
    this.pause =
      options.sleep ?? ((ms) => new Promise<void>((wake) => setTimeout(wake, ms).unref?.()));
    this.limits = options.limits ?? CALL_TIME_POLICY;
    this.send = options.fetch ?? ((url, init) => fetch(url, init));
    this.sink = options.sink ?? null;
    this.options = options;
  }

  /**
   * A twin reporting every call it makes. It shares this one's transport and
   * its gate, so deriving one per run is cheap — and so the process ceiling
   * stays one ceiling however many twins are holding it.
   */
  withRecorder(sink: LlmCallSink): LlmClient {
    return new OpenAiCompatibleLlmClient({ ...this.options, gate: this.gate, sink });
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    return (await this.completeStructuredDetailed(request)).value;
  }

  /**
   * One answer, retried inside the call its caller is already awaiting — the
   * same rule the other provider keeps, and for the same reason: a lens sample
   * is one call and must stay one outcome, because the loop counts agreement
   * across a lens's own samples and a retry arriving as an extra sample would
   * inflate what agreement means.
   */
  async completeStructuredDetailed<T>(request: StructuredRequest<T>): Promise<StructuredReply<T>> {
    let previous: SchemaIssue[] = [];
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.gate.run(({ queuedMs }) =>
        this.callOnce(request, previous, attempt, queuedMs),
      );
      if (outcome.failure === null) return outcome.reply;
      previous = outcome.issues.length > 0 ? outcome.issues : previous;
      if (!retryable(outcome.failure, attempt, this.retry)) {
        return { ...outcome.reply, issues: previous };
      }
      const wait = backoffFor(outcome.failure, attempt, this.retry);
      if (wait > 0) await this.pause(wait);
    }
  }

  private async callOnce<T>(
    request: StructuredRequest<T>,
    previous: readonly SchemaIssue[],
    attempt: number,
    queuedMs: number,
  ): Promise<Attempt<T>> {
    const { json, bounds } = modelSchema(request.schema);
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const startedAt = new Date().toISOString();
    const began = Date.now();
    const strictSchema = strictJsonSchema(json);
    const ask = askWith(request.user, previous);
    /**
     * Every attempt is recorded in its own right, whichever way it ended —
     * carrying the provider's id for the exchange, which is what lets a run's
     * dump be read beside that provider's own logs.
     */
    const record = (
      end: Pick<
        LlmCall,
        'outcome' | 'stopReason' | 'usage' | 'text' | 'response' | 'error' | 'requestId'
      >,
    ): void => {
      this.sink?.({
        model: this.model,
        system: request.system,
        user: ask,
        schema: strictSchema,
        maxTokens,
        startedAt,
        durationMs: Date.now() - began,
        attempt,
        queuedMs,
        apiCalls: 1,
        ...end,
      });
    };
    const body = this.shape.body({
      model: this.model,
      system: request.system,
      user: ask,
      schema: strictSchema,
      strict: this.strict,
      maxTokens,
      store: this.store,
    });

    const abort = AbortSignal.timeout(callTimeLimitMs(maxTokens, this.limits));
    let completion: Completion;
    try {
      const response = await this.send(`${this.baseUrl}${this.shape.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey === null ? {} : { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: abort,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 400);
        record({
          outcome: 'error',
          stopReason: String(response.status),
          usage: null,
          text: null,
          response: null,
          // A refusal carries no body id, so the header is the only handle on
          // it — and the one the provider's own support asks for.
          requestId: response.headers.get('x-request-id'),
          error: { name: `Http${response.status}`, message: detail },
        });
        return this.failed(failureForStatus(response.status));
      }
      completion = this.shape.read(await response.json());
    } catch (cause) {
      // Our own abort is the only timeout here; anything else never reached a reply.
      const aborted = cause instanceof Error && cause.name === 'TimeoutError';
      record({
        outcome: 'error',
        stopReason: null,
        usage: null,
        text: null,
        response: null,
        requestId: null,
        error: { name: aborted ? TIMED_OUT : 'Transport', message: messageOf(cause) },
      });
      return this.failed(aborted ? 'timeout' : 'transport');
    }
    const { text, stopReason, usage, requestId } = completion;

    const extraction = parseStructured(text, request.schema, bounds);
    if (extraction.ok) {
      record({
        outcome: 'ok',
        stopReason,
        usage,
        text,
        response: extraction.value,
        requestId,
        error: null,
      });
      return {
        reply: { value: extraction.value, issues: [], overruns: extraction.overruns },
        failure: null,
        issues: [],
      };
    }
    record({
      outcome: 'schema-miss',
      stopReason,
      usage,
      text,
      response: null,
      requestId,
      error: { name: SCHEMA_MISS, message: extraction.reason },
    });
    return {
      reply: { value: null, issues: extraction.issues, overruns: [] },
      // The shared classifier owns what a miss is worth, for either provider.
      failure: classifyFailure({ schemaMiss: true }),
      issues: extraction.issues,
    };
  }

  private failed<T>(failure: LlmFailureKind): Attempt<T> {
    return { reply: { value: null, issues: [], overruns: [] }, failure, issues: [] };
  }
}

/** The ask, with the last reply's faults named above it when there were any. */
function askWith(user: string, previous: readonly SchemaIssue[]): string {
  if (previous.length === 0) return user;
  const faults = previous.map((issue) => `- ${issue.at}: ${issue.message}`).join('\n');
  return `${FEEDBACK_HEADING}\n\n${faults}\n\n${PREVIOUS_REPLY_HEADING.replace('The reply, as written', 'The ask')}\n\n${user}`;
}
