/**
 * The fakes a Google-backed program's specs take: a fetch that answers by
 * route and remembers every call, and a token source that mints nothing.
 * Pure — no vitest import.
 */
import type { TokenSource } from './oauth';

/** One recorded call: the method, the URL with its query, and the JSON body if any. */
export interface RecordedCall {
  method: string;
  url: URL;
  body: unknown;
  headers: Record<string, string>;
}

/** How a route answers: a Response, built from the call. */
export type RouteAnswer = (call: RecordedCall) => Response | Promise<Response>;

/** Routes keyed `METHOD https://host/path` — the query left off, read from the call. */
export type Routes = Record<string, RouteAnswer>;

export interface FakeGoogleFetch {
  fetch: typeof fetch;
  calls: RecordedCall[];
  routes: Routes;
}

const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  const given = init?.headers;
  if (given === undefined) return {};
  if (given instanceof Headers) return Object.fromEntries(given.entries());
  if (Array.isArray(given)) return Object.fromEntries(given);
  return { ...given } as Record<string, string>;
};

const bodyOf = (init: RequestInit | undefined): unknown => {
  const { body } = init ?? {};
  if (body === undefined || body === null) return null;
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
};

/** A fetch over the given routes; a route nobody declared answers 404 with an empty body. */
export function fakeGoogleFetch(routes: Routes = {}): FakeGoogleFetch {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      url,
      body: bodyOf(init),
      headers: headersOf(init),
    };
    calls.push(call);
    const route = routes[`${call.method} ${url.origin}${url.pathname}`];
    return route === undefined ? new Response('', { status: 404 }) : route(call);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, routes };
}

/** A token source that always has a token, and counts how often it was told to forget one. */
export class FakeTokenSource implements TokenSource {
  invalidated = 0;
  constructor(private readonly token = 'fake-access-token') {}
  accessToken(): Promise<string> {
    return Promise.resolve(this.token);
  }
  invalidate(): void {
    this.invalidated += 1;
  }
}

/** A JSON answer, as Google sends one. */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Google's own refusal shape. */
export const googleError = (status: number, reason: string, message: string): Response =>
  json(
    { error: { code: status, message, status: reason.toUpperCase(), errors: [{ reason }] } },
    status,
  );
