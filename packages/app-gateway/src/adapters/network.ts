import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http';
import { connect } from 'node:net';

import { z } from 'zod';

import type { LoopActivity } from '../idle';
import type { Log } from '../log';
import {
  UpstreamTimedOut,
  UpstreamUnreachable,
  type Upstream,
  type UpstreamResponse,
} from '../upstream';
import type { DatabaseTouch } from '../wake';

/**
 * The network sides of the gateway's seams, all inside the VPC: the upstream
 * reached over plain HTTP and read whole, the loop asked whether a run is in
 * progress, and the database touched so it resumes while the task starts.
 */

const codeOf = (error: unknown): string =>
  (error as Partial<NodeJS.ErrnoException>).code ?? 'EUNKNOWN';

/** `node:http`'s `request`, as the upstream takes it; a spec hands in one whose socket never connects. */
export type HttpRequest = (
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

/**
 * One buffered request with two budgets. The connection has
 * `connectTimeoutMs` to be made, armed when the socket is handed out and
 * cleared when it connects; past it, nobody is listening (`ETIMEDOUT`, which
 * wakes the stack). The answer has `timeoutMs` once connected; past it, the
 * upstream is slow, which does not.
 */
export function httpUpstream(request: HttpRequest = httpRequest): Upstream {
  return {
    send: (upstreamRequest) =>
      new Promise<UpstreamResponse>((resolve, reject) => {
        let connected = false;
        let connecting: NodeJS.Timeout | undefined;
        const sent = request(
          {
            host: upstreamRequest.host,
            port: upstreamRequest.port,
            method: upstreamRequest.method,
            path: upstreamRequest.path,
            headers: upstreamRequest.headers,
            timeout: upstreamRequest.timeoutMs,
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () =>
              resolve({
                status: response.statusCode ?? 502,
                headers: response.headers,
                body: Buffer.concat(chunks),
              }),
            );
          },
        );
        const nowConnected = () => {
          connected = true;
          clearTimeout(connecting);
        };
        sent.on('socket', (socket) => {
          if (!socket.connecting) return nowConnected();
          socket.once('connect', nowConnected);
          connecting = setTimeout(
            () => sent.destroy(new UpstreamUnreachable('ETIMEDOUT')),
            upstreamRequest.connectTimeoutMs,
          );
        });
        sent.on('timeout', () =>
          sent.destroy(
            connected
              ? new UpstreamTimedOut('upstream timed out')
              : new UpstreamUnreachable('ETIMEDOUT'),
          ),
        );
        sent.on('error', (error) => {
          clearTimeout(connecting);
          reject(
            error instanceof UpstreamTimedOut || error instanceof UpstreamUnreachable
              ? error
              : new UpstreamUnreachable(codeOf(error)),
          );
        });
        if (upstreamRequest.body === undefined) {
          sent.end();
        } else {
          sent.setHeader('content-length', upstreamRequest.body.length);
          sent.end(upstreamRequest.body);
        }
      }),
  };
}

const RUNNING_RUNS = z.object({ meta: z.object({ total: z.int().min(0) }) });
const LOOP_TIMEOUT_MS = 5_000;

/** `GET /runs?status=running&limit=1` at the loop: the count is in `meta.total`; anything but a 200 that carries one is none. */
export function loopActivity(loopUrl: string, log: Log): LoopActivity {
  return {
    async runningRuns() {
      try {
        const response = await fetch(`${loopUrl}/runs?status=running&limit=1`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(LOOP_TIMEOUT_MS),
        });
        if (response.status !== 200) {
          log('loop did not answer', { status: response.status });
          return undefined;
        }
        const parsed = RUNNING_RUNS.safeParse(await response.json());
        return parsed.success ? parsed.data.meta.total : undefined;
      } catch (error) {
        log('loop unreachable', { error: String(error) });
        return undefined;
      }
    },
  };
}

const TOUCH_TIMEOUT_MS = 5_000;

/** One TCP connection, closed as soon as it opens — enough for a paused database to start resuming. */
export function databaseTouch(host: string, port: number, log: Log): DatabaseTouch {
  return {
    touch() {
      const socket = connect({ host, port });
      socket.unref();
      socket.setTimeout(TOUCH_TIMEOUT_MS, () => socket.destroy());
      socket.on('connect', () => socket.destroy());
      socket.on('error', (error) => log('database touch failed', { error: String(error) }));
    },
  };
}
