import { NOTIFICATION_TOPICS, type EventEnvelope, type Subscription } from '@sysdesign/contracts';

import { Bus } from './bus';
import type { EventLog, NewEvent, SubscriptionStore } from './ports';
import { InProcessWakeup } from './wakeup';

/** The bus over in-memory stores and a real wakeup, for any layer's specs. */
export function inMemoryBus(now: () => Date) {
  const log = new InMemoryEventLog();
  const subscriptions = new InMemorySubscriptionStore();
  const wakeup = new InProcessWakeup();
  const bus = new Bus(NOTIFICATION_TOPICS, log, subscriptions, wakeup, now);
  return { bus, log, subscriptions, wakeup };
}

/** The bus's stores in memory: the bus core runs over them in specs exactly as over Postgres. */
class InMemoryEventLog implements EventLog {
  readonly events: EventEnvelope[] = [];
  private seq = 0n;

  async append(event: NewEvent, at: Date): Promise<EventEnvelope> {
    this.seq += 1n;
    const envelope = { ...event, seq: this.seq.toString(), publishedAt: at.toISOString() };
    this.events.push(envelope);
    return envelope;
  }

  async after(cursor: bigint, topics: readonly string[], max: number): Promise<EventEnvelope[]> {
    return this.events
      .filter((event) => BigInt(event.seq) > cursor && topics.includes(event.topic))
      .slice(0, max);
  }

  async head(): Promise<bigint> {
    const newest = this.events[this.events.length - 1];
    return newest === undefined ? 0n : BigInt(newest.seq);
  }

  async prune(before: Date, below: bigint): Promise<number> {
    const kept = this.events.filter(
      (event) => !(Date.parse(event.publishedAt) < before.getTime() && BigInt(event.seq) < below),
    );
    const pruned = this.events.length - kept.length;
    this.events.splice(0, this.events.length, ...kept);
    return pruned;
  }
}

interface StoredSubscription extends Subscription {
  pulledAt: Date;
}

class InMemorySubscriptionStore implements SubscriptionStore {
  readonly rows = new Map<string, StoredSubscription>();

  async upsert(
    name: string,
    topics: readonly string[],
    head: bigint,
    at: Date,
  ): Promise<Subscription> {
    const existing = this.rows.get(name);
    const row = {
      name,
      topics: [...topics],
      cursor: existing?.cursor ?? head.toString(),
      pulledAt: at,
    };
    this.rows.set(name, row);
    return subscriptionOf(row);
  }

  async find(name: string): Promise<Subscription | null> {
    const row = this.rows.get(name);
    return row === undefined ? null : subscriptionOf(row);
  }

  async touch(name: string, at: Date): Promise<void> {
    const row = this.rows.get(name);
    if (row !== undefined) row.pulledAt = at;
  }

  async advance(name: string, seq: bigint): Promise<Subscription | null> {
    const row = this.rows.get(name);
    if (row === undefined) return null;
    if (seq > BigInt(row.cursor)) row.cursor = seq.toString();
    return subscriptionOf(row);
  }

  async remove(name: string): Promise<boolean> {
    return this.rows.delete(name);
  }

  async removeIdle(before: Date): Promise<number> {
    let removed = 0;
    for (const [name, row] of this.rows) {
      if (row.pulledAt < before) {
        this.rows.delete(name);
        removed += 1;
      }
    }
    return removed;
  }

  async lowestCursor(): Promise<bigint | null> {
    const cursors = [...this.rows.values()].map((row) => BigInt(row.cursor));
    return cursors.length === 0
      ? null
      : cursors.reduce((low, cursor) => (cursor < low ? cursor : low));
  }
}

const subscriptionOf = (row: StoredSubscription): Subscription => ({
  name: row.name,
  topics: [...row.topics],
  cursor: row.cursor,
});
