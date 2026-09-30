import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import type { LlmCall, LlmCallSink, LlmRecordable } from './exchange';
import type { LlmClient, StructuredRequest } from './llm-client';

export const DEFAULT_LLM_MODEL = 'claude-sonnet-5';

/**
 * Real Claude client. `messages.parse` + `zodOutputFormat` makes the schema a
 * server-side output constraint, so "the model returned prose instead of
 * JSON" stops being a failure mode; what remains (refusal, API error,
 * parse miss) maps to `null`, which the caller records as `llm-failed`.
 *
 * `claude-sonnet-5` is the default: the critic and enricher run on every
 * submission, and Sonnet's cost/latency fits a background loop. Set
 * LLM_MODEL=claude-opus-5 for the highest-quality critiques.
 *
 * It also implements `LlmRecordable`, because this method is the only place the
 * prompt, the raw response, the token usage and the three distinct failure
 * modes all exist at once. Everything below the `return` is lost to callers.
 */
export class AnthropicLlmClient implements LlmClient, LlmRecordable {
  readonly model: string;

  private readonly client: Anthropic;
  private readonly sink: LlmCallSink | null;

  constructor(
    options: {
      apiKey?: string;
      model?: string;
      /** Share an existing transport instead of opening another connection pool. */
      client?: Anthropic;
      sink?: LlmCallSink;
    } = {},
  ) {
    this.client = options.client ?? new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.model = options.model ?? DEFAULT_LLM_MODEL;
    this.sink = options.sink ?? null;
  }

  /**
   * A twin that reports what it sees. It shares `this.client`: building a
   * second `Anthropic` per run would mean a fresh HTTP agent and connection
   * pool on every evaluation.
   */
  withRecorder(sink: LlmCallSink): LlmClient {
    return new AnthropicLlmClient({ client: this.client, model: this.model, sink });
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    const maxTokens = request.maxTokens ?? 4096;
    const startedAt = new Date();
    const started = Date.now();

    // Only assembled when someone is listening — the schema conversion is not
    // free, and the overwhelmingly common case is nobody recording.
    const record = (
      partial: Pick<
        LlmCall,
        'outcome' | 'stopReason' | 'usage' | 'requestId' | 'text' | 'response' | 'error'
      >,
    ): void => {
      if (!this.sink) return;
      this.sink({
        model: this.model,
        system: request.system,
        user: request.user,
        schema: describeSchema(request.schema),
        maxTokens,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - started,
        ...partial,
      });
    };

    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: {
          format: zodOutputFormat(request.schema),
        },
      });

      // `_request_id` is non-enumerable, so it survives only when read by name.
      const seen = {
        stopReason: response.stop_reason ?? null,
        usage: response.usage
          ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
          : null,
        requestId: response._request_id ?? null,
        text: response.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('')
          .trim(),
      };

      if (response.stop_reason === 'refusal') {
        console.warn(`llm: ${this.model} declined the request`);
        record({ ...seen, outcome: 'refusal', response: null, error: null });
        return null;
      }

      // Null when the response failed schema validation.
      const parsed = response.parsed_output ?? null;
      record({
        ...seen,
        outcome: parsed === null ? 'schema-miss' : 'ok',
        response: parsed,
        error: null,
      });
      return parsed;
    } catch (error) {
      // Deliberately broad: every LLM caller has a deterministic fallback,
      // and a background eval must never crash because the API hiccuped.
      console.warn(`llm: request failed — ${error instanceof Error ? error.message : error}`);
      record({
        outcome: 'error',
        stopReason: null,
        usage: null,
        requestId: null,
        text: null,
        response: null,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { name: 'UnknownError', message: String(error) },
      });
      return null;
    }
  }
}

/**
 * A schema is a live object graph; only its JSON Schema form is worth keeping.
 * Recording must never be the thing that breaks a call, so a conversion failure
 * degrades to a note rather than throwing.
 */
function describeSchema(schema: unknown): unknown {
  try {
    return z.toJSONSchema(schema as Parameters<typeof z.toJSONSchema>[0]);
  } catch (error) {
    return { unconvertible: error instanceof Error ? error.message : String(error) };
  }
}
