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
 * see real exchanges. `fakeLlm()` with no canned answers is the failing
 * model: every call is a schema miss and the stage records `llm-failed`.
 */
export function fakeLlm(...canned: readonly unknown[]): LlmClient & LlmRecordable {
  const build = (sink: LlmCallSink | null): LlmClient & LlmRecordable => ({
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

/**
 * `fakeLlm` whose canned answers are consumed in order: when more than one
 * canned object satisfies a request's schema, the first is used once and
 * dropped, so a stage asked the same question twice — the producer on
 * revise, an evaluator on the next iteration — gets the next answer. The
 * last answer for a schema stands for every later call. Twins share the
 * queue, so attribution works as it does for `fakeLlm`.
 */
export function sequencedLlm(...canned: readonly unknown[]): LlmClient & LlmRecordable {
  const remaining = [...canned];
  const build = (sink: LlmCallSink | null): LlmClient & LlmRecordable => ({
    model: 'test-model',
    completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
      const matches = remaining.flatMap((candidate, index) =>
        request.schema.safeParse(candidate).success ? [index] : [],
      );
      const answer = matches.length > 0 ? [remaining[matches[0]]] : [];
      if (matches.length > 1) remaining.splice(matches[0], 1);
      const twin = fakeLlm(...answer);
      return (sink ? twin.withRecorder(sink) : twin).completeStructured(request);
    },
    withRecorder: (next) => build(next),
  });
  return build(null);
}

/**
 * A model that waits: every call after the first `passing` blocks until
 * `release()` — so a spec can hold a run in flight, from its start or partway
 * through, while it looks at it or boots a second instance beside it.
 * Recording passes through to the inner client; twins share the count.
 */
export function gatedLlm(
  inner: LlmClient & LlmRecordable,
  passing = 0,
): LlmClient & LlmRecordable & { release(): void } {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let calls = 0;
  const build = (
    client: LlmClient & LlmRecordable,
  ): LlmClient & LlmRecordable & { release(): void } => ({
    model: client.model,
    async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
      if (calls++ >= passing) await gate;
      return client.completeStructured(request);
    },
    // A recorded twin of the inner client shares the gate: `fakeLlm` twins are recordable too.
    withRecorder: (next) => build(client.withRecorder(next) as LlmClient & LlmRecordable),
    release: () => open(),
  });
  return build(inner);
}
