/**
 * One JSON call to a service, as every service client in the repository makes
 * it: the body sent as JSON, a timeout of the caller's choosing (with the
 * caller's own abort beside it), and whatever came back — status and body,
 * the body parsed when it is JSON and kept as text when it is not. A call
 * that never got an answer throws `JsonCallFailed`, saying which of the three
 * ways it failed. What a status means, whether a failure is worth asking
 * again, and what error a caller raises are the client's: this decides none
 * of them.
 */
import { errorMessage } from './errors';

export type JsonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface JsonAnswer {
  status: number;
  body: unknown;
}

export interface JsonCall {
  method: JsonMethod;
  body?: unknown;
  timeoutMs: number;
  /** The caller's own abort; the call ends with whichever fires first. */
  signal?: AbortSignal;
}

/** How a call failed to get an answer: the caller withdrew it, it ran past its timeout, or it never reached the service. */
export type JsonCallFailure = 'aborted' | 'timeout' | 'unreachable';

export class JsonCallFailed extends Error {
  override readonly name = 'JsonCallFailed';
  constructor(
    readonly failure: JsonCallFailure,
    readonly route: string,
    /** What went wrong, without the route. */
    readonly detail: string,
  ) {
    super(`${route}: ${detail}`);
  }
}

/** An error a fetch raises for a call cut short by its own timeout, however the implementation names it. */
const ranOut = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

const parseBody = (text: string): unknown => {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export async function sendJson(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  call: JsonCall,
): Promise<JsonAnswer> {
  const route = `${call.method} ${path}`;
  const timeout = AbortSignal.timeout(call.timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: call.method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: call.signal === undefined ? timeout : AbortSignal.any([call.signal, timeout]),
    });
  } catch (error) {
    if (call.signal?.aborted) throw new JsonCallFailed('aborted', route, 'withdrawn by the caller');
    if (timeout.aborted || ranOut(error)) {
      throw new JsonCallFailed('timeout', route, `took over ${call.timeoutMs} ms`);
    }
    throw new JsonCallFailed('unreachable', route, errorMessage(error));
  }
  return { status: response.status, body: parseBody(await response.text()) };
}

/** What a service said in an error body: its `message` when it gave one, else the body as JSON — and that there was none when the body was empty. */
export const bodyMessage = (body: unknown): string => {
  if (body === undefined) return 'no body';
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : JSON.stringify(body);
};
