import { describe, expect, it } from 'vitest';

import { makeRevisionSummary } from '../../testing/fixtures';
import { earlierRunBest } from './coach-history';

const coached = (revisionNumber: number, runId: string, overall: number | null) =>
  makeRevisionSummary({
    id: `rev-${revisionNumber}`,
    revisionNumber,
    origin: 'assistant',
    evaluation: { runId, iteration: 2, status: 'complete', overall, decision: 'revise' },
  });

describe('earlierRunBest', () => {
  it('[UX-11] offers the best revision of the newest earlier coaching run — never one of the run on screen, never the author’s', () => {
    const revisions = [
      coached(6, 'run-c', 90),
      coached(5, 'run-b', 71),
      coached(4, 'run-b', 78),
      coached(3, 'run-b', 78),
      coached(2, 'run-a', 95),
      makeRevisionSummary({ id: 'rev-1', revisionNumber: 1 }),
    ];

    // run-b is the newest earlier run; rev-3 and rev-4 tie, and the earlier one stands.
    expect(earlierRunBest(revisions, 'run-c')?.id).toBe('rev-3');
  });

  it('has nothing to offer when no earlier run imported a revision', () => {
    expect(earlierRunBest([makeRevisionSummary()], 'run-2')).toBeNull();
    expect(earlierRunBest([coached(2, 'run-2', 80)], 'run-2')).toBeNull();
  });
});
