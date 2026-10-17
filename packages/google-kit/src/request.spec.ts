import { z } from 'zod';

import { googleRequest, GoogleRefused, GoogleUnreachable } from './request';
import { fakeGoogleFetch, FakeTokenSource, googleError, json } from './testing';

const LIST = 'https://example.googleapis.com/v1/things';
const schema = z.object({ items: z.array(z.object({ id: z.string() })) });

describe('an authorized request', () => {
  it('[GGL-5] carries the bearer token and the query, parses the answer by the schema, and reads an empty answer as null', async () => {
    const google = fakeGoogleFetch({
      [`GET ${LIST}`]: () => json({ items: [{ id: 'a', extra: true }], nextPageToken: 'x' }),
      [`DELETE ${LIST}`]: () => new Response(null, { status: 204 }),
    });
    const auth = new FakeTokenSource('token-1');
    await expect(
      googleRequest(
        auth,
        {
          method: 'GET',
          url: LIST,
          query: { q: 'from:x', max: 5, skip: undefined, fields: ['id', 'name'] },
          schema,
        },
        google.fetch,
      ),
    ).resolves.toEqual({ items: [{ id: 'a' }] });
    const [call] = google.calls;
    expect(call?.headers['authorization']).toBe('Bearer token-1');
    // A list is the key repeated once per value, the way Google reads a repeated parameter.
    expect(call?.url.search).toBe('?q=from%3Ax&max=5&fields=id&fields=name');
    await expect(
      googleRequest(auth, { method: 'DELETE', url: LIST, schema: z.null() }, google.fetch),
    ).resolves.toBeNull();
  });

  it('[GGL-5] mints the token again after a 401 and sends once more; rides out a rate limit within the recovery; names Google’s reason otherwise', async () => {
    let attempts = 0;
    const google = fakeGoogleFetch({
      [`GET ${LIST}`]: () =>
        ++attempts === 1
          ? googleError(401, 'authError', 'Invalid Credentials')
          : json({ items: [] }),
      [`POST ${LIST}`]: () =>
        ++attempts <= 3 ? googleError(429, 'rateLimitExceeded', 'slow down') : json({ items: [] }),
      [`PATCH ${LIST}`]: () => googleError(404, 'notFound', 'Requested entity was not found.'),
    });
    const auth = new FakeTokenSource();
    await expect(
      googleRequest(auth, { method: 'GET', url: LIST, schema }, google.fetch),
    ).resolves.toEqual({ items: [] });
    expect(auth.invalidated).toBe(1);
    expect(attempts).toBe(2);

    attempts = 0;
    const clock = { now: () => 0, sleep: () => Promise.resolve() };
    await expect(
      googleRequest(
        auth,
        { method: 'POST', url: LIST, body: { a: 1 }, schema },
        google.fetch,
        { windowMs: 60_000, pauseMs: 1 },
        clock,
      ),
    ).resolves.toEqual({ items: [] });
    expect(attempts).toBe(4);
    expect(google.calls.at(-1)?.body).toEqual({ a: 1 });
    expect(google.calls.at(-1)?.headers['content-type']).toBe('application/json');

    attempts = 0;
    await expect(
      googleRequest(auth, { method: 'POST', url: LIST, schema }, google.fetch),
    ).rejects.toThrow(GoogleRefused);
    const refused = await googleRequest(
      auth,
      { method: 'PATCH', url: LIST, schema },
      google.fetch,
    ).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(GoogleRefused);
    expect(refused).toMatchObject({ status: 404, reason: 'notFound', route: 'PATCH /v1/things' });
    expect((refused as Error).message).toBe(
      'PATCH /v1/things: Requested entity was not found. (404 notFound)',
    );
  });

  it('[GGL-5] reads a dead socket as unreachable, and a refusal with no body by its status', async () => {
    const google = fakeGoogleFetch({
      [`GET ${LIST}`]: () => Promise.reject(new TypeError('fetch failed')),
      [`PUT ${LIST}`]: () => new Response('', { status: 403 }),
    });
    const auth = new FakeTokenSource();
    await expect(
      googleRequest(auth, { method: 'GET', url: LIST, schema }, google.fetch),
    ).rejects.toThrow(GoogleUnreachable);
    const bare = await googleRequest(
      auth,
      { method: 'PUT', url: LIST, schema },
      google.fetch,
    ).catch((error: unknown) => error);
    expect(bare).toMatchObject({
      status: 403,
      reason: 'unknown',
      message: 'PUT /v1/things: HTTP 403 (403 unknown)',
    });
  });
});
