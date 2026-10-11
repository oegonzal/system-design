import type {
  EventEnvelope,
  PublishEventRequest,
  SubscribeRequest,
  Subscription,
} from '@sysdesign/contracts';

/**
 * The one port onto the notifications bus, for every program that publishes
 * to it or subscribes to it. Abstract class rather than an interface so it
 * doubles as a Nest injection token where a consumer uses Nest. Failures are
 * the errors in `bus-errors.ts`.
 */
export abstract class BusClient {
  abstract publish(request: PublishEventRequest): Promise<EventEnvelope>;
  /** Creates the subscription at the head, or replaces its topics and keeps its cursor. */
  abstract subscribe(name: string, request: SubscribeRequest): Promise<Subscription>;
  /** The events past the cursor, oldest first; waits up to `waitMs` when there are none. */
  abstract pull(
    name: string,
    options: { waitMs: number; max: number },
    signal?: AbortSignal,
  ): Promise<EventEnvelope[]>;
  abstract ack(name: string, seq: string): Promise<Subscription>;
  /** Removes it; one already gone is not a failure. */
  abstract unsubscribe(name: string): Promise<void>;
}
