import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GoalBudgetExceeded } from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

/**
 * The shared client's errors as this service's gateway statuses, in one
 * place: a loop nobody can reach is 503, one too slow is 504, one that
 * answered no is 502, and a goal the engine's budget refuses is 422.
 * Anything else is the caller's own.
 */
export function toHttpException(error: unknown): Error {
  if (error instanceof LoopUnreachable) return new ServiceUnavailableException(error.message);
  if (error instanceof LoopTimeout) return new GatewayTimeoutException(error.message);
  if (error instanceof LoopRefused) {
    return new BadGatewayException(`the quality loop refused (${error.status}): ${error.message}`);
  }
  if (error instanceof GoalBudgetExceeded) return new UnprocessableEntityException(error.message);
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
