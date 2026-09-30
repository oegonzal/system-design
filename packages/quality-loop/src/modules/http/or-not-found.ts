import { NotFoundException } from '@nestjs/common';

/** The value, or the 404 that says what was asked for. */
export function orNotFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new NotFoundException(message);
  return value;
}
