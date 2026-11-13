import { SESSION_COOKIE_NAMES } from './auth';
import { bodyOf, methodOf, type GatewayEvent, type GatewayResult } from './http';

/**
 * The forwarding port and the two translations around it: a function URL
 * event into the request the upstream receives, and the upstream's answer
 * into the result the function URL returns. `adapters/network.ts` sends the
 * request over `node:http`; a spec sends it nowhere.
 */
export interface UpstreamRequest {
  host: string;
  port: number;
  method: string;
  /** Path and query, as the request line carries them. */
  path: string;
  headers: Readonly<Record<string, string>>;
  body: Buffer | undefined;
  /** How long the connection may take to be made; longer means nobody is listening. */
  connectTimeoutMs: number;
  /** How long the answer may take once connected. */
  timeoutMs: number;
}

export interface UpstreamResponse {
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: Buffer;
}

/** No connection could be had; `code` is the system's (`ECONNREFUSED`, `ENOTFOUND`, …). */
export class UpstreamUnreachable extends Error {
  override readonly name = 'UpstreamUnreachable';
  constructor(readonly code: string) {
    super(`upstream unreachable: ${code}`);
  }
}

/** A connection was had, and the answer did not come in time. */
export class UpstreamTimedOut extends Error {
  override readonly name = 'UpstreamTimedOut';
}

export interface Upstream {
  send(request: UpstreamRequest): Promise<UpstreamResponse>;
}

/** The header CloudFront adds for the gateway, which the upstream never sees. */
export const ORIGIN_HEADER = 'x-origin-verify';

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Besides the hop: what the gateway sets itself, the cookies, rebuilt from
 * the event's own list, and `x-forwarded-host`, which would carry the
 * function URL's host — a name nothing behind the gateway should learn.
 */
const NOT_FORWARDED_IN = new Set([
  ...HOP_BY_HOP,
  'host',
  'cookie',
  'content-length',
  ORIGIN_HEADER,
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
]);

/** Besides the hop: the length the function URL recomputes, and the cookies, carried as the result's own list. */
const NOT_FORWARDED_OUT = new Set([...HOP_BY_HOP, 'content-length', 'set-cookie']);

const cookieName = (pair: string): string => pair.slice(0, pair.indexOf('=')).trim();

interface UpstreamTarget {
  host: string;
  port: number;
  /** The path the route decided on, without the query. */
  path: string;
  connectTimeoutMs: number;
  timeoutMs: number;
}

export function upstreamRequestFor(event: GatewayEvent, target: UpstreamTarget): UpstreamRequest {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(event.headers)) {
    if (value !== undefined && !NOT_FORWARDED_IN.has(name)) headers[name] = value;
  }
  const cookies = (event.cookies ?? []).filter(
    (pair) => !SESSION_COOKIE_NAMES.has(cookieName(pair)),
  );
  if (cookies.length > 0) headers['cookie'] = cookies.join('; ');
  headers['host'] = `${target.host}:${target.port}`;
  headers['x-forwarded-for'] = [
    event.headers['x-forwarded-for'],
    event.requestContext.http.sourceIp,
  ]
    .filter((address) => address !== undefined && address !== '')
    .join(', ');
  headers['x-forwarded-proto'] = 'https';
  return {
    host: target.host,
    port: target.port,
    method: methodOf(event),
    path: event.rawQueryString === '' ? target.path : `${target.path}?${event.rawQueryString}`,
    headers,
    body: bodyOf(event),
    connectTimeoutMs: target.connectTimeoutMs,
    timeoutMs: target.timeoutMs,
  };
}

/** The media types carried as text; anything else, and anything content-encoded, goes as base64. */
const TEXT_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/xml',
  'application/x-www-form-urlencoded',
  'image/svg+xml',
]);
const TEXT_SUFFIXES = ['+json', '+xml'];

function isTextBody(contentType: string | undefined, contentEncoding: string | undefined): boolean {
  if (contentEncoding !== undefined && contentEncoding.toLowerCase() !== 'identity') return false;
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  return (
    type.startsWith('text/') ||
    TEXT_TYPES.has(type) ||
    TEXT_SUFFIXES.some((suffix) => type.endsWith(suffix))
  );
}

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function resultFor(response: UpstreamResponse): GatewayResult {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined || NOT_FORWARDED_OUT.has(name)) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  const setCookie = response.headers['set-cookie'];
  const cookies = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  const text = isTextBody(
    single(response.headers['content-type']),
    single(response.headers['content-encoding']),
  );
  return {
    statusCode: response.status,
    headers,
    cookies,
    body: response.body.toString(text ? 'utf8' : 'base64'),
    isBase64Encoded: !text,
  };
}
