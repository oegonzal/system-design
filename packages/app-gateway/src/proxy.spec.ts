import type { Gate, Session } from './auth';
import type { GatewayConfig } from './config';
import { createProxyHandler, originVerified } from './proxy';
import { ROUTES_SCHEMA } from './routes';
import { functionUrlEvent, recordedLog, type EventShape } from './testing';
import {
  UpstreamTimedOut,
  UpstreamUnreachable,
  type UpstreamRequest,
  type UpstreamResponse,
} from './upstream';
import type { Wake } from './wake';

const SECRET = 'origin-secret';

const CONFIG: GatewayConfig = {
  routes: ROUTES_SCHEMA.parse([
    { prefix: '/api', port: 3000, api: true },
    { prefix: '/api/health', port: 3000, api: true, public: true },
    { prefix: '/loop', port: 3003, strip: true, api: true },
    { prefix: '/_next/static', port: 4200, public: true },
    { prefix: '/', port: 4200 },
  ]),
  upstreamHost: 'app.internal',
  originSecret: SECRET,
  cognito: { region: 'us-east-1', userPoolId: 'us-east-1_pool', clientId: 'client-id' },
  ecsCluster: 'cluster',
  ecsService: 'service',
  database: undefined,
  upstreamTimeoutMs: 1_000,
  connectTimeoutMs: 100,
};

const OK: UpstreamResponse = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: Buffer.from('<p>hi</p>'),
};

/** A handler over fakes: a gate that lets through or answers, an upstream that answers or fails, a wake that remembers. */
function handler(
  options: { gate?: Gate; answer?: UpstreamResponse | Error; route?: () => never } = {},
) {
  const sent: UpstreamRequest[] = [];
  const gated: boolean[] = [];
  const woken: number[] = [];
  const routed: string[] = [];
  const session: Session = {
    owns: (path) => path === '/auth' || path.startsWith('/auth/'),
    route: async (event) => {
      routed.push(event.rawPath);
      options.route?.();
      return { statusCode: 200, body: 'form' };
    },
    gate: async (_event, api) => {
      gated.push(api);
      return options.gate ?? { kind: 'proceed', cookies: [] };
    },
  };
  const wake: Wake = {
    ensureAwake: async () => void woken.push(1),
    starting: (_event, api) => ({ statusCode: 503, body: api ? 'json' : 'html' }),
  };
  const { log, lines } = recordedLog();
  const proxy = createProxyHandler({
    config: CONFIG,
    session,
    upstream: {
      send: async (request) => {
        sent.push(request);
        if (options.answer instanceof Error) throw options.answer;
        return options.answer ?? OK;
      },
    },
    wake,
    log,
  });
  const send = (shape: EventShape) =>
    proxy(
      functionUrlEvent({
        ...shape,
        headers: { 'x-origin-verify': SECRET, ...shape.headers },
      }),
    );
  return { send, sent, gated, woken, routed, lines };
}

describe('the origin check', () => {
  it('refuses a request without the header CloudFront adds, or with another value', async () => {
    const { send, sent } = handler();
    const absent = await send({ headers: { 'x-origin-verify': '' } });
    expect(absent.statusCode).toBe(403);
    expect(originVerified(undefined, SECRET)).toBe(false);
    expect(originVerified('origin-secre', SECRET)).toBe(false);
    expect(originVerified(`${SECRET}x`, SECRET)).toBe(false);
    expect(originVerified(SECRET, SECRET)).toBe(true);
    expect(sent).toEqual([]);
  });
});

