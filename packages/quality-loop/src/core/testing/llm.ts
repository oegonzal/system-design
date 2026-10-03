/**
 * Fake model clients. Pure helpers only — no vitest imports, so this file
 * compiles under the app tsconfig even though only specs use it.
 */
import { describeIssue, modelSchema, parseLenient, type LenientParse } from '@sysdesign/contracts';
import {
  asDetailed,
  closestMiss,
  SCHEMA_MISS,
  type LlmCallSink,
  type LlmClient,
  type LlmDetailed,
  type LlmRecordable,
  type LlmSalvage,
  type StructuredReply,
  type StructuredRequest,
} from '@sysdesign/llm';

/** What every fake offers: the port, a recorder for attribution specs, and the detailed call. */
export type FakeLlm = LlmClient & LlmRecordable & LlmDetailed;

/**
 * A model that answers by SCHEMA: the first canned object that satisfies the
 * request's schema is the reply — read through the same salvage ladder the
 * real seam uses, so a canned answer over a bound is kept and its overruns
 * reported, and an unasked-for key stripped, as the model's would be. Stage
 * schemas require different fields, so canned answers for different stages
 * do not cross-match. Recordable, so attribution specs see real exchanges,
 * salvage included. `fakeLlm()` with no canned answers is the failing model:
 * every call is a schema miss and the stage records `llm-failed`; a canned
 * answer the schema refuses is a miss that names its faults, the closest
 * candidate's, as the seam does.
 */
export function fakeLlm(...canned: readonly unknown[]): FakeLlm {
  const build = (sink: LlmCallSink | null): FakeLlm => {
    const completeStructuredDetailed = async <T>(
      request: StructuredRequest<T>,
    ): Promise<StructuredReply<T>> => {
      const shown = modelSchema(request.schema);
      const parses: LenientParse<T>[] = canned.map((candidate) =>
        parseLenient(request.schema, candidate, shown.bounds),
      );
      const hit = parses.find((parse) => parse.ok);
      const reply: StructuredReply<T> = hit?.ok
        ? { value: hit.value, issues: [], overruns: hit.overruns }
        : {
            value: null,
            issues: closestMiss(parses.map((parse) => parse.issues)),
            overruns: [],
          };
      const salvage: LlmSalvage = hit?.ok
        ? {
            overruns: hit.overruns,
            repairs: hit.repairs,
            issues: [],
            from: 'result',
            feedback: false,
          }
        : { overruns: [], repairs: [], issues: reply.issues, from: null, feedback: false };
      sink?.({
        model: 'test-model',
        system: request.system,
        user: request.user,
        schema: shown.json,
        maxTokens: request.maxTokens ?? 0,
        startedAt: '1970-01-01T00:00:00.000Z',
        durationMs: 0,
        outcome: reply.value === null ? 'schema-miss' : 'ok',
        stopReason: null,
        usage: null,
        requestId: null,
        text: null,
        response: reply.value,
        error:
          reply.value === null
            ? {
                name: SCHEMA_MISS,
                message: reply.issues.map(describeIssue).join('; ') || 'no canned answer',
              }
            : null,
        salvage,
        apiCalls: 1,
      });
      return reply;
    };
    return {
      model: 'test-model',
      completeStructuredDetailed,
      completeStructured: async (request) => (await completeStructuredDetailed(request)).value,
      withRecorder: (next) => build(next),
    };
  };
  return build(null);
}

/**
 * `fakeLlm` whose canned answers are consumed in order: when more than one
 * canned object satisfies a request's schema, the first is used once and
 * dropped, so a stage asked the same question twice — the producer on
 * revise, an evaluator on the next iteration — gets the next answer. The
 * last answer for a schema stands for every later call; when none does, the
 * miss names the closest one's faults, as `fakeLlm` does. Twins share the
 * queue, so attribution works as it does for `fakeLlm`.
 */
export function sequencedLlm(...canned: readonly unknown[]): FakeLlm {
  const remaining = [...canned];
  const build = (sink: LlmCallSink | null): FakeLlm => {
    const next = <T>(request: StructuredRequest<T>): FakeLlm => {
      const shown = modelSchema(request.schema);
      const matches = remaining.flatMap((candidate, index) =>
        parseLenient(request.schema, candidate, shown.bounds).ok ? [index] : [],
      );
      const answer = matches.length > 0 ? [remaining[matches[0]]] : remaining;
      if (matches.length > 1) remaining.splice(matches[0], 1);
      const twin = fakeLlm(...answer);
      return sink ? (twin.withRecorder(sink) as FakeLlm) : twin;
    };
    return {
      model: 'test-model',
      completeStructured: (request) => next(request).completeStructured(request),
      completeStructuredDetailed: (request) => next(request).completeStructuredDetailed(request),
      withRecorder: (recorder) => build(recorder),
    };
  };
  return build(null);
}

/** How a spec opens the gate: every held call goes on, or every held call throws. */
export interface LlmGate {
  release(): void;
  fail(error: Error): void;
}

/**
 * A model that waits: every call after the first `passing` blocks until
 * `release()` — so a spec can hold a run in flight, from its start or partway
 * through, while it looks at it or boots a second instance beside it — or
 * throws once `fail(error)` breaks the gate, so the run dies right there.
 * Recording passes through to the inner client; twins share the count.
 */
export function gatedLlm(inner: LlmClient & LlmRecordable, passing = 0): FakeLlm & LlmGate {
  let open: () => void = () => undefined;
  let broken: (error: Error) => void = () => undefined;
  const gate = new Promise<void>((resolve, reject) => {
    open = resolve;
    broken = reject;
  });
  // A gate broken before any call waits on it is no unhandled rejection.
  gate.catch(() => undefined);
  let calls = 0;
  const build = (client: LlmClient & LlmRecordable): FakeLlm & LlmGate => ({
    model: client.model,
    async completeStructured<T>(request: StructuredRequest<T>): Promise<T | null> {
      if (calls++ >= passing) await gate;
      return client.completeStructured(request);
    },
    async completeStructuredDetailed<T>(
      request: StructuredRequest<T>,
    ): Promise<StructuredReply<T>> {
      if (calls++ >= passing) await gate;
      return asDetailed(client).completeStructuredDetailed(request);
    },
    // A recorded twin of the inner client shares the gate: `fakeLlm` twins are recordable too.
    withRecorder: (next) => build(client.withRecorder(next) as LlmClient & LlmRecordable),
    release: () => open(),
    fail: (error) => broken(error),
  });
  return build(inner);
}
