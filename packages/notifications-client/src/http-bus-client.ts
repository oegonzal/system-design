import type {
  EventEnvelope,
  PublishEventRequest,
  SubscribeRequest,
  Subscription,
} from '@sysdesign/contracts';

import { BusClient } from './bus-client';
import {
  BusCallAborted,
  BusRefused,
  BusTimeout,
  BusUnreachable,
  SubscriptionMissing,
} from './bus-errors';

/** A call answers at once; a pull is given its own wait and this much more. */
const CALL_TIMEOUT_MS = 15_000;

export interface HttpBusOptions {
  recovery?: BusRecovery;
  /** How long a call may take, a pull on top of its own wait. */
  callTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * How long a caller rides out a service that is restarting: a call that never
 * reached it is asked again at the pause until the window closes. Every bus
 * call may be: a subscribe, an acknowledgement and a delete are idempotent by
 * the bus's own contract, and a prompt or a withdrawal published twice is one
 * prompt, one withdrawal, to the service that reads it.
 */
export interface BusRecovery {
  windowMs: number;
  pauseMs: number;
  /** The clock and the wait, injectable so a spec need not wait. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const NO_RECOVERY: BusRecovery = { windowMs: 0, pauseMs: 0 };

const sleepFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const segment = (value: string): string => encodeURIComponent(value);

/** The `{data}` envelope's payload. */
const dataOf = <T>(body: unknown): T => (body as { data: T }).data;

const messageOf = (body: unknown): string => {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : JSON.stringify(body);
};

/** The notifications bus over HTTP. */
export class HttpBusClient extends BusClient {
  private readonly recovery: BusRecovery;
  private readonly callTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpBusOptions = {},
  ) {
    super();
    this.recovery = options.recovery ?? NO_RECOVERY;
    this.callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async publish(request: PublishEventRequest): Promise<EventEnvelope> {
    const answer = await this.call('POST', '/events', request);
    if (answer.status !== 201) throw this.refused('POST /events', answer);
    return dataOf(answer.body);
  }

  async subscribe(name: string, request: SubscribeRequest): Promise<Subscription> {
    const answer = await this.call('PUT', `/subscriptions/${segment(name)}`, request);
    if (answer.status !== 200) throw this.refused('PUT /subscriptions/:name', answer);
    return dataOf(answer.body);
  }

  async pull(
    name: string,
    options: { waitMs: number; max: number },
    signal?: AbortSignal,
  ): Promise<EventEnvelope[]> {
    const path = `/subscriptions/${segment(name)}/events?waitMs=${options.waitMs}&max=${options.max}`;
    const answer = await this.call(
      'GET',
      path,
      undefined,
      this.callTimeoutMs + options.waitMs,
      signal,
    );
    if (answer.status === 404) throw new SubscriptionMissing(name);
    if (answer.status !== 200) throw this.refused('GET /subscriptions/:name/events', answer);
    return dataOf(answer.body);
  }

  async ack(name: string, seq: string): Promise<Subscription> {
    const answer = await this.call('POST', `/subscriptions/${segment(name)}/ack`, { seq });
    if (answer.status === 404) throw new SubscriptionMissing(name);
    if (answer.status !== 200) throw this.refused('POST /subscriptions/:name/ack', answer);
    return dataOf(answer.body);
  }

  async unsubscribe(name: string): Promise<void> {
    const answer = await this.call('DELETE', `/subscriptions/${segment(name)}`, undefined);
    if (answer.status !== 204 && answer.status !== 404) {
      throw this.refused('DELETE /subscriptions/:name', answer);
    }
  }

  /** The service's answer, asked again within the declared recovery while it never reached the service. */
  private async call(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs = this.callTimeoutMs,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    const { windowMs, pauseMs, now = Date.now, sleep = sleepFor } = this.recovery;
    const deadline = now() + windowMs;
    for (;;) {
      try {
        return await this.attempt(method, path, body, timeoutMs, signal);
      } catch (error) {
        if (!(error instanceof BusUnreachable) || now() + pauseMs >= deadline) throw error;
        await sleep(pauseMs);
      }
    }
  }

  private async attempt(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      });
    } catch (error) {
      if (signal?.aborted) throw new BusCallAborted(`${method} ${path}`);
      if (timeout.aborted) throw new BusTimeout(`${method} ${path}`, timeoutMs);
      throw new BusUnreachable(error instanceof Error ? error.message : String(error));
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  }

  private refused(route: string, answer: { status: number; body: unknown }): BusRefused {
    return new BusRefused(answer.status, messageOf(answer.body), route);
  }
}