describe('the proxy handler', () => {
  it('hands the gateway its own routes, and matches every other path to a declared port', async () => {
    const { send, routed, sent } = handler();
    expect((await send({ path: '/auth/login' })).statusCode).toBe(200);
    expect(routed).toEqual(['/auth/login']);
    await send({ path: '/api/prompts', query: 'limit=5' });
    await send({ path: '/loop/runs' });
    await send({ path: '/prompts/1' });
    expect(sent.map((request) => [request.port, request.path])).toEqual([
      [3000, '/api/prompts?limit=5'],
      [3003, '/runs'],
      [4200, '/prompts/1'],
    ]);
  });

  it('tells the gate which routes are api routes, and answers with whatever it decides', async () => {
    const { send, gated, sent } = handler({
      gate: { kind: 'respond', result: { statusCode: 401, body: 'no' } },
    });
    expect((await send({ path: '/api/x' })).statusCode).toBe(401);
    expect((await send({ path: '/' })).statusCode).toBe(401);
    expect(gated).toEqual([true, false]);
    expect(sent).toEqual([]);
  });

  it('never gates a route declared public: cached assets and a health path pass without a session', async () => {
    const { send, gated, sent } = handler({
      gate: { kind: 'respond', result: { statusCode: 401, body: 'no' } },
    });
    expect((await send({ path: '/_next/static/chunks/main.js' })).statusCode).toBe(200);
    expect((await send({ path: '/api/health' })).statusCode).toBe(200);
    expect((await send({ path: '/api/prompts' })).statusCode).toBe(401);
    expect(gated).toEqual([true]);
    expect(sent.map((request) => request.path)).toEqual([
      '/_next/static/chunks/main.js',
      '/api/health',
    ]);
  });

  it('forwards the request whole: method, body, headers but the hop, cookies but the session, both budgets', async () => {
    const { send, sent } = handler();
    await send({
      method: 'POST',
      path: '/api/prompts',
      headers: {
        'content-type': 'application/json',
        'content-length': '99',
        connection: 'keep-alive',
        'x-forwarded-for': '203.0.113.9',
        'x-forwarded-host': 'url.lambda.example',
        'x-custom': 'kept',
      },
      cookies: ['sd_id=token', 'theme=dark', 'sd_refresh=r', 'lane=2', 'sd_csrf=c'],
      body: Buffer.from('{"a":1}').toString('base64'),
      isBase64Encoded: true,
    });
    const [request] = sent;
    expect(request.method).toBe('POST');
    expect(request.host).toBe('app.internal');
    expect(request.timeoutMs).toBe(1_000);
    expect(request.connectTimeoutMs).toBe(100);
    expect(request.body?.toString()).toBe('{"a":1}');
    expect(request.headers).toEqual({
      'content-type': 'application/json',
      'x-custom': 'kept',
      cookie: 'theme=dark; lane=2',
      host: 'app.internal:3000',
      'x-forwarded-for': '203.0.113.9, 198.51.100.7',
      'x-forwarded-proto': 'https',
    });
  });

  it('returns the answer as text, its cookies as the result list, and no hop header', async () => {
    const { send } = handler({
      answer: {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'set-cookie': ['a=1; Path=/', 'b=2'],
          vary: ['accept', 'cookie'],
          'transfer-encoding': 'chunked',
          'content-length': '7',
        },
        body: Buffer.from('{"b":2}'),
      },
    });
    expect(await send({ path: '/api/x' })).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json', vary: 'accept, cookie' },
      cookies: ['a=1; Path=/', 'b=2'],
      body: '{"b":2}',
      isBase64Encoded: false,
    });
  });

  it('returns a binary answer, or an encoded one, as base64', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const image = handler({
      answer: { status: 200, headers: { 'content-type': 'image/png' }, body: png },
    });
    expect(await image.send({ path: '/icon.png' })).toMatchObject({
      body: png.toString('base64'),
      isBase64Encoded: true,
    });
    const gzipped = handler({
      answer: {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        body: png,
      },
    });
    expect(await gzipped.send({ path: '/' })).toMatchObject({
      headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
      isBase64Encoded: true,
    });
    const svg = handler({
      answer: {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
        body: Buffer.from('<svg/>'),
      },
    });
    expect(await svg.send({ path: '/a.svg' })).toMatchObject({
      body: '<svg/>',
      isBase64Encoded: false,
    });
  });

  it('answers 502 for an answer the function URL cannot carry: over 6 MB once base64 inflates it', async () => {
    const raw = Buffer.alloc(4_800_000, 1);
    const { send, lines } = handler({
      answer: { status: 200, headers: { 'content-type': 'image/png' }, body: raw },
    });
    const result = await send({ path: '/big.png' });
    expect(result.statusCode).toBe(502);
    expect(result.headers?.['cache-control']).toBe('no-store');
    expect(lines).toEqual([
      {
        message: 'upstream answer too large',
        detail: { path: '/big.png', size: raw.toString('base64').length },
      },
    ]);
    const fits = handler({
      answer: {
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: Buffer.alloc(4_700_000),
      },
    });
    expect((await fits.send({ path: '/big.png' })).statusCode).toBe(200);
  });

  it('sets the cookies the gate refreshed on the upstream answer', async () => {
    const { send } = handler({ gate: { kind: 'proceed', cookies: ['sd_id=new; Path=/'] } });
    expect((await send({ path: '/' })).cookies).toEqual(['sd_id=new; Path=/']);
  });

  it('wakes the stack when nobody is listening, and answers "starting" for the route kind', async () => {
    const { send, woken } = handler({ answer: new UpstreamUnreachable('ECONNREFUSED') });
    expect(await send({ path: '/' })).toEqual({ statusCode: 503, body: 'html' });
    expect(await send({ path: '/api/x' })).toEqual({ statusCode: 503, body: 'json' });
    expect(woken).toHaveLength(2);
  });

  it('answers a public route "starting" without waking: only a request that passed the gate wakes', async () => {
    const { send, woken, gated } = handler({ answer: new UpstreamUnreachable('ENOTFOUND') });
    expect(await send({ path: '/api/health' })).toEqual({ statusCode: 503, body: 'json' });
    expect(await send({ path: '/_next/static/app.js' })).toEqual({ statusCode: 503, body: 'html' });
    expect(woken).toEqual([]);
    expect(gated).toEqual([]);
    expect(await send({ path: '/prompts/1' })).toEqual({ statusCode: 503, body: 'html' });
    expect(woken).toEqual([1]);
  });

  it('reads a connection that never came as nobody listening, and a slow answer as 504', async () => {
    const connecting = handler({ answer: new UpstreamUnreachable('ETIMEDOUT') });
    expect((await connecting.send({ path: '/' })).statusCode).toBe(503);
    expect(connecting.woken).toEqual([1]);
    const slow = handler({ answer: new UpstreamTimedOut('slow') });
    expect((await slow.send({ path: '/' })).statusCode).toBe(504);
    expect(slow.woken).toEqual([]);
    expect(slow.lines).toEqual([
      { message: 'upstream timed out', detail: { path: '/', timeoutMs: 1_000 } },
    ]);
  });

  it('answers 502 for an upstream that failed another way', async () => {
    const failed = handler({ answer: new UpstreamUnreachable('EPIPE') });
    expect((await failed.send({ path: '/' })).statusCode).toBe(502);
    expect(failed.woken).toEqual([]);
    expect(failed.lines[0]?.message).toBe('upstream failed');
  });

  it('answers 404 when no declared prefix covers the path', async () => {
    const { log } = recordedLog();
    const proxy = createProxyHandler({
      config: { ...CONFIG, routes: CONFIG.routes.filter((route) => route.prefix !== '/') },
      session: {
        owns: () => false,
        route: async () => ({}),
        gate: async () => ({ kind: 'proceed', cookies: [] }),
      },
      upstream: { send: async () => OK },
      wake: { ensureAwake: async () => undefined, starting: () => ({}) },
      log,
    });
    const result = await proxy(
      functionUrlEvent({ path: '/x', headers: { 'x-origin-verify': SECRET } }),
    );
    expect(result.statusCode).toBe(404);
  });

  it('catches whatever a step throws at the boundary: 500 JSON, never cached, the request logged', async () => {
    const { send, lines } = handler({
      route: () => {
        throw new Error('pool unreachable');
      },
    });
    const result = await send({ method: 'POST', path: '/auth/login' });
    expect(result).toEqual({
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'internal error' }),
    });
    expect(lines).toEqual([
      {
        message: 'request failed',
        detail: { path: '/auth/login', method: 'POST', error: 'Error: pool unreachable' },
      },
    ]);
  });
});
