import {
  bodyMessage,
  type EventEnvelope,
  JsonCallFailed,
  type JsonAnswer,
  NO_RECOVERY,
  type PublishEventRequest,
  type Recovery,
  type RecoveryClock,
  rideOut,
  sendJson,
  type Settled,
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
   * How long a call that never reached the service — or a pull it did not
   * answer in time — is asked again at the pause. Every bus call may be: a
   * subscribe, an acknowledgement and a delete are idempotent by the bus's own
   * contract, and a prompt or a withdrawal published twice is one prompt, one
   * withdrawal, to the service that reads it.
   */
  recovery?: Recovery;
  /** The clock the recovery is kept by; a spec passes one that need not wait. */
  clock?: RecoveryClock;
  /** How long a call may take, a pull on top of its own wait. */
  callTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Whether an attempt may be asked again within the declared recovery: one
 * that never reached the service, or a pull — the one GET this client makes,
 * a long poll the bus answers from a cursor only an acknowledgement moves —
 * that the service did not answer in time. Measured 2026-10-12: one timed-out
 * pull dropped the notifications channel for the rest of a question, and the
 * operator's answer on it was never read. With the shipped recovery of 60 s at
 * a 2 s pause, a 40 s pull that times out is asked once more at about 42 s
 * and given up at about 82 s if it times out again; a longer outage is a
 * wider window in the settings, never code here.
 */
const repeatable = (method: Method, outcome: Settled<JsonAnswer>): boolean =>
  'error' in outcome &&
  (outcome.error instanceof BusUnreachable ||
    (method === 'GET' && outcome.error instanceof BusTimeout));

const segment = (value: string): string => encodeURIComponent(value);

/** The `{data}` envelope's payload. */
const dataOf = <T>(body: unknown): T => (body as { data: T }).data;

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

  /** The service's answer, asked again within the declared recovery while `repeatable` says the attempt may be. */
  private call(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs = this.callTimeoutMs,
    signal?: AbortSignal,
  ): Promise<JsonAnswer> {
    return rideOut(
      this.recovery,
      () => this.attempt(method, path, body, timeoutMs, signal),
      (outcome) => repeatable(method, outcome),
      this.clock,
    );
  }

  private async attempt(
    method: Method,
    path: string,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<JsonAnswer> {
    try {
      return await sendJson(this.fetchImpl, this.baseUrl, path, {
        method,
        body,
        timeoutMs,
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (!(error instanceof JsonCallFailed)) throw error;
      if (error.failure === 'aborted') throw new BusCallAborted(error.route);
      if (error.failure === 'timeout') throw new BusTimeout(error.route, timeoutMs);
      throw new BusUnreachable(error.detail);
    }
  }

  private refused(route: string, answer: JsonAnswer): BusRefused {
    return new BusRefused(answer.status, bodyMessage(answer.body), route);
  }
}
