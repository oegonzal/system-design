import type { ZodType } from 'zod';

/**
 * The project's event bus, as its clients see it. An event is a declared
 * topic, the payload that topic's schema accepts, who published it, and the
 * sequence number the bus gave it — the only identity an event has, and the
 * only order. A subscription is a named cursor over some topics: a subscriber
 * pulls what lies past its cursor and acknowledges what it has handled, so
 * delivery is at least once and a subscriber that restarts resumes where it
 * left off.
 */

/** A subscription's name: dotted lowercase words — `notifications.interactions`, `ask.<prompt id>`. */
export const SUBSCRIPTION_NAME = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
export const SUBSCRIPTION_NAME_MAX_LENGTH = 120;
export const TOPIC_MAX_LENGTH = 80;
export const SOURCE_MAX_LENGTH = 80;
/** The most topics one subscription follows. */
export const SUBSCRIPTION_TOPICS_MAX = 20;

/** Who may publish a topic: any client over HTTP, or only the bus's own service. */
export type TopicPublisher = 'anyone' | 'service';

/** A topic as the bus declares it: the payload it accepts, and who may publish it. */
export interface TopicDeclaration {
  schema: ZodType;
  publishedBy: TopicPublisher;
}

/** One event to publish: its topic, who publishes it, as the publisher names itself, and what it carries. */
export interface PublishEventRequest {
  topic: string;
  source: string;
  payload: unknown;
}

/** An event as the bus hands it out. `seq` is decimal text: the bus counts past what a JSON number holds exactly. */
export interface EventEnvelope<T = unknown> {
  seq: string;
  topic: string;
  source: string;
  payload: T;
  publishedAt: string;
}

export interface SubscribeRequest {
  topics: string[];
}

/** A subscription: the topics it follows, and its cursor — the seq of the last event it acknowledged. */
export interface Subscription {
  name: string;
  topics: string[];
  cursor: string;
}

export interface AckRequest {
  seq: string;
}
