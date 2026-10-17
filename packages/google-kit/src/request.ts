import {
  NO_RECOVERY,
  rideOut,
  type Recovery,
  type RecoveryClock,
  type Settled,
} from '@sysdesign/contracts';
import { z, type ZodType } from 'zod';

import type { TokenSource } from './oauth';

/** Google answered, and refused. `reason` is its own word for why (`notFound`, `rateLimitExceeded`, …). */
export class GoogleRefused extends Error {
  override readonly name = 'GoogleRefused';
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
    readonly route: string,
  ) {
    super(`${route}: ${message} (${status} ${reason})`);
  }
}

/** Nobody answered: the socket died, or the call took too long. */
export class GoogleUnreachable extends Error {
  override readonly name = 'GoogleUnreachable';
  constructor(
    readonly route: string,
    detail: string,
  ) {
    super(`${route}: ${detail}`);
  }
}

export type GoogleMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One call: where, how, with what, and the schema its answer is read by — a loose object, since Google answers more than any caller reads. */
export interface GoogleCall<T> {
  method: GoogleMethod;
  url: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  body?: unknown;
  schema: ZodType<T>;
  timeoutMs?: number;
}

const CALL_TIMEOUT_MS = 30_000;

const errorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

interface Answer {
  status: number;
  body: unknown;
}

const urlOf = (call: GoogleCall<unknown>): string => {
  const url = new URL(call.url);
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Whether an attempt may be asked again within the declared recovery: a dead socket, a rate limit, a server error. */
const transient = (outcome: Settled<Answer>): boolean =>
  'error' in outcome
    ? outcome.error instanceof GoogleUnreachable
    : outcome.value.status === 429 || outcome.value.status >= 500;

/**
 * One authorized request: the bearer token carried, the answer parsed by
 * the caller's schema. A token Google refused is forgotten and the request
 * sent once more with a fresh one; a rate limit or a server error is ridden
 * out within the declared recovery; any other refusal names Google's own
 * reason and the route; an answer with no body reads as null.
 */
export async function googleRequest<T>(
  auth: TokenSource,
  call: GoogleCall<T>,
  fetchImpl: typeof fetch = fetch,
  recovery: Recovery = NO_RECOVERY,
  clock?: RecoveryClock,
): Promise<T> {
  const route = `${call.method} ${new URL(call.url).pathname}`;
  const attempt = async (): Promise<Answer> => {
    const first = await send(auth, call, route, fetchImpl);
    if (first.status !== 401) return first;
    // The token was refused: forget it, mint another, send once more.
    auth.invalidate();
    return send(auth, call, route, fetchImpl);
  };
  const answer = await rideOut(recovery, attempt, transient, clock);
  if (answer.status >= 200 && answer.status < 300) return call.schema.parse(answer.body);
  const refusal = errorSchema.safeParse(answer.body);
  const detail = refusal.success ? refusal.data.error : null;
  throw new GoogleRefused(
    answer.status,
    detail?.errors?.[0]?.reason ?? detail?.status ?? 'unknown',
    detail?.message ?? `HTTP ${answer.status}`,
    route,
  );
}

async function send(
  auth: TokenSource,
  call: GoogleCall<unknown>,
  route: string,
  fetchImpl: typeof fetch,
): Promise<Answer> {
  const token = await auth.accessToken();
  let response: Response;
  try {
    response = await fetchImpl(urlOf(call), {
      method: call.method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: AbortSignal.timeout(call.timeoutMs ?? CALL_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GoogleUnreachable(route, describe(error));
  }
  const text = await response.text();
  let body: unknown = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}
