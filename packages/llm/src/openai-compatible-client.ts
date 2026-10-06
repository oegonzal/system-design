import { modelSchema, type SchemaIssue } from '@sysdesign/contracts';

import { CALL_TIME_POLICY, callTimeLimitMs, type CallTimePolicy } from './call-time-limit';
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
import { strictJsonSchema } from './strict-schema';
import { FEEDBACK_HEADING, parseStructured, PREVIOUS_REPLY_HEADING } from './structured-reply';

/**
 * Any endpoint that speaks OpenAI's chat completions, over plain `fetch`.
 *
 * One adapter serves two of them because they are one shape: OpenAI itself,
 * and a local server — Ollama, say — that answers at the same paths. What
 * separates them is configuration, a base URL and whether a key is wanted, so
 * separating them in code would be two copies of this file differing by a
 * string.
 *
 * The schema reaches the model as `response_format: json_schema` with
 * `strict`, so a reply that does not match the schema is the endpoint's
 * problem rather than ours. It is still read back through the same salvage
 * ladder the other provider's replies go through: strict is a guarantee about
 * the shape, not about the sizes, and a server that honours the field only
 * loosely must not read differently from one that honours it exactly.
 */
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_COMPATIBLE_DEFAULT_MODEL = 'gpt-4o-mini';
/** What the response format calls the schema; the endpoint requires a name and never shows it to the model. */
export const SCHEMA_NAME = 'reply';

/** The transport, injected so a spec never reaches the network. */
export type ChatTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleOptions {
  model?: string;
  baseUrl?: string;
  /** Absent where the endpoint wants none — a local server, typically. */
  apiKey?: string | null;
  /** Ask the endpoint to guarantee the schema. Off for a server that refuses the field. */
  strict?: boolean;
  gate?: InFlightGate;
  retry?: LlmRetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  limits?: CallTimePolicy;
  fetch?: ChatTransport;
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

export class OpenAiCompatibleLlmClient implements LlmClient, LlmDetailed {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly strict: boolean;
  private readonly gate: InFlightGate;
  private readonly retry: LlmRetryPolicy;
  private readonly pause: (ms: number) => Promise<void>;
  private readonly limits: CallTimePolicy;
  private readonly send: ChatTransport;

  constructor(options: OpenAiCompatibleOptions = {}) {
    this.model = options.model ?? OPENAI_COMPATIBLE_DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? null;
    this.strict = options.strict ?? true;
    this.gate = options.gate ?? new InFlightGate();
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
    this.pause =
      options.sleep ?? ((ms) => new Promise<void>((wake) => setTimeout(wake, ms).unref?.()));
    this.limits = options.limits ?? CALL_TIME_POLICY;
    this.send = options.fetch ?? ((url, init) => fetch(url, init));
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
      const outcome = await this.gate.run(() => this.callOnce(request, previous));
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
  ): Promise<Attempt<T>> {
    const { json, bounds } = modelSchema(request.schema);
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const body = {
      model: this.model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: askWith(request.user, previous) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: strictJsonSchema(json), strict: this.strict },
      },
    };

    const abort = AbortSignal.timeout(callTimeLimitMs(maxTokens, this.limits));
    let text: string;
    try {
      const response = await this.send(`${this.baseUrl}/chat/completions`, {
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
        return this.failed(failureForStatus(response.status), detail);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      };
      text = payload.choices?.[0]?.message?.content ?? '';
    } catch (cause) {
      // Our own abort is the only timeout here; anything else never reached a reply.
      const aborted = cause instanceof Error && cause.name === 'TimeoutError';
      return this.failed(aborted ? 'timeout' : 'transport');
    }

    const extraction = parseStructured(text, request.schema, bounds);
    if (extraction.ok) {
      return {
        reply: { value: extraction.value, issues: [], overruns: extraction.overruns },
        failure: null,
        issues: [],
      };
    }
    return {
      reply: { value: null, issues: extraction.issues, overruns: [] },
      // The shared classifier owns what a miss is worth, for either provider.
      failure: classifyFailure({ schemaMiss: true }),
      issues: extraction.issues,
    };
  }

  private failed<T>(failure: LlmFailureKind, detail = ''): Attempt<T> {
    void detail;
    return { reply: { value: null, issues: [], overruns: [] }, failure, issues: [] };
  }
}

/** The ask, with the last reply's faults named above it when there were any. */
function askWith(user: string, previous: readonly SchemaIssue[]): string {
  if (previous.length === 0) return user;
  const faults = previous.map((issue) => `- ${issue.at}: ${issue.message}`).join('\n');
  return `${FEEDBACK_HEADING}\n\n${faults}\n\n${PREVIOUS_REPLY_HEADING.replace('The reply, as written', 'The ask')}\n\n${user}`;
}
