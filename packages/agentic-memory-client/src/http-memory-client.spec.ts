import { describe, expect, it } from 'vitest';

import { HttpMemoryClient } from './http-memory-client';
import {
  CANDIDATE,
  dead,
  HISTORY,
  HOST,
  PROVENANCE,
  RECALLING,
  RECORD,
  refusal,
  REMEMBERING,
  RUN,
  SCOPE,
  scripted,
  SPACE,
  VERBS,
} from './http-memory-client.testing';
import {
  MemoryHostRefused,
  MemoryHostTimeout,
  MemoryHostUnreachable,
  SpaceNotCompiled,
} from './memory-errors';

describe('the memory host over HTTP', () => {
  it('[AMC-1] sends every verb of the port on its declared route with its body as written, and unwraps the envelope', async () => {
    const { calls, fetchImpl } = scripted(
      VERBS.map((verb, position) => ({ status: verb.ok, body: { data: { answered: position } } })),
    );
    const client = new HttpMemoryClient(HOST, { fetchImpl });
    for (const [position, verb] of VERBS.entries()) {
      expect(await verb.ask(client), verb.name).toEqual({ answered: position });
    }
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(
      VERBS.map((verb) => `${verb.method} ${HOST}${verb.path}`),
    );
    expect(calls.map((call) => call.body)).toEqual(VERBS.map((verb) => verb.body));
    expect(calls[0]?.url).not.toContain(':id');
  });

  it('[AMC-1] encodes each route segment on its own, and sends JSON headers on every call', async () => {
    const { calls, fetchImpl } = scripted([{ status: 200, body: { data: {} } }]);
    const client = new HttpMemoryClient(HOST, { fetchImpl });
    await client.getSpaceByName('a/b c');
    expect(calls[0]?.url).toBe(`${HOST}/spaces/by-name/a%2Fb%20c`);

    const headed = scripted([{ status: 200, body: { data: {} } }]);
    let seen: HeadersInit | undefined;
    const spying = ((url: string | URL | Request, init?: RequestInit) => {
      seen = init?.headers;
      return headed.fetchImpl(url, init);
    }) as typeof fetch;
    await new HttpMemoryClient(HOST, { fetchImpl: spying }).getSpace(SPACE);
    expect(seen).toEqual({ accept: 'application/json', 'content-type': 'application/json' });
  });

  it('[AMC-1] reads a space, a space by name and a digest the host says it does not have as null — a 404 naming what is missing; a 404 naming nothing is not the host’s, and is refused; a scoped verb’s not-found, and an ensure’s, are refusals', async () => {
    const { fetchImpl } = scripted([
      refusal(404, 'space.not_found', `no such space: ${SPACE}`, 'space'),
      refusal(404, 'space.not_found', 'no space is named notes', 'space'),
      refusal(404, 'run.not_found', `no such run: ${RUN}`, 'run'),
      // The framework's own 404 — a route this host does not serve: an older build, a wrong base URL.
      {
        status: 404,
        body: { statusCode: 404, message: `Cannot GET /spaces/${SPACE}`, error: 'Not Found' },
      },
      refusal(404, 'record.not_found', `no such record in scope: ${RECORD}`, 'record'),
      refusal(404, 'run.not_found', 'no such run: r1', 'run'),
    ]);
    const client = new HttpMemoryClient(HOST, { fetchImpl });

    expect(await client.getSpace(SPACE)).toBeNull();
    expect(await client.getSpaceByName('notes')).toBeNull();
    expect(await client.getDigest(SPACE, RUN)).toBeNull();
    await expect(client.getSpace(SPACE)).rejects.toMatchObject({
      constructor: MemoryHostRefused,
      status: 404,
      route: 'GET /spaces/:id',
      code: null,
      missing: null,
      message: `Cannot GET /spaces/${SPACE}`,
    });

    await expect(client.history(SPACE, HISTORY)).rejects.toMatchObject({
      constructor: MemoryHostRefused,
      status: 404,
      route: 'POST /spaces/:id/history',
      code: 'record.not_found',
      missing: 'record',
      message: `no such record in scope: ${RECORD}`,
    });
    await expect(client.ensureSpace('notes', { runId: 'r1' })).rejects.toMatchObject({
      constructor: MemoryHostRefused,
      status: 404,
      route: 'PUT /spaces/by-name/:name',
      code: 'run.not_found',
      missing: 'run',
    });
  });

  it('[AMC-1] raises a refusal with the host’s status, route, declared code, message, issues and what was missing — the code null for a body that declares none', async () => {
    const issues = [{ path: 'register', message: 'no register is named "rumour"' }];
    const { fetchImpl } = scripted([
      {
        status: 422,
        body: {
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: 'register.unknown',
          message: 'the space has no register "rumour"',
          issues,
        },
      },
      { status: 400, body: { statusCode: 400, message: 'validation failed', issues } },
      { status: 409, body: { statusCode: 409, code: 'space.name_taken', message: 'taken' } },
      { status: 503, body: { statusCode: 503, code: 'host.resting', message: 'later' } },
      { status: 502, body: '<html>bad gateway</html>' },
    ]);
    const client = new HttpMemoryClient(HOST, { fetchImpl });
    const remembering = {
      register: 'rumour',
      scope: SCOPE,
      candidate: CANDIDATE,
      provenance: PROVENANCE,
    };

    await expect(client.remember(SPACE, remembering)).rejects.toMatchObject({
      constructor: MemoryHostRefused,
      status: 422,
      route: 'POST /spaces/:id/remember',
      code: 'register.unknown',
      message: 'the space has no register "rumour"',
      issues,
      missing: null,
    });
    // The validation pipe's 400 names its issues and no code.
    await expect(client.remember(SPACE, remembering)).rejects.toMatchObject({
      status: 400,
      code: null,
      message: 'validation failed',
      issues,
    });
    await expect(client.ensureSpace('notes', { runId: 'r2' })).rejects.toMatchObject({
      status: 409,
      code: 'space.name_taken',
      route: 'PUT /spaces/by-name/:name',
    });
    // A code the contracts do not declare is no code: a caller never branches on a word the host made up.
    await expect(client.getSpace(SPACE)).rejects.toMatchObject({
      status: 503,
      code: null,
      issues: [],
      message: 'later',
    });
    // A body that is not JSON is kept as the message, so the person who reads the fault sees what answered.
    await expect(client.getSpace(SPACE)).rejects.toMatchObject({
      status: 502,
      code: null,
      message: '"<html>bad gateway</html>"',
    });
  });

  it('[AMC-1] raises a strategy that does not compile with its report, told apart from a coded 422 by its shape', async () => {
    const report = {
      problems: [{ code: 'strategy.unreadable', refs: ['strategy'], message: 'not an object' }],
      warnings: [],
      registers: [],
      consolidation: null,
    };
    const { fetchImpl } = scripted([
      {
        status: 422,
        body: {
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'the strategy does not compile: strategy.unreadable',
          report,
        },
      },
      refusal(422, 'run.no_strategy', 'the run holds no memory strategy'),
    ]);
    const client = new HttpMemoryClient(HOST, { fetchImpl });

    await expect(client.ensureSpace('notes', { runId: 'r1' })).rejects.toMatchObject({
      constructor: SpaceNotCompiled,
      report,
      message: 'the strategy does not compile: strategy.unreadable',
    });
    await expect(client.ensureSpace('notes', { runId: 'r3' })).rejects.toMatchObject({
      constructor: MemoryHostRefused,
      status: 422,
      code: 'run.no_strategy',
    });
  });

  it('[AMC-1] raises a dead socket as unreachable, with its cause, and a call past its time as a timeout naming the route and the time — before the host answers, and while its body is read', async () => {
    const down = scripted([dead()]);
    const unreachable = new HttpMemoryClient(HOST, { fetchImpl: down.fetchImpl }).getSpace(SPACE);
    await expect(unreachable).rejects.toBeInstanceOf(MemoryHostUnreachable);
    await expect(
      new HttpMemoryClient(HOST, { fetchImpl: scripted([dead()]).fetchImpl }).getSpace(SPACE),
    ).rejects.toThrow('the memory host is unreachable: TypeError: fetch failed');

    const slow = scripted(['hang']);
    await expect(
      new HttpMemoryClient(HOST, { fetchImpl: slow.fetchImpl, callTimeoutMs: 20 }).recall(
        SPACE,
        RECALLING,
      ),
    ).rejects.toMatchObject({
      constructor: MemoryHostTimeout,
      route: 'POST /spaces/:id/recall',
      timeoutMs: 20,
    });

    // The time bound covers the body: a host that answers 200 and then holds the body past it has not answered.
    const stalled = scripted(['stall']);
    await expect(
      new HttpMemoryClient(HOST, { fetchImpl: stalled.fetchImpl, callTimeoutMs: 20 }).getSpace(
        SPACE,
      ),
    ).rejects.toMatchObject({
      constructor: MemoryHostTimeout,
      route: 'GET /spaces/:id',
      timeoutMs: 20,
    });
    // A body the host cut — the socket closed under it, as a restarting host does — is a dead socket, in the fetch's own words.
    const severed = scripted(['cut']);
    await expect(
      new HttpMemoryClient(HOST, { fetchImpl: severed.fetchImpl }).remember(SPACE, REMEMBERING),
    ).rejects.toThrow('the memory host is unreachable: TypeError: terminated');
  });
});
