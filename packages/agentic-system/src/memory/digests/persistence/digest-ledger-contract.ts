/**
 * The ledger contract every `DigestLedger` holds — the in-memory ledger and
 * the Postgres one run the same cases, so a spec on the fake proves what the
 * database does. A ledger is handed its space by `setup`: Postgres needs a
 * real space row for its foreign key.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { AppliedDigest, DigestLedger } from '../ledger';

const ORCHESTRATION = '00000000-0000-4000-8000-0000000000d1';

export function digestLedgerContract(
  label: string,
  setup: () => Promise<{ ledger: DigestLedger; spaceId: string }>,
): void {
  describe(`the digest ledger contract (${label})`, () => {
    let ledger: DigestLedger;
    let spaceId: string;
    /** An apply of two endorsed memories: one written, one the runtime refused. */
    const applied = (overrides: Partial<AppliedDigest> = {}): AppliedDigest => ({
      orchestrationRunId: ORCHESTRATION,
      spaceId,
      digestRunId: 'digest-run-1',
      items: [
        {
          ref: 'memory.1',
          outcome: 'inserted',
          recordId: '00000000-0000-4000-8000-0000000000a1',
          refusal: null,
        },
        {
          ref: 'memory.3',
          outcome: null,
          recordId: null,
          refusal: {
            code: 'candidate.invalid',
            message: 'the candidate is not a semantic memory',
            issues: [{ path: 'value', message: 'Required' }],
          },
        },
      ],
      appliedAt: new Date('2026-10-18T09:00:00.000Z'),
      ...overrides,
    });

    beforeEach(async () => {
      ({ ledger, spaceId } = await setup());
    });

    it('[AGS-11] records an apply with every item’s outcome, and finds it back as recorded', async () => {
      expect(await ledger.record(applied())).toBe('recorded');
      expect(await ledger.find(ORCHESTRATION)).toEqual(applied());
      expect(await ledger.find('00000000-0000-4000-8000-0000000000d2')).toBeNull();
    });

    it('[AGS-11] applies a digest once: a second apply answers exists, and the first stands', async () => {
      expect(await ledger.record(applied())).toBe('recorded');
      const again = applied({ items: [], appliedAt: new Date('2026-10-18T09:05:00.000Z') });
      expect(await ledger.record(again)).toBe('exists');
      expect(await ledger.find(ORCHESTRATION)).toEqual(applied());
    });

    it('[AGS-11] keeps a copy: what a caller does to what it recorded or read cannot change the apply', async () => {
      const recorded = applied();
      await ledger.record(recorded);
      recorded.items.pop();
      const read = await ledger.find(ORCHESTRATION);
      read?.items.push(...applied().items);
      expect(await ledger.find(ORCHESTRATION)).toEqual(applied());
    });
  });
}
