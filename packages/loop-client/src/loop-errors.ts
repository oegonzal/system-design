import type { Diagnostic, LlmModelDto } from '@sysdesign/contracts';

/**
 * What a loop client throws, and the whole of it. Transport-agnostic on
 * purpose: the HTTP adapter raises these from a socket and a status, the fake
 * loop raises the same ones by script, and a consumer that serves HTTP of its
 * own maps them onto its gateway errors in one place. A run or document the
 * loop does not have is `null` from a read, never one of these.
 */

/** Nobody answered: the socket is dead, or the service is not there. */
export class LoopUnreachable extends Error {
  constructor(detail = 'no answer') {
    super(`the quality loop is unreachable: ${detail}`);
    this.name = 'LoopUnreachable';
  }
}

/** The loop did not answer in time. */
export class LoopTimeout extends Error {
  constructor(
    readonly route: string,
    readonly timeoutMs: number,
  ) {
    super(`the quality loop did not answer ${route} within ${timeoutMs} ms`);
    this.name = 'LoopTimeout';
  }
}

/** The loop answered, and refused. `message` is the loop's own; `route` names what was asked. */
export class LoopRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly route: string | null = null,
  ) {
    super(message);
    this.name = 'LoopRefused';
  }

  get body(): { statusCode: number; message: string } {
    return { statusCode: this.status, message: this.message };
  }
}

/** A derivation yielded no rubric — the loop's 503, never an empty list. */
export class DerivationFailed extends Error {
  constructor(
    message: string,
    readonly llm: LlmModelDto | null,
    readonly diagnostic: Diagnostic | null,
  ) {
    super(message);
    this.name = 'DerivationFailed';
  }
}

/** A run that was being awaited is gone: the loop answers 404 for it now. */
export class LoopRunLost extends Error {
  constructor(readonly runId: string) {
    super(`the quality loop no longer has run ${runId}`);
    this.name = 'LoopRunLost';
  }
}

/**
 * A run still says `running` but its heartbeat is older than the loop's own
 * stale window — the process running it died or stalled. Read before the
 * janitor sweeps it, so a caller is not told "running" for the whole window.
 */
export class LoopRunStale extends Error {
  constructor(
    readonly runId: string,
    readonly heartbeatAt: string,
    readonly staleAfterMs: number,
  ) {
    super(`run ${runId} last beat at ${heartbeatAt}, past the loop's ${staleAfterMs} ms window`);
    this.name = 'LoopRunStale';
  }
}
