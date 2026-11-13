import { EventEmitter } from 'node:events';
import { createServer as createHttpServer, type ClientRequest, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';

import { recordedLog } from '../testing';
import { UpstreamTimedOut, UpstreamUnreachable, type UpstreamRequest } from '../upstream';
import { databaseTouch, httpUpstream, loopActivity, type HttpRequest } from './network';

/**
 * The network adapters against servers of this process: no address outside
 * the loopback is reached. A closed port stands for a stack that is asleep;
 * a socket that never connects is handed in, since the loopback always does.
 */
const listening = (server: Server) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

const closed = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

/** A port nothing listens on: taken from a server that is then closed. */
async function freePort(): Promise<number> {
  const server = createHttpServer();
  const port = await listening(server);
  await closed(server);
  return port;
}

const toLoopback = (port: number, shape: Partial<UpstreamRequest> = {}): UpstreamRequest => ({
  host: '127.0.0.1',
  port,
  method: 'GET',
  path: '/',
  headers: {},
  body: undefined,
  connectTimeoutMs: 1_000,
  timeoutMs: 2_000,
  ...shape,
});

/** A request whose socket is handed out and never connects — a host that drops the SYN. */
function neverConnecting(): HttpRequest {
  return () => {
    const request = new EventEmitter() as ClientRequest;
    request.setHeader = () => request;
    request.end = () => request;
    request.destroy = (error?: Error) => {
      if (error !== undefined) request.emit('error', error);
      return request;
    };
    queueMicrotask(() =>
      request.emit('socket', Object.assign(new EventEmitter(), { connecting: true })),
    );
    return request;
  };
}

describe('the HTTP upstream', () => {
  it('sends the request whole and reads the answer whole, cookies as a list', async () => {
    const server = createHttpServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        response.setHeader('set-cookie', ['a=1', 'b=2']);
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            method: request.method,
            url: request.url,
            cookie: request.headers.cookie,
            length: request.headers['content-length'],
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
    });
    const port = await listening(server);
    try {
      const answer = await httpUpstream().send(
        toLoopback(port, {
          method: 'POST',
          path: '/runs?limit=1',
          headers: { cookie: 'lane=2', 'content-type': 'text/plain' },
          body: Buffer.from('hello'),
        }),
      );
      expect(answer.status).toBe(200);
      expect(answer.headers['set-cookie']).toEqual(['a=1', 'b=2']);
      expect(JSON.parse(answer.body.toString())).toEqual({
        method: 'POST',
        url: '/runs?limit=1',
        cookie: 'lane=2',
        length: '5',
        body: 'hello',
      });
    } finally {
      await closed(server);
    }
  });

  it('reads a port nobody listens on as unreachable, with the system code', async () => {
    const port = await freePort();
    const sending = httpUpstream().send(toLoopback(port));
    await expect(sending).rejects.toBeInstanceOf(UpstreamUnreachable);
    await expect(sending).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('reads a connection that is not made within its budget as nobody listening', async () => {
    const sending = httpUpstream(neverConnecting()).send(
      toLoopback(80, { connectTimeoutMs: 20, timeoutMs: 2_000 }),
    );
    await expect(sending).rejects.toBeInstanceOf(UpstreamUnreachable);
    await expect(sending).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('reads a connected upstream that never answers as timed out, not as unreachable — the connect budget is spent', async () => {
    const server = createHttpServer(() => undefined);
    const port = await listening(server);
    try {
      await expect(
        httpUpstream().send(toLoopback(port, { connectTimeoutMs: 10, timeoutMs: 50 })),
      ).rejects.toBeInstanceOf(UpstreamTimedOut);
    } finally {
      server.closeAllConnections();
      await closed(server);
    }
  });
});

describe('the loop activity', () => {
  const serving = (status: number, body: string) =>
    createHttpServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body);
    });

  it('reads the count of running runs from a 200 that carries one, and nothing from anything else', async () => {
    const { log } = recordedLog();
    const counted = serving(200, JSON.stringify({ data: [], meta: { total: 2 } }));
    const failing = serving(500, '{}');
    const malformed = serving(200, '{"data":[]}');
    const ports = await Promise.all([counted, failing, malformed].map(listening));
    try {
      const [count, failed, bad] = await Promise.all(
        ports.map((port) => loopActivity(`http://127.0.0.1:${port}`, log).runningRuns()),
      );
      expect([count, failed, bad]).toEqual([2, undefined, undefined]);
    } finally {
      await Promise.all([counted, failing, malformed].map(closed));
    }
  });

  it('reads a loop it cannot reach as unable to say', async () => {
    const { log, lines } = recordedLog();
    const port = await freePort();
    expect(await loopActivity(`http://127.0.0.1:${port}`, log).runningRuns()).toBeUndefined();
    expect(lines.map(({ message }) => message)).toEqual(['loop unreachable']);
  });
});

describe('the database touch', () => {
  it('opens one connection and closes it at once', async () => {
    const connections: number[] = [];
    const server = createTcpServer((socket) => {
      connections.push(1);
      socket.on('close', () => undefined);
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
    const { log, lines } = recordedLog();
    try {
      databaseTouch('127.0.0.1', port, log).touch();
      await new Promise((resolve) => server.once('connection', resolve));
      expect(connections).toEqual([1]);
      expect(lines).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('logs a touch that fails and waits for nothing', async () => {
    const { log, lines } = recordedLog();
    const port = await freePort();
    databaseTouch('127.0.0.1', port, log).touch();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(lines.map(({ message }) => message)).toEqual(['database touch failed']);
  });
});
