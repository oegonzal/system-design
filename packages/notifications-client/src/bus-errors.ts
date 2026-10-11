/**
 * What a bus client throws, and the whole of it: the HTTP adapter raises
 * these from a socket and a status, a fake raises the same ones by script.
 */

/** Nobody answered: the service is not there, or the socket died. */
export class BusUnreachable extends Error {
  override readonly name = 'BusUnreachable';
  constructor(detail = 'no answer') {
    super(`the notifications service is unreachable: ${detail}`);
  }
}

/** The service did not answer in time. */
export class BusTimeout extends Error {
  override readonly name = 'BusTimeout';
  constructor(
    readonly route: string,
    readonly timeoutMs: number,
  ) {
    super(`the notifications service did not answer ${route} within ${timeoutMs} ms`);
  }
}

/** The service answered, and refused. `message` is the service's own. */
export class BusRefused extends Error {
  override readonly name = 'BusRefused';
  constructor(
    readonly status: number,
    message: string,
    readonly route: string,
  ) {
    super(message);
  }
}

/** The caller stopped waiting: a call abandoned by its own signal. */
export class BusCallAborted extends Error {
  override readonly name = 'BusCallAborted';
  constructor(readonly route: string) {
    super(`${route} was abandoned by its caller`);
  }
}

/** A subscription the service no longer has: swept while its subscriber was away. */
export class SubscriptionMissing extends Error {
  override readonly name = 'SubscriptionMissing';
  constructor(readonly subscription: string) {
    super(`the notifications service has no subscription ${subscription}`);
  }
}

/** A prompt the service withdrew because its time ran out before anyone answered. */
export class PromptExpired extends Error {
  override readonly name = 'PromptExpired';
  constructor(readonly promptId: string) {
    super(`prompt ${promptId} expired with no answer`);
  }
}
