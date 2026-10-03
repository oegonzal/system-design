import { BadRequestException, type PipeTransform } from '@nestjs/common';
import {
  modelSchema,
  parseLenient,
  type ApiValidationIssue,
  type BoundPath,
  type DeclaredBound,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

export interface ZodValidationOptions {
  /**
   * Parse through the contracts' salvage ladder instead of refusing at the
   * first fault: text past a declared bound's ceiling is kept whole, a list
   * past its ceiling is trimmed by whole items, an unknown key is stripped,
   * and only a structural fault — a wrong type, a missing field, an unknown
   * id or enum value — is a 400. For a body that is kept as written and
   * read back by the same client, never for one that is judged.
   */
  lenient?: boolean;
}

/** The contract's dotted path (`tags.1`) of a fault, from the keys that lead to it. */
const dotted = (at: readonly PropertyKey[]): string => at.map(String).join('.');

/**
 * Validates a request body or query against a zod schema — the apps are
 * zod-native, so DTOs are schemas. A failure is a 400 whose `issues` name
 * each offending path as the contract's `ApiValidationIssue`, the one shape
 * every client parses. Strict unless told otherwise: a declared bound's
 * ceiling refuses, as the schema says.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  /** A lenient pipe's declared bounds, indexed once when the route is declared rather than per request. */
  private readonly bounds: Readonly<Record<BoundPath, DeclaredBound>> | null;

  constructor(
    private readonly schema: ZodType<T>,
    options: ZodValidationOptions = {},
  ) {
    this.bounds = options.lenient ? modelSchema(schema).bounds : null;
  }

  transform(value: unknown): T {
    if (this.bounds !== null) {
      const parsed = parseLenient(this.schema, value, this.bounds);
      if (parsed.ok) return parsed.value;
      // Only the faults that refused: a soft one was noted on the way and never does.
      return refuse(
        parsed.issues
          .filter((issue) => !issue.soft)
          .map((issue) => ({ path: dotted(issue.at), message: issue.message })),
      );
    }
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      return refuse(
        parsed.error.issues.map((issue) => ({ path: dotted(issue.path), message: issue.message })),
      );
    }
    return parsed.data;
  }
}

function refuse(issues: ApiValidationIssue[]): never {
  throw new BadRequestException({ message: 'validation failed', issues });
}
