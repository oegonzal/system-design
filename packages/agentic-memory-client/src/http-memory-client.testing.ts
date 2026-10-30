import type { HttpMemoryClient, HttpMemoryOptions } from './http-memory-client';

/**
 * What the HTTP adapter's two specs run against, declared once: a fetch that
 * answers from a script and records each call, a clock that advances only
 * when slept, and every verb of the port with the route the host declares for
 * it and what the call carries. Pure — no vitest import.
 */

/** One scripted answer: a status with a body, the error the fetch rejects with, or one of the ways a host fails to answer. */
export type Script = { status: number; body?: unknown } | Error | 'hang' | 'stall' | 'cut';
export type Call = { method: string; url: string; body: unknown };

/** A body the host never finishes: read, it fails only when the call is abandoned, with the signal's reason, as undici's does. */
const stalling = (signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    },
  });

/** A body the host closed the socket under: read, it fails at once, in undici's words. */
const severed = (): ReadableStream<Uint8Array> =>
  new ReadableStream({ start: (controller) => controller.error(new TypeError('terminated')) });

/**
 * A fetch answering from a script, call by call, that records what it was
 * asked. `hang` answers only when the call is abandoned; `stall` answers 200
 * at once and never finishes the body; `cut` answers 200 and fails the body
 * at once; a script run dry hangs.
 */
export function scripted(answers: Script[]): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: String(init?.method),
      url: String(url),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const answer = answers.shift() ?? 'hang';
    if (answer instanceof Error) throw answer;
    if (answer === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    }
    if (answer === 'stall') return new Response(stalling(init?.signal), { status: 200 });
    if (answer === 'cut') return new Response(severed(), { status: 200 });
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

export const HOST = 'http://memory.test';
export const SPACE = '0f2a1c4e-6b7d-4e8f-9a0b-1c2d3e4f5a6b';
export const RUN = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
export const RECORD = '3b4c5d6e-7f80-4a1b-9c2d-3e4f5a6b7c8d';
export const SCOPE = { tenant: 'north' };
export const PROVENANCE = { source: 'spec', sourceRunId: null };
export const CANDIDATE = {
  subject: 'the subject',
  predicate: 'prefers',
  value: 'tea',
  validFrom: null,
};

/** Each request as a caller writes it, sent as written: the client applies no default and reads no field. */
export const REMEMBERING = {
  register: 'fact',
  scope: SCOPE,
  candidate: CANDIDATE,
  provenance: PROVENANCE,
};
const UPDATING = { recordId: RECORD, scope: SCOPE, candidate: CANDIDATE, provenance: PROVENANCE };
const INVALIDATING = { recordId: RECORD, scope: SCOPE, reason: 'withdrawn' };
export const RECALLING = { scope: SCOPE, text: 'what does the subject prefer' };
export const HISTORY = { recordId: RECORD, scope: SCOPE };
const CONSOLIDATING = { scope: SCOPE };
const DIGESTING = {
  title: 'a text',
  parts: [{ label: null, at: null, text: 'the subject prefers tea' }],
  scope: SCOPE,
  provenance: PROVENANCE,
};

/** The fetch's own rejection for a socket nobody answered on — refused, or reset after the request arrived: the same words either way. */
export const dead = () => new TypeError('fetch failed');
/** The host failing a call it received. */
export const failed = { status: 500, body: { statusCode: 500, message: 'Internal server error' } };

/** A refusal as the host's `refusals.ts` answers one, at the status the contracts declare for its code. */
export const refusal = (status: number, code: string, message: string, missing?: string) => ({
  status,
  body: { statusCode: status, error: 'refused', code, message, issues: [], missing },
});

/** A clock that advances only when slept, and remembers each pause. */
export function ticking(): { clock: NonNullable<HttpMemoryOptions['clock']>; slept: number[] } {
  let now = 0;
  const slept: number[] = [];
  return {
    slept,
    clock: {
      now: () => now,
      sleep: async (ms: number) => {
        slept.push(ms);
        now += ms;
      },
    },
  };
}

export interface Verb {
  name: string;
  ask: (client: HttpMemoryClient) => Promise<unknown>;
  method: string;
  path: string;
  body: unknown;
  ok: number;
  /** Whether it may be asked again when nobody answered it or the host failed it: the reads, and the ensure, idempotent by name. */
  repeatable: boolean;
}

/** Every verb of the port, with the route the host declares for it and what the call carries. */
export const VERBS: readonly Verb[] = [
  {
    name: 'getSpace',
    ask: (c) => c.getSpace(SPACE),
    method: 'GET',
    path: `/spaces/${SPACE}`,
    body: undefined,
    ok: 200,
    repeatable: true,
  },
  {
    name: 'getSpaceByName',
    ask: (c) => c.getSpaceByName('notes'),
    method: 'GET',
    path: '/spaces/by-name/notes',
    body: undefined,
    ok: 200,
    repeatable: true,
  },
  {
    name: 'ensureSpace',
    ask: (c) => c.ensureSpace('notes', { runId: 'r1' }),
    method: 'PUT',
    path: '/spaces/by-name/notes',
    body: { runId: 'r1' },
    ok: 200,
    repeatable: true,
  },
  {
    name: 'remember',
    ask: (c) => c.remember(SPACE, REMEMBERING),
    method: 'POST',
    path: `/spaces/${SPACE}/remember`,
    body: REMEMBERING,
    ok: 200,
    repeatable: false,
  },
  {
    name: 'update',
    ask: (c) => c.update(SPACE, UPDATING),
    method: 'POST',
    path: `/spaces/${SPACE}/update`,
    body: UPDATING,
    ok: 200,
    repeatable: false,
  },
  {
    name: 'invalidate',
    ask: (c) => c.invalidate(SPACE, INVALIDATING),
    method: 'POST',
    path: `/spaces/${SPACE}/invalidate`,
    body: INVALIDATING,
    ok: 200,
    repeatable: false,
  },
  {
    name: 'recall',
    ask: (c) => c.recall(SPACE, RECALLING),
    method: 'POST',
    path: `/spaces/${SPACE}/recall`,
    body: RECALLING,
    ok: 200,
    repeatable: true,
  },
  {
    name: 'history',
    ask: (c) => c.history(SPACE, HISTORY),
    method: 'POST',
    path: `/spaces/${SPACE}/history`,
    body: HISTORY,
    ok: 200,
    repeatable: true,
  },
  {
    name: 'consolidate',
    ask: (c) => c.consolidate(SPACE, CONSOLIDATING),
    method: 'POST',
    path: `/spaces/${SPACE}/consolidate`,
    body: CONSOLIDATING,
    ok: 200,
    repeatable: false,
  },
  {
    name: 'startDigest',
    ask: (c) => c.startDigest(SPACE, DIGESTING),
    method: 'POST',
    path: `/spaces/${SPACE}/digests`,
    body: DIGESTING,
    ok: 202,
    repeatable: false,
  },
  {
    name: 'getDigest',
    ask: (c) => c.getDigest(SPACE, RUN),
    method: 'GET',
    path: `/spaces/${SPACE}/digests/${RUN}`,
    body: undefined,
    ok: 200,
    repeatable: true,
  },
  {
    name: 'applyDigest',
    ask: (c) => c.applyDigest(SPACE, RUN),
    method: 'POST',
    path: `/spaces/${SPACE}/digests/${RUN}/remember`,
    body: undefined,
    ok: 200,
    repeatable: false,
  },
];
