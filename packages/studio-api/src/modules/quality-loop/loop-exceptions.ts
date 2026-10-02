import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DerivationFailed,
  LoopRefused,
  LoopTimeout,
  LoopUnreachable,
} from '@sysdesign/loop-client';

/**
 * The shared client's errors as the studio's gateway statuses, in one place:
 * a grader nobody can reach is 503, one too slow is 504, one that answered
 * no is 502, and a derivation that yielded no rubric is 503 carrying the
 * availability so the client can say why. Anything else is the caller's own.
 * `LOOP_UNAVAILABLE_STATUSES` in the port is the other half of this table.
 */
export function toHttpException(error: unknown): Error {
  if (error instanceof LoopUnreachable) return new ServiceUnavailableException(error.message);
  if (error instanceof LoopTimeout) return new GatewayTimeoutException(error.message);
  if (error instanceof DerivationFailed) {
    return new ServiceUnavailableException({
      message: error.message,
      llm: error.llm,
      diagnostic: error.diagnostic,
    });
  }
  if (error instanceof LoopRefused) {
    return new BadGatewayException(
      error.route === null
        ? `the quality loop refused: ${error.status} ${error.message}`
        : `the quality loop refused ${error.route} (${error.status}): ${error.message}`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** The answer, or the mapped exception. */
export async function answer<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toHttpException(error);
  }
}
