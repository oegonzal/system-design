import type { TopicPublisher } from '@sysdesign/contracts';

/**
 * Why the bus refused a request, as facts its callers map to their own
 * answers — an HTTP status at the edge, a log line in-process. The bus itself
 * knows no transport.
 */
export class UndeclaredTopic extends Error {
  override readonly name = 'UndeclaredTopic';
  constructor(readonly topics: readonly string[]) {
    super(`no such topic: ${topics.join(', ')}`);
  }
}

export class InvalidPayload extends Error {
  override readonly name = 'InvalidPayload';
  constructor(
    readonly topic: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    super(`not a ${topic} payload`);
  }
}

export class TopicNotYours extends Error {
  override readonly name = 'TopicNotYours';
  constructor(
    readonly topic: string,
    readonly publishedBy: TopicPublisher,
  ) {
    super(`${topic} is published by the ${publishedBy} only`);
  }
}

export class InvalidSubscriptionName extends Error {
  override readonly name = 'InvalidSubscriptionName';
  constructor(readonly subscription: string) {
    super(`${JSON.stringify(subscription)} is not a subscription name`);
  }
}

export class UnknownSubscription extends Error {
  override readonly name = 'UnknownSubscription';
  constructor(readonly subscription: string) {
    super(`no such subscription: ${subscription}`);
  }
}

export class SeqBeyondHead extends Error {
  override readonly name = 'SeqBeyondHead';
  constructor(
    readonly seq: string,
    readonly head: string,
  ) {
    super(`seq ${seq} is past the newest event, ${head}`);
  }
}
