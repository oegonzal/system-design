import { vi } from 'vitest';

/**
 * Scripted `fetch` stub for the API client.
 *
 * Strict by design: a request no route matches **throws**, so a spec can
 * never silently exercise an endpoint it did not declare. `sequence` returns
 * one body per call (last repeats), which is how the evaluation specs script
 * a queued → running → complete progression through a single route.
 */

export interface StubCall {
  url: URL;
  init: RequestInit | undefined;
  /** How many times this route matched before this call. */
  count: number;
}

export interface StubRoute {
  /** Defaults to GET. */
  method?: string;
  /** Matched against the URL pathname (`/api/prompts`), exact or regex. */
  path: string | RegExp;
  status?: number;
  body?: unknown;
  /** One entry per matching call; the last entry repeats forever. */
  sequence?: unknown[];
  /** Full control; wins over `body`/`sequence`. */
  handler?: (call: StubCall) => { status?: number; body?: unknown };
}

export interface StubApi {
  fetchMock: ReturnType<typeof vi.fn>;
  /** Every request seen, in order — assert on paths and query strings. */
  calls: { method: string; url: string }[];
}

export function stubApi(routes: StubRoute[]): StubApi {
  const calls: { method: string; url: string }[] = [];
  const counters = new Map<StubRoute, number>();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, url: `${url.pathname}${url.search}` });

    const route = routes.find(
      (candidate) =>
        (candidate.method ?? 'GET').toUpperCase() === method &&
        (typeof candidate.path === 'string'
          ? url.pathname === candidate.path
          : candidate.path.test(url.pathname)),
    );
    if (!route) {
      throw new Error(`Unstubbed request: ${method} ${url.pathname}${url.search}`);
    }

    const count = counters.get(route) ?? 0;
    counters.set(route, count + 1);

    let status = route.status ?? 200;
    let body: unknown;
    if (route.handler) {
      const result = route.handler({ url, init, count });
      status = result.status ?? status;
      body = result.body;
    } else if (route.sequence) {
      body = route.sequence[Math.min(count, route.sequence.length - 1)];
    } else {
      body = route.body;
    }

    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body ?? null), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}
