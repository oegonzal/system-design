import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubApi } from './stub-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stubApi', () => {
  it('[WEB-2] scripts fetch at the boundary: bodies, sequences, handlers, 204s, and a strict miss', async () => {
    const { calls } = stubApi([
      { path: '/api/one', body: { data: 1 } },
      { path: '/api/seq', sequence: [{ n: 1 }, { n: 2 }] },
      {
        method: 'POST',
        path: /^\/api\/things\/[^/]+$/,
        handler: ({ count }) => ({ status: 201, body: { count } }),
      },
      { method: 'DELETE', path: '/api/gone', status: 204 },
    ]);

    expect(await (await fetch('http://x/api/one?q=1')).json()).toEqual({ data: 1 });
    expect(await (await fetch('http://x/api/seq')).json()).toEqual({ n: 1 });
    expect(await (await fetch('http://x/api/seq')).json()).toEqual({ n: 2 });
    expect(await (await fetch('http://x/api/seq')).json()).toEqual({ n: 2 });
    const created = await fetch('http://x/api/things/t1', { method: 'POST' });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ count: 0 });
    const gone = await fetch('http://x/api/gone', { method: 'DELETE' });
    expect(gone.status).toBe(204);
    expect(await gone.text()).toBe('');

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET /api/one?q=1',
      'GET /api/seq',
      'GET /api/seq',
      'GET /api/seq',
      'POST /api/things/t1',
      'DELETE /api/gone',
    ]);
    await expect(fetch('http://x/api/nowhere')).rejects.toThrow(
      'Unstubbed request: GET /api/nowhere',
    );
  });
});
