import type {
  EventEnvelope,
  PublishEventRequest,
  SubscribeRequest,
  Subscription,
} from '@sysdesign/contracts';
import { BusCallAborted, BusClient, SubscriptionMissing } from '@sysdesign/notifications-client';

/**
 * The bus in memory, for the intake's specs: events appended as published,
 * one cursor per subscription, a pull that waits briefly when nothing is past
 * the cursor. `sweep()` forgets a subscription, as the service does one left
 * idle, so the next pull is told it is missing.
 */
export class FakeBusClient extends BusClient {
  readonly events: EventEnvelope[] = [];
  readonly subscriptions = new Map<string, { topics: string[]; cursor: number }>();
  readonly acked: string[] = [];
  readonly subscribed: string[] = [];

  async publish(request: PublishEventRequest): Promise<EventEnvelope> {
    const envelope: EventEnvelope = {
      seq: String(this.events.length + 1),
      topic: request.topic,
      source: request.source,
      payload: request.payload,
      publishedAt: new Date().toISOString(),
    };
    this.events.push(envelope);
    return envelope;
  }

  async subscribe(name: string, request: SubscribeRequest): Promise<Subscription> {
    this.subscribed.push(name);
    const existing = this.subscriptions.get(name);
    const cursor = existing?.cursor ?? this.events.length;
    this.subscriptions.set(name, { topics: [...request.topics], cursor });
    return { name, topics: [...request.topics], cursor: String(cursor) };
  }

  async pull(
    name: string,
    options: { waitMs: number; max: number },
    signal?: AbortSignal,
  ): Promise<EventEnvelope[]> {
    const subscription = this.subscriptions.get(name);
    if (subscription === undefined) throw new SubscriptionMissing(name);
    const past = this.events
      .filter((event) => Number(event.seq) > subscription.cursor)
      .filter((event) => subscription.topics.includes(event.topic))
      .slice(0, options.max);
    if (past.length > 0) return past;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, Math.min(options.waitMs, 10));
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new BusCallAborted(`pull ${name}`));
        },
        { once: true },
      );
    });
    return [];
  }

  async ack(name: string, seq: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(name);
    if (subscription === undefined) throw new SubscriptionMissing(name);
    subscription.cursor = Math.max(subscription.cursor, Number(seq));
    this.acked.push(seq);
    return { name, topics: subscription.topics, cursor: String(subscription.cursor) };
  }

  async unsubscribe(name: string): Promise<void> {
    this.subscriptions.delete(name);
  }

  /** The service forgot the subscription: the next pull says so. */
  sweep(name: string): void {
    this.subscriptions.delete(name);
  }
}
