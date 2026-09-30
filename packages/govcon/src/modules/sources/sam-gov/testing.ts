/** A scripted transport for the adapter specs: real `Response`s in order, every URL remembered. */
import { SamGovHttp, type Sleep } from './http';

export const KEY = 'secret-key-1234567890';

export interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
  throws?: Error;
}

export function transportOf(replies: readonly Reply[]) {
  const urls: string[] = [];
  let call = 0;
  const fetch = async (url: string): Promise<Response> => {
    urls.push(url);
    const reply = replies[Math.min(call, replies.length - 1)] ?? {};
    call += 1;
    if (reply.throws) throw reply.throws;
    const body = reply.text ?? (reply.body === undefined ? null : JSON.stringify(reply.body));
    return new Response(body, {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  };
  return { fetch, urls };
}

/** A transport with a ticking clock (one second per read) and a recorded sleep. */
export function httpOf(replies: readonly Reply[]) {
  const { fetch, urls } = transportOf(replies);
  const sleeps: number[] = [];
  let tick = Date.parse('2026-09-26T12:00:00Z');
  const sleep: Sleep = async (ms) => {
    sleeps.push(ms);
  };
  const http = new SamGovHttp({ apiKey: KEY, fetch, sleep, now: () => new Date((tick += 1000)) });
  return { http, urls, sleeps };
}
