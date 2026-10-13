import { AttemptedHttp } from '../http';
import { transportOf, type Reply } from '../sam-gov/testing';

/** A transport for the USAspending adapter specs: scripted replies, every URL and request remembered, a fixed clock, no sleeping. */
export function httpOf(replies: readonly Reply[]) {
  const { fetch, urls } = transportOf(replies);
  const requests: RequestInit[] = [];
  const http = new AttemptedHttp({
    fetch: (url, init) => {
      requests.push(init);
      return fetch(url);
    },
    sleep: async () => undefined,
    now: () => new Date('2026-09-26T12:00:00Z'),
  });
  return { http, urls, requests };
}

/** The JSON a request posted. */
export const bodyOf = (request: RequestInit | undefined): unknown =>
  JSON.parse(String(request?.body));

/** The adapter's answer when it is `ok`, or a failure a spec can read. */
export function okValue<T>(result: { kind: 'ok'; value: T } | { kind: 'error' }): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.value;
}
