import type { EventEnvelope, Subscription } from '@sysdesign/contracts';

/** An event as the bus is about to append it; the log gives it its seq. */
export interface NewEvent {
  topic: string;
  source: string;
  payload: unknown;
}

/** The append-only log of events, in seq order. */
export interface EventLog {
  /** Appends one event, committed after every event with a lower seq. */
  append(event: NewEvent, at: Date): Promise<EventEnvelope>;
  /** The events past `cursor` on any of `topics`, oldest first, at most `max`. */
  after(cursor: bigint, topics: readonly string[], max: number): Promise<EventEnvelope[]>;
  /** The seq of the newest event; 0 when there is none. */
  head(): Promise<bigint>;
  /** Deletes the events published before `before` with a seq below `below`; how many. */
  prune(before: Date, below: bigint): Promise<number>;
}

/** The named cursors over the log. */
export interface SubscriptionStore {
  /** Creates the subscription with its cursor at `head`, or replaces an existing one's topics and keeps its cursor. */
  upsert(name: string, topics: readonly string[], head: bigint, at: Date): Promise<Subscription>;
  find(name: string): Promise<Subscription | null>;
  /** Marks it pulled at `at`, so the idle sweep spares it. */
  touch(name: string, at: Date): Promise<void>;
  /** Moves its cursor to `seq` when that is past it, never back; null when there is no such subscription. */
  advance(name: string, seq: bigint): Promise<Subscription | null>;
  remove(name: string): Promise<boolean>;
  /** Removes the subscriptions not pulled since `before`; how many. */
  removeIdle(before: Date): Promise<number>;
  /** The lowest cursor of all subscriptions; null when there are none. */
  lowestCursor(): Promise<bigint | null>;
}

/** How a wait ended: an event may have arrived, the time ran out, or the bus is shutting down. */
export type WaitOutcome = 'woken' | 'timeout' | 'closed';

/** One waiter, armed before the read it follows, so a publish between the read and the wait still wakes it. */
export interface Waiter {
  wait(ms: number, signal?: AbortSignal): Promise<WaitOutcome>;
  cancel(): void;
}

/** What wakes the pulls waiting for events. */
export interface Wakeup {
  arm(): Waiter;
  /** An event was appended: every armed waiter is woken. */
  notify(): void;
  /** The bus is shutting down: every waiter is released, and every one armed later at once. */
  close(): void;
}
