import type { LlmExchangeSummaryDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { invocationsOf, invocationTotals } from './exchange-invocations';

const row = (over: Partial<LlmExchangeSummaryDto>): LlmExchangeSummaryDto => ({
  scope: 'producer',
  ordinal: 1,
  outcome: 'ok',
  durationMs: 1000,
  startedAt: '2026-09-06T00:00:00.000Z',
  ...over,
});

describe('grouping attempts into calls', () => {
  it('[QLU-9] three attempts of one call are one call, and the last one is its outcome', () => {
    const invocations = invocationsOf([
      row({ ordinal: 1, attempt: 1, outcome: 'schema-miss', errorName: 'schema-miss' }),
      row({ ordinal: 2, attempt: 2, outcome: 'error', errorName: 'overloaded' }),
      row({ ordinal: 3, attempt: 3, outcome: 'ok' }),
    ]);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({
      scope: 'producer',
      outcome: 'ok',
      retried: true,
      totalMs: 3000,
      failures: ['schema-miss', 'overloaded'],
    });
  });

  it('[QLU-9] two calls to one stage stay two calls, because each begins at attempt 1', () => {
    const invocations = invocationsOf([
      row({ scope: 'critic.a.s1', ordinal: 1, attempt: 1, outcome: 'error', errorName: 'timeout' }),
      row({ scope: 'critic.a.s1', ordinal: 2, attempt: 2 }),
      row({ scope: 'critic.a.s1', ordinal: 3, attempt: 1 }),
    ]);
    expect(invocations.map((call) => call.attempts.length)).toEqual([2, 1]);
    expect(invocations.map((call) => call.retried)).toEqual([true, false]);
  });

  it('[QLU-9] a row from before retries existed is one attempt, which is what it was', () => {
    const invocations = invocationsOf([
      row({ scope: 'criteria', ordinal: 1 }),
      row({ scope: 'producer', ordinal: 2 }),
    ]);
    expect(invocations.map((call) => call.scope)).toEqual(['criteria', 'producer']);
    expect(invocations.every((call) => !call.retried)).toBe(true);
  });

  it('[QLU-9] calls are read in ordinal order whatever order the rows arrive in', () => {
    const invocations = invocationsOf([
      row({ scope: 'b', ordinal: 3, attempt: 1 }),
      row({ scope: 'a', ordinal: 1, attempt: 1 }),
      row({ scope: 'a', ordinal: 2, attempt: 2 }),
    ]);
    expect(invocations.map((call) => call.scope)).toEqual(['a', 'b']);
  });

  it('[QLU-9] the totals count calls, not attempts, and say how many still failed', () => {
    const totals = invocationTotals(
      invocationsOf([
        row({ scope: 'a', ordinal: 1, attempt: 1, outcome: 'error', errorName: 'auth' }),
        row({ scope: 'b', ordinal: 2, attempt: 1, outcome: 'schema-miss' }),
        row({ scope: 'b', ordinal: 3, attempt: 2, outcome: 'ok' }),
      ]),
    );
    expect(totals).toEqual({ calls: 2, attempts: 3, retried: 1, failed: 1, totalMs: 3000 });
  });

  it('[QLU-9] no call is empty, and no exchanges means no calls', () => {
    expect(invocationsOf([])).toEqual([]);
    expect(invocationTotals([])).toEqual({
      calls: 0,
      attempts: 0,
      retried: 0,
      failed: 0,
      totalMs: 0,
    });
  });
});
