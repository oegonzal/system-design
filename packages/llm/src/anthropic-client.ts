import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import type { LlmClient, StructuredRequest } from './llm-client';

export const DEFAULT_LLM_MODEL = 'claude-sonnet-5';

/**
 * Real Claude client. `messages.parse` + `zodOutputFormat` makes the schema a
 * server-side output constraint, so "the model returned prose instead of
 * JSON" stops being a failure mode; what remains (refusal, API error,
 * parse miss) maps to `null` and the caller's deterministic path.
 *
 * `claude-sonnet-5` is the default: the critic and enricher run on every
 * submission, and Sonnet's cost/latency fits a background loop. Set
 * LLM_MODEL=claude-opus-5 for the highest-quality critiques.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly enabled = true;
  readonly model: string;

  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.model = options.model ?? DEFAULT_LLM_MODEL;
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: {
          format: zodOutputFormat(request.schema),
        },
      });

      if (response.stop_reason === 'refusal') {
        console.warn(`llm: ${this.model} declined the request`);
        return null;
      }

      // Null when the response failed schema validation.
      return response.parsed_output ?? null;
    } catch (error) {
      // Deliberately broad: every LLM caller has a deterministic fallback,
      // and a background eval must never crash because the API hiccuped.
      console.warn(`llm: request failed — ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
