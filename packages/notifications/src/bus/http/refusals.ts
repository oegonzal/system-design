import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

import {
  InvalidPayload,
  InvalidSubscriptionName,
  SeqBeyondHead,
  TopicNotYours,
  UndeclaredTopic,
  UnknownSubscription,
} from '../errors';

/** The bus's refusals as HTTP answers; anything else is not a refusal and goes on as the error it is. */
function asHttp(error: unknown): HttpException | unknown {
  if (error instanceof InvalidPayload) {
    return new BadRequestException({ message: error.message, issues: error.issues });
  }
  if (
    error instanceof UndeclaredTopic ||
    error instanceof InvalidSubscriptionName ||
    error instanceof SeqBeyondHead
  ) {
    return new BadRequestException({ message: error.message });
  }
  if (error instanceof TopicNotYours) return new ForbiddenException({ message: error.message });
  if (error instanceof UnknownSubscription) {
    return new NotFoundException({ message: error.message, missing: 'subscription' });
  }
  return error;
}

/** A bus call with its refusals answered as HTTP. */
export async function answered<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw asHttp(error);
  }
}
