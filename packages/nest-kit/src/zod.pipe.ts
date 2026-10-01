import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ApiValidationIssue } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/**
 * Validates a request body or query against a zod schema — the apps are
 * zod-native, so DTOs are schemas. A failure is a 400 whose `issues` name
 * each offending path as the contract's `ApiValidationIssue`, the one shape
 * every client parses.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const issues: ApiValidationIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }));
      throw new BadRequestException({ message: 'validation failed', issues });
    }
    return parsed.data;
  }
}
