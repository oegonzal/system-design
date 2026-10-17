import type { ApiValidationIssue, MemoryRefusal } from '@sysdesign/contracts';

/** A memory verb refused, by its declared code; the HTTP door gives every code one status. */
export class MemoryRefused extends Error {
  constructor(
    readonly code: MemoryRefusal,
    message: string,
    readonly issues: ApiValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'MemoryRefused';
  }
}

export function refuse(
  code: MemoryRefusal,
  message: string,
  issues: ApiValidationIssue[] = [],
): never {
  throw new MemoryRefused(code, message, issues);
}
