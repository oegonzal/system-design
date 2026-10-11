import {
  SUBSCRIPTION_NAME,
  SUBSCRIPTION_NAME_MAX_LENGTH,
  type EventEnvelope,
  type PublishEventRequest,
  type SubscribeRequest,
  type Subscription,
  type TopicDeclaration,
  type TopicPublisher,
} from '@sysdesign/contracts';

import {
  InvalidPayload,
  InvalidSubscriptionName,
  SeqBeyondHead,
  TopicNotYours,
  UndeclaredTopic,
  UnknownSubscription,
} from './errors';
import type { EventLog, SubscriptionStore, Wakeup } from './ports';

/** How long the bus keeps what it no longer has to, read from the service's settings. */
interface Retention {
  /** How long an event is kept once every subscription has passed it. */
  retentionMs: number;
  /** How long a subscription may go unpulled before it is removed. */
  idleSubscriptionMs: number;
}

/**
 * The event bus: declared topics, an append-only log and named cursors over
 * it. A publish is checked against its topic's declaration — the topic must
 * be declared, the payload must be what its schema accepts, and a topic the
 * service alone publishes is refused to everyone else — then appended and
 * every waiting pull woken. A pull returns what lies past the subscription's
 * cursor, or waits for it; only an acknowledgement moves the cursor, and only
 * forward, so an event is handed out until a subscriber says it handled it.
 * Pure of transport and storage: HTTP and the in-process subscribers call
 * this, and the ports below it are Postgres in the service and memory in specs.
 */
export class Bus {
  constructor(
    private readonly topics: Readonly<Record<string, TopicDeclaration>>,
    private readonly log: EventLog,
    private readonly subscriptions: SubscriptionStore,
    private readonly wakeup: Wakeup,
    private readonly now: () => Date,
  ) {}

  async publish(request: PublishEventRequest, as: TopicPublisher): Promise<EventEnvelope> {
    const declaration = this.declared(request.topic);
    if (declaration.publishedBy === 'service' && as !== 'service') {
      throw new TopicNotYours(request.topic, declaration.publishedBy);
    }
    const parsed = declaration.schema.safeParse(request.payload);
    if (!parsed.success) {
      throw new InvalidPayload(
        request.topic,
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    const event = await this.log.append(
      { topic: request.topic, source: request.source, payload: parsed.data },
      this.now(),
    );
    this.wakeup.notify();
    return event;
  }

  /** Creates the subscription at the head, or replaces its topics and keeps its cursor: asking twice is asking once. */
  async subscribe(name: string, request: SubscribeRequest): Promise<Subscription> {
    if (!SUBSCRIPTION_NAME.test(name) || name.length > SUBSCRIPTION_NAME_MAX_LENGTH) {
      throw new InvalidSubscriptionName(name);
    }
    const undeclared = request.topics.filter((topic) => this.topics[topic] === undefined);
    if (undeclared.length > 0) throw new UndeclaredTopic(undeclared);
    return this.subscriptions.upsert(
      name,
      [...new Set(request.topics)],
      await this.log.head(),
      this.now(),
    );
  }

  /**
   * The events past the subscription's cursor, oldest first; when there are
   * none, waits up to `waitMs` for one, and answers empty when none came, the
   * bus closed or the caller left.
   */
  async pull(
    name: string,
    options: { waitMs: number; max: number },
    signal?: AbortSignal,
  ): Promise<EventEnvelope[]> {
    const subscription = await this.subscriptions.find(name);
    if (subscription === null) throw new UnknownSubscription(name);
    await this.subscriptions.touch(name, this.now());
    const deadline = Date.now() + options.waitMs;
    for (;;) {
      // Armed before the read: an event appended between the read and the wait still wakes it.
      const waiter = this.wakeup.arm();
      const events = await this.log.after(
        BigInt(subscription.cursor),
        subscription.topics,
        options.max,
      );
      const left = deadline - Date.now();
      if (events.length > 0 || left <= 0) {
        waiter.cancel();
        return events;
      }
      if ((await waiter.wait(left, signal)) !== 'woken') return [];
    }
  }

  /** Moves the cursor to `seq` when that is past it; acknowledging an earlier event again changes nothing. */
  async ack(name: string, seq: string): Promise<Subscription> {
    const head = await this.log.head();
    if (BigInt(seq) > head) throw new SeqBeyondHead(seq, head.toString());
    const advanced = await this.subscriptions.advance(name, BigInt(seq));
    if (advanced === null) throw new UnknownSubscription(name);
    return advanced;
  }

  unsubscribe(name: string): Promise<boolean> {
    return this.subscriptions.remove(name);
  }

  /**
   * Removes the subscriptions idle past their age, then the events past their
   * retention that every remaining subscription has passed — always keeping
   * the newest, so the head a new subscription starts at never moves back.
   */
  async sweep(retention: Retention): Promise<{ subscriptions: number; events: number }> {
    const now = this.now().getTime();
    const subscriptions = await this.subscriptions.removeIdle(
      new Date(now - retention.idleSubscriptionMs),
    );
    const head = await this.log.head();
    const lowest = (await this.subscriptions.lowestCursor()) ?? head;
    const below = lowest < head ? lowest + 1n : head;
    const events = await this.log.prune(new Date(now - retention.retentionMs), below);
    return { subscriptions, events };
  }

  private declared(topic: string): TopicDeclaration {
    const declaration = this.topics[topic];
    if (declaration === undefined) throw new UndeclaredTopic([topic]);
    return declaration;
  }
}
