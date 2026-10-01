import { describe, expect, it, vi } from 'vitest';

import type { OrchestrationRunRepository } from '../orchestration/ports';
import { RunJanitor } from './run-janitor';

import type { RunRepository } from '../../core/ports';

/** Only `failStale` is swept; the rest of each port is never reached. */
const ledger = (failStale: (before: Date) => Promise<number>) =>
  ({ failStale }) as unknown as RunRepository & OrchestrationRunRepository;

const janitor = (runs: RunRepository, orchestrations: OrchestrationRunRepository): RunJanitor =>
  new RunJanitor({ staleAfterMs: 1_000, intervalMs: null }, runs, orchestrations);

describe('RunJanitor', () => {
  it('[QL-13] sweeps both ledgers with one threshold and reports what each failed', async () => {
    const seen: Date[] = [];
    const count = (n: number) => async (before: Date) => {
      seen.push(before);
      return n;
    };
    const swept = await janitor(ledger(count(2)), ledger(count(3))).sweep();

    expect(swept).toEqual({ runs: 2, orchestrations: 3 });
    // One threshold, computed once, so the two ledgers cannot disagree on what stale means.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]);
  });

  it('[QL-13] one ledger failing neither skips the other nor hides what it swept', async () => {
    const orchestrations = vi.fn(async () => 4);
    const swept = await janitor(
      ledger(() => Promise.reject(new Error('runs table is gone'))),
      ledger(orchestrations),
    ).sweep();

    // The orchestration sweep ran, and its real count is reported rather than a
    // zero that would send the next sweep after rows already failed.
    expect(orchestrations).toHaveBeenCalledTimes(1);
    expect(swept).toEqual({ runs: 0, orchestrations: 4 });
  });

  it('[QL-13] a sweep never throws, whichever ledger is unreachable', async () => {
    const boom = () => Promise.reject(new Error('down'));

    await expect(janitor(ledger(boom), ledger(boom)).sweep()).resolves.toEqual({
      runs: 0,
      orchestrations: 0,
    });
  });
});
