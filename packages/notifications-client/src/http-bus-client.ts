import {
  type EventEnvelope,
  NO_RECOVERY,
  type PublishEventRequest,
  type Recovery,
  type RecoveryClock,
  rideOut,
  type SubscribeRequest,
  type Subscription,
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
  /**
   * How long a call that never reached the service is asked again at the
   * pause. Every bus call may be: a subscribe, an acknowledgement and a delete
   * are idempotent by the bus's own contract, and a prompt or a withdrawal
   * published twice is one prompt, one withdrawal, to the service that reads it.
   */
  recovery?: Recovery;
  /** The clock the recovery is kept by; a spec passes one that need not wait. */
  clock?: RecoveryClock;
  /** How long a call may take, a pull on top of its own wait. */
  callTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

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
  private readonly recovery: Recovery;
  private readonly clock: RecoveryClock | undefined;
  private readonly callTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpBusOptions = {},
  ) {
    super();
    this.recovery = options.recovery ?? NO_RECOVERY;
    this.clock = options.clock;
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
  private call(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs = this.callTimeoutMs,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    return rideOut(
      this.recovery,
      () => this.attempt(method, path, body, timeoutMs, signal),
      (outcome) => 'error' in outcome && outcome.error instanceof BusUnreachable,
      this.clock,
    );
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
