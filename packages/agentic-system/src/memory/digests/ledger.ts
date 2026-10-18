import type { DigestItemDto } from '@sysdesign/contracts';

/**
 * A digest as it was remembered into its space: the orchestration it was read
 * from, the run its memories came from, what each endorsed memory's write did
 * in the order written, and when — recorded once, after the writes.
 */
export interface AppliedDigest {
  orchestrationRunId: string;
  spaceId: string;
  digestRunId: string | null;
  items: DigestItemDto[];
  appliedAt: Date;
}

/** Where each applied digest is recorded, so that it is applied once: Postgres, in production. */
export const DIGEST_LEDGER = Symbol('DIGEST_LEDGER');
export interface DigestLedger {
  /** The apply recorded for a digest; null while it has not been applied. */
  find(orchestrationRunId: string): Promise<AppliedDigest | null>;
  /** Record an apply; `exists` when one is already recorded for the digest, which stays as it was. */
  record(applied: AppliedDigest): Promise<'recorded' | 'exists'>;
}
