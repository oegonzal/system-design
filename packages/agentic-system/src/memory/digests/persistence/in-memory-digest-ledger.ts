import type { AppliedDigest, DigestLedger } from '../ledger';

/**
 * Applied digests in memory, the ledger the service specs run on, holding the
 * contract the Postgres ledger states (`digest-ledger-contract.ts` runs against
 * both). It keeps copies in and out, so a caller can never change a recorded
 * apply — as a row read back from Postgres cannot be.
 */
export class InMemoryDigestLedger implements DigestLedger {
  private readonly rows = new Map<string, AppliedDigest>();

  find(orchestrationRunId: string): Promise<AppliedDigest | null> {
    const row = this.rows.get(orchestrationRunId);
    return Promise.resolve(row === undefined ? null : structuredClone(row));
  }

  record(applied: AppliedDigest): Promise<'recorded' | 'exists'> {
    if (this.rows.has(applied.orchestrationRunId)) return Promise.resolve('exists');
    this.rows.set(applied.orchestrationRunId, structuredClone(applied));
    return Promise.resolve('recorded');
  }
}
