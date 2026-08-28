import type { LlmClient, StructuredRequest } from './llm-client';

/**
 * The client that runs when no ANTHROPIC_API_KEY is configured — or when
 * EVAL_DETERMINISTIC=1 pins tests and e2e runs to reproducible output.
 * Everything downstream still works; callers keep their deterministic answer.
 */
export class NoopLlmClient implements LlmClient {
  readonly enabled = false;
  readonly model = null;

  completeStructured<T>(_request: StructuredRequest<T>): Promise<T | null> {
    return Promise.resolve(null);
  }
}
