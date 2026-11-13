import { createHash, timingSafeEqual } from 'node:crypto';

import type { Gate, Session } from './auth';
import type { GatewayConfig } from './config';
import {
  header,
  jsonResult,
  methodOf,
  NO_STORE,
  withCookies,
  type GatewayEvent,
  type GatewayResult,
} from './http';
import type { Log } from './log';
import { matchRoute } from './routes';
import {
  ORIGIN_HEADER,
  resultFor,
  upstreamRequestFor,
  UpstreamTimedOut,
  UpstreamUnreachable,
  type Upstream,
} from './upstream';
import { WAKE_CODES, type Wake } from './wake';

/**
 * The proxy handler: one request in, one answer out, in this order — the
 * origin header CloudFront adds is checked first, so a caller who found the
 * function URL gets nothing; the gateway's own `/auth/*` routes are answered;
 * the declared routes pick the upstream port; the session gate lets the
 * request through or answers for it — a route declared `public` is never
 * gated; the request is forwarded; and an upstream nobody is listening at
 * becomes a wake and a "starting" answer. Only a request that passed the
 * gate wakes: a `public` route is answered "starting" and starts nothing,
 * so a crawler at the health path never pays for a task.
 *
 * Whatever a step throws is caught at the boundary, logged with the request
 * it was answering, and answered 500 — never the runtime's own error page.
 */
interface ProxyDeps {
  config: GatewayConfig;
  session: Session;
  upstream: Upstream;
  wake: Wake;
  log: Log;
}

export type ProxyHandler = (event: GatewayEvent) => Promise<GatewayResult>;

/**
 * The most a function URL answers with: 6 MB of result, which a base64 body
 * reaches sooner than its bytes. A larger answer is refused here, as a 502
 * with the size logged, instead of failing the invocation unexplained.
 */
const MAX_RESULT_BODY_BYTES = 6 * 1024 * 1024;

/** Equal-length digests compared in constant time: a header that differs costs the same as one that does not. */
export function originVerified(presented: string | undefined, secret: string): boolean {
  if (presented === undefined) return false;
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

export function createProxyHandler({
  config,
  session,
  upstream,
  wake,
  log,
}: ProxyDeps): ProxyHandler {
  const answer: ProxyHandler = async (event) => {
    if (!originVerified(header(event, ORIGIN_HEADER), config.originSecret)) {
      return jsonResult(403, { error: 'forbidden' }, NO_STORE);
    }
    if (session.owns(event.rawPath)) return session.route(event);
    const match = matchRoute(config.routes, event.rawPath);
    if (match === undefined) return jsonResult(404, { error: 'no route' }, NO_STORE);
    const api = match.route.api === true;
    const isPublic = match.route.public === true;
    const gate: Gate = isPublic ? { kind: 'proceed', cookies: [] } : await session.gate(event, api);
    if (gate.kind === 'respond') return gate.result;
    const request = upstreamRequestFor(event, {
      host: config.upstreamHost,
      port: match.route.port,
      path: match.upstreamPath,
      connectTimeoutMs: config.connectTimeoutMs,
      timeoutMs: config.upstreamTimeoutMs,
    });
    try {
      const result = resultFor(await upstream.send(request));
      const size = Buffer.byteLength(result.body ?? '');
      if (size > MAX_RESULT_BODY_BYTES) {
        log('upstream answer too large', { path: request.path, size });
        return jsonResult(502, { error: 'upstream answer too large' }, NO_STORE);
      }
      return withCookies(result, gate.cookies);
    } catch (error) {
      if (error instanceof UpstreamUnreachable && WAKE_CODES.has(error.code)) {
        if (!isPublic) await wake.ensureAwake();
        return withCookies(wake.starting(event, api), gate.cookies);
      }
      if (error instanceof UpstreamUnreachable) {
        log('upstream failed', { code: error.code, path: request.path });
        return jsonResult(502, { error: 'bad gateway' }, NO_STORE);
      }
      if (error instanceof UpstreamTimedOut) {
        log('upstream timed out', { path: request.path, timeoutMs: request.timeoutMs });
        return jsonResult(504, { error: 'upstream timed out' }, NO_STORE);
      }
      throw error;
    }
  };

  return async (event) => {
    try {
      return await answer(event);
    } catch (error) {
      log('request failed', { path: event.rawPath, method: methodOf(event), error: String(error) });
      return jsonResult(500, { error: 'internal error' }, NO_STORE);
    }
  };
}
