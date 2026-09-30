/**
 * Fake model clients. Pure helpers only — no vitest imports, so this file
 * compiles under the app tsconfig even though only specs use it.
 */
import type { LlmCallSink, LlmClient, LlmRecordable, StructuredRequest } from '@sysdesign/llm';
import { z } from 'zod';

/**
 * A model that answers by SCHEMA: the first canned object that satisfies the
 * request's schema is the reply. Stage schemas are strict, so canned answers
 * for different stages never cross-match. Recordable, so attribution specs
 * see real exchanges.
 */
export function fakeLlm(...canned: readonly unknown[]): LlmClient & LlmRecordable {
  const build = (sink: LlmCallSink | null): LlmClient & LlmRecordable => ({
    enabled: true,
    model: 'test-model',
    async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
      const hit = canned
        .map((candidate) => request.schema.safeParse(candidate))
        .find((r) => r.success);
      const response = hit?.success ? hit.data : null;
      sink?.({
        model: 'test-model',
        system: request.system,
        user: request.user,
        schema: z.toJSONSchema(request.schema),
        maxTokens: request.maxTokens ?? 0,
        startedAt: '1970-01-01T00:00:00.000Z',
        durationMs: 0,
        outcome: response === null ? 'schema-miss' : 'ok',
        stopReason: null,
        usage: null,
        requestId: null,
        text: null,
        response,
        error: null,
      });
      return response;
    },
    withRecorder: (next) => build(next),
  });
  return build(null);
}

export const disabledLlm = (): LlmClient => ({
  enabled: false,
  model: null,
  completeStructured: () => Promise.resolve(null),
});
